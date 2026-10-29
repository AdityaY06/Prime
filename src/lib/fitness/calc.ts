import type { ActivityLevel, DayLog, MacroPlan, MuscleId, Profile, Sex } from './types';
import { HABITS } from './data/habits';
import {
  brzycki1RM as brzycki1RMCore,
  consensus1RM as consensus1RMCore,
  epley1RMRound,
  validE1rmSet,
} from '../strength-science';

/* ================= dates ================= */

export function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function todayStr(): string {
  return dateStr(new Date());
}
export function addDaysStr(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
export function prettyDate(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
export function isToday(s: string): boolean {
  return s === todayStr();
}
export function lastNDays(endDate: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDaysStr(endDate, -i));
  return out;
}

/* ================= energy formulas ================= */

/**
 * Mifflin-St Jeor resting energy equation.
 * Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO.
 * "A new predictive equation for resting energy expenditure in healthy individuals."
 * Am J Clin Nutr. 1990;51(2):241-7. Validated on 498 subjects — most accurate
 * general-population BMR equation (Frankenfield et al. 2005).
 */
export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161));
}

export const ACTIVITY_LEVELS: { id: ActivityLevel; label: string; factor: number; note: string }[] = [
  { id: 'sedentary', label: 'Sedentary', factor: 1.2, note: 'Desk job, little movement' },
  { id: 'light', label: 'Lightly active', factor: 1.375, note: '1–3 training sessions / week' },
  { id: 'moderate', label: 'Moderately active', factor: 1.55, note: '3–5 training sessions / week' },
  { id: 'active', label: 'Very active', factor: 1.725, note: '6–7 training sessions / week' },
  { id: 'athlete', label: 'Athlete', factor: 1.9, note: 'Twice daily / physical job' },
];

export function activityFactor(level: ActivityLevel): number {
  return ACTIVITY_LEVELS.find((a) => a.id === level)?.factor ?? 1.55;
}

export function bmi(weightKg: number, heightCm: number): number {
  return +(weightKg / Math.pow(heightCm / 100, 2)).toFixed(1);
}
export function bmiCategory(v: number): { label: string; tone: 'low' | 'ok' | 'high' | 'vhigh' } {
  if (v < 18.5) return { label: 'Underweight', tone: 'low' };
  if (v < 25) return { label: 'Healthy range', tone: 'ok' };
  if (v < 30) return { label: 'Overweight', tone: 'high' };
  return { label: 'Obese', tone: 'vhigh' };
}

/** ~7,700 kcal per kg of body mass — Hall et al. 2011, Lancet (dynamic energy balance model). */
export const KCAL_PER_KG = 7700;

