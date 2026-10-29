'use client';

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, DayLog, Food, LoggedExercise, LoggedFood, MacroPlan, Measurement, Profile, ProgramConfig } from './types';
import { computePlan, emptyDay, todayStr } from './calc';

const DEFAULT_PROFILE: Profile = {
  name: '',
  sex: 'male',
  age: 25,
  heightCm: 175,
  weightKg: 75,
  activity: 'light',
  goal: 'maintain',
  goalRateKg: 0.5,
  experience: 'beginner',
  units: 'metric',
  createdAt: '',
};

interface FitnessStore extends AppState {
  completeOnboarding: (profile: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  resetAll: () => void;
  exportState: () => string;
  importState: (json: string) => boolean;

  addFood: (date: string, food: LoggedFood) => void;
  removeFood: (date: string, id: string) => void;
  addWater: (date: string, ml: number) => void;
  setSteps: (date: string, steps: number) => void;
  setSleep: (date: string, hours: number) => void;
  setWeight: (date: string, kg: number) => void;
  toggleHabit: (date: string, habitId: string, value?: boolean) => void;
  /** Streak-freeze (feature ⑤): mark/unmark a date as a skip day. */
  toggleFreeze: (date: string) => void;
  addExercise: (date: string, ex: LoggedExercise) => void;
  removeExercise: (date: string, id: string) => void;
  addMeasurement: (m: Measurement) => void;

  setProgram: (cfg: ProgramConfig | null) => void;
  toggleFavoriteFood: (foodId: string) => void;
  addCustomFood: (food: Food) => void;
  removeCustomFood: (id: string) => void;
}

export const useFitnessStore = create<FitnessStore>()(
  persist(
    (set, get) => {
      const mutateDay = (date: string, fn: (d: DayLog) => DayLog) => {
        const days = get().days;
        const cur = days[date] ?? emptyDay();
        set({ days: { ...days, [date]: fn(cur) } });
      };
      return {
        version: 1,
        onboarded: false,
        profile: DEFAULT_PROFILE,
        plan: computePlan(DEFAULT_PROFILE),
        xp: 0,
        days: {},
        measurements: [],
        program: null,
        favoriteFoods: [],
        customFoods: [],

        completeOnboarding: (profile) =>
          set({
            onboarded: true,
            profile: { ...profile, createdAt: todayStr() },
            plan: computePlan(profile),
            days: {},
            measurements: [],
          }),
        updateProfile: (patch) => {
          const profile = { ...get().profile, ...patch };
          set({ profile, plan: computePlan(profile) });
        },
        resetAll: () =>
          set({
            onboarded: false,
            profile: DEFAULT_PROFILE,
            plan: computePlan(DEFAULT_PROFILE),
            xp: 0,
            days: {},
            measurements: [],
            program: null,
            favoriteFoods: [],
            customFoods: [],
          }),
        exportState: () =>
          JSON.stringify(
            { version: 1, profile: get().profile, days: get().days, measurements: get().measurements },
            null,
            2,
          ),
        importState: (json) => {
          try {
            const d = JSON.parse(json);
            if (!d?.profile || !d?.days) return false;
            const profile: Profile = { ...DEFAULT_PROFILE, ...d.profile };
            set({
              onboarded: true,
              profile,
              plan: computePlan(profile),
              xp: 0,
              days: d.days as Record<string, DayLog>,
              measurements: d.measurements ?? [],
            });
            return true;
          } catch {
            return false;
          }
        },

        addFood: (date, food) => mutateDay(date, (d) => ({ ...d, foods: [...d.foods, food] })),
        removeFood: (date, id) => mutateDay(date, (d) => ({ ...d, foods: d.foods.filter((f) => f.id !== id) })),
        addWater: (date, ml) => mutateDay(date, (d) => ({ ...d, waterMl: Math.max(0, d.waterMl + ml) })),
        setSteps: (date, steps) => mutateDay(date, (d) => ({ ...d, steps: Math.max(0, Math.round(steps) || 0) })),
        setSleep: (date, hours) =>
          mutateDay(date, (d) => ({ ...d, sleepH: Math.max(0, Math.min(14, Math.round(hours * 10) / 10 || 0)) })),
        setWeight: (date, kg) => mutateDay(date, (d) => ({ ...d, weightKg: Math.max(20, Math.min(300, Math.round(kg * 10) / 10 || 0)) })),
        toggleHabit: (date, habitId, value) =>
          mutateDay(date, (d) => ({
            ...d,
            habits: { ...d.habits, [habitId]: value ?? !(d.habits[habitId] as boolean) },
          })),
        // frozen days are skipped by streakInfo/habitStreak — neither break nor extend
        toggleFreeze: (date) => mutateDay(date, (d) => ({ ...d, frozen: !d.frozen })),
        addExercise: (date, ex) => mutateDay(date, (d) => ({ ...d, exercises: [...d.exercises, ex] })),
        removeExercise: (date, id) =>
          mutateDay(date, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.id !== id) })),
        addMeasurement: (m) =>
          set({
            measurements: [...get().measurements.filter((x) => x.ts !== m.ts), m].sort((a, b) =>
              a.ts.localeCompare(b.ts),
            ),
          }),

        setProgram: (cfg) => set({ program: cfg }),
        toggleFavoriteFood: (foodId) =>
          set({
            favoriteFoods: get().favoriteFoods.includes(foodId)
              ? get().favoriteFoods.filter((f) => f !== foodId)
              : [...get().favoriteFoods, foodId],
          }),
        addCustomFood: (food) => set({ customFoods: [...get().customFoods.filter((f) => f.id !== food.id), food] }),
        removeCustomFood: (id) => set({ customFoods: get().customFoods.filter((f) => f.id !== id) }),
      };
    },
    {
      name: 'ascend-fitness-v1',
      version: 1,
      partialize: (s) => ({
        version: s.version,
        onboarded: s.onboarded,
        profile: s.profile,
        plan: s.plan,
        xp: s.xp,
        days: s.days,
        measurements: s.measurements,
        program: s.program,
        favoriteFoods: s.favoriteFoods,
        customFoods: s.customFoods,
      }),
    },
  ),
);

/** Avoids SSR/localStorage hydration mismatches — render skeletons until true. */
const emptySubscribe = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export const EMPTY_DAY: DayLog = emptyDay();

export function useDay(date: string): DayLog {
  return useFitnessStore((s) => s.days[date]) ?? EMPTY_DAY;
}

export function usePlan(): MacroPlan {
  return useFitnessStore((s) => s.plan);
}

export function useProfile(): Profile {
  return useFitnessStore((s) => s.profile);
}

export function useDays(): Record<string, DayLog> {
  return useFitnessStore((s) => s.days);
}
