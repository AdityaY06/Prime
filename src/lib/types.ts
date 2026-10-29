// ─── ASCENDANT · Shared API DTOs ──────────────────────────────────────────────

import type { StatKey } from "./game"
import type { ProgressionEntryDTO, Suggestion } from "./progression"

export type HunterStats = Record<StatKey, number>

export type HunterDTO = {
  id: string
  name: string
  archetype: string
  equippedTitle: string | null
  level: number
  xp: number
  xpNeeded: number
  totalXp: number
  rank: string
  nextRank: string | null
  nextRankAt: number | null
  statPoints: number
  stats: HunterStats
  streak: number
  bestStreak: number
  totalSessions: number
  totalVolumeKg: number
  totalMinutes: number
  totalCardio: number
  essence: number
  power: number
  ascension: number
  xpMultiplier: number
  /** R68 — birth year off the hunter profile (null = unknown). Additive
   *  plumb (audit 2-a B2): lets client HR-zone chips derive HRmax from age
   *  (sensor-hub's hrMaxFromBirthYear) instead of the hardcoded 190 default. */
  birthYear: number | null
  /** R38 — IANA zone the hunter's day boundary rolls at (null = server UTC). */
  timezone: string | null
  /** R52-2 — standings arenas: declared state/region (null = undeclared). */
  region: string | null
  /** R52-2 — standings arenas: declared country (null = undeclared). */
  country: string | null
  createdAt: string
}

export type QuestDTO = {
  id: string
  kind: "daily" | "main"
  code: string
  title: string
  description: string
  metric: string
  target: number
  progress: number
  xpReward: number
  statReward: { stat: StatKey; amount: number } | null
  pointReward: number
  claimed: boolean
  completed: boolean
  failed: boolean
  day: string | null
}

export type ExerciseLogDTO = {
  id: string
  name: string
  type: string
  sets: number
  reps: number
  weightKg: number
  durationMin: number
  xpValue: number
  rir: number | null
  /** R32-a — Borg CR10 effort rating of the logged set (1–10 integer;
   *  null = not captured, incl. every pre-R32-a legacy row). Optional so
   *  older wire shapes still parse (engine.sessionDTO always sends it). */
  rpe?: number | null
  notes?: string | null // R17-D — set notes (optional: older wire shapes may omit)
}

export type SessionDTO = {
  id: string
  gateId: string
  gateName: string
  status: "active" | "cleared" | "abandoned"
  startedAt: string
  endedAt: string | null
  xpEarned: number
  durationMin: number
  volumeKg: number
  logs: ExerciseLogDTO[]
}

export type RewardResult = {
  xpGained: number
  levelUps: number
  newLevel: number
  rankUp: boolean
  newRank: string | null
  statPointsGained: number
  unlockedTitles: string[]
  hunter: HunterDTO
  essenceGained?: number
  newRecords?: PrInfo[]
  streakShielded?: boolean
  /** Set when this raid slew the weekly boss. */
  bossDefeated?: {
    code: string
    name: string
    damage: number
    hp: number
    xpReward: number
    essenceReward: number
    /** Enrage tier of the slain boss (null at STANDARD). */
    enrageLabel?: string | null
  }
  /** Set when this reward is an Ascension Protocol completion. */
  ascended?: {
    count: number
    xpMultiplier: number
    essenceGained: number
  }
}

export type PrInfo = {
  name: string
  displayName: string
  value: number
  unit: string
  previous: number
  bonusXp: number
}

export type HistoryDTO = {
  daily: { day: string; xp: number }[]
  recentSessions: {
    id: string
    gateName: string
    gateId: string
    status: string
    startedAt: string
    xpEarned: number
    durationMin: number
    volumeKg: number
    logCount: number
  }[]
  totalVolumeKg: number
  totalMinutes: number
  totalSessions: number
}

export type ChronicleWindow = {
  xp: number
  sessions: number
  volumeKg: number
  minutes: number
  prs: number
}

export type ChronicleGateSlice = {
  gateId: string
  gateName: string
  short: string
  xp: number
  sessions: number
}

/** One day of the current cycle — day-by-day compliance drill-down row. */
export type ChronicleDayRow = {
  /** yyyy-mm-dd */
  day: string
  xp: number
  sessions: number
  volumeKg: number
  minutes: number
  prs: number
  /** GATE_SHORT codes of the sessions cleared that day (e.g. ["CALI","STR"]). */
  gateShorts: string[]
}

