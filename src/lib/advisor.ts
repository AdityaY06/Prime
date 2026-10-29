// ─── PRIME · ASCENT — goal advisor library (R31-a vertical jump · R32-b
// first pull-up + 5K time) ───────────────────────────────────────────────────
// Pure, framework-free, ZERO imports — the deterministic calculators behind the
// ASCENT section of the DIRECTIVES tab.
//
// DESIGN CONTRACT (user directive): a user who wants to increase their jump
// gets a calculator that (1) inventories exactly which data it HAS, (2) asks
// only for what is MISSING, (3) names the major & minor muscles to improve —
// with the driver that produced every priority — and (4) prescribes exercises
// plus complementary habits. NO LLM by design: the Oracle console already
// covers free-form coaching; this module is thresholds, so the same numbers
// always produce the same prescription.
//
// HONESTY DISCIPLINE (house rule, mirrors science.ts): every threshold below
// is a documented COACHING HEURISTIC — no fabricated citations, no normative
// percentile claims. Missing data degrades to explicit "UNKNOWN" states whose
// text says what is missing and what would close the gap; analysis with gaps
// renders honest UNKNOWN rows rather than blocking.
//
// BAND ANCHORS (why raw centimeters): the jump bands read the RAW jump value
// (<30 → ≥60 CM) — the classic general-adult coaching heuristic table, which
// matches population reality far better than a height-scaled ratio would
// (a 73 CM jump is NOT "average"). The jump:height ratio is still computed
// and shown separately as the height-relative lens, and height stays a CORE
// analysis requirement because the ratio (and reach arithmetic) need it.

// ── Input & view types ───────────────────────────────────────────────────────

export type JumpEquipment = "none" | "home" | "full-gym"
export type JumpExperience = "novice" | "intermediate" | "advanced"

/** Everything the calculator can consume. Every field is nullable — nulls are
 *  honest "we don't know", never silently defaulted. */
export type JumpInput = {
  heightCm: number | null
  weightKg: number | null
  standingReachCm: number | null
  verticalJumpCm: number | null
  ageYears: number | null
  sex: string | null
  /** Best squat-pattern estimated 1RM (Epley) from logged records, kg. */
  squatE1rmKg: number | null
  /** True when any jump/hop/plyo/skip record OR a logged vertical jump exists. */
  plyoExposure: boolean
  trainingDaysPerWeek: number | null
  equipment: JumpEquipment | null
  experience: JumpExperience | null
  sleepAvg7d: number | null
  /** User-flagged injury cautions — subset of "knee" | "ankle" | "back". */
  injuryFlags: readonly string[]
}

/** One HAVE/MISSING inventory row. `source` says where the datum lives
 *  ("PROFILE", "BODY METRICS", "RECORDS", "PROGRAM", "VITALS"). */
export type DataChip = { id: string; label: string; have: boolean; valueLabel: string | null; source: string }

export type Priority = "high" | "moderate" | "low" | "unknown"

export type MusclePriority = {
  id: string
  name: string
  role: "major" | "minor"
  priority: Priority
  why: string
}

export type ExercisePick = {
  name: string
  scheme: string
  rest: string
  why: string
  equipment: JumpEquipment
}

export type HabitItem = { title: string; detail: string; scienceId: string }

export type JumpBand = { id: string; label: string; range: string }

export type RelStrClass = { id: string; label: string; verdict: string }

export type JumpAssessment = {
  /** Weight + height + (standing reach OR vertical jump) all present. */
  canAnalyze: boolean
  /** Core-field ids still missing when `canAnalyze` is false. */
  missingCore: string[]
  /** True when the analysis RAN but optional drivers are still unknown. */
  hasGaps: boolean
  verticalJumpCm: number | null
  jumpBand: JumpBand | null
  /** jump ÷ height × 100 — the height-relative lens, null-safe. */
  jumpRatioPct: number | null
  standingReachCm: number | null
  /** reach + jump — plain arithmetic, the number rim-touchers care about. */
  maxTouchCm: number | null
  squatE1rmKg: number | null
  /** squat e1RM ÷ bodyweight, null when either side is missing. */
  relStrength: number | null
  relStrClass: RelStrClass
  plyoExposure: boolean
  majorMuscles: MusclePriority[]
  minorMuscles: MusclePriority[]
  /** Equipment-filtered + injury-modulated picks, keyed by muscle id. */
  exercises: Record<string, ExercisePick[]>
  habits: HabitItem[]
  /** Injury cautions + honest-unknown lines. */
  notes: string[]
}

// ── General jump bands (raw cm) ──────────────────────────────────────────────

/**
 * General bands for the RAW vertical jump value — the classic coaching
 * heuristic table for general adults. Boundary semantics: the lower edge is
 * inclusive (30 lands in AVERAGE, 40 in GOOD, 50 in VERY GOOD, 60 in
 * EXCEPTIONAL). HONESTY: these are general bands, NOT normative percentiles —
 * sex, age and test protocol (chalk wall vs contact mat vs force plate) all
 * shift the reading. Render under "GENERAL BANDS · NOT NORMATIVE PERCENTILES".
 */
export function jumpBandFor(verticalJumpCm: number | null): JumpBand | null {
  if (verticalJumpCm == null || !Number.isFinite(verticalJumpCm)) return null
  if (verticalJumpCm < 30) return { id: "developing", label: "DEVELOPING", range: "<30 CM" }
  if (verticalJumpCm < 40) return { id: "average", label: "AVERAGE RANGE", range: "30–40 CM" }
  if (verticalJumpCm < 50) return { id: "good", label: "GOOD", range: "40–50 CM" }
  if (verticalJumpCm < 60) return { id: "very-good", label: "VERY GOOD", range: "50–60 CM" }
  return { id: "exceptional", label: "EXCEPTIONAL", range: "≥60 CM" }
}

/**
 * Relative strength = squat e1RM ÷ bodyweight. Coaching heuristics (documented,
 * never cited as norms): <1.0 the strength base is the biggest single lever
 * available; 1.0–1.5 developing; 1.5–2.0 solid; ≥2.0 strength-ready — emphasis
 * shifts from building force to expressing it fast (plyo/speed work pays more).
 * Null either side → honestly UNKNOWN.
 */
export function relStrClassFor(squatE1rmKg: number | null, weightKg: number | null): RelStrClass {
  if (squatE1rmKg == null || weightKg == null || !Number.isFinite(squatE1rmKg) || !Number.isFinite(weightKg) || weightKg <= 0) {
    return { id: "unknown", label: "UNKNOWN", verdict: "No squat record to read — relative strength is unknown." }
  }
  const r = squatE1rmKg / weightKg
  if (r < 1.0) {
    return { id: "foundation", label: "FOUNDATION", verdict: "Below 1.0× bodyweight — strength is the biggest lever available." }
  }
  if (r < 1.5) {
    return { id: "developing", label: "DEVELOPING", verdict: "1.0–1.5× bodyweight — the strength base is growing, keep loading it." }
  }
  if (r < 2.0) {
    return { id: "solid", label: "SOLID", verdict: "1.5–2.0× bodyweight — a solid base; keep building while adding speed." }
  }
  return { id: "strength-ready", label: "STRENGTH-READY", verdict: "≥2.0× bodyweight — shift emphasis to speed and plyo." }
}

// ── The exercise catalog ──────────────────────────────────────────────────────
// equipment semantics: "none" needs nothing, "home" needs a home tier,
// "full-gym" needs a barbell/rack station. Richer tiers run humbler moves
// (full-gym ⊇ home ⊇ none). Every `why` is one concrete coaching line.

