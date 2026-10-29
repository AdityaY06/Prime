// ─── PRIME · Program generator — equipment-aware splits over the exercise library ──
// Pure library: no server-only imports (safe in client components + API routes).
// Deterministic-with-seed: the same seed always forges the same program, a new
// seed reshuffles the eligible pools for variety on regenerate.

import {
  EXERCISE_LIBRARY,
  type ExerciseDef,
  type ExerciseEquipment,
  type ExerciseType,
  type MuscleId,
} from "./muscles"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProgramGoal = "strength" | "hypertrophy" | "fatloss" | "general"
export type EquipmentProfile = "none" | "home" | "gym"
export type Experience = "novice" | "intermediate" | "advanced"

export type ProgramBlock = {
  exerciseId: string
  name: string
  equipment: ExerciseEquipment
  type: ExerciseType
  sets: number
  /** Rep range ("8-12") or a time prescription ("45-60s", "8-10 min"). */
  reps: string
  restSec: number
  rpe?: number
  notes?: string
  science?: string
  cues?: string[]
}

export type ProgramDay = {
  day: number
  focus: string
  tagline?: string
  /** Advisory shown when the equipment/level can't cover the day's ideal targets. */
  notes?: string
  blocks: ProgramBlock[]
  warmup?: string[]
  cooldown?: string[]
}

export type GeneratedProgram = {
  name: string
  goal: ProgramGoal
  equipment: EquipmentProfile
  experience: Experience
  /** One entry per training day — length is the days/week count. */
  days: ProgramDay[]
  /** Total working sets across the whole week. */
  weeklyVolume: number
  estMinutesPerDay: number
}

export type ProgramInput = {
  goal: ProgramGoal
  equipment: EquipmentProfile
  days: number
  experience: Experience
  seed?: number
}

/** Program row as served to the client (plan parsed from JSON). */
export type ProgramDTO = {
  id: string
  name: string
  goal: ProgramGoal
  equipment: EquipmentProfile
  days: number
  experience: Experience
  plan: GeneratedProgram
  createdAt: string
}

// ── Enum helpers ──────────────────────────────────────────────────────────────

export const GOALS: ProgramGoal[] = ["strength", "hypertrophy", "fatloss", "general"]
export const EQUIPMENT_PROFILES: EquipmentProfile[] = ["none", "home", "gym"]
export const EXPERIENCES: Experience[] = ["novice", "intermediate", "advanced"]

/** Equipment allowed per profile — the heart of "equipment-aware". */
export const EQUIPMENT_ALLOWANCE: Record<EquipmentProfile, ExerciseEquipment[]> = {
  none: ["bodyweight", "none"],
  home: ["bodyweight", "none", "dumbbell", "kettlebell", "band"],
  gym: [
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "kettlebell",
    "band",
    "bodyweight",
    "cardio-machine",
    "none",
  ],
}

export const EXPERIENCE_CEILING: Record<Experience, 1 | 2 | 3> = {
  novice: 1,
  intermediate: 2,
  advanced: 3,
}

// ── Split templates ───────────────────────────────────────────────────────────

export type FocusKey = "full-body" | "upper" | "lower" | "push" | "pull" | "legs"

type DayTemplate = { focus: FocusKey; variant?: string }

const SPLITS: Record<number, DayTemplate[]> = {
  2: [
    { focus: "full-body", variant: "A" },
    { focus: "full-body", variant: "B" },
  ],
  3: [
    { focus: "full-body", variant: "A" },
    { focus: "full-body", variant: "B" },
    { focus: "full-body", variant: "C" },
  ],
  4: [
    { focus: "upper", variant: "A" },
    { focus: "lower", variant: "A" },
    { focus: "upper", variant: "B" },
    { focus: "lower", variant: "B" },
  ],
  5: [
    { focus: "push" },
    { focus: "pull" },
    { focus: "legs" },
    { focus: "upper" },
    { focus: "lower" },
  ],
  6: [
    { focus: "push", variant: "A" },
    { focus: "pull", variant: "A" },
    { focus: "legs", variant: "A" },
    { focus: "push", variant: "B" },
    { focus: "pull", variant: "B" },
    { focus: "legs", variant: "B" },
  ],
}

