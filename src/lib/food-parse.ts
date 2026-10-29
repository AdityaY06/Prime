// ─── PRIME · food-parse — natural-language meal description → item list ──────
// R31-b (DESCRIBE-MEAL). Pure data + pure functions only — isomorphic (safe
// to import from client components AND API routes). Two consumers:
//   · /api/food-parse — LLM estimate with THIS module as the offline/fallback
//     estimator (and the sanitizer for LLM output via clampParsedItem).
//   · fuel-tab AddFoodDialog DESCRIBE tab — client-side offline fallback.
//
// HONESTY LEDGER
// ─────────────
// - The local estimator ONLY matches against the real 118-food FOODS database
//   (src/lib/nutrition.ts) — via cautious plural normalization + a curated
//   ALIASES map of ~25 spellings people actually type (roti/dal/rice/milk…),
//   every alias verified against a genuine FOODS id.
// - Unknown dishes are surfaced as unknown: matched:false + ALL macros null.
//   kcal are NEVER invented locally — no estimate beats a wrong estimate.
// - Numeric honesty: unicode fractions and number words are converted exactly
//   (½→0.5, one→1); "one and a half"→1.5 is pre-normalized before tokenizing.
// - Weight-measured tokens ("100 g chicken", "200 ml milk") scale against the
//   matched food's OWN servingLabel grams/ml — the ratio comes from the
//   database, never invented. No gram data on the label → no estimate.
// - Water tokens ("a glass of water") are skipped — hydration belongs to the
//   FUEL water tracker, not the meal log (documented judgment call).

import { FOODS, type FoodItem } from "@/lib/nutrition"

// ─── Types & limits ──────────────────────────────────────────────────────────

export type ParsedFoodItem = {
  name: string // display name, trimmed, ≤60 chars
  qty: number // 0.25–50
  unit: string // "serving" | "bowl" | "cup" | "roti" | ... ≤20 chars
  calories: number | null // null = NO estimate — user must type the exact count
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sodium: number | null
  sugar: number | null
  matched: boolean // true when macros derive from the local FOODS database
}

export const MAX_PARSE_ITEMS = 12
export const MAX_PARSE_CHARS = 300

// ─── Shared normalization ─────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Lowercase, drop parenthetical asides, collapse non-alphanumerics to spaces. */
function normPhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Cautious singular for a single word: a trailing "s" is dropped (never
 * "ss"/"us", never very short stems) — "rotis"→"roti", "bananas"→"banana",
 * "eggs"→"egg", "chapatis"→"chapati"; "rice"/"milk" pass through untouched.
 * Applied SYMMETRICALLY to user words and FOODS-name words so both sides
 * land in the same canonical space.
 */
function deplural(word: string): string {
  if (word.length >= 4 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1)
  }
  return word
}

function depluralPhrase(phrase: string): string {
  return phrase
    .split(" ")
    .filter(Boolean)
    .map(deplural)
    .join(" ")
}

// ─── Quantity vocabulary ──────────────────────────────────────────────────────

const NUM_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
}

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅓": 0.33,
  "⅔": 0.67,
  // R68 · nutrition-audit B10 — 0.13 was 2× the stated fraction at the
  // 0.25 qty floor ("⅛ roti" logged a quarter); 0.125 is exact and the
  // floors were lowered to 0.1 so it survives end-to-end.
  "⅛": 0.125,
}

/** Filler words that carry no food meaning — stripped before matching. */
const FILLER_WORDS = new Set([
  "of",
  "the",
  "some",
  "my",
  "a",
  "an",
  "big",
  "small",
  "large",
  "medium",
  "fresh",
  "homemade",
])

/** Hydration, not food — the FUEL tab has a dedicated water tracker. */
const IGNORE_WORDS = new Set(["water", "pani"])

/** Weight/volume measure words — "100 g chicken" style tokens. */
const WEIGHT_WORDS = new Set([
  "g",
  "gm",
  "gms",
  "gram",
  "grams",
  "kg",
  "kgs",
  "ml",
  "ltr",
  "litre",
  "liter",
  // R68 · nutrition-audit I2 — "6 oz chicken" was an honest unknown; the
  // avoirdupois ounce joins the weight vocabulary at its exact 28.3495 g.
  "oz",
  "ounce",
  "ounces",
])

