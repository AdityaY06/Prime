/**
 * dev-watchdog — self-healing guard for the PRIME dev server (R36; re-landed R37
 * after the platform rollback wiped it).
 *
 * WHY THIS EXISTS (verified evidence, R36):
 *   dmesg: "Out of memory: Killed process 3757 (next-server … anon-rss:1800424kB)"
 *   The sandbox has 4GB RAM / 2 CPUs / NO swap. Chrome preview processes spike
 *   multi-GB; Turbopack's dev-server heap grows with every Fast Refresh cycle
 *   until the kernel OOM-killer executes next-server with NO error in dev.log.
 *   From the user's seat that is EXACTLY "many things are not working" and
 *   "onboarding errors at the end and won't proceed": the PWA/service-worker
 *   shell still renders from cache, but every API call fails.
 *
 * WHAT IT DOES:
 *   1. PROBE  — GET http://127.0.0.1:3000/ every 20s (a real serve check,
 *      not just a bound port). Two consecutive failures ⇒ restart.
 *   2. MEMORY — watch next-server RSS; above RSS_KILL_ZONE_MB proactively
 *      restart BEFORE the kernel fires (an OOM kill can also take out chrome
 *      or bun — far worse collateral than a 30s dev restart).
 *   3. SINGLETON — pidfile guard; a second instance exits immediately
 *      (the standing "no duplicate dev servers" rule).
 *
 * THREE self-inflicted bugs found by R36's live kill-tests, all baked into
 * this re-land (do not regress):
 *   a) SELF-KILL: the watchdog is started via `bun run dev`, so a blind
 *      `pkill -f "bun run dev"` in killStragglers kills the WATCHDOG's own
 *      wrapper mid-restart — the "bun run dev" pattern must be cwd-scoped to
 *      PROJECT_DIR and skip anything whose cmdline mentions dev-watchdog.
 *   b) HOT-RELOAD SELF-LOCKOUT: `bun --hot` re-evaluates this module in the
 *      SAME process; acquireLockOrExit must treat a pidfile matching OUR OWN
 *      pid as our own pre-reload lock (else it exits "another instance").
 *   c) DOUBLE LOGGING: stdout is already redirected to watchdog.log by the
 *      launcher — log() must write to the file ONLY (no console.log).
 *
 * Restart procedure replicates the documented ops commands exactly
 * (pkill all three patterns — the R34 lesson: plain `pkill bun run dev`
 * leaves instances alive — then setsid/nohup relaunch appending to dev.log
 * with the 1536MB V8 heap cap).
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs"

const PROJECT_DIR = "/home/z/my-project"
const DEV_LOG = `${PROJECT_DIR}/dev.log`
const PID_FILE = "/home/z/my-project/mini-services/dev-watchdog/watchdog.pid"
const LOG_FILE = "/home/z/my-project/mini-services/dev-watchdog/watchdog.log"
const PROBE_URL = "http://127.0.0.1:3000/"
const PROBE_INTERVAL_MS = 20_000
const FAIL_THRESHOLD = 2
const BOOT_SETTLE_MS = 45_000
/** Proactive restart when next-server RSS crosses this (kernel kills ~ box-wide OOM beyond). */
const RSS_KILL_ZONE_MB = 2_750

function log(msg: string): void {
  // File only — stdout is ALSO redirected to watchdog.log by the launcher
  // (`bun run dev >> watchdog.log 2>&1`), so console.log here would double-write.
  const line = `[${new Date().toISOString()}] ${msg}`
  try {
    appendFileSync(LOG_FILE, line + "\n")
  } catch {
    // log dir unwritable — fall back to stdout
    console.log(line)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Singleton guard — exits if another watchdog owns the pidfile. */
function acquireLockOrExit(): void {
  try {
    if (existsSync(PID_FILE)) {
      const old = Number.parseInt(readFileSync(PID_FILE, "utf8").trim(), 10)
      if (Number.isFinite(old)) {
        // bun --hot reload: the module re-evaluates in the SAME process, so a
        // pidfile matching OUR OWN pid is our own pre-reload lock — keep it.
        // (R36 live evidence: without this check the reloaded module saw its
        // own pid, concluded "another instance", and exited — guard went down.)
        if (old === process.pid) return
        process.kill(old, 0) // throws if dead
        console.log(`[dev-watchdog] another instance (pid ${old}) is alive — exiting`)
        process.exit(0)
      }
    }
  } catch {
    // stale/dead pidfile — fall through and take over
  }
  writeFileSync(PID_FILE, String(process.pid))
}

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(PROBE_URL, {
      method: "GET",
      headers: { "User-Agent": "dev-watchdog/1.0" },
      signal: AbortSignal.timeout(8_000),
      redirect: "manual",
    })
    return res.status >= 200 && res.status < 400
  } catch {
    return false
  }
}

