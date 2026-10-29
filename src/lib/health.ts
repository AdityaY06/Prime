// ─── PRIME · Health library — risk zones, health score, maintenance protocol ──
// Pure data + pure functions only (client-safe, no imports from API routes).
// Every threshold carries an honest citation; missing inputs are never guessed.

// ─── Zone primitives ──────────────────────────────────────────────────────────

export type ZoneTone = "ok" | "watch" | "warn" | "danger"

export type Zone = {
  label: string
  tone: ZoneTone
  action: string
  citation: string
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

// ─── Blood pressure — ACC/AHA 2017 categories ─────────────────────────────────

/** Home-measurement method + single-reading caveat (AHA). */
export const BP_METHOD_CAVEAT =
  "AHA home method: seated, back supported, 5 min rested, arm supported at heart level, feet flat, no talking. One reading is not a diagnosis — averages over time matter; discuss sustained readings with a clinician."

const BP_CITATION = "ACC/AHA 2017 BP guideline (Whelton et al., Hypertension 2018)"

/**
 * ACC/AHA 2017 blood-pressure category for one home reading.
 * Crisis ≥180 or ≥120 · Stage 2 ≥140 or ≥90 · Stage 1 130–139 or 80–89 ·
 * Elevated 120–129 & <80 · Normal <120 & <80.
 */
export function bpZone(sys: number, dia: number): Zone {
  if (sys >= 180 || dia >= 120) {
    return {
      label: "Crisis",
      tone: "danger",
      action: "Seek immediate care — readings this high need urgent medical attention.",
      citation: BP_CITATION,
    }
  }
  if (sys >= 140 || dia >= 90) {
    return {
      label: "Stage 2",
      tone: "warn",
      action: "Log daily, recheck weekly — sustained readings here should be discussed with a clinician soon.",
      citation: BP_CITATION,
    }
  }
  if (sys >= 130 || dia >= 80) {
    return {
      label: "Stage 1",
      tone: "watch",
      action: "Recheck over several mornings — if the average stays here, discuss with a clinician.",
      citation: BP_CITATION,
    }
  }
  if (sys >= 120 && dia < 80) {
    return {
      label: "Elevated",
      tone: "watch",
      action: "On the edge — averages over time decide; keep logging.",
      citation: BP_CITATION,
    }
  }
  return {
    label: "Normal",
    tone: "ok",
    action: "In the healthy band — keep monitoring.",
    citation: BP_CITATION,
  }
}

// ─── SpO₂ — pulse oximetry zones ──────────────────────────────────────────────

const SPO2_CITATION = "Standard pulse-oximetry reference ranges; consumer devices ±2–4% accuracy"

/** SpO₂ zone with the consumer-device accuracy caveat baked into the action. */
export function spo2Zone(v: number): Zone {
  if (v >= 95) {
    return {
      label: "Normal",
      tone: "ok",
      action: "Normal for healthy adults at sea level.",
      citation: SPO2_CITATION,
    }
  }
  if (v >= 91) {
    return {
      label: "Watch",
      tone: "watch",
      action: "Retest with a warm finger, still — consumer oximeters run ±2–4%, so borderline values deserve a recheck.",
      citation: SPO2_CITATION,
    }
  }
  return {
    label: "Low",
    tone: "danger",
    action: "Below the expected band — retest immediately; if it repeats, seek medical care.",
    citation: SPO2_CITATION,
  }
}

// ─── Resting heart rate ───────────────────────────────────────────────────────

const HR_CITATION = "Resting HR 60–100 bpm: conventional clinical range; lower is common in trained hearts"

/** Resting-HR zone — trained-heart bradycardia acknowledged for 40–59. */
export function hrZone(v: number): Zone {
  if (v < 40) {
    return {
      label: "Very low",
      tone: "warn",
      action: "Unusual — fine for some athletes, but if you feel dizzy or faint, discuss with a clinician.",
      citation: HR_CITATION,
    }
  }
  if (v < 60) {
    return {
      label: "Trained",
      tone: "ok",
      action: "Sinus bradycardia is normal in trained hearts — a low resting HR usually means a big engine.",
      citation: HR_CITATION,
    }
  }
  if (v <= 100) {
    return {
      label: "Normal",
      tone: "ok",
      action: "Inside the conventional resting range.",
      citation: HR_CITATION,
    }
  }
  return {
    label: "High",
    tone: "watch",
    action: "High for a rested reading — recheck after 5 min seated; if it stays >100, discuss with a clinician.",
    citation: HR_CITATION,
  }
}

// ─── Body temperature — Mackowiak 1997 ────────────────────────────────────────

const TEMP_CITATION = "Mackowiak et al. 1997, JAMA — mean oral temp 36.8°C (not 37.0)"

/** Oral body-temperature zone. Normal band 36.1–37.2 °C. */
export function tempZone(v: number): Zone {
  if (v < 35) {
    return {
      label: "Low",
      tone: "warn",
      action: "Hypothermic range for an oral reading — retest and seek care if it repeats.",
      citation: TEMP_CITATION,
    }
  }
  if (v < 36.1) {
    return {
      label: "Below band",
      tone: "watch",
      action: "Slightly under the normal band — retest; often just a cool thermometer or morning dip.",
      citation: TEMP_CITATION,
    }
  }
  if (v <= 37.2) {
    return {
      label: "Normal",
      tone: "ok",
      action: "Inside the classic normal band (mean 36.8°C).",
      citation: TEMP_CITATION,
    }
  }
  if (v < 38) {
    return {
      label: "Feverish",
      tone: "watch",
      action: "Above normal — hydrate, rest, recheck in a few hours.",
      citation: TEMP_CITATION,
    }
  }
  return {
    label: "Fever",
    tone: "warn",
    action: "Fever range — rest and hydrate; seek care if sustained or severe.",
    citation: TEMP_CITATION,
  }
}

// ─── HRV — trend guidance ─────────────────────────────────────────────────────

export type HrvNote = { title: string; body: string; citation: string }

/** HRV interpretation guidance — trend beats value. */
export function hrvNote(): HrvNote {
  return {
    title: "Trend beats value",
    body: "HRV is highly individual — a single number means little. Watch your own 7-day baseline: a sudden drop can flag under-recovery, illness or stress; a slow climb usually means adapting well.",
    citation: "Wearable HRV (RMSSD) literature — individual baselines, not population norms",
  }
}

// ─── Health score — six weighted subscores ────────────────────────────────────

export type HealthScoreInput = {
  /** Moderate cardio minutes logged this ISO week (WHO target 150). */
  cardioMinutesThisWeek?: number | null
  /** Strength/bodyweight sessions logged this ISO week (WHO target 2). */
  strengthSessionsThisWeek?: number | null
  /** 7-day average sleep hours (window 7–9). */
  sleep7dAvg?: number | null
  /** 7-day average protein intake, g/day (days with logged meals). */
  protein7dAvgG?: number | null
  /** App protein target, g/day (from Fuel profile targets). */
  proteinTargetG?: number | null
  /** 7-day average calories (days with logged meals). */
  kcal7dAvg?: number | null
  /** Daily calorie target. */
  kcalTarget?: number | null
  /** Latest waist circumference, cm. */
  waistCm?: number | null
  /** Height, cm. */
  heightCm?: number | null
  /** Latest BMI (derived from weight + height). */
  bmi?: number | null
  /** Latest subjective stress 0–10. */
  stress?: number | null
  /** Latest subjective energy 1–5. */
  energy?: number | null
  /** Sleep trend: last-7-day avg minus previous-7-day avg (hours). */
  sleepTrend?: number | null
}

export type HealthScorePartId = "cardio" | "strength" | "sleep" | "nutrition" | "body" | "recovery"

export type HealthScorePart = {
  id: HealthScorePartId
  label: string
  /** 0–100, or null when no data (excluded from the mean, never guessed). */
  score: number | null
  citation: string
}

export type HealthScore = {
  /** Weighted mean over available subscores, 0–100 — null when nothing is logged. */
  total: number | null
  parts: HealthScorePart[]
}

const HEALTH_WEIGHTS: Record<HealthScorePartId, number> = {
  cardio: 0.2,
  strength: 0.2,
  sleep: 0.2,
  nutrition: 0.15,
  body: 0.1,
  recovery: 0.15,
}

/** BMI band subscore — WHO classification bands. */
function bmiBandScore(bmi: number): number {
  if (bmi >= 18.5 && bmi < 25) return 100
  if (bmi >= 25 && bmi < 30) return 60
  if (bmi >= 30) return 30
  return 50 // <18.5 underweight
}

/**
 * Six-subscore health estimate. Missing inputs produce null subscores that are
 * excluded from the weighted mean — a score is never fabricated from absence.
 */
export function healthScore(input: HealthScoreInput): HealthScore {
  const parts: HealthScorePart[] = []

  // CARDIO — minutes this week vs WHO 150
  parts.push({
    id: "cardio",
    label: "Cardio",
    score:
      input.cardioMinutesThisWeek === undefined || input.cardioMinutesThisWeek === null
        ? null
        : Math.round(clamp01(input.cardioMinutesThisWeek / 150) * 100),
    citation: "WHO 2020 guidelines — 150+ min moderate aerobic activity per week",
  })

  // STRENGTH — sessions this week vs WHO 2
  parts.push({
    id: "strength",
    label: "Strength",
    score:
      input.strengthSessionsThisWeek === undefined || input.strengthSessionsThisWeek === null
        ? null
        : Math.round(clamp01(input.strengthSessionsThisWeek / 2) * 100),
    citation: "WHO 2020 guidelines — 2+ muscle-strengthening sessions per week",
  })

  // SLEEP — 7-day avg vs the 7–9h window (full credit inside; linear falloff)
  let sleepScore: number | null = null
  if (input.sleep7dAvg !== undefined && input.sleep7dAvg !== null) {
    const avg = input.sleep7dAvg
    const dev = avg < 7 ? 7 - avg : avg > 9 ? avg - 9 : 0
    sleepScore = Math.round(clamp01(1 - dev / 3) * 100)
  }
  parts.push({
    id: "sleep",
    label: "Sleep",
    score: sleepScore,
    citation: "Cappuccio et al. 2010 meta-analysis (Sleep) — 7–8h optimal; we score 7–9h as full",
  })

  // NUTRITION — protein adherence + kcal adherence, whichever is available
  const nutriParts: number[] = []
  if (input.protein7dAvgG != null && input.proteinTargetG != null && input.proteinTargetG > 0) {
    nutriParts.push(clamp01(input.protein7dAvgG / input.proteinTargetG))
  }
  if (input.kcal7dAvg != null && input.kcalTarget != null && input.kcalTarget > 0) {
    const dev = Math.abs(input.kcal7dAvg - input.kcalTarget) / input.kcalTarget
    nutriParts.push(dev <= 0.1 ? 1 : clamp01(1 - (dev - 0.1) / 0.3))
  }
  parts.push({
    id: "nutrition",
    label: "Nutrition",
    score:
      nutriParts.length === 0
        ? null
        : Math.round((nutriParts.reduce((a, b) => a + b, 0) / nutriParts.length) * 100),
    citation: "Morton et al. 2018 (Br J Sports Med) — protein plateau ~1.6 g/kg/d; kcal adherence vs Fuel target",
  })

  // BODY — waist-to-height ratio (<0.5) + BMI band
  const bodyParts: number[] = []
  if (input.waistCm != null && input.heightCm != null && input.heightCm > 0) {
    const whtr = input.waistCm / input.heightCm
    bodyParts.push(whtr <= 0.5 ? 1 : clamp01(1 - (whtr - 0.5) / 0.1))
  }
  if (input.bmi != null) bodyParts.push(bmiBandScore(input.bmi) / 100)
  parts.push({
    id: "body",
    label: "Body",
    score:
      bodyParts.length === 0
        ? null
        : Math.round((bodyParts.reduce((a, b) => a + b, 0) / bodyParts.length) * 100),
    citation: "Ashwell et al. 2012 (waist < half your height) + WHO BMI bands",
  })

  // RECOVERY — stress (inverse) + energy + sleep trend
  const recParts: number[] = []
  if (input.stress != null) recParts.push(clamp01((10 - input.stress) / 10))
  if (input.energy != null) recParts.push(clamp01((input.energy - 1) / 4))
  if (input.sleepTrend != null) recParts.push(clamp01(1 + input.sleepTrend / 1.5))
  parts.push({
    id: "recovery",
    label: "Recovery",
    score:
      recParts.length === 0
        ? null
        : Math.round((recParts.reduce((a, b) => a + b, 0) / recParts.length) * 100),
    citation: "Self-reported stress/energy + sleep trend — estimates, not measurements",
  })

  const available = parts.filter((p) => p.score !== null) as { id: HealthScorePartId; score: number }[]
  let total: number | null = null
  if (available.length > 0) {
    const weightSum = available.reduce((acc, p) => acc + HEALTH_WEIGHTS[p.id], 0)
    total = Math.round(available.reduce((acc, p) => acc + p.score * HEALTH_WEIGHTS[p.id], 0) / weightSum)
  }

  return { total, parts }
}

// ─── Daily readiness — composite of today's vitals vs the hunter's own baseline ─
// Pure functions over plain day/value rows so API routes and the Oracle share
// one rule-set. Missing inputs never fabricate a score: no vitals today → null.

export type ReadinessBand = "PRIMED" | "READY" | "MODERATE" | "BACK OFF"

export type ReadinessDriver = { label: string; delta: number }

export type ReadinessView = {
  /** 0–100 composite, clamped. */
  score: number
  band: ReadinessBand
  /** Only non-zero signed contributions, e.g. SLEEP 8.2H +15. */
  drivers: ReadinessDriver[]
}

export type RhrTrendView = {
  /** Mean of the prior 7 days' resting HR (≥3 of 7 days required). */
  baseline: number
  /** Most recent resting HR within the last 3 days (today ≤2 days old). */
  latest: number
  deviation: number
  title: string
}

export type NextDayView = {
  /** Lowest plan day not yet cleared this week — null when all done. */
  day: number | null
  focus: string
  reason: string
  /** Sorted distinct programDay values cleared this ISO week. */
  daysDone: number[]
  allDone: boolean
}

/** Shared /api/readiness response contract (route + all consumers). */
export type ReadinessRes = {
  readiness: ReadinessView | null
  rhrTrend: RhrTrendView | null
  week: { planned: number; done: number }
  nextDay: NextDayView | null
  /** Latest rMSSD reading, ms (additive R29-b — absent on old payloads). */
  hrvMs?: number | null
  /** Latest rMSSD % deviation from the prior-7-day baseline (rounded 0.1). */
  hrvPctDeviation?: number | null
  /** Band decision computed route-side from the same numbers (one site). */
  hrvModulation?: HrvModulation | null
}

export type ReadinessInput = {
  /** Hours slept, logged for the latest day. */
  sleepHours?: number | null
  /** Today's resting HR minus the prior-7-day baseline (bpm). */
  rhrDeviation?: number | null
  /** Mood 1–5, logged for the latest day. */
  mood?: number | null
  /** Energy 1–5, logged for the latest day. */
  energy?: number | null
  /**
   * Today's rMSSD % deviation from the prior-7-day baseline (R24-a). Only
   * SUBSTANTIAL suppression moves the score (≤−20% costs 10 points — the
   * Plews idiom; the ±8% day-to-day noise band is not a signal). Optional
   * so pre-R24-a callers stay valid.
   */
  hrvPctDeviation?: number | null
}

export const READINESS_BASELINE = 70

export const READINESS_CITATION =
  "SOURCE: PLEWS ET AL. 2013 (HRV-GUIDED TRAINING); STANLEY ET AL. 2013."

/** Band-tinted advice line + display hex, shared by banner and Vitals panel.
 *  R43 studio register: PRIMED is the gold CTA moment; READY keeps the teal
 *  identity; MODERATE reads orange (distinct from both gold and rose); LOW
 *  stays rose. */
export const READINESS_BAND_META: Record<ReadinessBand, { advice: string; hex: string }> = {
  PRIMED: {
    advice: "GREEN LIGHT — FULL INTENSITY AVAILABLE. ATTACK THE HEAVIEST WORK IN THE PLAN.",
    hex: "#fbbf24",
  },
  READY: {
    advice: "GOOD TO TRAIN — RUN TODAY'S SESSION AS PLANNED.",
    hex: "#2dd4bf",
  },
  MODERATE: {
    advice: "TRAIN, BUT SCALE — FAVOR TECHNIQUE WORK AND LEAVE 2 REPS IN THE TANK.",
    hex: "#fb923c",
  },
  "BACK OFF": {
    advice: "BACK OFF — FAVOR MOBILITY OR A WALK. HARD TRAINING TODAY WOULD DIG THE HOLE DEEPER.",
    hex: "#fb7185",
  },
}

/** Signed 1-decimal number for driver labels ("−3.2" / "+1.5" / "2"). */
function signed1(n: number): string {
  const r = Math.round(Math.abs(n) * 10) / 10
  const body = Number.isInteger(r) ? String(r) : r.toFixed(1)
  return n < 0 ? `−${body}` : n > 0 ? `+${body}` : body
}

/** Unsigned compact 1-decimal number ("8.2", "2"). */
function fmt1(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** Sleep-hours contribution (7.5–9 optimal window, honest penalties either side). */
export function sleepContribution(h: number): number {
  if (h < 5) return -20
  if (h < 6) return -12
  if (h < 7) return 0
  if (h < 7.5) return 8
  if (h <= 9) return 15
  if (h <= 9.5) return 0
  return -5
}

/** Resting-HR deviation contribution (−6..−3 adaptation, >+6 fatigue flag). */
export function rhrContribution(dev: number): number {
  if (dev > 6) return -15
  if (dev >= -6 && dev <= -3) return 10
  return 0
}

/** Mood+energy mean contribution (≥4 positive, ≤2 negative). */
export function moodEnergyContribution(avg: number): number {
  if (avg >= 4) return 8
  if (avg <= 2) return -10
  return 0
}

/**
 * HRV % deviation contribution (R24-a): only substantial suppression is a
 * signal — ≤−20% vs the prior-7-day baseline costs 10 points; the normal
 * ±8% rMSSD day-to-day noise is honesty-neutral (0). Feeds readinessScore
 * AND is the coach's rule-3 no-double-count premise: an HRV-suppressed day
 * already drags the band toward MODERATE/BACK OFF through THIS component.
 */
export function hrvContribution(pctDeviation: number): number {
  return pctDeviation <= HRV_PCT_THRESHOLDS.suppressedPct ? -10 : 0
}

export function readinessBand(score: number): ReadinessBand {
  if (score >= 85) return "PRIMED"
  if (score >= 70) return "READY"
  if (score >= 45) return "MODERATE"
  return "BACK OFF"
}

/**
 * Composite daily readiness from the latest day's vitals. Returns null when no
 * component is available — a score is never fabricated from absence. A day with
 * only restingHr (and a computable baseline) scores from the RHR component alone.
 */
export function readinessScore(input: ReadinessInput): ReadinessView | null {
  const has = (v: number | null | undefined): v is number =>
    v !== undefined && v !== null && Number.isFinite(v)

  const drivers: ReadinessDriver[] = []
  let score = READINESS_BASELINE
  let components = 0

  if (has(input.sleepHours)) {
    components++
    const d = sleepContribution(input.sleepHours)
    if (d !== 0) drivers.push({ label: `SLEEP ${fmt1(input.sleepHours)}H`, delta: d })
    score += d
  }

  if (has(input.rhrDeviation)) {
    components++
    const d = rhrContribution(input.rhrDeviation)
    if (d !== 0) drivers.push({ label: `RHR ${signed1(input.rhrDeviation)} BPM`, delta: d })
    score += d
  }

  const moodVals = [input.mood, input.energy].filter(has)
  if (moodVals.length > 0) {
    components++
    const avg = moodVals.reduce((a, b) => a + b, 0) / moodVals.length
    const d = moodEnergyContribution(avg)
    const label =
      moodVals.length === 2
        ? `MOOD+ENERGY ${fmt1(avg)}/5`
        : has(input.mood)
          ? `MOOD ${fmt1(input.mood)}/5`
          : `ENERGY ${fmt1(input.energy as number)}/5`
    if (d !== 0) drivers.push({ label, delta: d })
    score += d
  }

  // R24-a — HRV suppression feeds the composite directly (see
  // hrvContribution). One component, one vote — the coach reads the SAME
  // band downstream, so the signal is never counted twice.
  if (has(input.hrvPctDeviation)) {
    components++
    const d = hrvContribution(input.hrvPctDeviation)
    if (d !== 0) drivers.push({ label: `HRV ${signed1(input.hrvPctDeviation)}%`, delta: d })
    score += d
  }

  if (components === 0) return null

  const clamped = Math.min(100, Math.max(0, Math.round(score)))
  return { score: clamped, band: readinessBand(clamped), drivers }
}

// ─── Resting-HR trend — prior-7-day rolling baseline ─────────────────────────

export type DayValue = { day: string; value: number }

/** Whole-day difference a − b (both yyyy-mm-dd). */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime()) / 86400000)
}

