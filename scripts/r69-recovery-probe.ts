/**
 * R69 RECOVERY + TZ PROBE — runtime assertions over the R69-b fix round
 * (audit 2-a B4 recovery split-brain, B3-class hunter-tz residuals, and the
 * advisor protein-card harmonization handed off by 3-a).
 *
 * R70-b EVOLUTION (52 → 67 assertions): recovery.ts's own dayKey was the last
 * server-local day attribution in the recovery model — R69's honest residual
 * #1. §1's body-route mirror assertion now pins the hunter-tz truth
 * (dayKeyIn(hunter.timezone, ·)), and a NEW §6 proves the alignment
 * behaviorally (23:30Z session → Kolkata next-day vs UTC same-day; null /
 * invalid tz → server-local fallback per dayKeyIn's contract; triple-zone
 * setsSince day-summation; recoveryView threading) and statically (recovery.ts
 * + both BODY-tab surfaces + the TRAIN deload banner's dayKeyIn derivation).
 *
 * Pure-module imports only (lib/recovery, lib/game, lib/load — no Prisma, no
 * next/server); route logic is verified both behaviorally (mirroring the exact
 * new expressions) and statically (source text of the route files — proves the
 * shipped code, not a parallel copy, is what runs). r68-health-probe style.
 *
 * Run: bun scripts/r69-recovery-probe.ts
 */
export {} // module marker — top-level await requires it under tsc

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { LoadSession } from "@/lib/load"
import type { RecoverySessionInput } from "@/lib/recovery"

/** Repo root — the documented invocation is `bun scripts/r69-recovery-probe.ts`
 *  from the project root, so process.cwd() is the repo root. */
const ROOT = process.cwd()

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail++
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

// ── Shared imports ────────────────────────────────────────────────────────────
const { freshness, freshnessVerdict, volumeFactor } = await import("@/lib/recovery")
const { dayKeyIn, keyBefore, weekStartKeyIn } = await import("@/lib/game")
const { buildLoadView, sessionLoad, dailyStrain } = await import("@/lib/load")

/** Behavioral mirror of the NEW /api/body recovery expression (route:
 *  null-history → "untrained", else mapFreshness(freshnessVerdict(freshness(
 *  hoursSince, setsSince)))). */
function scannerRecovery(hoursSince: number | null, setsSince: number): string {
  if (hoursSince === null) return "untrained"
  const v = freshnessVerdict(freshness(hoursSince, setsSince))
  if (v === "FRESH") return "ready"
  if (v === "RECOVERING") return "recovering"
  return "fatigued"
}

/** The OLD flat cutoffs, verbatim from the pre-R69 recoveryFor (for the
 *  divergence proof): <36h fatigued · <72h recovering · ≥72h ready. */
function oldRecoveryFor(hoursAgo: number | null): string {
  if (hoursAgo === null) return "untrained"
  if (hoursAgo < 36) return "fatigued"
  if (hoursAgo < 72) return "recovering"
  return "ready"
}

