// ASCEND — Evidence-Based Fitness OS · achievements module
// Pure derivation layer: every unlock is computed from the logged evidence
// (days / plan / profile / measurements) with zero extra persistence — the
// achievement list is simply a view over the same data the whole app runs on.
// Aggregation follows the app's canonical helpers (dayTotals per day, streakInfo,
// totalXP → levelInfo) so retroactive edits keep achievements consistent.
// Tiers: bronze → silver → gold → epic. No branding, no lore — just milestones.
// Achievement XP is a DISPLAY-ONLY bonus (TIER_XP below) — it is intentionally
// NOT wired into calc.totalXP / the global level system.

import type { DayLog, MacroPlan, Measurement, Profile, ProgramConfig } from './types';
import { HABITS } from './data/habits';
import { addDaysStr, dayScore, dayTotals, habitDone, lastNDays, levelInfo, streakInfo, todayStr, totalXP } from './calc';

/* ================= context & definitions ================= */

export interface AchievementCtx {
  days: Record<string, DayLog>;
  plan: MacroPlan;
  profile: Profile;
  measurements: Measurement[];
  /** saved training-program config (Train tab) — optional so pure checks stay runnable without the store */
  program?: ProgramConfig | null;
  /** number of user-defined foods (Fuel tab custom creator) */
  customFoodsCount?: number;
  /** count of days frozen for streak protection (Habits tab) */
  frozenDays?: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  /** one-line description — shown once unlocked */
  desc: string;
  /** how to unlock — shown while locked */
  hint: string;
  tier: 'bronze' | 'silver' | 'gold' | 'epic';
  /** lucide icon name — mapped to a component in the UI layer */
  icon: string;
  check: (ctx: AchievementCtx) => boolean;
}

/* ================= shared derivations ================= */

/** date-keyed day entries — every check stays a pure function of ctx. */
function dayEntries(ctx: AchievementCtx): [string, DayLog][] {
  return Object.entries(ctx.days);
}

/** total LoggedExercise entries across all days (entries, not sets). */
function loggedExerciseEntries(ctx: AchievementCtx): number {
  return dayEntries(ctx).reduce((n, [, d]) => n + d.exercises.length, 0);
}

/** cumulative strength volume in kg, via dayTotals per day. */
function strengthTonnageKg(ctx: AchievementCtx): number {
  return dayEntries(ctx).reduce((n, [, d]) => n + dayTotals(d).volumeKg, 0);
}

/** cumulative aerobic minutes, via dayTotals per day. */
function totalCardioMin(ctx: AchievementCtx): number {
  return dayEntries(ctx).reduce((n, [, d]) => n + dayTotals(d).cardioMin, 0);
}

/** number of distinct dates whose log satisfies `pred`. */
function daysWhere(ctx: AchievementCtx, pred: (d: DayLog) => boolean): number {
  return dayEntries(ctx).reduce((n, [, d]) => (pred(d) ? n + 1 : n), 0);
}

/** distinct exercise ids logged all-time. */
function distinctExercises(ctx: AchievementCtx): number {
  const ids = new Set<string>();
  for (const [, d] of dayEntries(ctx)) for (const e of d.exercises) ids.add(e.exerciseId);
  return ids.size;
}

/** any exercise id performed on two or more different dates — a progression baseline exists. */
function hasMultiDateExercise(ctx: AchievementCtx): boolean {
  const datesByExercise = new Map<string, Set<string>>();
  for (const [date, d] of dayEntries(ctx)) {
    for (const e of d.exercises) {
      const dates = datesByExercise.get(e.exerciseId) ?? new Set<string>();
      dates.add(date);
      datesByExercise.set(e.exerciseId, dates);
    }
  }
  for (const dates of datesByExercise.values()) if (dates.size >= 2) return true;
  return false;
}

/** WHO 2020 aerobic floor: ≥150 moderate minutes inside any rolling 7-day window (last 90 days). */
function cardioWindowMet(ctx: AchievementCtx): boolean {
  const recent = lastNDays(todayStr(), 90);
  const minutes = recent.map((date) => (ctx.days[date] ? dayTotals(ctx.days[date]).cardioMin : 0));
  for (let i = 0; i + 7 <= minutes.length; i++) {
    let sum = 0;
    for (let j = i; j < i + 7; j++) sum += minutes[j];
    if (sum >= 150) return true;
  }
  return false;
}

/** best single habit: distinct days on which it registers as done (auto-sync metrics included). */
function bestHabitDayCount(ctx: AchievementCtx): number {
  let best = 0;
  for (const h of HABITS) {
    const n = daysWhere(ctx, (d) => habitDone(h.id, d, ctx.plan));
    if (n > best) best = n;
  }
  return best;
}

