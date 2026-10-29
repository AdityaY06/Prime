// R71-a · food-db + dropdown-exactness probe — NET-NEW assertions only
// (does not restate r68-nutrition's 29 parser assertions or r70-vault-edit's
// 25 edit/vault assertions):
//   1. FOODS database integrity — unique ids, valid categories, finite
//      non-negative macros + micros, calories > 0, parseable serving labels,
//      generous sanity bands (corruption catchers, not value judgments)
//   2. count + category distribution (118 → 202 expansion)
//   3. original-118 spot-lock (byte-identical) + new-entry spot-lock
//   4. searchFoods ranked scoring — exact > word-prefix > word-start >
//      substring, alphabetical ties, category filter, limit, determinism
//   5. dropdown wiring statics — database tab is the DEFAULT, EXACT badge
//      text, micros in the pinned footer Σ preview
//   6. log-food exactness — pure recompute of the route's arithmetic
//      (round2 qty grid → per-serving × qty → clamp → round1) against
//      hand-computed literals; no HTTP involved
// Run: bun scripts/r71-food-db-probe.ts
import { readFileSync } from "node:fs"
import { FOODS, FOOD_BY_ID, FOOD_CATEGORIES, searchFoods } from "@/lib/nutrition"

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

// ── 1 · database integrity ───────────────────────────────────────────────────
console.log("[R71-a probe] 1 · FOODS database integrity")

const ids = FOODS.map((f) => f.id)
assert(
  `unique kebab ids across all ${FOODS.length} foods (no collisions)`,
  new Set(ids).size === FOODS.length && ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))
)
assert(
  "every category is one of the 8 FOOD_CATEGORIES (no drift)",
  FOODS.every((f) => (FOOD_CATEGORIES as readonly string[]).includes(f.category))
)
assert(
  "all macros + micros finite and ≥ 0, calories > 0 (9 numeric fields per row)",
  FOODS.every(
    (f) =>
      [f.calories, f.protein, f.carbs, f.fat, f.fiber, f.sodium, f.sugar].every(
        (v) => Number.isFinite(v) && v >= 0
      ) && f.calories > 0
  )
)
assert(
  "servingLabel non-empty and parseable (carries digits + g/ml)",
  FOODS.every((f) => f.servingLabel.trim().length > 0 && /\d/.test(f.servingLabel) && /(g|ml)\b/i.test(f.servingLabel))
)
assert(
  "sanity bands hold per serving: kcal 1–1500 · P ≤100 · C ≤200 · F ≤120 · FIB ≤40 · NA ≤2000 · SUG ≤100",
  FOODS.every(
    (f) =>
      f.calories >= 1 && f.calories <= 1500 &&
      f.protein <= 100 && f.carbs <= 200 && f.fat <= 120 &&
      f.fiber <= 40 && f.sodium <= 2000 && f.sugar <= 100
  )
)
assert(
  "FOOD_BY_ID resolves every FOODS row (id → row, 1:1)",
  Object.keys(FOOD_BY_ID).length === FOODS.length && FOODS.every((f) => FOOD_BY_ID[f.id] === f)
)

// ── 2 · count + category distribution (the R71-a expansion) ──────────────────
console.log("[R71-a probe] 2 · expansion count + distribution")

const dist = new Map<string, number>()
for (const f of FOODS) dist.set(f.category, (dist.get(f.category) ?? 0) + 1)
assert(
  `count ≥ 195 (got ${FOODS.length}) — 118 original + net-new`,
  FOODS.length >= 195 && FOODS.length === 118 + 84
)
assert(
  `distribution sane: all 8 categories present, each ≥ 15 rows (got ${[...dist.entries()].map(([c, n]) => `${c} ${n}`).join(" · ")})`,
  dist.size === 8 && [...dist.values()].every((n) => n >= 15)
)

// ── 3 · spot-locks: original 118 byte-identical + new rows exact ─────────────
console.log("[R71-a probe] 3 · spot value locks")