/** Dedupes to one value per day (latest row wins) — mirrors the upsert storage. */
function rowsByDay(rows: DayValue[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.day, r.value)
  return m
}

/** Mean resting HR over the prior 7 days (today excluded); needs ≥3 of 7 days. */
export function rhrBaselineFromRows(rows: DayValue[], today: string): number | null {
  return prior7dMeanFromRows(rows, today)
}

/**
 * Mean rMSSD (HRV) over the prior 7 days (today excluded); ≥3 of 7 days —
 * the HRV twin of rhrBaselineFromRows (identical rolling-window math over
 * DayValue[]; the names keep the two vitals semantically distinct at every
 * call site — the readiness route previously borrowed the RHR name for HRV
 * rows, which compiled but read as a lie).
 */
export function hrvBaselineFromRows(rows: DayValue[], today: string): number | null {
  return prior7dMeanFromRows(rows, today)
}

/** Shared core: dedupe to one value per day, mean over the prior 7 days
 *  (today excluded), null under 3 days of window coverage. */
function prior7dMeanFromRows(rows: DayValue[], today: string): number | null {
  const byDay = rowsByDay(rows)
  const prior = [...byDay.entries()].filter(([d]) => {
    const diff = dayDiff(d, today)
    return diff >= -7 && diff <= -1
  })
  if (prior.length < 3) return null
  return Math.round((prior.reduce((acc, [, v]) => acc + v, 0) / prior.length) * 10) / 10
}