// ── 1 · Freshness-driven scanner mapping ladder ───────────────────────────────
console.log("[r69] ── 1 · scanner recovery = freshness curve (audit 2-a B4) ────")
{
  const bodyRoute = readFileSync(resolve(ROOT, "src/app/api/body/route.ts"), "utf8")

  ok("null history → \"untrained\" (route's null branch)", scannerRecovery(null, 0) === "untrained")
  ok(
    "8h ago / 12 sets → \"fatigued\" (score 13.5 — FATIGUED <40)",
    scannerRecovery(8, 12) === "fatigued",
    `score=${freshness(8, 12).toFixed(1)}`
  )
  ok(
    "50h ago / 3 sets → \"ready\" (curve fully fresh at 50h with light volume)",
    scannerRecovery(50, 3) === "ready",
    `score=${freshness(50, 3).toFixed(1)}`
  )
  ok(
    "DIVERGENCE 1 — old flat rule said \"recovering\" at 50h (50 < 72); the curve says \"ready\"",
    oldRecoveryFor(50) === "recovering" && scannerRecovery(50, 3) === "ready",
    "the curve recovers FASTER than the flat cutoff"
  )
  ok(
    "DIVERGENCE 2 — old flat rule said \"fatigued\" at 30h (30 < 36); the curve says \"recovering\"",
    oldRecoveryFor(30) === "fatigued" && scannerRecovery(30, 0) === "recovering",
    `score=${freshness(30, 0).toFixed(1)} — the flat rule was too harsh mid-window`
  )
  ok(
    "DIVERGENCE 3 — old flat rule said \"ready\" at 80h; 26 sets that day (×2 slowdown) keep the curve at \"recovering\"",
    oldRecoveryFor(80) === "ready" && scannerRecovery(80, 26) === "recovering",
    `score=${freshness(80, 26).toFixed(1)} — volume awareness the flat cutoffs never had`
  )
  ok(
    "40h / 2 sets — the brief's example: curve honestly says \"recovering\" (same as the old rule here)",
    scannerRecovery(40, 2) === "recovering" && oldRecoveryFor(40) === "recovering",
    `score=${freshness(40, 2).toFixed(1)} — agreement case, asserted honestly`
  )
  ok("100h → \"ready\" (agreement with the old ≥72 rule)", scannerRecovery(100, 6) === "ready")

  // Full grid: count every old-vs-curve disagreement
  const hoursGrid = [2, 8, 16, 20, 24, 30, 36, 40, 48, 50, 60, 72, 80, 100, 120]
  const setsGrid = [0, 3, 6, 10, 12, 20, 26]
  let divergences = 0
  const examples: string[] = []
  for (const h of hoursGrid) {
    for (const s of setsGrid) {
      const nu = scannerRecovery(h, s)
      const old = oldRecoveryFor(h)
      if (nu !== old) {
        divergences++
        if (examples.length < 4) examples.push(`${h}h/${s}sets: curve=${nu} old=${old}`)
      }
    }
  }
  ok(
    `old flat cutoffs disagree with the curve on ≥3 of ${hoursGrid.length * setsGrid.length} grid points`,
    divergences >= 3,
    `${divergences} disagreements — e.g. ${examples.join(" · ")}`
  )

  // Static: the shipped route runs the curve (not a parallel copy)
  ok(
    "body route imports freshness + freshnessVerdict from @/lib/recovery",
    /import\s*\{[^}]*freshness[^}]*freshnessVerdict[^}]*\}\s*from\s*"@\/lib\/recovery"/.test(bodyRoute)
  )
  ok(
    "body route wires st.recovery = mapFreshness(freshnessVerdict(freshness(hoursSince, setsSince)))",
    /st\.recovery = mapFreshness\(freshnessVerdict\(freshness\(hoursSince,\s*setsSince\)\)\)/.test(bodyRoute)
  )
  ok("flat recoveryFor cutoffs gone (no `hoursAgo < 36` anywhere)", !bodyRoute.includes("hoursAgo < 36"))
  ok(
    "recovery inputs mirror lastTrainedByMuscle — R70: hunter-tz day attribution (cleared-only lastClearedStart + dayKeyIn session-start daySets)",
    /lastClearedStart/.test(bodyRoute) &&
      /daySets\.get\(dayKeyIn\(hunter\.timezone, new Date\(at\)\)\)/.test(bodyRoute) &&
      /session\.status === "cleared" \? dayKeyIn\(hunter\.timezone, session\.startedAt\)/.test(bodyRoute)
  )
  ok(
    "weekly-sets window is hunter-tz (weekStartKeyIn + tzDayWindow; weekStartUTC gone)",
    /weekStartKeyIn\(hunter\.timezone\)/.test(bodyRoute) &&
      /tzDayWindow\(weekStart,\s*hunter\.timezone\)\.start\.getTime\(\)/.test(bodyRoute) &&
      !bodyRoute.includes("weekStartUTC")
  )
}