export function splitForDays(days: number): DayTemplate[] {
  return SPLITS[days] ?? SPLITS[4]
}

/** Short split label for the live summary line ("UPPER/LOWER ×2"). */
export const SPLIT_LABEL: Record<number, string> = {
  2: "FULL BODY ×2",
  3: "FULL BODY ×3",
  4: "UPPER/LOWER ×2",
  5: "PPL + UPPER/LOWER",
  6: "PPL ×2",
}

const FOCUS_LABEL: Record<FocusKey, string> = {
  "full-body": "Full Body",
  upper: "Upper",
  lower: "Lower",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
}

/** Ordered muscle targets per focus — the day's coverage agenda. */
const FOCUS_TARGETS: Record<FocusKey, MuscleId[]> = {
  "full-body": ["chest", "lats", "quads", "hamstrings", "shoulders", "core"],
  upper: ["chest", "lats", "shoulders", "triceps", "biceps"],
  lower: ["quads", "hamstrings", "glutes", "calves", "core"],
  push: ["chest", "shoulders", "triceps"],
  pull: ["lats", "traps", "biceps", "forearms"],
  legs: ["quads", "hamstrings", "glutes", "calves"],
}

/**
 * When the eligible pool can't cover ANY of a focus's own targets (e.g. a
 * pull day with no bar, bands or rows yet — genuinely impossible without
 * equipment), fall back to synergist muscles that still train the region.
 */
const FOCUS_FALLBACK: Record<FocusKey, MuscleId[]> = {
  "full-body": ["chest", "quads", "shoulders", "core", "glutes", "calves"],
  upper: ["chest", "shoulders", "triceps", "core", "lower-back"],
  lower: ["quads", "glutes", "core", "calves", "lower-back"],
  push: ["chest", "shoulders", "triceps", "core"],
  pull: ["core", "chest", "shoulders", "triceps"],
  legs: ["quads", "glutes", "core", "calves", "lower-back"],
}

const FOCUS_TAGLINES: Record<FocusKey, string[]> = {
  "full-body": [
    "Every major pattern in one session — squat, hinge, press, pull.",
    "The whole chassis, top to bottom, in a single standing.",
  ],
  upper: [
    "Press and pull — load the upper chassis.",
    "Chest, back, shoulders and arms under one roof.",
  ],
  lower: [
    "The engine room — legs, hips and posterior chain.",
    "Squat, hinge and carry — everything below the belt.",
  ],
  push: [
    "Chest, shoulders and triceps — press day.",
    "Horizontal and vertical pressing, then finish the arms.",
  ],
  pull: [
    "Back and biceps — pull day.",
    "Rows and pulldowns — build the V-taper.",
  ],
  legs: [
    "Quads, hamstrings, glutes — leg day.",
    "Knee-dominant, hip-dominant, then calves.",
  ],
}

const NAME_POOL: Record<ProgramGoal, string[]> = {
  strength: ["IRON ORDER", "LOAD DOCTRINE", "STRENGTH DIRECTIVE"],
  hypertrophy: ["GROWTH ARC", "FORGE FRAME", "HYPERTROPHY ENGINE"],
  fatloss: ["FURNACE PROTOCOL", "AFTERBURN", "LEAN ENGINE"],
  general: ["PRIME BALANCE", "ALL-ROUNDER PATH", "VITAL BASELINE"],
}

// ── Exercise classification ───────────────────────────────────────────────────

/** Classic compounds whose primary-muscle list is a single muscle. */
const KNOWN_COMPOUNDS = new Set<string>([
  // pressing
  "bench-press", "incline-bench-press", "decline-bench-press", "close-grip-bench",
  "floor-press", "dumbbell-bench-press", "incline-dumbbell-press", "overhead-press",
  "push-press", "seated-dumbbell-press", "arnold-press", "kettlebell-press",
  "push-ups", "incline-push-up", "decline-push-up", "wide-push-up", "dips",
  // pulling
  "barbell-row", "single-arm-dumbbell-row", "seated-cable-row", "machine-row",
  "lat-pulldown", "assisted-pull-up", "pull-ups", "inverted-row", "pull-up-negatives",
  "kettlebell-row", "band-row", "band-lat-pulldown",
  // squat / hinge / carry
  "barbell-squat", "front-squat", "pause-squat", "zercher-squat", "hack-squat",
  "leg-press", "dumbbell-squat", "goblet-squat", "dumbbell-goblet-squat",
  "bodyweight-squats", "lunges", "barbell-lunge", "dumbbell-walking-lunge",
  "step-up", "dumbbell-step-up", "hip-thrust", "band-squat", "band-chest-press",
])

