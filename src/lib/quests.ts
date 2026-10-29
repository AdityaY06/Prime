// ─── ASCENDANT · Quest (directive) templates ─────────────────────────────────

export type QuestMetric =
  | "sessions" // completed raids (daily = today only)
  | "pushups" // push-up reps (name contains "push")
  | "squats" // squat reps (name contains "squat")
  | "cardio" // cardio minutes
  | "mobility" // mobility minutes
  | "volume" // kg volume (daily = today)
  | "level"
  | "streak"
  | "total_minutes"
  | "hydrate" // manual check
  | "sleep" // manual check
  | "ascensions" // completed Ascension Protocol cycles
  | "boss_kills" // lifetime weekly-boss kills

export type QuestTemplate = {
  code: string
  title: string
  description: string
  metric: QuestMetric
  target: number
  xpReward: number
  statReward?: { stat: "str" | "vit" | "endur" | "agi" | "flex"; amount: number }
  pointReward?: number
  dailyPool?: boolean // can be rolled for dailies
}

// ─── Daily directive pool ─────────────────────────────────────────────────────

export const DAILY_POOL: QuestTemplate[] = [
  {
    code: "daily-raid",
    title: "Session Goal",
    description: "Complete any workout session today. Motion is the mission.",
    metric: "sessions",
    target: 1,
    xpReward: 60,
    dailyPool: true,
  },
  {
    code: "daily-pushups",
    title: "Push-Up Goal",
    description: "Perform 60 total push-ups across the day.",
    metric: "pushups",
    target: 60,
    xpReward: 45,
    statReward: { stat: "str", amount: 1 },
    dailyPool: true,
  },
  {
    code: "daily-squats",
    title: "Squat Goal",
    description: "Perform 80 total squats across the day.",
    metric: "squats",
    target: 80,
    xpReward: 45,
    statReward: { stat: "vit", amount: 1 },
    dailyPool: true,
  },
  {
    code: "daily-cardio",
    title: "Cardio Goal",
    description: "Log 15 minutes of cardio in any session.",
    metric: "cardio",
    target: 15,
    xpReward: 40,
    statReward: { stat: "agi", amount: 1 },
    dailyPool: true,
  },
  {
    code: "daily-mobility",
    title: "Mobility Goal",
    description: "Log 10 minutes of mobility work.",
    metric: "mobility",
    target: 10,
    xpReward: 30,
    statReward: { stat: "flex", amount: 1 },
    dailyPool: true,
  },
  {
    code: "daily-volume",
    title: "Volume Goal",
    description: "Move 2,000 kg of total volume through weighted work.",
    metric: "volume",
    target: 2000,
    xpReward: 50,
    statReward: { stat: "str", amount: 1 },
    dailyPool: true,
  },
  {
    code: "daily-hydrate",
    title: "Hydration Goal",
    description: "Log at least 3 L of water in the Fuel tab today. Auto-verified.",
    metric: "hydrate",
    target: 1,
    xpReward: 20,
    statReward: { stat: "vit", amount: 1 },
    dailyPool: true,
  },
  {
    code: "daily-sleep",
    title: "Sleep Goal",
    description: "Sleep 7+ hours and log it under Body → Metrics. Auto-verified.",
    metric: "sleep",
    target: 1,
    xpReward: 25,
    statReward: { stat: "vit", amount: 1 },
    dailyPool: true,
  },
]

// ─── Main directive milestones ────────────────────────────────────────────────

