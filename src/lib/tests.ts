// ─── PRIME · Fitness testing library — protocols, formulas, norm tables ───────
// Pure data + pure functions only (safe to import from client components).
// Science-based self-tests: VO₂ max estimation (Cooper 12-min run / Rockport
// 1-mile walk), muscular endurance (push-ups, plank), flexibility (sit & reach),
// plus approximate norm bands by age decade + sex.

export type Sex = "male" | "female"

// ─── 1 · Cooper 12-minute run → VO₂ max ───────────────────────────────────────

export const COOPER_DISTANCE_MIN_M = 400
export const COOPER_DISTANCE_MAX_M = 5000

/**
 * Cooper 12-minute run → VO₂ max estimate in ml/kg/min.
 * Formula: (distanceM − 504.9) / 44.73 — Cooper KH, JAMA 1968.
 * Guard: valid for distances of 400–5000 m; returns null outside that range.
 */
export function cooperVo2(distanceM: number): number | null {
  if (!Number.isFinite(distanceM)) return null
  if (distanceM < COOPER_DISTANCE_MIN_M || distanceM > COOPER_DISTANCE_MAX_M) return null
  return Math.round(((distanceM - 504.9) / 44.73) * 100) / 100
}

// ─── 2 · Rockport 1-mile brisk walk → VO₂ max ─────────────────────────────────

export type RockportInput = {
  weightKg: number
  age: number
  male: boolean
  /** 1-mile walk time in minutes (guard: 8–40). */
  minutes: number
  /** Immediate post-walk heart rate in bpm (guard: 80–200). */
  hr: number
}

export const ROCKPORT_MINUTES_MIN = 8
export const ROCKPORT_MINUTES_MAX = 40
export const ROCKPORT_HR_MIN = 80
export const ROCKPORT_HR_MAX = 200

/**
 * Rockport 1-mile brisk walk → VO₂ max estimate in ml/kg/min.
 * Kline GM et al., Med Sci Sports Exerc 1987:
 * 132.853 − 0.0769×weight(lb) − 0.3877×age + 6.315×(male?1:0) − 3.2649×minutes − 0.1565×hr
 * Guards: minutes 8–40, heart rate 80–200 bpm. Returns null when out of range.
 */
export function rockportVo2(input: RockportInput): number | null {
  const { weightKg, age, male, minutes, hr } = input
  if (![weightKg, age, minutes, hr].every((n) => Number.isFinite(n))) return null
  if (minutes < ROCKPORT_MINUTES_MIN || minutes > ROCKPORT_MINUTES_MAX) return null
  if (hr < ROCKPORT_HR_MIN || hr > ROCKPORT_HR_MAX) return null
  if (weightKg <= 0 || age <= 0) return null
  const weightLb = weightKg * 2.20462
  const vo2 =
    132.853 -
    0.0769 * weightLb -
    0.3877 * age +
    6.315 * (male ? 1 : 0) -
    3.2649 * minutes -
    0.1565 * hr
  return Math.round(vo2 * 100) / 100
}

// ─── 3 · VO₂ max norm bands (approximate ACSM percentile bands) ───────────────

export type BandResult = {
  /** Band label, e.g. "Excellent". */
  label: string
  /** Approximate percentile rank of the band (VO₂ norms only). */
  pct?: number
  /** Where these norms come from — surfaced in the UI next to the band. */
  source: string
}

export const VO2_NORM_SOURCE = "ACSM approximate norms"

/** Kodama et al. 2009 JAMA meta-analysis — CRF context line shown with VO₂ results. */
export const CRF_CONTEXT =
  "Each 1-MET (~3.5 ml/kg/min) improvement in cardiorespiratory fitness ≈ 10–25% lower all-cause mortality (Kodama et al. 2009, JAMA meta-analysis)."

/** Band lower bounds by decade start (20 = ages 20–29 … 60 = ages 60–69). */
export type Vo2NormRow = {
  poor: number
  fair: number
  good: number
  excellent: number
  superior: number
}