/** Compound heuristic: 2+ primary muscles, or a known compound lift. */
function isCompound(ex: ExerciseDef): boolean {
  return ex.muscles.primary.length >= 2 || KNOWN_COMPOUNDS.has(ex.id)
}

/** Preferred fat-loss finishers, best-first. */
const FINISHER_PREF = [
  "jumping-jacks", "burpees", "jump-rope", "mountain-climbers", "high-knees",
  "battle-ropes", "assault-bike", "rowing-intervals", "hiit-circuit", "boxing",
  "tuck-jump", "broad-jump", "swimming", "rucking", "stair-climbing",
]

/** Which body regions each mobility entry loosens. */
const MOBILITY_REGION: Record<string, ("upper" | "lower")[]> = {
  "hip-mobility": ["lower"],
  "90-90-hips": ["lower"],
  "couch-stretch": ["lower"],
  "pigeon-pose": ["lower"],
  "worlds-greatest-stretch": ["lower", "upper"],
  "cat-cow": ["lower", "upper"],
  "downward-dog": ["upper", "lower"],
  "thoracic-rotation": ["upper"],
  "shoulder-dislocates": ["upper"],
  "thread-the-needle": ["upper"],
  "childs-pose": ["upper"],
  "shoulder-band-work": ["upper"],
  "yoga-flow": ["upper", "lower"],
  "full-body-stretch": ["upper", "lower"],
}

// ── Warm-up / cooldown line pools ─────────────────────────────────────────────

type Region = "upper" | "lower" | "full"

const WARMUP_POOL: Record<Region, string[]> = {
  lower: [
    "5 MIN EASY CARDIO — BIKE OR BRISK WALK",
    "LEG SWINGS ×10 FRONT + SIDE PER LEG",
    "BODYWEIGHT SQUATS ×10 — GROOVE THE PATTERN",
    "GLUTE BRIDGES ×10 — WAKE THE HIPS",
    "CALF ROCKS ×10 — ANKLES READY",
  ],
  upper: [
    "5 MIN EASY CARDIO — ROW OR ARM SWINGS",
    "ARM CIRCLES ×10 EACH DIRECTION",
    "BAND OR DOWEL PULL-APARTS ×15 — PRIME THE SHOULDERS",
    "PUSH-UPS ×8 — GROOVE THE PRESS",
    "THORACIC ROTATIONS ×8 PER SIDE",
  ],
  full: [
    "5 MIN EASY CARDIO — ANY MACHINE",
    "WORLD'S GREATEST STRETCH ×5 PER SIDE",
    "BODYWEIGHT SQUATS ×10 — GROOVE THE PATTERN",
    "ARM CIRCLES ×10 + LEG SWINGS ×10",
    "CAT-COW ×8 — SPINE READY",
  ],
}

const COOLDOWN_POOL: Record<Region, string[]> = {
  lower: [
    "5 MIN EASY WALK — HEART RATE DOWN",
    "QUAD + HAMSTRING STRETCH — 45S PER SIDE",
    "CALF STRETCH — 30S PER SIDE",
  ],
  upper: [
    "5 MIN EASY WALK — HEART RATE DOWN",
    "CHEST DOORWAY STRETCH — 45S PER SIDE",
    "LAT + TRICEP STRETCH — 30S PER SIDE",
  ],
  full: [
    "5 MIN EASY WALK — HEART RATE DOWN",
    "STRETCH TODAY'S PRIME MOVERS — 45S EACH",
    "BREATHE: 4S IN / 6S OUT ×5",
  ],
}