/** RHR trend title from the baseline deviation. */
export function rhrTrendTitle(deviation: number): string {
  if (deviation > 6) return "elevated above baseline — fatigue signal"
  if (deviation > 3) return "slightly above baseline — watch recovery"
  if (deviation < -6) return "notably below — watch recovery"
  if (deviation < -3) return "slightly below baseline — adaptation"
  return "stable"
}

/**
 * RHR trend: baseline = mean of the prior 7 days (≥3 of 7), latest = today's
 * or the most recent value ≤2 days old. Null when either half is missing.
 */
export function rhrTrendFromRows(rows: DayValue[], today: string): RhrTrendView | null {
  const baseline = rhrBaselineFromRows(rows, today)
  if (baseline === null) return null
  const byDay = rowsByDay(rows)
  const recent = [...byDay.entries()].filter(([d]) => {
    const diff = dayDiff(d, today)
    return diff >= -2 && diff <= 0
  })
  if (recent.length === 0) return null
  recent.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
  const latest = recent[0][1]
  const deviation = Math.round((latest - baseline) * 10) / 10
  return { baseline, latest, deviation, title: rhrTrendTitle(deviation) }
}

/** Mean sleep hours over the last 7 days including today (≥1 day). */
export function sleep7dAvgFromRows(rows: DayValue[], today: string): number | null {
  const byDay = rowsByDay(rows)
  const window = [...byDay.entries()].filter(([d]) => {
    const diff = dayDiff(d, today)
    return diff >= -6 && diff <= 0
  })
  if (window.length === 0) return null
  return Math.round((window.reduce((acc, [, v]) => acc + v, 0) / window.length) * 10) / 10
}

