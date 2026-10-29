import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn, keyBefore, weekStartKeyIn } from "@/lib/game"
import { ensureDeloadQuest, grantXp, requireHunter } from "@/lib/engine"
import { DEFAULT_PROFILE, calcTargets, hunterProfile } from "@/lib/nutrition"
import { mapExerciseToMuscles } from "@/lib/muscles"
import { epleyE1rm, validE1rmSet } from "@/lib/strength-science"
import { vo2Band } from "@/lib/tests"
import type {
  ActivityVitals,
  BalanceInsight,
  BodyCompInsight,
  DeloadInsight,
  EnergyInsight,
  HeartInsight,
  HrZone,
  HydrationInsight,
  InsightZone,
  InsightsDTO,
  LiftProgression,
  ProteinInsight,
  SleepInsight,
  StrengthInsight,
  StrengthLift,
} from "@/lib/types"
import type { BodyMetric, ExerciseLog, Hunter, PersonalBest, WorkoutSession } from "@prisma/client"

export const dynamic = "force-dynamic"

const DAY = 86_400_000

// ─── Small helpers ────────────────────────────────────────────────────────────

function r1(v: number): number {
  return Math.round(v * 10) / 10
}

/**
 * R69 — yyyy-mm-dd day keys for [today-(n-1) .. today] in the hunter's
 * timezone (DST-safe keyBefore chain — the /api/readiness R68 dayAgoKey
 * idiom). Audit 2-a B3 residual: these 7-day windows were server-local while
 * /api/metrics + /api/nutrition WRITE hunter-tz day keys, so the windows
 * missed the day the hunter actually lived near midnight. Null tz = legacy
 * server-local (dayKeyIn's contract).
 */
function lastNDays(n: number, tz: string | null | undefined): string[] {
  const out: string[] = []
  let key = dayKeyIn(tz)
  for (let i = 0; i < n; i++) {
    out.push(key)
    key = keyBefore(key)
  }
  return out.reverse()
}

function latestMap(metrics: BodyMetric[]): Map<string, BodyMetric> {
  const latest = new Map<string, BodyMetric>()
  for (const m of metrics) {
    const prev = latest.get(m.type)
    if (!prev || m.day > prev.day || (m.day === prev.day && m.updatedAt > prev.updatedAt)) {
      latest.set(m.type, m)
    }
  }
  return latest
}

function seriesOf(metrics: BodyMetric[], type: string): { day: string; value: number }[] {
  return metrics
    .filter((m) => m.type === type)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((m) => ({ day: m.day, value: m.value }))
}

/** Linear regression slope of a day-keyed series, expressed per 7 days. */
function trendPerWeek(points: { day: string; value: number }[]): number | null {
  if (points.length < 2) return null
  const t0 = new Date(points[0].day).getTime()
  const xs = points.map((p) => (new Date(p.day).getTime() - t0) / DAY)
  const ys = points.map((p) => p.value)
  const n = xs.length
  const sx = xs.reduce((a, b) => a + b, 0)
  const sy = ys.reduce((a, b) => a + b, 0)
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0)
  const sxx = xs.reduce((a, x) => a + x * x, 0)
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  return Math.round(((n * sxy - sx * sy) / denom) * 7 * 100) / 100
}

/** R69 — Monday-based ISO week start key in the hunter's timezone
 *  (weekStartKeyIn — game.ts's R38 primitive; null tz = legacy server-local). */
function weekStartOf(d: Date, tz: string | null | undefined): string {
  return weekStartKeyIn(tz, d)
}

// ─── Body composition (US Navy tape method) ───────────────────────────────────

const BF_ZONES_MALE: InsightZone[] = [
  { label: "Essential", min: 2, max: 5 },
  { label: "Athletic", min: 6, max: 13 },
  { label: "Fitness", min: 14, max: 17 },
  { label: "Average", min: 18, max: 24 },
  { label: "Above", min: 25, max: 50 },
]

const BF_ZONES_FEMALE: InsightZone[] = [
  { label: "Essential", min: 10, max: 13 },
  { label: "Athletic", min: 14, max: 20 },
  { label: "Fitness", min: 21, max: 24 },
  { label: "Average", min: 25, max: 31 },
  { label: "Above", min: 32, max: 60 },
]

function navyBodyFat(sex: string, heightCm: number, waist: number, neck: number, hips: number | null): number | null {
  const female = sex === "female"
  if (!female && waist > neck) {
    const bf =
      495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450
    return Math.min(60, Math.max(3, r1(bf)))
  }
  if (female && hips && waist + hips > neck) {
    const bf =
      495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(heightCm)) - 450
    return Math.min(60, Math.max(8, r1(bf)))
  }
  return null
}

