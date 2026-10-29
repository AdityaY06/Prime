// ─── PRIME · Program forge — pure deterministic generator ─────────────────────
// R7 "Program Integrity" rebuild: every day is assembled from an ordered SLOT
// TEMPLATE keyed by its focus. Movement patterns (not muscle tags) drive each
// pick, so a Push day can never leak a lunge and a Legs day can never leak a
// press; isometric holds are prescribed in seconds and cardio on honest
// duration grids. Plans are auditable after the fact via planIntegrityIssues().

import {
  EXERCISES,
  type Equipment,
  type Exercise,
  type Pattern,
  type PlanBlock,
  type PlanDay,
  type ProgramPlan,
} from "@/lib/exercises"

// ─── Forge input enums ────────────────────────────────────────────────────────

export type EquipmentTier = "none" | "home" | "full-gym"
export type Goal = "strength" | "hypertrophy" | "conditioning" | "mobility"
export type Experience = "novice" | "intermediate" | "advanced"

export type ForgeInput = {
  equipment: EquipmentTier
  goal: Goal
  days: number
  experience: Experience
}

export const TIERS: EquipmentTier[] = ["none", "home", "full-gym"]
export const GOALS: Goal[] = ["strength", "hypertrophy", "conditioning", "mobility"]
export const EXPERIENCES: Experience[] = ["novice", "intermediate", "advanced"]

export const TIER_EQUIPMENT: Record<EquipmentTier, Equipment[]> = {
  none: ["none"],
  home: ["none", "band", "dumbbell"],
  "full-gym": ["none", "barbell", "dumbbell", "kettlebell", "machine", "cable", "band"],
}

// ─── Deterministic RNG (same inputs → same plan + same name) ─────────────────

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rngInt = (rng: () => number, n: number) => Math.floor(rng() * n)

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ─── Themed program names ─────────────────────────────────────────────────────

const NAME_ADJECTIVES = [
  "FORGE", "IRON", "TITAN", "APEX", "OBSIDIAN", "GRANITE",
  "STORM", "EMBER", "VOID", "RUNE", "SOLAR", "PHANTOM",
]
const NAME_NOUNS = [
  "FRAME", "ORACLE", "ENGINE", "PROTOCOL", "CIRCUIT", "LATTICE",
  "MATRIX", "SIGIL", "VECTOR", "DOCTRINE", "BASTION", "CURRENT",
]

export function programName(input: ForgeInput): string {
  const h = hashString(`${input.equipment}|${input.goal}|${input.days}|${input.experience}`)
  const adj = NAME_ADJECTIVES[h % NAME_ADJECTIVES.length]
  const noun = NAME_NOUNS[Math.floor(h / NAME_ADJECTIVES.length) % NAME_NOUNS.length]
  return `${adj} ${noun}`
}

// ─── Periodized splits ────────────────────────────────────────────────────────

const LETTERS = ["A", "B", "C", "D", "E", "F"]

function splitFor(goal: Goal, days: number, experience: Experience): string[] {
  if (goal === "conditioning") {
    return ["Metabolic Circuit", "Engine Circuit", "Interval Circuit", "Tempo Circuit", "Hybrid Circuit", "Recovery Circuit"].slice(0, days)
  }
  if (goal === "mobility") {
    return ["Full-Body Flow", "Hips & Hams Flow", "Spine & Shoulders Flow", "Deep Stretch Flow", "Dynamic Flow", "Reset Flow"].slice(0, days)
  }
  if (goal === "strength") {
    // Novices grow best on full-body frequency — no split work yet
    if (experience === "novice") return LETTERS.slice(0, days).map((l) => `Full Body ${l}`)
    if (days === 2) return ["Full Body A", "Full Body B"]
    if (days === 3) return ["Push", "Pull", "Legs"]
    if (days === 4) return ["Push", "Pull", "Legs", "Full Body"]
    if (days === 5) return ["Push", "Pull", "Legs", "Upper", "Lower"]
    return ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body"]
  }
  // hypertrophy — bro-ish splits
  if (days === 2) return ["Upper", "Lower"]
  if (days === 3) return ["Push", "Pull", "Legs"]
  if (days === 4) return ["Upper", "Lower", "Push", "Pull"]
  if (days === 5) return ["Push", "Pull", "Legs", "Upper", "Lower"]
  return ["Chest", "Back", "Legs", "Shoulders", "Arms", "Full Body"]
}