/** kg/litre-style measures scale ×1000 to grams/ml before the serving ratio. */
const WEIGHT_MULT: Record<string, number> = {
  kg: 1000,
  kgs: 1000,
  ltr: 1000,
  litre: 1000,
  liter: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
}

/**
 * Grams-or-ml per ONE serving, harvested from each food's own servingLabel
 * ("1 cup (158 g)" → 158, "1 cup (244 ml)" → 244, "1 (40 g)" → 40). Foods
 * whose label carries no weight → null (weight tokens get no estimate).
 */
const WEIGHT_BY_ID: Record<string, number | null> = {}
for (const f of FOODS) {
  const m = f.servingLabel.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i)
  WEIGHT_BY_ID[f.id] = m ? Number(m[1]) : null
}

// ─── Portion / countable vocabulary ───────────────────────────────────────────

/** Measurement portions → the singular unit label stored on the row. */
const PORTION_SINGULARS: Record<string, string> = {
  bowl: "bowl",
  bowls: "bowl",
  cup: "cup",
  cups: "cup",
  plate: "plate",
  plates: "plate",
  glass: "glass",
  glasses: "glass",
  slice: "slice",
  slices: "slice",
  spoon: "spoon",
  spoons: "spoon",
  tablespoon: "tablespoon",
  tablespoons: "tablespoon",
  teaspoon: "teaspoon",
  teaspoons: "teaspoon",
  // R68 · nutrition-audit I3 — "1 scoop whey" left the portion word in the
  // phrase so matching failed; the scoop joins the portion vocabulary
  // (matches whey-protein's own "1 scoop (30 g)" serving label).
  scoop: "scoop",
  scoops: "scoop",
  serving: "serving",
  servings: "serving",
  piece: "piece",
  pieces: "piece",
  katori: "katori",
  katoris: "katori",
  pack: "pack",
  packs: "pack",
  packet: "packet",
  packets: "packet",
  bottle: "bottle",
  bottles: "bottle",
  can: "can",
  cans: "can",
}

/**
 * Countable food nouns — the unit label for "2 rotis"/"a banana" style tokens
 * (the food itself is recovered by matching the full token phrase, so
 * "2 egg bhurji" still lands on Egg Bhurji with unit "egg").
 */
const COUNTABLE_SINGULARS: Record<string, string> = {
  roti: "roti",
  rotis: "roti",
  chapati: "chapati",
  chapatis: "chapati",
  phulka: "phulka",
  phulkas: "phulka",
  paratha: "paratha",
  parathas: "paratha",
  idli: "idli",
  idlis: "idli",
  dosa: "dosa",
  dosas: "dosa",
  samosa: "samosa",
  samosas: "samosa",
  momo: "momo",
  momos: "momo",
  banana: "banana",
  bananas: "banana",
  apple: "apple",
  apples: "apple",
  egg: "egg",
  eggs: "egg",
  orange: "orange",
  oranges: "orange",
  mango: "mango",
  mangoes: "mango",
}

/** All portion-ish words (measurement + countable), plural forms included. */
const PORTION_LOOKUP: Record<string, string> = { ...PORTION_SINGULARS, ...COUNTABLE_SINGULARS }

// ─── FOODS match indexes (built once, module scope) ───────────────────────────

/**
 * Honest alias map — typed spellings → REAL FOODS ids. Every id below was
 * verified against FOODS on disk (R31-b); aliases exist ONLY where the
 * database genuinely has the food. Ambiguous single words (chicken, milk,
 * paneer, bread…) are pinned here so containment matching can't drift to a
 * wrong dish (e.g. plain "chicken" → Chicken Biryani).
 */