function bodyCompInsight(h: Hunter, metrics: BodyMetric[]): BodyCompInsight {
  const female = h.sex === "female"
  const heightCm = h.heightCm ?? DEFAULT_PROFILE.heightCm
  const weightKg = h.weightKg ?? null
  const latest = latestMap(metrics)

  const missing: string[] = []
  const waist = latest.get("waist")?.value ?? null
  const neck = latest.get("neck")?.value ?? null
  const hips = latest.get("hips")?.value ?? null
  if (waist === null) missing.push("waist")
  if (neck === null) missing.push("neck")
  if (female && hips === null) missing.push("hips")

  const bf = missing.length === 0 ? navyBodyFat(h.sex ?? "male", heightCm, waist!, neck!, hips) : null
  const zones = female ? BF_ZONES_FEMALE : BF_ZONES_MALE
  const category = bf === null ? null : (zones.find((z) => bf >= z.min && bf <= z.max)?.label ?? null)

  // Historical reconstruction: days where every required tape input exists
  const series: { day: string; bodyFatPct: number }[] = []
  if (missing.length === 0) {
    const byDay = new Map<string, { waist?: number; neck?: number; hips?: number }>()
    for (const m of metrics) {
      if (m.type !== "waist" && m.type !== "neck" && m.type !== "hips") continue
      const slot = byDay.get(m.day) ?? {}
      if (m.type === "waist") slot.waist = m.value
      if (m.type === "neck") slot.neck = m.value
      if (m.type === "hips") slot.hips = m.value
      byDay.set(m.day, slot)
    }
    for (const [day, slot] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (slot.waist === undefined || slot.neck === undefined) continue
      if (female && slot.hips === undefined) continue
      const v = navyBodyFat(h.sex ?? "male", heightCm, slot.waist, slot.neck, slot.hips ?? null)
      if (v !== null) series.push({ day, bodyFatPct: v })
    }
  }

  const hMeters = heightCm / 100
  const ideal: [number, number] = [r1(18.5 * hMeters * hMeters), r1(25 * hMeters * hMeters)]

  // Goal-derived target body-fat % (research zone midpoints by sex + goal)
  const goal = h.goal ?? DEFAULT_PROFILE.goal
  const fitnessMid = female ? 22.5 : 15.5
  const goalPct = goal === "bulk" ? (female ? 27 : 20) : fitnessMid // cut + maintain anchor to Fitness mid
  const goalZoneLabel =
    goalPct === null ? null : (zones.find((z) => goalPct >= z.min && goalPct <= z.max)?.label ?? null)
  const deltaToGoal = bf !== null && goalPct !== null ? Math.round((bf - goalPct) * 10) / 10 : null
  const fatTrend =
    series.length >= 2 ? trendPerWeek(series.map((p) => ({ day: p.day, value: p.bodyFatPct }))) : null

  // Goal reached = current BF at or below the target (celebrate flag set by GET on first crossing)
  const goalReached = bf !== null && goalPct !== null && bf <= goalPct

  return {
    available: bf !== null,
    missing,
    sex: female ? "female" : "male",
    heightCm,
    bodyFatPct: bf,
    category,
    zones,
    leanMassKg: bf !== null && weightKg ? r1(weightKg * (1 - bf / 100)) : null,
    fatMassKg: bf !== null && weightKg ? r1(weightKg * (bf / 100)) : null,
    weightKg,
    idealRange: ideal,
    series: series.slice(-30),
    goalPct,
    goalZoneLabel,
    deltaToGoal,
    fatTrendPctPerWeek: fatTrend,
    goalReached,
    celebrate: false,
  }
}

// ─── Heart health (RHR → zones, VO2max) ───────────────────────────────────────

function heartInsight(h: Hunter, metrics: BodyMetric[]): HeartInsight {
  const birthYear = h.birthYear ?? DEFAULT_PROFILE.birthYear
  const age = Math.min(80, Math.max(15, new Date().getFullYear() - birthYear))
  const hrMax = Math.round(208 - 0.7 * age) // Tanaka
  const female = h.sex === "female"

  const rhrSeries = seriesOf(metrics, "restingHr")
  const rhr = rhrSeries.length > 0 ? rhrSeries[rhrSeries.length - 1].value : null

  let rhrRating: string | null = null
  if (rhr !== null) {
    if (rhr <= 50) rhrRating = "Athlete"
    else if (rhr <= 60) rhrRating = "Excellent"
    else if (rhr <= 70) rhrRating = "Good"
    else if (rhr <= 80) rhrRating = "Average"
    else rhrRating = "Below average"
  }

  // Uth–Sørensen–Overgaard–Pedersen estimate
  const vo2 = rhr !== null ? Math.round(15.3 * (hrMax / rhr)) : null
  // R68 — rating reuses tests.ts vo2Band (the app's ACSM sex-specific,
  // age-decade norms) so Test Lab and Insights rate the same VO₂ identically
  // for the same sex (audit 2-a B7: the old hand-rolled female −5 shift +
  // male bands was backwards vs ACSM female norms and split-brained the two
  // surfaces).
  const vo2Rating = vo2 !== null ? vo2Band(vo2, age, female ? "female" : "male").label : null

  // Karvonen zones when RHR is known; pure %HRmax otherwise
  const useKarvonen = rhr !== null && rhr < hrMax - 20
  const hrr = useKarvonen && rhr !== null ? hrMax - rhr : null
  const zoneAt = (pct: number): number =>
    hrr !== null && rhr !== null ? Math.round(rhr + hrr * pct) : Math.round(hrMax * pct)

  const zones: HrZone[] = [
    { id: "z1", label: "Z1 · Recovery", low: zoneAt(0.5), high: zoneAt(0.6), desc: "Warm-up, active recovery, fat oxidation" },
    { id: "z2", label: "Z2 · Endurance", low: zoneAt(0.6), high: zoneAt(0.7), desc: "Conversational base building" },
    { id: "z3", label: "Z3 · Cardio", low: zoneAt(0.7), high: zoneAt(0.8), desc: "Aerobic power, tempo work" },
    { id: "z4", label: "Z4 · Threshold", low: zoneAt(0.8), high: zoneAt(0.9), desc: "Lactate threshold, hard intervals" },
    { id: "z5", label: "Z5 · Sprint", low: zoneAt(0.9), high: hrMax, desc: "VO2max efforts, 30s–2min bursts" },
  ]

  return {
    restingHr: rhr,
    restingHrSeries: rhrSeries.slice(-30),
    restingHrRating: rhrRating,
    hrMax,
    vo2max: vo2,
    vo2maxRating: vo2Rating,
    zones,
    method: useKarvonen ? "Karvonen (HRR)" : "%HRmax",
  }
}

