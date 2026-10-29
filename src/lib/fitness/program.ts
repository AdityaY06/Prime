// ASCEND — Program generator & progressive-overload coach
// Every rule cites its source:
//  · Frequency 2–3×/wk per muscle > 1× at equal volume — Schoenfeld, Ogborn & Krieger 2016, Sports Med 46(11):1689-97
//  · 10–20 sets/muscle/wk hypertrophy dose–response — Schoenfeld, Ogborn & Krieger 2017, J Sports Sci Med 16(4):527-36
//  · MEV/MAV/MRV landmark synthesis — Israetel & Hoffmann, Renaissance Periodization 2019
//  · Long rests (2–3 min) beat 1 min on compounds — Schoenfeld et al. 2016, J Strength Cond Res 30(10):2905-12
//  · Loading 60–80% 1RM (6–12 reps) maximises hypertrophy — Schoenfeld et al. 2013/2021; ACSM 2009 position stand
//  · Double progression (reps to top of range → +load) — standard evidence-based practice (RP, Nippard)
//  · ~48 h between sessions hitting the same muscle — recovery of MPS to baseline (Damas et al. 2016)

import { EXERCISES } from './data/exercises';
import { MUSCLES } from './data/muscles';
import { addDaysStr, dayTotals, lastNDays, todayStr } from './calc';
import type {
  DayLog, Equipment, Exercise, MuscleId, Pattern, Profile, ProgramConfig, SplitId,
} from './types';

/* ================= split catalogue ================= */

export interface SplitMeta {
  id: SplitId;
  name: string;
  days: number[];
  tagline: string;
  science: string;
}

export const SPLITS: SplitMeta[] = [
  {
    id: 'full-body',
    name: 'Full Body',
    days: [2, 3],
    tagline: 'Every muscle every session — the frequency-first classic',
    science: 'Schoenfeld 2016 (Sports Med meta, n=7 trials): training a muscle 2–3×/week grows more than 1×/week at equal weekly volume.',
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    days: [4],
    tagline: 'Two upper + two lower days — the balanced workhorse',
    science: 'Each muscle 2×/week with 72 h recovery between repeats — matches both the frequency meta (Schoenfeld 2016) and MPS recovery data (Damas et al. 2016).',
  },
  {
    id: 'upper-lower-ppl',
    name: 'UL + PPL Hybrid',
    days: [5],
    tagline: 'Upper, Lower, Push, Pull, Legs — volume with recovery',
    science: 'Moderate volume landmark sweet-spot (Israetel & Hoffmann 2019): MEV→MAV for every muscle while no muscle repeats within 48 h.',
  },
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    days: [6],
    tagline: 'The high-frequency six-day split',
    science: 'Each muscle 2×/week, high per-session specialisation — volume lands at MAV (Maximum Adaptive Volume) per Israetel & Hoffmann 2019.',
  },
];

export function splitFor(daysPerWeek: number): SplitId {
  switch (daysPerWeek) {
    case 2:
    case 3:
      return 'full-body';
    case 4:
      return 'upper-lower';
    case 5:
      return 'upper-lower-ppl';
    default:
      return 'ppl';
  }
}

