import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { dayKeyIn, keyBefore, sessionVolume, tzDayWindow, weekStartKeyIn } from "@/lib/game"
import { readinessScore } from "@/lib/health"
import { epleyE1rm, progressionKey, validE1rmSet } from "@/lib/progression"
import type { BodyMetric } from "@prisma/client"

export const dynamic = "force-dynamic"

// ─── /api/weekly-review — week-to-date review card (STATUS tab) ────────────────
// One GET, everything scoped to the current Monday-based ISO week:
//   xpEarned          — sum of the XP ledger since Monday (all sources)
//   sessionsCleared   — cleared sessions started since Monday
//   programDays       — distinct cleared program-day numbers vs active plan days
//   readinessAvg      — mean of per-day readiness scores (only days with fresh
//                       vitals; /api/readiness math evaluated as of that day)
//   bestE1rmDeltas    — per loaded exercise: best e1RM this week vs best before
//   topGate           — most-cleared gate this week
//   streakNow         — live streak
//   volumeKg          — total volume of this week's cleared-session logs (the
//                       same strength-only sets×reps×weight accounting
//                       session.volumeKg / hunter.totalVolumeKg use)
//   lastWeek          — the SAME stats for the previous ISO week (Task 20-a:
//                       additive; `streakNow` is a live property and cannot be
//                       reconstructed for a past week, so it is omitted there.
//                       `programDays.planned` reads the ACTIVE program — plan
//                       history is not retained, so last week's "planned" is
//                       the current plan, while "done" is honest from sessions.)
// Everything is honest-null/empty when a week has no data.

const READINESS_TYPES = ["restingHr", "hrv", "sleep", "stress", "mood", "energy"] as const

/** Only loaded strength/bodyweight work carries e1RM meaning (progression.ts rule). */
const LOADED_TYPES = new Set(["strength", "bodyweight"])

type E1rmDelta = { name: string; delta: number }

/** Stats shared by the current and previous ISO week. */
type WeekStats = {
  weekStart: string
  xpEarned: number
  sessionsCleared: number
  programDays: { done: number; planned: number | null }
  readinessAvg: number | null
  readinessDays: number
  bestE1rmDeltas: E1rmDelta[]
  topGate: { name: string; count: number } | null
  volumeKg: number
}

type WeeklyReviewRes = WeekStats & {
  streakNow: number
  lastWeek: WeekStats
}

// ── readiness helpers (mirror /api/readiness trendVsBaseline, evaluated per day) ──

/**
 * The /api/readiness deviation math as of a reference day: latest value on or
 * before `day`, minus the mean of up to 7 prior distinct days (≥3 needed).
 * Null when no such latest value or the baseline is still building.
 */
function deviationAsOf(rows: BodyMetric[], day: string): number | null {
  const sorted = [...rows].sort(
    (a, b) => a.day.localeCompare(b.day) || a.updatedAt.getTime() - b.updatedAt.getTime()
  )
  const upto = sorted.filter((r) => r.day <= day)
  if (upto.length === 0) return null
  const latest = upto[upto.length - 1]
  const prior = upto.slice(-8, -1)
  if (prior.length < 3) return null
  const baseline = Math.round((prior.reduce((acc, m) => acc + m.value, 0) / prior.length) * 10) / 10
  return Math.round((latest.value - baseline) * 10) / 10
}

/** Latest value of one metric type on or before `day` (null when never logged). */
function latestAsOf(rows: BodyMetric[], day: string): number | null {
  const sorted = [...rows].sort(
    (a, b) => a.day.localeCompare(b.day) || a.updatedAt.getTime() - b.updatedAt.getTime()
  )
  const upto = sorted.filter((r) => r.day <= day)
  return upto.length === 0 ? null : upto[upto.length - 1].value
}

/**
 * HRV % deviation as of a reference day — the /api/readiness route's math
 * evaluated in the past: latest value on or before `day` vs the mean of up to
 * 7 prior distinct days (≥3 needed), in PERCENT (the Plews idiom — the same
 * shape coach/route.ts computes for today). Null when either half is missing
 * or the baseline is non-positive. R39: replaced the pre-R24-a absolute-deviation
 * input with the pct form readinessScore actually declares.
 */
function pctDeviationAsOf(rows: BodyMetric[], day: string): number | null {
  const sorted = [...rows].sort(
    (a, b) => a.day.localeCompare(b.day) || a.updatedAt.getTime() - b.updatedAt.getTime()
  )
  const upto = sorted.filter((r) => r.day <= day)
  if (upto.length === 0) return null
  const latest = upto[upto.length - 1]
  const prior = upto.slice(-8, -1)
  if (prior.length < 3) return null
  const baseline = prior.reduce((acc, m) => acc + m.value, 0) / prior.length
  if (baseline <= 0) return null
  return Math.round(((latest.value - baseline) / baseline) * 1000) / 10
}

