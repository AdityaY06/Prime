// ─── ASCENDANT · Gate catalog (raid-able workout domains) ─────────────────────

import type { ExerciseType } from "./game"

export type ExerciseTemplate = {
  id: string
  name: string
  type: ExerciseType
  unit: "reps" | "time"
  defaultSets: number
  defaultReps: number
  defaultWeight: number
  defaultMinutes: number
}

export type GateDef = {
  id: string
  name: string
  epithet: string
  desc: string
  rank: string
  xpMultiplier: number
  accent: string // text color class
  aura: string // radial glow class
  frame: string // border class
  glyph: string // lucide icon name
  exercises: ExerciseTemplate[]
}

export const GATES: GateDef[] = [
  {
    id: "gale-fields",
    name: "Cardio",
    epithet: "Build your engine",
    desc: "Running, cycling, rope — sustained conditioning that builds agility.",
    rank: "E",
    xpMultiplier: 1.1,
    accent: "text-fuchsia-300",
    aura: "from-fuchsia-600/25",
    frame: "border-fuchsia-500/30",
    glyph: "Wind",
    exercises: [
      { id: "run", name: "Run (outdoor/treadmill)", type: "cardio", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 20 },
      { id: "cycling", name: "Cycling", type: "cardio", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 25 },
      { id: "rope", name: "Jump rope", type: "cardio", unit: "time", defaultSets: 3, defaultReps: 0, defaultWeight: 0, defaultMinutes: 3 },
      { id: "burpees", name: "Burpees", type: "cardio", unit: "reps", defaultSets: 4, defaultReps: 15, defaultWeight: 0, defaultMinutes: 0 },
      { id: "rowing", name: "Rowing machine", type: "cardio", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 15 },
      { id: "hiit", name: "HIIT circuit", type: "cardio", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 15 },
    ],
  },
  {
    id: "iron-forge",
    name: "Strength",
    epithet: "Load, lift, repeat",
    desc: "Barbell & dumbbell work that builds raw strength.",
    rank: "D",
    xpMultiplier: 1.25,
    accent: "text-amber-300",
    aura: "from-amber-600/25",
    frame: "border-amber-500/30",
    glyph: "Dumbbell",
    exercises: [
      { id: "bench", name: "Bench press", type: "strength", unit: "reps", defaultSets: 4, defaultReps: 8, defaultWeight: 40, defaultMinutes: 0 },
      { id: "squat-w", name: "Barbell squat", type: "strength", unit: "reps", defaultSets: 4, defaultReps: 8, defaultWeight: 50, defaultMinutes: 0 },
      { id: "deadlift", name: "Deadlift", type: "strength", unit: "reps", defaultSets: 4, defaultReps: 5, defaultWeight: 60, defaultMinutes: 0 },
      { id: "ohp", name: "Overhead press", type: "strength", unit: "reps", defaultSets: 3, defaultReps: 8, defaultWeight: 25, defaultMinutes: 0 },
      { id: "row-w", name: "Barbell row", type: "strength", unit: "reps", defaultSets: 3, defaultReps: 10, defaultWeight: 35, defaultMinutes: 0 },
      { id: "curl", name: "Bicep curl", type: "strength", unit: "reps", defaultSets: 3, defaultReps: 12, defaultWeight: 12, defaultMinutes: 0 },
      { id: "lat-pulldown", name: "Lat pulldown", type: "strength", unit: "reps", defaultSets: 3, defaultReps: 10, defaultWeight: 35, defaultMinutes: 0 },
    ],
  },
  {
    id: "titan-trial",
    name: "Calisthenics",
    epithet: "Master your own weight",
    desc: "Push-ups, pull-ups, pistols — bodyweight mastery.",
    rank: "D",
    xpMultiplier: 1.2,
    accent: "text-rose-300",
    aura: "from-rose-600/25",
    frame: "border-rose-500/30",
    glyph: "Swords",
    exercises: [
      { id: "pushup", name: "Push-ups", type: "bodyweight", unit: "reps", defaultSets: 4, defaultReps: 20, defaultWeight: 0, defaultMinutes: 0 },
      { id: "pullup", name: "Pull-ups", type: "bodyweight", unit: "reps", defaultSets: 4, defaultReps: 8, defaultWeight: 0, defaultMinutes: 0 },
      { id: "squat-bw", name: "Bodyweight squats", type: "bodyweight", unit: "reps", defaultSets: 4, defaultReps: 30, defaultWeight: 0, defaultMinutes: 0 },
      { id: "dip", name: "Dips", type: "bodyweight", unit: "reps", defaultSets: 3, defaultReps: 10, defaultWeight: 0, defaultMinutes: 0 },
      { id: "lunge", name: "Lunges", type: "bodyweight", unit: "reps", defaultSets: 3, defaultReps: 20, defaultWeight: 0, defaultMinutes: 0 },
      { id: "plank", name: "Plank hold", type: "bodyweight", unit: "time", defaultSets: 3, defaultReps: 0, defaultWeight: 0, defaultMinutes: 1 },
      { id: "pike", name: "Pike push-ups", type: "bodyweight", unit: "reps", defaultSets: 3, defaultReps: 12, defaultWeight: 0, defaultMinutes: 0 },
    ],
  },
  {
    id: "flow-sanctum",
    name: "Mobility",
    epithet: "Move freely, recover faster",
    desc: "Stretching, yoga, joint work — flexibility and recovery.",
    rank: "E",
    xpMultiplier: 1.0,
    accent: "text-teal-300",
    aura: "from-teal-600/25",
    frame: "border-teal-500/30",
    glyph: "Waves",
    exercises: [
      { id: "yoga", name: "Yoga flow", type: "mobility", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 20 },
      { id: "stretch", name: "Full-body stretch", type: "mobility", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 15 },
      { id: "hipopen", name: "Hip mobility", type: "mobility", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 10 },
      { id: "shoulder", name: "Shoulder circles & band work", type: "mobility", unit: "time", defaultSets: 1, defaultReps: 0, defaultWeight: 0, defaultMinutes: 8 },
    ],
  },
  {
    id: "colossus-gate",
    name: "Full Body",
    epithet: "Everything, all at once",
    desc: "Mix weighted, bodyweight and cardio in one session. High effort, high reward.",
    rank: "B",
    xpMultiplier: 1.6,
    accent: "text-violet-300",
    aura: "from-violet-600/25",
    frame: "border-violet-500/40",
    glyph: "Castle",
    exercises: [
      { id: "c-thrust", name: "Kettlebell thruster", type: "strength", unit: "reps", defaultSets: 4, defaultReps: 10, defaultWeight: 16, defaultMinutes: 0 },
      { id: "c-clean", name: "Kettlebell swing", type: "strength", unit: "reps", defaultSets: 4, defaultReps: 20, defaultWeight: 16, defaultMinutes: 0 },
      { id: "c-burpee", name: "Weighted burpees", type: "cardio", unit: "reps", defaultSets: 3, defaultReps: 12, defaultWeight: 0, defaultMinutes: 0 },
      { id: "c-pushup", name: "Push-up ladder", type: "bodyweight", unit: "reps", defaultSets: 3, defaultReps: 25, defaultWeight: 0, defaultMinutes: 0 },
      { id: "c-farmer", name: "Farmer's carry", type: "strength", unit: "time", defaultSets: 4, defaultReps: 0, defaultWeight: 24, defaultMinutes: 1 },
      { id: "c-run", name: "Interval sprint", type: "cardio", unit: "time", defaultSets: 5, defaultReps: 0, defaultWeight: 0, defaultMinutes: 1 },
    ],
  },
]

export function gateById(id: string): GateDef | undefined {
  return GATES.find((g) => g.id === id)
}

/** Compact axis labels for per-gate charts. */
export const GATE_SHORT: Record<string, string> = {
  "gale-fields": "CARD",
  "iron-forge": "STR",
  "titan-trial": "CALI",
  "flow-sanctum": "MOB",
  "colossus-gate": "FULL",
}