const FOCUS_MUSCLES: Record<string, string[]> = {
  Push: ["CHEST", "SHOULDERS", "TRICEPS"],
  Pull: ["BACK", "BICEPS"],
  Legs: ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES"],
  Upper: ["CHEST", "BACK", "SHOULDERS", "TRICEPS", "BICEPS"],
  Lower: ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES"],
  "Full Body": ["CHEST", "BACK", "QUADS", "HAMSTRINGS", "GLUTES", "CORE"],
  Chest: ["CHEST"],
  Back: ["BACK"],
  Shoulders: ["SHOULDERS"],
  Arms: ["BICEPS", "TRICEPS"],
}

/** "Full Body A" → "Full Body" · "Metabolic Circuit" → "Circuit" · "... Flow" → "Flow". */
function focusKind(focus: string): string {
  if (focus.endsWith(" Circuit")) return "Circuit"
  if (focus.endsWith(" Flow")) return "Flow"
  const m = /^(.*) [A-F]$/.exec(focus)
  return m ? m[1] : focus
}

// ─── Slot templates (pattern-driven day assembly) ─────────────────────────────

type Role = "primary" | "secondary" | "accessory" | "finisher"

/** Slot pattern: a movement pattern, or any bodyweight-typed pick (circuits). */
type SlotPattern = Pattern | "any-bw"

interface Slot {
  role: Role
  /** Acceptable patterns, first-listed preferred. */
  patterns: SlotPattern[]
}

/** Working patterns banned per split focus — zero opposing-side movement. */
const FOCUS_BANS: Record<string, Pattern[]> = {
  Push: ["squat", "hinge", "lunge", "carry"],
  Upper: ["squat", "hinge", "lunge", "carry"],
  Chest: ["squat", "hinge", "lunge", "carry"],
  Shoulders: ["squat", "hinge", "lunge", "carry"],
  Arms: ["squat", "hinge", "lunge", "carry"],
  Pull: ["squat", "hinge", "lunge", "carry"],
  Back: ["squat", "hinge", "lunge", "carry"],
  Legs: ["push-h", "push-v", "pull-v"],
  Lower: ["push-h", "push-v", "pull-v"],
}

/** Same-side fallbacks when a pattern pool runs dry (never crosses the ban). */
const PATTERN_SUBSTITUTES: Partial<Record<Pattern, Pattern>> = {
  "push-h": "push-v",
  "push-v": "push-h",
  "pull-h": "pull-v",
  "pull-v": "pull-h",
  squat: "lunge",
  lunge: "squat",
  hinge: "core",
  calves: "core",
  carry: "core",
}

