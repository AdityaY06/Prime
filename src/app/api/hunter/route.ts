import { NextResponse } from "next/server"
import type { Hunter } from "@prisma/client"
import { db } from "@/lib/db"
import { ARCHETYPES, dayKey, isValidTimeZone, xpToNext } from "@/lib/game"
import { ensureQuests, getHunter, HUNTER_COOKIE, hunterDTO, requireHunter, checkAchievements } from "@/lib/engine"
import { titleByCode } from "@/lib/titles"

export const dynamic = "force-dynamic"

// R33 — the device-identity cookie contract: 10-year lifetime (a device-lifetime
// profile), Path=/ so every API call carries it, SameSite=Lax (sent on same-site
// fetches + top-level navigations; cross-site POSTs never carry it). NOT httpOnly:
// the client never needs to read it, but QA tooling and the TWA webview must be
// able to inject/inspect it — the token gates data scoping, not secrets.
const COOKIE_LIFETIME_S = 60 * 60 * 24 * 365 * 10

/**
 * R40 — the cross-site-iframe cookie wall, ACTUALLY fixed.
 *
 * HISTORY: R39 keyed the strict attributes off x-forwarded-proto === "https".
 * That branch NEVER fires on the real gateway path: the platform edge
 * terminates TLS and forwards PLAIN HTTP to Caddy :81 (the Caddyfile has no
 * tls directive, so Caddy's {scheme} placeholder is "http" for every request
 * it will ever receive). Next therefore always saw x-forwarded-proto: http,
 * issued SameSite=Lax, and the cross-site preview iframe discarded the
 * identity cookie — R39's curl verification had set the header manually, so
 * the test passed while the real path never took the branch. Tonight's
 * dev.log proved it live: a fresh device awakened ("sdfgh"), the empty-shell
 * adoption healed both retries (P2002 → 200 each time), and the calibration
 * leg 404'd NOT_AWAKENED all three times — the cookie never landed.
 *
 * THE FIX: derive "this request is user-facing HTTPS" from the HOST, which
 * survives the whole chain (Caddy's `header_up Host {host}` preserves the
 * original public hostname; only local QA ever sends a loopback host). A
 * non-loopback host ⇒ the request came through the platform's HTTPS edge ⇒
 * issue SameSite=None; Secure; Partitioned (CHIPS — the attribute set that
 * survives third-party iframe contexts in Chrome via partitioning and
 * Firefox via auto-partitioning; Safari additionally needs the
 * requestStorageAccess() the client calls on the AWAKEN tap).
 * x-forwarded-proto=https still short-circuits true for any future
 * TLS-terminating proxy, and loopback hosts keep SameSite=Lax so plain-HTTP
 * localhost QA (curl, agent-browser) keeps working — a Secure cookie is
 * refused outright on http://localhost.
 */
function identityCookieOpts(req: Request, maxAge: number = COOKIE_LIFETIME_S) {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase()
  const loopback = host !== undefined && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
  // user-facing HTTPS ⇔ an explicit https proxy hop OR any non-loopback host
  // (only the platform's edge can route external traffic here, and it is TLS)
  const strict = proto === "https" || (host !== undefined && host !== "" && !loopback)
  return strict
    ? { path: "/", sameSite: "none" as const, secure: true, partitioned: true, maxAge }
    : { path: "/", sameSite: "lax" as const, maxAge }
}

/**
 * R40 — one evidence line per hunter creation. The cookie wall has now bitten
 * twice (R39, R40) precisely because the real request headers were never
 * observable after the fact; this logs the discriminating inputs at the exact
 * decision point so any future "cookie didn't land" report arrives with its
 * own diagnosis in dev.log. Creation is rare — the noise cost is negligible.
 */
function logIdentityDecision(req: Request, hunterName: string) {
  const proto = req.headers.get("x-forwarded-proto") ?? "-"
  const host = req.headers.get("host") ?? "-"
  console.log(`[identity] hunter "${hunterName}" created — host=${host} x-forwarded-proto=${proto}`)
}

/**
 * R39 — empty-shell adoption on a name collision.
 *
 * The cookie wall above could leave an UNREACHABLE hunter row: created, but
 * its Set-Cookie never reached any browser, so nothing can ever authenticate
 * as it — while it still burns the globally-unique athlete name (verified:
 * "Kael", created tonight 15:45, xp 0, zero sessions/events — the user's
 * retry got "That athlete name is already claimed. Choose another.").
 *
 * A collision against a PROVABLY EMPTY shell is not a conflict — it is this
 * device retrying a creation that never completed. Any game action (session,
 * quest, metric, nutrition, water, boss, program) grants XP and/or writes an
 * XpEvent; a hunter with zero xp, zero essence, zero sessions AND zero XP
 * events has done literally nothing (nutritionLogs/waterLogs/bodyMetrics are
 * belt-and-braces). Delete the shell and create the real profile in ONE
 * transaction. A shell with ANY data keeps the 400 — it may be another
 * device's live profile. Concurrent adoption races converge: shells are
 * empty (nothing to lose) and each attempt re-rotates the row.
 */