function regionForFocus(focus: FocusKey): Region {
  if (focus === "upper" || focus === "push" || focus === "pull") return "upper"
  if (focus === "lower" || focus === "legs") return "lower"
  return "full"
}

// ── Prescriptions (goal × experience × compound/isolation) ────────────────────

type Rx = { sets: number; reps: string; restSec: number; rpe?: number }

const RX_TABLE: Record<ProgramGoal, Record<Experience, { compound: Rx; isolation: Rx }>> = {
  // strength → 4-5 × 3-6, rest 180s, RPE 7-8 (novice 3 × 5-8)
  strength: {
    novice: { compound: { sets: 3, reps: "5-8", restSec: 180, rpe: 7 }, isolation: { sets: 2, reps: "8-10", restSec: 90, rpe: 7 } },
    intermediate: { compound: { sets: 4, reps: "4-6", restSec: 180, rpe: 8 }, isolation: { sets: 3, reps: "8-10", restSec: 120, rpe: 8 } },
    advanced: { compound: { sets: 5, reps: "3-5", restSec: 180, rpe: 8 }, isolation: { sets: 3, reps: "6-8", restSec: 120, rpe: 8 } },
  },
  // hypertrophy → 3-4 × 8-12, rest 90-120s, RPE 7-9 (accessories: 10-15)
  hypertrophy: {
    novice: { compound: { sets: 3, reps: "8-12", restSec: 90, rpe: 7 }, isolation: { sets: 3, reps: "10-15", restSec: 60, rpe: 7 } },
    intermediate: { compound: { sets: 4, reps: "8-12", restSec: 90, rpe: 8 }, isolation: { sets: 3, reps: "10-15", restSec: 75, rpe: 8 } },
    advanced: { compound: { sets: 4, reps: "8-12", restSec: 120, rpe: 8 }, isolation: { sets: 4, reps: "12-15", restSec: 90, rpe: 8 } },
  },
  // fatloss → 3 × 12-15, rest 45-60s, RPE 8 (finisher appended separately)
  fatloss: {
    novice: { compound: { sets: 3, reps: "12-15", restSec: 60, rpe: 7 }, isolation: { sets: 3, reps: "12-15", restSec: 60, rpe: 7 } },
    intermediate: { compound: { sets: 3, reps: "12-15", restSec: 60, rpe: 8 }, isolation: { sets: 3, reps: "12-15", restSec: 60, rpe: 8 } },
    advanced: { compound: { sets: 3, reps: "12-15", restSec: 45, rpe: 8 }, isolation: { sets: 3, reps: "12-15", restSec: 45, rpe: 8 } },
  },
  // general → 2-3 × 10-12, rest 60-90s, moderate effort
  general: {
    novice: { compound: { sets: 2, reps: "10-12", restSec: 90, rpe: 6 }, isolation: { sets: 2, reps: "10-15", restSec: 60, rpe: 6 } },
    intermediate: { compound: { sets: 3, reps: "10-12", restSec: 75, rpe: 7 }, isolation: { sets: 3, reps: "10-15", restSec: 60, rpe: 7 } },
    advanced: { compound: { sets: 3, reps: "10-12", restSec: 60, rpe: 7 }, isolation: { sets: 3, reps: "10-15", restSec: 60, rpe: 7 } },
  },
}

/** Convert a pure numeric rep range ("8-12") to a seconds range; pass formatted strings through. */
function repsToTime(reps: string): string {
  if (!/^\d+(-\d+)?$/.test(reps)) return reps
  const [a, b] = reps.split("-").map(Number)
  const lo = Math.max(20, Math.round((a * 3) / 5) * 5)
  const hi = Math.max(lo, Math.round((b * 3) / 5) * 5)
  return lo === hi ? `${lo}s` : `${lo}-${hi}s`
}

function rxForBlock(def: ExerciseDef, rx: Rx): Rx {
  return { ...rx, reps: def.unit === "time" ? repsToTime(rx.reps) : rx.reps }
}

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

/** Small deterministic PRNG — same seed, same program. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: readonly T[], rnd: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Time estimate ─────────────────────────────────────────────────────────────

/** ~4 min per working set (rest + work + transition) + 8 min warm-up heuristic. */
function dayMinutes(day: ProgramDay): number {
  let m = 8
  for (const b of day.blocks) m += b.sets * (b.restSec / 60 + 0.75)
  return Math.round(m)
}

