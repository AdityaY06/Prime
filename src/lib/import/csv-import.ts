// ─── PRIME · CSV import engine (R21-a — the bridge is two-way) ────────────────
// The mirror of lib/export/csv.ts: Strong/Hevy/PRIME workout CSV parsed back
// into PRIME sessions. Every function here is PURE (zero DOM, zero DB) so
// scratch QA scripts can exercise every tokenizer/aggregation/skip path; the
// only consumer that touches state is the /api/import/sessions route.
//
// DOCUMENTED CONVENTIONS (decided once, honored everywhere):
// - Tokenizer: RFC 4180 — quoted cells, doubled inner quotes, delimiters and
//   raw newlines inside quotes, LF and CRLF row endings, BOM tolerance. The
//   exact inverse of export/csv.ts's csvEscape, so PRIME's own archive export
//   re-imports losslessly (round-trip is the guaranteed path).
// - Delimiter: sniffed from the header line (comma vs semicolon — Hevy
//   exports are ";"-delimited). Counts are taken OUTSIDE quotes.
// - Header: normalized (lowercase, units/parens stripped, periods dropped)
//   then matched against an explicit alias table. Required minimum to
//   proceed: DATE + WORKOUT NAME + EXERCISE NAME + (REPS or DURATION);
//   everything else is optional with honest defaults.
// - Per-set rows: when a Set Order column exists, each row is ONE set and
//   CONSECUTIVE rows with identical (exercise, type, weight, reps, rir)
//   collapse into a single PRIME log with sets = row count (PRIME's log
//   model is sets×reps×weight per log). Without Set Order each row is one
//   log and the Sets column is honored (default 1).
// - Grouping: rows group into workouts by (parsed date, workout name) in
//   file order — one workout = one future session.
// - Dates: ISO 8601 (PRIME export), "YYYY-MM-DD HH:mm:ss" and bare
//   "YYYY-MM-DD" (Strong), and MM/DD/YYYY with optional hh·mm·ss + AM|PM
//   fallbacks.
//   Zone-less timestamps are read as LOCAL wall time (Strong's convention);
//   unparseable dates skip the row with a reason.
// - Weights: read as KILOGRAMS — PRIME is kg-native. A "(lb)" header is
//   accepted (units are stripped) but no silent conversion is invented.
// - Volume / Est. 1RM columns: accepted and ignored — the app recomputes
//   both from the log model (never trusts derived cells on the way in).
// - Distance columns: accepted (header validation passes) and not stored —
//   PRIME has no distance field. Honesty over fabrication.
// - XP: a numeric XP cell wins (PRIME round-trip fidelity); otherwise the
//   REAL engine formula (lib/game.ts exerciseXp with the live hunter's
//   stats — reuse, never reinvent).
// - Line numbers: `line` is the CSV row ordinal (header = line 1, first
//   data row = line 2). Rows with newlines inside quoted cells still count
//   as one row — the ordinal is what the user can navigate to.

import { exerciseXp, sessionVolume, type ExerciseType, type StatKey } from "@/lib/game"

// ── types ─────────────────────────────────────────────────────────────────────

export type HunterStats = Record<StatKey, number>

/** One PRIME exercise log built from CSV rows. */
export type ImportedLog = {
  name: string
  type: ExerciseType
  sets: number
  reps: number
  weightKg: number
  durationMin: number
  rir: number | null
  notes: string | null
  xpValue: number
}

/** One future PRIME session: a (date, workout name) group of logs. */
export type ImportedWorkout = {
  startedAt: string // ISO 8601
  gateName: string
  /** CSV row ordinal of the workout's first row (header = line 1). */
  line: number
  /** Session-level minutes from a "Workout Duration" column, when present. */
  durationHintMin: number | null
  logs: ImportedLog[]
}

export type SkippedRow = { line: number; reason: string }

export type ParsedImport = {
  workouts: ImportedWorkout[]
  skipped: SkippedRow[]
}

export type ImportTotals = {
  workouts: number
  logs: number
  sets: number
  volumeKg: number
  estXp: number
  skippedRows: number
}

