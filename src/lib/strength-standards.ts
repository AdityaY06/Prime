// ─── PRIME · Strength standards (R17-C · extended R18-c — Strength Level / Symmetric Strength) ──
// Pure data + pure functions only (safe to import from client components).
// Classifies a hunter's personal bests against population strength standards
// expressed as bodyweight multiples (barbell lifts) or absolute rep counts
// (bodyweight movements), then interpolates a training-age percentile.
//
// Sources: thresholds are a consensus blend of Strength Level population
// percentiles and ExRx performance standards for novice-to-elite adult males;
// female thresholds scale each lift by a conservative ratio (~0.60–0.72 of
// the male multiple, per Strength Level's female tables — glute-dominant
// patterns run higher, see the per-table notes). R18-c adds six population
// tables (front squat / incline bench / RDL / hip thrust / lat pulldown /
// lunge-split-squat), each citing its derivation in the entry comment.
// Values are for guidance/motivation, not competition.

export type StrengthClassId = "untrained" | "novice" | "intermediate" | "advanced" | "elite"

export const STRENGTH_CLASSES: readonly { id: StrengthClassId; label: string; note: string }[] = [
  { id: "untrained", label: "Untrained", note: "BEFORE THE FIRST CYCLE" },
  { id: "novice", label: "Novice", note: "LINEAR GAINS TERRITORY" },
  { id: "intermediate", label: "Intermediate", note: "THE LONG MIDDLE PATH" },
  { id: "advanced", label: "Advanced", note: "YEARS OF DISCIPLINE" },
  { id: "elite", label: "Elite", note: "TOP FRACTION OF TRAINED HUMANS" },
]

/** Chip skin per class — pre-existing palette only (zinc/teal/violet/amber/fuchsia). */
export const CLASS_SKIN: Record<StrengthClassId, string> = {
  untrained: "border-zinc-600/50 bg-zinc-800/40 text-zinc-300",
  novice: "border-teal-500/50 bg-teal-500/10 text-teal-300",
  intermediate: "border-violet-500/50 bg-violet-500/10 text-violet-300",
  advanced: "border-amber-400/50 bg-amber-500/10 text-amber-300",
  elite: "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-300",
}

type Standard = {
  /** Display-name fragments that identify the exercise (lowercase contains-match). */
  matchers: string[]
  /** Class thresholds × bodyweight (male). Female = male × femRatio. */
  maleXbw: [number, number, number, number, number] // untrained..elite
  femRatio: number
  /** true → value is absolute (reps/min), not kg. */
  absolute?: boolean
  /** Absolute thresholds when `absolute` (male AND female share). */
  absoluteSteps?: [number, number, number, number, number]
}

