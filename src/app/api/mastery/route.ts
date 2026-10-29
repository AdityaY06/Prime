import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { GATES } from "@/lib/gates"
import { masteryForGate, type MasteryDTO } from "@/lib/mastery"

export const dynamic = "force-dynamic"

// GET /api/mastery — per-gate clear counts, mastery tiers + progress
export async function GET() {
  try {
    const hunter = await requireHunter()

    const grouped = await db.workoutSession.groupBy({
      by: ["gateId"],
      where: { hunterId: hunter.id, status: "cleared" },
      _count: { _all: true },
    })
    const clearsByGate: Record<string, number> = {}
    for (const g of grouped) clearsByGate[g.gateId] = g._count._all

    const gates = GATES.map((gate) => masteryForGate(gate.id, clearsByGate[gate.id] ?? 0))
    const best = gates.reduce<(typeof gates)[number] | null>((a, g) => (!a || g.clears > a.clears ? g : a), null)

    const dto: MasteryDTO = {
      gates,
      summary: {
        totalClears: gates.reduce((a, g) => a + g.clears, 0),
        bestGate: best && best.clears > 0 ? best.gateId : null,
        sovereignGates: gates.filter((g) => g.tier === 5).length,
      },
    }
    return NextResponse.json(dto)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/mastery", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