export const MAIN_QUESTS: QuestTemplate[] = [
  {
    code: "main-first-raid",
    title: "First Session",
    description: "Complete your very first workout session.",
    metric: "sessions",
    target: 1,
    xpReward: 100,
    pointReward: 1,
  },
  {
    code: "main-raids-10",
    title: "Ten Sessions",
    description: "Complete 10 workout sessions.",
    metric: "sessions",
    target: 10,
    xpReward: 300,
    pointReward: 2,
  },
  {
    code: "main-raids-25",
    title: "Twenty-Five Sessions",
    description: "Complete 25 workout sessions.",
    metric: "sessions",
    target: 25,
    xpReward: 600,
    pointReward: 3,
  },
  {
    code: "main-raids-50",
    title: "Fifty Sessions",
    description: "Complete 50 workout sessions.",
    metric: "sessions",
    target: 50,
    xpReward: 1200,
    pointReward: 5,
  },
  {
    code: "main-level-5",
    title: "E-Rank Reached",
    description: "Reach Level 5.",
    metric: "level",
    target: 5,
    xpReward: 200,
    pointReward: 1,
  },
  {
    code: "main-level-10",
    title: "D-Rank Reached",
    description: "Reach Level 10.",
    metric: "level",
    target: 10,
    xpReward: 500,
    pointReward: 3,
  },
  {
    code: "main-level-20",
    title: "C-Rank Reached",
    description: "Reach Level 20.",
    metric: "level",
    target: 20,
    xpReward: 1000,
    pointReward: 4,
  },
  {
    code: "main-level-40",
    title: "A-Rank Reached",
    description: "Reach Level 40.",
    metric: "level",
    target: 40,
    xpReward: 2500,
    pointReward: 6,
  },
  {
    code: "main-streak-3",
    title: "3-Day Streak",
    description: "Keep a 3-day activity streak.",
    metric: "streak",
    target: 3,
    xpReward: 150,
  },
  {
    code: "main-streak-7",
    title: "7-Day Streak",
    description: "Keep a 7-day activity streak.",
    metric: "streak",
    target: 7,
    xpReward: 400,
    pointReward: 2,
  },
  {
    code: "main-streak-30",
    title: "30-Day Streak",
    description: "Keep a 30-day activity streak.",
    metric: "streak",
    target: 30,
    xpReward: 1500,
    pointReward: 5,
  },
  {
    code: "main-volume-10k",
    title: "10 Tonnes Lifted",
    description: "Move 10,000 kg of lifetime volume.",
    metric: "volume",
    target: 10000,
    xpReward: 500,
    pointReward: 2,
  },
  {
    code: "main-volume-100k",
    title: "100 Tonnes Lifted",
    description: "Move 100,000 kg of lifetime volume.",
    metric: "volume",
    target: 100000,
    xpReward: 2000,
    pointReward: 4,
  },
  {
    code: "main-cardio-300",
    title: "Cardio Collector",
    description: "Accumulate 300 total cardio minutes.",
    metric: "cardio",
    target: 300,
    xpReward: 600,
    pointReward: 2,
  },
  {
    code: "main-pushups-1000",
    title: "Thousand Push-Ups",
    description: "Perform 1,000 lifetime push-ups.",
    metric: "pushups",
    target: 1000,
    xpReward: 800,
    pointReward: 3,
  },

  // ── Boss hunt milestones ──────────────────────────────────────────────
  {
    code: "main-boss-1",
    title: "First Weekly Challenge",
    description: "Complete your first weekly challenge — one session in its training type dealing its full target in XP.",
    metric: "boss_kills",
    target: 1,
    xpReward: 400,
    pointReward: 2,
  },
  {
    code: "main-boss-3",
    title: "Challenge Regular",
    description: "Complete 3 weekly challenges. A new one arrives every Monday.",
    metric: "boss_kills",
    target: 3,
    xpReward: 900,
    pointReward: 3,
  },
  {
    code: "main-boss-10",
    title: "Challenge Veteran",
    description: "Complete 10 weekly challenges. Consistency compounds.",
    metric: "boss_kills",
    target: 10,
    xpReward: 2500,
    pointReward: 5,
  },

  // ── Ascension milestones ─────────────────────────────────────────────
  {
    code: "main-ascend-1",
    title: "First New Cycle",
    description: "Complete one New Cycle reset — start fresh with a permanent XP multiplier.",
    metric: "ascensions",
    target: 1,
    xpReward: 1500,
    pointReward: 5,
  },
  {
    code: "main-ascend-3",
    title: "Cycle Collector",
    description: "Complete 3 New Cycle resets. Every ending, a beginning.",
    metric: "ascensions",
    target: 3,
    xpReward: 4000,
    pointReward: 8,
  },
]

/** Deterministic daily roll: always includes the raid directive + 3 rolled from the pool. */
export function rollDailies(day: string): QuestTemplate[] {
  const seed = [...day].reduce((a, c) => a + c.charCodeAt(0) * 7, 0)
  const raid = DAILY_POOL.find((q) => q.code === "daily-raid")!
  const pool = DAILY_POOL.filter((q) => q.code !== "daily-raid")
  const picked: QuestTemplate[] = []
  let s = seed
  while (picked.length < 3 && pool.length > 0) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const idx = s % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return [raid, ...picked]
}

// ─── PR-calibrated directive targets ─────────────────────────────────────────

export type CalibrationSpec = {
  /** fraction of the reference value that becomes the target */
  ratio: number
  /** clamps so targets stay humane for new hunters and absurd veterans */
  min: number
  max: number
  kind: "pr-reps" | "pr-minutes" | "avg-volume"
  /** PR name substring to match (pr kinds only) */
  match: string
  /** PR exercise type to match (pr kinds only) */
  prType?: string
}

/**
 * Directives whose targets are calibrated to the hunter's own records at roll
 * time. A directive with no matching record falls back to its template target.
 */
export const CALIBRATED_DAILIES: Record<string, CalibrationSpec> = {
  "daily-pushups": { ratio: 0.6, min: 20, max: 250, kind: "pr-reps", match: "push", prType: "bodyweight" },
  "daily-squats": { ratio: 0.6, min: 30, max: 350, kind: "pr-reps", match: "squat", prType: "bodyweight" },
  "daily-cardio": { ratio: 0.75, min: 10, max: 45, kind: "pr-minutes", match: "", prType: "cardio" },
  "daily-volume": { ratio: 1.0, min: 800, max: 6000, kind: "avg-volume", match: "" },
}