// ─── HRV training modulation — today's rMSSD vs the prior-7-day baseline ─────

export type HrvModulationBand = "cut" | "light" | "aligned" | "primed"

export type HrvModulation = {
  band: HrvModulationBand
  /** % deviation from the prior-7-day baseline, rounded to 0.1. */
  pctDeviation: number
  advice: string
}

/** Thresholds are % deviations from baseline (negative = below = suppressed).
 *  R39 single-source export — coach.ts's COACH_THRESHOLDS reads THESE edges
 *  (supranormal/below-baseline/suppressed) so the modulation bands and the
 *  coach's evidence tones can never drift apart. */
export const HRV_PCT_THRESHOLDS = {
  /** ≥ +5% vs baseline — supranormal (primed band edge). */
  supranormalPct: 5,
  /** ≤ −8% vs baseline — suppressed (train-light band edge). */
  belowBaselinePct: -8,
  /** ≤ −20% vs baseline — substantial suppression (cut band edge; the
   *  readinessScore penalty edge via hrvContribution). */
  suppressedPct: -20,
} as const

export const HRV_MODULATION_META: Record<HrvModulationBand, { chip: string; advice: string }> = {
  cut: { chip: "CUT INTENSITY", advice: "HRV FAR BELOW BASELINE — CUT INTENSITY OR REST" },
  light: { chip: "TRAIN LIGHT", advice: "HRV SUPPRESSED — KEEP TODAY LIGHT AND TECHNICAL" },
  aligned: { chip: "RECOVERY-ALIGNED", advice: "HRV ALIGNED WITH RECOVERY — PROCEED AS PLANNED" },
  primed: { chip: "PRIMED", advice: "HRV ELEVATED ABOVE BASELINE — PRIMED FOR HARD WORK" },
}