/** Fatal file-level problem (missing required columns, empty file). */
export class ImportParseError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

// ── tokenizer (RFC 4180) ──────────────────────────────────────────────────────

/** Parse raw CSV text into rows of cells. Pure inverse of csvEscape. */
export function parseCsvTable(text: string, delimiter: string): string[][] {
  const src = text.startsWith("\uFEFF") ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"' // doubled quote → literal
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c // delimiters/newlines inside quotes are cell content
      }
      continue
    }
    if (c === '"') {
      if (cell === "") inQuotes = true
      else cell += '"' // lenient: stray quote mid-cell stays literal
      continue
    }
    if (c === delimiter) {
      row.push(cell)
      cell = ""
      continue
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++ // CRLF tolerance
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }
    cell += c
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** Delimiter sniff on the header line: semicolon only when it outnumbers
 *  commas outside quotes (Hevy exports are ";"-delimited). */
export function sniffDelimiter(text: string): string {
  const src = text.startsWith("\uFEFF") ? text.slice(1) : text
  const nl = src.search(/\r?\n/)
  const header = nl === -1 ? src : src.slice(0, nl)
  let commas = 0
  let semis = 0
  let inQuotes = false
  for (const ch of header) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === ",") commas++
    else if (!inQuotes && ch === ";") semis++
  }
  return semis > commas ? ";" : ","
}

// ── header normalization + alias table ────────────────────────────────────────

type Canonical =
  | "date"
  | "workoutName"
  | "exerciseName"
  | "category"
  | "sets"
  | "reps"
  | "weight"
  | "durationMin"
  | "durationSec"
  | "workoutDurationMin"
  | "workoutDurationSec"
  | "rir"
  | "rpe"
  | "notes"
  | "xp"
  | "setOrder"
  | "distance"
  | "ignored"

/** lowercase · strip unit parens · drop periods · collapse whitespace. */
function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Unit text inside the FIRST parenthesized group ("(kg)" → "kg"). */
function parenUnit(raw: string): string {
  const m = raw.toLowerCase().match(/\(([^)]*)\)/)
  return m ? m[1].trim() : ""
}

const SECONDS_UNIT = /^(s|sec|secs|second|seconds)$/

/** Resolve one raw header cell to a canonical column (or null = unknown). */
function resolveColumn(raw: string): Canonical | null {
  const unit = parenUnit(raw)
  const h = normalizeHeader(raw)
  if (!h) return null
  switch (h) {
    case "date":
    case "workout date":
    case "start date":
    case "date time":
    case "datetime":
    case "timestamp":
    case "workout start":
    case "day":
      return "date"
    case "workout name":
    case "workout":
    case "workout title":
    case "session name":
    case "routine":
    case "routine name":
    case "session":
      return "workoutName"
    case "exercise name":
    case "exercise":
    case "exercise title":
    case "movement":
      return "exerciseName"
    case "category":
    case "equipment":
    case "exercise category":
    case "type":
      return "category"
    case "sets":
    case "set count":
      return "sets"
    case "set order":
    case "set":
    case "set no":
    case "set number":
    case "set #":
      return "setOrder"
    case "reps":
    case "repetitions":
    case "rep":
    case "rep count":
      return "reps"
    case "weight":
    case "weight kg":
    case "kg":
    case "load":
    case "resistance":
      return "weight"
    case "duration":
    case "duration min":
    case "minutes":
    case "time":
      return SECONDS_UNIT.test(unit) ? "durationSec" : "durationMin"
    case "seconds":
    case "secs":
    case "sec":
    case "duration s":
      return "durationSec"
    case "workout duration":
    case "workout duration min":
    case "workout time":
    case "session duration":
    case "total duration":
      return SECONDS_UNIT.test(unit) ? "workoutDurationSec" : "workoutDurationMin"
    case "rir":
    case "reps in reserve":
      return "rir"
    case "rpe":
      return "rpe"
    case "notes":
    case "note":
    case "comment":
    case "comments":
    case "set notes":
    case "exercise notes":
      return "notes"
    case "xp":
    case "xp value":
    case "xp earned":
    case "xp gained":
      return "xp"
    case "distance":
    case "distance km":
    case "distance m":
    case "dist":
      return "distance" // accepted · not stored (no PRIME field — honest)
    case "volume":
    case "volume kg":
    case "est 1rm":
    case "1rm":
    case "estimated 1rm":
    case "e1rm":
      return "ignored" // accepted · recomputed by the app, never trusted
  }
  return null
}