const TEMPLATE_FOR: Record<string, Slot[]> = {
  Push: [
    { role: "primary", patterns: ["push-h"] },
    { role: "secondary", patterns: ["push-v"] },
    { role: "accessory", patterns: ["push-h", "push-v"] },
    { role: "finisher", patterns: ["core"] },
  ],
  Pull: [
    { role: "primary", patterns: ["pull-h"] },
    { role: "secondary", patterns: ["pull-v"] },
    { role: "accessory", patterns: ["pull-h", "pull-v"] },
    { role: "finisher", patterns: ["core"] },
  ],
  Legs: [
    { role: "primary", patterns: ["squat"] },
    { role: "secondary", patterns: ["hinge"] },
    { role: "accessory", patterns: ["lunge"] },
    { role: "finisher", patterns: ["calves", "core"] },
  ],
  Upper: [
    { role: "primary", patterns: ["push-h"] },
    { role: "secondary", patterns: ["pull-h"] },
    { role: "accessory", patterns: ["push-v"] },
    { role: "accessory", patterns: ["pull-v"] },
  ],
  Lower: [
    { role: "primary", patterns: ["squat"] },
    { role: "secondary", patterns: ["hinge"] },
    { role: "accessory", patterns: ["lunge"] },
    { role: "finisher", patterns: ["calves"] },
  ],
  "Full Body": [
    { role: "primary", patterns: ["push-h"] },
    { role: "secondary", patterns: ["pull-h"] },
    { role: "secondary", patterns: ["squat"] },
    { role: "accessory", patterns: ["hinge"] },
  ],
  Chest: [
    { role: "primary", patterns: ["push-h"] },
    { role: "accessory", patterns: ["push-h"] },
    { role: "accessory", patterns: ["push-v"] },
    { role: "accessory", patterns: ["push-h"] },
  ],
  Back: [
    { role: "primary", patterns: ["pull-h"] },
    { role: "secondary", patterns: ["pull-v"] },
    { role: "accessory", patterns: ["pull-h"] },
    { role: "accessory", patterns: ["pull-v"] },
  ],
  Shoulders: [
    { role: "primary", patterns: ["push-v"] },
    { role: "accessory", patterns: ["push-v"] },
    { role: "accessory", patterns: ["push-h"] },
    { role: "accessory", patterns: ["push-v"] },
  ],
  // tricep bias comes from the Arms focus-muscle overlap tiebreak (TRICEPS first)
  Arms: [
    { role: "accessory", patterns: ["push-h"] },
    { role: "accessory", patterns: ["pull-h"] },
    { role: "accessory", patterns: ["push-v"] },
    { role: "accessory", patterns: ["pull-v"] },
  ],
  Circuit: [
    { role: "primary", patterns: ["cardio"] },
    { role: "secondary", patterns: ["any-bw"] },
    { role: "secondary", patterns: ["cardio"] },
    { role: "accessory", patterns: ["any-bw"] },
  ],
  Flow: [
    { role: "primary", patterns: ["mobility"] },
    { role: "secondary", patterns: ["mobility"] },
    { role: "accessory", patterns: ["mobility"] },
    { role: "accessory", patterns: ["mobility"] },
    { role: "finisher", patterns: ["mobility"] },
  ],
}

// ─── Prescription knobs ───────────────────────────────────────────────────────

const SETS_RANGE: Record<Experience, [number, number]> = {
  novice: [2, 3],
  intermediate: [3, 4],
  advanced: [4, 5],
}
const RPE_BY_EXP: Record<Experience, number> = { novice: 6, intermediate: 7, advanced: 8 }
const STRENGTH_REST: Record<Experience, number> = { novice: 120, intermediate: 150, advanced: 180 }

/** Steady cardio minutes — higher experience biases up the grid. */
const STEADY_MIN: Record<Experience, number[]> = {
  novice: [10, 10, 12, 15],
  intermediate: [10, 12, 15, 20],
  advanced: [12, 15, 20, 20],
}

/** Mobility + timed-hold second grids — clean values only, never 43s. */
const MOBILITY_HOLDS = [30, 40, 45, 60]

/** Starter loads per equipment class (upper / lower body), scaled by experience. */
const WEIGHT_BASE: Partial<Record<Equipment, { upper: number[]; lower: number[] }>> = {
  barbell: { upper: [25, 35, 45], lower: [40, 55, 70] },
  dumbbell: { upper: [8, 12, 16], lower: [12, 18, 24] },
  kettlebell: { upper: [10, 14, 18], lower: [14, 18, 24] },
  machine: { upper: [25, 40, 55], lower: [35, 50, 70] },
  cable: { upper: [15, 25, 35], lower: [20, 30, 45] },
}

const LOWER_MUSCLES = ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES"]