// ── 2 · Freshness curve sanity (lib/recovery.ts invariants) ──────────────────
console.log("[r69] ── 2 · freshness curve sanity (lib/recovery.ts) ──────────────")
{
  ok("freshness(0, sets) === 0 for sets ∈ {0, 6, 30}", [0, 6, 30].every((s) => freshness(0, s) === 0))
  ok("freshness(NaN, 5) === 100 (non-finite recency → fully fresh)", freshness(NaN, 5) === 100)
  ok("freshness(Infinity, 5) === 100 (never-retrain asymptote)", freshness(Infinity, 5) === 100)

  let mono = true
  for (const sets of [0, 6, 12, 26]) {
    let prev = -1
    for (let h = 0; h <= 300; h += 2.5) {
      const v = freshness(h, sets)
      if (v < prev - 1e-9) mono = false
      prev = v
    }
  }
  ok("monotonic non-decreasing in hoursSince for fixed setsSince (grid 0–300h × 4 volumes)", mono)

  ok(
    "anchor: freshness(24, 0) ≈ 55 (±0.2)",
    Math.abs(freshness(24, 0) - 55) <= 0.2,
    `got ${freshness(24, 0).toFixed(2)}`
  )
  ok(
    "anchor: freshness(48, 0) ≈ 85 (±0.2)",
    Math.abs(freshness(48, 0) - 85) <= 0.2,
    `got ${freshness(48, 0).toFixed(2)}`
  )
  ok(
    "anchor: freshness(72, 0) ≈ 96 (±0.5)",
    Math.abs(freshness(72, 0) - 96) <= 0.5,
    `got ${freshness(72, 0).toFixed(2)}`
  )
  ok(
    "FATIGUED edge < ~17h: freshness(16,0) < 40 ≤ freshness(17,0)",
    freshness(16, 0) < 40 && freshness(17, 0) >= 40,
    `16h=${freshness(16, 0).toFixed(1)} · 17h=${freshness(17, 0).toFixed(1)}`
  )
  ok(
    "FRESH edge ~42h: freshness(42,0) < 80 ≤ freshness(43,0)",
    freshness(42, 0) < 80 && freshness(43, 0) >= 80,
    `42h=${freshness(42, 0).toFixed(1)} · 43h=${freshness(43, 0).toFixed(1)}`
  )

  ok(
    "volumeFactor edge: ≤ VOLUME_EDGE_SETS (6) → 1 (incl. 0, −5, NaN)",
    volumeFactor(6) === 1 && volumeFactor(0) === 1 && volumeFactor(-5) === 1 && volumeFactor(NaN) === 1
  )
  ok("volumeFactor(7) === 1.05 (+5% per set past the edge)", volumeFactor(7) === 1.05)
  ok("volumeFactor(26) === 2 and stays capped at 100", volumeFactor(26) === 2 && volumeFactor(100) === 2)
  ok(
    "volume slowdown is real: freshness(48, 12) < freshness(48, 6)",
    freshness(48, 12) < freshness(48, 6),
    `${freshness(48, 12).toFixed(1)} < ${freshness(48, 6).toFixed(1)}`
  )
}

// ── 3 · tz day keys (lib/game R38 primitives) ────────────────────────────────
console.log("[r69] ── 3 · hunter-tz day keys (lib/game) ─────────────────────────")
{
  // Fixed instant near midnight: 2026-01-15 23:30 UTC
  const d = new Date("2026-01-15T23:30:00Z")
  const kol = dayKeyIn("Asia/Kolkata", d) // UTC+5:30 → 2026-01-16 05:00
  const ny = dayKeyIn("America/New_York", d) // EST (UTC−5) → 2026-01-15 18:30
  ok('dayKeyIn("Asia/Kolkata", 2026-01-15T23:30Z) === "2026-01-16"', kol === "2026-01-16", kol)
  ok('dayKeyIn("America/New_York", 2026-01-15T23:30Z) === "2026-01-15"', ny === "2026-01-15", ny)
  ok("the two zones land on different calendar days at the same instant", kol !== ny)

  // Late-Sunday instant: the ISO WEEK key differs across zones too
  const sunday = new Date("2026-01-18T23:30:00Z") // Sunday 23:30 UTC
  const kolWeek = weekStartKeyIn("Asia/Kolkata", sunday) // Kolkata: Mon 2026-01-19 → week starts 01-19
  const nyWeek = weekStartKeyIn("America/New_York", sunday) // NY: still Sun 01-18 → week started 01-12
  ok('weekStartKeyIn("Asia/Kolkata", Sunday-23:30Z) === "2026-01-19"', kolWeek === "2026-01-19", kolWeek)
  ok('weekStartKeyIn("America/New_York", Sunday-23:30Z) === "2026-01-12"', nyWeek === "2026-01-12", nyWeek)
  ok("the week keys differ across zones at the same instant", kolWeek !== nyWeek)

  ok(
    "keyBefore chain: keyBefore(2026-01-15) = 01-14; 7 steps = 01-08 (DST-safe dayAgoKey idiom)",
    keyBefore("2026-01-15") === "2026-01-14" &&
      [1, 2, 3, 4, 5, 6, 7].reduce<string>((k) => keyBefore(k), "2026-01-15") === "2026-01-08"
  )
}