// ─── Strength standards (Symmetric-Strength-inspired scales) ──────────────────

type LiftDef = {
  key: string
  label: string
  kind: "barbell" | "bodyweight"
  match: (name: string) => boolean
  male: number[]
  female: number[]
}

const LEVELS = ["Untrained", "Novice", "Intermediate", "Advanced", "Elite"]
const LEVEL_ANCHOR = [10, 30, 50, 75, 95] // percentile anchors per level index

const LIFTS: LiftDef[] = [
  {
    key: "bench",
    label: "Bench Press",
    kind: "barbell",
    match: (n) => n.includes("bench"),
    male: [0.5, 0.75, 1.0, 1.5, 2.0],
    female: [0.3, 0.5, 0.7, 1.0, 1.35],
  },
  {
    key: "squat",
    label: "Back Squat",
    kind: "barbell",
    match: (n) => n.includes("squat") && !n.includes("bodyweight"),
    male: [0.75, 1.25, 1.5, 2.0, 2.5],
    female: [0.5, 0.85, 1.1, 1.5, 2.0],
  },
  {
    key: "deadlift",
    label: "Deadlift",
    kind: "barbell",
    match: (n) => n.includes("deadlift"),
    male: [1.0, 1.5, 2.0, 2.5, 3.0],
    female: [0.7, 1.0, 1.35, 1.8, 2.3],
  },
  {
    key: "ohp",
    label: "Overhead Press",
    kind: "barbell",
    match: (n) => n.includes("overhead press") || n.includes("ohp") || n.includes("shoulder press"),
    male: [0.35, 0.55, 0.8, 1.1, 1.5],
    female: [0.22, 0.35, 0.55, 0.75, 1.0],
  },
  {
    key: "row",
    label: "Barbell Row",
    kind: "barbell",
    match: (n) => n.includes("row") && !n.includes("rowing machine"),
    male: [0.5, 0.75, 1.05, 1.4, 1.8],
    female: [0.32, 0.5, 0.7, 1.0, 1.3],
  },
  {
    key: "pullup",
    label: "Pull-up",
    kind: "bodyweight",
    match: (n) => n.includes("pull-up") || n.includes("pullup") || n.includes("chin"),
    male: [0, 3, 7, 12, 18],
    female: [0, 1, 4, 8, 13],
  },
  {
    key: "pushup",
    label: "Push-up",
    kind: "bodyweight",
    match: (n) =>
      (n.includes("push-up") || n.includes("pushup")) &&
      !n.includes("pike") &&
      !n.includes("ladder") &&
      !n.includes("handstand"),
    male: [5, 15, 30, 50, 75],
    female: [3, 10, 20, 35, 55],
  },
  {
    key: "dip",
    label: "Dip",
    kind: "bodyweight",
    match: (n) => n.includes("dip"),
    male: [1, 5, 12, 22, 32],
    female: [0, 2, 6, 12, 20],
  },
]

function epley1rm(pr: PersonalBest): number {
  // bestValue is the weight (kg PRs) — reps come from the record context
  let reps = 1
  if (pr.context) {
    try {
      const c = JSON.parse(pr.context) as { reps?: number }
      if (typeof c.reps === "number" && c.reps > 0) reps = Math.round(c.reps)
    } catch {
      // context malformed — fall back to a single rep
    }
  }
  // R69 — the one Epley core (lib/strength-science): the r=1 identity pin
  // kills the +3.3% inflation a context-less or single-rep record carried
  // (100 kg read 103.3 before); out-of-domain records (13+ reps) contribute
  // their raw weight as an e1RM LOWER BOUND (the R68 PR-pace precedent —
  // a heaviest-set weight is already a lower bound on e1RM), never the
  // inflated extrapolation the old reps≤30 clamp produced.
  const w = pr.bestValue
  if (!validE1rmSet(reps, w)) return Math.round(w * 10) / 10
  return Math.round(epleyE1rm(w, reps) * 10) / 10
}