// ── Selection engine ──────────────────────────────────────────────────────────

type SelCtx = {
  mainPool: ExerciseDef[]
  cardioPool: ExerciseDef[]
  mobilityPool: ExerciseDef[]
  rank: Map<string, number>
  usage: Map<string, number>
}

type PreferKind = "none" | "bodyweight" | "strength"

function makeComparator(ctx: SelCtx, prefer: PreferKind) {
  return (a: ExerciseDef, b: ExerciseDef): number => {
    // compounds before isolation accessories
    const ca = isCompound(a) ? 0 : 1
    const cb = isCompound(b) ? 0 : 1
    if (ca !== cb) return ca - cb
    if (prefer !== "none") {
      const wa = a.type === (prefer === "bodyweight" ? "bodyweight" : "strength") ? 0 : 1
      const wb = b.type === (prefer === "bodyweight" ? "bodyweight" : "strength") ? 0 : 1
      if (wa !== wb) return wa - wb
    }
    // less-used exercises first → variety across the week
    const ua = ctx.usage.get(a.id) ?? 0
    const ub = ctx.usage.get(b.id) ?? 0
    if (ua !== ub) return ua - ub
    // seeded shuffle breaks ties → same seed, same pick
    return (ctx.rank.get(a.id) ?? 0) - (ctx.rank.get(b.id) ?? 0)
  }
}

function pickForTarget(
  ctx: SelCtx,
  target: MuscleId,
  used: Set<string>,
  compoundOnly: boolean,
  prefer: PreferKind
): ExerciseDef | null {
  const eligible = ctx.mainPool.filter(
    (ex) =>
      !used.has(ex.id) &&
      ex.muscles.primary.includes(target) &&
      (!compoundOnly || isCompound(ex))
  )
  if (eligible.length === 0) return null
  eligible.sort(makeComparator(ctx, prefer))
  return eligible[0]
}

/** Exercises hitting the day's targets via secondary muscles only. */
function pickSecondary(
  ctx: SelCtx,
  targets: MuscleId[],
  used: Set<string>
): ExerciseDef | null {
  const eligible = ctx.mainPool.filter(
    (ex) => !used.has(ex.id) && targets.some((m) => ex.muscles.secondary.includes(m))
  )
  if (eligible.length === 0) return null
  eligible.sort(makeComparator(ctx, "none"))
  return eligible[0]
}

function pickAny(ctx: SelCtx, used: Set<string>): ExerciseDef | null {
  const eligible = ctx.mainPool.filter((ex) => !used.has(ex.id))
  if (eligible.length === 0) return null
  eligible.sort(makeComparator(ctx, "none"))
  return eligible[0]
}

// ── Block builders ────────────────────────────────────────────────────────────

function buildBlock(def: ExerciseDef, rx: Rx, notes?: string): ProgramBlock {
  const r = rxForBlock(def, rx)
  return {
    exerciseId: def.id,
    name: def.name,
    equipment: def.equipment,
    type: def.type,
    sets: r.sets,
    reps: r.reps,
    restSec: r.restSec,
    ...(r.rpe !== undefined ? { rpe: r.rpe } : {}),
    ...(notes ? { notes } : {}),
    ...(def.science ? { science: def.science } : {}),
    ...(def.cues.length > 0 ? { cues: def.cues } : {}),
  }
}

function finisherBlock(ctx: SelCtx, experience: Experience): ProgramBlock | null {
  const eligible = ctx.cardioPool
  if (eligible.length === 0) return null
  const sorted = [...eligible].sort((a, b) => {
    const pa = FINISHER_PREF.indexOf(a.id)
    const pb = FINISHER_PREF.indexOf(b.id)
    const fa = pa === -1 ? Number.MAX_SAFE_INTEGER : pa
    const fb = pb === -1 ? Number.MAX_SAFE_INTEGER : pb
    if (fa !== fb) return fa - fb
    const ua = ctx.usage.get(a.id) ?? 0
    const ub = ctx.usage.get(b.id) ?? 0
    if (ua !== ub) return ua - ub
    return (ctx.rank.get(a.id) ?? 0) - (ctx.rank.get(b.id) ?? 0)
  })
  const def = sorted[0]
  const rx: Rx =
    def.unit === "time"
      ? { sets: 1, reps: "8-10 min", restSec: 0, rpe: 8 }
      : { sets: 3, reps: "20-30", restSec: experience === "novice" ? 60 : 45, rpe: 8 }
  return buildBlock(def, rx, "Finisher — minimal rest, keep moving.")
}

