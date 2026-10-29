// ─── PRIME · Health-metrics CSV import engine (R22-a) ─────────────────────────
// The missing half of the import bridge: workout CSV (R21-a) builds sessions;
// THIS builds BodyMetric history. Cronometer / Whoop / Oura / Apple Health
// (auto-export CSV) / generic spreadsheets carrying DAILY health metrics —
// weight, sleep, resting HR, mood/energy, body measurements — parsed into
// one-value-per-type-per-day entries for the existing BodyMetric table
// (@@unique hunterId+day+type). Vitals history charts, readiness and the RHR
// baseline all consume those rows, so one import lights them all up.
//
// Every function here is PURE (zero DOM, zero DB) so scratch QA scripts can
// exercise every tokenizer/alias/unit/skip path; the only consumer that
// touches state is the /api/import/health route.
//
// DOCUMENTED CONVENTIONS (decided once, honored everywhere):
// - Tokenizer: REUSED from csv-import.ts (RFC 4180 — quoted cells, doubled
//   quotes, delimiters and raw newlines inside quotes, LF/CRLF, BOM) plus its
//   header-line delimiter sniff ("," vs Hevy ";"). Same tokenizer, two parsers.
// - Formats: WIDE (one row per day, one column per metric — Cronometer,
//   Whoop daily, Oura daily, hand-rolled sheets) and LONG (Date | Type |
//   Value | Unit — Apple Health auto-export style). Wide is detected first;
//   long kicks in only when NO wide metric column resolves but Type+Value do.
// - Headers: normalized (lowercase, underscores/hyphens/periods → spaces,
//   parenthesized text kept as tokens) then matched by ORDERED generous rules
//   with explicit EXCLUSION words (Sleep Performance / Deep Sleep Duration /
//   Time in Bed / Energy (kcal) / Sleep Need are deliberately NOT total sleep,
//   subjective energy or weight — they resolve to nothing, never to a lie).
// - Units: kg-native weight (lb/lbs/pounds evidence in header OR cell suffix
//   → ×0.45359237; grams → /1000), cm-native measurements (in/inch → ×2.54),
//   hours-native sleep, bpm-native resting HR, 1–5 scale mood/energy.
// - Sleep formats: "7:30" h·mm (optional seconds); "7h30m"; suffixed cells ("450m", "7.5h");
//   unit-hinted headers ("Sleep (min)", Whoop "Total Sleep Duration (min)");
//   plain numbers with NO hint use the documented heuristic — ≤24 → hours,
//   25–1440 → minutes (Whoop), 1441–90000 → seconds (Oura) — bounds catch the
//   rest. Timestamps TRUNCATE to their written calendar day (no timezone math,
//   no sleep-night attribution invented — a Whoop 23:30 start lands on its
//   written date, documented honestly).
// - Dates: ISO yyyy-mm-dd (preferred) and yyyy/mm/dd, ISO datetimes (truncated
//   to day), mm/dd/yyyy h·mm (optional seconds, optional AM/PM) (US — slash dates are US, dots are
//   European dd.mm.yyyy; ambiguous is documented, never guessed twice).
//   Unparseable rows skip with a reason, exactly like csv-import.ts.
// - Bounds (SKIP with reason — the /api/metrics POST route REJECTS out-of-range
//   values, so an import fabricating clamped values would write rows the app's
//   own validation refuses): weight 20–400 kg · sleep 0–24 h · restingHr
//   25–250 bpm · measurements 20–300 cm · mood/energy 1–5.
// - Aggregation: rows collapse to per-(day, type) entries — WITHIN a file the
//   LAST row wins (mirrors the storage semantic "latest wins via upsert" in
//   the schema comment); overwritten collisions count as fileDuplicates.
// - dedupeAgainst(existing): entries whose (day, type) already exist as
//   BodyMetric rows are marked "ALREADY LOGGED" and excluded — re-importing
//   the same file is a NO-OP by construction (sessions-import precedent). The
//   commit path still upserts, so a concurrent double-confirm can never crash
//   on the unique constraint — it would update rather than throw.
// - Caps: ≤ 2000 aggregated entries per file (MAX_IMPORT_ENTRIES) and ≤ 2 MB
//   of CSV text — both throw ImportParseError with honest reasons.
// - Line numbers: `line` is the CSV row ordinal (header = line 1, first data
//   row = line 2), navigable by the user exactly like the workout importer.