/** Build the canonical → column-index map (first occurrence wins). */
function resolveColumns(headerCells: string[]): Map<Canonical, number> {
  const map = new Map<Canonical, number>()
  headerCells.forEach((raw, i) => {
    const c = resolveColumn(raw)
    if (c && !map.has(c)) map.set(c, i)
  })
  return map
}

// ── date parsing ──────────────────────────────────────────────────────────────

const DATE_ISO =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?\s*(Z|[+-]\d{2}:?\d{2})?$/
const DATE_BARE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?$/i

function plausibleDate(d: Date): Date | null {
  const t = d.getTime()
  if (Number.isNaN(t)) return null
  const y = d.getFullYear()
  return y >= 1900 && y <= 2099 ? d : null
}

/**
 * ISO 8601 (PRIME export) · "YYYY-MM-DD HH:mm:ss" · bare "YYYY-MM-DD" ·
 * MM/DD/YYYY (optional hh·mm·ss + AM|PM). Zone-less values are LOCAL wall time
 * (Strong's convention). Returns null when unparseable — callers skip with
 * an honest reason, never guess.
 */
export function parseCsvDate(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  let m = DATE_ISO.exec(s)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    const hh = Number(m[4])
    const mi = Number(m[5])
    const ss = m[6] ? Number(m[6]) : 0
    const ms = m[7] ? Number(m[7].padEnd(3, "0")) : 0
    const zone = m[8]
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 59) return null
    if (zone === "Z") return plausibleDate(new Date(Date.UTC(y, mo - 1, d, hh, mi, ss, ms)))
    if (zone) {
      const zm = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)
      if (!zm) return null
      const offMin = (Number(zm[2]) * 60 + Number(zm[3])) * (zm[1] === "-" ? -1 : 1)
      return plausibleDate(new Date(Date.UTC(y, mo - 1, d, hh, mi, ss, ms) - offMin * 60000))
    }
    return plausibleDate(new Date(y, mo - 1, d, hh, mi, ss, ms))
  }
  m = DATE_BARE.exec(s)
  if (m) {
    const mo = Number(m[2])
    const d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return plausibleDate(new Date(Number(m[1]), mo - 1, d))
  }
  m = DATE_US.exec(s)
  if (m) {
    const mo = Number(m[1])
    const d = Number(m[2])
    let hh = m[4] !== undefined ? Number(m[4]) : 0
    const mi = m[5] !== undefined ? Number(m[5]) : 0
    const ss = m[6] ? Number(m[6]) : 0
    const ampm = m[7]?.toUpperCase()
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 59) return null
    if (ampm === "PM" && hh < 12) hh += 12
    if (ampm === "AM" && hh === 12) hh = 0
    return plausibleDate(new Date(Number(m[3]), mo - 1, d, hh, mi, ss))
  }
  return null
}

// ── cell coercion + category mapping ──────────────────────────────────────────

/** Numeric cell → number | null. Empty/dash = absent. A decimal comma
 *  ("1,5" — the "; " delimiter convention) is normalized. Garbage → null. */
function numCell(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const s = raw.trim()
  if (s === "" || s === "-" || s === "–" || s === "—") return null
  const norm = /^-?\d+,\d+$/.test(s) ? s.replace(",", ".") : s
  const n = Number(norm)
  return Number.isFinite(n) ? n : null
}

/** Category cell → PRIME type. PRIME's own CSV carries the type verbatim;
 *  Strong/Hevy carry an equipment-ish category — a small honest keyword map
 *  with bodyweight as the documented default. */
