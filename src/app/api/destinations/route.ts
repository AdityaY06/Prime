import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn, tzDayWindow, weekStartKeyIn } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import {
  hrvBaselineFromRows,
  hrvTrainingModulation,
  rhrBaselineFromRows,
  readinessScore,
  type DayValue,
} from "@/lib/health"
import type { DestinationsDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

// The vitals that feed readiness — mirrors /api/readiness (one-per-type-per-day
// BodyMetric rows; "hrv" feeds the suppression component via its own baseline).
const READINESS_METRIC_TYPES = ["sleep", "restingHr", "mood", "energy", "hrv"] as const

/** GET /api/destinations — R55 honest rebuild of the R51 void.
 *
 *  The STATUS tab's destination index used to badge only the rows whose data
 *  the tab already held (goals / rift / essence) and go badge-less everywhere
 *  else — honest, but quiet. This ONE lean GET fills the remaining rows with
 *  live, hunter-timezone-aware state: latest body mass, active targets, today's
 *  fuel totals, today's readiness composite, PR count and week raids. Seven
 *  parallel single-purpose queries, zero fabrication — a surface never fed
 *  yields null/0 and the UI renders no badge for it (never a placeholder). */
export async function GET() {
  try {
    const hunter = await requireHunter()
    // R38 — "today" rolls with the hunter's timezone (null tz = legacy server-local).
    const today = dayKeyIn(hunter.timezone)
    // today−7 covers the prior-7-day baseline window (today excluded) in one query.
    const since = dayKeyIn(hunter.timezone, new Date(Date.now() - 7 * 86400000))
    // R69 — the week window rolls with the hunter's timezone (audit 2-a B3
    // residual; the /api/readiness R68 idiom): hunter-tz Monday key + the
    // DST-correct UTC instant of that Monday's midnight. Null timezone falls
    // back to legacy server-local behavior per dayKeyIn's contract.
    const weekStart = weekStartKeyIn(hunter.timezone)
    const weekStartInstant = tzDayWindow(weekStart, hunter.timezone).start

    const [massRow, activeTargets, foodRows, waterRows, vitalRows, weekSessions, prCount] =
      await Promise.all([
        // BODY — latest weight reading ever logged (day desc, then updatedAt).
        db.bodyMetric.findFirst({
          where: { hunterId: hunter.id, type: "weight" },
          orderBy: [{ day: "desc" }, { updatedAt: "desc" }],
          select: { day: true, value: true },
        }),
        db.metricGoal.count({ where: { hunterId: hunter.id } }),
        // FUEL — today's food rows (hunter timezone day).
        db.nutritionLog.findMany({
          where: { hunterId: hunter.id, day: today },
          select: { calories: true, protein: true },
        }),
        db.waterLog.findMany({
          where: { hunterId: hunter.id, day: today },
          select: { ml: true },
        }),
        // VITALS — the readiness-feeding window (same shape as /api/readiness).
        db.bodyMetric.findMany({
          where: {
            hunterId: hunter.id,
            type: { in: [...READINESS_METRIC_TYPES] },
            day: { gte: since },
          },
          select: { day: true, type: true, value: true },
        }),
        // RECORDS — cleared raids this ISO week + lifetime PR ledger size.
        db.workoutSession.count({
          where: {
            hunterId: hunter.id,
            status: "cleared",
            startedAt: { gte: weekStartInstant },
          },
        }),
        db.personalBest.count({ where: { hunterId: hunter.id } }),
      ])

    // ── FUEL totals (honest: no food rows today → loggedToday false, kcal null) ──
    const loggedToday = foodRows.length > 0
    const todayKcal = loggedToday
      ? Math.round(foodRows.reduce((sum, r) => sum + (r.calories ?? 0), 0))
      : null
    const todayProteinG = loggedToday
      ? Math.round(foodRows.reduce((sum, r) => sum + (r.protein ?? 0), 0))
      : null
    const waterMl = waterRows.reduce((sum, r) => sum + r.ml, 0)

    // ── VITALS — today's readiness via the SAME pipeline as /api/readiness ──
    const rowsOf = (type: string): DayValue[] =>
      vitalRows.filter((r) => r.type === type).map((r) => ({ day: r.day, value: r.value }))
    const valueOn = (rows: DayValue[], day: string): number | null =>
      rows.find((r) => r.day === day)?.value ?? null

    const sleepRows = rowsOf("sleep")
    const rhrRows = rowsOf("restingHr")
    const moodRows = rowsOf("mood")
    const energyRows = rowsOf("energy")
    const hrvRows = rowsOf("hrv")

    const rhrToday = valueOn(rhrRows, today)
    const rhrBaseline = rhrBaselineFromRows(rhrRows, today)
    const rhrDeviation =
      rhrToday !== null && rhrBaseline !== null
        ? Math.round((rhrToday - rhrBaseline) * 10) / 10
        : null

    // HRV suppression — single source: the same hrvTrainingModulation call the
    // readiness route makes; pctDeviation rides the modulation object so the
    // two endpoints can never disagree.
    const hrvBaseline = hrvBaselineFromRows(hrvRows, today)
    const hrvRecent = hrvRows
      .filter((r) => {
        const diff = Math.round(
          (new Date(`${r.day}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
            86400000
        )
        return diff >= -2 && diff <= 0
      })
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    const hrvMs = hrvRecent.length > 0 ? hrvRecent[0].value : null
    const hrvPctDeviation = hrvTrainingModulation(hrvMs, hrvBaseline)?.pctDeviation ?? null

    const readiness = readinessScore({
      sleepHours: valueOn(sleepRows, today),
      rhrDeviation,
      hrvPctDeviation,
      mood: valueOn(moodRows, today),
      energy: valueOn(energyRows, today),
    })

    const res: DestinationsDTO = {
      body: {
        latestMassKg: massRow ? Math.round(massRow.value * 10) / 10 : null,
        latestMassDay: massRow?.day ?? null,
        activeTargets,
      },
      fuel: { loggedToday, todayKcal, todayProteinG, waterMl },
      vitals: {
        checkedInToday: vitalRows.some((r) => r.day === today),
        readiness: readiness ? { score: readiness.score, band: readiness.band } : null,
      },
      records: { prCount, sessionsThisWeek: weekSessions },
    }
    return NextResponse.json(res)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/destinations", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
