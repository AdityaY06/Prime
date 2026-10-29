import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn, keyBefore, weekStartKeyIn } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import { riftOfTheDay } from "@/lib/rift"
import { epleyE1rm, progressionKey, validE1rmSet } from "@/lib/progression"
import { rhrBaselineFromRows, readinessScore, type DayValue } from "@/lib/health"
import { SCIENCE_ENTRIES } from "@/lib/science"
import type { Hunter } from "@prisma/client"

export const dynamic = "force-dynamic"

/**
 * /api/oracle/tip?tab=… — the Oracle's per-tab micro-briefing.
 *
 * Deterministic, DB-driven, NO LLM: every number is derived from real queries
 * (nutrition today, body metrics + MetricGoal, vitals, program + week sessions,
 * quests, personal bests + 90-day logs). Unknown/absent tab → { tab, tip: null }.
 * Every tab's queries are individually guarded — on error the tip degrades to
 * null rather than lying. Tips are ≤ ~110 chars, mono/uppercase-friendly.
 *
 * Response contract (consumed by components/fitness/oracle-tip.tsx):
 *   { tab: string, tip: string | null, evidence: string | null }
 *
 * `evidence` (R6-b) is ONE ≤90-char science line tied to the tab's CURRENT
 * state — deterministic from the same queries already made (no new DB reads),
 * drawn from the approved citation pool (Robinson 2024, Schoenfeld 2016/2017,
 * Areta 2013, Morton 2018, Hirshkowitz 2015, ACSM, Ashwell) or a plain
 * principle without citation when the pool has no consensus claim. Guarded
 * per tab — degrades to null, never lies. Additive field: older consumers
 * (oracle-tip.tsx) simply ignore it.
 */

const TABS = ["status", "records", "directives", "fuel", "body", "vitals", "gates"] as const
type TabId = (typeof TABS)[number]

/** One tab's briefing — the micro-tip plus an optional evidence line (R6-b). */
type TabBriefing = { tip: string | null; evidence: string | null }

const DAY = 86400000

/** The vitals that feed readiness (mirrors /api/readiness). */
const READINESS_METRIC_TYPES = ["sleep", "restingHr", "mood", "energy"] as const