function categoryToType(cell: string): ExerciseType {
  const s = cell.trim().toLowerCase()
  if (s === "strength" || s === "bodyweight" || s === "cardio" || s === "mobility") return s
  const STRENGTH = ["barbell", "dumbbell", "kettlebell", "machine", "cable", "smith", "plate", "lever", "band", "weighted", "trap", "olympic", "free weight", "sled", "ez"]
  const BODYWEIGHT = ["bodyweight", "assisted", "calisthenic", "gymnastic", "trx"]
  const CARDIO = ["cardio", "treadmill", "run", "bike", "cycling", "cycle", "rower", "rowing", "elliptical", "swim", "jump rope", "skipping", "ski", "paddle", "walk", "hike", "stepper"]
  const MOBILITY = ["stretch", "mobility", "yoga", "foam", "flexib", "warm", "cool", "pilates"]
  if (STRENGTH.some((w) => s.includes(w))) return "strength"
  if (BODYWEIGHT.some((w) => s.includes(w))) return "bodyweight"
  if (CARDIO.some((w) => s.includes(w))) return "cardio"
  if (MOBILITY.some((w) => s.includes(w))) return "mobility"
  return "bodyweight"
}

/** RIR: direct cell, else RPE → 10 − RPE (RPE 10 = nothing left). Clamped 0–5. */
function resolveRir(rirRaw: string | undefined, rpeRaw: string | undefined): number | null {
  const rir = numCell(rirRaw)
  if (rir !== null) return Math.max(0, Math.min(5, Math.round(rir)))
  const rpe = numCell(rpeRaw)
  if (rpe !== null) return Math.max(0, Math.min(5, 10 - Math.round(rpe)))
  return null
}

// ── sanitization bounds (vault-precedent clamps) ──────────────────────────────

const MAX_NAME = 60
const MAX_NOTES = 300
const MAX_SETS = 50
const MAX_REPS = 2000
const MAX_WEIGHT = 1000
const MAX_DURATION = 300
/** Honest session name for Hevy-style files with no Workout Name column. */
const DEFAULT_WORKOUT_NAME = "Imported Workout"

// ── row-level shape (pre-aggregation) ─────────────────────────────────────────

type RawSetRow = {
  line: number
  name: string
  type: ExerciseType
  sets: number | null // Sets cell — null in per-set files
  reps: number
  weightKg: number
  durationMin: number // normalized to minutes
  rir: number | null
  notes: string | null
  xp: number | null // numeric XP cell when present
  workoutDurationMin: number | null // session-level hint (minutes)
}

type WorkoutBuilder = {
  startedAt: Date
  gateName: string
  line: number
  durationHintMin: number | null
  rows: RawSetRow[]
}

// ── main parser ───────────────────────────────────────────────────────────────

const DEFAULT_STATS: HunterStats = { str: 12, vit: 12, endur: 12, agi: 12, flex: 12 }

/**
 * Parse a Strong/Hevy/PRIME workout CSV into future PRIME sessions.
 * `stats` feed the real exerciseXp engine when a row carries no XP cell —
 * the route always passes the live hunter's stats; the default exists for
 * pure scratch tests only.
 */