// ── 4 · load.ts tz param (strain/ACWR day buckets) ───────────────────────────
console.log("[r69] ── 4 · buildLoadView tz param (lib/load.ts) ──────────────────")
{
  // Synthetic cleared session starting 2026-01-15 23:30 UTC (near midnight)
  const startedAt = new Date("2026-01-15T23:30:00Z")
  const mk = (): LoadSession => ({
    startedAt,
    durationMin: 60,
    volumeKg: 1000,
    logs: [{ type: "strength", sets: 5, reps: 5, durationMin: 0, rir: 2 }], // 60 × (10−2) = 480 AU
  })
  const today = new Date("2026-01-16T10:00:00Z")

  const viewKol = buildLoadView([mk()], today, "Asia/Kolkata")
  const viewNY = buildLoadView([mk()], today, "America/New_York")

  ok(
    'Asia/Kolkata bucket: the 23:30Z session lands on "2026-01-16" (05:30 local), 480 AU',
    viewKol.days.length === 90 &&
      viewKol.days[89]!.day === "2026-01-16" &&
      viewKol.days[89]!.load === 480 &&
      viewKol.days[89]!.load === sessionLoad(mk()),
    `todayStrain=${viewKol.todayStrain}`
  )
  ok(
    'America/New_York bucket: the same session lands on "2026-01-15" (18:30 local); today reads zero',
    viewNY.days[88]!.day === "2026-01-15" &&
      viewNY.days[88]!.load === 480 &&
      viewNY.days[89]!.day === "2026-01-16" &&
      viewNY.days[89]!.load === 0
  )
  ok(
    "bucketing consequence: todayStrain differs across zones (16.33 vs 0)",
    viewKol.todayStrain !== viewNY.todayStrain &&
      Math.abs(viewKol.todayStrain! - dailyStrain(480)) <= 0.005 &&
      viewNY.todayStrain === 0,
    `Kolkata=${viewKol.todayStrain} · NY=${viewNY.todayStrain}`
  )
  ok(
    "load math itself is tz-independent (same 480 AU total in both zones)",
    viewKol.days.reduce((a, d) => a + d.load, 0) === viewNY.days.reduce((a, d) => a + d.load, 0) &&
      viewKol.days.reduce((a, d) => a + d.load, 0) === 480
  )

  // Legacy fallback: absent tz → server-local key (dayKeyIn's own contract)
  const viewLegacy = buildLoadView([mk()], today)
  const legacyKey = dayKeyIn(undefined, startedAt)
  const legacyBucket = viewLegacy.days.find((d) => d.load === 480)?.day ?? null
  ok(
    "legacy fallback: no-tz call still buckets (server-local, = dayKeyIn(undefined, ·))",
    legacyBucket === legacyKey,
    `bucket=${legacyBucket} · expected=${legacyKey}`
  )
  ok(
    "null tz behaves identically to absent tz (deep-equal LoadView)",
    JSON.stringify(buildLoadView([mk()], today, null)) === JSON.stringify(viewLegacy)
  )

  // Static: the live API callers thread hunter.timezone
  const loadRoute = readFileSync(resolve(ROOT, "src/app/api/load/route.ts"), "utf8")
  const coachRoute = readFileSync(resolve(ROOT, "src/app/api/coach/route.ts"), "utf8")
  ok(
    "/api/load passes hunter.timezone to buildLoadView",
    /buildLoadView\(sessions,\s*new Date\(\),\s*hunter\.timezone\)/.test(loadRoute)
  )
  ok(
    "/api/coach passes hunter.timezone to buildLoadView",
    /buildLoadView\(cleared,\s*new Date\(\),\s*hunter\.timezone\)/.test(coachRoute)
  )
}

