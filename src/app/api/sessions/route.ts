import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { gateById } from "@/lib/gates"
import { getActiveSession, requireHunter, sessionDTO } from "@/lib/engine"

export const dynamic = "force-dynamic"

// GET /api/sessions — active raid + recent history
export async function GET() {
  try {
    const hunter = await requireHunter()
    const active = await getActiveSession(hunter.id)
    const history = await db.workoutSession.findMany({
      where: { hunterId: hunter.id, status: { not: "active" } },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: { logs: { orderBy: { createdAt: "asc" } } },
    })
    return NextResponse.json({
      // programDay echoed (additive) so the client can rebuild the PROGRAM PLAN view after reload
      active: active ? { ...sessionDTO(active), programDay: active.programDay } : null,
      history: history.map((s) => ({ ...sessionDTO(s), programDay: s.programDay })),
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/sessions", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// POST /api/sessions — { gateId, programDay? } enter a gate (start a raid).
// programDay: optional 1-7 clamped day index when this raid executes a Program plan day.
export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body = await req.json()
    const gate = gateById(String(body?.gateId ?? ""))
    if (!gate) return NextResponse.json({ error: "Unknown training type." }, { status: 400 })

    const rawDay = Number(body?.programDay)
    const hasDay =
      body?.programDay !== undefined && body?.programDay !== null && Number.isFinite(rawDay)
    const programDay = hasDay ? Math.max(1, Math.min(7, Math.floor(rawDay))) : null

    const active = await getActiveSession(hunter.id)
    if (active) {
      return NextResponse.json(
        { error: "A session is already in progress.", active: sessionDTO(active) },
        { status: 409 }
      )
    }

    const session = await db.workoutSession.create({
      data: {
        hunterId: hunter.id,
        gateId: gate.id,
        gateName: gate.name,
        ...(programDay !== null ? { programDay } : {}),
      },
    })
    return NextResponse.json({ session: { ...sessionDTO({ ...session, logs: [] }), programDay: session.programDay } })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/sessions", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