async function createOrAdoptHunter(data: {
  name: string
  archetype: string
  timezone: string | null
  str: number
  vit: number
  endur: number
  agi: number
  flex: number
}): Promise<Hunter> {
  const create = { data: { ...data, statPoints: 0, lastActiveDay: null, token: crypto.randomUUID() } }
  try {
    return await db.hunter.create(create)
  } catch (e) {
    if ((e as { code?: string })?.code !== "P2002") throw e
    const shell = await db.hunter.findUnique({
      where: { name: data.name },
      include: {
        _count: {
          select: { sessions: true, xpEvents: true, nutritionLogs: true, waterLogs: true, bodyMetrics: true },
        },
      },
    })
    const empty =
      shell !== null &&
      shell.xp === 0 &&
      shell.essence === 0 &&
      shell._count.sessions === 0 &&
      shell._count.xpEvents === 0 &&
      shell._count.nutritionLogs === 0 &&
      shell._count.waterLogs === 0 &&
      shell._count.bodyMetrics === 0
    if (!empty) throw e // a real profile holds the name → the caller's P2002 400
    return await db.$transaction(async (tx) => {
      await tx.hunter.delete({ where: { id: shell.id } }) // cascades its seeded quests/achievements
      return await tx.hunter.create(create)
    })
  }
}