/** Suggested weekday layout — spaces same-muscle repeats ≥ 48 h apart. */
export const WEEK_LAYOUT: Record<number, string[]> = {
  2: ['Mon', 'Thu'],
  3: ['Mon', 'Wed', 'Fri'],
  4: ['Mon', 'Tue', 'Thu', 'Fri'],
  5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
  6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/* ================= slot templates ================= */

interface SlotSpec {
  role: string;
  /** acceptable PRIMARY muscles for the slot */
  muscles: MuscleId[];
  patterns?: Pattern[];
  compound: boolean;
  /** base direct sets for an intermediate — scaled by experience */
  sets: number;
  reps: [number, number];
  rest: number;
}

interface SessionTemplate {
  label: string;
  focus: string;
  slots: SlotSpec[];
}

const COMPOUND_REPS: [number, number] = [6, 10];
const STRENGTH_REPS: [number, number] = [4, 6];
const ISO_REPS: [number, number] = [10, 14];
const LUNGE_REPS: [number, number] = [8, 12];
const CORE_REPS: [number, number] = [10, 15];
const CALF_REPS: [number, number] = [10, 15];

const FULL_A: SessionTemplate = {
  label: 'Full Body A',
  focus: 'Squat · Press · Pull',
  slots: [
    { role: 'Primary squat', muscles: ['quads'], patterns: ['squat'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Horizontal press', muscles: ['chest'], patterns: ['push'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Vertical pull', muscles: ['lats'], patterns: ['pull'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Hinge', muscles: ['hamstrings', 'glutes'], patterns: ['hinge'], compound: true, sets: 3, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Delt raise / press', muscles: ['shoulders'], compound: false, sets: 3, reps: ISO_REPS, rest: 75 },
    { role: 'Core', muscles: ['abs', 'obliques'], compound: false, sets: 3, reps: CORE_REPS, rest: 60 },
  ],
};

const FULL_B: SessionTemplate = {
  label: 'Full Body B',
  focus: 'Hinge · Incline · Row',
  slots: [
    { role: 'Primary hinge', muscles: ['hamstrings', 'glutes'], patterns: ['hinge'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Incline press', muscles: ['chest'], patterns: ['push'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Horizontal row', muscles: ['lats', 'traps'], patterns: ['pull'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Lunge / split squat', muscles: ['quads', 'glutes'], patterns: ['lunge'], compound: true, sets: 3, reps: LUNGE_REPS, rest: 120 },
    { role: 'Biceps', muscles: ['biceps'], compound: false, sets: 3, reps: ISO_REPS, rest: 60 },
    { role: 'Calves', muscles: ['calves'], compound: false, sets: 3, reps: CALF_REPS, rest: 60 },
  ],
};

const FULL_C: SessionTemplate = {
  label: 'Full Body C',
  focus: 'Lunge · Overhead · Carry',
  slots: [
    { role: 'Lunge pattern', muscles: ['quads', 'glutes'], patterns: ['lunge', 'squat'], compound: true, sets: 4, reps: LUNGE_REPS, rest: 150 },
    { role: 'Overhead press', muscles: ['shoulders'], patterns: ['push'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Weighted pull', muscles: ['lats'], patterns: ['pull'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Hip extension', muscles: ['glutes'], patterns: ['hinge'], compound: true, sets: 3, reps: LUNGE_REPS, rest: 120 },
    { role: 'Triceps', muscles: ['triceps'], compound: false, sets: 3, reps: ISO_REPS, rest: 60 },
    { role: 'Anti-rotation core', muscles: ['obliques', 'abs'], compound: false, sets: 3, reps: CORE_REPS, rest: 60 },
  ],
};

const UPPER_A: SessionTemplate = {
  label: 'Upper A',
  focus: 'Bench · Row strength',
  slots: [
    { role: 'Horizontal press', muscles: ['chest'], patterns: ['push'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Horizontal row', muscles: ['lats', 'traps'], patterns: ['pull'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Overhead press', muscles: ['shoulders'], patterns: ['push'], compound: true, sets: 3, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Vertical pull', muscles: ['lats'], patterns: ['pull'], compound: true, sets: 3, reps: COMPOUND_REPS, rest: 120 },
    { role: 'Biceps', muscles: ['biceps'], compound: false, sets: 3, reps: ISO_REPS, rest: 60 },
    { role: 'Triceps', muscles: ['triceps'], compound: false, sets: 3, reps: ISO_REPS, rest: 60 },
  ],
};

const UPPER_B: SessionTemplate = {
  label: 'Upper B',
  focus: 'Vertical · variety',
  slots: [
    { role: 'Vertical press', muscles: ['shoulders'], patterns: ['push'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Vertical pull', muscles: ['lats'], patterns: ['pull'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Incline press', muscles: ['chest'], patterns: ['push'], compound: true, sets: 3, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Row variety', muscles: ['lats', 'traps'], patterns: ['pull'], compound: true, sets: 3, reps: COMPOUND_REPS, rest: 120 },
    { role: 'Lateral raise', muscles: ['shoulders'], compound: false, sets: 3, reps: ISO_REPS, rest: 75 },
    { role: 'Arms superset', muscles: ['biceps', 'triceps'], compound: false, sets: 2, reps: ISO_REPS, rest: 60 },
  ],
};

const LOWER_A: SessionTemplate = {
  label: 'Lower A',
  focus: 'Squat strength',
  slots: [
    { role: 'Primary squat', muscles: ['quads'], patterns: ['squat'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 210 },
    { role: 'Hinge', muscles: ['hamstrings', 'glutes'], patterns: ['hinge'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Quad accessory', muscles: ['quads'], compound: false, sets: 3, reps: ISO_REPS, rest: 90 },
    { role: 'Hamstring curl', muscles: ['hamstrings'], compound: false, sets: 3, reps: ISO_REPS, rest: 75 },
    { role: 'Calves', muscles: ['calves'], compound: false, sets: 4, reps: CALF_REPS, rest: 60 },
  ],
};

const LOWER_B: SessionTemplate = {
  label: 'Lower B',
  focus: 'Hinge · glutes',
  slots: [
    { role: 'Primary hinge', muscles: ['hamstrings', 'glutes'], patterns: ['hinge'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 210 },
    { role: 'Squat variety', muscles: ['quads'], patterns: ['squat'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Hip thrust', muscles: ['glutes'], patterns: ['hinge'], compound: true, sets: 3, reps: LUNGE_REPS, rest: 120 },
    { role: 'Lunge', muscles: ['quads', 'glutes'], patterns: ['lunge'], compound: true, sets: 3, reps: LUNGE_REPS, rest: 120 },
    { role: 'Calves', muscles: ['calves'], compound: false, sets: 4, reps: CALF_REPS, rest: 60 },
    { role: 'Core', muscles: ['abs', 'lowerBack'], compound: false, sets: 3, reps: CORE_REPS, rest: 60 },
  ],
};

const PUSH: SessionTemplate = {
  label: 'Push',
  focus: 'Chest · delts · triceps',
  slots: [
    { role: 'Primary press', muscles: ['chest'], patterns: ['push'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Overhead press', muscles: ['shoulders'], patterns: ['push'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Incline / flye', muscles: ['chest'], compound: true, sets: 3, reps: COMPOUND_REPS, rest: 120 },
    { role: 'Lateral raise', muscles: ['shoulders'], compound: false, sets: 3, reps: ISO_REPS, rest: 75 },
    { role: 'Triceps', muscles: ['triceps'], compound: false, sets: 3, reps: ISO_REPS, rest: 60 },
    { role: 'Triceps finisher', muscles: ['triceps'], compound: false, sets: 2, reps: ISO_REPS, rest: 60 },
  ],
};

const PULL: SessionTemplate = {
  label: 'Pull',
  focus: 'Back · biceps',
  slots: [
    { role: 'Primary pull', muscles: ['lats'], patterns: ['pull'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Heavy row', muscles: ['lats', 'traps'], patterns: ['pull'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 150 },
    { role: 'Vertical pull', muscles: ['lats'], patterns: ['pull'], compound: true, sets: 3, reps: COMPOUND_REPS, rest: 120 },
    { role: 'Rear delts / traps', muscles: ['traps', 'shoulders'], compound: false, sets: 3, reps: ISO_REPS, rest: 75 },
    { role: 'Biceps', muscles: ['biceps'], compound: false, sets: 3, reps: ISO_REPS, rest: 60 },
    { role: 'Forearms / grip', muscles: ['forearms'], compound: false, sets: 2, reps: ISO_REPS, rest: 60 },
  ],
};

const LEGS: SessionTemplate = {
  label: 'Legs',
  focus: 'Quads · hams · glutes',
  slots: [
    { role: 'Primary squat', muscles: ['quads'], patterns: ['squat'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 210 },
    { role: 'Primary hinge', muscles: ['hamstrings', 'glutes'], patterns: ['hinge'], compound: true, sets: 4, reps: COMPOUND_REPS, rest: 180 },
    { role: 'Unilateral', muscles: ['quads', 'glutes'], patterns: ['lunge'], compound: true, sets: 3, reps: LUNGE_REPS, rest: 120 },
    { role: 'Hamstring curl', muscles: ['hamstrings'], compound: false, sets: 3, reps: ISO_REPS, rest: 75 },
    { role: 'Calves', muscles: ['calves'], compound: false, sets: 4, reps: CALF_REPS, rest: 60 },
    { role: 'Core', muscles: ['abs', 'obliques'], compound: false, sets: 3, reps: CORE_REPS, rest: 60 },
  ],
};

function templatesFor(splitId: SplitId, days: number): SessionTemplate[] {
  switch (splitId) {
    case 'full-body':
      return days === 2 ? [FULL_A, FULL_B] : [FULL_A, FULL_B, FULL_C];
    case 'upper-lower':
      return [UPPER_A, LOWER_A, UPPER_B, LOWER_B];
    case 'upper-lower-ppl':
      return [UPPER_A, LOWER_A, PUSH, PULL, LEGS];
    default:
      return [PUSH, PULL, LEGS, PUSH, PULL, LEGS];
  }
}

/* ================= exercise selection ================= */

const SINGLE_JOINT_PRIMARIES = new Set<MuscleId>(['biceps', 'triceps', 'forearms', 'calves', 'abs', 'obliques', 'lowerBack']);

/** MET ≥ 4.5 = multi-joint loaded movement in our Compendium mapping; single-joint moves sit at 3.5. */
function isCompound(ex: Exercise): boolean {
  return !SINGLE_JOINT_PRIMARIES.has(ex.muscles[0]) && ex.met >= 4.5;
}

const EQUIPMENT_RANK: Record<string, number> = { barbell: 0, dumbbell: 1, machine: 2, cable: 3, kettlebell: 4, bodyweight: 5, band: 6 };

function equipmentUsable(ex: Exercise, available: Set<string>): boolean {
  return ex.equipment.some((e) => available.has(e));
}

/** Deterministic ranked pick with seed-based rotation among the top candidates. */
function pickExercise(slot: SlotSpec, available: Set<string>, profile: Profile, seed: number): Exercise | null {
  let pool = EXERCISES.filter(
    (ex) =>
      ex.type === 'strength' &&
      slot.muscles.includes(ex.muscles[0]) &&
      equipmentUsable(ex, available) &&
      isCompound(ex) === slot.compound,
  );
  if (pool.length === 0) {
    // graceful fallback: accept either kind if the strict filter empties the pool
    pool = EXERCISES.filter((ex) => ex.type === 'strength' && slot.muscles.includes(ex.muscles[0]) && equipmentUsable(ex, available));
  }
  if (pool.length === 0) return null;

  const maxDiff = profile.experience === 'beginner' ? 2 : 3;
  pool = pool.filter((ex) => ex.difficulty <= maxDiff);
  if (pool.length === 0) return null;

  const score = (ex: Exercise): number => {
    let s = 0;
    if (slot.patterns?.includes(ex.pattern)) s += 4;
    if (profile.experience === 'beginner' && ex.difficulty <= 1) s += 2;
    if (profile.experience === 'advanced' && ex.difficulty >= 2) s += 1;
    if (slot.compound && ex.equipment.includes('barbell') && available.has('barbell')) s += 1;
    s -= Math.min(3, EQUIPMENT_RANK[ex.equipment[0]] ?? 5) * 0.2; // slight barbell > dumbbell > machine tilt
    return s;
  };
  const ranked = [...pool].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const rotationWindow = Math.min(3, ranked.length);
  return ranked[Math.abs(seed) % rotationWindow];
}

/* ================= sets/rep prescription ================= */

function scaleSets(base: number, profile: Profile): number {
  if (profile.experience === 'beginner') return Math.max(2, base - 1);
  if (profile.experience === 'advanced') return base;
  return base;
}

function prescribeReps(reps: [number, number], profile: Profile, goal: ProgramConfig['goal']): [number, number] {
  // strength goal shifts PRIMARY compound slots toward 4–6 reps @ ≥80% 1RM (ACSM 2009)
  if (goal === 'strength' && reps[0] >= 6 && reps[0] <= 8) return STRENGTH_REPS;
  // hypertrophy goal biases compounds toward the classic 8–12 window (Schoenfeld 2013)
  if (goal === 'hypertrophy' && reps[0] >= 6 && reps[0] <= 8) return [8, 12];
  if (profile.experience === 'beginner' && reps[0] <= 8) return [6, 10];
  return reps;
}

function rirLabel(profile: Profile, compound: boolean): string {
  if (profile.experience === 'beginner') return compound ? '2–3 RIR' : '1–2 RIR';
  return compound ? '1–2 RIR' : '0–1 RIR';
}

/* ================= generated program shape ================= */

export interface PrescribedExercise {
  exerciseId: string;
  name: string;
  role: string;
  sets: number;
  reps: string;
  rir: string;
  restSec: number;
  muscles: MuscleId[];
  equipment: Equipment[];
}

export interface LandmarkCheck {
  id: MuscleId;
  label: string;
  sets: number;
  mev: number;
  mav: number;
  mrv: number;
  status: 'below' | 'zone' | 'high' | 'over';
}

export interface GeneratedProgram {
  splitName: string;
  splitId: SplitId;
  daysPerWeek: number;
  layout: string[];
  sessions: {
    label: string;
    focus: string;
    weekday: string;
    exercises: PrescribedExercise[];
    estMinutes: number;
    estKcal: number;
    totalSets: number;
  }[];
  weeklySets: Record<MuscleId, number>;
  landmarks: LandmarkCheck[];
  science: { label: string; citation: string }[];
}

export function generateProgram(cfg: ProgramConfig, profile: Profile, weightKg: number): GeneratedProgram {
  const available = new Set<Equipment>([...cfg.equipment, 'bodyweight']);
  const templates = templatesFor(cfg.splitId, cfg.daysPerWeek);
  const layout = WEEK_LAYOUT[cfg.daysPerWeek] ?? WEEK_LAYOUT[3];
  const bump = cfg.daysPerWeek === 2 ? 1 : 0; // 2-day weeks need denser sessions to reach weekly MEV

  const emphasis = cfg.emphasis;
  const sessions = templates.map((tpl, ti) => {
    const exercises: PrescribedExercise[] = [];
    for (let si = 0; si < tpl.slots.length; si++) {
      const slot = tpl.slots[si];
      const upperSession = /upper|push|pull/i.test(tpl.label) || /press|row|pull/i.test(tpl.focus);
      const emphasised = emphasis === 'upper' ? upperSession : emphasis === 'lower' ? !upperSession : true;
      const ex = pickExercise(slot, available, profile, cfg.variantSeed * 5 + ti * 7 + si * 3);
      if (!ex) continue;
      const reps = prescribeReps(slot.reps, profile, cfg.goal);
      let sets = scaleSets(slot.sets, profile) + bump + (emphasised ? 0 : -1);
      sets = Math.max(2, sets);
      exercises.push({
        exerciseId: ex.id,
        name: ex.name,
        role: slot.role,
        sets,
        reps: `${reps[0]}–${reps[1]}`,
        rir: rirLabel(profile, slot.compound),
        restSec: slot.rest,
        muscles: ex.muscles,
        equipment: ex.equipment,
      });
    }
    const totalSets = exercises.reduce((s, e) => s + e.sets, 0);
    const estMinutes = Math.round((exercises.reduce((s, e) => s + e.sets * (e.restSec + 45), 0) / 60 + 8) / 5) * 5;
    // burn estimate: per-exercise MET × minutes approximated by sets×3 min
    const estKcal = Math.round(
      exercises.reduce((s, e) => {
        const ex = EXERCISES.find((x) => x.id === e.exerciseId);
        return s + ((ex?.met ?? 4) * 3.5 * weightKg) / 200 * e.sets * 3;
      }, 0),
    );
    return { label: tpl.label, focus: tpl.focus, weekday: layout[ti] ?? `Day ${ti + 1}`, exercises, estMinutes, estKcal, totalSets };
  });

  // weekly direct + fractional secondary sets per muscle (same convention as muscleSets())
  const weeklySets = {} as Record<MuscleId, number>;
  for (const s of sessions) {
    for (const pe of s.exercises) {
      const ex = EXERCISES.find((x) => x.id === pe.exerciseId);
      if (!ex) continue;
      pe.muscles.forEach((m, i) => (weeklySets[m] = (weeklySets[m] ?? 0) + pe.sets * (i === 0 ? 1 : 0.7)));
      for (const m of ex.secondary) weeklySets[m] = (weeklySets[m] ?? 0) + pe.sets * 0.5;
    }
  }

  const landmarks: LandmarkCheck[] = MUSCLES.map((m) => {
    const sets = weeklySets[m.id] ?? 0;
    const status: LandmarkCheck['status'] =
      sets < m.mev ? 'below' : sets <= m.mav ? 'zone' : sets <= m.mrv ? 'high' : 'over';
    return { id: m.id, label: m.label, sets: Math.round(sets * 10) / 10, mev: m.mev, mav: m.mav, mrv: m.mrv, status };
  });

  const split = SPLITS.find((s) => s.id === cfg.splitId);
  return {
    splitName: split?.name ?? 'Custom',
    splitId: cfg.splitId,
    daysPerWeek: cfg.daysPerWeek,
    layout,
    sessions,
    weeklySets,
    landmarks,
    science: [
      { label: 'Split & frequency', citation: split?.science ?? '' },
      { label: 'Weekly volume', citation: 'Schoenfeld, Ogborn & Krieger 2017 (J Sports Sci Med): 10–20 sets/muscle/week is the hypertrophy dose–response sweet spot; landmarks per Israetel & Hoffmann 2019.' },
      { label: 'Rest intervals', citation: 'Schoenfeld et al. 2016 (J Strength Cond Res): 2–3 min rest on compounds outgrows 1 min — longer rests preserve rep quality and volume.' },
      { label: 'Rep ranges', citation: 'ACSM 2009 position stand: 60–80% 1RM (≈6–12 reps) maximises hypertrophy; 80–90% (4–6 reps) biases strength.' },
      { label: 'Recovery spacing', citation: 'Damas et al. 2016: muscle-damage markers need ~48–72 h after a hard session — this plan never repeats a muscle inside 48 h.' },
    ],
  };
}

/* ================= progressive-overload coach ================= */

export interface ProgressionAdvice {
  exerciseId: string;
  name: string;
  lastDate: string | null;
  lastVolumeKg: number;
  bestSet: { weight: number; reps: number } | null;
  allSetsAtTop: boolean;
  minReps: number | null;
  targetReps: [number, number];
  action: 'baseline' | 'add-weight' | 'add-reps' | 'consolidate';
  advice: string;
  /** suggested next working weight (kg) for the prefill */
  suggestedWeight: number;
}

const WEIGHT_STEP: Record<MuscleId, number> = {
  quads: 5, hamstrings: 5, glutes: 5, calves: 2.5, lats: 2.5, traps: 2.5,
  chest: 2.5, shoulders: 2.5, biceps: 1.25, triceps: 1.25, forearms: 1.25, abs: 1.25, obliques: 1.25, lowerBack: 2.5,
};

export function progressionFor(
  exerciseId: string,
  targetReps: [number, number],
  days: Record<string, DayLog>,
  endDate: string,
): ProgressionAdvice {
  const ex = EXERCISES.find((x) => x.id === exerciseId);
  const name = ex?.name ?? 'Exercise';
  let lastDate: string | null = null;
  let lastSets: { weight: number; reps: number }[] | null = null;
  let lastVolume = 0;
  for (const d of lastNDays(endDate, 90).reverse()) {
    const day = days[d];
    if (!day) continue;
    const found = day.exercises.find((e) => e.exerciseId === exerciseId);
    if (found && found.sets.length > 0) {
      lastDate = d;
      lastSets = found.sets;
      lastVolume = found.volumeKg;
      break;
    }
  }
  const bestSet = lastSets
    ? lastSets.reduce((b, s) => (s.weight * s.reps > b.weight * b.reps ? s : b), lastSets[0])
    : null;
  const minReps = lastSets ? Math.min(...lastSets.map((s) => s.reps)) : null;
  const step = WEIGHT_STEP[ex?.muscles[0] ?? 'chest'] ?? 2.5;

  let action: ProgressionAdvice['action'] = 'baseline';
  let advice: string;
  let suggestedWeight = bestSet?.weight ?? 0;

  if (!lastSets || !bestSet) {
    action = 'baseline';
    advice = 'No history yet — set a load you can complete at the top of the rep range with ~2 reps in reserve, then log it. That baseline anchors all future progression.';
  } else if (minReps !== null && minReps >= targetReps[1]) {
    action = 'add-weight';
    suggestedWeight = Math.round(((bestSet.weight + step) * 2) / 2); // round to 0.5
    advice = `Every set hit ${targetReps[1]}+ reps — add +${step} kg next session (double progression). If reps drop below ${targetReps[0]}, hold the new load until they climb back.`;
  } else if (minReps !== null && minReps < targetReps[0]) {
    action = 'consolidate';
    advice = `Some sets fell under ${targetReps[0]} reps — repeat the same load and rebuild reps first. Progressive overload can come from reps before weight.`;
  } else {
    action = 'add-reps';
    suggestedWeight = bestSet.weight;
    advice = `Good zone — add +1 rep per set until every set reaches ${targetReps[1]}, then add +${step} kg. This is double progression, the most durable overload method.`;
  }

  return {
    exerciseId,
    name,
    lastDate,
    lastVolumeKg: lastVolume,
    bestSet,
    allSetsAtTop: minReps !== null && minReps >= targetReps[1],
    minReps,
    targetReps,
    action,
    advice,
    suggestedWeight,
  };
}

export function parseRepsLabel(reps: string): [number, number] {
  const m = reps.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!m) return [8, 12];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

export function todayProgramHint(): string {
  // tiny rotating evidence line for the program header
  const lines = [
    'Same exercises, more weight or reps over time — that is the whole game.',
    'Log RIR honestly: progression decisions are only as good as your effort data.',
    'A missed session costs more than a lighter one — never skip, just reduce.',
    'Volume landmarks are guide-rails, not law — individual response varies.',
  ];
  return lines[Math.floor(Date.now() / 86_400_000) % lines.length];
}

/* ================= program adherence tracking ================= */
//  · Regular activity across the week is the core of every guideline —
//    WHO 2020 guidelines on physical activity and sedentary behaviour
//  · Participation is driven by consistency/habit factors, not intensity —
//    Rhodes et al. 2017, Psychology & Health 32(4):396-428 (systematic review)

const DAY_MS = 86_400_000;

/** Whole days from `start` to `end` (NaN if either date is malformed). */
function elapsedDays(start: string, end: string): number {
  const t0 = Date.parse(start + 'T00:00:00');
  const t1 = Date.parse(end + 'T00:00:00');
  if (Number.isNaN(t0) || Number.isNaN(t1)) return NaN;
  return Math.round((t1 - t0) / DAY_MS);
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday of the ISO week containing `dateStr`. */
function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  return addDaysStr(dateStr, -dow);
}

export interface AdherenceOccurrence {
  /** session label, e.g. "Upper A" */
  label: string;
  /** planned calendar date (yyyy-mm-dd) */
  date: string;
  /** planned exercise count */
  planned: number;
  /** planned exercises actually logged that day (name overlap) */
  logged: number;
  done: boolean;
}

export interface ProgramAdherence {
  /** whole weeks since program creation (capped at 12) */
  weeksChecked: number;
  sessionsPlanned: number;
  sessionsLogged: number;
  /** 0–100, rounded */
  pct: number;
  /** per planned session occurrence over the last 4 weeks */
  perSession: AdherenceOccurrence[];
}

/**
 * Planned-vs-logged compliance, regenerated from the same seed → same plan.
 *
 * MATCHER (one robust rule, applied per planned session occurrence on date D):
 * a day "matches" (done) when the DayLog for D satisfies EITHER
 *   (A) name-overlap — the primary check: total strength tonnage that day > 0 AND
 *       ≥ half of the planned exercise NAMES appear among the logged exercise
 *       names. Session prefill copies names verbatim, so exact name matching is
 *       the most faithful signal of "trained the prescribed session".
 *   (B) count fallback — the day holds ≥ max(3, 60% of the planned exercise
 *       count) strength entries: catches users who swapped exercises but still
 *       trained the slot with equivalent volume.
 * `logged` reports the name-overlap count (0 when the day has no log).
 *
 * Weeks are anchored to the Monday of the creation week; sessions dated before
 * cfg.createdAt (mid-week creation) are not penalised, and only sessions
 * already due (date ≤ endDate) count — future sessions are never "missed".
 * The in-progress week is scanned so this week's completed sessions show up
 * immediately; `weeksChecked` still reports whole elapsed weeks.
 */
export function programAdherence(
  cfg: ProgramConfig,
  days: Record<string, DayLog>,
  profile: Profile,
  weightKg: number,
  endDate: string = todayStr(),
): ProgramAdherence {
  const program = generateProgram(cfg, profile, weightKg);
  const elapsed = elapsedDays(cfg.createdAt, endDate);
  if (!cfg.createdAt || !Number.isFinite(elapsed) || elapsed < 7) {
    return { weeksChecked: 0, sessionsPlanned: 0, sessionsLogged: 0, pct: 0, perSession: [] };
  }

  const weeksChecked = Math.min(12, Math.floor(elapsed / 7));
  // Calendar-anchored scan: program weeks are numbered from the Monday of the
  // creation week; we scan every program week that has STARTED (up to 12, the
  // lookback cap), including the in-progress one — but only sessions already
  // due (date ≤ endDate) count, so future sessions are never punished as missed.
  const week0 = mondayOf(cfg.createdAt);
  const weekNow = Math.floor(elapsedDays(week0, mondayOf(endDate)) / 7) + 1; // 1-based
  const firstWeek = Math.max(1, weekNow - 11); // 12-week lookback cap

  const occurrences: AdherenceOccurrence[] = [];
  for (let w = firstWeek; w <= weekNow; w++) {
    const weekStart = addDaysStr(week0, (w - 1) * 7);
    for (const s of program.sessions) {
      const wi = WEEKDAY_LABELS.indexOf(s.weekday.slice(0, 3));
      const date = addDaysStr(weekStart, wi < 0 ? 0 : wi);
      if (date < cfg.createdAt || date > endDate) continue; // not schedulable yet / in the future
      const day = days[date];
      const planned = s.exercises.length;
      if (!day || planned === 0) {
        occurrences.push({ label: s.label, date, planned, logged: 0, done: false });
        continue;
      }
      const loggedNames = new Set(day.exercises.map((e) => e.name));
      const overlap = s.exercises.filter((pe) => loggedNames.has(pe.name)).length;
      const strengthCount = day.exercises.filter((e) => e.type === 'strength').length;
      const tonnage = dayTotals(day).volumeKg;
      const done =
        (tonnage > 0 && overlap >= Math.ceil(planned / 2)) ||
        strengthCount >= Math.max(3, Math.ceil(planned * 0.6));
      occurrences.push({ label: s.label, date, planned, logged: overlap, done });
    }
  }

  const sessionsPlanned = occurrences.length;
  const sessionsLogged = occurrences.filter((o) => o.done).length;
  const cutoff = addDaysStr(endDate, -27); // last 4 weeks, inclusive of today
  const perSession = occurrences.filter((o) => o.date >= cutoff && o.date <= endDate);
  return {
    weeksChecked,
    sessionsPlanned,
    sessionsLogged,
    pct: sessionsPlanned > 0 ? Math.round((sessionsLogged / sessionsPlanned) * 100) : 0,
    perSession,
  };
}

/* ================= deload advisory (ACWR-lite) ================= */
//  · Acute:chronic workload ratio — Gabbett TJ, "The training–injury prevention
//    paradox: should athletes be training smarter and harder?", Br J Sports Med
//    2016;50(5):273-80. ACWR > ~1.3-1.5 = spike zone; < ~0.8 = under-loaded.
//  · Deloading every 4-6 weeks is standard strength-coach practice —
//    Androulakis-Korakakis et al. 2023 deloading-practices survey.

export interface DeloadAdvice {
  recommended: boolean;
  reason: string;
  /** whole weeks since cfg.createdAt */
  weekNumber: number;
  /** ACWR-lite: last-7-day strength tonnage ÷ mean weekly tonnage of the
   *  previous 4 weeks. Undefined when <2 of those 4 weeks are logged or the
   *  mean is zero (not enough data to judge). */
  acwr?: number;
}

export function deloadAdvice(cfg: ProgramConfig, days: Record<string, DayLog>, endDate: string = todayStr()): DeloadAdvice {
  const elapsed = elapsedDays(cfg.createdAt, endDate);
  const weekNumber = Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 7) : 0;

  // ACWR-lite on strength tonnage (dayTotals().volumeKg):
  //   acute = sum of last 7 days; chronic = mean weekly sum of the previous 4 weeks.
  let l7 = 0;
  let l28Mean = 0;
  let acwr: number | undefined;
  {
    const recent = lastNDays(endDate, 7);
    const prior = lastNDays(addDaysStr(endDate, -7), 28); // the 4 weeks before the acute week
    for (const d of recent) l7 += days[d] ? dayTotals(days[d]).volumeKg : 0;
    let weeksLogged = 0;
    let l28 = 0;
    for (let w = 0; w < 4; w++) {
      let wk = 0;
      for (let i = 0; i < 7; i++) {
        const d = prior[w * 7 + i];
        wk += days[d] ? dayTotals(days[d]).volumeKg : 0;
      }
      if (wk > 0) weeksLogged++;
      l28 += wk;
    }
    l28Mean = l28 / 4;
    if (weeksLogged >= 2 && l28Mean > 0) acwr = Math.round((l7 / l28Mean) * 100) / 100;
  }

  // Scheduled deload: the survey literature says every 4-6 weeks; we open a
  // deload window in the tail of each 5-week block — week 4 OR 5, 9 OR 10, … —
  // so whichever edge of the block you check (or backdate), the advisory fires
  // exactly once per block: weekNumber % 5 === 0 covers 5/10/15,
  // (weekNumber + 1) % 5 === 0 covers 4/9/14.
  const scheduled = weekNumber >= 4 && (weekNumber % 5 === 0 || (weekNumber + 1) % 5 === 0);

  let recommended = false;
  let reason = '';
  if (acwr !== undefined && acwr > 1.35) {
    recommended = true;
    reason = `Tonnage spike — the last 7 days carry ${acwr.toFixed(2)}× your 4-week weekly average (ACWR ${acwr.toFixed(2)}, spike zone > 1.35). Take a light week before your joints file a complaint (Gabbett 2016, BJSM).`;
  } else if (acwr !== undefined && acwr < 0.6 && weekNumber >= 4) {
    recommended = true;
    reason = `Chronic under-training — the last 7 days carry only ${acwr.toFixed(2)}× your 4-week weekly average (ACWR ${acwr.toFixed(2)} < 0.6). This is not a deload, it is a detour: get back on the planned sessions before fitness drifts (Gabbett 2016, BJSM).`;
  } else if (scheduled) {
    recommended = true;
    reason = `Week ${weekNumber} of this program — most experienced lifters schedule a lighter week every 4–6 weeks (Androulakis-Korakakis et al. 2023, deloading-practices survey). This one is yours.`;
  }

  return { recommended, reason, weekNumber, acwr };
}

export interface DeloadExercisePreview {
  name: string;
  /** ceil(sets/2) — roughly −50% */
  sets: number;
  /** unchanged from the prescription */
  reps: string;
  /** last logged best set × 0.9, rounded to 2.5 kg for barbell work
   *  (1.25 kg otherwise); null when the lift has no logged history */
  suggestedLoad: number | null;
}

export interface DeloadSessionPreview {
  label: string;
  weekday: string;
  exercises: DeloadExercisePreview[];
}

/**
 * What the deload week looks like: sets halved (ceil(n/2)), reps unchanged,
 * suggested load −10% off the last logged best set when `days` is provided
 * (rounded to 2.5 kg for barbell lifts, 1.25 kg otherwise).
 */
export function deloadPreview(
  program: GeneratedProgram,
  days?: Record<string, DayLog>,
  endDate: string = todayStr(),
): DeloadSessionPreview[] {
  return program.sessions.map((s) => ({
    label: s.label,
    weekday: s.weekday,
    exercises: s.exercises.map((pe) => {
      let suggestedLoad: number | null = null;
      if (days) {
        const adv = progressionFor(pe.exerciseId, parseRepsLabel(pe.reps), days, endDate);
        if (adv.bestSet && adv.bestSet.weight > 0) {
          const step = pe.equipment.includes('barbell') ? 2.5 : 1.25;
          suggestedLoad = Math.max(step, Math.round((adv.bestSet.weight * 0.9) / step) * step);
        }
      }
      return { name: pe.name, sets: Math.ceil(pe.sets / 2), reps: pe.reps, suggestedLoad };
    }),
  }));
}