function strengthInsight(h: Hunter, records: PersonalBest[]): StrengthInsight {
  const female = h.sex === "female"
  const isDefaultBw = h.weightKg === null
  const bw = h.weightKg ?? DEFAULT_PROFILE.weightKg
  const scale = female ? "female" : "male"

  const lifts: StrengthLift[] = LIFTS.map((def) => {
    const pr = records.find((r) => def.match(r.name)) ?? null
    const standards = def[scale].map((v, i) => ({
      label: LEVELS[i],
      value: def.kind === "barbell" ? Math.round(v * bw) : v,
    }))

    if (!pr) {
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        matched: false,
        exerciseName: null,
        displayValue: null,
        e1rm: null,
        ratio: null,
        levelIndex: 0,
        levelLabel: LEVELS[0],
        progressPct: 0,
        standards,
      }
    }

    let ratio: number | null = null
    let e1rm: number | null = null
    let displayValue: string | null = null

    if (def.kind === "barbell" && pr.unit === "kg") {
      e1rm = epley1rm(pr)
      ratio = Math.round((e1rm / bw) * 100) / 100
      displayValue = `${e1rm} kg e1RM`
    } else if (pr.unit === "reps") {
      ratio = pr.bestValue
      displayValue = `${Math.round(pr.bestValue)} reps`
    }

    const cutoffs = def[scale]
    let levelIndex = 0
    if (ratio !== null) {
      for (let i = cutoffs.length - 1; i >= 0; i--) {
        if (ratio >= cutoffs[i]) {
          levelIndex = i
          break
        }
      }
    }

    // progress across the full Untrained→Elite band
    const floor = cutoffs[0]
    const ceiling = cutoffs[cutoffs.length - 1]
    let progressPct = 0
    if (ratio !== null && ceiling > floor) {
      progressPct = Math.min(100, Math.max(0, ((ratio - floor) / (ceiling - floor)) * 100))
    }
    progressPct = Math.round(progressPct)

    return {
      key: def.key,
      label: def.label,
      kind: def.kind,
      matched: true,
      exerciseName: pr.displayName,
      displayValue,
      e1rm,
      ratio,
      levelIndex,
      levelLabel: LEVELS[levelIndex],
      progressPct,
      standards,
    }
  })

  const matched = lifts.filter((l) => l.matched && l.ratio !== null)
  let overallScore: number | null = null
  if (matched.length > 0) {
    let acc = 0
    for (const l of matched) {
      const def = LIFTS.find((d) => d.key === l.key)!
      const cutoffs = def[scale]
      const anchor = LEVEL_ANCHOR[l.levelIndex]
      const nextIdx = l.levelIndex + 1
      if (nextIdx < cutoffs.length && l.ratio !== null) {
        const lo = cutoffs[l.levelIndex]
        const hi = cutoffs[nextIdx]
        const frac = hi > lo ? Math.min(1, (l.ratio - lo) / (hi - lo)) : 0
        acc += anchor + frac * (LEVEL_ANCHOR[nextIdx] - anchor)
      } else {
        acc += anchor
      }
    }
    overallScore = Math.round(acc / matched.length)
  }
  const overallLevel =
    overallScore === null
      ? null
      : overallScore < 25
        ? "Untrained"
        : overallScore < 45
          ? "Novice"
          : overallScore < 70
            ? "Intermediate"
            : overallScore < 90
              ? "Advanced"
              : "Elite"

  return {
    bodyweightKg: bw,
    isDefaultBw,
    sex: scale,
    lifts,
    matchedCount: matched.length,
    overallScore,
    overallLevel,
  }
}

// ─── Weekly push/pull + upper/lower balance ───────────────────────────────────

const PUSH = new Set(["chest", "shoulders", "triceps"])
const PULL = new Set(["lats", "traps", "biceps", "forearms", "lower-back"])
const LOWER = new Set(["glutes", "quads", "hamstrings", "calves"])

type MovementClass = "push" | "pull" | "lower" | "core" | "other"

function classifyExercise(name: string): MovementClass {
  const mapped = mapExerciseToMuscles(name)
  if (mapped && mapped.primary.length > 0) {
    const p = mapped.primary[0]
    if (PUSH.has(p)) return "push"
    if (PULL.has(p)) return "pull"
    if (LOWER.has(p)) return "lower"
    if (p === "core") return "core"
  }
  const n = name
  if (/(push-up|pushup|bench|press|dip|thruster|swing)/.test(n)) return "push"
  if (/(pull|row|curl|carry|pulldown|chin)/.test(n)) return "pull"
  if (/(squat|lunge|deadlift|hip|glute|calf|jump|run|cycl|bike|step)/.test(n)) return "lower"
  if (/(plank|core|crunch|sit-up|burpee)/.test(n)) return "core"
  return "other"
}

function balanceInsight(sessions: { logs: { name: string; sets: number }[] }[]): BalanceInsight {
  let push = 0
  let pull = 0
  let lower = 0
  let core = 0
  for (const s of sessions) {
    for (const log of s.logs) {
      const sets = Math.max(0, log.sets)
      if (sets === 0) continue
      switch (classifyExercise(log.name)) {
        case "push":
          push += sets
          break
        case "pull":
          pull += sets
          break
        case "lower":
          lower += sets
          break
        case "core":
          core += sets
          break
      }
    }
  }

  const upper = push + pull + core
  const ppRatio = push + pull > 0 ? Math.round((push / Math.max(1, pull)) * 100) / 100 : null
  const ulRatio = upper + lower > 0 ? Math.round((upper / Math.max(1, lower)) * 100) / 100 : null

  let ppStatus: BalanceInsight["pushPullStatus"] = "unknown"
  let ppHint = "Log a workout to score your push/pull balance."
  if (ppRatio !== null && (push > 0 || pull > 0)) {
    if (ppRatio >= 0.8 && ppRatio <= 1.25) {
      ppStatus = "balanced"
      ppHint = "Push and pull volume are within the healthy 1:1 window."
    } else if (ppRatio > 1.25) {
      ppStatus = "push-heavy"
      ppHint = "Add rows, pull-ups and rear-delt work — pressing dominates your week."
    } else {
      ppStatus = "pull-heavy"
      ppHint = "Add pressing volume — pulling dominates your week."
    }
  }

  let ulStatus: BalanceInsight["upperLowerStatus"] = "unknown"
  let ulHint = "Log leg and upper-body sessions to score this ratio."
  if (ulRatio !== null && (upper > 0 || lower > 0)) {
    if (ulRatio >= 0.8 && ulRatio <= 1.8) {
      ulStatus = "balanced"
      ulHint = "Upper and lower volume are well proportioned."
    } else if (ulRatio > 1.8) {
      ulStatus = "upper-heavy"
      ulHint = "Your legs are under-trained — schedule a lower-body gate."
    } else {
      ulStatus = "lower-heavy"
      ulHint = "Upper body is lagging behind your leg volume."
    }
  }

  return {
    pushSets: push,
    pullSets: pull,
    lowerSets: lower,
    coreSets: core,
    pushPullRatio: ppRatio,
    pushPullStatus: ppStatus,
    pushPullHint: ppHint,
    upperLowerRatio: ulRatio,
    upperLowerStatus: ulStatus,
    upperLowerHint: ulHint,
  }
}