function conditioningBlock(ctx: SelCtx): ProgramBlock | null {
  if (ctx.cardioPool.length === 0) return null
  const sorted = [...ctx.cardioPool].sort((a, b) => {
    const ua = ctx.usage.get(a.id) ?? 0
    const ub = ctx.usage.get(b.id) ?? 0
    if (ua !== ub) return ua - ub
    return (ctx.rank.get(a.id) ?? 0) - (ctx.rank.get(b.id) ?? 0)
  })
  const def = sorted[0]
  const rx: Rx =
    def.unit === "time"
      ? { sets: 1, reps: "10-15 min", restSec: 0, rpe: 6 }
      : { sets: 2, reps: "12-15", restSec: 60, rpe: 6 }
  return buildBlock(def, rx, "Conditioning — steady, conversational pace.")
}

function mobilityBlock(ctx: SelCtx, region: Region): ProgramBlock | null {
  const wanted: ("upper" | "lower")[] = region === "full" ? ["upper", "lower"] : [region]
  const match = ctx.mobilityPool.filter((ex) =>
    (MOBILITY_REGION[ex.id] ?? []).some((r) => wanted.includes(r))
  )
  const pool = match.length > 0 ? match : ctx.mobilityPool
  if (pool.length === 0) return null
  const sorted = [...pool].sort((a, b) => {
    const ua = ctx.usage.get(a.id) ?? 0
    const ub = ctx.usage.get(b.id) ?? 0
    if (ua !== ub) return ua - ub
    return (ctx.rank.get(a.id) ?? 0) - (ctx.rank.get(b.id) ?? 0)
  })
  const def = sorted[0]
  const rx: Rx =
    def.unit === "time"
      ? { sets: 2, reps: "45-60s", restSec: 30 }
      : { sets: 2, reps: "10-12", restSec: 30 }
  return buildBlock(def, rx, "Cooldown — slow tempo, full breaths.")
}

// ── Main generator ────────────────────────────────────────────────────────────