/** Approximate ACSM-style VO₂ max percentile bands, ml/kg/min, by decade + sex. */
export const VO2_NORMS: Record<Sex, Record<number, Vo2NormRow>> = {
  male: {
    20: { poor: 32, fair: 38, good: 44, excellent: 48, superior: 54 },
    30: { poor: 30, fair: 35, good: 39, excellent: 43, superior: 48 },
    40: { poor: 27, fair: 32, good: 36, excellent: 39, superior: 45 },
    50: { poor: 24, fair: 28, good: 32, excellent: 35, superior: 40 },
    60: { poor: 21, fair: 25, good: 28, excellent: 31, superior: 37 },
  },
  female: {
    20: { poor: 27, fair: 32, good: 37, excellent: 41, superior: 47 },
    30: { poor: 25, fair: 29, good: 33, excellent: 37, superior: 42 },
    40: { poor: 22, fair: 26, good: 30, excellent: 33, superior: 39 },
    50: { poor: 20, fair: 23, good: 28, excellent: 31, superior: 36 },
    60: { poor: 17, fair: 21, good: 25, excellent: 28, superior: 33 },
  },
}

function decadeStart(age: number): number {
  return Math.min(60, Math.max(20, Math.floor(age / 10) * 10))
}

/**
 * VO₂ max → approximate ACSM percentile band for the hunter's age decade + sex.
 * pct is the approximate percentile rank of the band (5 / 20 / 45 / 70 / 90 / 98).
 */
export function vo2Band(vo2: number, age: number, sex: Sex): BandResult {
  if (!Number.isFinite(vo2)) return { label: "—", source: VO2_NORM_SOURCE }
  const a = Number.isFinite(age) ? age : 30
  const row = VO2_NORMS[sex][decadeStart(a)]
  if (vo2 < row.poor) return { label: "Very Poor", pct: 5, source: VO2_NORM_SOURCE }
  if (vo2 < row.fair) return { label: "Poor", pct: 20, source: VO2_NORM_SOURCE }
  if (vo2 < row.good) return { label: "Fair", pct: 45, source: VO2_NORM_SOURCE }
  if (vo2 < row.excellent) return { label: "Good", pct: 70, source: VO2_NORM_SOURCE }
  if (vo2 < row.superior) return { label: "Excellent", pct: 90, source: VO2_NORM_SOURCE }
  return { label: "Superior", pct: 98, source: VO2_NORM_SOURCE }
}

// ─── 4 · Push-up norm bands ───────────────────────────────────────────────────

export const PUSHUP_NORM_SOURCE = "Commonly cited ACSM-style norms, approximate"

/** Band lower bounds by decade start (reps). "Poor" = anything below belowAverage. */
export type PushupNormRow = {
  belowAverage: number
  average: number
  good: number
  excellent: number
}

/** Commonly cited ACSM-style max push-up norms by decade + sex (reps). */
export const PUSHUP_NORMS: Record<Sex, Record<number, PushupNormRow>> = {
  male: {
    20: { belowAverage: 20, average: 35, good: 45, excellent: 54 },
    30: { belowAverage: 15, average: 24, good: 35, excellent: 44 },
    40: { belowAverage: 12, average: 20, good: 30, excellent: 39 },
    50: { belowAverage: 8, average: 15, good: 25, excellent: 34 },
    60: { belowAverage: 5, average: 10, good: 20, excellent: 29 },
  },
  female: {
    20: { belowAverage: 10, average: 17, good: 34, excellent: 48 },
    30: { belowAverage: 8, average: 12, good: 25, excellent: 39 },
    40: { belowAverage: 6, average: 8, good: 20, excellent: 34 },
    50: { belowAverage: 5, average: 7, good: 15, excellent: 29 },
    60: { belowAverage: 3, average: 5, good: 11, excellent: 20 },
  },
}

/** Max push-up reps → band for the age decade + sex. */
export function pushupBand(reps: number, age: number, sex: Sex): BandResult {
  if (!Number.isFinite(reps)) return { label: "—", source: PUSHUP_NORM_SOURCE }
  const a = Number.isFinite(age) ? age : 30
  const row = PUSHUP_NORMS[sex][decadeStart(a)]
  if (reps < row.belowAverage) return { label: "Poor", source: PUSHUP_NORM_SOURCE }
  if (reps < row.average) return { label: "Below Average", source: PUSHUP_NORM_SOURCE }
  if (reps < row.good) return { label: "Average", source: PUSHUP_NORM_SOURCE }
  if (reps < row.excellent) return { label: "Good", source: PUSHUP_NORM_SOURCE }
  return { label: "Excellent", source: PUSHUP_NORM_SOURCE }
}

