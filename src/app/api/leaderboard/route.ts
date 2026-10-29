import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { combatPower } from "@/lib/game"
import { requireHunter } from "@/lib/engine"

export const dynamic = "force-dynamic"

// ─── R52-2 · GET /api/leaderboard — the standings boards ─────────────────────
// HONEST DATA ONLY. There is no shared backend in PRIME — every row ranked
// here is a hunter registered in THIS device's SQLite DB. The boards are
// never padded with fabricated rivals:
//   • world  — every hunter row that exists locally.
//   • state  — hunters that declared the same region as the cookie hunter.
//   • country— hunters that declared the same country as the cookie hunter.
// An undeclared tier does NOT guess: it answers needsRegion/needsCountry with
// zero rows so the client offers the one-line setter instead of a phantom
// ranking. Rows rank by totalXp DESC → level DESC → name ASC (1-based); the
// cookie hunter's own row always ships at its TRUE rank (even past the 50-row
// cap) so "you" can never be cropped out of your own standings.
//
// R56 — leaderboardOptOut: opted-out hunters are excluded from every tier
// (their own row included — an opt-out is invisible, not "ranked but hidden").
// The response reports the cookie hunter's own flag as `optedOut` so the
// panel can render the eye toggle's true state. Opted-out hunters still SEE
// the boards — visibility is about appearance, not access.
//
// Reads run through the shared self-healing client (lib/db.ts — its probe
// column is this round's `region`, so a post-push dev server heals itself).

const ROW_CAP = 50

export async function GET(req: Request) {
  try {
    const me = await requireHunter()
    const scope = new URL(req.url).searchParams.get("scope") ?? "world"
    if (scope !== "state" && scope !== "country" && scope !== "world") {
      return NextResponse.json(
        { error: "Unknown scope. Use state, country or world." },
        { status: 400 },
      )
    }

    // one flat read — the Hunter table is tiny (one row per device profile);
    // tier filtering + ranking in JS keeps this a single query.
    const all = await db.hunter.findMany({
      select: {
        id: true,
        name: true,
        level: true,
        totalXp: true,
        str: true,
        vit: true,
        endur: true,
        agi: true,
        flex: true,
        region: true,
        country: true,
        leaderboardOptOut: true,
      },
    })

    // the cookie hunter's own declarations (requireHunter's row may come from
    // a pre-push client; the live rows above always carry the true values)
    const mine = all.find((h) => h.id === me.id)
    // R56 — the ranked pool: opted-out hunters never appear on any board
    // (their declarations still resolve the tier keys above — they keep
    // watching the arena they stand in; they just don't stand ON it).
    const pool = all.filter((h) => !h.leaderboardOptOut)
    const stateKey = scope === "state" && mine?.region ? mine.region.trim().toLowerCase() : null
    const countryKey = scope === "country" && mine?.country ? mine.country.trim().toLowerCase() : null
    if (scope === "state" && !stateKey) {
      return NextResponse.json({ scope, needsRegion: true, population: 0, rows: [], you: null })
    }
    if (scope === "country" && !countryKey) {
      return NextResponse.json({ scope, needsCountry: true, population: 0, rows: [], you: null })
    }

    // tier membership — declared arenas match case-insensitively (local,
    // free-text fields; "maharashtra" and "Maharashtra" are one arena)
    const tier =
      scope === "state"
        ? pool.filter((h) => (h.region ?? "").trim().toLowerCase() === stateKey)
        : scope === "country"
          ? pool.filter((h) => (h.country ?? "").trim().toLowerCase() === countryKey)
          : pool

    tier.sort((a, b) => b.totalXp - a.totalXp || b.level - a.level || a.name.localeCompare(b.name))

    const toRow = (h: (typeof tier)[number], rank: number) => ({
      rank,
      name: h.name,
      level: h.level,
      totalXp: h.totalXp,
      power: combatPower(h),
      region: h.region,
      country: h.country,
      isYou: h.id === me.id,
    })

    const rows = tier.slice(0, ROW_CAP).map((h, i) => toRow(h, i + 1))
    const myIndex = tier.findIndex((h) => h.id === me.id)
    // past the cap, your row still ships — appended at its true rank
    if (myIndex >= ROW_CAP) rows.push(toRow(tier[myIndex], myIndex + 1))

    return NextResponse.json({
      scope,
      population: tier.length,
      rows,
      you: myIndex >= 0 ? { rank: myIndex + 1 } : null,
      optedOut: mine?.leaderboardOptOut === true,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/leaderboard", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