export function generateProgram(input: ProgramInput): GeneratedProgram {
  const seed = input.seed ?? 1
  const rnd = mulberry32(seed)
  const goal = input.goal
  const experience = input.experience

  // eligible pool — equipment profile + difficulty ceiling
  const allowed = EQUIPMENT_ALLOWANCE[input.equipment]
  const ceiling = EXPERIENCE_CEILING[experience]
  const pool = EXERCISE_LIBRARY.filter(
    (e) => allowed.includes(e.equipment) && e.difficulty <= ceiling
  )
  const mainPool = pool.filter((e) => e.type === "strength" || e.type === "bodyweight")
  const cardioPool = pool.filter((e) => e.type === "cardio")
  const mobilityPool = pool.filter((e) => e.type === "mobility")

  // seeded shuffle → stable per-exercise tie-break rank
  const rank = new Map<string, number>()
  for (const ex of shuffle(mainPool, rnd)) rank.set(ex.id, rank.size)
  for (const ex of shuffle(cardioPool, rnd)) rank.set(ex.id, rank.size)
  for (const ex of shuffle(mobilityPool, rnd)) rank.set(ex.id, rank.size)

  const ctx: SelCtx = { mainPool, cardioPool, mobilityPool, rank, usage: new Map() }
  const bump = (id: string) => ctx.usage.set(id, (ctx.usage.get(id) ?? 0) + 1)

  // main-block budget per day (fewer days/week → more per full-body day)
  const baseBudget: Record<ProgramGoal, number> = {
    strength: 5,
    hypertrophy: 6,
    fatloss: 4,
    general: 4,
  }
  let budget = baseBudget[goal]
  if (input.days <= 2) budget += 1
  budget = Math.min(budget, 7)

  const templates = splitForDays(input.days)
  const rxTable = RX_TABLE[goal][experience]
  // general mixes strength + bodyweight + cardio; strength/hypertrophy prefer
  // loaded (equipment-bearing) work over plyo bodyweight variants
  const prefer: PreferKind =
    goal === "general" ? "bodyweight" : goal === "fatloss" ? "none" : "strength"

  const days: ProgramDay[] = templates.map((t, i) => {
    const region = regionForFocus(t.focus)
    const used = new Set<string>()
    const picked: ExerciseDef[] = []

    // coverage-filtered targets; fall back when the focus is gutted by equipment/level
    const baseTargets = FOCUS_TARGETS[t.focus]
    const covered = baseTargets.filter((m) =>
      mainPool.some((ex) => ex.muscles.primary.includes(m))
    )
    let targets = covered.length > 0 ? covered : FOCUS_FALLBACK[t.focus]
    let note: string | undefined
    if (covered.length === 0) {
      const fallbackCovered = targets.filter((m) =>
        mainPool.some((ex) => ex.muscles.primary.includes(m))
      )
      targets = fallbackCovered.length > 0 ? fallbackCovered : ["core"]
      note =
        "No equipment at this level covers the ideal targets for this day — " +
        "synergist work substituted until bands, a bar or a rower are available."
    }

    // phase 1 — one compound per target, in target order
    for (const m of targets) {
      if (picked.length >= budget) break
      const ex = pickForTarget(ctx, m, used, true, prefer)
      if (ex) {
        picked.push(ex)
        used.add(ex.id)
      }
    }
    // phase 2 — cycle the targets, any exercise, until budget
    let guard = 0
    while (picked.length < budget && guard++ < 50) {
      const before = picked.length
      for (const m of targets) {
        if (picked.length >= budget) break
        const ex = pickForTarget(ctx, m, used, false, prefer)
        if (ex) {
          picked.push(ex)
          used.add(ex.id)
        }
      }
      if (picked.length === before) break
    }
    // phase 3 — top-up via secondary hitters, then anything eligible (≥4 floor)
    while (picked.length < 4) {
      const ex = pickSecondary(ctx, targets, used) ?? pickAny(ctx, used)
      if (!ex) break
      picked.push(ex)
      used.add(ex.id)
    }

    const blocks: ProgramBlock[] = picked.map((def) =>
      buildBlock(def, isCompound(def) ? rxTable.compound : rxTable.isolation)
    )

    // goal extras
    if (goal === "fatloss") {
      const fin = finisherBlock(ctx, experience)
      if (fin) blocks.push(fin)
    }
    if (goal === "general") {
      const cond = conditioningBlock(ctx)
      if (cond) blocks.push(cond)
    }

    // structured mobility cooldown from the library's mobility entries
    const mob = mobilityBlock(ctx, region)
    if (mob) blocks.push(mob)

    for (const b of blocks) bump(b.exerciseId)

    const taglines = FOCUS_TAGLINES[t.focus]
    return {
      day: i + 1,
      focus: FOCUS_LABEL[t.focus] + (t.variant ? ` ${t.variant}` : ""),
      tagline: taglines[Math.floor(rnd() * taglines.length)],
      ...(note ? { notes: note } : {}),
      blocks,
      warmup: shuffle(WARMUP_POOL[region], rnd).slice(0, 3),
      cooldown: shuffle(COOLDOWN_POOL[region], rnd).slice(0, 2),
    }
  })

  const names = NAME_POOL[goal]
  const weeklyVolume = days.reduce((sum, d) => sum + d.blocks.reduce((s, b) => s + b.sets, 0), 0)
  const avgMinutes = Math.round(
    days.reduce((sum, d) => sum + dayMinutes(d), 0) / Math.max(1, days.length)
  )

  return {
    name: names[Math.floor(rnd() * names.length)],
    goal,
    equipment: input.equipment,
    experience,
    days,
    weeklyVolume,
    estMinutesPerDay: avgMinutes,
  }
}
