// ─── R70-c · vault import pure helpers ───────────────────────────────────────
// Extracted from src/app/api/vault/route.ts so scripts/r70-vault-edit-probe.ts
// can lock the nutritionLog row mapping + macroSplit validation WITHOUT a live
// wipe-and-recreate restore. The coercion family is byte-identical to the
// route's former private helpers (same fallbacks, same trimming).

import { MACRO_SPLITS } from "@/lib/nutrition"

export type AnyRecord = Record<string, unknown>

// ── coercion family (vault dialect: forgiving import, honest defaults) ───────

export function toDate(v: unknown, fallback = new Date()): Date {
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d
  }
  return fallback
}

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

export function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function int(v: unknown, fallback = 0): number {
  return Math.trunc(num(v, fallback))
}

export function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback
}

export function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const d = toDate(v, new Date(0))
  return d.getTime() === 0 ? null : d.toISOString()
}

export function floatOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, n) : null
}

export function intOrNull(v: unknown): number | null {
  const n = floatOrNull(v)
  return n === null ? null : Math.trunc(n)
}

export function enumOrNull(v: unknown, allowed: readonly string[]): string | null {
  return typeof v === "string" && allowed.includes(v) ? v : null
}

// ── R70-c · macroSplit threading (vault restore drop #2) ─────────────────────

/** The macro-split presets the whole app accepts (one truth: MACRO_SPLITS in
 *  lib/nutrition — the Hunter.macroSplit column's enum-like values). */
export const MACRO_SPLIT_IDS: readonly string[] = MACRO_SPLITS.map((s) => s.id)

/**
 * Vault macroSplit resolution: only a KNOWN preset id restores; junk / missing
 * / v1 files (which predate the column) keep the CURRENT hunter's value — a
 * restore never corrupts the macro-split setting. `fallback` is the live
 * hunter's macroSplit read before the wipe.
 */
export function macroSplitOrFallback(v: unknown, fallback: string | null): string | null {
  return typeof v === "string" && MACRO_SPLIT_IDS.includes(v) ? v : fallback
}

// ── R70-c · nutritionLog row mapping (vault restore drop #1) ─────────────────

/** Shape of nutritionLogCreateData — the prisma create payload for one row. */
export type NutritionLogCreateData = {
  id: string | undefined
  hunterId: string
  day: string
  mealType: string
  name: string
  qty: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sodium: number
  sugar: number
  createdAt: Date
}

/**
 * Raw vault row → prisma create data. R70-c fix: fiber/sodium/sugar now ride
 * the mapping via Number() coercion with a 0 fallback (they were silently
 * omitted before, so every restored meal lost its micros to the schema
 * defaults). v1 files predate the R17-A micro columns — an ABSENT key means
 * "untracked back then", so restoring 0 is the honest value, not a dropped
 * one. Macros keep the route's original forgiving mapping (qty-multiplied
 * totals already stored on the row).
 */
export function nutritionLogCreateData(raw: AnyRecord, hunterId: string, defaultDay: string): NutritionLogCreateData {
  return {
    id: str(raw.id) || undefined,
    hunterId,
    day: str(raw.day, defaultDay),
    mealType: str(raw.mealType, "snack"),
    name: str(raw.name, "Food").slice(0, 80),
    qty: Math.max(0, num(raw.qty, 1)),
    unit: str(raw.unit, "serving").slice(0, 32),
    calories: Math.max(0, num(raw.calories)),
    protein: Math.max(0, num(raw.protein)),
    carbs: Math.max(0, num(raw.carbs)),
    fat: Math.max(0, num(raw.fat)),
    // R70-c — micros restored (Number() coercion, 0 fallback)
    fiber: Math.max(0, num(raw.fiber)),
    sodium: Math.max(0, num(raw.sodium)),
    sugar: Math.max(0, num(raw.sugar)),
    createdAt: toDate(raw.createdAt),
  }
}