export type ChronicleDTO = {
  thisWeek: ChronicleWindow
  prevWeek: ChronicleWindow
  daily: { day: string; xp: number; sessions: number }[]
  bestDay: { day: string; xp: number } | null
  activeDays: number
  /** XP + raid counts per gate for the current cycle (radar source). */
  perGate: ChronicleGateSlice[]
  /** One row per day of the CURRENT cycle (7 rows, oldest→newest). */
  perDay: ChronicleDayRow[]
  /** The same 7 weekdays one cycle back — weekday compare source. */
  prevDaily: { day: string; xp: number; sessions: number }[]
  /** Cleared sessions grouped by local day key — day drill-through source.
   *  Optional so pre-R5-b payloads still parse. */
  sessionsByDay?: Record<string, ChronicleDaySession[]>
}

/** One cleared raid of the chronicle window, grouped under its local day. */
export type ChronicleDaySession = {
  id: string
  gateName: string
  xpEarned: number
  volumeKg: number
  durationMin: number
  prCount: number
  /** ISO timestamp of session start. */
  startedAt: string
}

/** The Oracle's deterministic next-session prescription for one lift. */
export type AttackPlanDTO = {
  /** Normalized PB key the plan was devised for. */
  name: string
  displayName: string
  type: string
  unit: string
  /** The current record echoed back (value + the day it was set). */
  best: { value: number; day: string }
  verdict: Suggestion
  /** Headline next-session target — always starts with the numeral. */
  targetLine: string
  /** Prescribed working top set (weight × reps / sets × reps). */
  topSet: string
  /** 3-5 ordered session steps (ramp → top set → back-off). */
  scheme: string[]
  /** True when the last 3+ sessions show no primary-metric improvement. */
  stallRisk: boolean
  /** 2-4 tactical strings (spacing, rest, focus cue — type-aware). */
  notes: string[]
  /** 2-5 evidence lines grounding the prescription in training science
   *  (R6-b: proximity-to-failure, frequency, volume, deload, stretch-position).
   *  Optional so pre-R6-b payloads still parse. */
  science?: string[]
  /** Per-session rows the plan was computed from (~10-week window). */
  sessionsAnalyzed: number
}

/** Lifetime daily-XP calendar window (Records tab heatmap). */
export type HeatmapDTO = {
  /** yyyy-mm-dd of the window's first Monday. */
  firstDay: string
  today: string
  /** Zero-filled daily XP totals, firstDay..today inclusive. */
  days: { day: string; xp: number }[]
  bestDay: { day: string; xp: number } | null
  activeDays: number
  totalDays: number
  windowXp: number
  /** Consecutive active days ending today (grace to yesterday). */
  streakDays: number
}

export type RestDayDTO = {
  available: boolean
  usedDay: string | null
  weekStart: string
  claimedToday: boolean
  eligible: boolean
  reason: "OK" | "ALREADY_USED_THIS_WEEK" | "TRAINED_TODAY" | "NO_CHAIN" | "ALREADY_CLAIMED_TODAY"
}

export type PersonalBestDTO = {
  id: string
  name: string
  displayName: string
  type: string
  bestValue: number
  unit: string
  context: { sets: number; reps: number; weightKg: number; durationMin: number } | null
  achievedAt: string
  updatedAt: string
}

export type RelicView = {
  code: string
  name: string
  epithet: string
  desc: string
  effect: string
  kind: "passive" | "charged" | "instant"
  cost: number
  maxCharges: number
  glyph: string
  accent: string
  border: string
  glow: string
  lore: string
  owned: boolean
  charges: number
  canAcquire: boolean
}

export type ForgeDTO = {
  essence: number
  relics: RelicView[]
  nextTierHint?: string
}

// ── R34-a · Effort ledger DTOs — the additive RPE fields of GET /api/progression ──
// The raid console has captured a Borg CR10 rating on every working set
// since R32-a (ExerciseLog.rpe); these types carry its read-back so the
// friction of an RPE tap every set pays insight dividends in RECORDS.

/** One point of a per-session RPE series — the mean Borg CR10 rating of one
 *  session's rated logs (1–10, one decimal). */
export type EffortPointDTO = {
  /** yyyy-mm-dd of the session's start. */
  day: string
  /** Mean RPE of that session's rated logs. */
  avgRpe: number
  /** How many of the session's logs carried a rating (avgRpe's denominator). */
  ratedSets: number
}

/** The global effort block of GET /api/progression — the hunter's effort
 *  temperature: per-session average RPE across ALL rated logs in the 90-day
 *  window (any exercise), day-ascending. */