/** Leading words stripped when deriving a movement family ("Kettlebell farmer's carry" → "farmer's carry"). */
const FAMILY_STOPWORDS = new Set([
  "barbell", "dumbbell", "kettlebell", "machine", "cable", "band", "single-arm", "single-leg",
  "close-grip", "wide-grip", "seated", "standing", "incline", "decline", "trap-bar", "sumo",
  "front", "paused", "lying", "hanging", "wall", "assisted", "bodyweight", "weighted",
])

function familyOf(name: string): string {
  const words = name
    .toLowerCase()
    .split(" ")
    .filter((w) => w.length > 0)
  while (words.length > 1 && FAMILY_STOPWORDS.has(words[0])) words.shift()
  return words.join(" ")
}

const ALL_PATTERNS: Pattern[] = [
  "push-h", "push-v", "pull-h", "pull-v", "squat", "hinge",
  "lunge", "carry", "core", "calves", "cardio", "mobility",
]

// ─── Plan generator (pure, deterministic) ─────────────────────────────────────

export function generatePlan(input: ForgeInput): ProgramPlan {
  const { goal, days, experience } = input
  const seed = hashString(`${input.equipment}|${input.goal}|${input.days}|${input.experience}`)
  const expIndex = EXPERIENCES.indexOf(experience)
  const tier = TIER_EQUIPMENT[input.equipment]
  const tierExercises = EXERCISES.filter((e) => tier.includes(e.equipment))

  const totalBlocks = 5 + expIndex // 5 novice · 6 intermediate · 7 advanced
  const workingCount = totalBlocks - 2 // minus warmup + cooldown

  const focuses = splitFor(goal, days, experience)
  const planDays: PlanDay[] = []

  for (let d = 0; d < days; d++) {
    const focus = focuses[d]
    const kind = focusKind(focus)
    const rng = mulberry32(seed + (d + 1) * 7919)

    // Pattern pools, seeded-shuffled once per day — every pick below is a
    // stable sort over these arrays, so the rng stream stays reproducible.
    const pool = new Map<SlotPattern, Exercise[]>()
    for (const p of ALL_PATTERNS) pool.set(p, shuffled(tierExercises.filter((e) => e.pattern === p), rng))
    pool.set("any-bw", shuffled(tierExercises.filter((e) => e.type === "bodyweight"), rng))

    const usedNames = new Set<string>()
    const usedFamilies = new Set<string>()
    let cardioBlocks = 0

    const take = (e: Exercise) => {
      usedNames.add(e.name)
      usedFamilies.add(familyOf(e.name))
      if (e.type === "cardio") cardioBlocks++
    }

    // — warmup + cooldown (mobility, visually distinct rows) —
    const nextMobility = (): Exercise | undefined =>
      pool.get("mobility")!.find((e) => !usedNames.has(e.name) && !usedFamilies.has(familyOf(e.name)))
    const warmup = nextMobility()
    if (warmup) take(warmup)
    const cooldown = nextMobility()
    if (cooldown) take(cooldown)

    // — working slots: template trimmed from the START (primary first), then
    // day-agnostic extensions (core, cardio capped at one) — never off-focus
    const template = TEMPLATE_FOR[kind] ?? TEMPLATE_FOR["Full Body"]
    const slots: Slot[] = template.slice(0, workingCount)
    for (let appended = 0; slots.length < workingCount; appended++) {
      const useCardio = appended === 1 && cardioBlocks === 0
      slots.push({ role: "accessory", patterns: [useCardio ? "cardio" : "core"] })
    }

    const focusMuscles = FOCUS_MUSCLES[kind]
    const banned = FOCUS_BANS[kind] ?? []
    const targetDiff = expIndex + 1

    /** Primary-slot preference (R8-c): loaded strength movements outrank
        bodyweight skills when iron is in play — barbells/dumbbells/machines
        give measurable progressive overload, which makes them the better
        headline. Pools are tier-filtered up front, so every loaded candidate
        here is already tier-legal; on the "none" tier nobody is loaded and
        this layer is a no-op. Secondary/accessory/finisher slots keep the
        pure overlap/difficulty order. */
    const loadedFirst = (e: Exercise): 0 | 1 =>
      e.equipment !== "none" && e.type === "strength" ? 0 : 1

    /** Difficulty-matched first, focus-muscle overlap second; the seeded
        pre-shuffle is the stable-sort tiebreak. Primary slots additionally
        rank equipment-loaded strength picks above bodyweight picks. */
    const ranked = (cands: Exercise[], primary = false): Exercise[] => {
      if (cands.length < 2) return cands
      const byDiff = (e: Exercise) => Math.abs(e.difficulty - targetDiff)
      const byLoad = (e: Exercise) => (primary ? loadedFirst(e) : 1)
      if (!focusMuscles) return [...cands].sort((a, b) => byLoad(a) - byLoad(b) || byDiff(a) - byDiff(b))
      const byOverlap = (e: Exercise) => e.muscles.filter((m) => focusMuscles.includes(m)).length
      return [...cands].sort((a, b) => byLoad(a) - byLoad(b) || byDiff(a) - byDiff(b) || byOverlap(b) - byOverlap(a))
    }

    /** Fill one slot: slot patterns → same-side substitutes → core → cardio
        (capped at one). Strict pass keeps one block per movement family per
        day ("Push-ups" pairs with "Diamond push-up", never a second flat
        bench); the family-relaxed pass only exists so a day can never come
        up short. */
    const fillSlot = (slot: Slot): Exercise | null => {
      const ladder: SlotPattern[] = []
      const push = (p: SlotPattern) => {
        if (!ladder.includes(p)) ladder.push(p)
      }
      for (const p of slot.patterns) {
        push(p)
        const sub = PATTERN_SUBSTITUTES[p as Pattern]
        if (sub) push(sub)
      }
      push("core")
      if (cardioBlocks === 0) push("cardio")
      const usable = ladder.filter((p) => p === "any-bw" || !banned.includes(p as Pattern))

      for (const strict of [true, false]) {
        for (const p of usable) {
          const cands = (pool.get(p) ?? []).filter(
            (e) => !usedNames.has(e.name) && (!strict || !usedFamilies.has(familyOf(e.name)))
          )
          const pick = ranked(cands, slot.role === "primary")[0]
          if (pick) return pick
        }
      }
      return null
    }

    const working: Array<{ e: Exercise; role: Role }> = []
    for (const slot of slots) {
      const pick = fillSlot(slot)
      if (pick) {
        take(pick)
        working.push({ e: pick, role: slot.role })
      }
    }

    const blocks: PlanBlock[] = []
    if (warmup) blocks.push(prescribe(warmup, goal, experience, expIndex, rng, false, "accessory"))
    for (const w of working) blocks.push(prescribe(w.e, goal, experience, expIndex, rng, true, w.role))
    if (cooldown) blocks.push(prescribe(cooldown, goal, experience, expIndex, rng, false, "accessory"))

    // R17-B · superset pairing (Strong/Hevy parity) — hypertrophy programs pair
    // adjacent ACCESSORY blocks whose patterns are antagonistic (push↔pull) or
    // same-joint siblings (biceps↔triceps / quads↔hamstrings) into lettered
    // groups; members alternate with no rest between them, the group's last
    // member keeps its full recovery rest. Primary/secondary lifts and every
    // other goal keep standalone blocks — supersetting heavy compounds is bad
    // practice, so the pairing is deliberately gated to accessories.
    if (goal === "hypertrophy") {
      const patternOf = (e: Exercise | undefined) => e?.pattern ?? ""
      const pairable = (a: string, b: string) =>
        (a.startsWith("push") && b.startsWith("pull")) ||
        (a.startsWith("pull") && b.startsWith("push")) ||
        (a === "squat" && b === "hinge") ||
        (a === "hinge" && b === "squat")
      let group = 0
      for (let i = 0; i < working.length - 1; i++) {
        const a = working[i]
        const b = working[i + 1]
        if (a.role === "accessory" && b.role === "accessory" && pairable(patternOf(a.e), patternOf(b.e))) {
          const letter = String.fromCharCode(65 + group) // A, B, …
          const ai = blocks.findIndex((bl) => bl.name === a.e.name)
          const bi = blocks.findIndex((bl) => bl.name === b.e.name)
          if (ai >= 0 && bi > ai) {
            blocks[ai].superset = letter
            blocks[bi].superset = letter
            // the FIRST member's rest collapses to a transition beat (~15s);
            // the last member keeps its prescribed rest as group recovery
            blocks[ai].restSec = Math.min(blocks[ai].restSec, 15)
            group++
            i++ // consumed the pair
          }
        }
      }
    }

    planDays.push({ day: d + 1, focus, blocks })
  }

  return { days: planDays }
}