export function computePlan(p: Profile): MacroPlan {
  const bmr = mifflinStJeor(p.sex, p.weightKg, p.heightCm, p.age);
  const tdee = Math.round(bmr * activityFactor(p.activity));
  const rate = p.goalRateKg;
  let calories: number;
  if (p.goal === 'lose') calories = tdee - rate * (KCAL_PER_KG / 7);
  else if (p.goal === 'gain') calories = tdee + rate * (KCAL_PER_KG / 7) * 0.7; // conservative lean-gain surplus
  else calories = tdee;
  const floor = p.sex === 'male' ? 1500 : 1200;
  calories = Math.max(floor, Math.round(calories / 10) * 10);

  // protein: 1.6 g/kg breakpoint (Morton et al. 2018, BJSM meta-analysis, n=1,863);
  // 2.2 g/kg upper context; lean dieters higher end (Helms et al. 2014, JISSN).
  const proteinPerKg = p.goal === 'lose' ? 2.2 : p.goal === 'recomp' ? 2.0 : 1.8;
  const proteinG = Math.round((p.weightKg * proteinPerKg) / 5) * 5;
  // fat: ≥ 0.8 g/kg floor and ≥ 20% of energy (AMDR 20–35%)
  const fatG = Math.max(Math.round(p.weightKg * 0.8), Math.round((calories * 0.2) / 9));
  const carbsG = Math.max(50, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  const waterMl = Math.round((p.weightKg * 35) / 50) * 50; // ~35 ml/kg (EFSA adequate intake context)
  const fibreGoalG = Math.round((calories / 1000) * 14); // 14 g per 1,000 kcal (IOM AI)

  return {
    bmr,
    tdee,
    calories,
    proteinG,
    carbsG,
    fatG,
    waterMl,
    stepGoal: 8000,
    sleepGoalH: 7.5,
    fibreGoalG,
    formulas: {
      bmr: 'Mifflin-St Jeor · Am J Clin Nutr 1990 (validated, Frankenfield 2005)',
      tdee: `BMR × ${activityFactor(p.activity)} activity factor (position-stand multipliers)`,
      calories:
        p.goal === 'lose'
          ? `TDEE − ${Math.round(rate * (KCAL_PER_KG / 7))} kcal (−${rate} kg/wk @ 7,700 kcal/kg · Hall 2011, Lancet)`
          : p.goal === 'gain'
            ? `TDEE + ${Math.round(rate * (KCAL_PER_KG / 7) * 0.7)} kcal (lean-gain surplus)`
            : 'TDEE (maintenance)',
      protein: `${proteinPerKg} g/kg · Morton et al. 2018 BJSM meta (n=1,863)`,
      fat: '≥0.8 g/kg floor · 20–35% AMDR',
      water: '~35 ml/kg body mass · EFSA adequate intake context',
      steps: '≈8,000 — mortality plateau ≈7–10k steps (Paluch 2022, Lancet Public Health)',
      sleep: '7–9 h — National Sleep Foundation (Hirshkowitz 2015)',
      fibre: '14 g / 1,000 kcal — IOM AI; risk ↓15–30% (Reynolds 2019, Lancet)',
    },
  };
}

/* ================= training math ================= */

// R69-a — the three 1RM estimators delegate to lib/strength-science.ts (the
// single source of truth for every 1RM in PRIME; citations live there).
// Sanctioned honesty upgrade riding the consolidation: all three now return
// `number | null` — null outside the validated 1-12 integer-rep domain at a
// positive load (Epley/Brzycki accuracy decays sharply past a dozen reps —
// LeSure et al. 1997, JSCR; a 20-rep set "estimates" ~1.67× the load: an
// inflated number, not a max), and the old `r <= 1 → round(w)` quirk is dead
// (r=0 used to fabricate the load itself as a "max"; reps must be ≥ 1).
// Inside the domain every value is byte-identical to the legacy formulas,
// integer rounding convention included.

/** Epley 1985: 1RM ≈ w × (1 + reps/30). Integer-rounded; null outside the 1-12 rep domain. */
export function epley1RM(w: number, r: number): number | null {
  if (!Number.isInteger(r) || !validE1rmSet(r, w)) return null;
  return epley1RMRound(w, r);
}
/** Brzycki 1993: 1RM ≈ w × 36 / (37 − reps). Integer-rounded; null outside the 1-12 rep domain. */
export function brzycki1RM(w: number, r: number): number | null {
  return brzycki1RMCore(w, r);
}
/** Mean of the two best-validated formulas (Epley + Brzycki); r=1 returns the load itself. Null outside the shared domain. */
export function estimate1RM(w: number, r: number): number | null {
  return consensus1RMCore(w, r);
}

export const PERCENT_1RM: { pct: number; reps: string; adapts: string }[] = [
  { pct: 95, reps: '1–3', adapts: 'Peak strength' },
  { pct: 90, reps: '3–5', adapts: 'Strength' },
  { pct: 85, reps: '5–7', adapts: 'Strength + size' },
  { pct: 75, reps: '8–10', adapts: 'Hypertrophy' },
  { pct: 70, reps: '10–12', adapts: 'Hypertrophy' },
  { pct: 65, reps: '12–15', adapts: 'Size + endurance' },
  { pct: 60, reps: '15+', adapts: 'Metabolic / endurance' },
];

/** ACSM metabolic equation: kcal = MET × 3.5 × kg / 200 × min (METs from Ainsworth 2011 Compendium). */
export function metKcal(met: number, minutes: number, weightKg: number): number {
  return Math.round(((met * 3.5 * weightKg) / 200) * minutes);
}

export function volumeOf(sets: { weight: number; reps: number }[]): number {
  return sets.reduce((s, x) => s + x.weight * x.reps, 0);
}

/* ================= day aggregation ================= */

export interface DayTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  burned: number;
  strengthSets: number;
  cardioMin: number;
  mobilityMin: number;
  volumeKg: number;
}

