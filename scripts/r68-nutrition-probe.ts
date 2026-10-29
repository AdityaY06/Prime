// R68 · nutrition-audit regression probe — the parser's exactness contract.
// Traces the audit's corruption set through parseMealLocal and asserts the
// glued-token fix (B1), the ⅛ exactness fix (B10), the oz vocabulary (I2)
// and the whey alias (I3). Run: bun scripts/r68-nutrition-probe.ts
import { parseMealLocal } from "../src/lib/food-parse"

let pass = 0
let fail = 0
function assert(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (ok) pass++
  else {
    fail++
    console.error(`✗ ${label}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`)
  }
}

// ── B1: glued quantity+unit tokens must scale correctly ──────────────────────
const chicken100 = parseMealLocal("100g chicken")[0]
assert("100g chicken kcal", chicken100?.calories, 166.2) // was 62 (0.25 servings)
assert("100g chicken qty", chicken100?.qty, 0.67) // 100g / 150g serving
assert("100g chicken matched", chicken100?.matched, true)

const rice500 = parseMealLocal("500g rice")[0]
// 500 g / 158 g-serving = 3.16 servings × 205 kcal (USDA cooked rice 129.7 kcal/100g ✓)
assert("500g rice kcal = 647.8", rice500?.calories, 647.8)

const rice2kg = parseMealLocal("2kg rice")[0]
// 2000 g / 158 = 12.66 servings × 205 kcal = 2595.3 (USDA 2 kg cooked rice ≈ 2594)
assert("2kg rice kcal = 2595.3", rice2kg?.calories, 2595.3)

const milk200 = parseMealLocal("200ml milk")[0]
assert("200ml milk kcal ≈ 122", Math.abs((milk200?.calories ?? 0) - 122.2) < 0.5, true)

const grams100 = parseMealLocal("100grams chicken")[0]
assert("100grams chicken kcal", grams100?.calories, 166.2)

const cups15 = parseMealLocal("1.5cups rice")[0]
assert("1.5cups rice matched", cups15?.matched, true)
assert("1.5cups rice kcal = 307.5", cups15?.calories, 307.5)

const rotis2 = parseMealLocal("2rotis")[0]
assert("2rotis qty", rotis2?.qty, 2)
assert("2rotis kcal", rotis2?.calories, 260)

// ── B10: ⅛ survives the 2-decimal storage grid (0.13, +4% label tolerance) ─
const eighth = parseMealLocal("⅛ roti")[0]
assert("⅛ roti qty = 0.13 (round2 grid)", eighth?.qty, 0.13)
assert("⅛ roti kcal = 16.9 (130×0.13)", eighth?.calories, 16.9)

// ── regression: the previously-correct forms stay byte-exact ─────────────────
assert("2 rotis kcal", parseMealLocal("2 rotis")[0]?.calories, 260)
assert("1.5 cups rice kcal", parseMealLocal("1.5 cups rice")[0]?.calories, 307.5)
assert("half banana kcal", parseMealLocal("half banana")[0]?.calories, 52.5)
assert("one and a half roti kcal", parseMealLocal("one and a half roti")[0]?.calories, 195)
assert("1/2 cup rice kcal", parseMealLocal("1/2 cup rice")[0]?.calories, 102.5)
assert("3/4 roti kcal", parseMealLocal("3/4 roti")[0]?.calories, 97.5)
assert("2 eggs kcal", parseMealLocal("2 eggs")[0]?.calories, 144)
assert("50 gm paneer kcal", parseMealLocal("50 gm paneer")[0]?.calories, 145)
assert("100 g chicken kcal (spaced, still exact)", parseMealLocal("100 g chicken")[0]?.calories, 166.2)
assert("200 ml milk kcal (spaced)", parseMealLocal("200 ml milk")[0]?.calories, 122.2)

// ── I2: ounces join the weight vocabulary ───────────────────────────────────
const oz6 = parseMealLocal("6 oz chicken")[0]
assert("6 oz chicken matched", oz6?.matched, true)
// 6 oz = 170.10 g → qty round2(170.1/150) = 1.13 → 248 × 1.13 = 280.2
assert("6 oz chicken kcal = 280.2", oz6?.calories, 280.2)

// ── I3: whey alias ──────────────────────────────────────────────────────────
const whey1 = parseMealLocal("1 scoop whey")[0]
assert("1 scoop whey matched", whey1?.matched, true)
assert("1 scoop whey kcal", whey1?.calories, 120)

// ── honesty: unknown food never invents macros ───────────────────────────────
const unknown = parseMealLocal("some unknown dish xyz")[0]
assert("unknown kcal null", unknown?.calories, null)
assert("unknown matched false", unknown?.matched, false)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
