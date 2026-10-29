// ─── PRIME · Load library (R18-d — Strain & Load console) ─────────────────────
// Pure data + pure functions only (safe to import from client components).
// Whoop / Garmin / TrainingPeaks parity: turns cleared workout sessions into
// (1) session load in arbitrary units (AU), (2) a 0–21 daily strain score,
// (3) an acute:chronic workload ratio, and (4) Banister fitness–fatigue–form.
//
// CITATION INTEGRITY: every formula below carries its source in the adjacent
// comment and in LOAD_CITATIONS (surfaced in the console's footnote). The
// 0–21 strain scale is an HOMAGE to WHOOP's public scale convention — the
// curve here is our own, documented in full, and is not their algorithm.
//
// R69 — day buckets roll with the hunter's timezone when a tz is threaded
// into buildLoadView (dayKeyIn — lib/game's R38 primitive, itself pure and
// import-free, so this module stays client-safe). Absent/null tz keeps the
// legacy server-local buckets byte-compatible (dayKeyIn's own contract).

import { dayKeyIn, keyAfter, keyBefore } from "@/lib/game"

// ─── Session load (AU) — Foster session-RPE shape ─────────────────────────────
// Canonical method: session load = session-RPE × duration (Foster et al.,
// "Session RPE method for monitoring exercise training", J Strength Cond Res
// 2001). We build on that shape: effort is an RPE-equivalent on 1–10 derived
// from the session's own logs —
//   · strength/bodyweight logs with captured RIR: effort = 10 − RIR
//     (RIR 0 → 10 effort, RIR 5 → 5 effort, linear — zero reps in reserve is
//     a maximal set; five in reserve is a moderate work set);
//     logs are averaged weighted by reps performed (sets × reps).
//   · cardio logs: duration × fixed moderate factor (5 AU/min — the
//     "somewhat hard" center of the CR10 scale for steady-state work).
//   · mobility logs: negligible by design — excluded entirely.
//   · fallback when no intensity signal exists (no RIR anywhere, no cardio
//     duration): session duration × a flat default effort of 7 (CR10 "hard",
//     the canonical center of self-selected training intensity). NOT the
//     volumeKg-density option: the app stores floored minute durations, so
//     kg/min density is degenerate; the flat RPE is the honest default.

/** Moderate steady-state cardio factor (AU per logged minute, Foster CR10 "somewhat hard"). */
const CARDIO_AU_PER_MIN = 5

/** Flat fallback effort when a session carries no usable intensity signal (RPE-equivalent, CR10 "hard"). */
const FALLBACK_EFFORT = 7

// ─── Daily strain (0–21) — convex exponential, WHOOP-scale homage ─────────────
// strain(load) = 21 × (e^(load/S) − 1) / (e^(SAT/S) − 1), clamped at 21.
// The curve is strictly CONVEX below the clamp: doubling daily load always
// more than doubles strain (e.g. 75→150 AU gives 2.3→4.7, 150→300 gives
// 4.7→9.8, 300→600 gives 9.8→21.0). SAT = 600 AU is the scale-saturating day
// (~60 min at effort 10, or a hard double session); the 0–21 ceiling follows
// WHOOP's public strain-scale convention (whoop.com strain explainer) — an
// homage, not their algorithm. A bounded scale mathematically cannot stay
// convex past saturation, so the ceiling is flat by construction.

/** WHOOP-convention strain ceiling. */
export const STRAIN_MAX = 21

/** Convex exponential scale (AU) — sets how fast strain accelerates with load. */
const STRAIN_SCALE_AU = 2200

/** Daily load that maxes the strain scale (AU) — the flat ceiling beyond it. */
const STRAIN_SATURATION_AU = 600

// ─── ACWR — Gabbett 2016 BJSM injury-risk bands ───────────────────────────────
// acute = mean daily load over the last 7 days; chronic = mean daily load
// over the last 28 days (rolling-average coupled model, the form Gabbett's
// injury-risk review draws its bands from). Bands: <0.8 UNDERTRAINED,
// 0.8–1.3 OPTIMAL (the sweet spot), 1.3–1.5 ELEVATED, >1.5 DANGER.
// (Gabbett TJ, "The training–injury prevention paradox", Br J Sports Med
// 2016;50:273–280.) Both windows shrink to available history: a hunter with
// <28 days of logged history gets a chronic mean over the days that exist,
// and the UI discloses the shrunken window — phantom pre-history rest days
// would falsely dilute (or explode) the ratio.

