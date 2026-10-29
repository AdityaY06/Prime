import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { METRIC_TYPES } from "@/lib/nutrition"

export const dynamic = "force-dynamic"

// ─── /api/export?type=… — RFC 4180 CSV extracts ───────────────────────────────
// GET → spreadsheet-ready archive of one dataset per call:
//   vitals | tests | body | sessions | logs | nutrition
// Output is UTF-8 with a BOM + CRLF records so Excel opens it cleanly.

type CsvRow = Record<string, unknown>

// ── pure serializer ───────────────────────────────────────────────────────────

/** RFC 4180 field escaping — quotes wrap fields holding commas/quotes/CRLF, "" escapes a quote. */
function escapeField(value: unknown): string {
  let raw: string
  if (value === null || value === undefined) raw = ""
  else if (value instanceof Date) raw = value.toISOString()
  else raw = String(value)
  return /["\r\n,]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

/**
 * Pure CSV serializer (RFC 4180): header row + one CRLF-terminated record per row.
 * `columns` pins the header order and guarantees a valid header-only file when
 * rows are empty; when omitted, columns fall back to the union of row keys in
 * first-seen order.
 */
export function toCsv(rows: CsvRow[], columns?: string[]): string {
  const cols =
    columns ??
    Array.from(
      rows.reduce<Set<string>>((acc, row) => {
        for (const key of Object.keys(row)) acc.add(key)
        return acc
      }, new Set<string>())
    )
  const records = [cols.map(escapeField).join(",")]
  for (const row of rows) records.push(cols.map((col) => escapeField(row[col])).join(","))
  return `${records.join("\r\n")}\r\n`
}

// ── shared helpers ────────────────────────────────────────────────────────────

/** "yyyy-mm-dd" in local time — same semantics as dayKey() in lib/game. */
function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// human labels for BodyMetric types — "Resting HR (bpm)" style
const METRIC_LABELS: Record<string, string> = {}
for (const m of METRIC_TYPES) METRIC_LABELS[m.id] = `${m.label} (${m.unit})`
// vitals that predate METRIC_TYPES (kept for legacy rows)
METRIC_LABELS.temp = "Body temp (°C)"

const VITAL_TYPES = ["restingHr", "spo2", "hrv", "bpSystolic", "bpDiastolic", "stress", "mood", "energy", "temp", "sleep"]
const TEST_TYPES = ["vo2max", "pushupReps", "plankSec", "sitReachCm"]
const BODY_TYPES = ["weight", "chest", "waist", "hips", "arm", "thigh", "calf"]

// ── dataset definitions ───────────────────────────────────────────────────────

type ExportSpec = {
  columns: string[]
  load: (hunterId: string) => Promise<CsvRow[]>
}

function metricRows(hunterId: string, types: string[]): Promise<CsvRow[]> {
  return db.bodyMetric
    .findMany({ where: { hunterId, type: { in: types } }, orderBy: [{ day: "asc" }, { type: "asc" }] })
    .then((rows) =>
      rows.map((m) => ({
        date: m.day,
        metric: METRIC_LABELS[m.type] ?? m.type,
        value: m.value,
        unit: m.unit,
      }))
    )
}

const EXPORTS: Record<string, ExportSpec> = {
  vitals: {
    columns: ["date", "metric", "value", "unit"],
    load: (hunterId) => metricRows(hunterId, VITAL_TYPES),
  },
  tests: {
    columns: ["date", "metric", "value", "unit"],
    load: (hunterId) => metricRows(hunterId, TEST_TYPES),
  },
  body: {
    columns: ["date", "metric", "value", "unit"],
    load: (hunterId) => metricRows(hunterId, BODY_TYPES),
  },
  sessions: {
    columns: ["date", "gate", "duration_min", "volume_kg", "xp", "prs", "status"],
    load: (hunterId) =>
      db.workoutSession
        .findMany({ where: { hunterId }, orderBy: [{ startedAt: "asc" }] })
        .then((rows) =>
          rows.map((s) => ({
            date: localYmd(s.startedAt),
            gate: s.gateName,
            duration_min: s.durationMin,
            volume_kg: s.volumeKg,
            xp: s.xpEarned,
            prs: s.prCount,
            status: s.status,
          }))
        ),
  },
  logs: {
    // reps for strength/bodyweight work, duration_min for cardio/mobility blocks
    columns: ["date", "gate", "exercise", "type", "sets", "reps", "duration_min", "weight_kg", "xp"],
    load: async (hunterId) => {
      const rows = await db.exerciseLog.findMany({ where: { session: { hunterId } }, include: { session: true } })
      rows.sort(
        (a, b) =>
          a.session.startedAt.getTime() - b.session.startedAt.getTime() ||
          a.createdAt.getTime() - b.createdAt.getTime()
      )
      return rows.map((l) => ({
        date: localYmd(l.session.startedAt),
        gate: l.session.gateName,
        exercise: l.name,
        type: l.type,
        sets: l.sets,
        reps: l.reps,
        duration_min: l.durationMin,
        weight_kg: l.weightKg,
        xp: l.xpValue,
      }))
    },
  },
  nutrition: {
    columns: ["date", "meal", "food", "qty", "unit", "kcal", "protein", "carbs", "fat"],
    load: (hunterId) =>
      db.nutritionLog
        .findMany({ where: { hunterId }, orderBy: [{ day: "asc" }, { createdAt: "asc" }] })
        .then((rows) =>
          rows.map((n) => ({
            date: n.day,
            meal: n.mealType,
            food: n.name,
            qty: n.qty,
            unit: n.unit,
            kcal: n.calories,
            protein: n.protein,
            carbs: n.carbs,
            fat: n.fat,
          }))
        ),
  },
}

// ── GET /api/export?type=… ────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const type = new URL(req.url).searchParams.get("type") ?? ""
    const spec = EXPORTS[type]
    if (!spec) {
      return NextResponse.json({ error: "UNKNOWN_TYPE", allowed: Object.keys(EXPORTS) }, { status: 400 })
    }

    const hunter = await requireHunter()
    const rows = await spec.load(hunter.id)
    const csv = `\uFEFF${toCsv(rows, spec.columns)}` // BOM so Excel detects UTF-8

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ascendant-${type}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/export", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
