import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { hunterProfile } from "@/lib/nutrition"
import { RESEARCH_MANIFESTO, RESEARCH_REGISTRY, buildResearchDigest } from "@/lib/research"

export const dynamic = "force-dynamic"

// GET /api/research — the app's formula/citation ledger + the personalized
// science digest powering today's numbers for THIS hunter.
//
// Registry + manifesto come from the pure research module (isomorphic). The
// digest needs exactly ONE extra db read beyond the hunter row: the latest
// logged tape metrics (weight/waist/neck/hips) — the same latest-wins rule
// /api/metrics and /api/insights use (latest day, then latest updatedAt).
// Every digest number is computed by lib/research.ts buildResearchDigest via
// the existing pure nutrition functions (calcTargets / hydrateGoalMl /
// bmiFor / bmiCategory) — zero new formulas, honest nulls throughout.

const TAPE_METRIC_TYPES = ["weight", "waist", "neck", "hips"] as const

export async function GET() {
  try {
    const hunter = await requireHunter()

    const metrics = await db.bodyMetric.findMany({
      where: {
        hunterId: hunter.id,
        type: { in: [...TAPE_METRIC_TYPES] },
      },
      select: { type: true, value: true },
      orderBy: [{ day: "asc" }, { updatedAt: "asc" }],
    })

    // latest-wins per type (later rows overwrite earlier ones — the
    // insights latestMap convention over an ascending sort)
    const latest = new Map<string, number>()
    for (const m of metrics) latest.set(m.type, m.value)

    const digest = buildResearchDigest(hunterProfile(hunter), {
      weightKg: latest.get("weight") ?? null,
      waistCm: latest.get("waist") ?? null,
      neckCm: latest.get("neck") ?? null,
      hipsCm: latest.get("hips") ?? null,
    })

    return NextResponse.json({
      registry: RESEARCH_REGISTRY,
      manifesto: RESEARCH_MANIFESTO,
      digest,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/research", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
