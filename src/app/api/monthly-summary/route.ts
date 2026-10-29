import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKey, dayKeyIn, keyBefore, tzDayWindow } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import { rhrBaselineFromRows, readinessScore, type DayValue } from "@/lib/health"

export const dynamic = "force-dynamic"

// ─── /api/monthly-summary ─────────────────────────────────────────────────────
// GET → 30-day rolling window ending today vs the prior 30-day window.
// Every number is an honest zero when nothing happened — nothing is fabricated.

const WINDOW_DAYS = 30

// The vitals that feed readiness — logged as one-per-type-per-day BodyMetric rows.
const READINESS_METRIC_TYPES = ["sleep", "restingHr", "mood", "energy"] as const

/** yyyy-mm-dd of n days ago in the hunter's timezone.
 *  R68 — DST-safe keyBefore chain off the hunter's today (audit 2-a B3:
 *  the windows must cover the same days /api/metrics + /api/nutrition write). */
function dayOffsetAgo(tz: string | null, n: number): string {
  let key = dayKeyIn(tz)
  for (let i = 0; i < n; i++) key = keyBefore(key)
  return key
}

type WindowStats = {
  sessions: number
  xp: number
  volumeKg: number
  minutes: number
  cardioMin: number
  prsSet: number
  activeDays: number
  avgReadiness: number | null
}

function emptyStats(): WindowStats {
  return {
    sessions: 0,
    xp: 0,
    volumeKg: 0,
    minutes: 0,
    cardioMin: 0,
    prsSet: 0,
    activeDays: 0,
    avgReadiness: null,
  }
}

/** True when day (yyyy-mm-dd) falls inside [from, to] inclusive. */
function inWindow(day: string, from: string, to: string): boolean {
  return day >= from && day <= to
}

/**
 * Mean daily readiness over a window, via the shared health.ts helpers.
 * Each day scores from that day's vitals (RHR deviation vs the prior-7-day
 * baseline); days with no computable score are skipped, never faked.
 * Returns null when no day in the window produces a score.
 */
function avgReadinessInWindow(
  vitalRows: { day: string; type: string; value: number }[],
  from: string,
  to: string
): number | null {
  const rowsOf = (type: string): DayValue[] =>
    vitalRows.filter((r) => r.type === type).map((r) => ({ day: r.day, value: r.value }))
  const sleepRows = rowsOf("sleep")
  const rhrRows = rowsOf("restingHr")
  const moodRows = rowsOf("mood")
  const energyRows = rowsOf("energy")

  const valueOn = (rows: DayValue[], day: string): number | null =>
    rows.find((r) => r.day === day)?.value ?? null

  const scores: number[] = []
  for (let d = new Date(`${from}T00:00:00`); dayKey(d) <= to; d.setDate(d.getDate() + 1)) {
    const day = dayKey(d)
    const sleepToday = valueOn(sleepRows, day)
    const rhrToday = valueOn(rhrRows, day)
    const moodToday = valueOn(moodRows, day)
    const energyToday = valueOn(energyRows, day)
    if (sleepToday === null && rhrToday === null && moodToday === null && energyToday === null) continue

    const baseline = rhrBaselineFromRows(rhrRows, day)
    const rhrDeviation =
      rhrToday !== null && baseline !== null ? Math.round((rhrToday - baseline) * 10) / 10 : null

    const view = readinessScore({
      sleepHours: sleepToday,
      rhrDeviation,
      mood: moodToday,
      energy: energyToday,
    })
    if (view) scores.push(view.score)
  }
  if (scores.length === 0) return null
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
}