/** Turns a picked exercise into a prescribed block (sets/reps/rest/RPE/load). */
function prescribe(
  e: Exercise,
  goal: Goal,
  experience: Experience,
  expIndex: number,
  rng: () => number,
  working: boolean,
  role: Role
): PlanBlock {
  const cue = e.cue

  if (e.type === "mobility") {
    return {
      name: e.name,
      type: "mobility",
      sets: working && goal === "mobility" ? 2 + rngInt(rng, 2) : 1,
      reps: MOBILITY_HOLDS[rngInt(rng, MOBILITY_HOLDS.length)], // hold seconds
      restSec: 30,
      pattern: e.pattern,
      unit: "sec",
      cue,
    }
  }

  if (e.type === "cardio") {
    const intervals = rng() < 0.35
    return {
      name: e.name,
      type: "cardio",
      sets: intervals ? 4 + rngInt(rng, 3) : 1,
      durationMin: intervals ? 1 + rngInt(rng, 2) : STEADY_MIN[experience][rngInt(rng, 4)],
      restSec: 45,
      ...(working ? { rpe: RPE_BY_EXP[experience] } : {}),
      pattern: e.pattern,
      cue,
    }
  }

  // timed isometrics — `reps` carries hold seconds
  if (e.timed) {
    const lead = role === "primary" || role === "secondary"
    const holds = lead ? [30, 40, 45, 60] : [20, 25, 30]
    const rpe = !working
      ? undefined
      : role === "primary"
        ? RPE_BY_EXP[experience]
        : role === "finisher"
          ? 6
          : Math.max(5, RPE_BY_EXP[experience] - 1)
    return {
      name: e.name,
      type: e.type,
      sets: lead ? 2 + rngInt(rng, 3) : 2 + rngInt(rng, 2),
      reps: holds[rngInt(rng, holds.length)],
      restSec: 30 + rngInt(rng, 2) * 15,
      ...(rpe !== undefined ? { rpe } : {}),
      pattern: e.pattern,
      unit: "sec",
      cue,
    }
  }

  // strength / bodyweight blocks — role-scaled effort
  const [setsMin, setsMax] = SETS_RANGE[experience]
  const compound = e.pattern === "squat" || e.pattern === "hinge" || e.pattern === "push-h" || e.pattern === "pull-h"

  let sets: number
  let restSec: number
  if (role === "primary") {
    sets = experience === "advanced" ? 4 : 3
    restSec = goal === "strength" ? STRENGTH_REST[experience] : goal === "hypertrophy" ? 90 : goal === "conditioning" ? 60 : 30
  } else if (role === "secondary") {
    sets = experience === "novice" ? 2 : 3
    restSec = goal === "strength" ? 120 : goal === "hypertrophy" ? 75 : 45
  } else if (role === "finisher") {
    sets = 2 + rngInt(rng, 2)
    restSec = 45
  } else {
    sets = Math.min(3, setsMin + rngInt(rng, setsMax - setsMin + 1))
    restSec = compound && goal === "strength" ? 90 : 60
  }

  let reps: number
  if (goal === "strength") {
    reps = role === "primary" ? (e.type === "strength" ? 3 + rngInt(rng, 3) : 5 + rngInt(rng, 4)) : role === "secondary" ? 6 + rngInt(rng, 3) : 8 + rngInt(rng, 5)
  } else if (goal === "hypertrophy") {
    reps = role === "primary" ? 6 + rngInt(rng, 5) : role === "secondary" ? 8 + rngInt(rng, 5) : 10 + rngInt(rng, 6)
  } else {
    reps = 12 + rngInt(rng, 9) // conditioning circuit work
  }

  let weightKg: number | undefined
  if (e.type === "strength" && WEIGHT_BASE[e.equipment]) {
    const base = WEIGHT_BASE[e.equipment]!
    const lower = e.muscles.some((m) => LOWER_MUSCLES.includes(m))
    weightKg = (lower ? base.lower : base.upper)[expIndex]
  }

  const rpe = role === "primary" ? RPE_BY_EXP[experience] : role === "finisher" ? 6 : Math.max(5, RPE_BY_EXP[experience] - 1)

  return {
    name: e.name,
    type: e.type,
    sets,
    reps,
    ...(weightKg !== undefined ? { weightKg } : {}),
    restSec,
    ...(working ? { rpe } : {}),
    pattern: e.pattern,
    unit: "reps",
    cue,
  }
}