export type EffortViewDTO = {
  series: EffortPointDTO[]
  /** Set-level mean of every rated log in the window (null = nothing rated —
   *  every pre-R32-a legacy row). */
  windowAvg: number | null
}

/** R34-a — per-exercise effort extras layered onto every progression entry
 *  (additive: pre-R34-a consumers simply ignore the unknown fields). */
export type ProgressionEntryEffortDTO = {
  /** Mean RPE of the entry's rated logs (null = none rated). */
  avgRpe: number | null
  /** Count of the entry's logs carrying an RPE rating. */
  ratedCount: number
  /** Per-session mean RPE, day-ascending, RATED sessions only — the mini
   *  effort trend source (mirrors `trend`'s per-session discipline). */
  rpeTrend: EffortPointDTO[]
}

/** R34-a — the GET /api/progression response shape (effort fields additive;
 *  `effort` stays optional so pre-R34-a payloads still parse). */
export type ProgressionResDTO = {
  entries: (ProgressionEntryDTO & ProgressionEntryEffortDTO)[]
  effort?: EffortViewDTO
}

// ─── R46 · Insights family (GET /api/insights) ────────────────────────────────
// The type layer for /api/insights was lost in the R36 platform rollback: the
// route + five consumers kept importing names that no longer existed, so every
// insights-bound surface ran type-blind (import type is erased at runtime —
// the API itself never broke). These definitions are reconstructed verbatim
// from the route's construction sites (the runtime-authoritative shapes).

/** Metric band ("Athletic 6–13" etc) — body-fat + strength-standard zones. */
export type InsightZone = {
  label: string
  min: number
  max: number
}

/** Karvonen / %HRmax heart-rate training zone row. */
export type HrZone = {
  id: string
  label: string
  low: number
  high: number
  desc: string
}

/** US-Navy tape body composition + goal trajectory. */
export type BodyCompInsight = {
  available: boolean
  missing: string[]
  sex: "male" | "female"
  heightCm: number
  bodyFatPct: number | null
  category: string | null
  zones: InsightZone[]
  leanMassKg: number | null
  fatMassKg: number | null
  weightKg: number | null
  idealRange: [number, number]
  series: { day: string; bodyFatPct: number }[]
  goalPct: number | null
  goalZoneLabel: string | null
  deltaToGoal: number | null
  fatTrendPctPerWeek: number | null
  goalReached: boolean
  celebrate: boolean
}

/** RHR → ratings, VO2max estimate, HR training zones. */
export type HeartInsight = {
  restingHr: number | null
  restingHrSeries: { day: string; value: number }[]
  restingHrRating: string | null
  hrMax: number
  vo2max: number | null
  vo2maxRating: string | null
  zones: HrZone[]
  method: string
}

/** One lift's strength-standard row (Symmetric-Strength-inspired scale). */
export type StrengthLift = {
  key: string
  label: string
  kind: "barbell" | "bodyweight"
  matched: boolean
  exerciseName: string | null
  displayValue: string | null
  e1rm: number | null
  ratio: number | null
  levelIndex: number
  levelLabel: string
  progressPct: number
  standards: { label: string; value: number }[]
}

export type StrengthInsight = {
  bodyweightKg: number
  isDefaultBw: boolean
  sex: "male" | "female"
  lifts: StrengthLift[]
  matchedCount: number
  overallScore: number | null
  overallLevel: string | null
}

/** Weekly push/pull + upper/lower set-volume balance. */
export type BalanceInsight = {
  pushSets: number
  pullSets: number
  lowerSets: number
  coreSets: number
  pushPullRatio: number | null
  pushPullStatus: "unknown" | "balanced" | "push-heavy" | "pull-heavy"
  pushPullHint: string
  upperLowerRatio: number | null
  upperLowerStatus: "unknown" | "balanced" | "upper-heavy" | "lower-heavy"
  upperLowerHint: string
}

/** Energy balance (intake vs TDEE) + weight trend. */
export type EnergyInsight = {
  tdee: number
  targetCalories: number
  goal: string
  avg7Intake: number | null
  logged7Days: number
  weeklyBalance: number | null
  targetWeeklyBalance: number
  status: "unknown" | "on-target" | "below-target" | "above-target"
  weightTrendKgPerWeek: number | null
  series: { day: string; intake: number | null; target: number }[]
}