import { ImportParseError, parseCsvTable, sniffDelimiter, type SkippedRow } from "./csv-import"

export { ImportParseError }

// ── types ─────────────────────────────────────────────────────────────────────

/**
 * The BodyMetric types this importer writes — every one is genuinely consumed:
 * weight/chest/waist/hips/arm/thigh/calf/sleep/restingHr are /api/metrics
 * METRIC_TYPES; sleep/restingHr/mood/energy additionally feed /api/readiness
 * (READINESS_METRIC_TYPES) and the Vitals check-in. Nothing else is imported —
 * no HRV/stress/BP fabrication from files that don't carry them honestly.
 */
export type HealthMetricType =
  | "weight"
  | "chest"
  | "waist"
  | "hips"
  | "arm"
  | "thigh"
  | "calf"
  | "sleep"
  | "restingHr"
  | "mood"
  | "energy"

export const HEALTH_METRIC_TYPES: readonly HealthMetricType[] = [
  "weight",
  "chest",
  "waist",
  "hips",
  "arm",
  "thigh",
  "calf",
  "sleep",
  "restingHr",
  "mood",
  "energy",
]

/** Storage units — byte-identical to lib/nutrition METRIC_TYPES units. */
export const HEALTH_METRIC_UNITS: Record<HealthMetricType, string> = {
  weight: "kg",
  chest: "cm",
  waist: "cm",
  hips: "cm",
  arm: "cm",
  thigh: "cm",
  calf: "cm",
  sleep: "h",
  restingHr: "bpm",
  mood: "/5",
  energy: "/5",
}

/** Uppercase display labels for preview cards (client-safe). */
export const HEALTH_METRIC_LABELS: Record<HealthMetricType, string> = {
  weight: "WEIGHT",
  chest: "CHEST",
  waist: "WAIST",
  hips: "HIPS",
  arm: "ARM",
  thigh: "THIGH",
  calf: "CALF",
  sleep: "SLEEP",
  restingHr: "RESTING HR",
  mood: "MOOD",
  energy: "ENERGY",
}

/** One BodyMetric row-to-be: one value for one type on one day. */
export type ImportedHealthEntry = {
  day: string // yyyy-mm-dd
  type: HealthMetricType
  value: number // sanitized + unit-converted (kg / cm / h / bpm / 1dp scale)
  unit: string // from HEALTH_METRIC_UNITS
  /** CSV row ordinal of the LAST winning row (last-wins aggregation). */
  line: number
}

export type ParsedHealthImport = {
  entries: ImportedHealthEntry[]
  skipped: SkippedRow[]
  /** (day, type) pairs overwritten by a later row in the same file. */
  fileDuplicates: number
}

export type HealthImportTotals = {
  days: number
  entries: number
  byType: Partial<Record<HealthMetricType, number>>
  firstDay: string | null
  lastDay: string | null
  skippedRows: number
  fileDuplicates: number
}

export type HealthDayPreview = {
  day: string
  metrics: { type: HealthMetricType; value: number; unit: string }[]
}

// ── caps ──────────────────────────────────────────────────────────────────────

/** Import cap — 2000 aggregated entries per file (route enforces the same). */
export const MAX_IMPORT_ENTRIES = 2000
/** Raw text cap — 2 MB of CSV keeps request bodies and skip lists bounded. */
export const MAX_CSV_CHARS = 2_000_000

const LB_TO_KG = 0.45359237
const IN_TO_CM = 2.54

const round1 = (n: number): number => Math.round(n * 10) / 10

function quote(s: string): string {
  return s === "" ? "(EMPTY)" : `"${s}"`
}

// ── header normalization + resolution ─────────────────────────────────────────

