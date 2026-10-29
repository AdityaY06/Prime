import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn, keyBefore } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import { buildLoadView, strainBand } from "@/lib/load"
import {
  hrvBaselineFromRows,
  rhrBaselineFromRows,
  readinessScore,
  sleep7dAvgFromRows,
  type DayValue,
} from "@/lib/health"
import { coachDirective, type CoachInput } from "@/lib/coach"

export const dynamic = "force-dynamic"

// GET /api/coach — the Strain Coach directive (R23-b).
//
// The coach assembles its inputs from the EXISTING load + readiness query
// patterns — zero new tables, zero new query shapes (two reads, parallelized
// like /api/readiness does):
//   · sessions: the /api/load route's findMany (logs included), with status
//     kept in the result so the week-shape counts can separate attempts from
//     cleared work; the load view itself consumes ONLY status "cleared" rows
//     (same exclusion rule as /api/load — abandoned/active carry no completed
//     work and must never inflate the load model).
//   · vitals: the /api/readiness route's 8-day BodyMetric window over
//     READINESS_METRIC_TYPES (R24-a: + "hrv"), with the EXACT same
//     readiness/RHR-deviation/HRV-percent-deviation computation
//     (rhrBaselineFromRows + today-vs-baseline; hrvBaselineFromRows +
//     today-vs-baseline in PERCENT), plus sleep7dAvgFromRows for the
//     sleep-debt line (today's sleep vs the 7-day mean — the demonstrated
//     need, mirroring the RHR deviation idiom).
// GET-only and read-only: the directive recomputes with every session and
// check-in, so no state is stored.

// The vitals that feed readiness — logged as one-per-type-per-day BodyMetric
// rows (mirrors the readiness route, incl. the R24-a "hrv" addition).
const READINESS_METRIC_TYPES = ["sleep", "restingHr", "mood", "energy", "hrv"] as const

/** R68 — hunter-tz day key N calendar days before the hunter's today
 *  (DST-safe keyBefore chain — the /api/nutrition history idiom). */
function dayAgoKey(tz: string | null, n: number): string {
  let key = dayKeyIn(tz)
  for (let i = 0; i < n; i++) key = keyBefore(key)
  return key
}

export async function GET() {
  try {
    const hunter = await requireHunter()
    // R68 — "today" rolls at the hunter's midnight (null tz = legacy
    // server-local day), matching how /api/metrics WRITES the BodyMetric
    // day keys read below (audit 2-a B3 — same fix as the readiness route).
    const today = dayKeyIn(hunter.timezone)
    // today−7 covers the prior-7-day baseline window (today excluded) in one
    // query — identical to the readiness route's window.
    const since = dayAgoKey(hunter.timezone, 7)
    // Rolling 7×24h instant window — timezone-independent by construction
    // (168 h ago is 168 h ago in every zone), so no tz conversion here.
    const sessionsSince = new Date(Date.now() - 7 * 86400000)

    const [sessions, vitalRows] = await Promise.all([
      db.workoutSession.findMany({
        where: { hunterId: hunter.id },
        include: {
          logs: { select: { type: true, sets: true, reps: true, durationMin: true, rir: true } },
        },
        orderBy: { startedAt: "asc" },
      }),
      db.bodyMetric.findMany({
        where: {
          hunterId: hunter.id,
          type: { in: [...READINESS_METRIC_TYPES] },
          day: { gte: since },
        },
        select: { day: true, type: true, value: true },
      }),
    ])

    // ── load pieces — identical inputs to GET /api/load (cleared rows only);
    //    R69 — day buckets roll with the hunter's timezone (same tz param as
    //    /api/load; null tz = legacy server-local fallback) ──
    const cleared = sessions.filter((s) => s.status === "cleared")
    const loadView = buildLoadView(cleared, new Date(), hunter.timezone)

    // ── week shape — attempts vs completed work over the last 7 days ──
    const last7 = sessions.filter((s) => s.startedAt >= sessionsSince)
    const sessionsLast7Days = last7.length
    const clearedSessionsLast7Days = last7.filter((s) => s.status === "cleared").length

    // ── readiness pieces — the /api/readiness route's exact computation ──
    const rowsOf = (type: string): DayValue[] =>
      vitalRows.filter((r) => r.type === type).map((r) => ({ day: r.day, value: r.value }))
    const sleepRows = rowsOf("sleep")
    const rhrRows = rowsOf("restingHr")
    const moodRows = rowsOf("mood")
    const energyRows = rowsOf("energy")
    const hrvRows = rowsOf("hrv")

    const valueOn = (rows: DayValue[], day: string): number | null =>
      rows.find((r) => r.day === day)?.value ?? null

    const sleepToday = valueOn(sleepRows, today)
    const rhrToday = valueOn(rhrRows, today)
    const moodToday = valueOn(moodRows, today)
    const energyToday = valueOn(energyRows, today)
    const hrvToday = valueOn(hrvRows, today)

    const rhrBaseline = rhrBaselineFromRows(rhrRows, today)
    const rhrDeviation =
      rhrToday !== null && rhrBaseline !== null ? Math.round((rhrToday - rhrBaseline) * 10) / 10 : null

    // ── HRV percent deviation (R24-a) — the /api/readiness route's exact
    // computation: today's HRV vs the ≥3-day prior-7-day rolling baseline,
    // in PERCENT (the Plews idiom). Null when either half is missing — the
    // coach's HRV evidence row renders NOT LOGGED and no trigger fires.
    const hrvBaseline = hrvBaselineFromRows(hrvRows, today)
    const hrvPctDeviation =
      hrvToday !== null && hrvBaseline !== null && hrvBaseline > 0
        ? Math.round(((hrvToday - hrvBaseline) / hrvBaseline) * 1000) / 10
        : null

    const readiness = readinessScore({
      sleepHours: sleepToday,
      rhrDeviation,
      // R39 — hrvPctDeviation is now a declared ReadinessInput component
      // (hrvContribution: ≤−20% costs 10 points); raw hrvMs is not an input —
      // the ms value feeds the modulation + response objects instead.
      hrvPctDeviation,
      mood: moodToday,
      energy: energyToday,
    })

    // sleep debt — today's shortfall vs the 7-day mean sleep (sleep7dAvgFromRows
    // includes today, so a single logged day honestly yields zero debt).
    const sleep7dAvg = sleep7dAvgFromRows(sleepRows, today)
    const sleepDebtH =
      sleepToday !== null && sleep7dAvg !== null
        ? Math.round(Math.max(0, sleep7dAvg - sleepToday) * 10) / 10
        : null

    const input: CoachInput = {
      strain: loadView.todayStrain,
      strainBand: loadView.todayStrain === null ? null : strainBand(loadView.todayStrain),
      acwr: loadView.acwr,
      // INSUFFICIENT verdicts are absence, not claims — normalized to null.
      acwrVerdict: loadView.acwrVerdict === "INSUFFICIENT" ? null : loadView.acwrVerdict,
      tsb: loadView.tsb,
      tsbVerdict: loadView.tsbVerdict === "INSUFFICIENT" ? null : loadView.tsbVerdict,
      readinessBand: readiness?.band ?? null,
      sleepDebtH,
      rhrDeviation,
      hrvPctDeviation,
      sessionsLast7Days,
      clearedSessionsLast7Days,
    }

    return NextResponse.json({ directive: coachDirective(input), asOf: new Date().toISOString() })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("[api/coach]", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