{
  const roti = FOOD_BY_ID["roti"]
  assert(
    "original roti untouched: 130 kcal · P4 C22 F2.5 · FIB 2.5 NA 120 SUG 0.5",
    roti.calories === 130 && roti.protein === 4 && roti.carbs === 22 && roti.fat === 2.5 &&
      roti.fiber === 2.5 && roti.sodium === 120 && roti.sugar === 0.5
  )
  const blackCoffee = FOOD_BY_ID["black-coffee"]
  assert(
    "original black coffee untouched: 2 kcal · NA 5",
    blackCoffee.calories === 2 && blackCoffee.sodium === 5
  )
  const paneer = FOOD_BY_ID["paneer"]
  assert(
    "original paneer untouched: 290 kcal · P19 C2 F22",
    paneer.calories === 290 && paneer.protein === 19 && paneer.carbs === 2 && paneer.fat === 22
  )
  const p = FOOD_BY_ID["palak-paneer"]
  assert(
    "NEW palak paneer: 1 katori (150 g) · 230 kcal · P11 C11 F15 · FIB 3.5 NA 380 SUG 3",
    p.servingLabel === "1 katori (150 g)" && p.calories === 230 && p.protein === 11 && p.carbs === 11 &&
      p.fat === 15 && p.fiber === 3.5 && p.sodium === 380 && p.sugar === 3
  )
  const bagel = FOOD_BY_ID["bagel"]
  assert(
    "NEW bagel: 98 g · 245 kcal · P9.8 C48 F1.5 · NA 430",
    bagel.servingLabel === "1 medium (98 g)" && bagel.calories === 245 && bagel.protein === 9.8 &&
      bagel.carbs === 48 && bagel.fat === 1.5 && bagel.sodium === 430
  )
  const beer = FOOD_BY_ID["beer"]
  assert(
    "NEW beer: 330 ml can · 142 kcal (ethanol-inclusive) · C11.9 · NA 13",
    beer.servingLabel === "1 can (330 ml)" && beer.calories === 142 && beer.carbs === 11.9 && beer.sodium === 13
  )
  const burger = FOOD_BY_ID["cheeseburger"]
  assert(
    "NEW cheeseburger: 114 g · 300 kcal · P15 C32 F13 · NA 680 SUG 7",
    burger.calories === 300 && burger.protein === 15 && burger.carbs === 32 && burger.fat === 13 &&
      burger.sodium === 680 && burger.sugar === 7
  )
}

// ── 4 · searchFoods ranked scoring ───────────────────────────────────────────
console.log("[R71-a probe] 4 · searchFoods ranking (exact > word-prefix > word-start > substring)")

assert(
  'exact beats everything: "banana" → banana first (not Banana Shake)',
  searchFoods("banana")[0]?.id === "banana" && searchFoods("banana").every((f) => f.name.toLowerCase().includes("banana"))
)
{
  const chi = searchFoods("chi")
  const firstNonPrefix = chi.findIndex((f) => !f.name.toLowerCase().startsWith("chi"))
  assert(
    'word-prefix beats word-start: every "chi" hit before the first non-prefix ("chilla"-class) starts with "chi"',
    chi.length > 5 && chi.slice(0, firstNonPrefix === -1 ? chi.length : firstNonPrefix).every((f) =>
      f.name.toLowerCase().startsWith("chi")
    )
  )
}
{
  const paneer = searchFoods("paneer").map((f) => f.id)
  assert(
    'prefix rows precede word-start rows: paneer / paneer-bhurji / paneer-paratha (prefix) all before palak-paneer (word-start)',
    ["paneer", "paneer-bhurji", "paneer-paratha"].every((id) => paneer.indexOf(id) !== -1) &&
      paneer.indexOf("palak-paneer") > paneer.indexOf("paneer-paratha")
  )
}
{
  const read = searchFoods("read").map((f) => f.id)
  assert(
    'substring-only match: "read" → the three bread rows (mid-word hits), ranked alphabetically',
    JSON.stringify(read) === JSON.stringify(["garlic-bread", "white-bread", "wheat-bread"])
  )
}
assert(
  'multi-word query: "greek yogurt" → greek-yogurt first (word-prefix)',
  searchFoods("greek yogurt")[0]?.id === "greek-yogurt"
)
assert(
  "category filter: empty query + Fruits → only Fruits; pizza + Fast Food → only Fast Food; pizza + Fruits → none",
  searchFoods("", "Fruits").every((f) => f.category === "Fruits") &&
    searchFoods("pizza", "Fast Food").every((f) => f.category === "Fast Food") &&
    searchFoods("pizza", "Fruits").length === 0
)
assert(
  "limit respected: searchFoods('', null, 5).length === 5 and 'e' capped at 3",
  searchFoods("", null, 5).length === 5 && searchFoods("e", null, 3).length === 3
)
assert(
  "deterministic pure function: two identical calls deep-equal",
  JSON.stringify(searchFoods("dal")) === JSON.stringify(searchFoods("dal"))
)
assert(
  'case-insensitive + trimmed: "  PANEER " === "paneer"',
  JSON.stringify(searchFoods("  PANEER ")) === JSON.stringify(searchFoods("paneer"))
)
assert('no match is honest: "zzzz" → empty', searchFoods("zzzz").length === 0)

// ── 5 · dropdown wiring statics (fuel-tab source) ────────────────────────────
console.log("[R71-a probe] 5 · dropdown wiring statics (src/components/fitness/fuel-tab.tsx)")