export const JUMP_EXERCISES: Record<string, ExercisePick[]> = {
  // Major — hip extension power (the engine of takeoff)
  posterior: [
    { name: "Trap-Bar Jump Squat", scheme: "4 × 3–5 · EXPLOSIVE", rest: "2–3 MIN", equipment: "full-gym", why: "Loads the exact explosive hip-plus-knee extension a takeoff needs — move the bar fast or not at all." },
    { name: "Kettlebell Swing", scheme: "3 × 8–12", rest: "60–90 S", equipment: "home", why: "Hinging power that teaches the hips to fire fast without a barbell." },
    { name: "Romanian Deadlift", scheme: "3 × 6–8", rest: "2 MIN", equipment: "home", why: "Direct loading for the glute–hamstring chain that extends the hip." },
    { name: "Nordic Curl", scheme: "3 × 4–6 · ECCENTRIC", rest: "90 S", equipment: "none", why: "Hamstring strength that protects the knee every time you land." },
  ],
  // Major — knee-extension drive (the first half of takeoff)
  quads: [
    { name: "Back Squat", scheme: "4 × 5", rest: "2–3 MIN", equipment: "full-gym", why: "The raw knee-extension strength every jump draws on." },
    { name: "Bulgarian Split Squat", scheme: "3 × 6–8 / LEG", rest: "90 S", equipment: "home", why: "Single-leg drive that carries squat strength over to the takeoff leg." },
    { name: "Step-Up", scheme: "3 × 8–10 / LEG", rest: "60–90 S", equipment: "home", why: "Knee-extension drive in the exact one-leg pattern of a jump." },
    { name: "Jump Squat", scheme: "4 × 5 · MAX INTENT", rest: "FULL 2 MIN", equipment: "none", why: "Bodyweight triple extension — the jump itself, powered by intent alone." },
  ],
  // Major — ankle stiffness & the elastic contribution (the spring)
  calves: [
    { name: "Pogo Hops", scheme: "3 × 20–30 · STIFF ANKLES", rest: "60 S", equipment: "none", why: "Trains the Achilles spring — short ground contacts, ankle locked stiff." },
    { name: "Standing Calf Raise", scheme: "3 × 10–15 · 2 S PAUSE", rest: "60 S", equipment: "home", why: "The strength base under the elastic spring — the bottom pause kills the bounce." },
    { name: "Single-Leg Calf Raise", scheme: "3 × 8–12 / LEG", rest: "60 S", equipment: "none", why: "Each ankle carries the full landing alone — build both, not one." },
  ],
  // Minor — force transfer
  core: [
    { name: "Plank", scheme: "3 × 30–60 S", rest: "45 S", equipment: "none", why: "A rigid trunk hands leg power to the jump instead of leaking it." },
    { name: "Hanging Leg Raise", scheme: "3 × 8–12", rest: "60 S", equipment: "home", why: "Hip-flexion strength plus trunk control in one hang." },
    { name: "Dead Bug", scheme: "3 × 10 / SIDE", rest: "30–45 S", equipment: "none", why: "Anti-extension control that keeps the torso quiet in flight." },
  ],
  // Minor — swing-leg drive & deceleration
  hipFlexors: [
    { name: "Standing Knee Drive", scheme: "3 × 10 / LEG · TALL POSTURE", rest: "45 S", equipment: "none", why: "The swing-leg knee drive that adds free takeoff height." },
    { name: "Mountain Climbers", scheme: "3 × 30 S · CONTROLLED", rest: "45 S", equipment: "none", why: "Grooves the knee-drive pattern under control, no gear needed." },
  ],
  // Minor — arm-swing contribution
  armDrive: [
    { name: "Arm-Swing Wall Drill", scheme: "3 × 10 · VIOLENT-UP SWING", rest: "45 S", equipment: "none", why: "Arms thrown hard upward add real height — train the throw, not the wave." },
    { name: "Medicine-Ball Chest Pass", scheme: "4 × 5", rest: "FULL 2 MIN", equipment: "full-gym", why: "Upper-body power that feeds the counter-swing into takeoff." },
  ],
}

/** Equipment tiers are ordered: a richer tier can always run a humbler move.
 *  Unknown equipment → show everything (tagged) rather than hiding on a guess. */
const EQUIP_RANK: Record<JumpEquipment, number> = { none: 0, home: 1, "full-gym": 2 }

export function equipmentAllows(available: JumpEquipment | null, need: JumpEquipment): boolean {
  if (available == null) return true
  return EQUIP_RANK[available] >= EQUIP_RANK[need]
}

/**
 * KNEE-FLAG SWAP: any /depth jump/i pick leaves the prescription and the
 * split-squat pick takes its slot (ground-based, knee-friendlier drive). The
 * shipped catalog deliberately contains NO depth jumps — high-amplitude depth
 * landings are exactly what a flagged knee should avoid, and prescribing them
 * by default would be the wrong default — so this guard is dead by design
 * until a future catalog edit adds them. Exported for testability.
 */
export function swapDepthJumps(list: readonly ExercisePick[]): ExercisePick[] {
  const hasDepth = list.some((p) => /depth jump/i.test(p.name))
  if (!hasDepth) return [...list]
  const replacement = JUMP_EXERCISES.quads.find((p) => /split squat/i.test(p.name)) ?? null
  const out: ExercisePick[] = []
  for (const p of list) {
    if (!/depth jump/i.test(p.name)) {
      out.push(p)
    } else if (replacement && !out.some((x) => x.name === replacement.name)) {
      out.push(replacement)
    }
  }
  return out
}

// ── The habit stack ──────────────────────────────────────────────────────────
// scienceId references real science.ts entry ids (cross-checked in QA — this
// module imports nothing, so the scratch suite asserts the contract). The
// empty-string id marks the one deliberately non-science habit.

export const JUMP_HABITS: readonly HabitItem[] = [
  { title: "SLEEP 7–9 H", detail: "Recovery is when the adaptation actually happens — guard sleep like a session.", scienceId: "sleep-athletes" },
  { title: "PROTEIN 1.6–2.2 G/KG/DAY", detail: "Growth dosing (Morton 2018); the ISSN general guideline spans 1.4–2.0 g/kg/day.", scienceId: "issn-protein" },
  { title: "SPACE PLYO 48–72 H", detail: "Keep 48–72 h between intense plyo sessions — the spring recharges between bouts.", scienceId: "plyo-training" },
  { title: "RAMP BEFORE JUMPING", detail: "Raise, Activate, Mobilise, Potentiate — never jump cold.", scienceId: "ramp-warmup" },
  { title: "RESPECT THE 48 H RELOAD", detail: "Do not hammer the same muscle group hard two days running.", scienceId: "nsca-recovery" },
  { title: "STRENGTH 2+ DAYS/WEEK", detail: "The strength base that powers the jump needs weekly frequency.", scienceId: "who-strength" },
  { title: "RE-TEST EVERY 4–6 WEEKS", detail: "Same wall, same protocol — watch the jump and the squat-to-bodyweight ratio climb together.", scienceId: "relative-strength" },
  { title: "STICK EVERY LANDING", detail: "Quality landings beat maximum height — landing discipline is adaptation insurance.", scienceId: "" },
]

// ── Muscle priority heuristics ────────────────────────────────────────────────
// Every threshold is a coaching heuristic; every `why` names its driver.

const ARM_DRIVE: MusclePriority = {
  id: "armDrive",
  name: "Deltoids & Lats",
  role: "minor",
  priority: "low",
  why: "The arm swing can add meaningful height — it rides along as power work, never a focus.",
}

function posteriorPriority(rel: number | null): MusclePriority {
  const id = "posterior"
  const name = "Glutes & Hamstrings"
  const base = { id, name, role: "major" as const }
  // Spec rule: high when relStr <1.5 OR unknown (strength data missing → the
  // engine is ASSUMED the biggest lever, and the why says so honestly);
  // moderate 1.5–2.0; low ≥2.0.
  if (rel == null) {
    return { ...base, priority: "high", why: "Hip extension powers takeoff, and there is no squat record yet — data missing, so it is treated as the likely biggest lever. Log a squat set to size it." }
  }
  if (rel < 1.5) {
    return { ...base, priority: "high", why: `Hip extension powers takeoff — at ${rel.toFixed(2)}× bodyweight squat it is the biggest lever available.` }
  }
  if (rel < 2.0) {
    return { ...base, priority: "moderate", why: `Hip-extension strength reads ${rel.toFixed(2)}× bodyweight — growing, not yet maxed; keep it loaded weekly.` }
  }
  return { ...base, priority: "low", why: `At ${rel.toFixed(2)}× bodyweight the posterior chain is strong enough — express it fast instead of stacking strength.` }
}

function quadPriority(rel: number | null): MusclePriority {
  const base = { id: "quads", name: "Quads", role: "major" as const }
  // Spec table: high <1.2 / moderate 1.2–1.8 / low ≥1.8. NULL-HONESTY (QA
  // pinned): a missing squat record ranks quads UNKNOWN — there is no data
  // behind a knee-extension verdict, and the why must say data missing.
  if (rel == null) {
    return { ...base, priority: "unknown", why: "Knee-extension drive ranks off your squat — data missing, no squat record to read yet." }
  }
  if (rel < 1.2) {
    return { ...base, priority: "high", why: `Knee-extension drive carries the first half of takeoff — at ${rel.toFixed(2)}× bodyweight squat it is under-powered.` }
  }
  if (rel < 1.8) {
    return { ...base, priority: "moderate", why: `Knee-drive strength reads ${rel.toFixed(2)}× bodyweight — mid-range; steady loading keeps paying.` }
  }
  return { ...base, priority: "low", why: `At ${rel.toFixed(2)}× bodyweight the quads are strong for your size — speed work pays more than plates.` }
}