/** ACWR band edges (Gabbett 2016). */
export const ACWR_BANDS = { optimalLo: 0.8, elevatedLo: 1.3, dangerLo: 1.5 } as const

// ─── Fitness / Fatigue / Form — Banister + TrainingPeaks convention ──────────
// CTL = 42-day exponentially weighted average of daily load (fitness);
// ATL = 7-day EWMA (fatigue); TSB = CTL − ATL (form). Recurrence:
//   ewma_t = ewma_{t−1} + (load_t − ewma_{t−1}) / τ,  seeded at 0.
// Both iterate through YESTERDAY only and TSB = CTL(−1) − ATL(−1) — the
// Allen & Coggan convention (TrainingPeaks): today's form is produced by
// training completed before today. (Banister's fitness–fatigue model, 1991;
// Allen & Coggan, "Training and Racing with a Power Meter".)

/** CTL time constant (days). */
export const CTL_TC = 42

/** ATL time constant (days). */
export const ATL_TC = 7

/** TSB verdict edges (Allen & Coggan). */
export const TSB_BANDS = { fresh: 5, fatigued: -5, watch: -10 } as const

// ─── Types ────────────────────────────────────────────────────────────────────

/** The log fields the load model consumes (structural subset of ExerciseLog). */
export interface LoadLog {
  type: string // strength | bodyweight | cardio | mobility
  sets: number
  reps: number
  durationMin: number
  rir: number | null // 0–5, null = not captured
}

/** The session fields the load model consumes (subset of WorkoutSession). */
export interface LoadSession {
  startedAt: Date // the session belongs to the calendar day it STARTED
  durationMin: number
  /** present for typing-parity; deliberately NOT consumed (see header note). */
  volumeKg: number
  logs: LoadLog[]
}

/** One calendar day of the load series. */
export type DayLoad = {
  /** yyyy-mm-dd */
  day: string
  /** summed session load (AU) */
  load: number
  /** 0–21 strain */
  strain: number
}

export type AcwrVerdict = "UNDERTRAINED" | "OPTIMAL" | "ELEVATED" | "DANGER" | "INSUFFICIENT"
export type TsbVerdict = "FRESH" | "NEUTRAL" | "FATIGUED" | "WATCH" | "INSUFFICIENT"
export type StrainBand = "LOW" | "MODERATE" | "HIGH"

/** Full Strain & Load console DTO (GET /api/load). */
export type LoadView = {
  /** last 90 days, ascending, zero-filled (rest days are data) */
  days: DayLoad[]
  /** today's strain, 0–21 (null = no session history) */
  todayStrain: number | null
  /** mean daily strain over the last 7 days, 0–21 (null = no history) */
  weekStrain: number | null
  /** null when no chronic baseline exists yet */
  acwr: number | null
  acwrVerdict: AcwrVerdict
  /** fitness — 42d EWMA of daily load through yesterday (null = no history) */
  ctl: number | null
  /** fatigue — 7d EWMA of daily load through yesterday (null = no history) */
  atl: number | null
  /** form — CTL − ATL (null = no history) */
  tsb: number | null
  tsbVerdict: TsbVerdict
  /** true = zero cleared sessions → the honest INSUFFICIENT-DATA state */
  insufficient: boolean
  /** days of session history incl. today (drives the shrunken-window disclosure) */
  historyDays: number
  citations: string[]
}

/** The console's footnote sources (house citation discipline). */
export const LOAD_CITATIONS: string[] = [
  "Session load = effort × duration after Foster et al., J Strength Cond Res 2001 (session-RPE method) — effort is an RPE-equivalent 1–10 derived from RIR (RIR 0 → 10, RIR 5 → 5, linear), cardio runs at a fixed moderate 5 AU/min, and sessions with no captured intensity default to RPE 7.",
  "Strain 0–21 = 21·(e^(load/2200)−1)/(e^(600/2200)−1), convex below the 600 AU saturation — the WHOOP 0–21 strain-scale convention as homage (whoop.com strain explainer); not their algorithm.",
  "ACWR = 7-day acute mean ÷ 28-day chronic mean of daily load; sweet spot 0.8–1.3, danger >1.5 — Gabbett TJ, Br J Sports Med 2016;50:273–280.",
  "CTL (42d) / ATL (7d) exponentially weighted averages, TSB = CTL − ATL through yesterday — Banister fitness–fatigue model (1991); Allen & Coggan, TrainingPeaks convention.",
]