/**
 * Mean readiness score over a week's days that logged fresh vitals.
 * `until` (exclusive, yyyy-mm-dd) bounds the window so a PAST week only reads
 * its own days — omitted for the current week, which is open-ended to today.
 */
function weeklyReadinessAvg(
  metrics: BodyMetric[],
  weekStart: string,
  until?: string
): { avg: number | null; days: number } {
  const byType = new Map<string, BodyMetric[]>()
  for (const m of metrics) {
    const arr = byType.get(m.type)
    if (arr) arr.push(m)
    else byType.set(m.type, [m])
  }

  // days of THIS week's window with at least one fresh readiness-type reading
  const days = [
    ...new Set(
      metrics
        .filter((m) => m.day >= weekStart && (until === undefined || m.day < until))
        .map((m) => m.day)
    ),
  ].sort()
  const scores: number[] = []
  for (const day of days) {
    const view = readinessScore({
      sleepHours: latestAsOf(byType.get("sleep") ?? [], day),
      rhrDeviation: deviationAsOf(byType.get("restingHr") ?? [], day),
      hrvPctDeviation: pctDeviationAsOf(byType.get("hrv") ?? [], day),
      mood: latestAsOf(byType.get("mood") ?? [], day),
      energy: latestAsOf(byType.get("energy") ?? [], day),
    })
    // a day with a fresh reading always feeds ≥1 component — readinessScore
    // returns null ONLY on total absence (its own honesty contract)
    if (view) scores.push(view.score)
  }
  if (scores.length === 0) return { avg: null, days: 0 }
  return { avg: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10, days: scores.length }
}

type FlatLog = { name: string; type: string; sets: number; weightKg: number; reps: number; day: string }

/**
 * Per-exercise e1RM delta: best inside the window vs best before it.
 * `until` (exclusive) bounds the window's upper edge for past weeks —
 * omitted for the current week (open-ended to today).
 */
function e1rmDeltas(logs: FlatLog[], weekStart: string, until?: string): E1rmDelta[] {
  const groups = new Map<string, FlatLog[]>()
  for (const l of logs) {
    // R68 — validE1rmSet subsumes the weight/reps positivity guards and adds
    // Epley's 1-12 rep domain: a 13+ rep set has no honest e1RM, so it never
    // enters either side of a delta (a group left with no valid sets on a
    // side skips below — the existing honest-skip path).
    if (!LOADED_TYPES.has(l.type.toLowerCase()) || !validE1rmSet(l.reps, l.weightKg)) continue
    const key = progressionKey(l.name)
    if (!key) continue
    const arr = groups.get(key)
    if (arr) arr.push(l)
    else groups.set(key, [l])
  }

  const deltas: E1rmDelta[] = []
  for (const groupLogs of groups.values()) {
    const inWeek = groupLogs.filter((l) => l.day >= weekStart && (until === undefined || l.day < until))
    const before = groupLogs.filter((l) => l.day < weekStart)
    if (inWeek.length === 0 || before.length === 0) continue // needs both sides for an honest delta
    let bestNow = -Infinity
    let bestBefore = -Infinity
    let name = inWeek[inWeek.length - 1].name
    for (const l of inWeek) {
      // epleyE1rm guards internally (0 for weight ≤0 / reps <1) — the loop's
      // own prefilter already guarantees a valid 1-12 rep loaded set here (R68)
      const v = epleyE1rm(l.weightKg, l.reps)
      if (v > bestNow) {
        bestNow = v
        name = l.name
      }
    }
    for (const l of before) {
      const v = epleyE1rm(l.weightKg, l.reps)
      if (v > bestBefore) bestBefore = v
    }
    if (bestNow === -Infinity || bestBefore === -Infinity) continue
    deltas.push({ name, delta: Math.round((bestNow - bestBefore) * 10) / 10 })
  }

  deltas.sort((a, b) => b.delta - a.delta)
  return deltas.slice(0, 4)
}

/** Total volume (kg) of a week's cleared-session logs — sessionVolume semantics. */
function weekVolumeKg(logs: FlatLog[], weekStart: string, until?: string): number {
  return Math.round(
    sessionVolume(logs.filter((l) => l.day >= weekStart && (until === undefined || l.day < until)))
  )
}

/** Most-cleared gate of a week's session list (stable tie-break: first seen). */
function topGateOf(sessions: { gateId: string; gateName: string }[]): { name: string; count: number } | null {
  let top: { name: string; count: number } | null = null
  const counts = new Map<string, { name: string; count: number }>()
  for (const s of sessions) {
    const cur = counts.get(s.gateId)
    if (cur) cur.count++
    else counts.set(s.gateId, { name: s.gateName, count: 1 })
  }
  for (const g of counts.values()) {
    if (!top || g.count > top.count) top = g
  }
  return top
}

/** Distinct cleared program-day numbers of a week's session list. */
function distinctProgramDays(sessions: { programDay: number | null }[]): number {
  return new Set(sessions.map((s) => s.programDay).filter((d): d is number => d !== null)).size
}