// ─── 5 · Plank norm bands ─────────────────────────────────────────────────────

export const PLANK_NORM_SOURCE = "General benchmarks — plank norms are not standardized"

/**
 * Plank hold seconds → band. General benchmarks (not sex- or age-standardized):
 * <30 s poor · 30–60 s fair · 60–120 s good · ≥120 s excellent.
 */
export function plankBand(sec: number, _sex: Sex): BandResult {
  if (!Number.isFinite(sec)) return { label: "—", source: PLANK_NORM_SOURCE }
  if (sec < 30) return { label: "Poor", source: PLANK_NORM_SOURCE }
  if (sec < 60) return { label: "Fair", source: PLANK_NORM_SOURCE }
  if (sec < 120) return { label: "Good", source: PLANK_NORM_SOURCE }
  return { label: "Excellent", source: PLANK_NORM_SOURCE }
}

// ─── 6 · Sit & reach norm bands ───────────────────────────────────────────────

export const SIT_REACH_NORM_SOURCE = "General bands, approximate — scale relative to your toes"

/**
 * Sit & reach → band on the relative-to-toes scale (negative = short of toes,
 * 0 = fingertips at toes, positive = past toes). Approximate general bands:
 * <−5 poor · −5..0 fair · 0..+10 average · +10..+20 good · ≥+20 excellent.
 */
export function sitReachBand(cm: number, _sex: Sex): BandResult {
  if (!Number.isFinite(cm)) return { label: "—", source: SIT_REACH_NORM_SOURCE }
  if (cm < -5) return { label: "Poor", source: SIT_REACH_NORM_SOURCE }
  if (cm < 0) return { label: "Fair", source: SIT_REACH_NORM_SOURCE }
  if (cm < 10) return { label: "Average", source: SIT_REACH_NORM_SOURCE }
  if (cm < 20) return { label: "Good", source: SIT_REACH_NORM_SOURCE }
  return { label: "Excellent", source: SIT_REACH_NORM_SOURCE }
}

// ─── 7 · Protocol metadata ────────────────────────────────────────────────────

/** Shared safety note — maximal-ish self-tests carry real risk. */
export const SAFETY_NOTE =
  "Stop immediately if you feel chest pain, dizziness or nausea. These are fitness estimates, not medical clearance — consult a clinician before maximal testing."

export type TestFieldKind = "number" | "sex"

export type TestField = {
  key: string
  label: string
  placeholder?: string
  /** Display suffix inside the input (e.g. "m", "bpm"). */
  unit?: string
  /** Numeric input step. */
  step?: number
  /** Input kind — "sex" renders a male/female toggle. Defaults to "number". */
  kind?: TestFieldKind
}

export type TestId = "cooper" | "rockport" | "pushup" | "plank" | "sitreach"

export type TestMeta = {
  id: TestId
  name: string
  /** Metric type written to POST /api/metrics. */
  metricType: "vo2max" | "pushupReps" | "plankSec" | "sitReachCm"
  unit: string
  /** One-line picker summary. */
  summary: string
  fields: TestField[]
  /** 3–5 how-to steps. */
  protocol: string[]
  safety: string
  citation: string
}