// ── 5 · Route statics: insights / weekly-review / destinations / advisor ─────
console.log("[r69] ── 5 · tz residuals + advisor harmonization (statics) ────────")
{
  const insightsRoute = readFileSync(resolve(ROOT, "src/app/api/insights/route.ts"), "utf8")
  ok(
    "insights route imports dayKeyIn/keyBefore/weekStartKeyIn from @/lib/game (bare dayKey gone)",
    /import\s*\{\s*dayKeyIn,\s*keyBefore,\s*weekStartKeyIn\s*\}\s*from\s*"@\/lib\/game"/.test(insightsRoute) &&
      !/\bdayKey\(/.test(insightsRoute)
  )
  ok(
    "insights lastNDays is tz-aware (keyBefore chain) and feeds the query bounds",
    /function lastNDays\(n: number, tz: string \| null \| undefined\)/.test(insightsRoute) &&
      /const sinceDay = lastNDays\(7, tz\)\[0\]/.test(insightsRoute) &&
      insightsRoute.includes("day: { gte: sinceDay }")
  )
  ok(
    "insights helpers thread tz (series days, lift samples, move minutes, deload week buckets)",
    /lastNDays\(7, tz\)/.test(insightsRoute) &&
      /dayKeyIn\(tz, s\.startedAt\)/.test(insightsRoute) &&
      /weekStartOf\(s\.startedAt, tz\)/.test(insightsRoute) &&
      /weekStartKeyIn\(tz, d\)/.test(insightsRoute)
  )

  const weeklyRoute = readFileSync(resolve(ROOT, "src/app/api/weekly-review/route.ts"), "utf8")
  ok(
    "weekly-review uses weekStartKeyIn(hunter.timezone); legacy engine.weekStartKey() call gone",
    /weekStartKeyIn\(hunter\.timezone\)/.test(weeklyRoute) && !/weekStartKey\(\)/.test(weeklyRoute)
  )
  ok(
    "weekly-review week instants via tzDayWindow (current + previous ISO week, keyBefore chain)",
    /tzDayWindow\(weekStart,\s*hunter\.timezone\)\.start/.test(weeklyRoute) &&
      /weekStartAgo\(weekStart\)/.test(weeklyRoute) &&
      /tzDayWindow\(lastWeekStart,\s*hunter\.timezone\)\.start/.test(weeklyRoute)
  )
  ok(
    "weekly-review flat-log day keys are hunter-tz (same calendar system as the week keys)",
    /dayKeyIn\(hunter\.timezone,\s*l\.session\.startedAt\)/.test(weeklyRoute)
  )

  const destRoute = readFileSync(resolve(ROOT, "src/app/api/destinations/route.ts"), "utf8")
  ok(
    "destinations uses weekStartKeyIn(hunter.timezone) + tzDayWindow instant; legacy call gone",
    /weekStartKeyIn\(hunter\.timezone\)/.test(destRoute) &&
      /tzDayWindow\(weekStart,\s*hunter\.timezone\)\.start/.test(destRoute) &&
      /startedAt: \{ gte: weekStartInstant \}/.test(destRoute) &&
      !/weekStartKey\(\)/.test(destRoute)
  )

  const advisor = readFileSync(resolve(ROOT, "src/lib/advisor.ts"), "utf8")
  const harmonized = [
    ...advisor.matchAll(
      /title: "PROTEIN 1\.6–2\.2 G\/KG\/DAY", detail: "Growth dosing \(Morton 2018\); the ISSN general guideline spans 1\.4–2\.0 g\/kg\/day\./g
    ),
  ]
  ok(
    "advisor protein cards harmonized — title kept, detail discloses BOTH truths (2 sites: JUMP + PULLUP)",
    harmonized.length === 2,
    `found ${harmonized.length}`
  )
  ok(
    "old generic protein detail string fully gone from advisor.ts",
    !advisor.includes("Daily protein in this range supports the muscle")
  )
  const science = readFileSync(resolve(ROOT, "src/lib/science.ts"), "utf8")
  ok(
    "lib/science.ts issn-protein footnote untouched (still the 1.4-2.0 ISSN 2017 range)",
    /id: "issn-protein"[\s\S]*?1\.4-2\.0 g of protein[\s\S]*?source: "ISSN 2017"/.test(science)
  )
}

// ── 6 · recovery.ts tz alignment (R70-b — hunter-tz day attribution) ─────────
console.log("[r69] ── 6 · recovery.ts tz alignment (R70) ──────────────────────────")
{
  const {
    lastTrainedByMuscle,
    recoveryView,
    RECOVERY_TAU_H,
    RECOVERY_POWER,
    VOLUME_EDGE_SETS,
    SLOWDOWN_PER_SET,
    MAX_SLOWDOWN,
  } = await import("@/lib/recovery")

  // Synthetic cleared bench session (CHEST/TRICEPS/SHOULDERS), 2026-01-15 23:30 UTC.
  const mk = (iso: string, sets: number): RecoverySessionInput => ({
    status: "cleared",
    startedAt: iso,
    logs: [{ name: "Bench press", sets }],
  })
  const START = "2026-01-15T23:30:00Z"
  const NOW = new Date("2026-01-16T10:00:00Z")

  const kol = lastTrainedByMuscle([mk(START, 4)], NOW, "Asia/Kolkata")
  const utc = lastTrainedByMuscle([mk(START, 4)], NOW, "UTC")
  ok(
    'Kolkata attribution: 23:30Z session → CHEST lastTrainedDay "2026-01-16" (05:00 local, NEXT day)',
    kol.CHEST?.lastTrainedDay === "2026-01-16",
    kol.CHEST?.lastTrainedDay
  )
  ok(
    'UTC attribution: the same session → CHEST lastTrainedDay "2026-01-15" (same day)',
    utc.CHEST?.lastTrainedDay === "2026-01-15",
    utc.CHEST?.lastTrainedDay
  )
  ok(
    "alignment proof: the same instant lands on different calendar days across zones",
    kol.CHEST?.lastTrainedDay !== utc.CHEST?.lastTrainedDay
  )
  ok(
    "hoursSince is timezone-independent (only day attribution moves): 10.5h in both zones",
    kol.CHEST?.hoursSince === utc.CHEST?.hoursSince &&
      Math.abs((kol.CHEST?.hoursSince ?? -1) - 10.5) < 1e-9,
    `kol=${kol.CHEST?.hoursSince} · utc=${utc.CHEST?.hoursSince}`
  )

  // Legacy fallback: null tz ≡ absent tz ≡ server-local key (dayKeyIn's contract)
  const noTz = lastTrainedByMuscle([mk(START, 4)], NOW)
  const nullTz = lastTrainedByMuscle([mk(START, 4)], NOW, null)
  const serverLocalKey = dayKeyIn(undefined, new Date(START))
  ok(
    "null tz ≡ absent tz (deep-equal) and both = dayKeyIn(undefined, ·) — legacy server-local fallback",
    JSON.stringify(nullTz) === JSON.stringify(noTz) && noTz.CHEST?.lastTrainedDay === serverLocalKey,
    `fallback day=${serverLocalKey}`
  )
  ok(
    'invalid tz ("Not/AZone") → the same server-local fallback (game.ts contract)',
    JSON.stringify(lastTrainedByMuscle([mk(START, 4)], NOW, "Not/AZone")) === JSON.stringify(noTz)
  )

  // setsSince day-summation across zones: two sessions straddling UTC midnight
  const pair = [mk("2026-01-15T23:30:00Z", 4), mk("2026-01-16T01:00:00Z", 3)]
  const pairKol = lastTrainedByMuscle(pair, NOW, "Asia/Kolkata")
  const pairUtc = lastTrainedByMuscle(pair, NOW, "UTC")
  const pairNY = lastTrainedByMuscle(pair, NOW, "America/New_York")
  ok(
    "triple-zone setsSince: Kolkata merges both onto 01-16 (7 sets) · UTC splits (last day 01-16, 3 sets) · NY merges both onto 01-15 (7 sets)",
    pairKol.CHEST?.lastTrainedDay === "2026-01-16" && pairKol.CHEST?.setsSince === 7 &&
      pairUtc.CHEST?.lastTrainedDay === "2026-01-16" && pairUtc.CHEST?.setsSince === 3 &&
      pairNY.CHEST?.lastTrainedDay === "2026-01-15" && pairNY.CHEST?.setsSince === 7,
    `kol=${pairKol.CHEST?.lastTrainedDay}/${pairKol.CHEST?.setsSince} · utc=${pairUtc.CHEST?.lastTrainedDay}/${pairUtc.CHEST?.setsSince} · ny=${pairNY.CHEST?.lastTrainedDay}/${pairNY.CHEST?.setsSince}`
  )

  // recoveryView threads tz (the freshness panel's live call shape)
  const viewKol = recoveryView([mk(START, 4)], NOW, "Asia/Kolkata")
  const viewDefault = recoveryView([mk(START, 4)], NOW)
  const chestKol = viewKol.muscles.find((m) => m.muscleId === "CHEST")
  const chestDefault = viewDefault.muscles.find((m) => m.muscleId === "CHEST")
  ok(
    'recoveryView(sessions, now, tz) threads tz: CHEST row reads "2026-01-16" in Kolkata; absent tz keeps the legacy server-local day',
    chestKol?.lastTrainedDay === "2026-01-16" &&
      chestDefault?.lastTrainedDay === dayKeyIn(undefined, new Date(START)),
    `kol=${chestKol?.lastTrainedDay} · default=${chestDefault?.lastTrainedDay}`
  )
  ok(
    "freshness numerics untouched (curve constants byte-identical): τ=28.8 · power=1.25 · edge=6 · +5%/set · cap ×2",
    RECOVERY_TAU_H === 28.8 && RECOVERY_POWER === 1.25 && VOLUME_EDGE_SETS === 6 &&
      SLOWDOWN_PER_SET === 0.05 && MAX_SLOWDOWN === 2
  )

  // Statics: the shipped modules run the tz-aware forms
  const recoverySrc = readFileSync(resolve(ROOT, "src/lib/recovery.ts"), "utf8")
  ok(
    "recovery.ts imports dayKeyIn from @/lib/game and the private server-local dayKey helper is gone",
    /import \{ dayKeyIn \} from "@\/lib\/game"/.test(recoverySrc) &&
      !/function dayKey\(/.test(recoverySrc)
  )
  ok(
    "recovery.ts signatures carry the optional tz (lastTrainedByMuscle + recoveryView), dayKeyIn(tz, started) at both attribution sites",
    /export function lastTrainedByMuscle\(\s*sessions: RecoverySessionInput\[\],\s*now: Date = new Date\(\),\s*tz\?: string \| null,?\s*\)/.test(recoverySrc) &&
      /export function recoveryView\(\s*sessions: RecoverySessionInput\[\] \| null \| undefined,\s*now: Date,\s*tz\?: string \| null,?\s*\)/.test(recoverySrc) &&
      (recoverySrc.match(/dayKeyIn\(tz, started\)/g) ?? []).length === 2
  )
  const bodyRoute2 = readFileSync(resolve(ROOT, "src/app/api/body/route.ts"), "utf8")
  ok(
    "/api/body: bare dayKey( gone — scanner day attribution is dayKeyIn(hunter.timezone, ·) at both sites",
    /daySets\.get\(dayKeyIn\(hunter\.timezone, new Date\(at\)\)\)/.test(bodyRoute2) &&
      /dayKeyIn\(hunter\.timezone, session\.startedAt\)/.test(bodyRoute2) &&
      !/\bdayKey\(/.test(bodyRoute2)
  )
  const atlas = readFileSync(resolve(ROOT, "src/components/fitness/body-atlas-tab.tsx"), "utf8")
  ok(
    "body-atlas FreshnessPanel threads tz (recoveryView(data.history, new Date(), tz); mounted with hunter.timezone)",
    /function FreshnessPanel\(\{ tz \}: \{ tz\?: string \| null \}\)/.test(atlas) &&
      /recoveryView\(data\.history, new Date\(\), tz\)/.test(atlas) &&
      /<FreshnessPanel tz=\{_hunter\.timezone\} \/>/.test(atlas)
  )
  const trainTab = readFileSync(resolve(ROOT, "src/components/prime/train-tab.tsx"), "utf8")
  ok(
    "TRAIN deload banner: fetches /api/load and derives client-side via deloadView(days, dayKeyIn(tz, new Date()), acwr, acwrVerdict)",
    /useApi<LoadView>\("\/api\/load"\)/.test(trainTab) &&
      /deloadView\(load\.data\.days, dayKeyIn\(tz, new Date\(\)\), load\.data\.acwr, load\.data\.acwrVerdict\)/.test(trainTab)
  )
  ok(
    "TRAIN banner degrades gracefully: NO HISTORY / fetch error render nothing; loading shows the compact skeleton",
    /deload && deload\.status !== "NO HISTORY"/.test(trainTab) &&
      /load\.loading && !load\.data/.test(trainTab)
  )
}

console.log(`\n[r69] probe complete: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log(`ALL ${pass} ASSERTIONS PASSED`)