// ── Barbell standards (kg × bodyweight) ──────────────────────────────────────
// SPECIFICITY ORDER — the matcher is a first-match-wins contains-find over the
// array below, so every variant table MUST sit ABOVE the generic table whose
// matcher string it contains: "incline bench" > "bench" > "press";
// "front squat" / "split squat" > "squat"; "romanian deadlift" > "deadlift".
// R17-C shipped bench-above-press for exactly this reason; R18-c generalizes
// the rule across the six added population tables (all six lead the array).
const STANDARDS: readonly Standard[] = [
  // ── R18-c · extended population tables (Strength Level / Symmetric Strength) ──
  {
    // Front squat — Strength Level male tables run ≈0.80–0.85× the back-squat
    // multiples at every rung (less hip drive + erector contribution). Female
    // ratio mirrors back squat (0.72): the population sex gap is structural,
    // not lift-specific.
    matchers: ["front squat"],
    maleXbw: [0.6, 1.0, 1.25, 1.85, 2.3],
    femRatio: 0.72,
  },
  {
    // Incline bench press — ≈0.80× the flat-bench steps (Strength Level's
    // incline tables sit at 78–83% of flat bench across rungs; reduced leg
    // drive + smaller pressing angle). Female ratio mirrors flat bench (0.60).
    // Matched by name only as "incline <press variant>" — bare "incline" would
    // swallow bodyweight "Incline push-up" into a kg table (guard would null
    // it), so the matchers stay press-specific.
    matchers: ["incline bench", "incline press", "incline dumbbell press"],
    maleXbw: [0.4, 0.6, 0.8, 1.2, 1.6],
    femRatio: 0.6,
  },
  {
    // Romanian deadlift — ≈0.85× the conventional-deadlift steps (Symmetric
    // Strength's RDL standards run ~83–87% of the conventional pull: the
    // stiff-leg mechanic shaves hip-drive mass off the bar). Posterior chain
    // → the deadlift's 0.72 female ratio.
    matchers: ["romanian deadlift", "romanian dead lift", "rdl"],
    maleXbw: [0.85, 1.25, 1.7, 2.1, 2.55],
    femRatio: 0.72,
  },
  {
    // Hip thrust — the one loaded pattern that OUTSCALES the squat (Strength
    // Level's hip-thrust multiples sit above back-squat at every rung: glutes
    // + full hinge + bench-supported torso). Glute-dominant patterns show the
    // smallest population sex gap — female tables ≈0.85× the male multiples
    // (vs ~0.60 for pressing), so femRatio breaks the usual 0.58–0.72 band.
    matchers: ["hip thrust"],
    maleXbw: [0.9, 1.4, 1.9, 2.6, 3.3],
    femRatio: 0.85,
  },
  {
    // Lat pulldown — machine/cable vertical pull judged on the stack's stated
    // plate weight ×BW (Strength Level's own convention; stack calibration
    // variance is the population's problem, not the formula's). Vertical pulls
    // retain more female strength than presses: ≈0.68× the male multiples.
    // Bare "pulldown" is deliberately NOT matched — "Straight-arm pulldown"
    // (a ~40%-of-pulldown isolation lift) must stay unranked rather than be
    // misjudged against this table.
    matchers: ["lat pulldown", "lat pull-down", "lat pull down", "pull-down", "pull down"],
    maleXbw: [0.55, 0.8, 1.0, 1.35, 1.7],
    femRatio: 0.68,
  },
  {
    // Lunge / split squat (barbell) — judged on TOTAL bar load ×BW: one load,
    // legs alternate (Strength Level's barbell-lunge reading — NOT per-leg
    // halving). Sits ~45% under the back-squat table (unilateral stability
    // tax). MUST stay above "squat" so split-squat variants land here — and
    // because this is a LOADED table, the bodyweight-type guard below keeps
    // "Bulgarian split squat (bodyweight)" (reps, not kg) safely null.
    matchers: ["split squat", "lunge"],
    maleXbw: [0.35, 0.6, 0.85, 1.25, 1.6],
    femRatio: 0.72,
  },
  // ── R17-C core tables ──────────────────────────────────────────────────────
  {
    // flat bench above the generic "press" fallback ("bench press" contains "press")
    matchers: ["bench"],
    maleXbw: [0.5, 0.75, 1.0, 1.5, 2.0],
    femRatio: 0.6,
  },
  {
    matchers: ["deadlift", "dead lift"],
    maleXbw: [1.0, 1.5, 2.0, 2.5, 3.0],
    femRatio: 0.72,
  },
  {
    matchers: ["squat"],
    maleXbw: [0.75, 1.25, 1.5, 2.25, 2.75],
    femRatio: 0.72,
  },
  {
    matchers: ["overhead press", "ohp", "military press", "shoulder press", "strict press"],
    maleXbw: [0.35, 0.55, 0.8, 1.1, 1.4],
    femRatio: 0.58,
  },
  {
    matchers: ["press"],
    maleXbw: [0.35, 0.55, 0.8, 1.1, 1.4],
    femRatio: 0.58,
  },
  {
    matchers: ["row"],
    maleXbw: [0.5, 0.8, 1.0, 1.4, 1.8],
    femRatio: 0.62,
  },
  {
    matchers: ["power clean", "clean"],
    maleXbw: [0.6, 0.85, 1.1, 1.5, 1.9],
    femRatio: 0.65,
  },
  // ── Bodyweight movements (absolute reps) ──────────────────────────────────
  {
    matchers: ["pull-up", "pullup", "pull up", "chin-up", "chinup", "chin up"],
    absolute: true,
    maleXbw: [0, 0, 0, 0, 0], // unused
    femRatio: 1,
    absoluteSteps: [0, 5, 10, 15, 20],
  },
  {
    matchers: ["push-up", "pushup", "push up"],
    absolute: true,
    maleXbw: [0, 0, 0, 0, 0],
    femRatio: 1,
    absoluteSteps: [5, 15, 30, 50, 70],
  },
  {
    matchers: ["dip"],
    absolute: true,
    maleXbw: [0, 0, 0, 0, 0],
    femRatio: 1,
    absoluteSteps: [0, 5, 12, 20, 30],
  },
]