// ─── Energy balance (intake vs TDEE) + weight trend ───────────────────────────

function energyInsight(
  h: Hunter,
  nutritionLogs: { day: string; calories: number }[],
  weightSeries: { day: string; value: number }[],
  tz: string | null
): EnergyInsight {
  const profile = hunterProfile(h)
  const targets = calcTargets(profile)
  const goal = profile.goal ?? DEFAULT_PROFILE.goal
  const days = lastNDays(7, tz)

  const byDay = new Map<string, number>()
  for (const l of nutritionLogs) {
    byDay.set(l.day, (byDay.get(l.day) ?? 0) + l.calories)
  }

  const series = days.map((day) => ({
    day,
    intake: byDay.has(day) ? Math.round(byDay.get(day)!) : null,
    target: targets.calories,
  }))
  const loggedDays = series.filter((s) => s.intake !== null)
  const avg =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((a, s) => a + (s.intake ?? 0), 0) / loggedDays.length)
      : null
  const weeklyBalance = avg !== null ? Math.round((avg - targets.tdee) * 7) : null
  const targetWeeklyBalance = Math.round((targets.calories - targets.tdee) * 7)

  let status: EnergyInsight["status"] = "unknown"
  if (weeklyBalance !== null) {
    const delta = weeklyBalance - targetWeeklyBalance
    if (Math.abs(delta) <= 1000) status = "on-target"
    else if (delta < 0) status = "below-target"
    else status = "above-target"
  }

  // Linear-regression weight trend (kg/week) over the last 14 points
  let trend: number | null = null
  const pts = weightSeries.slice(-14)
  if (pts.length >= 2) {
    const t0 = new Date(pts[0].day).getTime()
    const xs = pts.map((p) => (new Date(p.day).getTime() - t0) / DAY)
    const ys = pts.map((p) => p.value)
    const n = xs.length
    const sx = xs.reduce((a, b) => a + b, 0)
    const sy = ys.reduce((a, b) => a + b, 0)
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0)
    const sxx = xs.reduce((a, x) => a + x * x, 0)
    const denom = n * sxx - sx * sx
    if (denom !== 0) trend = Math.round(((n * sxy - sx * sy) / denom) * 7 * 100) / 100
  }

  return {
    tdee: targets.tdee,
    targetCalories: targets.calories,
    goal,
    avg7Intake: avg,
    logged7Days: loggedDays.length,
    weeklyBalance,
    targetWeeklyBalance,
    status,
    weightTrendKgPerWeek: trend,
    series,
  }
}

// ─── Sleep debt + consistency ─────────────────────────────────────────────────

function sleepInsight(metrics: BodyMetric[], tz: string | null): SleepInsight {
  const days = lastNDays(7, tz)
  const daySet = new Set(days)
  const byDay = new Map<string, number>()
  for (const m of metrics) {
    if (m.type === "sleep" && daySet.has(m.day)) byDay.set(m.day, m.value)
  }
  const series = days.map((day) => ({
    day,
    value: byDay.has(day) ? byDay.get(day)! : 0,
  }))
  const logged = series.filter((s) => s.value > 0)
  const avg =
    logged.length > 0
      ? Math.round((logged.reduce((a, s) => a + s.value, 0) / logged.length) * 10) / 10
      : null
  const target = 8
  const debt =
    logged.length > 0
      ? Math.round(logged.reduce((a, s) => a + Math.max(0, target - s.value), 0) * 10) / 10
      : null

  let consistencyLabel: string | null = null
  if (logged.length >= 3) {
    const mean = logged.reduce((a, s) => a + s.value, 0) / logged.length
    const sd = Math.sqrt(logged.reduce((a, s) => a + (s.value - mean) ** 2, 0) / logged.length)
    if (sd < 0.5) consistencyLabel = "Very consistent"
    else if (sd < 1) consistencyLabel = "Consistent"
    else if (sd < 1.5) consistencyLabel = "Variable"
    else consistencyLabel = "Erratic"
  }

  let rating: string | null = null
  if (avg !== null) {
    if (avg >= 7.5) rating = "Optimal"
    else if (avg >= 6.5) rating = "Good"
    else if (avg >= 5.5) rating = "Fair"
    else rating = "Poor"
  }

  return { avg7: avg, logged7Days: logged.length, target, debtHours: debt, consistencyLabel, rating, series }
}