/** Goal metric display names + units (mirrors MetricGoal semantics). */
const GOAL_LABELS: Record<string, { label: string; unit: string }> = {
  weight: { label: "WEIGHT", unit: "KG" },
  chest: { label: "CHEST", unit: "CM" },
  waist: { label: "WAIST", unit: "CM" },
  hips: { label: "HIPS", unit: "CM" },
  arm: { label: "ARM", unit: "CM" },
  thigh: { label: "THIGH", unit: "CM" },
  calf: { label: "CALF", unit: "CM" },
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─── FUEL — today's macros + water vs honest targets ──────────────────────────

async function fuelTip(hunterId: string, today: string): Promise<TabBriefing> {
  const [logs, waterRows, weightRow] = await Promise.all([
    db.nutritionLog.findMany({
      where: { hunterId, day: today },
      select: { protein: true, carbs: true, fat: true },
    }),
    db.waterLog.findMany({ where: { hunterId, day: today }, select: { ml: true } }),
    db.bodyMetric.findFirst({
      where: { hunterId, type: "weight" },
      orderBy: { day: "desc" },
      select: { value: true },
    }),
  ])

  const protein = round1(logs.reduce((a, l) => a + l.protein, 0))
  const waterMl = Math.max(0, waterRows.reduce((a, w) => a + w.ml, 0))

  if (logs.length === 0 && waterMl === 0) {
    return {
      // R54-c4 declutter — the empty-state banner stands down to one quiet
      // sentence-case line (was "NO FUEL LOGGED TODAY — LOG MEALS TO SHARPEN
      // THE ORACLE'S READ"). Note: oracle-tip.tsx renders tips CSS-uppercased,
      // so the visible form is "NO FUEL LOGGED TODAY."; the aria-label and the
      // API payload carry the quiet phrasing.
      tip: "No fuel logged today.",
      evidence: "TOTAL DAILY PROTEIN 1.6-2.2 G/KG SUPPORTS GROWTH (MORTON 2018)",
    }
  }

  // protein target: latest weight × 1.8 g/kg (70 kg default when none logged)
  const proteinTarget = Math.round((weightRow?.value ?? 70) * 1.8)
  const waterTarget = 3000

  const proteinGap = Math.max(0, proteinTarget - protein)
  const waterGap = Math.max(0, waterTarget - waterMl)
  const proteinRel = proteinTarget > 0 ? proteinGap / proteinTarget : 0
  const waterRel = waterTarget > 0 ? waterGap / waterTarget : 0

  if (proteinGap === 0 && waterGap === 0) {
    return {
      // R7-c: "(ORACLE RULES)" — these are the oracle's own 1.8 g/kg + 3 L
      // heuristics, not the goal-aware targets the FUEL panel computes.
      tip: `FUEL ON TARGET (ORACLE RULES) · PROTEIN ${protein}/${proteinTarget} G · WATER ${(waterMl / 1000).toFixed(1)}/3.0 L — HOLD THE LINE`,
      evidence: "PROTEIN 1.6-2.2 G/KG DAILY IS THE SUPPORT ZONE (MORTON 2018)",
    }
  }

  if (proteinRel >= waterRel) {
    return {
      // R7-c: state the basis (1.8 g/kg) so the number never masquerades as
      // the goal-aware target the FUEL panel shows (cut/bulk splits differ).
      tip: `PROTEIN AT ${Math.round(protein)}/${proteinTarget} G (1.8 G/KG) — ${Math.round(proteinGap)} G SHORT · PRIORITIZE A PROTEIN MEAL NOW`,
      evidence: "EVEN PROTEIN DOSING ~4×/DAY BEATS ONE BIG HIT (ARETA 2013)",
    }
  }
  return {
    // R7-c: 3 L is the oracle's flat day rule — attributed, since the FUEL
    // panel computes a per-kg water target instead.
    tip: `WATER AT ${Math.round(waterMl)}/${waterTarget} ML — THE ORACLE'S 3 L RULE · +250 ML SOON`,
    evidence: "REPLACE SWEAT LOSS — DRINK BEYOND THIRST AFTER TRAINING",
  }
}

// ─── BODY — MetricGoal progress vs latest value ───────────────────────────────

/** Ashwell waist-to-height principle — only honest with a waist value in hand. */
const WAIST_EVIDENCE = "WAIST UNDER HALF YOUR HEIGHT MARKS LOW CARDIOMETABOLIC RISK (ASHWELL)"

async function bodyTip(hunterId: string): Promise<TabBriefing> {
  const goals = await db.metricGoal.findMany({ where: { hunterId }, orderBy: { createdAt: "asc" } })
  if (goals.length === 0) {
    return { tip: "SET A TARGET IN BODY ATLAS — THE ORACLE WILL TRACK THE MARCH", evidence: null }
  }
  // weight goal first (the flagship metric), else the oldest goal
  const goal = goals.find((g) => g.metric === "weight") ?? goals[0]
  const meta = GOAL_LABELS[goal.metric]
  if (!meta) return { tip: null, evidence: null }

  const series = await db.bodyMetric.findMany({
    where: { hunterId, type: goal.metric },
    orderBy: { day: "asc" },
    select: { day: true, value: true },
  })
  if (series.length === 0) {
    return {
      tip: `${meta.label} TARGET ${round1(goal.targetValue)} ${meta.unit} SET — LOG ENTRIES TO TRACK THE MARCH`,
      evidence: null,
    }
  }

  const latest = series[series.length - 1].value
  const target = goal.targetValue
  const remaining = round1(goal.direction === "down" ? latest - target : target - latest)
  // waist series present → the ratio principle is state-relevant; else null
  const evidence = goal.metric === "waist" ? WAIST_EVIDENCE : null

  if (remaining <= 0) {
    return {
      tip: `${meta.label} TARGET REACHED · ${round1(latest)} ${meta.unit} VS ${round1(target)} — FORGE THE NEXT MARCH`,
      evidence,
    }
  }

  // trend via 7-day slope when ≥4 points (simple first→last delta of the window)
  // R7-c: "toward/away", not "on pace/lagging" — there is no deadline to be
  // on pace against; the honest claim is the direction of the recent window.
  let trend = ""
  const window = series.slice(-7)
  if (window.length >= 4) {
    const slope = window[window.length - 1].value - window[0].value
    const toward = goal.direction === "down" ? slope < 0 : slope > 0
    trend = toward ? " · TRENDING TOWARD TARGET" : " · TRENDING AWAY"
  }

  return { tip: `${meta.label} ${round1(latest)} → ${round1(target)} ${meta.unit} · ${remaining} ${meta.unit} TO TARGET${trend}`, evidence }
}

// ─── VITALS — today's readiness, band-flavored ────────────────────────────────

async function vitalsTip(hunterId: string, today: string): Promise<TabBriefing> {
  // R38 — the 7-day vitals window is tz-key arithmetic off the passed today.
  let since = today
  for (let i = 0; i < 7; i++) since = keyBefore(since)
  const rows = await db.bodyMetric.findMany({
    where: { hunterId, type: { in: [...READINESS_METRIC_TYPES] }, day: { gte: since } },
    select: { day: true, type: true, value: true },
  })

  const rowsOf = (type: string): DayValue[] =>
    rows.filter((r) => r.type === type).map((r) => ({ day: r.day, value: r.value }))
  const valueOn = (type: string): number | null =>
    rows.find((r) => r.type === type && r.day === today)?.value ?? null

  const rhrRows = rowsOf("restingHr")
  const baseline = rhrBaselineFromRows(rhrRows, today)
  const rhrToday = valueOn("restingHr")
  const rhrDeviation =
    rhrToday !== null && baseline !== null ? Math.round((rhrToday - baseline) * 10) / 10 : null

  // R6-b evidence: low sleep first (Hirshkowitz 2015), then an elevated RHR
  // monitoring principle (no citation needed), else the sleep line stands as
  // guidance when sleep is unlogged — null when vitals are healthy.
  const sleepToday = valueOn("sleep")
  const evidence: string | null =
    sleepToday !== null && sleepToday < 7
      ? "7-9H SLEEP IS THE RECOVERY MULTIPLIER (HIRSHKOWITZ 2015)"
      : rhrDeviation !== null && rhrDeviation > 3
        ? "ELEVATED MORNING RHR FLAGS INCOMPLETE RECOVERY"
        : sleepToday === null
          ? "7-9H SLEEP IS THE RECOVERY MULTIPLIER (HIRSHKOWITZ 2015)"
          : null

  const readiness = readinessScore({
    sleepHours: valueOn("sleep"),
    rhrDeviation,
    mood: valueOn("mood"),
    energy: valueOn("energy"),
  })
  if (!readiness) {
    return { tip: "LOG SLEEP + RHR IN VITALS TO UNLOCK TODAY'S READINESS", evidence }
  }

  const advice =
    readiness.band === "PRIMED"
      ? "GREEN LIGHT FOR HEAVY WORK"
      : readiness.band === "READY"
        ? "TRAIN AS PLANNED"
        : readiness.band === "MODERATE"
          ? "KEEP RPE ≤ 7 TODAY"
          : "FAVOR MOBILITY OR REST"
  return { tip: `READINESS ${readiness.score} · ${readiness.band} — ${advice}`, evidence }
}

// ─── GATES — next untrained program day + rift of the day ─────────────────────

/** Minimal plan-day shape read out of Program.plan (guarded parse). */
type PlanDay = { day: number; focus: string }

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

/** Schoenfeld 2016 frequency prescription — the no-program / low-week line. */
const FREQ_EVIDENCE = "TRAIN EACH MUSCLE 2×/WK — FREQUENCY BEATS ONE SESSION (SCHOENFELD 2016)"

/** Schoenfeld 2016 rest-interval trial — the intra-session quality line. */
const REST_EVIDENCE = "REST 2-3 MIN BETWEEN HARD COMPOUND SETS — PROTECTS VOLUME-LOAD (SCHOENFELD 2016)"

async function gatesTip(hunterId: string, today: string, tz?: string | null): Promise<TabBriefing> {
  const rift = riftOfTheDay(today)
  const riftTag = `RIFT BONUS ×${rift.surge} ON ${rift.gateName.toUpperCase()}`

  const program = await db.program.findFirst({
    where: { hunterId, active: true },
    orderBy: { createdAt: "desc" },
  })
  if (!program) {
    return { tip: `NO ACTIVE PROGRAM — FORGE A PROTOCOL · ${riftTag}`, evidence: FREQ_EVIDENCE }
  }

  // R38 — the training week rolls with the hunter's tz (weekStartKeyIn).
  const weekStart = weekStartKeyIn(tz ?? null)
  const weekSessions = await db.workoutSession.findMany({
    where: { hunterId, status: "cleared", startedAt: { gte: new Date(`${weekStart}T00:00:00`) } },
    select: { programDay: true },
  })

  // R6-b evidence from the week's own session count: a training-heavy week
  // (3+ cleared raids) points at intra-session quality (rest intervals);
  // anything less points at muscle-specific frequency (Schoenfeld 2016).
  const evidence = weekSessions.length >= 3 ? REST_EVIDENCE : FREQ_EVIDENCE

  const planDays = parsePlanDays(program.plan)
  if (!planDays) return { tip: riftTag, evidence }

  const daysDone = [...new Set(weekSessions.map((s) => s.programDay).filter((d): d is number => d !== null))]
  const next = planDays.filter((p) => !daysDone.includes(p.day)).sort((a, b) => a.day - b.day)[0]

  if (!next) {
    return { tip: `ALL PROGRAM DAYS CLEARED THIS WEEK — REST OR REFORGE · ${riftTag}`, evidence }
  }
  const focus = next.focus.toUpperCase().slice(0, 20)
  return { tip: `DAY ${next.day} · ${focus} UNTRAINED THIS WEEK · ${riftTag}`, evidence }
}

// ─── STATUS / DIRECTIVES — unclaimed dailies + streak ─────────────────────────

async function unclaimedDailies(
  hunterId: string,
  today: string
): Promise<{ count: number; xp: number }> {
  const dailies = await db.quest.findMany({
    where: { hunterId, kind: "daily", day: today },
    select: { claimed: true, xpReward: true },
  })
  const unclaimed = dailies.filter((q) => !q.claimed)
  return { count: unclaimed.length, xp: unclaimed.reduce((a, q) => a + q.xpReward, 0) }
}

/** Consistency principle — no citation (pool has no consensus claim). */
const CONSISTENCY_EVIDENCE = "CONSISTENCY COMPOUNDS — FREQUENCY OF EFFORT DRIVES ADAPTATION"

async function statusTip(hunter: Hunter, today: string): Promise<TabBriefing> {
  const { count, xp } = await unclaimedDailies(hunter.id, today)
  const streak = hunter.streak
  if (count > 0) {
    const base = `${count} GOAL${count === 1 ? "" : "S"} UNCLAIMED · +${xp} XP ON THE TABLE`
    return { tip: streak > 0 ? `${base} · STREAK ${streak}D` : base, evidence: CONSISTENCY_EVIDENCE }
  }
  if (streak > 0) {
    return { tip: `ALL DAILY GOALS CLAIMED · STREAK ${streak}D — THE CHAIN HOLDS`, evidence: CONSISTENCY_EVIDENCE }
  }
  return { tip: null, evidence: null }
}

async function directivesTip(hunter: Hunter, today: string, tz?: string | null): Promise<TabBriefing> {
  const { count, xp } = await unclaimedDailies(hunter.id, today)
  const streak = hunter.streak
  // Daily directives drive training frequency — the Schoenfeld 2016 line is
  // the honest lever; only surfaced when there is quest context to anchor it.
  const evidence = count > 0 || streak > 0 ? FREQ_EVIDENCE : null
  if (count > 0) {
    // R38 — the reset copy is zone-honest: the hunter's midnight when a
    // timezone is set, UTC for legacy null-timezone profiles.
    const resetCopy = tz ? "RESETS AT YOUR MIDNIGHT" : "RESETS 00:00 UTC"
    const base = `${count} DAILY QUEST${count === 1 ? "" : "S"} AWAIT · +${xp} XP CLAIMABLE · ${resetCopy}`
    return { tip: streak > 0 ? `${base} · STREAK ${streak}D` : base, evidence }
  }
  if (streak > 0) {
    return { tip: `DAILY QUESTS CLEARED · STREAK ${streak}D · RETURN TOMORROW FOR NEW ORDERS`, evidence }
  }
  return { tip: null, evidence: null }
}

// ─── RECORDS — PR count + top e1RM mover (light 90-day query) ──────────────────

async function recordsTip(hunterId: string): Promise<TabBriefing> {
  const prCount = await db.personalBest.count({ where: { hunterId } })
  if (prCount === 0) return { tip: null, evidence: null }

  const logs = await db.exerciseLog.findMany({
    where: {
      session: { hunterId, status: "cleared", startedAt: { gte: new Date(Date.now() - 90 * DAY) } },
    },
    select: { name: true, weightKg: true, reps: true },
    orderBy: { createdAt: "asc" },
  })

  // per normalized exercise: first + last positive-weight e1RM and session count
  const agg = new Map<string, { display: string; first: number | null; last: number | null; sessions: number }>()
  for (const log of logs) {
    // R68 — Epley domain guard: only 1-12 rep loaded sets carry an honest
    // e1RM (the weight/reps positivity guards are subsumed; a 13+ rep set
    // would trend a fabricated ~1.67× extrapolation). An exercise left with
    // no valid sets never enters agg — the mover stays null, honestly.
    if (!validE1rmSet(log.reps, log.weightKg)) continue
    const key = progressionKey(log.name)
    const e1rm = epleyE1rm(log.weightKg, log.reps)
    const entry = agg.get(key)
    if (entry) {
      entry.last = e1rm
      entry.sessions++
    } else {
      agg.set(key, { display: log.name, first: e1rm, last: e1rm, sessions: 1 })
    }
  }

  let mover: { name: string; pct: number } | null = null
  for (const entry of agg.values()) {
    if (entry.sessions < 2 || !entry.first || !entry.last || entry.first <= 0) continue
    const pct = Math.round(((entry.last - entry.first) / entry.first) * 100)
    if (pct > 0 && (!mover || pct > mover.pct)) mover = { name: entry.display, pct }
  }

  // R6-b evidence: a trending e1RM means the top sets are being pushed with
  // real effort → proximity line (Robinson 2024); no trend yet → the volume
  // prescription is the honest next lever (Schoenfeld 2017).
  const evidence = mover
    ? "GROWTH LIVES 0-3 REPS FROM FAILURE — PUSH THE TOP SETS (ROBINSON 2024)"
    : "10+ HARD SETS/WK PER MUSCLE = THE GROWTH ZONE (SCHOENFELD 2017)"

  if (mover) {
    const name = mover.name.toUpperCase().slice(0, 20)
    // R7-c: "since first log", not "trending" — the pct is the delta between
    // the latest and first logged entries in the window (≥2 entries), which
    // is a change, not an established trend.
    return { tip: `${prCount} RECORD${prCount === 1 ? "" : "S"} HELD · ${name} E1RM +${mover.pct}% SINCE FIRST LOG`, evidence }
  }
  return { tip: `${prCount} RECORD${prCount === 1 ? "" : "S"} HELD · LOG MORE SESSIONS TO TREND E1RM`, evidence }
}

// ─── GET /api/oracle/tip?tab=… ────────────────────────────────────────────────

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tab = url.searchParams.get("tab") ?? ""

  if (!(TABS as readonly string[]).includes(tab)) {
    return NextResponse.json({ tab, tip: null, evidence: null })
  }

  try {
    const hunter = await requireHunter()
    // R38 — "today" for every tip below rolls with the hunter's timezone.
    const today = dayKeyIn(hunter.timezone)

    let briefing: TabBriefing = { tip: null, evidence: null }
    try {
      switch (tab as TabId) {
        case "fuel":
          briefing = await fuelTip(hunter.id, today)
          break
        case "body":
          briefing = await bodyTip(hunter.id)
          break
        case "vitals":
          briefing = await vitalsTip(hunter.id, today)
          break
        case "gates":
          briefing = await gatesTip(hunter.id, today, hunter.timezone)
          break
        case "status":
          briefing = await statusTip(hunter, today)
          break
        case "directives":
          briefing = await directivesTip(hunter, today, hunter.timezone)
          break
        case "records":
          briefing = await recordsTip(hunter.id)
          break
      }
    } catch (e) {
      // per-tab guard — degrade to a null tip rather than an error banner
      console.error(`GET /api/oracle/tip (tab=${tab})`, e)
      briefing = { tip: null, evidence: null }
    }

    // ── R29-b [FIELD MANUAL] family — consensus science fallback flavor ──
    // Deterministic cadence so QA can verify: (epochDay + tabIndex) % 3 === 0
    // → the science tip leads, but ONLY when the tab's own state logic has
    // nothing to say (tip null) — state tips (including critical warnings)
    // always keep priority. Entries rotate through the shared science module;
    // each ends with its org-level source label, never a study citation.
    if (briefing.tip === null) {
      const tabIndex = TABS.indexOf(tab as TabId)
      const epochDay = Math.floor(Date.now() / DAY)
      if ((epochDay + tabIndex) % 3 === 0) {
        const entry = SCIENCE_ENTRIES[(epochDay + tabIndex) % SCIENCE_ENTRIES.length]!
        briefing = {
          tip: `[FIELD MANUAL] ${entry.body.toUpperCase()} · ${entry.source}`,
          evidence: briefing.evidence,
        }
      }
    }

    return NextResponse.json({ tab, tip: briefing.tip, evidence: briefing.evidence })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/oracle/tip", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