export type SleepInsight = {
  avg7: number | null
  logged7Days: number
  target: number
  debtHours: number | null
  consistencyLabel: string | null
  rating: string | null
  series: { day: string; value: number }[]
}

export type ProteinInsight = {
  targetG: number
  gPerKg: number
  todayG: number
  todayPct: number
  avg7G: number | null
  status: "on-target" | "under" | "unknown"
}

export type HydrationInsight = {
  todayMl: number
  targetMl: number
  pct: number
  avg7Ml: number | null
  logged7Days: number
  daysOnTarget7: number
  status: "on-target" | "under" | "unknown"
}

/** Per-lift e1RM / best-reps trajectory + PR ledger. */
export type LiftProgression = {
  key: string
  label: string
  exerciseName: string | null
  kind: "barbell" | "bodyweight"
  unit: "kg" | "reps"
  points: { day: string; value: number }[]
  prHistory: { day: string; value: number; sets: number; reps: number; weightKg: number; isPr: boolean }[]
  first: number | null
  best: number | null
  latest: number | null
  deltaPct: number | null
  sessionsToBest: number | null
}

/** Daily activity vitals — steps / heart points / move minutes. */
export type ActivityVitals = {
  steps: { today: number; target: number; avg7: number | null; series: { day: string; value: number }[] }
  heartPoints: { today: number; target: number; weekTotal: number; series: { day: string; value: number }[] }
  moveMinutes: { today: number; target: number; series: { day: string; value: number }[] }
}

/** Training-load deload detector (ACWR + fatigue signals). */
export type DeloadInsight = {
  weeklyVolume: { weekStart: string; volumeKg: number; sessions: number }[]
  lastWeekVolumeKg: number | null
  avg4WeekVolumeKg: number | null
  spikeRatio: number | null
  fatiguedMuscles: number
  sleepDebtHours: number | null
  verdict: "insufficient-data" | "deload-advised" | "caution" | "sustainable"
  hint: string
}

/** GET /api/insights response — every analytics surface's data spine. */
export type InsightsDTO = {
  profile: {
    heightCm: number
    weightKg: number
    age: number
    sex: "male" | "female"
    goal: string
    isDefault: boolean
  }
  bodyComp: BodyCompInsight
  heart: HeartInsight
  strength: StrengthInsight
  balance: BalanceInsight
  energy: EnergyInsight
  sleep: SleepInsight
  protein: ProteinInsight
  hydration: HydrationInsight
  liftProgression: LiftProgression[]
  vitals: ActivityVitals
  deload: DeloadInsight
}

// ─── Destinations (GET /api/destinations → STATUS destination-index badges) ──

/** R55 — the destination index's honest live-badge feed. One lean GET that
 *  answers "what does each surface know RIGHT NOW" for the seven destination
 *  rows on STATUS: latest body-mass reading + active targets, today's fuel
 *  totals, today's readiness composite, and the records ledger. Every field
 *  is honestly null/0-shaped — a surface that has never been fed renders NO
 *  badge, never a placeholder number. */
export type DestinationsDTO = {
  body: {
    /** Latest logged weight (kg, 1-dp) — null when the atlas has no reading. */
    latestMassKg: number | null
    /** yyyy-mm-dd of that reading (for staleness display). */
    latestMassDay: string | null
    /** Active MetricGoal rows (weight/chest/… — one per metric). */
    activeTargets: number
  }
  fuel: {
    /** Any food logged today (hunter timezone). */
    loggedToday: boolean
    todayKcal: number | null
    todayProteinG: number | null
    /** Net water today (ml — may be 0). */
    waterMl: number
  }
  vitals: {
    /** Any readiness-feeding vital logged today. */
    checkedInToday: boolean
    /** Same pipeline as /api/readiness — null when no component available. */
    readiness: { score: number; band: string } | null
  }
  records: {
    prCount: number
    sessionsThisWeek: number
  }
}

// ─── CSV import family (lib/csv.ts → /api/import) ────────────────────────────

export type ImportFormat = "myfitnesspal" | "google-takeout" | "ascendant" | "unknown"

/** One normalized import row (food / water / metric target). */
export type ImportRow = {
  day: string
  target: "food" | "water" | "metric"
  metricType: string | null
  name: string
  qty: number | null
  unit: string | null
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export type ImportSummary = {
  format: ImportFormat
  formatLabel: string
  totalRows: number
  validRows: number
  skippedRows: number
  preview: ImportRow[]
  inserted: { foodLogs: number; waterLogs: number; metrics: number } | null
  daysTouched: number | null
}
