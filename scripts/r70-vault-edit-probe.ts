// R70-c · vault-restore + fuel-edit probe — NET-NEW assertions only
// (does not restate r68-nutrition's 29):
//   1. edit-entry patch validation (src/lib/nutrition-entry.ts) — clamps /
//      enums / empty-name rejection, log-food-parity error copy
//   2. the WYSIWYG contract — a patch carries EXACTLY its own fields; a
//      qty-only patch re-derives nothing (no hidden macro rescale)
//   3. macroSplit validation (src/lib/vault-import.ts) — the 4 presets
//      restore, junk/missing/non-string keep the current hunter's value
//   4. vault nutritionLog row mapping — fiber/sodium/sugar survive the
//      restore mapping (R70-c drop #1), absent keys → 0 (v1 honesty)
//   5. route module smoke-import — POST exports are functions
// Run: bun scripts/r70-vault-edit-probe.ts
import { validateEntryPatch } from "@/lib/nutrition-entry"
import { MACRO_SPLIT_IDS, macroSplitOrFallback, nutritionLogCreateData } from "@/lib/vault-import"

let pass = 0
let fail = 0
function assert(label: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.error(`  ✗ ${label}`)
  }
}

// ── 1 · edit-entry patch validation ───────────────────────────────────────────
console.log("[R70-c probe] 1 · edit-entry patch validation (log-food parity)")

{
  const bad = validateEntryPatch({ mealType: "brunch" })
  const good = validateEntryPatch({ mealType: "snack" })
  assert(
    'mealType enum: "brunch" rejected ("Invalid meal type.") · "snack" accepted',
    !bad.ok && bad.error === "Invalid meal type." && good.ok && good.data.mealType === "snack"
  )
}
{
  const blank = validateEntryPatch({ name: "   " })
  const long = validateEntryPatch({ name: "x".repeat(81) })
  const trimmed = validateEntryPatch({ name: "  rolled oats  " })
  assert(
    'name: blank rejected + 81-char rejected ("Food name must be 1–80 characters.") · "  rolled oats  " trims',
    !blank.ok && blank.error === "Food name must be 1–80 characters." &&
      !long.ok && long.error === "Food name must be 1–80 characters." &&
      trimmed.ok && trimmed.data.name === "rolled oats"
  )
}
{
  const r = validateEntryPatch({ qty: 0.05 })
  assert('qty 0.05 rejected — "Quantity must be between 0.1 and 50."', !r.ok && r.error === "Quantity must be between 0.1 and 50.")
}
{
  const r = validateEntryPatch({ qty: 0.125 })
  assert("qty 0.125 → round2 grid 0.13 (B2 two-decimal storage)", r.ok && r.data.qty === 0.13)
}
{
  const r = validateEntryPatch({ calories: "abc" })
  assert('calories "abc" rejected — "Calories and macros must be numbers."', !r.ok && r.error === "Calories and macros must be numbers.")
}
{
  const r = validateEntryPatch({ calories: -5 })
  assert(
    'calories -5 rejected — "Calories and macros can\'t be negative." (B12 voice)',
    !r.ok && r.error === "Calories and macros can't be negative."
  )
}
{
  const r = validateEntryPatch({ calories: 9999, protein: 9999 })
  assert(
    "out-of-range-high clamps silently to the [0, 5000] total bound (calories + protein)",
    r.ok && r.data.calories === 5000 && r.data.protein === 5000
  )
}
{
  const r = validateEntryPatch({ fiber: 4.2, sodium: -350, sugar: "12" })
  assert(
    "micros fail-open like log-food: fiber 4.2 passes · sodium -350 → 0 · sugar \"12\" → 12",
    r.ok && r.data.fiber === 4.2 && r.data.sodium === 0 && r.data.sugar === 12
  )
}
{
  const blank = validateEntryPatch({ unit: "" })
  const trim = validateEntryPatch({ unit: "  cup  " })
  assert(
    'unit: blank → "serving" (log-food default) · "  cup  " trims to "cup"',
    blank.ok && blank.data.unit === "serving" && trim.ok && trim.data.unit === "cup"
  )
}

// ── 2 · WYSIWYG contract — no hidden re-derivation ───────────────────────────
console.log("[R70-c probe] 2 · WYSIWYG contract (explicit-field edit)")

{
  const r = validateEntryPatch({ qty: 3 })
  assert(
    "qty-only patch carries ONLY qty — calories/protein/carbs/fat stay undefined (no re-scale)",
    r.ok && r.data.qty === 3 &&
      r.data.calories === undefined && r.data.protein === undefined &&
      r.data.carbs === undefined && r.data.fat === undefined
  )
}
{
  const r = validateEntryPatch({ calories: null, name: "kept" })
  assert(
    "null is absent — {calories: null, name} edits name only",
    r.ok && r.data.name === "kept" && r.data.calories === undefined
  )
}
{
  const r = validateEntryPatch({})
  assert("empty patch validates ok with zero keys (the route 400s with its own no-fields voice)", r.ok && Object.keys(r.data).length === 0)
}
{
  const r = validateEntryPatch({
    mealType: "lunch",
    name: "QA row",
    qty: 2,
    unit: "bowl",
    calories: 400,
    protein: 30,
    carbs: 40,
    fat: 10,
    fiber: 6,
    sodium: 500,
    sugar: 8,
  })
  assert(
    "full patch round-trips every editable field (mealType→sugar)",
    r.ok && r.data.mealType === "lunch" && r.data.name === "QA row" && r.data.qty === 2 &&
      r.data.unit === "bowl" && r.data.calories === 400 && r.data.protein === 30 &&
      r.data.carbs === 40 && r.data.fat === 10 && r.data.fiber === 6 &&
      r.data.sodium === 500 && r.data.sugar === 8
  )
}
{
  const r = validateEntryPatch({ calories: 123.45 })
  assert("round1 storage grid: calories 123.45 → 123.5 (totals round like log-food)", r.ok && r.data.calories === 123.5)
}

