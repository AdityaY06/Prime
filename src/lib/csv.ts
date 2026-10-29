// ─── ASCENDANT · CSV import adapters ──────────────────────────────────────────
// Parses MyFitnessPal food exports, Google Takeout (Google Fit) weight/steps
// CSVs and the ASCENDANT generic template into normalized ImportRows, then
// applies them to the NutritionLog / WaterLog / BodyMetric tables.

import { db } from "@/lib/db"
import { METRIC_TYPES } from "@/lib/nutrition"
import type { ImportFormat, ImportRow, ImportSummary } from "@/lib/types"

// ─── CSV parsing (RFC-4180-ish: quotes, doubled quotes, CRLF) ─────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  const src = text.replace(/^\uFEFF/, "") // strip BOM

  const pushField = () => {
    row.push(field.trim())
    field = ""
  }
  const pushRow = () => {
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      pushField()
    } else if (c === "\n") {
      pushField()
      pushRow()
    } else if (c === "\r") {
      // swallow — the following \n (if any) ends the row
      if (src[i + 1] !== "\n") {
        pushField()
        pushRow()
      }
    } else {
      field += c
    }
  }
  pushField()
  pushRow()
  return rows
}

// ─── Date normalization ────────────────────────────────────────────────────────

/** Accepts yyyy-mm-dd, yyyy/mm/dd, mm/dd/yyyy, dd/mm/yyyy, JS Date strings.
 *  Returns yyyy-mm-dd or null. */
export function normalizeDay(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, "")
  if (!s) return null

  // ISO-ish yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) {
    return mkDay(Number(m[1]), Number(m[2]), Number(m[3]))
  }

  // mm/dd/yyyy (US) — assume US unless the first component can't be a month
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    let a = Number(m[1])
    let b = Number(m[2])
    if (a > 12 && b <= 12) {
      const t = a
      a = b
      b = t // dd/mm/yyyy fallback
    }
    return mkDay(Number(m[3]), a, b)
  }

  // JS-style date string ("Sat Sep 20 2026 08:23:11 GMT+0530 (…)")
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return mkDay(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }
  return null
}

function mkDay(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  const today = new Date()
  const floor = new Date(today.getFullYear() - 15, 0, 1)
  if (dt < floor || dt > today) return null // no future / ancient data
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

// ─── Number helper ─────────────────────────────────────────────────────────────

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const s = raw.trim().replace(/^"|"$/g, "").replace(/,/g, "")
  if (s === "" || s === "-") return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

// ─── Format detection ──────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<ImportFormat, string> = {
  myfitnesspal: "MyFitnessPal food export",
  "google-takeout": "Google Takeout · Google Fit",
  ascendant: "ASCENDANT template",
  unknown: "Unrecognized CSV",
}

export function detectFormat(rows: string[][]): ImportFormat {
  if (rows.length === 0) return "unknown"
  const header = rows[0].map((h) => h.toLowerCase())
  const has = (...names: string[]) => names.every((n) => header.some((h) => h.includes(n)))

  if (has("food") && (has("calorie") || has("meal"))) return "myfitnesspal"
  if (header[0] === "day" && (has("calorie") || has("type"))) return "ascendant"

  // Google Takeout weight/steps CSVs usually have no header and 2+ columns,
  // first column a long JS-style date string.
  const sample = rows.find((r) => r.length >= 2) ?? rows[0]
  if (sample.length >= 2 && normalizeDay(sample[0]) !== null && num(sample[1]) !== null) {
    return "google-takeout"
  }
  // Takeout "Daily aggregation" style with headers mentioning step count
  if (has("step")) return "google-takeout"
  if (has("weight")) return "google-takeout"
  return "unknown"
}

// ─── Row extraction ────────────────────────────────────────────────────────────

const MEALS = ["breakfast", "lunch", "dinner", "snack"]

const METRIC_RANGES: Record<string, { min: number; max: number }> = {
  weight: { min: 25, max: 300 },
  chest: { min: 20, max: 250 },
  neck: { min: 20, max: 80 },
  waist: { min: 20, max: 250 },
  hips: { min: 20, max: 250 },
  arm: { min: 20, max: 250 },
  thigh: { min: 20, max: 250 },
  calf: { min: 20, max: 250 },
  sleep: { min: 0, max: 16 },
  restingHr: { min: 30, max: 120 },
  steps: { min: 0, max: 60000 },
  heartPoints: { min: 0, max: 500 },
}

/** Finds a column index whose header contains `frag` (case-insensitive). */
function col(header: string[], frag: string): number {
  const lower = header.map((h) => h.toLowerCase())
  return lower.findIndex((h) => h.includes(frag))
}