// ─── Session load ─────────────────────────────────────────────────────────────

/** Load of one cleared session, in arbitrary units (see header for the method). */
export function sessionLoad(s: LoadSession): number {
  let load = 0

  // lifting effort — RIR-weighted when captured, flat default otherwise
  const liftLogs = s.logs.filter((l) => l.type === "strength" || l.type === "bodyweight")
  const withRir = liftLogs.filter((l) => l.rir !== null && l.rir !== undefined)
  if (withRir.length > 0) {
    let weightSum = 0
    let effortSum = 0
    for (const l of withRir) {
      const weight = Math.max(1, l.sets) * Math.max(1, l.reps)
      const effort = 10 - Math.min(5, Math.max(0, l.rir ?? 0))
      weightSum += weight
      effortSum += weight * effort
    }
    load += s.durationMin * (effortSum / weightSum)
  } else if (!s.logs.some((l) => l.type === "cardio" && l.durationMin > 0)) {
    // no intensity signal anywhere in the session → flat RPE default
    load += s.durationMin * FALLBACK_EFFORT
  }

  // cardio — logged minutes at the fixed moderate factor (the run's own
  // duration is the honest one; session durationMin floors to minutes)
  for (const l of s.logs) {
    if (l.type === "cardio" && l.durationMin > 0) load += l.durationMin * CARDIO_AU_PER_MIN
  }

  // mobility logs: negligible — intentionally not counted
  return load
}

// ─── Daily strain ─────────────────────────────────────────────────────────────

/** 0–21 strain for a day's total load (convex exponential; see header). */
export function dailyStrain(load: number): number {
  if (load <= 0) return 0
  const num = Math.exp(load / STRAIN_SCALE_AU) - 1
  const den = Math.exp(STRAIN_SATURATION_AU / STRAIN_SCALE_AU) - 1
  return Math.min(STRAIN_MAX, (STRAIN_MAX * num) / den)
}

/** Display band for a 0–21 strain value (teal / amber / rose in the UI). */
export function strainBand(strain: number): StrainBand {
  if (strain < 10) return "LOW"
  if (strain < 15) return "MODERATE"
  return "HIGH"
}

// ─── Verdicts ─────────────────────────────────────────────────────────────────

/** ACWR verdict from a ratio (Gabbett 2016 bands; null ratio → INSUFFICIENT). */
export function acwrVerdictOf(ratio: number | null): AcwrVerdict {
  if (ratio === null || !Number.isFinite(ratio)) return "INSUFFICIENT"
  if (ratio < ACWR_BANDS.optimalLo) return "UNDERTRAINED"
  if (ratio <= ACWR_BANDS.elevatedLo) return "OPTIMAL"
  if (ratio <= ACWR_BANDS.dangerLo) return "ELEVATED"
  return "DANGER"
}

/** TSB verdict (Allen & Coggan bands; < −10 escalates to WATCH). */
export function tsbVerdictOf(tsb: number | null): TsbVerdict {
  if (tsb === null || !Number.isFinite(tsb)) return "INSUFFICIENT"
  if (tsb > TSB_BANDS.fresh) return "FRESH"
  if (tsb >= TSB_BANDS.fatigued) return "NEUTRAL"
  if (tsb >= TSB_BANDS.watch) return "FATIGUED"
  return "WATCH"
}

// ─── Day-key helpers ─────────────────────────────────────────────────────────

/** R69 — day key N calendar days before `day` (DST-safe keyBefore chain —
 *  the /api/readiness R68 dayAgoKey idiom; pure string arithmetic). */
function keyBeforeChain(day: string, n: number): string {
  let key = day
  for (let i = 0; i < n; i++) key = keyBefore(key)
  return key
}

const round2 = (n: number): number => Math.round(n * 100) / 100

// ─── Console builder ──────────────────────────────────────────────────────────

