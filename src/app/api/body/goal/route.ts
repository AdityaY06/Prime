import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import type { MetricGoal } from "@prisma/client"

export const dynamic = "force-dynamic"

// ─── /api/body/goal — body-metric targets (MetricGoal, one per metric) ─────────
// GET    → { goals: [{ metric, targetValue, direction, createdAt }] }
// POST   { metric, targetValue, direction } → upsert on (hunterId, metric)
// DELETE ?metric=weight → removes the goal (404 when absent)

// R68 — "neck" joins the goal set (health-audit B1 unlocked the Navy
// body-fat input path; without it here, SET TARGET on the new tape card
// would 400). Bounds mirror the metrics route's neck range 20–80 cm.
const GOAL_METRICS = ["weight", "chest", "waist", "hips", "arm", "thigh", "calf", "neck"] as const
type GoalMetric = (typeof GOAL_METRICS)[number]

/** Sane per-metric bounds — weight 20–400 kg, girth metrics 10–250 cm. */
const BOUNDS: Record<GoalMetric, { min: number; max: number; unit: string }> = {
  weight: { min: 20, max: 400, unit: "kg" },
  chest: { min: 10, max: 250, unit: "cm" },
  waist: { min: 10, max: 250, unit: "cm" },
  hips: { min: 10, max: 250, unit: "cm" },
  arm: { min: 10, max: 250, unit: "cm" },
  thigh: { min: 10, max: 250, unit: "cm" },
  calf: { min: 10, max: 250, unit: "cm" },
  neck: { min: 20, max: 80, unit: "cm" },
}

const DIRECTIONS = ["down", "up"] as const
type GoalDirection = (typeof DIRECTIONS)[number]

function isGoalMetric(v: unknown): v is GoalMetric {
  return typeof v === "string" && (GOAL_METRICS as readonly string[]).includes(v)
}

function isDirection(v: unknown): v is GoalDirection {
  return typeof v === "string" && (DIRECTIONS as readonly string[]).includes(v)
}

function goalDTO(g: MetricGoal) {
  return {
    metric: g.metric,
    targetValue: g.targetValue,
    direction: g.direction,
    createdAt: g.createdAt.toISOString(),
  }
}

// ─── GET /api/body/goal ───────────────────────────────────────────────────────

export async function GET() {
  try {
    const hunter = await requireHunter()
    const goals = await db.metricGoal.findMany({
      where: { hunterId: hunter.id },
      orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({ goals: goals.map(goalDTO) })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/body/goal", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// ─── POST /api/body/goal — upsert a target ────────────────────────────────────

export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }
    const payload = body as Record<string, unknown>

    if (!isGoalMetric(payload.metric)) {
      return NextResponse.json(
        { error: "metric must be one of weight, chest, waist, hips, arm, thigh, calf, neck." },
        { status: 400 }
      )
    }
    if (!isDirection(payload.direction)) {
      return NextResponse.json({ error: "direction must be down or up." }, { status: 400 })
    }

    const targetValue = Number(payload.targetValue)
    const bounds = BOUNDS[payload.metric]
    if (!Number.isFinite(targetValue) || targetValue < bounds.min || targetValue > bounds.max) {
      return NextResponse.json(
        { error: `targetValue must be between ${bounds.min} and ${bounds.max} ${bounds.unit}.` },
        { status: 400 }
      )
    }

    const value = Math.round(targetValue * 10) / 10
    const goal = await db.metricGoal.upsert({
      where: { hunterId_metric: { hunterId: hunter.id, metric: payload.metric } },
      create: { hunterId: hunter.id, metric: payload.metric, targetValue: value, direction: payload.direction },
      update: { targetValue: value, direction: payload.direction },
    })
    return NextResponse.json({ goal: goalDTO(goal) })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("POST /api/body/goal", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// ─── DELETE /api/body/goal?metric=weight ──────────────────────────────────────

export async function DELETE(req: Request) {
  try {
    const hunter = await requireHunter()
    const url = new URL(req.url)
    const metric = url.searchParams.get("metric")
    if (!isGoalMetric(metric)) {
      return NextResponse.json(
        { error: "metric must be one of weight, chest, waist, hips, arm, thigh, calf, neck." },
        { status: 400 }
      )
    }

    const existing = await db.metricGoal.findFirst({ where: { hunterId: hunter.id, metric } })
    if (!existing) {
      return NextResponse.json({ error: "No goal set for this metric." }, { status: 404 })
    }

    await db.metricGoal.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("DELETE /api/body/goal", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