// GET /api/hunter — current hunter profile (404 if not awakened)
export async function GET() {
  try {
    const hunter = await getHunter()
    if (!hunter) return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    await ensureQuests(hunter.id)
    // R52-2 orchestrator simplification: the shared db client's self-heal
    // (lib/db.ts — probe column `region`) covers the post-push window, so
    // the separate liveDb layer was retired. The splice below stays as an
    // idempotent belt-and-braces: it only fills keys a stale mapper left
    // out, never overrides one it emitted.
    const row = (await db.hunter.findUnique({ where: { id: hunter.id } })) ?? hunter
    const dto = hunterDTO(row)
    return NextResponse.json({
      hunter: { ...dto, region: dto.region ?? row.region ?? null, country: dto.country ?? row.country ?? null },
    })
  } catch (e) {
    console.error("GET /api/hunter", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// POST /api/hunter — the awakening ritual (device identity)
// R33: creates the hunter with a fresh UUID device token and binds it to this
// browser via Set-Cookie (10-year, Path=/). Idempotent: a request that already
// carries a token resolving to a hunter just gets that hunter back (double-tap
// / multi-tab race → no second profile). A stale token (deleted hunter)
// self-heals: new hunter, new token, cookie overwritten. R39: a name collision
// with an unreachable empty shell adopts the shell instead of 400ing (see
// createOrAdoptHunter). R40: the cookie's SameSite/Secure/Partitioned
// attributes adapt to the request's HOST (see identityCookieOpts — the
// x-forwarded-proto signal R39 trusted never fires on the real gateway path).
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const name = String(body?.name ?? "").trim()
    const archetypeId = String(body?.archetype ?? "vanguard")

    // idempotent re-awaken — the cookie already resolves on this device.
    // (getHunter() resolves via findUnique on a non-empty token, so the cast
    // is safe by construction; the guard keeps the type honest anyway.)
    const already = await getHunter()
    if (already && already.token) {
      const res = NextResponse.json({ hunter: hunterDTO(already) })
      res.cookies.set(HUNTER_COOKIE, already.token, identityCookieOpts(req))
      return res
    }

    if (name.length < 2 || name.length > 24) {
      return NextResponse.json({ error: "Name must be 2–24 characters." }, { status: 400 })
    }
    const arch = ARCHETYPES.find((a) => a.id === archetypeId)
    if (!arch) return NextResponse.json({ error: "Unknown archetype." }, { status: 400 })

    // R38 — capture the device's IANA zone at awakening so the day boundary
    // (dailies, streaks, rift, rest decrees) rolls at THIS device's midnight.
    // Unvalidated/absent/null-safe: a bad string degrades to null = legacy UTC.
    const tzRaw = typeof body?.timezone === "string" ? body.timezone.trim() : ""
    const timezone = tzRaw && isValidTimeZone(tzRaw) ? tzRaw : null

    const hunter = await createOrAdoptHunter({
      name,
      archetype: arch.id,
      timezone,
      str: arch.stats.str,
      vit: arch.stats.vit,
      endur: arch.stats.endur,
      agi: arch.stats.agi,
      flex: arch.stats.flex,
    })

    await ensureQuests(hunter.id)
    const unlockedTitles = await checkAchievements(hunter.id)

    // the token we just created — captured as a bare string (Prisma's return
    // type keeps the column nullable; the create input guarantees it here)
    const token: string = hunter.token ?? crypto.randomUUID()
    logIdentityDecision(req, hunter.name)
    const res = NextResponse.json({ hunter: hunterDTO(hunter), unlockedTitles })
    res.cookies.set(HUNTER_COOKIE, token, identityCookieOpts(req))
    return res
  } catch (e) {
    // P2002 — name is globally unique; a NON-empty holder is another device's
    // live profile (empty shells were adopted upstream in createOrAdoptHunter).
    if ((e as { code?: string })?.code === "P2002") {
      return NextResponse.json(
        { error: "That athlete name is already claimed. Choose another." },
        { status: 400 },
      )
    }
    console.error("POST /api/hunter", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// PATCH /api/hunter — equip title / rename / declare standings arenas
// R52-2: region + country join the editable set — the state/country
// leaderboard tiers rank hunters that declared the SAME arena, so the cookie
// hunter must be able to declare (and clear with null) its own. Same shape as
// the name rule: trimmed, 2–48 chars, 400 with a clear message otherwise.
export async function PATCH(req: Request) {
  try {
    const hunter = await requireHunter()
    const body = await req.json()
    const data: {
      equippedTitle?: string
      name?: string
      region?: string | null
      country?: string | null
      leaderboardOptOut?: boolean
    } = {}

    if (typeof body?.equippedTitle === "string" || body?.equippedTitle === null) {
      if (body.equippedTitle) {
        const owns = await db.achievement.findUnique({
          where: { hunterId_code: { hunterId: hunter.id, code: body.equippedTitle } },
        })
        if (!owns) return NextResponse.json({ error: "Badge not unlocked." }, { status: 400 })
      }
      data.equippedTitle = body.equippedTitle || null
    }
    if (typeof body?.name === "string") {
      const name = body.name.trim()
      if (name.length < 2 || name.length > 24) {
        return NextResponse.json({ error: "Name must be 2–24 characters." }, { status: 400 })
      }
      data.name = name
    }
    // R52-2 — standings arenas: declare (string) or clear (null). Untouched
    // keys (undefined) never write — a title-equip PATCH leaves the arena as-is.
    if (typeof body?.region === "string" || body?.region === null) {
      const region = typeof body.region === "string" ? body.region.trim() : ""
      if (body.region !== null && (region.length < 2 || region.length > 48)) {
        return NextResponse.json({ error: "Region must be 2–48 characters." }, { status: 400 })
      }
      data.region = body.region === null ? null : region
    }
    if (typeof body?.country === "string" || body?.country === null) {
      const country = typeof body.country === "string" ? body.country.trim() : ""
      if (body.country !== null && (country.length < 2 || country.length > 48)) {
        return NextResponse.json({ error: "Country must be 2–48 characters." }, { status: 400 })
      }
      data.country = body.country === null ? null : country
    }
    // R56 — standings visibility: strict boolean only (never coerced — a
    // string "false" must not flip the flag). Opt-out touches nothing else.
    if (typeof body?.leaderboardOptOut === "boolean") {
      data.leaderboardOptOut = body.leaderboardOptOut
    }

    const updated = await db.hunter.update({ where: { id: hunter.id }, data })
    // R52-2 — same splice as GET: the cached mapper may omit the new fields
    const dto = hunterDTO(updated)
    return NextResponse.json({
      hunter: { ...dto, region: dto.region ?? updated.region ?? null, country: dto.country ?? updated.country ?? null },
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("PATCH /api/hunter", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// DELETE /api/hunter — the honest exit (R34-b): erases THIS device's profile.
// Every child relation (sessions→logs, metrics, xpEvents, achievements,
// quests, relics, briefings, restDays, bossDefeats, nutrition, water, PRs,
// programs, metricGoals) cascades onDelete: Cascade, so one hunter.delete
// wipes the whole ledger server-side. The identity cookie is cleared on the
// response (maxAge: 0) → the next GET /api/hunter 404s → AwakeningScreen.
// Identity comes from the cookie ONLY — a body name/id is never read here
// (accepting one would defeat the whole R33 device-scoping contract).
export async function DELETE(req: Request) {
  try {
    const hunter = await requireHunter()
    await db.hunter.delete({ where: { id: hunter.id } })
    const res = NextResponse.json({ ok: true })
    // same computed attributes as the issuing Set-Cookie (R39) so the clear
    // reliably overwrites the stored cookie in both http and https contexts
    res.cookies.set(HUNTER_COOKIE, "", identityCookieOpts(req, 0))
    return res
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("DELETE /api/hunter", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