// GET /api/monthly-summary — 30-day rolling digest vs the prior 30 days
export async function GET() {
  try {
    const hunter = await requireHunter()

    // R68 — the rolling windows roll with the hunter's midnight (null tz =
    // legacy server-local day), and instant → day-key conversions format in
    // the hunter's zone so midnight-adjacent sessions/PRs bucket into the
    // window the hunter actually lived (audit 2-a B3).
    const tz = hunter.timezone
    // current window = [today-29, today] · prior window = [today-59, today-30]
    const curFrom = dayOffsetAgo(tz, WINDOW_DAYS - 1)
    const curTo = dayKeyIn(tz)
    const prevFrom = dayOffsetAgo(tz, 2 * WINDOW_DAYS - 1)
    const prevTo = dayOffsetAgo(tz, WINDOW_DAYS)
    // DST-correct UTC instant of the prior window's first midnight — the
    // boss-route idiom for "instants from a day key" queries.
    const prevFromInstant = tzDayWindow(prevFrom, tz).start

    const [events, sessions, cardioLogs, prs, vitalRows] = await Promise.all([
      db.xpEvent.findMany({
        where: { hunterId: hunter.id, day: { gte: prevFrom } },
        select: { day: true, amount: true },
      }),
      db.workoutSession.findMany({
        where: { hunterId: hunter.id, status: "cleared", startedAt: { gte: prevFromInstant } },
        select: { startedAt: true, xpEarned: true, volumeKg: true, durationMin: true },
      }),
      db.exerciseLog.findMany({
        where: {
          session: { hunterId: hunter.id, status: "cleared", startedAt: { gte: prevFromInstant } },
          type: "cardio",
        },
        select: { durationMin: true, session: { select: { startedAt: true } } },
      }),
      db.personalBest.findMany({
        where: { hunterId: hunter.id, updatedAt: { gte: prevFromInstant } },
        select: { updatedAt: true },
      }),
      // +7 days before the prior window so its first days get an RHR baseline
      db.bodyMetric.findMany({
        where: {
          hunterId: hunter.id,
          type: { in: [...READINESS_METRIC_TYPES] },
          day: { gte: dayOffsetAgo(tz, 2 * WINDOW_DAYS + 6) },
        },
        select: { day: true, type: true, value: true },
      }),
    ])

    const cur = emptyStats()
    const prev = emptyStats()

    // XP ledger + active days (any day with XP earned — same rule as /api/chronicle)
    const xpByDayCur = new Map<string, number>()
    const xpByDayPrev = new Map<string, number>()
    for (const ev of events) {
      const isCur = inWindow(ev.day, curFrom, curTo)
      if (!isCur && !inWindow(ev.day, prevFrom, prevTo)) continue
      const map = isCur ? xpByDayCur : xpByDayPrev
      map.set(ev.day, (map.get(ev.day) ?? 0) + ev.amount)
    }
    cur.xp = [...xpByDayCur.values()].reduce((a, b) => a + b, 0)
    prev.xp = [...xpByDayPrev.values()].reduce((a, b) => a + b, 0)
    cur.activeDays = [...xpByDayCur.values()].filter((v) => v > 0).length
    prev.activeDays = [...xpByDayPrev.values()].filter((v) => v > 0).length

    for (const s of sessions) {
      const d = dayKeyIn(tz, s.startedAt)
      const isCur = inWindow(d, curFrom, curTo)
      if (!isCur && !inWindow(d, prevFrom, prevTo)) continue
      const w = isCur ? cur : prev
      w.sessions += 1
      w.volumeKg += s.volumeKg
      w.minutes += s.durationMin
    }
    cur.volumeKg = Math.round(cur.volumeKg)
    prev.volumeKg = Math.round(prev.volumeKg)

    for (const l of cardioLogs) {
      const d = dayKeyIn(tz, l.session.startedAt)
      const isCur = inWindow(d, curFrom, curTo)
      if (!isCur && !inWindow(d, prevFrom, prevTo)) continue
      ;(isCur ? cur : prev).cardioMin += l.durationMin
    }

    for (const p of prs) {
      const d = dayKeyIn(tz, p.updatedAt)
      if (inWindow(d, curFrom, curTo)) cur.prsSet += 1
      else if (inWindow(d, prevFrom, prevTo)) prev.prsSet += 1
    }

    cur.avgReadiness = avgReadinessInWindow(vitalRows, curFrom, curTo)
    prev.avgReadiness = avgReadinessInWindow(vitalRows, prevFrom, prevTo)

    // most profitable day of the current window (XP ledger, > 0)
    let bestDay: { day: string; xp: number } | null = null
    for (const [day, xp] of xpByDayCur) {
      if (xp > 0 && (!bestDay || xp > bestDay.xp)) bestDay = { day, xp }
    }

    return NextResponse.json({
      window: { from: curFrom, to: curTo },
      sessions: cur.sessions,
      xp: cur.xp,
      volumeKg: cur.volumeKg,
      minutes: cur.minutes,
      cardioMin: cur.cardioMin,
      prsSet: cur.prsSet,
      activeDays: cur.activeDays,
      avgReadiness: cur.avgReadiness,
      // additive: prior-window readiness average (null-safe delta chip on the client)
      avgReadinessPrev: prev.avgReadiness,
      bestDay,
      deltas: {
        sessions: cur.sessions - prev.sessions,
        xp: cur.xp - prev.xp,
        volumeKg: cur.volumeKg - prev.volumeKg,
        minutes: cur.minutes - prev.minutes,
        prsSet: cur.prsSet - prev.prsSet,
      },
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/monthly-summary", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