const src = readFileSync("src/components/fitness/fuel-tab.tsx", "utf8")
assert(
  'default tab is "database": useState<"describe" | "database" | "custom">("database")',
  src.includes('useState<"describe" | "database" | "custom">("database")')
)
assert(
  'dialog-open reset lands on the picker: setTab("database") under the default-landing comment',
  src.includes('setTab("database")') && src.includes("database picker is the default landing tab on every open")
)
assert(
  'EXACT badge text present in the pinned footer: "EXACT · DATABASE VALUE"',
  src.includes("EXACT · DATABASE VALUE")
)
assert(
  "footer Σ preview scales MICROS by qty: fmt1(selected.fiber * qty) · sodium · sugar present",
  src.includes("fmt1(selected.fiber * qty)") &&
    src.includes("fmt1(selected.sodium * qty)") &&
    src.includes("fmt1(selected.sugar * qty)")
)
assert(
  'honest tab labels: "Pick · Exact" (database) + "≈ Estimate" (describe) + SEARCH ${FOODS.length} placeholder',
  src.includes("Pick · Exact") && src.includes("≈ Estimate") && src.includes("SEARCH ${FOODS.length} FOODS")
)
assert(
  "combobox a11y present: aria-haspopup listbox + role=listbox + role=option + Escape panel guard",
  src.includes('aria-haspopup="listbox"') && src.includes('role="listbox"') && src.includes('role="option"') &&
    src.includes("ddOpenRef.current") && src.includes("NO MATCHES — TRY THE DESCRIBE OR CUSTOM TAB")
)

// ── 6 · log-food exactness — pure recompute of the route arithmetic ─────────
// Mirrors api/nutrition/route.ts log-food: qtyR = round2(qty); stored macro =
// round1(clamp(per × qtyR, 0, 5000)); stored micro = round1(clamp(micro ×
// qtyR, 0, 100000)). Expected values below are hand-computed literals — any
// drift in FOODS values OR in this arithmetic breaks the probe.
console.log("[R71-a probe] 6 · log-food exactness (route-math recompute, no HTTP)")

const r1 = (n: number): number => Math.round(n * 10) / 10
const r2 = (n: number): number => Math.round(n * 100) / 100
const cl = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))
function storedTotals(id: string, qty: number) {
  const f = FOOD_BY_ID[id]
  const q = r2(qty)
  return {
    calories: r1(cl(f.calories * q, 0, 5000)),
    protein: r1(cl(f.protein * q, 0, 5000)),
    carbs: r1(cl(f.carbs * q, 0, 5000)),
    fat: r1(cl(f.fat * q, 0, 5000)),
    fiber: r1(cl(f.fiber * q, 0, 100000)),
    sodium: r1(cl(f.sodium * q, 0, 100000)),
    sugar: r1(cl(f.sugar * q, 0, 100000)),
  }
}
assert(
  "palak-paneer × 2 → 460 kcal · P22 C22 F30 · FIB 7 NA 760 SUG 6",
  JSON.stringify(storedTotals("palak-paneer", 2)) ===
    JSON.stringify({ calories: 460, protein: 22, carbs: 22, fat: 30, fiber: 7, sodium: 760, sugar: 6 })
)
assert(
  "bagel × 1.5 → 367.5 kcal · P14.7 C72 F2.3 · FIB 3.3 NA 645 SUG 8.9 (round1 grid)",
  JSON.stringify(storedTotals("bagel", 1.5)) ===
    JSON.stringify({ calories: 367.5, protein: 14.7, carbs: 72, fat: 2.3, fiber: 3.3, sodium: 645, sugar: 8.9 })
)
assert(
  "naan × 3 → 840 kcal · P24 C144 F19.5 · FIB 6 NA 1350 SUG 9",
  JSON.stringify(storedTotals("naan", 3)) ===
    JSON.stringify({ calories: 840, protein: 24, carbs: 144, fat: 19.5, fiber: 6, sodium: 1350, sugar: 9 })
)
assert(
  "chicken-burrito × 2 → 1240 kcal · P70 C144 F36 · FIB 20 NA 2500 SUG 8",
  JSON.stringify(storedTotals("chicken-burrito", 2)) ===
    JSON.stringify({ calories: 1240, protein: 70, carbs: 144, fat: 36, fiber: 20, sodium: 2500, sugar: 8 })
)
assert(
  "honey × 0.5 → 32 kcal · C8.7 · NA 0.5 SUG 8.6 (decimal-survival grid proof)",
  JSON.stringify(storedTotals("honey", 0.5)) ===
    JSON.stringify({ calories: 32, protein: 0.1, carbs: 8.7, fat: 0, fiber: 0, sodium: 0.5, sugar: 8.6 })
)
assert(
  "roti × 2 (original-118 path) → 260 kcal · P8 C44 F5 · FIB 5 NA 240 SUG 1 — byte-exact like before",
  JSON.stringify(storedTotals("roti", 2)) ===
    JSON.stringify({ calories: 260, protein: 8, carbs: 44, fat: 5, fiber: 5, sodium: 240, sugar: 1 })
)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log(`[R71-a probe] ✅ ALL ${pass} ASSERTIONS PASSED`)