// ─── Protein vs bodyweight ────────────────────────────────────────────────────

function proteinInsight(
  h: Hunter,
  nutritionLogs: { day: string; protein: number }[],
  tz: string | null
): ProteinInsight {
  const profile = hunterProfile(h)
  const targets = calcTargets(profile)
  const weight = profile.weightKg ?? DEFAULT_PROFILE.weightKg
  const days = lastNDays(7, tz)
  const today = days[days.length - 1]

  const byDay = new Map<string, number>()
  for (const l of nutritionLogs) {
    byDay.set(l.day, (byDay.get(l.day) ?? 0) + l.protein)
  }
  const todayG = Math.round(byDay.get(today) ?? 0)
  const logged = days.filter((d) => (byDay.get(d) ?? 0) > 0)
  const avg7 =
    logged.length > 0 ? Math.round(logged.reduce((a, d) => a + (byDay.get(d) ?? 0), 0) / logged.length) : null
  const todayPct = Math.min(100, Math.round((todayG / targets.protein) * 100))

  return {
    targetG: targets.protein,
    gPerKg: Math.round((targets.protein / weight) * 10) / 10,
    todayG,
    todayPct,
    avg7G: avg7,
    status: todayG >= targets.protein ? "on-target" : todayG > 0 ? "under" : "unknown",
  }
}

// ─── Hydration (today + 7-day context) ────────────────────────────────────────

function hydrationInsight(
  targetMl: number,
  waterRows: { day: string; ml: number }[],
  tz: string | null
): HydrationInsight {
  const days = lastNDays(7, tz)
  const today = days[days.length - 1]
  const byDay = new Map<string, number>()
  for (const w of waterRows) byDay.set(w.day, Math.max(0, (byDay.get(w.day) ?? 0) + w.ml))

  const todayMl = byDay.get(today) ?? 0
  const logged = days.filter((d) => (byDay.get(d) ?? 0) > 0)
  const avg7 =
    logged.length > 0 ? Math.round(logged.reduce((a, d) => a + (byDay.get(d) ?? 0), 0) / logged.length) : null
  const daysOnTarget7 = days.filter((d) => (byDay.get(d) ?? 0) >= targetMl).length
  const pct = targetMl > 0 ? Math.min(100, Math.round((todayMl / targetMl) * 100)) : 0

  return {
    todayMl,
    targetMl,
    pct,
    avg7Ml: avg7,
    logged7Days: logged.length,
    daysOnTarget7,
    status: todayMl >= targetMl ? "on-target" : todayMl > 0 ? "under" : "unknown",
  }
}

// ─── Per-lift progression (Epley e1RM / best reps over time) ──────────────────

function liftProgressionInsight(
  sessions: (WorkoutSession & { logs: ExerciseLog[] })[],
  tz: string | null
): LiftProgression[] {
  return LIFTS.map((def) => {
    // Collect (day, value) samples from every cleared session touching this lift
    const samples: { day: string; value: number }[] = []
    const ledger: { day: string; value: number; sets: number; reps: number; weightKg: number }[] = []
    let exerciseName: string | null = null
    for (const s of sessions) {
      for (const log of s.logs) {
        const n = log.name.toLowerCase()
        if (!def.match(n)) continue
        if (exerciseName === null) exerciseName = log.name
        // R69 — sample days roll with the hunter's timezone (dayKeyIn).
        const day = dayKeyIn(tz, s.startedAt)
        if (def.kind === "barbell" && log.weightKg > 0) {
          const e1rm = Math.round(log.weightKg * (1 + Math.min(30, log.reps) / 30) * 10) / 10
          samples.push({ day, value: e1rm })
          ledger.push({ day, value: e1rm, sets: log.sets, reps: log.reps, weightKg: log.weightKg })
        } else if (def.kind === "bodyweight") {
          samples.push({ day, value: log.reps })
          ledger.push({ day, value: log.reps, sets: log.sets, reps: log.reps, weightKg: 0 })
        }
      }
    }

    // Day-deduped ascending series keeping the day's best value
    const byDay = new Map<string, number>()
    for (const smp of samples) {
      byDay.set(smp.day, Math.max(byDay.get(smp.day) ?? 0, smp.value))
    }
    const points = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, value]) => ({ day, value }))
      .slice(-60)

    const first = points.length > 0 ? points[0].value : null
    const best = points.length > 0 ? Math.max(...points.map((p) => p.value)) : null
    const latest = points.length > 0 ? points[points.length - 1].value : null
    const deltaPct =
      first !== null && latest !== null && first > 0
        ? Math.round(((latest - first) / first) * 1000) / 10
        : null
    const bestDay = points.find((p) => p.value === best)?.day ?? null
    const sessionsToBest =
      bestDay !== null && points.length > 1
        ? Math.max(0, points.filter((p) => p.day <= bestDay).length - 1)
        : null

    // Session-level PR ledger — newest first, capped to 20 entries, PR rows flagged
    const bestAll = ledger.length > 0 ? Math.max(...ledger.map((e) => e.value)) : null
    const prHistory = [...ledger]
      .sort((a, b) => b.day.localeCompare(a.day))
      .slice(0, 20)
      .map((e) => ({ ...e, isPr: bestAll !== null && e.value >= bestAll }))

    return {
      key: def.key,
      label: def.label,
      exerciseName,
      kind: def.kind,
      unit: def.kind === "barbell" ? "kg" : "reps",
      points,
      prHistory,
      first,
      best,
      latest,
      deltaPct,
      sessionsToBest,
    }
  })
}