// ─── Integrity audit (QA) ─────────────────────────────────────────────────────

/** Human-readable integrity violations for a generated (or stored) plan.
    Empty array = clean: pattern-coherent, unit-correct, honestly periodized. */
export function planIntegrityIssues(plan: ProgramPlan, input: ForgeInput): string[] {
  const issues: string[] = []
  const expIndex = EXPERIENCES.indexOf(input.experience)
  const totalBlocks = 5 + expIndex

  if (plan.days.length !== input.days) {
    issues.push(`Day count ${plan.days.length} ≠ requested ${input.days}`)
  }

  for (const day of plan.days) {
    const kind = focusKind(day.focus)
    const label = `D${day.day} (${day.focus})`

    if (day.blocks.length !== totalBlocks) {
      issues.push(`${label}: ${day.blocks.length} blocks ≠ ${totalBlocks} (1 warmup + ${totalBlocks - 2} working + 1 cooldown)`)
    }

    for (const b of day.blocks) {
      // off-focus opposing-side pattern on split days (warmup/cooldown + Circuit/Flow exempt)
      const banned = FOCUS_BANS[kind]
      if (banned && b.type !== "mobility" && b.pattern && banned.includes(b.pattern as Pattern)) {
        issues.push(`${label}: off-focus ${b.pattern} block "${b.name}" on a ${kind} day`)
      }

      // timed-second blocks must be sane holds
      if (b.unit === "sec" && (b.reps === undefined || b.reps > 60 || b.reps % 5 !== 0)) {
        issues.push(`${label}: "${b.name}" prescribed ${b.reps ?? "no"}s — holds must be ≤60 and a multiple of 5`)
      }

      // cardio durations on the honest grids (sets>1 = interval block)
      if (b.type === "cardio" && b.durationMin !== undefined) {
        if (b.sets > 1) {
          if (![1, 2, 3].includes(b.durationMin)) issues.push(`${label}: interval "${b.name}" ${b.durationMin} min/block ∉ {1,2,3}`)
        } else if (![10, 12, 15, 20, 25].includes(b.durationMin)) {
          issues.push(`${label}: steady "${b.name}" ${b.durationMin} min ∉ {10,12,15,20,25}`)
        }
      }

      // mobility holds on the clean grid
      if (b.type === "mobility" && b.reps !== undefined && !MOBILITY_HOLDS.includes(b.reps)) {
        issues.push(`${label}: mobility "${b.name}" hold ${b.reps}s ∉ {30,40,45,60}`)
      }
    }

    // primary (first working block) must not be out-lifted by later blocks
    const rpes = day.blocks
      .filter((b) => b.type !== "mobility" && b.rpe !== undefined)
      .map((b) => b.rpe!)
    if (rpes.length >= 2 && rpes.some((r, i) => i > 0 && r > rpes[0])) {
      issues.push(`${label}: later block RPE exceeds the primary's (${rpes.join("/")})`)
    }
  }

  return issues
}