const ALIASES: Record<string, string> = {
  phulka: "roti",
  dal: "dal-tadka",
  daal: "dal-tadka",
  dhal: "dal-tadka",
  lentil: "dal-tadka",
  rice: "white-rice",
  chawal: "white-rice",
  milk: "whole-milk",
  curd: "curd",
  dahi: "curd",
  yogurt: "curd",
  chai: "milk-tea",
  tea: "milk-tea",
  coffee: "black-coffee",
  maggi: "instant-noodles",
  noodles: "instant-noodles",
  aloo: "potato-boiled",
  palak: "spinach",
  gobi: "cauliflower-sabzi",
  sabzi: "mixed-veg-sabzi",
  chhole: "chana-masala",
  paneer: "paneer",
  chicken: "chicken-breast",
  bread: "wheat-bread",
  salad: "kachumber-salad",
  // R68 · nutrition-audit I3 — "1 scoop whey" was an honest unknown;
  // whey is the canonical short name people type.
  whey: "whey-protein",
}

/** FOOD_BY_ID (kept local so this module owns only what it needs). */
const FOOD_BY_ID: Record<string, FoodItem> = Object.fromEntries(FOODS.map((f) => [f.id, f]))

/** Exact normalized-name → food (first wins on collision). */
const EXACT_INDEX = new Map<string, FoodItem>()
for (const f of FOODS) {
  const key = depluralPhrase(normPhrase(f.name))
  if (!EXACT_INDEX.has(key)) EXACT_INDEX.set(key, f)
}

/** Normalized word sets per food, FOODS order preserved for deterministic ties. */
const FOOD_WORD_SETS: ReadonlyArray<readonly string[]> = FOODS.map((f) =>
  depluralPhrase(normPhrase(f.name)).split(" ").filter(Boolean)
)

/**
 * Match a normalized food phrase against FOODS:
 *   1. ALIASES (deterministic staples)
 *   2. exact normalized-name equality ("dal tadka" → Dal Tadka)
 *   3. containment — every user word appears in the food's name words, fewest
 *      extra name words wins, ties resolved by FOODS order ("rice"-class
 *      ambiguities are pre-empted by the alias map above)
 * Returns null when nothing matches (honest unknown).
 */
function matchFood(phrase: string): FoodItem | null {
  const words = phrase.split(" ").filter(Boolean)
  if (words.length === 0) return null

  const aliased = ALIASES[phrase]
  if (aliased) {
    const f = FOOD_BY_ID[aliased]
    if (f) return f
  }

  const exact = EXACT_INDEX.get(phrase)
  if (exact) return exact

  let best: FoodItem | null = null
  let bestExtra = Infinity
  for (let i = 0; i < FOODS.length; i++) {
    const nameWords = FOOD_WORD_SETS[i]
    if (words.some((w) => !nameWords.includes(w))) continue
    const extra = nameWords.length - words.length
    if (extra < bestExtra) {
      bestExtra = extra
      best = FOODS[i]
    }
  }
  return best
}

// ─── Quantity extraction ──────────────────────────────────────────────────────