/** lowercase · parens opened into words · _ . - → spaces · collapse. */
function flattenHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[._/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

type Canonical =
  | "date"
  | "weight"
  | "sleep"
  | "restingHr"
  | "mood"
  | "energy"
  | "chest"
  | "waist"
  | "hips"
  | "arm"
  | "thigh"
  | "calf"
  | "metricName" // long format: Type / Metric / Name column
  | "value" // long format: Value column
  | "unit" // long format: Unit column (optional)

/** Unit hints (kg-native / cm-native / hours-native conventions). */
type UnitHint = "kg" | "g" | "lb" | "cm" | "in" | "h" | "min" | "s" | "bpm" | null

const DATE_ALIASES = new Set([
  "date",
  "day",
  "calendar date",
  "datetime",
  "date time",
  "timestamp",
  "start date",
  "report date",
  "entry date",
  "activity date",
  "sleep date",
  "start time",
])

/** Words that disqualify a *sleep-ish* header from being total sleep hours. */
const SLEEP_EXCLUDE = [
  "score",
  "performance",
  "efficiency",
  "consistency",
  "regularity",
  "need",
  "debt",
  "rem",
  "deep",
  "light",
  "slow",
  "awake",
  "disturb",
  "depriv", // prefix — catches "deprivation"
  "stage",
  "bed", // prefix — catches "bedtime" (Oura) too, deliberately
  "goal",
  "target",
  "avg",
  "average",
  "mean",
  "trend",
  "timing",
  "onset",
  "latency",
  "apnea",
  "breath",
  "respiratory",
  "snor", // prefix — catches "snoring"
  "alarm",
  "sound",
  "ratio",
  "percent",
  "change",
]

/** Words that disqualify an *energy-ish* header (kcal is calories, not mood;
 *  readiness/recovery/score/strain are 0–100 DEVICE scores — Whoop "Recovery",
 *  Oura "Readiness Score" — never a subjective 1–5, so they resolve to nothing). */
const ENERGY_EXCLUDE = ["kcal", "cal", "burn", "intake", "budget", "remainder", "readiness", "recovery", "score", "strain"]

/** Words that disqualify a *weight-ish* header (lean/fat/muscle mass ≠ body weight). */
const WEIGHT_EXCLUDE = ["lean", "fat", "bmi", "bone", "muscle", "water", "goal", "target", "change", "loss", "gain", "trend"]

/**
 * Token-prefix exclusion — a word disqualifies a header when one of its TOKENS
 * equals the word or starts with it ("deprivation".startsWith("depriv")).
 * Token-level by design: substring matching tripped "du-RATIO-n" against the
 * "ratio" exclusion and silently rejected every "Sleep Duration" header.
 */
function tokenExcluded(tokens: string[], words: readonly string[]): boolean {
  return words.some((w) => tokens.some((t) => t === w || t.startsWith(w)))
}

/** Unit tokens → UnitHint (specific units first; bare "in" LAST so the
 *  preposition in "Sleep in hours" can never outrank the real unit). */
function unitHintFromTokens(tokens: string[]): UnitHint {
  if (tokens.includes("kg")) return "kg"
  if (tokens.includes("lb") || tokens.includes("lbs") || tokens.includes("pounds") || tokens.includes("pound")) return "lb"
  if (tokens.includes("cm") || tokens.includes("centimeters") || tokens.includes("centimetres")) return "cm"
  if (tokens.includes("h") || tokens.includes("hr") || tokens.includes("hrs") || tokens.includes("hours") || tokens.includes("hour")) return "h"
  if (tokens.includes("min") || tokens.includes("mins") || tokens.includes("minutes") || tokens.includes("minute") || tokens.includes("m")) return "min"
  if (tokens.includes("s") || tokens.includes("sec") || tokens.includes("secs") || tokens.includes("seconds") || tokens.includes("second")) return "s"
  if (tokens.includes("bpm")) return "bpm"
  if (tokens.includes("in") || tokens.includes("inch") || tokens.includes("inches")) return "in"
  return null
}

/** Ordered generous header resolution — first matching rule wins. */
function resolveColumn(raw: string): { canonical: Canonical; hint: UnitHint } | null {
  const flat = flattenHeader(raw)
  if (!flat) return null
  const tokens = flat.split(" ")

  // 1 · date
  if (DATE_ALIASES.has(flat)) return { canonical: "date", hint: null }

  // 2 · resting HR (before generic sleep/weight so "Heart Rate (resting)" wins)
  if (
    flat === "rhr" ||
    (flat.includes("resting") && (flat.includes("heart") || tokens.includes("hr") || flat.includes("pulse") || flat.includes("bpm")))
  ) {
    return { canonical: "restingHr", hint: unitHintFromTokens(tokens) }
  }

  // 3 · total sleep (Sleep / Sleep (h) / Total Sleep / Asleep Duration / Time
  //     Asleep / sleep_hours / Whoop "Total Sleep Duration (min)" …) — stage
  //     columns, scores, debt and Time in Bed are excluded, never imported
  if ((flat.includes("sleep") || flat.includes("asleep")) && !tokenExcluded(tokens, SLEEP_EXCLUDE)) {
    return { canonical: "sleep", hint: unitHintFromTokens(tokens) }
  }

  // 4 · mood
  if (flat.includes("mood")) return { canonical: "mood", hint: unitHintFromTokens(tokens) }

  // 5 · subjective energy — kcal/calorie columns are explicitly NOT this
  if (flat.includes("energy") && !tokenExcluded(tokens, ENERGY_EXCLUDE)) {
    return { canonical: "energy", hint: unitHintFromTokens(tokens) }
  }

  // 6 · body measurements (word-anchored so "warm" never reads as "arm")
  for (const [word, canonical] of [
    ["chest", "chest"],
    ["waist", "waist"],
    ["hips", "hips"],
    ["hip", "hips"],
    ["arm", "arm"],
    ["arms", "arm"],
    ["bicep", "arm"],
    ["biceps", "arm"],
    ["thigh", "thigh"],
    ["thighs", "thigh"],
    ["calf", "calf"],
    ["calves", "calf"],
  ] as const) {
    if (new RegExp(`\\b${word}\\b`).test(flat)) {
      return { canonical: canonical as Canonical, hint: unitHintFromTokens(tokens) }
    }
  }

  // 7 · body weight (Weight / Body Weight / Body Mass / weight_kg / bare kg /
  //     Pounds …) — lean/fat/muscle mass and goals are excluded
  if (
    (flat.includes("weight") ||
      flat.includes("body mass") ||
      tokens.includes("kg") ||
      tokens.includes("lbs") ||
      tokens.includes("lb") ||
      tokens.includes("pounds") ||
      tokens.includes("bodyweight")) &&
    !tokenExcluded(tokens, WEIGHT_EXCLUDE)
  ) {
    return { canonical: "weight", hint: unitHintFromTokens(tokens) }
  }

  // 8–10 · long format (Apple Health auto-export style)
  if (["type", "metric", "name", "metric type", "metric name", "measurement", "health type", "health metric", "biometric"].includes(flat)) {
    return { canonical: "metricName", hint: null }
  }
  if (["value", "amount", "reading", "sample"].includes(flat)) return { canonical: "value", hint: null }
  if (["unit", "units", "uom"].includes(flat)) return { canonical: "unit", hint: null }

  return null
}

/** Canonical → column-index map (first occurrence wins), hints carried along. */
function resolveColumns(
  headerCells: string[],
): Map<Canonical, { index: number; hint: UnitHint }> {
  const map = new Map<Canonical, { index: number; hint: UnitHint }>()
  headerCells.forEach((raw, i) => {
    const c = resolveColumn(raw)
    if (c && !map.has(c.canonical)) map.set(c.canonical, { index: i, hint: c.hint })
  })
  return map
}

// ── day parsing (string → yyyy-mm-dd day key) ─────────────────────────────────

const DAY_ISO =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?\s*(Z|[+-]\d{2}:?\d{2})?)?$/
const DAY_US = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?\s*([AP]M)?)?$/i
const DAY_EU = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,]+\d{1,2}:\d{2}(?::\d{2})?)?$/