/** Metric type inference for Takeout-style single-value rows. */
function inferMetricType(header: string[], fallback: string): string {
  const joined = header.join(" ").toLowerCase()
  if (joined.includes("step")) return "steps"
  if (joined.includes("heart point") || joined.includes("heart point")) return "heartPoints"
  if (joined.includes("weight") || joined.includes("kg")) return "weight"
  return fallback
}

export type ParsedImport = {
  format: ImportFormat
  rows: ImportRow[]
  totalRows: number
  skippedRows: number
}

export function parseImport(text: string): ParsedImport {
  const raw = parseCsv(text)
  const format = detectFormat(raw)
  const rows: ImportRow[] = []
  let totalRows = 0
  let skippedRows = 0

  if (format === "myfitnesspal") {
    const header = raw[0].map((h) => h.toLowerCase())
    const iDate = col(header, "date")
    const iMeal = col(header, "meal")
    const iFood = col(header, "food")
    const iQty = col(header, "qty") !== -1 ? col(header, "qty") : col(header, "quantity")
    const iUnit = col(header, "unit")
    const iCal = col(header, "calorie")
    const iProtein = col(header, "protein")
    const iCarbs = col(header, "carbs") !== -1 ? col(header, "carbs") : col(header, "carbohydrate")
    const iFat = col(header, "fat")

    for (const r of raw.slice(1)) {
      totalRows++
      const day = normalizeDay(r[iDate] ?? "")
      const name = (r[iFood] ?? "").trim()
      const calories = num(r[iCal])
      if (!day || !name || calories === null || calories < 0 || calories > 5000) {
        skippedRows++
        continue
      }
      const meal = MEALS.includes((r[iMeal] ?? "").toLowerCase()) ? (r[iMeal] ?? "").toLowerCase() : "snack"
      rows.push({
        day,
        target: "food",
        metricType: null,
        name,
        qty: num(r[iQty]) ?? 1,
        unit: (r[iUnit] ?? "serving").trim() || "serving",
        calories: Math.round(calories * 10) / 10,
        protein: clampMacro(num(r[iProtein])),
        carbs: clampMacro(num(r[iCarbs])),
        fat: clampMacro(num(r[iFat])),
      })
    }
  } else if (format === "ascendant") {
    const header = raw[0].map((h) => h.toLowerCase())
    const iDay = 0
    const iType = col(header, "type")
    const iName = col(header, "name")
    const iQty = col(header, "qty")
    const iUnit = col(header, "unit")
    const iCal = col(header, "calorie")
    const iProtein = col(header, "protein")
    const iCarbs = col(header, "carbs")
    const iFat = col(header, "fat")

    for (const r of raw.slice(1)) {
      totalRows++
      const day = normalizeDay(r[iDay] ?? "")
      const type = (r[iType] ?? "").toLowerCase().trim()
      if (!day || !type) {
        skippedRows++
        continue
      }

      if (type === "water") {
        const ml = num(r[iQty])
        if (ml === null || ml <= 0 || ml > 10000) {
          skippedRows++
          continue
        }
        rows.push({
          day,
          target: "water",
          metricType: null,
          name: "Water",
          qty: Math.round(ml),
          unit: "ml",
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
        })
      } else if (type.startsWith("metric:")) {
        const metricType = type.slice(7).trim()
        const value = num(r[iQty])
        const range = METRIC_RANGES[metricType]
        if (!range || value === null || value < range.min || value > range.max) {
          skippedRows++
          continue
        }
        const def = METRIC_TYPES.find((m) => m.id === metricType)
        rows.push({
          day,
          target: "metric",
          metricType,
          name: def?.label ?? metricType,
          qty: Math.round(value * 10) / 10,
          unit: def?.unit ?? "",
          calories: null,
          protein: null,
          carbs: null,
          fat: null,
        })
      } else {
        // food[:meal]
        const meal = MEALS.includes(type.replace("food:", "")) ? type.replace("food:", "") : "snack"
        const name = (r[iName] ?? "").trim()
        const calories = num(r[iCal])
        if (!name || calories === null || calories < 0 || calories > 5000) {
          skippedRows++
          continue
        }
        rows.push({
          day,
          target: "food",
          metricType: null,
          name,
          qty: num(r[iQty]) ?? 1,
          unit: (r[iUnit] ?? "serving").trim() || "serving",
          calories: Math.round(calories * 10) / 10,
          protein: clampMacro(num(r[iProtein])),
          carbs: clampMacro(num(r[iCarbs])),
          fat: clampMacro(num(r[iFat])),
        })
      }
    }
  } else if (format === "google-takeout") {
    // Either headerless 2-col (date, value) or daily-aggregation with headers
    const first = raw[0]
    const headerized = normalizeDay(first[0] ?? "") === null || num(first[1] ?? "") === null
    const header = headerized ? first.map((h) => h.toLowerCase()) : []
    const body = headerized ? raw.slice(1) : raw
    const metricType = inferMetricType(header, "weight")

    for (const r of body) {
      totalRows++
      const day = normalizeDay(r[0] ?? "")
      const value = num(r[1])
      const range = METRIC_RANGES[metricType]
      if (!day || value === null || !range || value < range.min || value > range.max) {
        skippedRows++
        continue
      }
      const def = METRIC_TYPES.find((m) => m.id === metricType)
      rows.push({
        day,
        target: "metric",
        metricType,
        name: def?.label ?? metricType,
        qty: Math.round(value * 10) / 10,
        unit: def?.unit ?? "",
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
      })
    }
  } else {
    return { format: "unknown", rows: [], totalRows: 0, skippedRows: 0 }
  }

  return { format, rows, totalRows, skippedRows }
}

