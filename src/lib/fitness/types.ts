// ASCEND — Evidence-Based Fitness OS · core domain types
// All formulas & data grounded in published research (see src/lib/fitness/data/research.ts)

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type Goal = 'lose' | 'recomp' | 'maintain' | 'gain';
export type Units = 'metric' | 'imperial';
export type Experience = 'beginner' | 'intermediate' | 'advanced';

export interface Profile {
  name: string;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: Goal;
  /** magnitude in kg/week (0.25 – 1.0) */
  goalRateKg: number;
  experience: Experience;
  units: Units;
  createdAt: string;
}

export interface MacroPlan {
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  stepGoal: number;
  sleepGoalH: number;
  fibreGoalG: number;
  /** human-readable citations for every computed number */
  formulas: {
    bmr: string;
    tdee: string;
    calories: string;
    protein: string;
    fat: string;
    water: string;
    steps: string;
    sleep: string;
    fibre: string;
  };
}

/* ---------------- Food & nutrition ---------------- */

export type FoodCategory =
  | 'protein' | 'grain' | 'fruit' | 'vegetable' | 'dairy'
  | 'nuts' | 'legume' | 'dish' | 'snack' | 'beverage' | 'condiment';

export interface FoodServing {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  /** all per 100 g (or 100 ml for beverages) */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  servings: FoodServing[];
  source: 'USDA' | 'IFCT' | 'label';
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface LoggedFood {
  id: string;
  foodId: string;
  name: string;
  grams: number;
  meal: MealSlot;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  ts: string;
}

/* ---------------- Training ---------------- */

export type MuscleId =
  | 'chest' | 'lats' | 'traps' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques' | 'glutes' | 'quads' | 'hamstrings' | 'calves' | 'lowerBack';

export type ExerciseType = 'strength' | 'cardio' | 'mobility';
export type Pattern = 'push' | 'pull' | 'squat' | 'hinge' | 'lunge' | 'carry' | 'core' | 'cardio' | 'mobility';
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'none';

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  pattern: Pattern;
  muscles: MuscleId[];
  secondary: MuscleId[];
  equipment: Equipment[];
  /** MET value — Compendium of Physical Activities (Ainsworth et al. 2011) */
  met: number;
  difficulty: 1 | 2 | 3;
  cues: string[];
}

export interface SetEntry {
  weight: number;
  reps: number;
  /** reps in reserve — proximity to failure (Robinson et al. 2024) */
  rir?: number;
}

export interface LoggedExercise {
  id: string;
  exerciseId: string;
  name: string;
  type: ExerciseType;
  muscles: MuscleId[];
  secondary: MuscleId[];
  met: number;
  sets: SetEntry[];
  minutes: number;
  volumeKg: number;
  kcal: number;
  ts: string;
}

/* ---------------- Habits ---------------- */

export type HabitCategory = 'recovery' | 'movement' | 'nutrition' | 'mindset';

export interface HabitDef {
  id: string;
  name: string;
  /** lucide icon name, mapped in the UI */
  icon: string;
  category: HabitCategory;
  kind: 'toggle' | 'measure';
  target?: number;
  unit?: string;
  why: string;
  citation: string;
  /** habit value auto-syncs with a DayLog metric */
  linked?: 'steps' | 'sleep' | 'water' | 'fibre' | 'protein' | 'training' | 'sunlight';
}

/* ---------------- Day log ---------------- */

export interface DayLog {
  foods: LoggedFood[];
  exercises: LoggedExercise[];
  waterMl: number;
  steps: number;
  sleepH: number;
  habits: Record<string, number | boolean>;
  weightKg?: number;
  note?: string;
  /**
   * Streak-freeze flag (feature ⑤): a user-declared "skip day".
   * When walking streaks backwards a frozen day is SKIPPED — it neither
   * breaks nor extends the streak (Lally et al. 2010: missing one day
   * costs almost nothing; the freeze keeps the chain intact).
   * Optional so pre-freeze persisted state merges without migration.
   */
  frozen?: boolean;
}

export interface Measurement {
  ts: string;
  waistCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  hipCm?: number;
}

/* ---------------- Program builder ---------------- */

export type SplitId = 'full-body' | 'upper-lower' | 'upper-lower-ppl' | 'ppl';
export type ProgramFocus = 'balanced' | 'upper' | 'lower';
export type ProgramGoal = 'mixed' | 'strength' | 'hypertrophy';

/** User's saved program-generator configuration (persisted). */
export interface ProgramConfig {
  daysPerWeek: 2 | 3 | 4 | 5 | 6;
  splitId: SplitId;
  /** equipment the user has access to — 'bodyweight' is always implied */
  equipment: Equipment[];
  emphasis: ProgramFocus;
  goal: ProgramGoal;
  /** increment + regenerate to roll different exercise variants */
  variantSeed: number;
  createdAt: string;
}

export type TabId = 'dashboard' | 'fuel' | 'train' | 'body' | 'habits' | 'progress' | 'science';

export interface AppState {
  version: number;
  onboarded: boolean;
  profile: Profile;
  plan: MacroPlan;
  xp: number;
  days: Record<string, DayLog>;
  measurements: Measurement[];
  /** active generated training program (null until the user builds one) */
  program: ProgramConfig | null;
  /** favourite food ids (library + custom) */
  favoriteFoods: string[];
  /** user-defined foods, merged into search */
  customFoods: Food[];
}