// ─── Daily vitals — steps / heart points / move minutes (Google Fit style) ────

function vitalsInsight(
  metrics: BodyMetric[],
  sessions: (WorkoutSession & { logs: ExerciseLog[] })[],
  tz: string | null
): ActivityVitals {
  const days = lastNDays(7, tz)
  const today = days[days.length - 1]

  const stepsByDay = new Map<string, number>()
  for (const m of metrics) {
    if (m.type === "steps") stepsByDay.set(m.day, Math.max(stepsByDay.get(m.day) ?? 0, m.value))
  }
  const hpByDay = new Map<string, number>()
  for (const m of metrics) {
    if (m.type === "heartPoints") hpByDay.set(m.day, Math.max(hpByDay.get(m.day) ?? 0, m.value))
  }
  const moveByDay = new Map<string, number>()
  for (const s of sessions) {
    if (s.status !== "cleared") continue
    // R69 — move-minute days roll with the hunter's timezone (dayKeyIn).
    const d = dayKeyIn(tz, s.startedAt)
    moveByDay.set(d, (moveByDay.get(d) ?? 0) + s.durationMin)
  }

  const stepsSeries = days.map((day) => ({ day, value: Math.round(stepsByDay.get(day) ?? 0) }))
  const hpSeries = days.map((day) => ({ day, value: Math.round(hpByDay.get(day) ?? 0) }))
  const moveSeries = days.map((day) => ({ day, value: Math.round(moveByDay.get(day) ?? 0) }))

  const stepsLogged = stepsSeries.filter((s) => s.value > 0)
  const stepsAvg7 =
    stepsLogged.length > 0
      ? Math.round(stepsLogged.reduce((a, s) => a + s.value, 0) / stepsLogged.length)
      : null
  const hpWeek = hpSeries.reduce((a, s) => a + s.value, 0)

  return {
    steps: {
      today: stepsByDay.get(today) ?? 0,
      target: 8000, // research-backed daily goal (replaces the 10k myth)
      avg7: stepsAvg7,
      series: stepsSeries,
    },
    heartPoints: {
      today: hpByDay.get(today) ?? 0,
      target: 50, // Google Fit default (≈150 moderate min / week)
      weekTotal: hpWeek,
      series: hpSeries,
    },
    moveMinutes: {
      today: moveByDay.get(today) ?? 0,
      target: 60, // WHO daily activity guideline
      series: moveSeries,
    },
  }
}

// ─── Training-load deload detector (ACWR + fatigue signals) ───────────────────

function deloadInsight(
  sessions: (WorkoutSession & { logs: ExerciseLog[] })[],
  sleepDebtHours: number | null,
  tz: string | null
): DeloadInsight {
  const cleared = sessions.filter((s) => s.status === "cleared")

  // Monday-week buckets for the chart (last 6 ISO weeks incl. current —
  // R69: hunter-tz Mondays via weekStartKeyIn)
  const weekBuckets = new Map<string, { volumeKg: number; sessions: number }>()
  for (const s of cleared) {
    const wk = weekStartOf(s.startedAt, tz)
    const slot = weekBuckets.get(wk) ?? { volumeKg: 0, sessions: 0 }
    slot.volumeKg += s.volumeKg
    slot.sessions += 1
    weekBuckets.set(wk, slot)
  }
  const weeklyVolume = [...weekBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6)
    .map(([weekStart, v]) => ({
      weekStart,
      volumeKg: Math.round(v.volumeKg),
      sessions: v.sessions,
    }))

  // ACWR — acute (7d rolling) vs chronic (prior 28d / 4)
  const now = Date.now()
  const dayOf = (d: Date) => Math.floor(d.getTime() / DAY)
  const todayIdx = dayOf(new Date())
  let acute = 0
  let chronic = 0
  for (const s of cleared) {
    const age = todayIdx - dayOf(s.startedAt)
    if (age < 0 || age > 35) continue
    if (age <= 6) acute += s.volumeKg
    else chronic += s.volumeKg
  }
  const chronicAvg = chronic / 4
  const spikeRatio = chronicAvg > 0 ? Math.round((acute / chronicAvg) * 100) / 100 : null

  // Fatigued muscles — any primary/secondary hit within the last 36h
  const lastTrained = new Map<string, number>()
  for (const s of cleared) {
    const t = s.startedAt.getTime()
    for (const log of s.logs) {
      const mapped = mapExerciseToMuscles(log.name)
      const muscles = mapped ? [...mapped.primary, ...mapped.secondary] : []
      for (const m of muscles) {
        if (t > (lastTrained.get(m) ?? 0)) lastTrained.set(m, t)
      }
    }
  }
  const cutoff = now - 36 * 3_600_000
  const fatiguedMuscles = [...lastTrained.values()].filter((t) => t > cutoff).length

  // Verdict
  const historyWeeks = weeklyVolume.filter((w) => w.volumeKg > 0).length
  let verdict: DeloadInsight["verdict"] = "insufficient-data"
  let hint = "Log 3+ weeks of training to calibrate your load management."
  if (historyWeeks >= 2 && spikeRatio !== null) {
    if (spikeRatio >= 1.4 && (fatiguedMuscles >= 6 || (sleepDebtHours ?? 0) >= 5)) {
      verdict = "deload-advised"
      hint = `Volume spiked ${Math.round(spikeRatio * 100)}% above your 4-week baseline with ${fatiguedMuscles} muscles still fatigued — cut this week's volume 40–50%.`
    } else if (spikeRatio >= 1.6) {
      verdict = "deload-advised"
      hint = `Acute load is ${Math.round(spikeRatio * 100)}% of your chronic baseline — schedule a deload week before fatigue accumulates.`
    } else if (spikeRatio >= 1.2) {
      verdict = "caution"
      hint = `Load is trending ${Math.round(spikeRatio * 100)}% above baseline. Keep intensity but watch recovery markers.`
    } else {
      verdict = "sustainable"
      hint = `Acute:chronic ratio ${spikeRatio.toFixed(2)} sits in the 0.8–1.3 sweet spot — keep going.`
    }
  }

  const lastComplete = weeklyVolume.length >= 2 ? weeklyVolume[weeklyVolume.length - 2] : null
  const avg4 =
    weeklyVolume.length >= 5
      ? Math.round(
          weeklyVolume.slice(-5, -1).reduce((a, w) => a + w.volumeKg, 0) / 4
        )
      : null

  return {
    weeklyVolume,
    lastWeekVolumeKg: lastComplete ? lastComplete.volumeKg : null,
    avg4WeekVolumeKg: avg4,
    spikeRatio,
    fatiguedMuscles,
    sleepDebtHours,
    verdict,
    hint,
  }
}