function clampMacro(v: number | null): number | null {
  if (v === null || v < 0) return v === null ? null : 0
  return Math.round(Math.min(v, 500) * 10) / 10
}

// ─── Applying to the database ──────────────────────────────────────────────────

export async function applyImport(hunterId: string, rows: ImportRow[]): Promise<{
  inserted: { foodLogs: number; waterLogs: number; metrics: number }
  daysTouched: number
}> {
  const food = rows.filter((r) => r.target === "food")
  const water = rows.filter((r) => r.target === "water")
  const metrics = rows.filter((r) => r.target === "metric")

  if (food.length > 0) {
    await db.nutritionLog.createMany({
      data: food.map((r) => ({
        hunterId,
        day: r.day,
        mealType: "snack",
        name: r.name.slice(0, 120),
        qty: r.qty ?? 1,
        unit: (r.unit ?? "serving").slice(0, 40),
        calories: r.calories ?? 0,
        protein: r.protein ?? 0,
        carbs: r.carbs ?? 0,
        fat: r.fat ?? 0,
      })),
    })
  }

  if (water.length > 0) {
    await db.waterLog.createMany({
      data: water.map((r) => ({ hunterId, day: r.day, ml: Math.round(r.qty ?? 0) })),
    })
  }

  // Metrics upsert per (day, type) — latest row in file order wins
  let metricCount = 0
  const byKey = new Map<string, ImportRow>()
  for (const r of metrics) {
    byKey.set(`${r.day}|${r.metricType}`, r)
  }
  for (const r of byKey.values()) {
    const def = METRIC_TYPES.find((m) => m.id === r.metricType)
    await db.bodyMetric.upsert({
      where: {
        hunterId_day_type: { hunterId, day: r.day, type: r.metricType ?? "" },
      },
      create: { hunterId, day: r.day, type: r.metricType ?? "", unit: def?.unit ?? "", value: r.qty ?? 0 },
      update: { value: r.qty ?? 0, unit: def?.unit ?? "" },
    })
    metricCount++
    // Imported weights flow back into the profile when they are the newest
    if (r.metricType === "weight") {
      const latest = await db.bodyMetric.findFirst({
        where: { hunterId, type: "weight" },
        orderBy: [{ day: "desc" }, { updatedAt: "desc" }],
      })
      if (latest && latest.day === r.day) {
        await db.hunter.update({ where: { id: hunterId }, data: { weightKg: latest.value } })
      }
    }
  }

  const days = new Set(rows.map((r) => r.day))
  return {
    inserted: { foodLogs: food.length, waterLogs: water.length, metrics: metricCount },
    daysTouched: days.size,
  }
}

// ─── Template for GET /api/import ──────────────────────────────────────────────

export const IMPORT_TEMPLATE = `day,type,name,qty,unit,calories,protein,carbs,fat
2026-01-05,food:breakfast,Oats with milk,1,bowl,389,13.2,56.1,6.9
2026-01-05,food:lunch,Chicken rice bowl,1,bowl,620,42.0,68.0,16.5
2026-01-05,water,Water,2000,ml,,,,
2026-01-05,metric:weight,Weight,72.5,kg,,,,
2026-01-05,metric:steps,Steps,8400,steps,,,,
2026-01-06,metric:sleep,Sleep,7.5,h,,,,`

export function importSummary(parsed: ParsedImport, previewCount = 10): ImportSummary {
  return {
    format: parsed.format,
    formatLabel: FORMAT_LABELS[parsed.format],
    totalRows: parsed.totalRows,
    validRows: parsed.rows.length,
    skippedRows: parsed.skippedRows,
    preview: parsed.rows.slice(0, previewCount),
    inserted: null,
    daysTouched: null,
  }
}