function calfPriority(plyoExposure: boolean, rel: number | null): MusclePriority {
  const base = { id: "calves", name: "Calves & Achilles", role: "major" as const }
  // Spec rule: high when no plyo exposure (untapped spring); moderate when
  // exposed AND relStr <1.5; low otherwise. NULL CASE: exposed with unknown
  // strength → moderate (an honest middle — never a confident "low" built on
  // missing data), with the why saying the strength read is missing.
  if (!plyoExposure) {
    return { ...base, priority: "high", why: "No jump or plyo records logged — the Achilles spring is likely untapped, the cheapest ceiling to raise." }
  }
  if (rel == null) {
    return { ...base, priority: "moderate", why: "Plyo exposure is logged, but there is no squat record — data missing, so the spring's engine reads unverified." }
  }
  if (rel < 1.5) {
    return { ...base, priority: "moderate", why: `Plyo exposure is logged and relative strength is still ${rel.toFixed(2)}× — the spring needs a stronger engine behind it.` }
  }
  return { ...base, priority: "low", why: `Plyo logged and strength reads ${rel.toFixed(2)}× bodyweight — the spring is wired; maintain it.` }
}

function corePriority(days: number | null, sleep: number | null): MusclePriority {
  const base = { id: "core", name: "Core", role: "minor" as const }
  // Spec rule: moderate when trainingDaysPerWeek <3 OR sleepAvg7d <7; else
  // low. Nulls never trip the moderate condition (can't prove below the
  // line); BOTH null → honest unknown.
  const lowFreq = days != null && days < 3
  const lowSleep = sleep != null && sleep < 7
  if (lowFreq || lowSleep) {
    const parts: string[] = []
    if (lowFreq && days != null) parts.push(`training ${days}×/week`)
    if (lowSleep && sleep != null) parts.push(`sleep avg ${sleep.toFixed(1)} h`)
    return { ...base, priority: "moderate", why: `Force transfer — a soft trunk leaks takeoff power. ${parts.join(" · ")} sits below the recovery line, so direct core work pays now.` }
  }
  if (days == null && sleep == null) {
    return { ...base, priority: "unknown", why: "Force transfer — no training-frequency or sleep data to check the recovery line." }
  }
  const unchecked = [
    days == null ? "no program days" : null,
    sleep == null ? "no recent sleep reading" : null,
  ]
    .filter((x): x is string => x !== null)
    .join(", ")
  return { ...base, priority: "low", why: `Force transfer — frequency and rest read adequate${unchecked ? ` (${unchecked} unchecked)` : ""}; keep trunk work as maintenance.` }
}

function hipFlexorPriority(experience: JumpExperience | null): MusclePriority {
  const base = { id: "hipFlexors", name: "Hip Flexors", role: "minor" as const }
  // "Steady low/moderate": novice training age → moderate (the knee-drive
  // pattern is rarely grooved yet); otherwise low. The why names the driver.
  if (experience === "novice") {
    return { ...base, priority: "moderate", why: "Novice training age — the swing-leg knee-drive pattern is rarely grooved yet; a little direct work buys free takeoff height." }
  }
  return { ...base, priority: "low", why: "Swing-leg drive and landing deceleration — likely grooved at your training age; keep it as a warm-up staple, not a focus." }
}

// ── The HAVE/MISSING inventory ────────────────────────────────────────────────