// ── 3 · macroSplit validation (vault restore drop #2) ────────────────────────
console.log("[R70-c probe] 3 · macroSplit threading (never corrupt)")

assert(
  "the 4 presets restore (balanced · highprotein · lowcarb · carbload)",
  ["balanced", "highprotein", "lowcarb", "carbload"].every((id) => macroSplitOrFallback(id, "x-fallback") === id)
)
assert('macroSplit "beastmode" (junk) keeps the current value', macroSplitOrFallback("beastmode", "lowcarb") === "lowcarb")
assert(
  "macroSplit missing (v1 file) / non-string (42) keeps the current value",
  macroSplitOrFallback(undefined, "highprotein") === "highprotein" && macroSplitOrFallback(42, null) === null
)
assert(
  "MACRO_SPLIT_IDS is exactly the 4 presets (one truth with lib/nutrition)",
  JSON.stringify([...MACRO_SPLIT_IDS].sort()) === JSON.stringify(["balanced", "carbload", "highprotein", "lowcarb"])
)

// ── 4 · vault nutritionLog row mapping (restore drop #1 — micros) ────────────
console.log("[R70-c probe] 4 · vault nutritionLog mapping (micros survive)")

const day = "2026-10-23"
const mapped = nutritionLogCreateData(
  {
    id: "nl_qa_1",
    day,
    mealType: "dinner",
    name: "Dal Tadka",
    qty: 1.5,
    unit: "katori",
    calories: 270,
    protein: 13.5,
    carbs: 33,
    fat: 9,
    fiber: 4.2,
    sodium: 350,
    sugar: 12,
    createdAt: "2026-10-23T18:30:00.000Z",
  },
  "hunter_qa",
  day
)
assert(
  "micros preserve exactly: fiber 4.2 · sodium 350 · sugar 12",
  mapped.fiber === 4.2 && mapped.sodium === 350 && mapped.sugar === 12
)
assert(
  "macro mapping intact (270 kcal · P 13.5 · C 33 · F 9 · qty 1.5 × katori · id/day thread)",
  mapped.calories === 270 && mapped.protein === 13.5 && mapped.carbs === 33 && mapped.fat === 9 &&
    mapped.qty === 1.5 && mapped.unit === "katori" && mapped.id === "nl_qa_1" &&
    mapped.hunterId === "hunter_qa" && mapped.day === day
)
{
  const v1 = nutritionLogCreateData({ day, name: "Legacy roti", calories: 130 }, "hunter_qa", day)
  assert(
    "v1 row (micros absent) → fiber/sodium/sugar 0 — untracked then, honest default",
    v1.fiber === 0 && v1.sodium === 0 && v1.sugar === 0
  )
}
{
  const garbage = nutritionLogCreateData({ fiber: "abc", sodium: null, sugar: -3 }, "hunter_qa", day)
  const strings = nutritionLogCreateData({ fiber: "4.2", sodium: "350", sugar: "12" }, "hunter_qa", day)
  assert(
    'coercion: garbage ("abc"/null/-3) → 0 · numeric strings pass ("4.2" → 4.2 · "350" · "12")',
    garbage.fiber === 0 && garbage.sodium === 0 && garbage.sugar === 0 &&
      strings.fiber === 4.2 && strings.sodium === 350 && strings.sugar === 12
  )
}
{
  const r = nutritionLogCreateData({ name: "no-day row" }, "hunter_qa", day)
  assert(
    "row without day defaults to the restore day; mealType/qty/unit defaults hold",
    r.day === day && r.mealType === "snack" && r.qty === 1 && r.unit === "serving"
  )
}

// ── 5 · route module smoke-import ─────────────────────────────────────────────
console.log("[R70-c probe] 5 · route module smoke-import")

const nutritionRoute = await import("@/app/api/nutrition/route").catch((e) => {
  console.error("  import failed:", e)
  return null
})
assert("api/nutrition route module imports (bun) and POST is a function", nutritionRoute !== null && typeof nutritionRoute.POST === "function")

const vaultRoute = await import("@/app/api/vault/route").catch((e) => {
  console.error("  import failed:", e)
  return null
})
assert("api/vault route module imports (bun) and POST is a function", vaultRoute !== null && typeof vaultRoute.POST === "function")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log(`[R70-c probe] ✅ ALL ${pass} ASSERTIONS PASSED`)