/** HRV training modulation from today's rMSSD vs the prior-7-day baseline.
 *  Null when either input is missing or the baseline is implausible (≤0) —
 *  no data must never read as a green light. */
export function hrvTrainingModulation(hrvMsToday: number | null, hrvBaseline: number | null): HrvModulation | null {
  if (hrvMsToday === null || hrvBaseline === null || hrvBaseline <= 0) return null
  const pct = Math.round(((hrvMsToday - hrvBaseline) / hrvBaseline) * 1000) / 10
  const band: HrvModulationBand =
    pct <= HRV_PCT_THRESHOLDS.suppressedPct
      ? "cut"
      : pct <= HRV_PCT_THRESHOLDS.belowBaselinePct
        ? "light"
        : pct >= HRV_PCT_THRESHOLDS.supranormalPct
          ? "primed"
          : "aligned"
  return { band, pctDeviation: pct, advice: HRV_MODULATION_META[band].advice }
}

// ─── Maintenance protocol — weekly checklist ─────────────────────────────────

export type MaintenanceInput = {
  cardioMinutesThisWeek?: number | null
  strengthSessionsThisWeek?: number | null
  sleep7dAvg?: number | null
  /** 7-day average protein intake, g/day (days with logged meals). */
  protein7dAvgG?: number | null
  /** Body weight, kg — used for the 1.2 g/kg protein floor. */
  bodyWeightKg?: number | null
  /** Days (of the last 7) that hit the water target. */
  hydrationHitDays?: number | null
  waistCm?: number | null
  heightCm?: number | null
  /** Distinct days this week with any vitals check-in metric logged. */
  vitalsCheckinsThisWeek?: number | null
  /** Resting HR trend: last-7-day avg minus previous-7-day avg (bpm). */
  restingHrDelta?: number | null
}