/** R69 — week-start key 7 calendar days earlier (DST-safe keyBefore chain —
 *  the /api/readiness R68 dayAgoKey idiom; pure string arithmetic). */
function weekStartAgo(weekStart: string): string {
  let key = weekStart
  for (let i = 0; i < 7; i++) key = keyBefore(key)
  return key
}

export async function GET() {
  try {
    const hunter = await requireHunter()
    // R69 — the week window rolls with the hunter's timezone (audit 2-a B3
    // residual; the /api/readiness R68 idiom): hunter-tz Monday key + the
    // DST-correct UTC instant of that Monday's midnight. Null timezone falls
    // back to legacy server-local behavior per dayKeyIn's contract (the
    // xpEvent/metric day keys compared below are hunter-tz rows since R38).
    const weekStart = weekStartKeyIn(hunter.timezone)
    const weekStartAt = tzDayWindow(weekStart, hunter.timezone).start

    // previous ISO week — this week's Monday minus 7 calendar days (DST-safe
    // keyBefore chain on the week-start KEY, never instants)
    const lastWeekStart = weekStartAgo(weekStart)
    const lastWeekStartAt = tzDayWindow(lastWeekStart, hunter.timezone).start

    const [xpSum, lastXpSum, weekSessions, lastWeekSessions, activeProgram, metrics, exLogs] =
      await Promise.all([
        db.xpEvent.aggregate({
          where: { hunterId: hunter.id, day: { gte: weekStart } },
          _sum: { amount: true },
        }),
        db.xpEvent.aggregate({
          where: { hunterId: hunter.id, day: { gte: lastWeekStart, lt: weekStart } },
          _sum: { amount: true },
        }),
        db.workoutSession.findMany({
          where: { hunterId: hunter.id, status: "cleared", startedAt: { gte: weekStartAt } },
          select: { gateId: true, gateName: true, programDay: true },
        }),
        db.workoutSession.findMany({
          where: {
            hunterId: hunter.id,
            status: "cleared",
            startedAt: { gte: lastWeekStartAt, lt: weekStartAt },
          },
          select: { gateId: true, gateName: true, programDay: true },
        }),
        db.program.findFirst({
          where: { hunterId: hunter.id, active: true },
          orderBy: { createdAt: "desc" },
          select: { days: true },
        }),
        db.bodyMetric.findMany({
          where: { hunterId: hunter.id, type: { in: [...READINESS_TYPES] } },
        }),
        db.exerciseLog.findMany({
          where: { session: { hunterId: hunter.id, status: "cleared" } },
          select: {
            name: true,
            type: true,
            sets: true,
            weightKg: true,
            reps: true,
            session: { select: { startedAt: true } },
          },
        }),
      ])

    // flat log view (day = session start day) shared by both weeks' e1RM + volume
    // R69 — session-start day keys roll with the hunter's timezone so the
    // `l.day >= weekStart` string comparisons run in the SAME calendar system
    // as the hunter-tz week keys above (a server-local key near midnight would
    // fall outside the week the hunter actually trained in).
    const flatLogs: FlatLog[] = exLogs.map((l) => ({
      name: l.name,
      type: l.type,
      sets: l.sets,
      weightKg: l.weightKg,
      reps: l.reps,
      day: dayKeyIn(hunter.timezone, l.session.startedAt),
    }))

    const readinessAvg = weeklyReadinessAvg(metrics, weekStart)
    const lastReadinessAvg = weeklyReadinessAvg(metrics, lastWeekStart, weekStart)

    const lastWeek: WeekStats = {
      weekStart: lastWeekStart,
      xpEarned: lastXpSum._sum.amount ?? 0,
      sessionsCleared: lastWeekSessions.length,
      programDays: {
        done: distinctProgramDays(lastWeekSessions),
        planned: activeProgram?.days ?? null,
      },
      readinessAvg: lastReadinessAvg.avg,
      readinessDays: lastReadinessAvg.days,
      bestE1rmDeltas: e1rmDeltas(flatLogs, lastWeekStart, weekStart),
      topGate: topGateOf(lastWeekSessions),
      volumeKg: weekVolumeKg(flatLogs, lastWeekStart, weekStart),
    }

    // current week — key order + computation byte-identical to the pre-20-a
    // response, with the new volumeKg + lastWeek keys appended additively
    const res: WeeklyReviewRes = {
      weekStart,
      xpEarned: xpSum._sum.amount ?? 0,
      sessionsCleared: weekSessions.length,
      programDays: {
        done: distinctProgramDays(weekSessions),
        planned: activeProgram?.days ?? null,
      },
      readinessAvg: readinessAvg.avg,
      readinessDays: readinessAvg.days,
      bestE1rmDeltas: e1rmDeltas(flatLogs, weekStart),
      topGate: topGateOf(weekSessions),
      streakNow: hunter.streak,
      volumeKg: weekVolumeKg(flatLogs, weekStart),
      lastWeek,
    }

    return NextResponse.json(res)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/weekly-review", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