/**
 * Best run of consecutive calendar dates whose dayScore clears `min`.
 * streakInfo's "active" bar is ≥40 — this measures *quality* streaks (≥50),
 * a strictly harder replication of the same evidence.
 */
function bestScoreRun(ctx: AchievementCtx, min: number): number {
  const keys = dayEntries(ctx).map(([k]) => k).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const k of keys) {
    if (dayScore(ctx.days[k], ctx.plan) >= min) {
      run = prev && addDaysStr(prev, 1) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    } else {
      run = 0;
      prev = '';
    }
  }
  return best;
}

/* ================= the 30 milestones ================= */

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-log',
    name: 'First Entry',
    desc: 'Logging has begun — measured behaviour is the substrate every result is built on.',
    hint: 'Log any food or training entry to open your record.',
    tier: 'bronze',
    icon: 'clipboard-list',
    check: (ctx) => dayEntries(ctx).some(([, d]) => d.foods.length > 0 || d.exercises.length > 0),
  },
  {
    id: 'first-workout',
    name: 'First Rep',
    desc: 'First session on record — the highest-return health decision there is (WHO 2020).',
    hint: 'Log any training session — strength, cardio or mobility.',
    tier: 'bronze',
    icon: 'dumbbell',
    check: (ctx) => dayEntries(ctx).some(([, d]) => d.exercises.length > 0),
  },
  {
    id: 'w5',
    name: 'Regular',
    desc: 'Five logged exercises — consistency compounds faster than intensity.',
    hint: 'Log 5 exercise entries in total.',
    tier: 'silver',
    icon: 'calendar-check',
    check: (ctx) => loggedExerciseEntries(ctx) >= 5,
  },
  {
    id: 'w25',
    name: 'Dedicated',
    desc: 'Twenty-five logged exercises — training each muscle ~2×/week adds up (Schoenfeld 2016).',
    hint: 'Log 25 exercise entries in total.',
    tier: 'gold',
    icon: 'calendar-days',
    check: (ctx) => loggedExerciseEntries(ctx) >= 25,
  },
  {
    id: 'w100',
    name: 'Centurion',
    desc: 'One hundred logged exercises — a full training block of recorded, auditable work.',
    hint: 'Log 100 exercise entries in total.',
    tier: 'epic',
    icon: 'award',
    check: (ctx) => loggedExerciseEntries(ctx) >= 100,
  },
  {
    id: 'tonnage-1t',
    name: 'Tonne Up',
    desc: 'A metric tonne of strength volume moved — load × reps, tallied.',
    hint: 'Move 1,000 kg of cumulative strength volume.',
    tier: 'bronze',
    icon: 'weight',
    check: (ctx) => strengthTonnageKg(ctx) >= 1000,
  },
  {
    id: 'tonnage-10t',
    name: 'Iron Mover',
    desc: 'Ten tonnes of cumulative volume — progressive overload with a paper trail.',
    hint: 'Move 10,000 kg of cumulative strength volume.',
    tier: 'silver',
    icon: 'boxes',
    check: (ctx) => strengthTonnageKg(ctx) >= 10000,
  },
  {
    id: 'tonnage-50t',
    name: 'Mountain Mover',
    desc: 'Fifty tonnes of cumulative volume — the long game, logged and beaten.',
    hint: 'Move 50,000 kg of cumulative strength volume.',
    tier: 'gold',
    icon: 'mountain',
    check: (ctx) => strengthTonnageKg(ctx) >= 50000,
  },
  {
    id: 'streak-7',
    name: 'Week Streak',
    desc: 'Seven consecutive active days — the first week is the hardest replication.',
    hint: 'Keep a 7-day streak of active days (day score ≥ 40).',
    tier: 'bronze',
    icon: 'flame',
    check: (ctx) => streakInfo(ctx.days, ctx.plan).current >= 7,
  },
  {
    id: 'streak-survive-7',
    name: 'Survivor',
    desc: 'Seven straight days at day score ≥ 50 — a full week of genuinely solid days, not merely logged ones.',
    hint: 'Keep a 7-day streak of quality days (day score ≥ 50).',
    tier: 'silver',
    icon: 'shield-check',
    check: (ctx) => bestScoreRun(ctx, 50) >= 7,
  },
  {
    id: 'streak-30',
    name: 'Month of Discipline',
    desc: 'A 30-day best streak — adherence is the strongest predictor of any training outcome.',
    hint: 'Reach a best streak of 30 active days.',
    tier: 'gold',
    icon: 'calendar-range',
    check: (ctx) => streakInfo(ctx.days, ctx.plan).best >= 30,
  },
  {
    id: 'streak-survive-30',
    name: 'Unbreakable',
    desc: 'Thirty consecutive quality days — one unbroken block of evidence-grade adherence.',
    hint: 'Keep a 30-day streak of quality days (day score ≥ 50).',
    tier: 'gold',
    icon: 'shield',
    check: (ctx) => bestScoreRun(ctx, 50) >= 30,
  },
  {
    id: 'protein-7',
    name: 'Protein Pro',
    desc: 'Seven days at ≥90% of target — the Morton 2018 dose (1.6–2.2 g/kg) secured.',
    hint: 'Hit ≥90% of your protein goal on 7 days.',
    tier: 'silver',
    icon: 'beef',
    check: (ctx) => daysWhere(ctx, (d) => dayTotals(d).protein >= ctx.plan.proteinG * 0.9) >= 7,
  },
  {
    id: 'protein-30',
    name: 'Protein Virtuoso',
    desc: 'Thirty days at ≥90% of protein target — muscle protein synthesis funded, daily.',
    hint: 'Hit ≥90% of your protein goal on 30 days.',
    tier: 'gold',
    icon: 'drumstick',
    check: (ctx) => daysWhere(ctx, (d) => dayTotals(d).protein >= ctx.plan.proteinG * 0.9) >= 30,
  },
  {
    id: 'hydration-7',
    name: 'Hydration Habit',
    desc: 'Seven days at goal hydration (~35 ml/kg — EFSA adequate-intake context).',
    hint: 'Reach ≥95% of your water goal on 7 days.',
    tier: 'bronze',
    icon: 'droplets',
    check: (ctx) => daysWhere(ctx, (d) => d.waterMl >= ctx.plan.waterMl * 0.95) >= 7,
  },
  {
    id: 'water-7',
    name: 'Hydration Hero',
    desc: 'Seven days at the full water goal — euhydration as a settled default, not a stretch.',
    hint: 'Reach 100% of your water goal on 7 days.',
    tier: 'silver',
    icon: 'waves',
    check: (ctx) => daysWhere(ctx, (d) => d.waterMl >= ctx.plan.waterMl) >= 7,
  },
  {
    id: 'sleep-7',
    name: 'Sleep Guardian',
    desc: 'Seven nights at your sleep goal — the strongest recovery lever you own (Hirshkowitz 2015).',
    hint: 'Sleep at least your plan goal (7.5 h) on 7 days.',
    tier: 'silver',
    icon: 'moon-star',
    check: (ctx) => daysWhere(ctx, (d) => d.sleepH >= ctx.plan.sleepGoalH) >= 7,
  },
  {
    id: 'cardio-who',
    name: 'WHO Compliant',
    desc: '150 aerobic minutes inside a 7-day window — the WHO 2020 activity floor cleared.',
    hint: 'Log 150 cardio minutes within any 7-day window.',
    tier: 'silver',
    icon: 'heartpulse',
    check: (ctx) => cardioWindowMet(ctx),
  },
  {
    id: 'cardio-100',
    name: 'Cardio Century',
    desc: 'One hundred aerobic minutes banked — every minute counts toward the weekly 150.',
    hint: 'Log 100 cardio minutes in total.',
    tier: 'silver',
    icon: 'timer',
    check: (ctx) => totalCardioMin(ctx) >= 100,
  },
  {
    id: 'cardio-500',
    name: 'Aerobic Engine',
    desc: 'Five hundred aerobic minutes logged — a real conditioning base, session by session.',
    hint: 'Log 500 cardio minutes in total.',
    tier: 'gold',
    icon: 'hourglass',
    check: (ctx) => totalCardioMin(ctx) >= 500,
  },
  {
    id: 'mobility-60',
    name: 'Limber',
    desc: 'An hour of mobility banked — regular stretching drives real range-of-motion gains (Behm 2016).',
    hint: 'Log 60 minutes of mobility work in total.',
    tier: 'bronze',
    icon: 'person-standing',
    check: (ctx) => dayEntries(ctx).reduce((n, [, d]) => n + dayTotals(d).mobilityMin, 0) >= 60,
  },
  {
    id: 'variety-20',
    name: 'Explorer',
    desc: 'Twenty distinct exercises logged — a varied movement diet, well covered.',
    hint: 'Log 20 different exercises.',
    tier: 'silver',
    icon: 'compass',
    check: (ctx) => distinctExercises(ctx) >= 20,
  },
  {
    id: 'pr-first',
    name: 'First PR',
    desc: 'Same lift, two dates — a baseline exists, and baselines exist to be beaten.',
    hint: 'Log the same exercise on two different days.',
    tier: 'bronze',
    icon: 'trending-up',
    check: (ctx) => hasMultiDateExercise(ctx),
  },
  {
    id: 'level-5',
    name: 'Adept',
    desc: 'Level 5 — XP earned exclusively from logged, verifiable behaviour.',
    hint: 'Earn XP from logged behaviour to reach level 5.',
    tier: 'silver',
    icon: 'star',
    check: (ctx) => levelInfo(totalXP(ctx.days, ctx.plan)).level >= 5,
  },
  {
    id: 'level-10',
    name: 'Elite',
    desc: 'Level 10 — a long, documented record of execution, not intention.',
    hint: 'Earn XP from logged behaviour to reach level 10.',
    tier: 'gold',
    icon: 'crown',
    check: (ctx) => levelInfo(totalXP(ctx.days, ctx.plan)).level >= 10,
  },
  {
    id: 'measure-up',
    name: 'Tape Authority',
    desc: 'Two tape measurements logged — circumferences catch what the scale hides.',
    hint: 'Save 2 circumference measurements on the Body tab.',
    tier: 'bronze',
    icon: 'ruler',
    check: (ctx) => ctx.measurements.length >= 2,
  },
  {
    id: 'measure-3',
    name: 'Tape Tracker',
    desc: 'Three tape measurements logged — a trend needs at least three points to exist.',
    hint: 'Save 3 circumference measurements on the Body tab.',
    tier: 'bronze',
    icon: 'pencil-ruler',
    check: (ctx) => ctx.measurements.length >= 3,
  },
  {
    id: 'program-architect',
    name: 'Program Architect',
    desc: 'A training program exists — planned progression beats improvised training, every time.',
    hint: 'Generate a training program on the Train tab.',
    tier: 'bronze',
    icon: 'drafting-compass',
    check: (ctx) => (ctx.program ?? null) != null,
  },
  {
    id: 'menu-smith',
    name: 'Menu Smith',
    desc: 'Three custom foods forged — your real diet, searchable inside the log.',
    hint: 'Create 3 custom foods on the Fuel tab.',
    tier: 'bronze',
    icon: 'chef-hat',
    check: (ctx) => (ctx.customFoodsCount ?? 0) >= 3,
  },
  {
    id: 'habit-master',
    name: 'Automaticity',
    desc: 'One habit done on 66 distinct days — 66 days to automaticity, Lally 2010.',
    hint: 'Complete any single habit on 66 days.',
    tier: 'epic',
    icon: 'brain',
    check: (ctx) => bestHabitDayCount(ctx) >= 66,
  },
];