export function parseWorkoutCsv(csv: string, opts: { stats?: HunterStats } = {}): ParsedImport {
  const stats = opts.stats ?? DEFAULT_STATS
  const text = csv.startsWith("\uFEFF") ? csv.slice(1) : csv
  if (!text.trim()) throw new ImportParseError("EMPTY FILE — NO ROWS")

  const delimiter = sniffDelimiter(text)
  const rows = parseCsvTable(text, delimiter)
  if (rows.length === 0) throw new ImportParseError("EMPTY FILE — NO ROWS")

  const map = resolveColumns(rows[0])
  // WORKOUT NAME is deliberately NOT required — real Hevy exports carry no
  // workout-name column at all (they group sessions by Date); those files
  // get the honest default name below. DATE / EXERCISE NAME / effort are
  // the true irreducibles.
  const required: string[] = []
  if (!map.has("date")) required.push("DATE")
  if (!map.has("exerciseName")) required.push("EXERCISE NAME")
  if (!map.has("reps") && !map.has("durationMin") && !map.has("durationSec")) required.push("REPS OR DURATION")
  if (required.length > 0) {
    throw new ImportParseError(
      `HEADER MISSING REQUIRED COLUMNS — ${required.join(", ")} NOT FOUND (NEEDED: DATE, EXERCISE NAME, REPS OR DURATION — WORKOUT NAME IS OPTIONAL, HEVY FILES DEFAULT IT)`,
    )
  }

  const hasSetOrder = map.has("setOrder")
  const skipped: SkippedRow[] = []
  const groups = new Map<string, WorkoutBuilder>()

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1 // header = line 1
    const cells = rows[i]
    if (cells.every((c) => c.trim() === "")) continue // blank line — formatting, not data

    const cell = (c: Canonical) => (map.has(c) ? cells[map.get(c)!] : undefined)

    const date = parseCsvDate(cell("date") ?? "")
    if (!date) {
      skipped.push({ line, reason: `BAD DATE — ${quote((cell("date") ?? "").trim().slice(0, 24))}` })
      continue
    }
    // workout name: column present → cell must be non-empty (an empty cell in
    // a named column is row corruption → honest skip); column ABSENT (Hevy)
    // → the documented default, so same-date rows still group into a session
    const hasNameColumn = map.has("workoutName")
    const gateName =
      hasNameColumn
        ? (cell("workoutName") ?? "").trim()
        : DEFAULT_WORKOUT_NAME
    if (!gateName) {
      skipped.push({ line, reason: "EMPTY WORKOUT NAME" })
      continue
    }
    const name = (cell("exerciseName") ?? "").trim()
    if (!name) {
      skipped.push({ line, reason: "EMPTY EXERCISE NAME" })
      continue
    }

    // effort columns — garbage numbers skip the row honestly
    const rawReps = cell("reps")
    const repsN = numCell(rawReps)
    if (repsN === null && rawReps !== undefined && rawReps.trim() !== "") {
      skipped.push({ line, reason: `UNPARSABLE REPS — ${quote(rawReps.trim().slice(0, 16))}` })
      continue
    }
    const rawWeight = cell("weight")
    const weightN = numCell(rawWeight)
    if (weightN === null && rawWeight !== undefined && rawWeight.trim() !== "") {
      skipped.push({ line, reason: `UNPARSABLE WEIGHT — ${quote(rawWeight.trim().slice(0, 16))}` })
      continue
    }
    const rawDurMin = cell("durationMin")
    const durMinN = numCell(rawDurMin)
    if (durMinN === null && rawDurMin !== undefined && rawDurMin.trim() !== "") {
      skipped.push({ line, reason: `UNPARSABLE DURATION — ${quote(rawDurMin.trim().slice(0, 16))}` })
      continue
    }
    const rawDurSec = cell("durationSec")
    const durSecN = numCell(rawDurSec)
    if (durSecN === null && rawDurSec !== undefined && rawDurSec.trim() !== "") {
      skipped.push({ line, reason: `UNPARSABLE DURATION — ${quote(rawDurSec.trim().slice(0, 16))}` })
      continue
    }
    const rawSets = cell("sets")
    const setsN = numCell(rawSets)
    if (setsN === null && rawSets !== undefined && rawSets.trim() !== "") {
      skipped.push({ line, reason: `UNPARSABLE SETS — ${quote(rawSets.trim().slice(0, 16))}` })
      continue
    }

    const reps = repsN ?? 0
    const weightKg = weightN ?? 0
    const durationMin = Math.round((durMinN ?? 0) + (durSecN ?? 0) / 60)
    const sets = setsN // null in per-set mode (each row IS one set)

    if (reps < 0) {
      skipped.push({ line, reason: `NEGATIVE REPS — ${reps}` })
      continue
    }
    if (weightKg < 0) {
      skipped.push({ line, reason: `NEGATIVE WEIGHT — ${weightKg}` })
      continue
    }
    if (durationMin < 0) {
      skipped.push({ line, reason: `NEGATIVE DURATION — ${durationMin}` })
      continue
    }
    if (reps === 0 && durationMin === 0) {
      skipped.push({ line, reason: "NO REPS OR DURATION" })
      continue
    }

    // type: Category column (PRIME verbatim / Strong-Hevy keyword map), else
    // honest shape inference — loaded → strength, repped → bodyweight,
    // duration-only → cardio (a bodyweight log with zero reps would be an
    // invalid shape in the app's own add-log validation)
    const rawCategory = cell("category")
    const type: ExerciseType =
      rawCategory !== undefined && rawCategory.trim() !== ""
        ? categoryToType(rawCategory)
        : weightKg > 0
          ? "strength"
          : reps > 0
            ? "bodyweight"
            : "cardio"

    const rawNotes = cell("notes")
    const notes = rawNotes !== undefined && rawNotes.trim() !== "" ? rawNotes.trim() : null

    const rawHintMin = cell("workoutDurationMin")
    const rawHintSec = cell("workoutDurationSec")
    const hintMinN = numCell(rawHintMin)
    const hintSecN = numCell(rawHintSec)
    const hintRaw =
      hintMinN !== null ? hintMinN : hintSecN !== null ? Math.round(hintSecN / 60) : null
    const hint = hintRaw !== null && hintRaw > 0 ? Math.min(MAX_DURATION, hintRaw) : null

    const xpN = numCell(cell("xp"))

    const row: RawSetRow = {
      line,
      name: name.slice(0, MAX_NAME),
      type,
      sets: sets === null ? null : Math.max(1, Math.min(MAX_SETS, Math.round(sets))),
      reps: Math.max(0, Math.min(MAX_REPS, Math.round(reps))),
      weightKg: Math.max(0, Math.min(MAX_WEIGHT, weightKg)),
      durationMin: Math.max(0, Math.min(MAX_DURATION, durationMin)),
      rir: resolveRir(cell("rir"), cell("rpe")),
      notes: notes ? notes.slice(0, MAX_NOTES) : null,
      xp: xpN !== null ? Math.max(0, Math.round(xpN)) : null,
      workoutDurationMin: hint,
    }

    const key = `${date.getTime()}\u0000${gateName.toLowerCase()}`
    let builder = groups.get(key)
    if (!builder) {
      builder = { startedAt: date, gateName, line, durationHintMin: null, rows: [] }
      groups.set(key, builder)
    }
    if (builder.durationHintMin === null && row.workoutDurationMin !== null) {
      builder.durationHintMin = row.workoutDurationMin
    }
    builder.rows.push(row)
  }

  const workouts: ImportedWorkout[] = []
  for (const b of groups.values()) {
    workouts.push({
      startedAt: b.startedAt.toISOString(),
      gateName: b.gateName.slice(0, MAX_NAME),
      line: b.line,
      durationHintMin: b.durationHintMin,
      logs: collapseLogs(b.rows, hasSetOrder, stats),
    })
  }
  return { workouts, skipped }
}

