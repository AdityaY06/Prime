import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn, keyBefore, tzDayWindow, weekStartKeyIn } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import {
  hrvBaselineFromRows,
  hrvTrainingModulation,
  rhrBaselineFromRows,
  rhrTrendFromRows,
  readinessScore,
  type DayValue,
  type NextDayView,
  type ReadinessRes,
} from "@/lib/health"

export const dynamic = "force-dynamic"

// The vitals that feed readiness — logged as one-per-type-per-day BodyMetric rows.
// "hrv" (rMSSD, ms) feeds the R29-b training-modulation strip, not the score.
const READINESS_METRIC_TYPES = ["sleep", "restingHr", "mood", "energy", "hrv"] as const

/** Minimal plan-day shape read out of Program.plan (guarded parse). */
type PlanDay = { day: number; focus: string }

/** R68 — hunter-tz day key N calendar days before the hunter's today
 *  (DST-safe keyBefore chain — the /api/nutrition history idiom). */
function dayAgoKey(tz: string | null, n: number): string {
  let key = dayKeyIn(tz)
  for (let i = 0; i < n; i++) key = keyBefore(key)
  return key
}

function parsePlanDays(planJson: string | null | undefined): PlanDay[] | null {
  if (!planJson) return null
  try {
    const parsed: unknown = JSON.parse(planJson)
    if (!parsed || typeof parsed !== "object") return null
    const days = (parsed as { days?: unknown }).days
    if (!Array.isArray(days) || days.length === 0) return null
    const out: PlanDay[] = []
    for (const d of days) {
      if (!d || typeof d !== "object") continue
      const day = Number((d as { day?: unknown }).day)
      if (!Number.isInteger(day) || day < 1) continue
      const focus = (d as { focus?: unknown }).focus
      out.push({ day, focus: typeof focus === "string" ? focus : "" })
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

// ─── GET /api/readiness — composite daily readiness + week + next program day ──
export async function GET() {
  try {
    const hunter = await requireHunter()
    // R68 — "today" rolls at the hunter's midnight (null tz = legacy
    // server-local day), matching how /api/metrics WRITES the BodyMetric
    // day keys read below (audit 2-a B3: the server-local key read the
    // wrong day's vitals — or honest-nulls — in the daily window).
    const today = dayKeyIn(hunter.timezone)
    // today−7 covers the prior-7-day baseline window (today excluded) in one query.
    const since = dayAgoKey(hunter.timezone, 7)
    // R68 — the week window is hunter-tz Monday (tzDayWindow gives the
    // DST-correct UTC instant of that Monday's midnight — the boss-route idiom).
    const weekStart = weekStartKeyIn(hunter.timezone)
    const weekStartInstant = tzDayWindow(weekStart, hunter.timezone).start

    const [vitalRows, weekSessions, program] = await Promise.all([
      db.bodyMetric.findMany({
        where: {
          hunterId: hunter.id,
          type: { in: [...READINESS_METRIC_TYPES] },
          day: { gte: since },
        },
        select: { day: true, type: true, value: true },
      }),
      db.workoutSession.findMany({
        where: {
          hunterId: hunter.id,
          status: "cleared",
          startedAt: { gte: weekStartInstant },
        },
        select: { programDay: true },
      }),
      db.program.findFirst({
        where: { hunterId: hunter.id, active: true },
        orderBy: { createdAt: "desc" },
      }),
    ])

    // ── readiness + rhrTrend from the latest day's vitals ──
    const rowsOf = (type: string): DayValue[] =>
      vitalRows.filter((r) => r.type === type).map((r) => ({ day: r.day, value: r.value }))
    const sleepRows = rowsOf("sleep")
    const rhrRows = rowsOf("restingHr")
    const moodRows = rowsOf("mood")
    const energyRows = rowsOf("energy")

    const valueOn = (rows: DayValue[], day: string): number | null =>
      rows.find((r) => r.day === day)?.value ?? null

    const sleepToday = valueOn(sleepRows, today)
    const rhrToday = valueOn(rhrRows, today)
    const moodToday = valueOn(moodRows, today)
    const energyToday = valueOn(energyRows, today)

    const rhrTrend = rhrTrendFromRows(rhrRows, today)
    const rhrBaseline = rhrBaselineFromRows(rhrRows, today)
    const rhrDeviation =
      rhrToday !== null && rhrBaseline !== null ? Math.round((rhrToday - rhrBaseline) * 10) / 10 : null

    // ── HRV training modulation (R29-b) — rMSSD vs the prior-7-day baseline ──
    // R39: the baseline now comes from the HRV-named twin (identical ≥3-of-7
    // rolling mean over DayValue[]) — the borrowed rhrBaselineFromRows name
    // compiled but lied about which vital it measured. Latest mirrors the
    // rhrTrendFromRows recency rule — the most recent reading ≤2 days old, so
    // stale rows honestly yield null. The band decision is computed HERE (one
    // site) via the pure hrvTrainingModulation; the client only renders. Pct
    // deviation rides the modulation object so the two numbers can never
    // disagree.
    const hrvRows = rowsOf("hrv")
    const hrvBaseline = hrvBaselineFromRows(hrvRows, today)
    const hrvRecent = hrvRows
      .filter((r) => {
        const diff = Math.round(
          (new Date(`${r.day}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000
        )
        return diff >= -2 && diff <= 0
      })
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    const hrvMs = hrvRecent.length > 0 ? hrvRecent[0].value : null
    const hrvModulation = hrvTrainingModulation(hrvMs, hrvBaseline)
    const hrvPctDeviation = hrvModulation?.pctDeviation ?? null

    const readiness = readinessScore({
      sleepHours: sleepToday,
      rhrDeviation,
      // R39 — the documented R24-a design made real: substantial HRV
      // suppression (≤−20% vs baseline) costs 10 readiness points via
      // health.ts hrvContribution. Same number the response exposes — one
      // source, no double count.
      hrvPctDeviation,
      mood: moodToday,
      energy: energyToday,
    })

    // ── week compliance (free sessions count toward done) ──
    const week = { planned: program?.days ?? 0, done: weekSessions.length }

    // ── next untrained program day this week ──
    let nextDay: NextDayView | null = null
    if (program) {
      const planDays = parsePlanDays(program.plan)
      if (planDays) {
        const daysDone = [
          ...new Set(weekSessions.map((s) => s.programDay).filter((d): d is number => d !== null)),
        ].sort((a, b) => a - b)
        const next = planDays
          .filter((p) => !daysDone.includes(p.day))
          .sort((a, b) => a.day - b.day)[0]
        if (next) {
          nextDay = {
            day: next.day,
            focus: next.focus,
            reason: daysDone.length === 0 ? "NOT YET TRAINED THIS WEEK" : "NEXT UNTRAINED DAY",
            daysDone,
            allDone: false,
          }
        } else {
          nextDay = {
            day: null,
            focus: "",
            reason: "ALL PROGRAM DAYS CLEARED THIS WEEK — REGENERATE OR REST",
            daysDone,
            allDone: true,
          }
        }
      }
      // plan corrupt/unparseable → nextDay stays null (honest, null-safe)
    }

    const res: ReadinessRes = { readiness, rhrTrend, week, nextDay, hrvMs, hrvPctDeviation, hrvModulation }
    return NextResponse.json(res)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/readiness", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