function fmtCm(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export function jumpDataChips(input: JumpInput): DataChip[] {
  const chips: DataChip[] = []
  const add = (id: string, label: string, have: boolean, valueLabel: string | null, source: string) => {
    chips.push({ id, label, have, valueLabel, source })
  }

  add("height", "HEIGHT", input.heightCm != null, input.heightCm != null ? `${fmtCm(input.heightCm)} CM` : null, "PROFILE")
  add("weight", "WEIGHT", input.weightKg != null, input.weightKg != null ? `${fmtCm(input.weightKg)} KG` : null, "PROFILE")
  add("reach", "STANDING REACH", input.standingReachCm != null, input.standingReachCm != null ? `${fmtCm(input.standingReachCm)} CM` : null, "BODY METRICS")
  add("jump", "VERTICAL JUMP", input.verticalJumpCm != null, input.verticalJumpCm != null ? `${fmtCm(input.verticalJumpCm)} CM` : null, "BODY METRICS")
  add("squat", "SQUAT E1RM", input.squatE1rmKg != null, input.squatE1rmKg != null ? `≈ ${Math.round(input.squatE1rmKg)} KG` : null, "RECORDS")
  // Plyo exposure is always COMPUTABLE from the record set — "none logged" is
  // a real finding (an untapped spring), not a data gap, so the chip is HAVE
  // and the value label says exactly what was (not) found.
  add("plyo", "PLYO EXPOSURE", true, input.plyoExposure ? "LOGGED" : "NONE LOGGED", "RECORDS")
  add("days", "TRAINING DAYS", input.trainingDaysPerWeek != null, input.trainingDaysPerWeek != null ? `${input.trainingDaysPerWeek} DAYS/WK` : null, "PROGRAM")
  add("equipment", "EQUIPMENT", input.equipment != null, input.equipment != null ? input.equipment.toUpperCase() : null, "PROGRAM")
  add("experience", "EXPERIENCE", input.experience != null, input.experience != null ? input.experience.toUpperCase() : null, "PROGRAM")
  add("sleep", "SLEEP 7-DAY AVG", input.sleepAvg7d != null, input.sleepAvg7d != null ? `${input.sleepAvg7d.toFixed(1)} H` : null, "VITALS")
  return chips
}

// ── The assessment ────────────────────────────────────────────────────────────

export function assessVerticalJump(input: JumpInput): JumpAssessment {
  // Core trio: weight + height + (standing reach OR vertical jump). Height is
  // core because the jump:height ratio and reach arithmetic need it; reach
  // alone still unlocks analysis (the jump band then stays honestly UNKNOWN).
  const missingCore: string[] = []
  if (input.weightKg == null) missingCore.push("weight")
  if (input.heightCm == null) missingCore.push("height")
  if (input.standingReachCm == null && input.verticalJumpCm == null) missingCore.push("jump-or-reach")
  const canAnalyze = missingCore.length === 0

  const relStrength =
    input.squatE1rmKg != null && input.weightKg != null && input.weightKg > 0
      ? input.squatE1rmKg / input.weightKg
      : null
  const relStrClass = relStrClassFor(input.squatE1rmKg, input.weightKg)

  const jumpRatioPct =
    input.verticalJumpCm != null && input.heightCm != null && input.heightCm > 0
      ? (input.verticalJumpCm / input.heightCm) * 100
      : null

  const maxTouchCm =
    input.standingReachCm != null && input.verticalJumpCm != null
      ? input.standingReachCm + input.verticalJumpCm
      : null

  // Muscles — majors first (prime movers), then minors (support cast).
  const quads = quadPriority(relStrength)
  // KNEE FLAG: the quad prescription gains its caution line right on the row.
  if (input.injuryFlags.includes("knee")) {
    quads.why += " KNEE CAUTION — no depth jumps; build split squats and keep landings soft."
  }
  const majorMuscles = [posteriorPriority(relStrength), quads, calfPriority(input.plyoExposure, relStrength)]
  const minorMuscles = [
    corePriority(input.trainingDaysPerWeek, input.sleepAvg7d),
    hipFlexorPriority(input.experience),
    ARM_DRIVE,
  ]

  // Prescriptions: equipment-filtered, then injury-modulated.
  const exercises: Record<string, ExercisePick[]> = {}
  for (const [id, picks] of Object.entries(JUMP_EXERCISES)) {
    let list = picks.filter((p) => equipmentAllows(input.equipment, p.equipment))
    if (input.injuryFlags.includes("knee")) list = swapDepthJumps(list)
    exercises[id] = list
  }

  // Notes — injury modulation + honest unknowns.
  const notes: string[] = []
  if (input.injuryFlags.includes("knee")) {
    notes.push("KNEE FLAG — quad work carries a caution: swap depth jumps for split squats, keep volume sub-max and landings quiet.")
  }
  if (input.injuryFlags.includes("ankle")) {
    notes.push("ANKLE FLAG — plyo stays low-impact: small-amplitude pogo volume first; no depth drops or max-height attempts until it calms.")
  }
  if (input.injuryFlags.includes("back")) {
    notes.push("BACK FLAG — keep loads conservative on squats and RDLs; groove technique before plates.")
  }
  if (input.squatE1rmKg == null) {
    notes.push("NO SQUAT RECORD — relative strength reads UNKNOWN; log any squat set (the e1RM is estimated from reps) to size the strength verdict.")
  }
  if (input.verticalJumpCm == null) {
    notes.push("NO JUMP READING — the band stays UNKNOWN; run the chalk/wall test, best of 3, to set the baseline.")
  }

  // Gaps = analysis ran but optional drivers are unknown (relStr, jump band,
  // sleep, experience or frequency). Honest UNKNOWN chips, never a block.
  const hasGaps =
    canAnalyze &&
    (input.verticalJumpCm == null ||
      input.squatE1rmKg == null ||
      input.sleepAvg7d == null ||
      input.experience == null ||
      input.trainingDaysPerWeek == null)

  return {
    canAnalyze,
    missingCore,
    hasGaps,
    verticalJumpCm: input.verticalJumpCm,
    jumpBand: jumpBandFor(input.verticalJumpCm),
    jumpRatioPct,
    standingReachCm: input.standingReachCm,
    maxTouchCm,
    squatE1rmKg: input.squatE1rmKg,
    relStrength,
    relStrClass,
    plyoExposure: input.plyoExposure,
    majorMuscles,
    minorMuscles,
    exercises,
    habits: [...JUMP_HABITS],
    notes,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── R32-b · ASCENT EXPANSION — FIRST PULL-UP + 5K TIME calculators ──────────
// Same discipline as R31-a, verbatim in spirit: HAVE/MISSING chips, ask-only-
// what's-missing, raw-anchored bands, driver-cited why lines, honest UNKNOWN on
// missing data, injury modulation with swaps, equipment-filtered prescriptions,
// habit stack wired to scienceFor ids. Zero imports, fully typed.
// ═════════════════════════════════════════════════════════════════════════════

// ── FIRST PULL-UP — input & view types ───────────────────────────────────────

/** Everything the first pull-up calculator can consume (all-null honest). */
export type PullUpInput = {
  weightKg: number | null
  heightCm: number | null
  /** Max passive bar hang, seconds — grip + shoulder base (rung 1 of the ladder). */
  deadHangSec: number | null
  /** Best set of inverted rows (reps) from records or a local answer. */
  invertedRowsReps: number | null
  /** Controlled slow negative pull-ups the user can already do (reps). */
  negativePullUpReps: number | null
  trainingDaysPerWeek: number | null
  /** Pull-up tiers reuse the jump tiers: none = no bar, home = doorway bar /
   *  rings + bands, full-gym = bar + pulldown station + assist machine. */
  equipment: JumpEquipment | null
  experience: JumpExperience | null
  sleepAvg7d: number | null
  /** User-flagged injury cautions — subset of "shoulder" | "elbow". */
  injuryFlags: readonly string[]
}

export type PullUpBand = { id: string; label: string; range: string }

/** One rung of the progression ladder — focus + the exit criterion that
 *  graduates you to the next rung. */
export type LadderRung = { name: string; focus: string; exit: string }

export type PullUpAssessment = {
  /** Weight + (dead hang OR rows OR negatives) all present. */
  canAnalyze: boolean
  missingCore: string[]
  hasGaps: boolean
  deadHangSec: number | null
  invertedRowsReps: number | null
  negativePullUpReps: number | null
  /** Echo of bodyweight — every rep pulls the whole number. */
  bodyweightPullKg: number | null
  band: PullUpBand | null
  /** The 5-rung ladder (rung 5 is the goal itself). */
  ladder: LadderRung[]
  /** 0-based index of the rung you are ON — capped at 3 (rung 4 = goal). */
  currentRung: number
  majorMuscles: MusclePriority[]
  minorMuscles: MusclePriority[]
  exercises: Record<string, ExercisePick[]>
  habits: HabitItem[]
  notes: string[]
}

// ── FIRST PULL-UP — bands & ladder ───────────────────────────────────────────

/**
 * Capability bands anchored on what you can DO, not on a time or percentile:
 * negatives owned > rowing base > early rows > an established hang > nothing.
 * BOUNDARY ANCHORS (documented heuristics): the spec's "dead-hang <15–20 s =
 * grip/lat base missing" window reads as a fuzzy transition — 15 S is the
 * inclusive lower edge chosen here (a hang you cannot hold a quarter-minute
 * rarely supports loaded scapular work); 8 rows marks a pulling base because
 * three hard sets of eight rows is the common "ready to try negatives" gate.
 * Precedence is strictly evidence-ranked (negatives > rows > hang). HONESTY:
 * "CAPABILITY BANDS · NOT NORMATIVE" — these are ladder anchors, never
 * percentiles. All capability inputs null → null (no honest band).
 */
export function pullUpBandFor(
  deadHangSec: number | null,
  invertedRowsReps: number | null,
  negativePullUpReps: number | null
): PullUpBand | null {
  const hang = deadHangSec
  const rows = invertedRowsReps
  const negs = negativePullUpReps
  const anyData =
    (hang != null && Number.isFinite(hang)) ||
    (rows != null && Number.isFinite(rows)) ||
    (negs != null && Number.isFinite(negs))
  if (!anyData) return null
  const negsOwned = negs != null && negs >= 1
  const rowsBase = rows != null && rows >= 8
  const rowsEarly = rows != null && rows >= 3
  const hangOk = hang != null && hang >= 15
  if (negsOwned) return { id: "threshold", label: "ON THE THRESHOLD", range: "NEGATIVES OWNED" }
  if (rowsBase) return { id: "pulling-base", label: "PULLING BASE", range: "ROWS 8+" }
  if (rowsEarly) return { id: "early-pull", label: "EARLY PULL", range: "ROWS 3–7" }
  if (hangOk) return { id: "grip-established", label: "GRIP ESTABLISHED", range: "HANG ≥15 S" }
  return { id: "foundation-missing", label: "FOUNDATION MISSING", range: "HANG <15 S OR UNTESTED" }
}

/**
 * The progression ladder — dead hang → scapular pull → slow negative →
 * band/jumping assisted → first full rep. Exit criteria are the classic
 * graduation gates (documented coaching heuristics, not citations). The 5th
 * rung IS the goal — `currentRung` never reaches it from the inputs (a full
 * rep is not one of the questions; if you own one, the goal is already done).
 */
export const PULLUP_LADDER: readonly LadderRung[] = [
  { name: "DEAD HANG", focus: "GRIP + SHOULDER BASE", exit: "30 S UNBROKEN HANG · SHOULDERS PACKED" },
  { name: "SCAPULAR PULL", focus: "BLADE-DOWN CONTROL", exit: "3 × 8 CONTROLLED PULLS FROM A DEAD HANG" },
  { name: "SLOW NEGATIVE", focus: "ECCENTRIC STRENGTH", exit: "3 × 5 NEGATIVES AT A 3–5 S LOWER" },
  { name: "BAND / JUMPING ASSIST", focus: "GROOVE THE FULL PATH", exit: "5 CLEAN REPS · LIGHTEST BAND OR MINIMAL JUMP" },
  { name: "FIRST FULL REP", focus: "THE GOAL", exit: "DEAD HANG → CHIN OVER BAR · NO KIP, NO JUMP" },
]

/**
 * Ladder placement from the same evidence ranking as the band: a slow
 * negative outranks rows, rowing 8+ outranks a 30 s hang, an early row set
 * still clears rung 1, and no reading at all starts honestly at rung 1 (the
 * note says so). Capped at 3 — rung 4 is the destination, never "current".
 */
export function currentPullUpRung(input: PullUpInput): number {
  const { deadHangSec: hang, invertedRowsReps: rows, negativePullUpReps: negs } = input
  if (negs != null && negs >= 1) return 3
  if (rows != null && rows >= 8) return 2
  if (hang != null && hang >= 30) return 1
  if (rows != null && rows >= 3) return 1
  return 0
}

// ── FIRST PULL-UP — the exercise catalog ─────────────────────────────────────
// Equipment semantics for pulling: "none" = no bar anywhere (rows under a
// sturdy table, floor work, carries), "home" = a hang-able bar (doorway bar,
// rings, sturdy edge) + bands, "full-gym" = bar + pulldown station.

export const PULLUP_EXERCISES: Record<string, ExercisePick[]> = {
  // Major — the pulling engine
  lats: [
    { name: "Band-Assisted Pull-Up", scheme: "4 × 3–6 · LIGHT BAND", rest: "FULL 2 MIN", equipment: "home", why: "The exact pull-up groove with the band paying only the hardest part." },
    { name: "Jumping Pull-Up", scheme: "4 × 3 · JUMP UP · SLOW LOWER", rest: "FULL 2 MIN", equipment: "home", why: "Legs launch the top; the slow lower makes the lats earn the descent." },
    { name: "Inverted Row", scheme: "3 × 8–12 · BODY STRAIGHT", rest: "90 S", equipment: "none", why: "Horizontal pulling loads the lats at a fraction of bodyweight — the honest regression." },
    { name: "Lat Pulldown", scheme: "3 × 8–10 · STRICT TORSO", rest: "90 S", equipment: "full-gym", why: "Machine-loaded lat volume you can progress in small jumps." },
  ],
  // Major — the shoulder-blade platform every rep pulls from
  upperBack: [
    { name: "Scapular Pull", scheme: "3 × 8 · FROM DEAD HANG", rest: "90 S", equipment: "home", why: "The blades-down pull that starts every rep — the platform the lats pull from." },
    { name: "Feet-Elevated Inverted Row", scheme: "3 × 6–10", rest: "90 S", equipment: "home", why: "Rows at a steeper angle — more bodyweight onto the retractors." },
    { name: "Band Pull-Apart", scheme: "3 × 15 · SQUEEZE 1 S", rest: "45 S", equipment: "home", why: "Direct rhomboid and trap work that keeps the chest proud at the bar." },
    { name: "Prone Y-Raise", scheme: "3 × 10 · THUMBS UP", rest: "45 S", equipment: "none", why: "Lower-trap strength with zero equipment — the floor-based platform builder." },
  ],
  // Major — the upstroke engine
  elbowFlexors: [
    { name: "Slow Negative Pull-Up", scheme: "3 × 3–5 · 3–5 S LOWER", rest: "FULL 2 MIN", equipment: "home", why: "Eccentric overload that teaches arms and lats to control full bodyweight." },
    { name: "Flex Hang", scheme: "3 × 10–20 S · CHIN OVER BAR", rest: "90 S", equipment: "home", why: "An isometric at the exact sticking point of the first rep." },
    { name: "Dumbbell Curl", scheme: "3 × 8–12 · STRICT", rest: "60 S", equipment: "home", why: "Elbow-flexor strength you can progress plate by plate." },
  ],
  // Minor — the first thing that fails on a cold rep
  grip: [
    { name: "Dead Hang", scheme: "3 × MAX HOLD", rest: "FULL 2 MIN", equipment: "home", why: "Grip and shoulder base in one — rung 1 of the ladder itself." },
    { name: "Farmer Carry", scheme: "3 × 30–40 M · HEAVY", rest: "90 S", equipment: "none", why: "Crushing grip under load — any two heavy objects count." },
    { name: "Towel Hang", scheme: "2 × MAX · TOWEL OVER BAR", rest: "FULL 2 MIN", equipment: "home", why: "A fatter, harder grip — cheap insurance for the day grip limits the rep." },
  ],
  // Minor — still legs, still trunk
  core: [
    { name: "Hollow Body Hold", scheme: "3 × 20–40 S", rest: "60 S", equipment: "none", why: "The hollow position is the anti-sway chassis of a strict pull-up." },
    { name: "Dead Bug", scheme: "3 × 10 / SIDE", rest: "45 S", equipment: "none", why: "Trunk control that keeps the legs from swinging the rep." },
  ],
}

/**
 * SHOULDER-FLAG SWAP: a passive dead hang stretches an irritated shoulder
 * under full bodyweight — the shoulder-friendlier ACTIVE hang (blades pulled
 * down, joint loaded not stretched) takes the slot. Exported for testability;
 * a no-op when the passive hang isn't in the (equipment-filtered) list.
 */
export const ACTIVE_HANG: ExercisePick = {
  name: "Active Hang",
  scheme: "3 × MAX · SHOULDERS DOWN",
  rest: "FULL 2 MIN",
  equipment: "home",
  why: "Shoulder-friendlier — blades pulled down keeps the joint loaded, not stretched.",
}

export function swapPassiveHangs(list: readonly ExercisePick[]): ExercisePick[] {
  const hasPassive = list.some((p) => p.name === "Dead Hang")
  if (!hasPassive) return [...list]
  return list.map((p) => (p.name === "Dead Hang" ? ACTIVE_HANG : p))
}

/**
 * ELBOW-FLAG SWAP: slow negatives are the classic golfers-elbow aggravator —
 * the isometric flex hang (same joint angle, no eccentric strain) takes the
 * slot. Deduped when the flex hang is already in the list.
 */
export function swapNegativesForElbow(list: readonly ExercisePick[]): ExercisePick[] {
  const hasNeg = list.some((p) => /negative/i.test(p.name))
  if (!hasNeg) return [...list]
  const replacement = PULLUP_EXERCISES.elbowFlexors.find((p) => /flex hang/i.test(p.name)) ?? null
  const out: ExercisePick[] = []
  for (const p of list) {
    if (/negative/i.test(p.name)) {
      if (replacement && !out.some((x) => x.name === replacement.name)) out.push(replacement)
    } else if (!out.some((x) => x.name === p.name)) {
      // name-dedupe: a swap never leaves the same pick twice (the replacement
      // itself may already live in the list)
      out.push(p)
    }
  }
  return out
}

// ── FIRST PULL-UP — the habit stack ──────────────────────────────────────────

export const PULLUP_HABITS: readonly HabitItem[] = [
  { title: "GREASE THE GROOVE", detail: "Spread 3–5 short sub-max practice sets across the day — frequent and fresh beats rare and failed.", scienceId: "pullup-progress" },
  { title: "SLEEP 7–9 H", detail: "Recovery is when the pulling adaptation happens — guard sleep like a session.", scienceId: "sleep-athletes" },
  { title: "PROTEIN 1.6–2.2 G/KG/DAY", detail: "Growth dosing (Morton 2018); the ISSN general guideline spans 1.4–2.0 g/kg/day.", scienceId: "issn-protein" },
  { title: "STRENGTH 2+ DAYS/WEEK", detail: "Guideline-level weekly strength frequency covers the pulling practice this goal needs.", scienceId: "who-strength" },
  { title: "SPACE HARD NEGATIVES 48 H", detail: "Eccentrics dig deep — keep 48 h between heavy negative sessions.", scienceId: "nsca-recovery" },
  { title: "RAMP THE SHOULDERS", detail: "Raise, Activate, Mobilise, Potentiate — never hang cold.", scienceId: "ramp-warmup" },
  { title: "RE-TEST THE HANG EVERY 2 WEEKS", detail: "Same bar, same grip — watch the hang and the row count climb together.", scienceId: "nsca-overload" },
]

// ── FIRST PULL-UP — muscle priority heuristics ───────────────────────────────

function latPriority(input: PullUpInput): MusclePriority {
  const base = { id: "lats", name: "Lats", role: "major" as const }
  const { deadHangSec: hang, invertedRowsReps: rows, negativePullUpReps: negs } = input
  // Evidence-ranked: negatives mean the lats already lower bodyweight (the
  // upstroke is the gap); a row base means the engine is loaded; an early row
  // set or a sub-15 s hang means the engine is the lever; no pulling test at
  // all → honest UNKNOWN (a hang alone does not measure pull).
  if (negs != null && negs >= 1) {
    return { ...base, priority: "moderate", why: `You already lower ${negs} slow negative${negs === 1 ? "" : "s"} — the lats can brake full bodyweight; the concentric upstroke is the remaining gap.` }
  }
  if (rows != null && rows >= 8) {
    return { ...base, priority: "moderate", why: `Rowing ${rows} reps says the horizontal pull is loaded — the vertical pull is the untrained angle.` }
  }
  if (rows != null && rows >= 3) {
    return { ...base, priority: "high", why: `Rows at ${rows} reps are early — the pulling engine is building but not yet base-level.` }
  }
  if (rows != null) {
    return { ...base, priority: "high", why: `Rows at only ${rows} reps — the pulling engine is the biggest lever available.` }
  }
  if (hang != null && hang < 15) {
    return { ...base, priority: "high", why: `A ${Math.round(hang)} s hang fails before the base exists — the lat and grip foundation is the lever.` }
  }
  return { ...base, priority: "unknown", why: "No pulling test to read — rows or slow negatives would size the lats; data missing." }
}

function upperBackPriority(input: PullUpInput): MusclePriority {
  const base = { id: "upperBack", name: "Upper Back · Traps & Rhomboids", role: "major" as const }
  const { deadHangSec: hang, invertedRowsReps: rows } = input
  // The scapular platform: a sub-20 s hang says the platform is not there yet;
  // a 45 s hang plus a row base says it is solid; anything between reads
  // moderate (present, untested, or unverified).
  if (hang != null && hang < 20) {
    return { ...base, priority: "high", why: `A ${Math.round(hang)} s hang says the shoulder-blade platform cannot even hold you yet — scapular control first.` }
  }
  if (hang != null && hang >= 45 && rows != null && rows >= 8) {
    return { ...base, priority: "low", why: `A ${Math.round(hang)} s hang plus ${rows} row reps — the platform is solid; keep it as maintenance.` }
  }
  if (rows != null && rows >= 3) {
    return { ...base, priority: "moderate", why: `Rows at ${rows} load the retractors — the platform is building, keep it fed.` }
  }
  if (hang != null && hang >= 20) {
    return { ...base, priority: "moderate", why: `The ${Math.round(hang)} s hang holds — scapular control is present but untested under a pull.` }
  }
  if (rows != null) {
    return { ...base, priority: "moderate", why: `Rows at ${rows} engage the retractors — the platform is partially loaded.` }
  }
  return { ...base, priority: "unknown", why: "No hang or row reading — the scapular platform reads unverified; data missing." }
}

function elbowFlexorPriority(input: PullUpInput): MusclePriority {
  const base = { id: "elbowFlexors", name: "Elbow Flexors · Biceps & Brachialis", role: "major" as const }
  const { deadHangSec: hang, invertedRowsReps: rows, negativePullUpReps: negs } = input
  // Negatives owned → the flexors brake bodyweight (moderate — the pull back
  // up is the gap); a row base → moderate; early rows or a failing hang →
  // high; no pull data → honest UNKNOWN.
  if (negs != null && negs >= 1) {
    return { ...base, priority: "moderate", why: `${negs} slow negative${negs === 1 ? "" : "s"} owned — the flexors brake the load; the upstroke is the gap.` }
  }
  if (rows != null && rows >= 8) {
    return { ...base, priority: "moderate", why: `Rowing ${rows} reps keeps the flexors under load — close to, but below, the pull-up demand.` }
  }
  if (rows != null && rows >= 3) {
    return { ...base, priority: "high", why: `Rows at ${rows} — the flexor base is mid-build; direct work pays now.` }
  }
  if (rows != null) {
    return { ...base, priority: "high", why: `Rows at only ${rows} reps — the flexor base is the upstroke bottleneck.` }
  }
  if (hang != null && hang < 15) {
    return { ...base, priority: "high", why: `The ${Math.round(hang)} s hang fails early — even the flexor base is missing.` }
  }
  return { ...base, priority: "unknown", why: "No pulling test to read — flexor strength sizes from rows or negatives; data missing." }
}

function pullUpGripPriority(input: PullUpInput): MusclePriority {
  const base = { id: "grip", name: "Grip & Forearms", role: "minor" as const }
  const { deadHangSec: hang } = input
  // The hang IS the grip test: <15 s the grip is the first thing that fails
  // on a cold rep (high — a minor muscle can still be the honest #1 limiter);
  // 15–29 s developing; ≥30 s the grip outlasts the rep (low); unread → UNKNOWN.
  if (hang == null) {
    return { ...base, priority: "unknown", why: "No dead-hang reading — grip ranks UNKNOWN; time a max hang to size it." }
  }
  if (hang < 15) {
    return { ...base, priority: "high", why: `A ${Math.round(hang)} s hang says the grip fails before the rep even starts — the first practical limiter.` }
  }
  if (hang < 30) {
    return { ...base, priority: "moderate", why: `A ${Math.round(hang)} s hang is developing — the grip holds, but barely past the base line.` }
  }
  return { ...base, priority: "low", why: `A ${Math.round(hang)} s hang outlasts any single rep — grip is not the limiter.` }
}

function pullUpCorePriority(input: PullUpInput): MusclePriority {
  const base = { id: "core", name: "Core · Anti-Sway", role: "minor" as const }
  const { experience, trainingDaysPerWeek: days } = input
  // Novice training age (the knee-drive pattern is rarely grooved) or a
  // sub-2-day frequency (the pattern never gets practiced) → moderate;
  // otherwise low; both null → honest UNKNOWN.
  if (experience === "novice") {
    return { ...base, priority: "moderate", why: "Novice training age — the hollow, still-legs chassis of a strict rep is rarely grooved yet." }
  }
  if (days != null && days < 2) {
    return { ...base, priority: "moderate", why: `Training ${days} day${days === 1 ? "" : "s"}/week — the anti-sway pattern gets too little practice to groove.` }
  }
  if (experience == null && days == null) {
    return { ...base, priority: "unknown", why: "No training-age or frequency answer — anti-sway control reads unverified." }
  }
  return { ...base, priority: "low", why: "Trunk control for a still rep — likely adequate at your training age; keep it as a warm-up staple." }
}

// ── FIRST PULL-UP — inventory & assessment ───────────────────────────────────

export function pullUpDataChips(input: PullUpInput): DataChip[] {
  const chips: DataChip[] = []
  const add = (id: string, label: string, have: boolean, valueLabel: string | null, source: string) => {
    chips.push({ id, label, have, valueLabel, source })
  }
  add("weight", "WEIGHT", input.weightKg != null, input.weightKg != null ? `${fmtCm(input.weightKg)} KG` : null, "PROFILE")
  add("height", "HEIGHT", input.heightCm != null, input.heightCm != null ? `${fmtCm(input.heightCm)} CM` : null, "PROFILE")
  add("deadhang", "DEAD HANG", input.deadHangSec != null, input.deadHangSec != null ? `${Math.round(input.deadHangSec)} S` : null, "BODY METRICS")
  add("rows", "INVERTED ROWS", input.invertedRowsReps != null, input.invertedRowsReps != null ? `${input.invertedRowsReps} REPS` : null, "RECORDS")
  add("negatives", "NEGATIVES", input.negativePullUpReps != null, input.negativePullUpReps != null ? `${input.negativePullUpReps} REPS` : null, "RECORDS")
  add("days", "TRAINING DAYS", input.trainingDaysPerWeek != null, input.trainingDaysPerWeek != null ? `${input.trainingDaysPerWeek} DAYS/WK` : null, "PROGRAM")
  add("equipment", "EQUIPMENT", input.equipment != null, input.equipment != null ? input.equipment.toUpperCase() : null, "PROGRAM")
  add("experience", "EXPERIENCE", input.experience != null, input.experience != null ? input.experience.toUpperCase() : null, "PROGRAM")
  add("sleep", "SLEEP 7-DAY AVG", input.sleepAvg7d != null, input.sleepAvg7d != null ? `${input.sleepAvg7d.toFixed(1)} H` : null, "VITALS")
  return chips
}

export function assessFirstPullUp(input: PullUpInput): PullUpAssessment {
  // Core: bodyweight (the load being pulled) + at least one capability
  // reading to place you on the ladder. Without any capability datum there is
  // no honest band, no rung, no verdict.
  const missingCore: string[] = []
  if (input.weightKg == null) missingCore.push("weight")
  if (input.deadHangSec == null && input.invertedRowsReps == null && input.negativePullUpReps == null) {
    missingCore.push("capability")
  }
  const canAnalyze = missingCore.length === 0

  const majorMuscles = [latPriority(input), upperBackPriority(input), elbowFlexorPriority(input)]
  const minorMuscles = [pullUpGripPriority(input), pullUpCorePriority(input)]

  // Prescriptions: equipment-filtered, then injury-modulated.
  const exercises: Record<string, ExercisePick[]> = {}
  for (const [id, picks] of Object.entries(PULLUP_EXERCISES)) {
    let list = picks.filter((p) => equipmentAllows(input.equipment, p.equipment))
    if (input.injuryFlags.includes("shoulder")) list = swapPassiveHangs(list)
    if (input.injuryFlags.includes("elbow")) list = swapNegativesForElbow(list)
    exercises[id] = list
  }

  const notes: string[] = []
  if (input.injuryFlags.includes("shoulder")) {
    notes.push("SHOULDER FLAG — passive dead hangs are swapped for active hangs (shoulders pulled down); stop any hang that pinches.")
  }
  if (input.injuryFlags.includes("elbow")) {
    notes.push("ELBOW FLAG — slow negatives are swapped for isometric flex hangs; cap eccentric volume and stop at sharp inner-elbow pain.")
  }
  if (input.deadHangSec == null) {
    notes.push("NO DEAD-HANG READING — the grip base and ladder rung lean on your pulling tests alone; time a max hang to size the base.")
  }
  if (input.invertedRowsReps == null && input.negativePullUpReps == null) {
    notes.push("NO PULLING TEST — inverted rows or slow negatives would size the lats and flexors; both read UNKNOWN.")
  }

  const hasGaps =
    canAnalyze &&
    (input.deadHangSec == null ||
      input.invertedRowsReps == null ||
      input.negativePullUpReps == null ||
      input.experience == null ||
      input.trainingDaysPerWeek == null ||
      input.sleepAvg7d == null)

  return {
    canAnalyze,
    missingCore,
    hasGaps,
    deadHangSec: input.deadHangSec,
    invertedRowsReps: input.invertedRowsReps,
    negativePullUpReps: input.negativePullUpReps,
    bodyweightPullKg: input.weightKg,
    band: pullUpBandFor(input.deadHangSec, input.invertedRowsReps, input.negativePullUpReps),
    ladder: [...PULLUP_LADDER],
    currentRung: currentPullUpRung(input),
    majorMuscles,
    minorMuscles,
    exercises,
    habits: [...PULLUP_HABITS],
    notes,
  }
}

// ── 5K TIME — input & view types ─────────────────────────────────────────────

/** Running equipment is a different axis than gym tiers: none = roads and
 *  open ground only, track = a measured track. Track access is always a
 *  local-only answer (no server surface implies a track). */
export type RunEquipment = "none" | "track"

export type Run5kInput = {
  weightKg: number | null
  heightCm: number | null
  /** Best logged 5K, seconds. */
  best5kSec: number | null
  /** Best all-out 1K, seconds — converted to a 5K equivalent when no 5K exists. */
  best1kSec: number | null
  /** Weekly running volume, km — local-only answer (no metric type). */
  weeklyRunKm: number | null
  restingHr: number | null
  trainingDaysPerWeek: number | null
  experience: JumpExperience | null
  sleepAvg7d: number | null
  /** True when any run/jog/sprint record exists — always computable. */
  runExposure: boolean
  equipment: RunEquipment | null
  /** User-flagged injury cautions — subset of "knee" | "ankle" | "back". */
  injuryFlags: readonly string[]
}

export type RunBand = { id: string; label: string; range: string }

/** A running prescription — same shape as ExercisePick but on the run axis. */
export type RunPick = {
  name: string
  scheme: string
  rest: string
  why: string
  equipment: RunEquipment
}

export type Run5kAssessment = {
  /** A 5K or 1K time exists. */
  canAnalyze: boolean
  missingCore: string[]
  hasGaps: boolean
  best5kSec: number | null
  best1kSec: number | null
  /** actual 5K when logged, else the 1K equivalent. */
  effective5kSec: number | null
  usedEquivalent: boolean
  /** The 1K→5K conversion whenever a 1K exists (cross-check line when the 5K is real). */
  equivalent5kSec: number | null
  band: RunBand | null
  /** effective5kSec ÷ 5 — the min/km readout. */
  paceSecPerKm: number | null
  /** Training-focus matrix rows (the run analogue of the muscle matrix). */
  majorFocus: MusclePriority[]
  minorFocus: MusclePriority[]
  exercises: Record<string, RunPick[]>
  habits: HabitItem[]
  notes: string[]
}

// ── 5K TIME — conversion, bands & formatting ─────────────────────────────────

/**
 * 1K → 5K pace-equivalent conversion: T(5K) = T(1K) × 5^1.06 — the standard
 * race-equivalency exponent that pace-equivalent tables are built on
 * (CONSENSUS framing: an EQUIVALENT, not a guarantee — heat, hills, pacing
 * and endurance shift the real day). A real 5K always outranks it.
 */
export const RIEGEL_K5 = 5 ** 1.06 // ≈ 5.508

export function equivalent5kSec(best1kSec: number | null): number | null {
  if (best1kSec == null || !Number.isFinite(best1kSec) || best1kSec <= 0) return null
  return Math.round(best1kSec * RIEGEL_K5)
}

/**
 * General 5K time bands for adults (raw clock, lower edge inclusive): sub-20
 * exceptional · 20–25 very good · 25–32 good · 32–40 average range · 40+
 * developing. These are general coaching bands, NOT normative percentiles —
 * age, sex, heat, hills and course profile all shift the reading. Render
 * under "GENERAL BANDS · NOT NORMATIVE".
 */
export function runBandFor(best5kSec: number | null): RunBand | null {
  if (best5kSec == null || !Number.isFinite(best5kSec)) return null
  if (best5kSec < 20 * 60) return { id: "exceptional", label: "EXCEPTIONAL", range: "SUB 20:00" }
  if (best5kSec < 25 * 60) return { id: "very-good", label: "VERY GOOD", range: "20–25 MIN" }
  if (best5kSec < 32 * 60) return { id: "good", label: "GOOD", range: "25–32 MIN" }
  if (best5kSec < 40 * 60) return { id: "average", label: "AVERAGE RANGE", range: "32–40 MIN" }
  return { id: "developing", label: "DEVELOPING", range: "40:00+" }
}

/** "22:02"-style clock — null-safe, whole seconds, minutes unbounded. */
export function fmtRunClock(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec)) return null
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, "0")}`
}

/** min/km pace from a 5K clock — "4:24" style. */
export function fmtPacePerKm(sec5k: number | null): string | null {
  if (sec5k == null || !Number.isFinite(sec5k) || sec5k <= 0) return null
  return fmtRunClock(sec5k / 5)
}

// ── 5K TIME — the prescription catalog ───────────────────────────────────────
// Equipment axis: "none" = roads/open ground only, "track" = measured track
// (track ⊇ roads). Keyed by training-focus id (the same ids the focus
// priorities carry — the report joins prescriptions on muscle/focus id).

export const RUN_5K_EXERCISES: Record<string, RunPick[]> = {
  aerobicBase: [
    { name: "Easy Run", scheme: "3–4 × /WK · 30–45 MIN", rest: "TALK-PACE", equipment: "none", why: "Conversation-pace km that grow the engine — the bulk of the week." },
    { name: "Long Run", scheme: "1 × /WK · 60–90 MIN", rest: "EASY", equipment: "none", why: "The single biggest aerobic stimulus of the week — slow is the point." },
  ],
  tempoThreshold: [
    { name: "Tempo Run", scheme: "2 × 10–15 MIN · COMFORTABLY HARD", rest: "3 MIN JOG", equipment: "none", why: "Threshold pace — the effort you could hold for about an hour, taught to the legs." },
    { name: "Cruise Intervals", scheme: "4–5 × 5 MIN @ THRESHOLD", rest: "90 S JOG", equipment: "none", why: "Threshold work in biteable chunks — same stimulus, easier to nail." },
    { name: "Fartlek", scheme: "8 × 1 MIN FAST / 2 MIN EASY", rest: "FREE-FORM", equipment: "none", why: "Unstructured effort play — fitness without the pressure of a session." },
    { name: "3 × 1 KM @ 5K PACE", scheme: "3 × 1 KM", rest: "3 MIN JOG", equipment: "track", why: "Race-pace reps on measured ground — pacing practice plus leg speed." },
  ],
  stridesSpeed: [
    { name: "Strides", scheme: "6–8 × 15–20 S · FAST/RELAXED", rest: "FULL RECOVERY", equipment: "none", why: "Short, fast, relaxed sprints that sharpen mechanics at near-zero fatigue cost." },
    { name: "Hill Reps", scheme: "8–10 × 30 S UPHILL", rest: "WALK DOWN", equipment: "none", why: "Uphill power without flat-landing impact — strength and speed in one." },
    { name: "400 M Reps", scheme: "6–8 × 400 M @ 5K PACE", rest: "90 S REST", equipment: "track", why: "The classic track rep — race pace made repeatable on measured ground." },
  ],
}

const RUN_EQUIP_RANK: Record<RunEquipment, number> = { none: 0, track: 1 }

/** Track access runs everything roads can (track ⊇ roads); unknown → show all. */
export function runEquipmentAllows(available: RunEquipment | null, need: RunEquipment): boolean {
  if (available == null) return true
  return RUN_EQUIP_RANK[available] >= RUN_EQUIP_RANK[need]
}

// ── 5K TIME — the habit stack ────────────────────────────────────────────────

export const RUN_5K_HABITS: readonly HabitItem[] = [
  { title: "KEEP IT 80/20", detail: "Roughly 80% of weekly volume easy, ~20% hard — the split most endurance plans converge on.", scienceId: "polarized" },
  { title: "EASY MEANS EASY", detail: "Easy days stay conversational — that effort builds the base that carries the fast days.", scienceId: "zone2" },
  { title: "3+ RUN DAYS / WEEK", detail: "Consistency beats heroics — spread the volume across the week rather than stacking it.", scienceId: "who-aerobic" },
  { title: "SLEEP 7–9 H", detail: "Aerobic adaptation happens during recovery — guard sleep like a session.", scienceId: "sleep-athletes" },
  { title: "RAMP BEFORE SPEED", detail: "Raise, Activate, Mobilise, Potentiate — never start strides or reps cold.", scienceId: "ramp-warmup" },
  { title: "GROW VOLUME SLOWLY", detail: "Progressive overload applies to kilometres too — small weekly jumps, not leaps.", scienceId: "nsca-overload" },
  { title: "RE-TEST EVERY 6–8 WEEKS", detail: "Same course, same conditions — replace the equivalent with a real 5K clock.", scienceId: "fivek-pace" },
]

// ── 5K TIME — training-focus priority heuristics ─────────────────────────────
// The run analogue of the muscle matrix: MAJOR = aerobic base + tempo-threshold,
// MINOR = strides-speed. Every threshold is a documented coaching heuristic;
// every why names its driver; missing drivers degrade to honest UNKNOWN.

function aerobicBasePriority(bandId: string | null, volume: number | null, restingHr: number | null): MusclePriority {
  const base = { id: "aerobicBase", name: "Aerobic Base", role: "major" as const }
  // Decision order (each rule returns, so the order IS the precedence):
  // 1. no time and no volume → honest UNKNOWN (rhr corroborates nothing alone)
  // 2. a developing/average time band → the engine is the limiter (time-driven)
  // 3. volume under 10 km/wk → the engine is the lever (volume-driven)
  // 4. fast band + 25+ km/wk → base built (low)
  // 5. fast band + no volume answer → moderate (time reads fast, km unverified)
  // 6. everything else (mid volumes / good band) → moderate.
  // Resting HR never flips a priority — it only corroborates in the why line.
  const rhrNote =
    restingHr != null
      ? ` Resting HR ${Math.round(restingHr)} bpm ${restingHr <= 60 ? "corroborates a built base" : "sits high — easy volume work pays"}.`
      : ""
  if (bandId == null && volume == null) {
    return { ...base, priority: "unknown", why: "No time and no volume data — the aerobic base reads UNKNOWN; answer weekly km or log a time." }
  }
  if (bandId === "developing" || bandId === "average") {
    return { ...base, priority: "high", why: `A 5K in this band says the engine is the limiter — easy volume raises it fastest.${rhrNote}` }
  }
  if (volume != null && volume < 10) {
    return { ...base, priority: "high", why: `Only ${volume} km/week — the aerobic base is the biggest lever available.${rhrNote}` }
  }
  if ((bandId === "very-good" || bandId === "exceptional") && volume != null && volume >= 25) {
    return { ...base, priority: "low", why: `${volume} km/week with a time in this band — the base is built; maintain it and sharpen.${rhrNote}` }
  }
  if ((bandId === "very-good" || bandId === "exceptional") && volume == null) {
    return { ...base, priority: "moderate", why: "The time reads fast, but weekly km is unanswered — the base is probably built, unverified." }
  }
  if (volume != null && volume >= 10 && volume < 25) {
    return { ...base, priority: "moderate", why: `${volume} km/week is a working base — steady easy volume keeps paying.${rhrNote}` }
  }
  return { ...base, priority: "moderate", why: "Mid-range reading — the base is present and worth feeding with easy volume." }
}

function tempoThresholdPriority(bandId: string | null, volume: number | null): MusclePriority {
  const base = { id: "tempoThreshold", name: "Tempo · Threshold", role: "major" as const }
  // Threshold emphasis reads off the time band (the sharpening lever once the
  // engine exists, wasted on a small one); volume only colors the why line.
  if (bandId == null) {
    return { ...base, priority: "unknown", why: "No time to read — threshold emphasis ranks off the 5K band; data missing." }
  }
  if (bandId === "exceptional" || bandId === "very-good") {
    return { ...base, priority: "high", why: `A 5K in this band${volume != null ? ` on ${volume} km/week` : ""} — threshold work is the next lever.` }
  }
  if (bandId === "good") {
    return { ...base, priority: "moderate", why: `A 25–32 MIN 5K — a tempo block converts the base you have into pace.${volume != null ? ` (${volume} km/week logged.)` : ""}` }
  }
  return { ...base, priority: "low", why: "Base first — the tempo effect is wasted on a small engine; come back to it as the clock drops." }
}

function stridesSpeedPriority(experience: JumpExperience | null): MusclePriority {
  const base = { id: "stridesSpeed", name: "Strides · Speed", role: "minor" as const }
  // Training-age driven: short fast reps with full recovery are cheap speed
  // early (novice), maintenance later; no training-age answer → UNKNOWN.
  if (experience == null) {
    return { ...base, priority: "unknown", why: "No training-age answer — stride sharpness can't be ranked; data missing." }
  }
  if (experience === "novice") {
    return { ...base, priority: "moderate", why: "Novice training age — short fast reps with full recovery are cheap speed right now." }
  }
  return { ...base, priority: "low", why: "Likely grooved at your training age — keep strides as a staple, not a focus." }
}

// ── 5K TIME — inventory & assessment ─────────────────────────────────────────

export function run5kDataChips(input: Run5kInput): DataChip[] {
  const chips: DataChip[] = []
  const add = (id: string, label: string, have: boolean, valueLabel: string | null, source: string) => {
    chips.push({ id, label, have, valueLabel, source })
  }
  add("weight", "WEIGHT", input.weightKg != null, input.weightKg != null ? `${fmtCm(input.weightKg)} KG` : null, "PROFILE")
  add("height", "HEIGHT", input.heightCm != null, input.heightCm != null ? `${fmtCm(input.heightCm)} CM` : null, "PROFILE")
  add("best5k", "BEST 5K", input.best5kSec != null, input.best5kSec != null ? (fmtRunClock(input.best5kSec) ?? "—") : null, "BODY METRICS")
  add("best1k", "BEST 1K", input.best1kSec != null, input.best1kSec != null ? (fmtRunClock(input.best1kSec) ?? "—") : null, "BODY METRICS")
  add("volume", "WEEKLY RUN KM", input.weeklyRunKm != null, input.weeklyRunKm != null ? `${Math.round(input.weeklyRunKm)} KM` : null, "LOCAL")
  add("restinghr", "RESTING HR", input.restingHr != null, input.restingHr != null ? `${Math.round(input.restingHr)} BPM` : null, "VITALS")
  // Run exposure is always COMPUTABLE from the record set — "none logged" is
  // a real finding, not a data gap (the plyo-chip idiom, verbatim).
  add("runexp", "RUN EXPOSURE", true, input.runExposure ? "LOGGED" : "NONE LOGGED", "RECORDS")
  add("days", "TRAINING DAYS", input.trainingDaysPerWeek != null, input.trainingDaysPerWeek != null ? `${input.trainingDaysPerWeek} DAYS/WK` : null, "PROGRAM")
  add("experience", "EXPERIENCE", input.experience != null, input.experience != null ? input.experience.toUpperCase() : null, "PROGRAM")
  add("sleep", "SLEEP 7-DAY AVG", input.sleepAvg7d != null, input.sleepAvg7d != null ? `${input.sleepAvg7d.toFixed(1)} H` : null, "VITALS")
  add("track", "TRACK ACCESS", input.equipment != null, input.equipment != null ? (input.equipment === "track" ? "TRACK" : "ROADS") : null, "LOCAL")
  return chips
}

export function assess5kTime(input: Run5kInput): Run5kAssessment {
  // Core: a 5K or a 1K clock — without one there is no band and no verdict.
  const missingCore: string[] = []
  if (input.best5kSec == null && input.best1kSec == null) missingCore.push("time")
  const canAnalyze = missingCore.length === 0

  // The real 5K outranks the equivalent; the equivalent is computed whenever
  // a 1K exists (it becomes the cross-check line when the 5K is real).
  const equivSec = equivalent5kSec(input.best1kSec)
  const usedEquivalent = input.best5kSec == null && equivSec != null
  const effective5kSec = input.best5kSec ?? (usedEquivalent ? equivSec : null)
  const band = runBandFor(effective5kSec)

  const majorFocus = [
    aerobicBasePriority(band?.id ?? null, input.weeklyRunKm, input.restingHr),
    tempoThresholdPriority(band?.id ?? null, input.weeklyRunKm),
  ]
  const minorFocus = [stridesSpeedPriority(input.experience)]

  const exercises: Record<string, RunPick[]> = {}
  for (const [id, picks] of Object.entries(RUN_5K_EXERCISES)) {
    exercises[id] = picks.filter((p) => runEquipmentAllows(input.equipment, p.equipment))
  }

  const notes: string[] = []
  if (usedEquivalent && equivSec != null) {
    notes.push(`EQUIVALENT ESTIMATE — this 5K is converted from your 1K (${fmtRunClock(input.best1kSec)} → ${fmtRunClock(equivSec)}, standard pace-equivalency). An equivalent, not a guarantee — log a real 5K to replace it.`)
  }
  if (input.best5kSec != null && equivSec != null) {
    notes.push(`1K CROSS-CHECK — your 1K equates to ≈ ${fmtRunClock(equivSec)}. A real 5K slower than that suggests endurance is the gap; faster suggests speed — an honest reading, not a rule.`)
  }
  if (input.weeklyRunKm == null) {
    notes.push("NO VOLUME READING — weekly km is unanswered; the focus matrix leans on the time band alone.")
  }
  if (!input.runExposure) {
    notes.push("NO RUN RECORDS — running exposure unverified; log any run session and the record speaks.")
  }
  if (input.injuryFlags.includes("knee")) {
    notes.push("KNEE FLAG — keep easy volume on flatter or softer routes, introduce hills gradually, and stop at sharp joint pain.")
  }
  if (input.injuryFlags.includes("ankle")) {
    notes.push("ANKLE FLAG — calf and Achilles complaints flare on fast rep work; keep strides short and surfaces even.")
  }
  if (input.injuryFlags.includes("back")) {
    notes.push("BACK FLAG — ease into hill reps and hold speed sessions on familiar, even ground while it calms.")
  }

  const hasGaps =
    canAnalyze &&
    (input.weeklyRunKm == null ||
      input.experience == null ||
      input.restingHr == null ||
      input.trainingDaysPerWeek == null ||
      input.sleepAvg7d == null ||
      input.equipment == null)

  return {
    canAnalyze,
    missingCore,
    hasGaps,
    best5kSec: input.best5kSec,
    best1kSec: input.best1kSec,
    effective5kSec,
    usedEquivalent,
    equivalent5kSec: equivSec,
    band,
    paceSecPerKm: effective5kSec != null && effective5kSec > 0 ? effective5kSec / 5 : null,
    majorFocus,
    minorFocus,
    exercises,
    habits: [...RUN_5K_HABITS],
    notes,
  }
}