// ─── GET /api/insights ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const hunter = await requireHunter()
    // R69 — every day-key window below rolls with the hunter's timezone
    // (audit 2-a B3 residual; the /api/readiness R68 idiom). Null tz = legacy
    // server-local per dayKeyIn's contract. One shared 7-day chain feeds the
    // query bounds; the per-day series helpers thread the same tz.
    const tz = hunter.timezone
    const sinceDay = lastNDays(7, tz)[0]

    const [metrics, records, sessions, nutritionLogs, allCleared, waterRows] = await Promise.all([
      db.bodyMetric.findMany({ where: { hunterId: hunter.id } }),
      db.personalBest.findMany({ where: { hunterId: hunter.id } }),
      db.workoutSession.findMany({
        where: { hunterId: hunter.id, startedAt: { gte: new Date(Date.now() - 7 * DAY) } },
        include: { logs: true },
      }),
      db.nutritionLog.findMany({
        where: { hunterId: hunter.id, day: { gte: sinceDay } },
        select: { day: true, calories: true, protein: true },
      }),
      db.workoutSession.findMany({
        where: { hunterId: hunter.id, status: "cleared" },
        include: { logs: true },
      }),
      db.waterLog.findMany({
        where: { hunterId: hunter.id, day: { gte: sinceDay } },
        select: { day: true, ml: true },
      }),
    ])

    const profile = hunterProfile(hunter)
    const female = profile.sex === "female"
    const birthYear = profile.birthYear ?? DEFAULT_PROFILE.birthYear

    const sleep = sleepInsight(metrics, tz)
    const targets = calcTargets(profile)

    const dto: InsightsDTO = {
      profile: {
        heightCm: profile.heightCm ?? DEFAULT_PROFILE.heightCm,
        weightKg: profile.weightKg ?? DEFAULT_PROFILE.weightKg,
        age: Math.min(80, Math.max(15, new Date().getFullYear() - birthYear)),
        sex: female ? "female" : "male",
        goal: profile.goal ?? DEFAULT_PROFILE.goal,
        isDefault: profile.heightCm === null,
      },
      bodyComp: bodyCompInsight(hunter, metrics),
      heart: heartInsight(hunter, metrics),
      strength: strengthInsight(hunter, records),
      balance: balanceInsight(sessions),
      energy: energyInsight(hunter, nutritionLogs, seriesOf(metrics, "weight"), tz),
      sleep,
      protein: proteinInsight(hunter, nutritionLogs, tz),
      hydration: hydrationInsight(targets.waterMl, waterRows, tz),
      liftProgression: liftProgressionInsight(allCleared, tz),
      vitals: vitalsInsight(metrics, allCleared, tz),
      deload: deloadInsight(allCleared, sleep.debtHours, tz),
    }

    // Side-effects driven by the computed insight (idempotent):
    // ① ACWR verdict says deload → inject today's Recovery Directive
    if (dto.deload.verdict === "deload-advised") {
      await ensureDeloadQuest(hunter.id)
    }

    // ② Body-fat goal reached → achievement + one-time XP. The celebrate flag
    //    stays live for 2 minutes after unlocking so any tab's insights fetch
    //    (readiness/vitals/body) can render the banner, not just the first one.
    if (dto.bodyComp.goalReached && dto.bodyComp.bodyFatPct !== null) {
      const existing = await db.achievement.findFirst({
        where: { hunterId: hunter.id, code: "bf-goal-reached" },
      })
      if (!existing) {
        await db.achievement.create({ data: { hunterId: hunter.id, code: "bf-goal-reached" } })
        await grantXp(hunter.id, 200, "bonus", "Body-fat goal reached")
        dto.bodyComp.celebrate = true
      } else if (Date.now() - existing.unlockedAt.getTime() < 120_000) {
        dto.bodyComp.celebrate = true
      }
    }

    return NextResponse.json(dto)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/insights", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