export type MaintenanceItem = {
  id: string
  label: string
  /** Pre-formatted current value, or null when no data. */
  value: string | null
  /** Pre-formatted target for display. */
  targetLabel: string
  status: "met" | "behind" | "nodata"
  citation: string
  note?: string
}

/** Weekly maintenance protocol — eight honest checks, each with its source. */
export function maintenanceChecklist(input: MaintenanceInput): MaintenanceItem[] {
  const items: MaintenanceItem[] = []

  const has = (v: number | null | undefined): v is number => v !== undefined && v !== null

  items.push({
    id: "cardio-minutes",
    label: "150+ min moderate cardio this week",
    value: has(input.cardioMinutesThisWeek) ? String(Math.round(input.cardioMinutesThisWeek)) : null,
    targetLabel: "150 min",
    status: !has(input.cardioMinutesThisWeek) ? "nodata" : input.cardioMinutesThisWeek >= 150 ? "met" : "behind",
    citation: "WHO 2020 physical activity guidelines",
  })

  items.push({
    id: "strength-sessions",
    label: "2+ strength / bodyweight sessions this week",
    value: has(input.strengthSessionsThisWeek) ? String(input.strengthSessionsThisWeek) : null,
    targetLabel: "2 sessions",
    status: !has(input.strengthSessionsThisWeek) ? "nodata" : input.strengthSessionsThisWeek >= 2 ? "met" : "behind",
    citation: "WHO 2020 physical activity guidelines",
  })

  items.push({
    id: "sleep-window",
    label: "7–9 h sleep, 7-day average",
    value: has(input.sleep7dAvg) ? (Math.round(input.sleep7dAvg * 10) / 10).toFixed(1) : null,
    targetLabel: "7–9 h",
    status: !has(input.sleep7dAvg)
      ? "nodata"
      : input.sleep7dAvg >= 7 && input.sleep7dAvg <= 9
        ? "met"
        : "behind",
    citation: "Cappuccio et al. 2010 meta-analysis (Sleep)",
  })

  const gPerKg =
    input.protein7dAvgG != null && input.bodyWeightKg != null && input.bodyWeightKg > 0
      ? input.protein7dAvgG / input.bodyWeightKg
      : null
  items.push({
    id: "protein-floor",
    label: "Protein ≥ 1.2 g/kg, 7-day average",
    value: gPerKg !== null ? `${(Math.round(gPerKg * 100) / 100).toFixed(2)} g/kg` : null,
    targetLabel: "≥ 1.2 g/kg",
    status: gPerKg === null ? "nodata" : gPerKg >= 1.2 ? "met" : "behind",
    citation: "Morton et al. 2018 (BJSM) — gains plateau ~1.6 g/kg/d; 1.2 is a practical floor",
  })

  items.push({
    id: "hydration-days",
    label: "Hit the water target 5+ of the last 7 days",
    value: has(input.hydrationHitDays) ? `${input.hydrationHitDays}/7 days` : null,
    targetLabel: "5+ days",
    status: !has(input.hydrationHitDays) ? "nodata" : input.hydrationHitDays >= 5 ? "met" : "behind",
    citation:
      "EFSA 2010 adequate intake — 2.0 L/day (women) / 2.5 L/day (men) total water; the 35 ml/kg app heuristic sits within that AI range",
  })

  const whtr =
    input.waistCm != null && input.heightCm != null && input.heightCm > 0
      ? input.waistCm / input.heightCm
      : null
  items.push({
    id: "waist-height",
    label: "Waist less than half your height",
    value: whtr !== null ? (Math.round(whtr * 100) / 100).toFixed(2) : null,
    targetLabel: "< 0.50",
    status: whtr === null ? "nodata" : whtr < 0.5 ? "met" : "behind",
    citation: "Ashwell et al. 2012 (BMJ Open) — keep your waist under half your height",
  })

  items.push({
    id: "vitals-checkin",
    label: "1+ vitals check-in this week",
    value: has(input.vitalsCheckinsThisWeek) ? String(input.vitalsCheckinsThisWeek) : null,
    targetLabel: "1 check-in",
    status: !has(input.vitalsCheckinsThisWeek) ? "nodata" : input.vitalsCheckinsThisWeek >= 1 ? "met" : "behind",
    citation: "Habit metric — self-monitoring adherence, not a clinical guideline",
  })

  items.push({
    id: "resting-hr-trend",
    label: "Resting HR trend stable or improving",
    value: has(input.restingHrDelta)
      ? `${input.restingHrDelta > 0 ? "+" : ""}${Math.round(input.restingHrDelta * 10) / 10} bpm`
      : null,
    targetLabel: "≤ +2 bpm",
    status: !has(input.restingHrDelta) ? "nodata" : input.restingHrDelta <= 2 ? "met" : "behind",
    citation: "7-day vs previous 7-day comparison — note only, not a threshold diagnosis",
    note: "Trend vs previous week — smaller or negative is improving.",
  })

  return items
}
