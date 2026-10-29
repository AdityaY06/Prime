import { NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { MAX_PARSE_CHARS, MAX_PARSE_ITEMS, clampParsedItem, parseMealLocal, type ParsedFoodItem } from "@/lib/food-parse"

export const dynamic = "force-dynamic"

// ─── /api/food-parse — DESCRIBE-MEAL estimator (R31-b) ────────────────────────
// POST { text } → { source: "ai", items } | { source: "local", items }.
// NO DB access, NO hunter — a pure parser. The LLM estimates first; ANY LLM
// failure (call error, non-JSON output, unusable items) degrades to the local
// FOODS-database estimator with 200 — a parse problem is never a 5xx.

const SYSTEM_PROMPT = [
  "You parse free-text meal descriptions into JSON food items.",
  "Each item is EXACTLY this shape (use EXACTLY these key names — no units inside key names):",
  '{"name": "roti", "qty": 2, "unit": "pc", "calories": 240, "protein": 6, "carbs": 48, "fat": 2, "fiber": 4, "sodium": 60, "sugar": 0}',
  "calories in KCAL, protein/carbs/fat/fiber/sugar in GRAMS, sodium in MILLIGRAMS — realistic",
  "approximations for the stated amount using common nutrition knowledge. Estimates are fine;",
  'mark nothing as certain. 1–12 items max. Respond with ONLY a JSON object {"items":[...]} —',
  "no markdown, no commentary.",
  // R68 · I1 — the weight convention: the sanitizer folds weight-unit rows
  // (qty>1 + g/kg/ml/oz unit) into unit="100 g", qty=1 — telling the model
  // the same convention up front keeps the two paths in agreement.
  'For weight/volume-measured items ("100 g chicken", "250 ml milk"), put the whole measure in "unit" (e.g. "100 g") and set "qty": 1 — calories and macros are ALWAYS for the whole stated amount.',
].join(" ")

/**
 * R68 · nutrition-audit I1 — the AI weight-unit normalizer.
 *
 * LLM rows for weight-measured foods arrived as {qty: 100, unit: "g"} (or
 * {qty: 2, unit: "kg"}); the sanitizer clamps qty to 50, so "100g chicken"
 * became qty 50 with kcal for the full 100 g — the DAY TOTAL stayed right
 * (per×qty round-trips) but the stored row LIED about the amount ("50 g").
 * Fold the measure into the unit label instead: {qty: 1, unit: "100 g"}
 * with macros untouched — every downstream number is byte-exact AND the
 * row reads honestly. Serving-style rows (2 rotis, 1 bowl) pass untouched.
 */
const AI_WEIGHT_UNITS = new Set([
  "g",
  "gm",
  "gms",
  "gram",
  "grams",
  "kg",
  "kgs",
  "ml",
  "l",
  "ltr",
  "litre",
  "liter",
  "oz",
  "ounce",
  "ounces",
])

function normalizeAiWeightRow(item: ParsedFoodItem): ParsedFoodItem {
  const unitWord = item.unit.toLowerCase().replace(/[^a-z]/g, "")
  if (item.qty > 1 && AI_WEIGHT_UNITS.has(unitWord)) {
    const measure = `${item.qty} ${item.unit.trim()}`.slice(0, 20)
    return { ...item, qty: 1, unit: measure }
  }
  return item
}

/**
 * Robust JSON harvest from an LLM reply: strip ```json fences, carve the first
 * `{` … last `}` substring, parse, validate the items array, sanitize every
 * item through clampParsedItem (nulls dropped). Any failure → [].
 */
function extractJsonItems(reply: string): ParsedFoodItem[] {
  const stripped = reply
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim()
  const first = stripped.indexOf("{")
  const last = stripped.lastIndexOf("}")
  if (first === -1 || last <= first) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped.slice(first, last + 1))
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== "object") return []

  const items = (parsed as { items?: unknown }).items
  if (!Array.isArray(items) || items.length === 0) return []

  const out: ParsedFoodItem[] = []
  for (const raw of items) {
    const clean = clampParsedItem(raw)
    if (clean) out.push(normalizeAiWeightRow(clean))
  }
  return out.slice(0, MAX_PARSE_ITEMS)
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null)
    const rawText = body && typeof body === "object" ? (body as Record<string, unknown>).text : undefined
    if (typeof rawText !== "string" || rawText.trim().length < 3 || rawText.trim().length > MAX_PARSE_CHARS) {
      return NextResponse.json({ error: "Describe your meal in 3–300 characters." }, { status: 400 })
    }
    const text = rawText.trim()

    // LLM estimate → sanitize; any failure falls through to the local estimator
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
        thinking: { type: "disabled" },
      })
      const reply = completion.choices[0]?.message?.content ?? ""
      const items = extractJsonItems(reply)
      if (items.length > 0) {
        return NextResponse.json({ source: "ai", items })
      }
      console.error("POST /api/food-parse — LLM output unusable, using local estimator")
    } catch (llmErr) {
      console.error("POST /api/food-parse — LLM call failed, using local estimator", llmErr)
    }

    return NextResponse.json({ source: "local", items: parseMealLocal(text) })
  } catch (e) {
    console.error("POST /api/food-parse", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
