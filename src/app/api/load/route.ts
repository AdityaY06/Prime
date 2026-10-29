import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { buildLoadView } from "@/lib/load"

export const dynamic = "force-dynamic"

// GET /api/load — the Strain & Load console DTO (R18-d).
//
// Reads the hunter's workout-session history. Only status "cleared" counts:
// completed sessions are the app's canonical unit of done work everywhere
// else (engine aggregates, XP, totals). "abandoned" raids are excluded —
// they carry no completed work (durationMin 0 / volume 0 in practice) and
// counting partial raids would inflate chronic load with sessions the
// hunter walked away from. "active" (in-flight) sessions are excluded for
// the same reason — the work is not finished until the raid is cleared.
// Computation is pure (lib/load.ts); the Prisma client self-heals
// centrally in @/lib/db.
export async function GET() {
  try {
    const hunter = await requireHunter()
    const sessions = await db.workoutSession.findMany({
      where: { hunterId: hunter.id, status: "cleared" },
      include: {
        // R32-a: rpe rides the select for parity with rir (every rir-selecting
        // surface now selects rpe too) — LoadLog structurally tolerates the
        // extra field. load.ts's effort math deliberately still reads RIR only
        // this round: swapping in captured RPE would silently re-weight every
        // historical strain/ACWR number the moment ratings exist, a behavioral
        // change owned by a future round.
        logs: { select: { type: true, sets: true, reps: true, durationMin: true, rir: true, rpe: true } },
      },
      orderBy: { startedAt: "asc" },
    })
    // R69 — the strain/ACWR day buckets roll with the hunter's timezone
    // (audit 2-a B3 residual; null tz = legacy server-local fallback inside
    // buildLoadView, dayKeyIn's contract).
    return NextResponse.json(buildLoadView(sessions, new Date(), hunter.timezone))
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("[api/load]", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