/** RSS (MB) of the next-server process, or null when not running. */
function nextServerRssMb(): number | null {
  try {
    const out = Bun.spawnSync(["pgrep", "-f", "next-server"]).stdout.toString().trim()
    if (!out) return null
    const pid = out.split("\n")[0]!.trim()
    const status = readFileSync(`/proc/${pid}/status`, "utf8")
    const m = /VmRSS:\s+(\d+) kB/.exec(status)
    return m ? Number(m[1]) / 1024 : null
  } catch {
    return null
  }
}

function killStragglers(): void {
  // R34 lesson: all three patterns — plain `pkill bun run dev` can leave an
  // instance alive. R36 live-test lesson: the watchdog itself is started via
  // `bun run dev`, so a blind `pkill -f "bun run dev"` kills the WATCHDOG's
  // own wrapper (verified: it terminated itself mid-restart). "next dev" and
  // "next-server" are unambiguous (the watchdog cmdline is `bun --hot index.ts`),
  // but the "bun run dev" pattern must be cwd-scoped to PROJECT_DIR only.
  for (const pat of ["next dev", "next-server"]) {
    try {
      Bun.spawnSync(["pkill", "-f", pat])
    } catch {
      // best effort
    }
  }
  try {
    const out = Bun.spawnSync(["pgrep", "-f", "bun run dev"]).stdout.toString().trim()
    for (const pidStr of out.split("\n")) {
      const pid = Number.parseInt(pidStr.trim(), 10)
      if (!Number.isFinite(pid) || pid === process.pid || pid === process.ppid) continue
      try {
        // self-identification: never touch anything whose cmdline mentions this
        // watchdog's own path, and only kill wrappers rooted in PROJECT_DIR.
        const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8")
        if (cmdline.includes("dev-watchdog")) continue
        const cwdLink = Bun.spawnSync(["readlink", "/proc/" + pid + "/cwd"]).stdout.toString().trim()
        if (cwdLink === PROJECT_DIR || cwdLink === PROJECT_DIR + "/") {
          process.kill(pid, "SIGTERM")
          log(`killed stale dev wrapper pid ${pid} (cwd ${cwdLink})`)
        }
      } catch {
        // process vanished or /proc unreadable — skip
      }
    }
  } catch {
    // pgrep failed — nothing to scope
  }
}

function restartDevServer(reason: string): void {
  log(`RESTART (${reason}) — killing stragglers and relaunching`)
  killStragglers()
  try {
    Bun.spawnSync([
      "bash",
      "-c",
      `cd ${PROJECT_DIR} && (setsid nohup env NODE_OPTIONS='--max-old-space-size=1536' bun run dev >> ${DEV_LOG} 2>&1 &)`,
    ])
    log("RESTART — relaunch command issued")
  } catch (e) {
    log(`RESTART FAILED: ${(e as Error).message}`)
  }
}

async function main(): Promise<void> {
  acquireLockOrExit()
  log(`dev-watchdog up (pid ${process.pid}) — probing ${PROBE_URL} every ${PROBE_INTERVAL_MS / 1000}s`)
  let failures = 0
  let settlingUntil = 0

  for (;;) {
    const rss = nextServerRssMb()

    // ── proactive memory guard ──────────────────────────────────────────────
    if (rss !== null && rss >= RSS_KILL_ZONE_MB) {
      restartDevServer(`next-server RSS ${Math.round(rss)}MB ≥ ${RSS_KILL_ZONE_MB}MB kill zone`)
      failures = 0
      settlingUntil = Date.now() + BOOT_SETTLE_MS
      await sleep(BOOT_SETTLE_MS)
      continue
    }

    // ── liveness probe (skipped while a fresh boot settles) ────────────────
    if (Date.now() < settlingUntil) {
      await sleep(PROBE_INTERVAL_MS)
      continue
    }

    const ok = await probe()
    if (ok) {
      if (failures > 0) log("probe recovered — server answering")
      failures = 0
    } else {
      failures++
      log(`probe failed (${failures}/${FAIL_THRESHOLD}) rss=${rss === null ? "n/a" : Math.round(rss) + "MB"}`)
      if (failures >= FAIL_THRESHOLD) {
        restartDevServer(`probe failed ${FAIL_THRESHOLD}× consecutively`)
        failures = 0
        settlingUntil = Date.now() + BOOT_SETTLE_MS
        await sleep(BOOT_SETTLE_MS)
        continue
      }
    }
    await sleep(PROBE_INTERVAL_MS)
  }
}

void main()