/** Reads a leading quantity off a token; returns [qty, rest] (qty null → 1). */
function extractQty(token: string): { qty: number; rest: string } {
  let rest = token.trim()

  // R68 · nutrition-audit B1 — glued quantity+unit tokens. "100g chicken",
  // "200ml milk", "2kg rice", "1.5cups" failed the plain-decimal match
  // (it demands a space-or-end lookahead), so qty silently degraded to the
  // default 1 while the weight branch computed grams from that WRONG qty —
  // "100g chicken" logged 62 kcal instead of ~166. Split the glue before
  // any quantity logic so every downstream path sees "100 g chicken".
  rest = rest.replace(/^(\d+(?:\.\d+)?)(?=[a-z])/, "$1 ")

  // unicode fraction "½ cup rice"
  const uni = UNICODE_FRACTIONS[rest[0]]
  if (uni !== undefined && rest.length > 1) {
    return { qty: uni, rest: rest.slice(1).trim() }
  }

  // "1/2 cup" / "1 / 2 cup"
  const frac = rest.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)(?=\s|$)/)
  if (frac) {
    const denom = Number(frac[2])
    const v = denom > 0 ? Number(frac[1]) / denom : NaN
    if (Number.isFinite(v) && v > 0) return { qty: round2(v), rest: rest.slice(frac[0].length).trim() }
  }

  // number words "one bowl", "two rotis"
  const firstWord = rest.split(/\s+/)[0] ?? ""
  const wordNum = NUM_WORDS[firstWord]
  if (wordNum !== undefined) {
    return { qty: wordNum, rest: rest.slice(firstWord.length).trim() }
  }

  // "half a banana" / "half glass" / "a half cup"
  if (/^half(?:\s+(?:a|an))?(?=\s|$)/.test(rest)) {
    return { qty: 0.5, rest: rest.replace(/^half(?:\s+(?:a|an))?\s*/, "").trim() }
  }
  if (/^(?:a|an)\s+half(?=\s|$)/.test(rest)) {
    return { qty: 0.5, rest: rest.replace(/^(?:a|an)\s+half\s*/, "").trim() }
  }

  // "quarter cup" / "a quarter plate"
  if (/^quarter(?:\s+(?:a|an))?(?=\s|$)/.test(rest)) {
    return { qty: 0.25, rest: rest.replace(/^quarter(?:\s+(?:a|an))?\s*/, "").trim() }
  }
  if (/^(?:a|an)\s+quarter(?=\s|$)/.test(rest)) {
    return { qty: 0.25, rest: rest.replace(/^(?:a|an)\s+quarter\s*/, "").trim() }
  }

  // plain decimal "2 rotis" / "1.5 cups"
  const num = rest.match(/^(\d+(?:\.\d+)?)(?=\s|$)/)
  if (num) {
    return { qty: Number(num[1]), rest: rest.slice(num[0].length).trim() }
  }

  // articles "a banana" / "an apple"
  if (/^(?:a|an)(?=\s|$)/.test(rest)) {
    return { qty: 1, rest: rest.replace(/^(?:a|an)\s*/, "").trim() }
  }

  return { qty: 1, rest }
}

// ─── The local estimator ──────────────────────────────────────────────────────

/**
 * Free-text meal description → ParsedFoodItem[] using ONLY the local FOODS
 * database. Macros on matched rows are per-serving × qty (qty-multiplied
 * totals, mirroring how /api/nutrition stores rows). Unmatched tokens keep
 * their typed name with ALL macros null — the user supplies the exact count.
 */