export function emptyDay(): DayLog {
  return { foods: [], exercises: [], waterMl: 0, steps: 0, sleepH: 0, habits: {} };
}

export function dayTotals(day: DayLog): DayTotals {
  const t: DayTotals = {
    kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0,
    burned: 0, strengthSets: 0, cardioMin: 0, mobilityMin: 0, volumeKg: 0,
  };
  for (const f of day.foods) {
    t.kcal += f.kcal; t.protein += f.protein; t.carbs += f.carbs; t.fat += f.fat; t.fibre += f.fibre;
  }
  for (const e of day.exercises) {
    t.burned += e.kcal;
    t.volumeKg += e.volumeKg;
    if (e.type === 'strength') t.strengthSets += e.sets.length;
    if (e.type === 'cardio') t.cardioMin += e.minutes;
    if (e.type === 'mobility') t.mobilityMin += e.minutes;
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  t.protein = r(t.protein); t.carbs = r(t.carbs); t.fat = r(t.fat); t.fibre = r(t.fibre);
  return t;
}

/** Direct weekly sets per muscle over the 7 days ending on `endDate` (primary full, secondary half). */
export function muscleSets(days: Record<string, DayLog>, endDate: string): Record<MuscleId, number> {
  const out = {} as Record<MuscleId, number>;
  for (const d of lastNDays(endDate, 7)) {
    const day = days[d];
    if (!day) continue;
    for (const ex of day.exercises) {
      if (ex.type !== 'strength') continue;
      const n = ex.sets.length;
      if (n === 0) continue;
      ex.muscles.forEach((m, i) => (out[m] = (out[m] ?? 0) + n * (i === 0 ? 1 : 0.7)));
      for (const m of ex.secondary) out[m] = (out[m] ?? 0) + n * 0.5;
    }
  }
  return out;
}

/* ================= gamification ================= */

export const LEVEL_TITLES = ['Initiate', 'Apprentice', 'Adept', 'Expert', 'Elite', 'Master', 'Grandmaster', 'Legend'];

export interface LevelInfo {
  level: number;
  title: string;
  into: number;
  need: number;
  pct: number;
}
export function levelInfo(xp: number): LevelInfo {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
  const cur = 60 * Math.pow(level - 1, 2);
  const next = 60 * Math.pow(level, 2);
  const into = xp - cur;
  const need = next - cur;
  return {
    level,
    title: LEVEL_TITLES[Math.min(LEVEL_TITLES.length - 1, Math.floor((level - 1) / 5))],
    into,
    need,
    pct: Math.max(0, Math.min(1, into / need)),
  };
}

export function habitValue(habitId: string, day: DayLog, plan: MacroPlan): number | boolean {
  const h = HABITS.find((x) => x.id === habitId);
  if (!h) return false;
  if (h.linked === 'steps') return day.steps;
  if (h.linked === 'sleep') return day.sleepH;
  if (h.linked === 'water') return day.waterMl;
  if (h.linked === 'fibre') return dayTotals(day).fibre;
  if (h.linked === 'protein') return dayTotals(day).protein;
  if (h.linked === 'training') return day.exercises.length > 0;
  return day.habits[habitId] ?? (h.kind === 'toggle' ? false : 0);
}

export function habitDone(habitId: string, day: DayLog, plan: MacroPlan): boolean {
  const h = HABITS.find((x) => x.id === habitId);
  if (!h) return false;
  const v = habitValue(habitId, day, plan);
  if (typeof v === 'boolean') return v;
  return v >= (h.target ?? 1);
}

export function habitProgress(habitId: string, day: DayLog, plan: MacroPlan): number {
  const h = HABITS.find((x) => x.id === habitId);
  if (!h) return 0;
  const v = habitValue(habitId, day, plan);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return Math.min(1, v / (h.target ?? 1));
}

/** XP earned in a given day — fully derived from logged behaviour (retroactive edits stay consistent). */
export function xpFromDay(day: DayLog, plan: MacroPlan): number {
  let xp = 0;
  xp += Math.min(12, day.foods.length * 3);
  const t = dayTotals(day);
  if (day.exercises.length > 0) xp += 12 + Math.min(28, t.strengthSets * 1.5 + t.cardioMin * 0.8 + t.mobilityMin);
  xp += HABITS.filter((h) => habitDone(h.id, day, plan)).length * 8;
  if (day.waterMl >= plan.waterMl * 0.95) xp += 10;
  if (day.steps >= plan.stepGoal) xp += 10;
  if (day.sleepH >= 7) xp += 8;
  if (t.protein >= plan.proteinG * 0.9) xp += 12;
  if (t.kcal > 0 && Math.abs(t.kcal - plan.calories) <= 150) xp += 12;
  if (day.weightKg) xp += 6;
  return Math.round(xp);
}

export function totalXP(days: Record<string, DayLog>, plan: MacroPlan): number {
  let xp = 0;
  for (const k of Object.keys(days)) xp += xpFromDay(days[k], plan);
  return xp;
}

/* ---------- daily quests ---------- */

export interface Quest {
  id: string;
  label: string;
  detail: string;
  xp: number;
  progress: number;
  target: number;
  done: boolean;
}

export function questsFor(day: DayLog, plan: MacroPlan): Quest[] {
  const t = dayTotals(day);
  const habitsDone = HABITS.filter((h) => habitDone(h.id, day, plan)).length;
  return [
    {
      id: 'q-kcal',
      label: 'Hit your calorie target',
      detail: `${plan.calories} kcal ± 150`,
      xp: 12,
      progress: Math.min(t.kcal, plan.calories * 1.5),
      target: plan.calories,
      done: t.kcal > 0 && Math.abs(t.kcal - plan.calories) <= 150,
    },
    {
      id: 'q-protein',
      label: 'Reach your protein target',
      detail: `${plan.proteinG} g`,
      xp: 12,
      progress: t.protein,
      target: plan.proteinG,
      done: t.protein >= plan.proteinG * 0.9,
    },
    {
      id: 'q-train',
      label: 'Log a training session',
      detail: 'strength · cardio · mobility',
      xp: 20,
      progress: day.exercises.length > 0 ? 1 : 0,
      target: 1,
      done: day.exercises.length > 0,
    },
    {
      id: 'q-water',
      label: 'Hydration goal',
      detail: `${(plan.waterMl / 1000).toFixed(1)} L`,
      xp: 10,
      progress: day.waterMl,
      target: plan.waterMl,
      done: day.waterMl >= plan.waterMl * 0.95,
    },
    {
      id: 'q-sleep',
      label: 'Sleep 7+ hours',
      detail: 'log your sleep',
      xp: 8,
      progress: day.sleepH,
      target: 7,
      done: day.sleepH >= 7,
    },
    {
      id: 'q-habits',
      label: 'Complete 3 habits',
      detail: 'research-backed habits',
      xp: 10,
      progress: habitsDone,
      target: 3,
      done: habitsDone >= 3,
    },
  ];
}

/** 0–100 quality score used for streaks & heatmaps. */
export function dayScore(day: DayLog, plan: MacroPlan): number {
  if (!day) return 0;
  const t = dayTotals(day);
  let s = 0;
  if (t.kcal > 0) {
    s += 20;
    const dev = Math.abs(t.kcal - plan.calories) / plan.calories;
    s += Math.round(Math.max(0, 1 - dev * 3) * 20); // ±33%+ → 0
    s += Math.round(Math.min(1, t.protein / plan.proteinG) * 10);
  }
  if (day.exercises.length > 0) s += 20;
  s += Math.round((HABITS.filter((h) => habitDone(h.id, day, plan)).length / HABITS.length) * 15);
  if (day.waterMl >= plan.waterMl * 0.8) s += 5;
  if (day.steps >= plan.stepGoal * 0.5) s += 5;
  if (day.sleepH >= 6.5) s += 5;
  return s;
}

/**
 * Day-level streak with streak-freeze support (feature ⑤).
 * A frozen day (`DayLog.frozen === true`) is a user-declared skip day:
 * while walking backwards it is SKIPPED — it neither breaks nor extends
 * the streak. Rationale: Lally et al. 2010 (Eur J Soc Psychol, n=96) found
 * missing one opportunity "costs almost nothing" for habit formation —
 * the freeze keeps the chain alive without rewarding the miss.
 * Signature unchanged (called from page.tsx / Dashboard / ProgressView).
 */
export function streakInfo(days: Record<string, DayLog>, plan: MacroPlan): { current: number; best: number } {
  const active = (d: string) => (days[d] ? dayScore(days[d], plan) >= 40 : false);
  const frozen = (d: string) => days[d]?.frozen === true;
  let current = 0;
  let cursor = todayStr();
  // today still in progress: an incomplete today neither breaks nor counts
  // (a frozen today is likewise skipped below without breaking the chain)
  if (!active(cursor) && !frozen(cursor)) cursor = addDaysStr(cursor, -1);
  while (active(cursor) || frozen(cursor)) {
    if (active(cursor)) current++; // frozen days bridge the gap but are not counted
    cursor = addDaysStr(cursor, -1);
  }
  // best run over all logged days; frozen days simply do not count as breaks
  // while computing contiguous runs (they keep `prev` alive across the gap)
  const keys = Object.keys(days).sort();
  let best = 0;
  let run = 0;
  let prev = ''; // last day that kept the chain alive (active OR frozen)
  for (const k of keys) {
    if (active(k)) {
      run = prev && addDaysStr(prev, 1) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    } else if (frozen(k)) {
      // skip day: bridge only when contiguous with the current run
      if (prev && addDaysStr(prev, 1) === k) prev = k;
      else {
        run = 0;
        prev = '';
      }
    } else {
      run = 0;
      prev = '';
    }
  }
  return { current, best: Math.max(best, current) };
}

/**
 * Per-habit streak with the same freeze semantics (feature ⑤):
 * a frozen day is skipped while walking backwards — it neither breaks
 * nor extends the habit streak. Signature unchanged.
 */
export function habitStreak(days: Record<string, DayLog>, habitId: string, plan: MacroPlan): number {
  let n = 0;
  let cursor = todayStr();
  const done = (d: string) => !!days[d] && habitDone(habitId, days[d], plan);
  const frozen = (d: string) => days[d]?.frozen === true;
  // today still in progress (or frozen): move on without breaking
  if (!done(cursor) && !frozen(cursor)) cursor = addDaysStr(cursor, -1);
  while (done(cursor) || frozen(cursor)) {
    if (done(cursor)) n++; // frozen days bridge the gap but are not counted
    cursor = addDaysStr(cursor, -1);
  }
  return n;
}

/** Five-axis attribute radar, all derived from logged behaviour. */
export function attributeRadar(days: Record<string, DayLog>, plan: MacroPlan): { label: string; value: number }[] {
  const week = lastNDays(todayStr(), 7).map((d) => days[d] ?? emptyDay());
  const strengthSets = week.reduce((s, d) => s + dayTotals(d).strengthSets, 0);
  const cardioMin = week.reduce((s, d) => s + dayTotals(d).cardioMin, 0);
  const mobilityMin = week.reduce((s, d) => s + dayTotals(d).mobilityMin, 0);
  const { current } = streakInfo(days, plan);
  const adherence = week.reduce((s, d) => {
    const t = dayTotals(d);
    if (t.kcal <= 0) return s;
    const dev = Math.abs(t.kcal - plan.calories) / plan.calories;
    const protein = Math.min(1, t.protein / plan.proteinG);
    return s + Math.max(0, 1 - dev * 2.5) * 0.7 + protein * 0.3;
  }, 0);
  const scored = week.filter((d) => dayTotals(d).kcal > 0).length || 1;
  return [
    { label: 'Strength', value: Math.min(100, Math.round((strengthSets / 60) * 100)) },
    { label: 'Conditioning', value: Math.min(100, Math.round((cardioMin / 150) * 100)) }, // WHO 150 min/wk
    { label: 'Nutrition', value: Math.min(100, Math.round((adherence / scored) * 100)) },
    { label: 'Consistency', value: Math.min(100, Math.round((current / 21) * 100)) },
    { label: 'Mobility', value: Math.min(100, Math.round((mobilityMin / 60) * 100)) },
  ];
}