/**
 * ISO yyyy-mm-dd (preferred) · yyyy/mm/dd · ISO datetimes (TRUNCATED to the
 * written calendar day — no timezone math, no sleep-night attribution
 * invented) · mm/dd/yyyy (slash = US, optional h·mm·ss + AM/PM) · dd.mm.yyyy (dot =
 * European). Returns null when unparseable — callers skip with an honest
 * reason, never guess.
 */
export function parseHealthDay(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  let m = DAY_ISO.exec(s)
  if (m) return validDay(Number(m[1]), Number(m[2]), Number(m[3]))
  m = DAY_US.exec(s)
  if (m) return validDay(Number(m[3]), Number(m[1]), Number(m[2]))
  m = DAY_EU.exec(s)
  if (m) return validDay(Number(m[3]), Number(m[2]), Number(m[1]))
  return null
}

/** (y, m, d) → zero-padded day key, or null when not a real calendar date. */
function validDay(y: number, mo: number, d: number): string | null {
  if (y < 1900 || y > 2099 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

// ── cell coercion ─────────────────────────────────────────────────────────────

/** Cells that mean "no data" — absent, never a skip reason. */
const ABSENT = new Set(["", "-", "–", "—", "n/a", "na", "none", "null"])

function cellAbsent(raw: string | undefined): boolean {
  if (raw === undefined) return true
  return ABSENT.has(raw.trim().toLowerCase())
}

/** Known unit suffixes attached to numbers ("165 lb", "7.5h", "450m"). */
const SUFFIX_UNITS: Record<string, Exclude<UnitHint, null>> = {
  kg: "kg",
  g: "g",
  gram: "g",
  grams: "g",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  cm: "cm",
  in: "in",
  inch: "in",
  inches: "in",
  h: "h",
  hr: "h",
  hrs: "h",
  hour: "h",
  hours: "h",
  m: "min",
  min: "min",
  mins: "min",
  minute: "min",
  minutes: "min",
  s: "s",
  sec: "s",
  secs: "s",
  second: "s",
  seconds: "s",
  bpm: "bpm",
}

type Loose = { n: number; suffix: Exclude<UnitHint, null> | "unknown" | null } | null

/** "72.5" / "72,5" / "165 lb" / "7.5h" / "450m" / "62 bpm" → number + unit. */
function parseLoose(raw: string): Loose {
  const s = raw.trim()
  if (!s) return null
  const m = /^(-?\d+(?:[.,]\d+)?)\s*([a-zA-Z/%°]*)$/.exec(s)
  if (!m) return null
  const n = Number(m[1].replace(",", "."))
  if (!Number.isFinite(n)) return null
  const suffix = m[2].toLowerCase()
  return { n, suffix: suffix === "" ? null : (SUFFIX_UNITS[suffix] ?? "unknown") }
}

type CellResult = { ok: true; value: number } | { ok: false; reason: string }

const boundsReason = (what: string, shown: number, bounds: string): string =>
  `${what} OUT OF RANGE — ${shown} (${bounds})`

// ── per-metric cell parsers (bounds SKIP with reason — mirrors the
//    /api/metrics POST rejection philosophy, never clamps a lie into range) ────

function parseWeightCell(raw: string, hint: UnitHint): CellResult {
  const loose = parseLoose(raw)
  if (!loose) return { ok: false, reason: `UNPARSABLE WEIGHT — ${quote(raw.trim().slice(0, 16))}` }
  if (loose.suffix === "unknown") {
    return { ok: false, reason: `UNPARSABLE WEIGHT — ${quote(raw.trim().slice(0, 16))}` }
  }
  const unit = loose.suffix ?? hint // cell-suffix evidence wins over header
  let kg = loose.n
  if (unit === "lb") kg = loose.n * LB_TO_KG
  if (unit === "g") kg = loose.n / 1000
  kg = round1(kg)
  if (kg < 20 || kg > 400) return { ok: false, reason: boundsReason("WEIGHT", kg, "20–400 KG") }
  return { ok: true, value: kg }
}

function parseSleepCell(raw: string, hint: UnitHint): CellResult {
  const s = raw.trim()
  // "7:30" / "07:30:00" — h·mm (optional seconds) durations
  const hms = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (hms) {
    const h = Number(hms[1]) + Number(hms[2]) / 60 + (hms[3] ? Number(hms[3]) / 3600 : 0)
    return sleepBound(h)
  }
  // "7h30m" / "7h" combined form
  const combo = /^(\d{1,3}(?:[.,]\d+)?)\s*h\s*(\d{1,2})?\s*m?$/i.exec(s)
  if (combo) {
    const h = Number(combo[1].replace(",", ".")) + (combo[2] ? Number(combo[2]) / 60 : 0)
    return sleepBound(h)
  }
  const loose = parseLoose(raw)
  if (!loose || loose.suffix === "unknown") {
    return { ok: false, reason: `UNPARSABLE SLEEP — ${quote(s.slice(0, 16))}` }
  }
  const unit = loose.suffix ?? hint
  let h: number
  if (unit === "h") h = loose.n
  else if (unit === "min") h = loose.n / 60
  else if (unit === "s") h = loose.n / 3600
  else {
    // no hint anywhere — documented heuristic: plain ≤24 → hours (Cronometer
    // sheets), 25–1440 → minutes (Whoop), 1441–90000 → seconds (Oura).
    // >90000 is left as-is so the bounds check rejects it honestly.
    h = loose.n <= 24 ? loose.n : loose.n <= 1440 ? loose.n / 60 : loose.n <= 90000 ? loose.n / 3600 : loose.n
  }
  return sleepBound(h)
}

function sleepBound(h: number): CellResult {
  const r = round1(h)
  if (r < 0 || r > 24) return { ok: false, reason: boundsReason("SLEEP", r, "0–24 H") }
  return { ok: true, value: r }
}

function parseRhrCell(raw: string): CellResult {
  const loose = parseLoose(raw)
  if (!loose || loose.suffix === "unknown") {
    return { ok: false, reason: `UNPARSABLE RESTING HR — ${quote(raw.trim().slice(0, 16))}` }
  }
  const v = round1(loose.n)
  if (v < 25 || v > 250) return { ok: false, reason: boundsReason("RESTING HR", v, "25–250 BPM") }
  return { ok: true, value: v }
}

function parseMeasureCell(raw: string, hint: UnitHint, what: string): CellResult {
  const loose = parseLoose(raw)
  if (!loose || loose.suffix === "unknown") {
    return { ok: false, reason: `UNPARSABLE ${what} — ${quote(raw.trim().slice(0, 16))}` }
  }
  const unit = loose.suffix ?? hint
  const cm = round1(unit === "in" ? loose.n * IN_TO_CM : loose.n)
  if (cm < 20 || cm > 300) return { ok: false, reason: boundsReason(what, cm, "20–300 CM") }
  return { ok: true, value: cm }
}

function parseScaleCell(raw: string, what: string): CellResult {
  const loose = parseLoose(raw)
  if (!loose || loose.suffix === "unknown") {
    return { ok: false, reason: `UNPARSABLE ${what} — ${quote(raw.trim().slice(0, 16))}` }
  }
  const v = round1(loose.n)
  if (v < 1 || v > 5) return { ok: false, reason: boundsReason(what, v, "1–5 SCALE") }
  return { ok: true, value: v }
}

function parseCellForType(type: HealthMetricType, raw: string, hint: UnitHint): CellResult {
  switch (type) {
    case "weight":
      return parseWeightCell(raw, hint)
    case "sleep":
      return parseSleepCell(raw, hint)
    case "restingHr":
      return parseRhrCell(raw)
    case "mood":
      return parseScaleCell(raw, "MOOD")
    case "energy":
      return parseScaleCell(raw, "ENERGY")
    case "chest":
      return parseMeasureCell(raw, hint, "CHEST")
    case "waist":
      return parseMeasureCell(raw, hint, "WAIST")
    case "hips":
      return parseMeasureCell(raw, hint, "HIPS")
    case "arm":
      return parseMeasureCell(raw, hint, "ARM")
    case "thigh":
      return parseMeasureCell(raw, hint, "THIGH")
    case "calf":
      return parseMeasureCell(raw, hint, "CALF")
  }
}

// ── long-format (Apple Health style) resolution ───────────────────────────────

const LONG_METRICS: Record<string, HealthMetricType> = {
  "body mass": "weight",
  weight: "weight",
  "body weight": "weight",
  bodyweight: "weight",
  "sleep duration": "sleep",
  "sleep analysis": "sleep",
  sleep: "sleep",
  "asleep duration": "sleep",
  asleep: "sleep",
  "time asleep": "sleep",
  "total sleep": "sleep",
  "total sleep duration": "sleep",
  "sleep hours": "sleep",
  "resting heart rate": "restingHr",
  "resting hr": "restingHr",
  "resting pulse": "restingHr",
  rhr: "restingHr",
  mood: "mood",
  energy: "energy",
  chest: "chest",
  waist: "waist",
  hips: "hips",
  hip: "hips",
  arm: "arm",
  thigh: "thigh",
  calf: "calf",
}

/** Type-name cell → metric (exact normalized match; unknown → null, honest). */
function resolveLongMetric(nameCell: string): HealthMetricType | null {
  return LONG_METRICS[flattenHeader(nameCell)] ?? null
}

/** Long-format unit cell → hint; "unsupported" for known-unknowns (% etc.). */
function longUnitHint(cell: string | undefined): UnitHint | "unsupported" {
  const s = (cell ?? "").trim().toLowerCase()
  if (!s) return null
  switch (s) {
    case "kg":
      return "kg"
    case "g":
    case "grams":
      return "g"
    case "lb":
    case "lbs":
    case "pounds":
      return "lb"
    case "cm":
      return "cm"
    case "in":
    case "inch":
    case "inches":
      return "in"
    case "h":
    case "hr":
    case "hours":
      return "h"
    case "min":
    case "mins":
    case "minutes":
      return "min"
    case "s":
    case "sec":
    case "secs":
    case "seconds":
      return "s"
    case "count/min":
    case "bpm":
      return "bpm"
    case "/5":
      return null // scale — the value itself carries the meaning
    default:
      return "unsupported"
  }
}

// ── main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a Cronometer/Whoop/Oura/Apple-Health/generic health CSV into BodyMetric
 * entries. `opts.maxEntries` lowers the import cap (scratch tests only).
 * Throws ImportParseError for file-level failures (empty, no date column, no
 * recognizable metric columns, cap breaches).
 */
export function parseHealthCsv(csv: string, opts: { maxEntries?: number } = {}): ParsedHealthImport {
  const maxEntries = opts.maxEntries ?? MAX_IMPORT_ENTRIES
  const text = csv.startsWith("\uFEFF") ? csv.slice(1) : csv
  if (!text.trim()) throw new ImportParseError("EMPTY FILE — NO ROWS")
  if (text.length > MAX_CSV_CHARS) {
    throw new ImportParseError(
      `FILE TOO LARGE — ${(text.length / 1_000_000).toFixed(1)} MB EXCEEDS THE 2 MB IMPORT CAP`,
    )
  }

  const delimiter = sniffDelimiter(text)
  const rows = parseCsvTable(text, delimiter)
  if (rows.length < 2) throw new ImportParseError("NO DATA ROWS — HEADER ONLY")

  const cols = resolveColumns(rows[0])
  if (!cols.has("date")) {
    throw new ImportParseError(
      "HEADER MISSING REQUIRED COLUMN — DATE NOT FOUND (ALIASES: DATE, DAY, TIMESTAMP, CALENDAR DATE, START TIME…)",
    )
  }

  const metricCols = HEALTH_METRIC_TYPES.filter((t) => cols.has(t)).map((t) => ({
    type: t,
    index: cols.get(t)!.index,
    hint: cols.get(t)!.hint,
  }))
  // WIDE when any metric column resolved; else LONG when Type+Value exist.
  const isLong = metricCols.length === 0 && cols.has("metricName") && cols.has("value")
  if (metricCols.length === 0 && !isLong) {
    throw new ImportParseError(
      "NO RECOGNIZABLE HEALTH-METRIC COLUMNS — NEED ANY OF WEIGHT / SLEEP / RESTING HR / MOOD / ENERGY / BODY MEASUREMENTS (OR LONG FORMAT: TYPE + VALUE + DATE)",
    )
  }

  const dateIdx = cols.get("date")!.index
  const skipped: SkippedRow[] = []
  const agg = new Map<string, ImportedHealthEntry>()
  let fileDuplicates = 0

  const addCandidate = (line: number, day: string, type: HealthMetricType, value: number) => {
    const key = `${day}\u0000${type}`
    if (agg.has(key)) fileDuplicates++ // LAST row wins (storage: latest wins)
    agg.set(key, { day, type, value, unit: HEALTH_METRIC_UNITS[type], line })
  }

  if (!isLong) {
    // ── wide format: one row per day, one column per metric ─────────────────
    for (let i = 1; i < rows.length; i++) {
      const line = i + 1 // header = line 1
      const cells = rows[i]
      if (cells.every((c) => c.trim() === "")) continue // blank line — formatting, not data

      const day = parseHealthDay(cells[dateIdx] ?? "")
      if (!day) {
        skipped.push({ line, reason: `BAD DATE — ${quote((cells[dateIdx] ?? "").trim().slice(0, 24))}` })
        continue
      }

      let anyCandidate = false
      let anyReason = false
      for (const col of metricCols) {
        const raw = cells[col.index] ?? ""
        if (cellAbsent(raw)) continue // metric simply not logged that day
        const res = parseCellForType(col.type, raw, col.hint)
        if (res.ok) {
          addCandidate(line, day, col.type, res.value)
          anyCandidate = true
        } else {
          skipped.push({ line, reason: res.reason })
          anyReason = true
        }
      }
      if (!anyCandidate && !anyReason) {
        skipped.push({ line, reason: "NO METRIC VALUES" })
      }
    }
  } else {
    // ── long format: Date | Type | Value | Unit (Apple Health auto-export) ──
    const nameIdx = cols.get("metricName")!.index
    const valueIdx = cols.get("value")!.index
    const unitIdx = cols.has("unit") ? cols.get("unit")!.index : null
    for (let i = 1; i < rows.length; i++) {
      const line = i + 1
      const cells = rows[i]
      if (cells.every((c) => c.trim() === "")) continue

      const day = parseHealthDay(cells[dateIdx] ?? "")
      if (!day) {
        skipped.push({ line, reason: `BAD DATE — ${quote((cells[dateIdx] ?? "").trim().slice(0, 24))}` })
        continue
      }
      const nameRaw = (cells[nameIdx] ?? "").trim()
      const metric = resolveLongMetric(nameRaw)
      if (!metric) {
        skipped.push({ line, reason: `UNRECOGNIZED METRIC TYPE — ${quote(nameRaw.slice(0, 24))}` })
        continue
      }
      const valRaw = cells[valueIdx] ?? ""
      if (cellAbsent(valRaw)) {
        skipped.push({ line, reason: "NO VALUE" })
        continue
      }
      const unitRaw = unitIdx !== null ? (cells[unitIdx] ?? "") : ""
      const hint = longUnitHint(unitRaw)
      if (hint === "unsupported") {
        skipped.push({ line, reason: `UNSUPPORTED UNIT — ${quote(unitRaw.trim().slice(0, 16))}` })
        continue
      }
      const res = parseCellForType(metric, valRaw, hint)
      if (res.ok) addCandidate(line, day, metric, res.value)
      else skipped.push({ line, reason: res.reason })
    }
  }

  const entries = [...agg.values()]
  if (entries.length > maxEntries) {
    throw new ImportParseError(
      `FILE TOO LARGE — ${entries.length} METRIC ENTRIES EXCEED THE ${maxEntries}-ENTRY IMPORT CAP — SPLIT THE EXPORT`,
    )
  }
  return { entries, skipped, fileDuplicates }
}

// ── dedupe guard ──────────────────────────────────────────────────────────────

/**
 * Filter entries whose (day, type) already exist as BodyMetric rows — they are
 * marked "ALREADY LOGGED" and skipped, never duplicated. Re-importing the same
 * file twice is a no-op by construction (the commit path still upserts, so a
 * concurrent double-confirm can never crash — it would update, not throw).
 */
export function dedupeAgainst(
  parsed: ParsedHealthImport,
  existing: { day: string; type: string }[],
): ParsedHealthImport {
  const seen = new Set(existing.map((e) => `${e.day}\u0000${e.type}`))
  const entries: ImportedHealthEntry[] = []
  const skipped = [...parsed.skipped]
  for (const e of parsed.entries) {
    if (seen.has(`${e.day}\u0000${e.type}`)) {
      skipped.push({ line: e.line, reason: `ALREADY LOGGED — ${e.day} ${HEALTH_METRIC_LABELS[e.type]}` })
    } else {
      entries.push(e)
    }
  }
  skipped.sort((a, b) => a.line - b.line)
  return { entries, skipped, fileDuplicates: parsed.fileDuplicates }
}

// ── totals helpers ────────────────────────────────────────────────────────────

/** Aggregate preview totals (days, entries by type, range, skips, dupes). */
export function healthImportTotals(p: ParsedHealthImport): HealthImportTotals {
  const days = new Set(p.entries.map((e) => e.day))
  const byType: Partial<Record<HealthMetricType, number>> = {}
  for (const e of p.entries) byType[e.type] = (byType[e.type] ?? 0) + 1
  const sorted = [...days].sort()
  return {
    days: days.size,
    entries: p.entries.length,
    byType,
    firstDay: sorted[0] ?? null,
    lastDay: sorted[sorted.length - 1] ?? null,
    skippedRows: p.skipped.length,
    fileDuplicates: p.fileDuplicates,
  }
}

/** Per-day preview cards (chronological, capped — UI renders "+N MORE"). */
export function healthDaysPreview(p: ParsedHealthImport, cap = 60): HealthDayPreview[] {
  const byDay = new Map<string, ImportedHealthEntry[]>()
  for (const e of p.entries) {
    const list = byDay.get(e.day)
    if (list) list.push(e)
    else byDay.set(e.day, [e])
  }
  return [...byDay.keys()]
    .sort()
    .slice(0, cap)
    .map((day) => ({
      day,
      metrics: (byDay.get(day) ?? []).map((e) => ({ type: e.type, value: e.value, unit: e.unit })),
    }))
}