export const TESTS: readonly TestMeta[] = [
  {
    id: "cooper",
    name: "Cooper 12-Minute Run",
    metricType: "vo2max",
    unit: "ml/kg/min",
    summary: "Estimate VO₂ max from how far you run in 12 minutes.",
    fields: [
      { key: "distanceM", label: "Distance covered", placeholder: "2800", unit: "m", step: 10 },
      { key: "age", label: "Age", placeholder: "30", unit: "yr" },
      { key: "sex", label: "Sex", kind: "sex" },
    ],
    protocol: [
      "Find a flat, measured route or track — a 400 m lap works well.",
      "Warm up 5–10 minutes with easy jogging and dynamic stretches.",
      "Start the clock and cover as much distance as you can in exactly 12 minutes — pace evenly, don't sprint the start.",
      "Note the total distance covered to the nearest 10 m, then cool down.",
      "Enter the distance below — VO₂ max is estimated as (distance − 504.9) / 44.73.",
    ],
    safety: SAFETY_NOTE,
    citation: "Cooper KH, JAMA 1968 — 12-minute run test",
  },
  {
    id: "rockport",
    name: "Rockport 1-Mile Walk",
    metricType: "vo2max",
    unit: "ml/kg/min",
    summary: "Sub-maximal VO₂ max estimate from a brisk 1-mile walk + heart rate.",
    fields: [
      { key: "minutes", label: "Walk time", placeholder: "14.5", unit: "min", step: 0.5 },
      { key: "hr", label: "Heart rate right after", placeholder: "145", unit: "bpm" },
      { key: "weightKg", label: "Body weight", placeholder: "70", unit: "kg", step: 0.5 },
      { key: "age", label: "Age", placeholder: "30", unit: "yr" },
      { key: "sex", label: "Sex", kind: "sex" },
    ],
    protocol: [
      "Measure out a flat 1-mile (1609 m) course.",
      "Warm up 5 minutes with easy walking.",
      "Walk the mile as fast as you can — always keep one foot on the ground (no jogging).",
      "Take your heart rate immediately at the finish (count 15 s × 4, or use a monitor).",
      "Enter the walk time and that immediate heart rate below.",
    ],
    safety: SAFETY_NOTE,
    citation: "Kline GM et al., Med Sci Sports Exerc 1987 — 1-mile track walk",
  },
  {
    id: "pushup",
    name: "Push-Up Test",
    metricType: "pushupReps",
    unit: "reps",
    summary: "Max consecutive push-ups — upper-body muscular endurance.",
    fields: [
      { key: "reps", label: "Reps completed", placeholder: "35", unit: "reps" },
      { key: "age", label: "Age", placeholder: "30", unit: "yr" },
      { key: "sex", label: "Sex", kind: "sex" },
    ],
    protocol: [
      "Assume a standard position — hands shoulder-width apart, body in one straight line.",
      "Lower until your elbows bend to about 90° and your chest is near the floor.",
      "Perform maximum consecutive reps without resting or pausing longer than 2 s.",
      "Count only clean reps — stop when your form breaks.",
    ],
    safety: SAFETY_NOTE,
    citation: "Commonly cited ACSM-style norms, approximate",
  },
  {
    id: "plank",
    name: "Plank Hold",
    metricType: "plankSec",
    unit: "s",
    summary: "Max hold — core endurance benchmark.",
    fields: [
      { key: "seconds", label: "Hold time", placeholder: "90", unit: "s" },
      { key: "sex", label: "Sex", kind: "sex" },
    ],
    protocol: [
      "Set up on your forearms with elbows under shoulders and body straight.",
      "Hold the position without letting your hips sag or pike upward.",
      "Keep breathing normally and start the timer.",
      "Stop the moment your form breaks and enter the seconds held below.",
    ],
    safety: SAFETY_NOTE,
    citation: "General benchmarks — plank norms are not standardized",
  },
  {
    id: "sitreach",
    name: "Sit & Reach",
    metricType: "sitReachCm",
    unit: "cm",
    summary: "Flexibility benchmark measured relative to your toes.",
    fields: [
      { key: "cm", label: "Reach past toes", placeholder: "0", unit: "cm", step: 0.5 },
      { key: "sex", label: "Sex", kind: "sex" },
    ],
    protocol: [
      "Sit with legs straight and feet about hip-width against a box or step.",
      "Keep your knees straight, hands stacked, and reach forward slowly — no bouncing.",
      "Hold the farthest point for ~2 s. Zero means fingertips exactly at your toes.",
      "Take the best of 3 attempts and enter cm beyond (or short of) your toes below.",
    ],
    safety: SAFETY_NOTE,
    citation: "General bands, approximate — relative to toes",
  },
]

/** Lookup helper for TESTS by id. */
export function testById(id: string): TestMeta | undefined {
  return TESTS.find((t) => t.id === id)
}

// ─── 8 · Commit ranges (mirror /api/metrics server validation) ────────────────

export type MetricRange = { min: number; max: number; message: string }

export const TEST_METRIC_RANGES: Record<string, MetricRange> = {
  vo2max: { min: 10, max: 80, message: "VO₂ max must be between 10 and 80 ml/kg/min." },
  pushupReps: { min: 0, max: 200, message: "Push-up reps must be between 0 and 200." },
  plankSec: { min: 0, max: 600, message: "Plank hold must be between 0 and 600 seconds." },
  sitReachCm: { min: -20, max: 60, message: "Sit & reach must be between -20 and 60 cm." },
}