/* ================= evaluation, XP & styling ================= */

/** Every def whose check passes for the given context, in definition order. */
export function unlockedAchievements(ctx: AchievementCtx): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => a.check(ctx));
}

/** Bonus XP per unlock by tier — DISPLAY-ONLY, tracked separately from the global XP/level system. */
export const TIER_XP: Record<AchievementDef['tier'], number> = {
  bronze: 25,
  silver: 50,
  gold: 100,
  epic: 250,
};

/**
 * Sum of bonus XP for a set of unlocked achievements (or a context, which is
 * evaluated first). Deliberately NOT wired into calc.totalXP — the header chip
 * renders it as a separate, clearly-labelled bonus.
 */
export function achievementXp(input: AchievementDef[] | AchievementCtx): number {
  const defs = Array.isArray(input) ? input : unlockedAchievements(input);
  return defs.reduce((sum, a) => sum + TIER_XP[a.tier], 0);
}

/** Tailwind tokens per tier — kept in the UI layer, away from the pure defs. */
export function achievementTierStyles(): Record<AchievementDef['tier'], { ring: string; text: string; label: string }> {
  return {
    bronze: { ring: 'border-amber-700/70 bg-amber-950/40', text: 'text-amber-600', label: 'Bronze' },
    silver: { ring: 'border-zinc-400/50 bg-zinc-800/70', text: 'text-zinc-400', label: 'Silver' },
    gold: { ring: 'border-amber-400/70 bg-amber-500/10', text: 'text-amber-400', label: 'Gold' },
    epic: { ring: 'border-fuchsia-500/70 bg-fuchsia-950/40', text: 'text-fuchsia-400', label: 'Epic' },
  };
}