export function parseMealLocal(text: string): ParsedFoodItem[] {
  const out: ParsedFoodItem[] = []
  if (typeof text !== "string") return out

  // Pre-normalize "one and a half" style quantities BEFORE " and " splitting.
  let normalized = text.slice(0, MAX_PARSE_CHARS)
  normalized = normalized.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+(?:\.\d+)?)\s+and\s+(?:a\s+|an\s+)?half\b/gi,
    (_m, w: string) => String((NUM_WORDS[w.toLowerCase()] ?? Number(w)) + 0.5)
  )

  const tokens = normalized
    .split(/[,+;&]|\band\b/gi)
    .map((t) => t.trim())
    .filter(Boolean)

  for (const token of tokens) {
    if (out.length >= MAX_PARSE_ITEMS) break
    if (token.length < 2) continue // garbage / pure punctuation

    const { qty, rest } = extractQty(token.toLowerCase())
    if (!Number.isFinite(qty) || qty <= 0) continue

    // weight/volume-measured token ("100 g chicken", "half kg paneer",
    // "200 ml milk") — scale against the matched food's own servingLabel
    const firstRaw = (rest.split(/\s+/)[0] ?? "").replace(/[^a-z]/g, "")
    if (firstRaw && WEIGHT_WORDS.has(firstRaw)) {
      const foodWords = rest
        .split(/\s+/)
        .slice(1)
        .map((w) => deplural(w.replace(/[^a-z0-9]+/g, "")))
        .filter((w) => w && !FILLER_WORDS.has(w))
      if (foodWords.length === 0) continue // bare weight — garbage
      if (foodWords.length === 1 && IGNORE_WORDS.has(foodWords[0])) continue

      const phrase = foodWords.join(" ")
      const food = matchFood(phrase)
      const unit = `${qty} ${firstRaw}`.slice(0, 20)
      const grams = qty * (WEIGHT_MULT[firstRaw] ?? 1)
      const perServingG = food ? WEIGHT_BY_ID[food.id] : null

      if (food && perServingG !== null && perServingG > 0) {
        const qtyW = round2(Math.min(50, Math.max(0.1, grams / perServingG)))
        out.push({
          name: food.name.slice(0, 60),
          qty: qtyW,
          unit,
          calories: round1(food.calories * qtyW),
          protein: round1(food.protein * qtyW),
          carbs: round1(food.carbs * qtyW),
          fat: round1(food.fat * qtyW),
          fiber: round1(food.fiber * qtyW),
          sodium: round1(food.sodium * qtyW),
          sugar: round1(food.sugar * qtyW),
          matched: true,
        })
      } else if (food) {
        // known food, but its label carries no weight → honest no-estimate
        out.push({
          name: food.name.slice(0, 60),
          qty: 1,
          unit,
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
          fiber: null,
          sodium: null,
          sugar: null,
          matched: false,
        })
      } else {
        out.push({
          name: (phrase.charAt(0).toUpperCase() + phrase.slice(1)).slice(0, 60),
          qty: 1,
          unit,
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
          fiber: null,
          sodium: null,
          sugar: null,
          matched: false,
        })
      }
      continue
    }

    // raw words: punctuation-stripped + filler-free (plural forms intact —
    // PORTION_LOOKUP knows them explicitly)
    const rawWords = rest
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]+/g, ""))
      .filter((w) => w && !FILLER_WORDS.has(w))

    // first portion-ish word (measurement or countable) becomes the unit
    let unit = "serving"
    let portionIdx = -1
    for (let i = 0; i < rawWords.length; i++) {
      const singular = PORTION_LOOKUP[rawWords[i]]
      if (singular) {
        unit = singular
        portionIdx = i
        break
      }
    }
    // canonical words: the portion word takes its looked-up singular, the rest
    // the cautious deplural ("2 rotis" → ["roti"], "2 mangoes" → ["mango"])
    const words = rawWords.map((w, i) => (i === portionIdx ? unit : deplural(w)))
    const candWords = portionIdx >= 0 ? words.filter((_, i) => i !== portionIdx) : words
    const fullPhrase = words.join(" ")
    const candPhrase = candWords.join(" ")

    if (candWords.length === 1 && IGNORE_WORDS.has(candWords[0])) continue // hydration, not food

    // "2 rotis" → the countable IS the food; "one bowl of dal" → food is the
    // portion-stripped remainder; "2 egg bhurji" / "masala dosa" → the FULL
    // phrase (exact-name match wins over the portion-stripped reading).
    let food: FoodItem | null = null
    if (candWords.length === 0) {
      food = matchFood(fullPhrase)
    } else {
      const full = matchFood(fullPhrase)
      const cand = matchFood(candPhrase)
      food = full && EXACT_INDEX.has(fullPhrase) ? full : (cand ?? full)
    }
    if (!food && candWords.length === 0) continue // pure number / measurement-only garbage

    const qtyClamped = round2(Math.min(50, Math.max(0.1, qty)))
    const nameSource = candWords.length > 0 ? candPhrase : fullPhrase

    if (food) {
      out.push({
        name: food.name.slice(0, 60),
        qty: qtyClamped,
        unit: unit.slice(0, 20),
        calories: round1(food.calories * qtyClamped),
        protein: round1(food.protein * qtyClamped),
        carbs: round1(food.carbs * qtyClamped),
        fat: round1(food.fat * qtyClamped),
        fiber: round1(food.fiber * qtyClamped),
        sodium: round1(food.sodium * qtyClamped),
        sugar: round1(food.sugar * qtyClamped),
        matched: true,
      })
    } else {
      // honest unknown — display name from the typed words, no invented kcal
      const displayName = nameSource.charAt(0).toUpperCase() + nameSource.slice(1)
      out.push({
        name: displayName.slice(0, 60),
        qty: qtyClamped,
        unit: unit.slice(0, 20),
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
        fiber: null,
        sodium: null,
        sugar: null,
        matched: false,
      })
    }
  }

  return out.slice(0, MAX_PARSE_ITEMS)
}

