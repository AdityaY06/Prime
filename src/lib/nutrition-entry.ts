// ─── R70-c · edit-entry pure validation (fuel per-entry EDIT) ────────────────
// One truth for the /api/nutrition "edit-entry" action's patch semantics,
// shared with scripts/r70-vault-edit-probe.ts (probe-locked, no live server).
//
// WYSIWYG CONTRACT — explicit-field edit, no hidden re-derivation:
// log-food stores qty-multiplied totals (per-serving FOODS values × qty at log
// time), so an edit saves EXACTLY the submitted fields. A patch of {qty: 3}
// writes qty=3 and rescales NOTHING — the Fuel tab's EditEntryDialog submits
// the row's full total set, mirroring what the hunter reviews. Corrections are
// XP-neutral (delete-entry's accepted stance, worklog 5010): no grant, no
// revoke — edit-entry never touches the XP ledger.
//
// Validation mirrors log-food (route :287-350) field-for-field:
//   mealType        hard 400 unless a MEAL_TYPES id
//   name            trim, 1–80 chars (hard 400)
//   qty             0.1–50 hard 400, stored round2 (the B2 two-decimal grid)
//   calories        non-finite → hard 400 · negative → hard 400 ·
//                   out-of-range-high → silent clamp to the same [0, 5000]
//                   TOTAL bound log-food enforces after its qty multiply, round1
//   protein/carbs/fat   same treatment as calories (totals, not per-serving)
//   fiber/sodium/sugar  fail-open exactly like log-food micros: non-finite /
//                   negative → 0, clamp [0, 100000], round1
//   unit            trim, blank → "serving", slice(0, 60) — log-food's handling
// Absent / null / undefined keys are left untouched (partial patches are
// legal; an empty patch is the caller's "nothing to edit" error to raise).

import { MEAL_TYPES } from "@/lib/nutrition"

/** The editable slice of a NutritionLog row (explicit stored totals). */
export type EntryPatch = {
  mealType?: string
  name?: string
  qty?: number
  unit?: string
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  fiber?: number
  sodium?: number
  sugar?: number
}

export type EntryPatchResult = { ok: true; data: EntryPatch } | { ok: false; error: string }

const MEAL_IDS: readonly string[] = MEAL_TYPES.map((m) => m.id)

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clampRange(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * Validate an edit-entry patch. Pure: no db, no clock — every input maps to
 * either a normalized data object (only the keys the patch actually carried)
 * or a log-food-voiced error string for the route to 400 with.
 */
export function validateEntryPatch(patch: Record<string, unknown>): EntryPatchResult {
  const data: EntryPatch = {}
  // null and undefined both mean "field not in this edit" — keep the row's value
  const has = (k: string): boolean => patch[k] !== undefined && patch[k] !== null

  if (has("mealType")) {
    const v = typeof patch.mealType === "string" ? patch.mealType : ""
    if (!MEAL_IDS.includes(v)) return { ok: false, error: "Invalid meal type." }
    data.mealType = v
  }

  if (has("name")) {
    const v = typeof patch.name === "string" ? patch.name.trim() : ""
    if (v.length < 1 || v.length > 80) {
      return { ok: false, error: "Food name must be 1–80 characters." }
    }
    data.name = v
  }

  if (has("qty")) {
    const v = Number(patch.qty)
    if (!Number.isFinite(v) || v < 0.1 || v > 50) {
      return { ok: false, error: "Quantity must be between 0.1 and 50." }
    }
    data.qty = round2(v)
  }

  if (has("unit")) {
    const v = typeof patch.unit === "string" ? patch.unit.trim() : ""
    data.unit = v ? v.slice(0, 60) : "serving"
  }

  // calories + macros — log-food's hard-400 / silent-clamp split, applied to
  // the stored TOTAL (edit fields are row totals; there is no qty multiply)
  for (const f of ["calories", "protein", "carbs", "fat"] as const) {
    if (!has(f)) continue
    const v = Number(patch[f])
    if (!Number.isFinite(v)) return { ok: false, error: "Calories and macros must be numbers." }
    if (v < 0) return { ok: false, error: "Calories and macros can't be negative." }
    data[f] = round1(clampRange(v, 0, 5000))
  }

  // micros — fail-open (log-food L330-335): garbage / negative logs as 0
  for (const f of ["fiber", "sodium", "sugar"] as const) {
    if (!has(f)) continue
    const n = Number(patch[f])
    const v = Number.isFinite(n) && n > 0 ? n : 0
    data[f] = round1(clampRange(v, 0, 100000))
  }

  return { ok: true, data }
}
