import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn, tzDayWindow } from "@/lib/game"
import { requireHunter, restDayState } from "@/lib/engine"

export const dynamic = "force-dynamic"

// ─── /api/rest-day — the weekly Sanctified Rest decree ────────────────────────
// GET  → current decree state (availability, eligibility, reason)
// POST → { action: "claim" } — sanctify today as a rest day (1 per ISO week)

export async function GET() {
  try {
    const hunter = await requireHunter()
    // Streak Shield relic (ward-of-continuity) — charges feed the shield inventory strip
    const [state, wardRelic] = await Promise.all([
      restDayState(hunter.id),
      db.relic.findUnique({
        where: { hunterId_code: { hunterId: hunter.id, code: "ward-of-continuity" } },
        select: { charges: true },
      }),
    ])
    return NextResponse.json({
      ...state,
      ward: wardRelic ? { owned: true, charges: wardRelic.charges } : null,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/rest-day", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body = (await req.json().catch(() => null)) as { action?: string } | null
    if (!body || body.action !== "claim") {
      return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 })
    }

    const state = await restDayState(hunter.id)
    if (state.claimedToday) {
      return NextResponse.json({ ...state, error: "ALREADY_CLAIMED_TODAY" }, { status: 409 })
    }
    if (!state.available) {
      return NextResponse.json({ ...state, error: "ALREADY_USED_THIS_WEEK" }, { status: 409 })
    }

    // A raid already cleared today means the chain is already secured.
    // R38 — "today" + its training window roll with the hunter's timezone.
    const today = dayKeyIn(hunter.timezone)
    const trainedWindow = tzDayWindow(today, hunter.timezone)
    const trainedToday = await db.workoutSession.count({
      where: {
        hunterId: hunter.id,
        status: "cleared",
        startedAt: { gte: trainedWindow.start, lt: trainedWindow.end },
      },
    })
    if (trainedToday > 0) {
      return NextResponse.json({ ...state, error: "TRAINED_TODAY" }, { status: 409 })
    }

    // A zero streak has nothing to shield.
    if (hunter.streak <= 0) {
      return NextResponse.json({ ...state, error: "NO_CHAIN" }, { status: 409 })
    }

    await db.restDay.create({ data: { hunterId: hunter.id, day: today } })
    const fresh = await restDayState(hunter.id)
    return NextResponse.json(fresh)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("POST /api/rest-day", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