/**
 * Builds the full Strain & Load console DTO from the hunter's cleared
 * sessions. Sessions are bucketed by the calendar day they STARTED — in the
 * hunter's timezone when `tz` is threaded by the caller (R69; the live API
 * callers /api/load and /api/coach pass hunter.timezone — audit 2-a B3
 * residual), and server-local when absent/null (legacy byte-compatible
 * fallback, dayKeyIn's own contract). Zero sessions → nulls + the honest
 * INSUFFICIENT verdict; <28 days of history → the chronic window shrinks to
 * the days that exist (disclosed via historyDays, which the UI renders as a
 * baseline-forming caveat).
 */
export function buildLoadView(sessions: LoadSession[], today: Date, tz?: string | null): LoadView {
  if (sessions.length === 0) {
    return {
      days: [],
      todayStrain: null,
      weekStrain: null,
      acwr: null,
      acwrVerdict: "INSUFFICIENT",
      ctl: null,
      atl: null,
      tsb: null,
      tsbVerdict: "INSUFFICIENT",
      insufficient: true,
      historyDays: 0,
      citations: LOAD_CITATIONS,
    }
  }

  // R69 — tz-aware day key (dayKeyIn handles null/undefined tz by falling
  // back to the legacy server-local key — the documented contract).
  const keyOf = (d: Date): string => dayKeyIn(tz, d)

  // bucket session loads per calendar day; track the earliest day that exists
  const loadByDay = new Map<string, number>()
  let firstKey = keyOf(sessions[0].startedAt)
  for (const s of sessions) {
    const key = keyOf(s.startedAt)
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + sessionLoad(s))
    if (key < firstKey) firstKey = key
  }

  // full daily series first-session-day → today (zero-filled rest days).
  // R69 — the cursor walks DAY KEYS (keyAfter string arithmetic — the R38
  // idiom), never Date objects: a hunter-tz key cannot be re-derived from a
  // server-local Date without drifting across zones.
  const todayKey = keyOf(today)
  const series: { day: string; load: number }[] = []
  for (let key = firstKey; key <= todayKey; key = keyAfter(key)) {
    series.push({ day: key, load: loadByDay.get(key) ?? 0 })
  }
  const n = series.length

  // ── ACWR: acute = last min(7,n) days, chronic = last min(28,n) days ──
  const tailMean = (windowDays: number): number => {
    const take = Math.min(windowDays, n)
    let sum = 0
    for (let i = n - take; i < n; i++) sum += series[i].load
    return sum / take
  }
  const acuteAvg = tailMean(7)
  const chronicDays = Math.min(28, n)
  const chronicAvg = tailMean(28)
  // no chronic baseline (all-zero history, or the ratio is undefined) → null
  const acwr = chronicAvg > 0 ? acuteAvg / chronicAvg : null

  // ── CTL/ATL: EWMA through YESTERDAY, seeded at 0 (Allen & Coggan) ──
  let ctl = 0
  let atl = 0
  for (let i = 0; i < n - 1; i++) {
    ctl += (series[i].load - ctl) / CTL_TC
    atl += (series[i].load - atl) / ATL_TC
  }
  const tsb = ctl - atl

  // ── strain per day + the 90-day DTO window — always the last 90 CALENDAR
  //    days ending today (in the threaded tz — R69), zero-filled on both
  //    sides (the quiet before the first session is data too; the chart's
  //    leading flatline is honest) ──
  const windowStartKey = keyBeforeChain(todayKey, 89)
  const days: DayLoad[] = []
  for (let key = windowStartKey; key <= todayKey; key = keyAfter(key)) {
    const load = loadByDay.get(key) ?? 0
    days.push({ day: key, load: round2(load), strain: round2(dailyStrain(load)) })
  }

  // ── today + week strain (week shown as the MEAN daily strain so both
  //    readouts share the 0–21 scale; WHOOP's journal sums the week instead) ──
  const todayStrain = dailyStrain(series[n - 1].load)
  const weekTake = Math.min(7, n)
  let strainSum = 0
  for (let i = n - weekTake; i < n; i++) strainSum += dailyStrain(series[i].load)
  const weekStrain = strainSum / weekTake

  return {
    days,
    todayStrain: round2(todayStrain),
    weekStrain: round2(weekStrain),
    acwr: acwr === null ? null : Math.round(acwr * 1000) / 1000,
    acwrVerdict: acwrVerdictOf(acwr),
    ctl: round2(ctl),
    atl: round2(atl),
    tsb: round2(tsb),
    tsbVerdict: tsbVerdictOf(tsb),
    insufficient: false,
    historyDays: n,
    citations: LOAD_CITATIONS,
  }
}