function quote(s: string): string {
  return s === "" ? "(EMPTY)" : `"${s}"`
}

/** Collapse raw rows into PRIME logs (per-set aggregation or row-per-log). */
function collapseLogs(rows: RawSetRow[], hasSetOrder: boolean, stats: HunterStats): ImportedLog[] {
  const logs: ImportedLog[] = []

  const sanitize = (
    name: string,
    type: ExerciseType,
    sets: number,
    reps: number,
    weightKg: number,
    durationMin: number,
    rir: number | null,
    notes: string | null,
    xpValue: number,
  ): ImportedLog => ({
    name: name.slice(0, MAX_NAME),
    type,
    sets: Math.max(1, Math.min(MAX_SETS, Math.round(sets))),
    reps: Math.max(0, Math.min(MAX_REPS, Math.round(reps))),
    weightKg: Math.max(0, Math.min(MAX_WEIGHT, weightKg)),
    durationMin: Math.max(0, Math.min(MAX_DURATION, Math.round(durationMin))),
    rir,
    notes: notes === null ? null : notes.slice(0, MAX_NOTES),
    xpValue: Math.max(0, Math.round(xpValue)),
  })

  if (!hasSetOrder) {
    // each row is one log — Sets column honored (default 1)
    for (const r of rows) {
      const sets = r.sets ?? 1
      const xp = r.xp ?? exerciseXp(r.type, sets, r.reps, r.weightKg, r.durationMin, stats)
      logs.push(sanitize(r.name, r.type, sets, r.reps, r.weightKg, r.durationMin, r.rir, r.notes, xp))
    }
    return logs
  }

  // per-set mode: merge CONSECUTIVE rows with identical
  // (exercise, type, weight, reps, rir) into one log with sets = row count
  const flush = (group: RawSetRow[]) => {
    if (group.length === 0) return
    const first = group[0]
    const sets = group.length
    const reps = first.reps
    const weightKg = first.weightKg
    const durationMin = group.reduce((a, r) => a + r.durationMin, 0)
    const xp =
      group.every((r) => r.xp !== null)
        ? group.reduce((a, r) => a + (r.xp ?? 0), 0)
        : exerciseXp(first.type, sets, reps, weightKg, durationMin, stats)
    // distinct notes in performed order, joined honestly
    const seenNotes = new Set<string>()
    const noteParts: string[] = []
    for (const r of group) {
      if (r.notes !== null && !seenNotes.has(r.notes)) {
        seenNotes.add(r.notes)
        noteParts.push(r.notes)
      }
    }
    logs.push(
      sanitize(
        first.name,
        first.type,
        sets,
        reps,
        weightKg,
        durationMin,
        first.rir,
        noteParts.length > 0 ? noteParts.join(" | ") : null,
        xp,
      ),
    )
  }

  let group: RawSetRow[] = []
  let groupKey = ""
  for (const r of rows) {
    const key = `${r.name}\u0000${r.type}\u0000${r.weightKg}\u0000${r.reps}\u0000${r.rir ?? "x"}`
    if (group.length > 0 && key === groupKey) group.push(r)
    else {
      flush(group)
      group = [r]
      groupKey = key
    }
  }
  flush(group)
  return logs
}