// ─── LLM-output sanitizer (shared shape contract) ─────────────────────────────

function finiteOr<T extends number | null>(v: unknown, clampMax: number): number | null {
  const n = Number(v)
  // negative / NaN / non-numeric → null (NO honest estimate exists); genuine
  // numbers clamp at the ceiling so absurd model output can't poison the log
  return Number.isFinite(n) && n >= 0 ? Math.min(n, clampMax) : null
}

/**
 * Tolerant key harvest (R31 close-out fix). Live LLM output was observed
 * returning unit-suffixed keys — `"protein g": 6`, `"sodium mg": 60` — when the
 * prompt listed fields as "protein g, sodium mg", silently nulling every macro.
 * This resolves an object key by trying the canonical name first, then a set
 * of normalized variants (spaces/underscores/hyphens stripped, trailing unit
 * letters folded in), so key-name drift degrades gracefully instead of losing
 * the estimate.
 */
function pickNumber(o: Record<string, unknown>, variants: readonly string[], clampMax: number): number | null {
  for (const key of variants) {
    if (key in o && o[key] !== null && o[key] !== undefined && o[key] !== "") {
      const out = finiteOr(o[key], clampMax)
      if (out !== null) return out
    }
  }
  // normalized pass: "protein g" / "protein_g" / "proteinG" → "proteing"
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, "")
  const normalized = new Map<string, unknown>()
  for (const [k, v] of Object.entries(o)) normalized.set(norm(k), v)
  for (const key of variants) {
    const hit = normalized.get(norm(key))
    if (hit !== null && hit !== undefined && hit !== "") {
      const out = finiteOr(hit, clampMax)
      if (out !== null) return out
    }
  }
  return null
}

/** Canonical + drifted key variants per numeric field (see pickNumber). */
const CAL_KEYS = ["calories", "kcal", "cal"] as const
const PROTEIN_KEYS = ["protein", "proteing", "proteingrams"] as const
const CARBS_KEYS = ["carbs", "carbsg", "carbohydrates", "carbohydratesg"] as const
const FAT_KEYS = ["fat", "fatg"] as const
const FIBER_KEYS = ["fiber", "fiberg", "fibre", "fibreg"] as const
const SODIUM_KEYS = ["sodium", "sodiummg"] as const
const SUGAR_KEYS = ["sugar", "sugarg"] as const

/**
 * Loose object → ParsedFoodItem | null. Coerces numbers, clamps (calories
 * 0–3000, protein/carbs/fat 0–500, fiber 0–200, sodium 0–5000, sugar 0–300,
 * qty 0.25–50 — values ABOVE a ceiling clamp down, negative/NaN fields become
 * null so the user types the exact count instead of trusting garbage), trims
 * strings. Returns null when unfixable (no/empty name). Used by /api/food-parse
 * for LLM output; exported for reuse wherever the same shape needs trusting.
 */
export function clampParsedItem(raw: unknown): ParsedFoodItem | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>

  const name = typeof o.name === "string" ? o.name.trim().slice(0, 60) : ""
  if (name.length < 1) return null

  const qtyNum = Number(o.qty)
  const qty = Number.isFinite(qtyNum) && qtyNum > 0 ? round2(Math.min(50, Math.max(0.1, qtyNum))) : 1

  const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim().slice(0, 20) : "serving"

  return {
    name,
    qty,
    unit,
    calories: pickNumber(o, CAL_KEYS, 3000),
    protein: pickNumber(o, PROTEIN_KEYS, 500),
    carbs: pickNumber(o, CARBS_KEYS, 500),
    fat: pickNumber(o, FAT_KEYS, 500),
    fiber: pickNumber(o, FIBER_KEYS, 200),
    sodium: pickNumber(o, SODIUM_KEYS, 5000),
    sugar: pickNumber(o, SUGAR_KEYS, 300),
    matched: o.matched === true,
  }
}