export type StrengthVerdict = {
  classId: StrengthClassId
  label: string
  note: string
  /** 0–99 training-age percentile within the classified population. */
  percentile: number
  /** Thresholds in the lift's OWN unit (kg or reps), male- or female-scaled. */
  steps: [number, number, number, number, number]
  /** kg verdicts only: the best value as a bodyweight multiple. */
  xbw: number | null
  exercise: string
}

/** Normalize for matching: lowercase, collapse non-letters. */
function norm(s: string): string {
  return s.toLowerCase()
}

/**
 * Classify one exercise best. Returns null when the exercise has no standard
 * (unknowable names, cardio/mobility types) or inputs are invalid — callers
 * hide the chip entirely.
 */
export function strengthVerdict(
  displayName: string,
  type: string,
  bestValue: number,
  bodyweightKg: number,
  sex: string | null | undefined,
): StrengthVerdict | null {
  if (!Number.isFinite(bestValue) || bestValue <= 0) return null
  if (type !== "strength" && type !== "bodyweight") return null

  const name = norm(displayName)
  const std = STANDARDS.find((s) => s.matchers.some((m) => name.includes(m)))
  if (!std) return null

  // R17 orchestrator guard: bodyweight variants of barbell-pattern lifts
  // ("Bulgarian split squat (bodyweight)", "push press (bodyweight)", …)
  // carry REPS, not kg — comparing them against ×BW kg thresholds would
  // misclassify every time. Only the absolute rep tables (pull-up/push-up/
  // dip) classify bodyweight-type records; weighted variants arrive as
  // type "strength" and classify normally.
  if (type === "bodyweight" && !std.absolute) return null

  const female = sex === "female"
  let steps: [number, number, number, number, number]
  if (std.absolute && std.absoluteSteps) {
    steps = std.absoluteSteps
  } else {
    const bw = Number.isFinite(bodyweightKg) && bodyweightKg > 0 ? bodyweightKg : 75
    const mult = female ? std.femRatio : 1
    steps = std.maleXbw.map((x) => Math.round(x * bw * mult)) as [number, number, number, number, number]
  }

  // find class: highest threshold the value clears
  let idx = 0
  for (let i = 0; i < steps.length; i++) {
    if (bestValue >= steps[i]) idx = i
    else break
  }

  // percentile: piecewise-linear between this class's floor and ceiling
  const floor = idx === 0 ? 0 : steps[idx - 1]
  const ceil = idx === steps.length - 1 ? steps[idx] * 1.15 : steps[idx + 1]
  const span = ceil - floor
  const local = span > 0 ? (bestValue - floor) / span : 1
  const bands = [30, 55, 75, 90, 99] // class ceiling percentiles
  const bandFloor = idx === 0 ? 5 : bands[idx - 1]
  const percentile = Math.max(1, Math.min(99, Math.round(bandFloor + local * (bands[idx] - bandFloor))))

  const cls = STRENGTH_CLASSES[idx]
  const xbw =
    std.absolute || std.absoluteSteps
      ? null
      : Number.isFinite(bodyweightKg) && bodyweightKg > 0
        ? Math.round((bestValue / bodyweightKg) * 100) / 100
        : null

  return {
    classId: cls.id,
    label: cls.label,
    note: cls.note,
    percentile,
    steps,
    xbw,
    exercise: displayName,
  }
}

/** "1.25×BW" or null (absolute movements). */
export function xbwLabel(v: number | null): string | null {
  if (v === null) return null
  return `${v.toFixed(2)}×BW`
}