// ── dedupe guard ──────────────────────────────────────────────────────────────

/**
 * Filter workouts whose (gateName, startedAt) already exist as sessions —
 * they are marked "ALREADY IN ARCHIVE" and skipped, never duplicated.
 * Re-importing the same file twice is a no-op by construction.
 */
export function dedupeAgainst(
  parsed: ParsedImport,
  existing: { gateName: string; startedAt: string }[],
): ParsedImport {
  const seen = new Set(existing.map((e) => `${e.startedAt}\u0000${e.gateName}`))
  const workouts: ImportedWorkout[] = []
  const skipped = [...parsed.skipped]
  for (const w of parsed.workouts) {
    if (seen.has(`${w.startedAt}\u0000${w.gateName}`)) {
      skipped.push({ line: w.line, reason: `ALREADY IN ARCHIVE — ${w.gateName}` })
    } else {
      workouts.push(w)
    }
  }
  skipped.sort((a, b) => a.line - b.line)
  return { workouts, skipped }
}

// ── totals helpers ────────────────────────────────────────────────────────────

/** Aggregate preview totals (strength-only volume — the app's sessionVolume). */
export function importTotals(p: ParsedImport): ImportTotals {
  return {
    workouts: p.workouts.length,
    logs: p.workouts.reduce((n, w) => n + w.logs.length, 0),
    sets: p.workouts.reduce((n, w) => n + w.logs.reduce((a, l) => a + l.sets, 0), 0),
    volumeKg: Math.round(p.workouts.reduce((n, w) => n + sessionVolume(w.logs), 0)),
    estXp: p.workouts.reduce((n, w) => n + w.logs.reduce((a, l) => a + l.xpValue, 0), 0),
    skippedRows: p.skipped.length,
  }
}

/** Per-workout card totals. */
export function workoutTotals(w: ImportedWorkout): {
  logCount: number
  sets: number
  volumeKg: number
  estXp: number
} {
  return {
    logCount: w.logs.length,
    sets: w.logs.reduce((a, l) => a + l.sets, 0),
    volumeKg: Math.round(sessionVolume(w.logs)),
    estXp: w.logs.reduce((a, l) => a + l.xpValue, 0),
  }
}
