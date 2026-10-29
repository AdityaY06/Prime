// ─── PRIME · CSV export engine (R20-c — fitness-app interchange) ──────────────
// Strong/Hevy-convention workout CSV — the de-facto interchange format other
// fitness apps actually ingest. Every shaping function here is PURE (zero
// DOM) so scratch QA scripts can exercise every escaping/shape path; the
// only DOM surface is downloadTextFile/downloadCsv at the bottom (the
// data-vault's Blob → objectURL → anchor idiom, matched exactly).
//
// DOCUMENTED CONVENTIONS (decided once, honored everywhere):
// - Escaping: RFC 4180 — a cell is wrapped in double quotes when it contains
//   a comma, a double quote, CR or LF; inner double quotes are doubled.
// - Line endings: "\n" between rows plus one trailing newline. Strict RFC
//   4180 asks for CRLF, but every real consumer here (Sheets, Excel, Hevy,
//   Drive preview) parses LF happily and the artifact stays half the size.
// - Date column: the session's ISO 8601 startedAt, verbatim — sorts
//   lexically, parses natively in Sheets/Excel, no timezone ambiguity.
// - Volume (kg): sets×reps×weight on loaded rows, rounded to 1 decimal;
//   duration-based rows (cardio / bodyweight-unloaded) export 0 — an honest
//   zero, never a fabricated kilogram.
// - Est. 1RM (kg): Epley via the shared progression engine for loaded 1-12
//   rep sets (R68 — Epley's validity domain; a 13+ rep set has no honest
//   e1RM), else an empty cell (the engine's own guards return 0 for unloaded
//   / out-of-domain rows — a computed 0 renders empty, not "0.0").
// - RIR: empty cell when null (not captured — pre-R8 rows).
// - RPE: Borg CR10 1-10, empty cell when null (not captured — pre-R32-a
//   rows); exported beside RIR so the effort pair travels together. The
//   import bridge already parses an "rpe" column (deriving RIR from it
//   when RIR is absent) — round-trip fidelity preserved.
// - Archive scope: CLEARED sessions only — active and abandoned raids are
//   excluded (the load-model precedent: only cleared raids count as
//   training history). Pure tabular output, NO comment/metadata lines
//   (strict CSV parsers break on them — the cleared-only contract lives in
//   this header and in the UI copy, not in the artifact).

import { epleyE1rm, validE1rmSet } from "@/lib/progression"
import type { ExerciseLogDTO, SessionDTO } from "@/lib/types"

/** Canonical column order — Strong/Hevy-recognizable names. */
const HEADER_CELLS: string[] = [
  "Date",
  "Workout Name",
  "Exercise Name",
  "Category",
  "Sets",
  "Reps",
  "Weight (kg)",
  "Duration (min)",
  "RIR",
  "RPE",
  "Volume (kg)",
  "Est. 1RM (kg)",
  "Notes",
  "XP",
]

/** RFC 4180 cell escaping: quote-wrap on comma/quote/newline, double inner quotes. */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const s = typeof value === "number" ? String(value) : value
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** One CSV line from raw cells — each escaped, joined with commas. */
export function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvEscape).join(",")
}

export const CSV_HEADER = toCsvRow(HEADER_CELLS)

const round1 = (n: number) => Math.round(n * 10) / 10

/** Cells for one exercise-log row: session context columns + log effort columns. */
function logRowCells(session: SessionDTO, log: ExerciseLogDTO): (string | number | null)[] {
  const loaded = log.weightKg > 0
  const volume = loaded ? round1(log.sets * log.reps * log.weightKg) : 0
  // R68 — Epley's 1-12 rep domain only: a 13+ rep set exports an empty cell
  // (the existing honest-null path), never an inflated extrapolation.
  const e1rm = validE1rmSet(log.reps, log.weightKg) ? epleyE1rm(log.weightKg, log.reps) : 0
  return [
    session.startedAt, // ISO 8601 — see conventions above
    session.gateName,
    log.name,
    log.type,
    log.sets,
    log.reps,
    log.weightKg,
    log.durationMin,
    log.rir, // null → empty cell
    log.rpe ?? null, // R32-a — null/absent → empty cell (never a fabricated rating)
    volume,
    e1rm > 0 ? round1(e1rm) : null, // empty when not computable
    log.notes ?? null,
    log.xpValue,
  ]
}

/**
 * Single-session export: header + one row PER exercise log (logs stay in
 * performed order — the API orders them by createdAt asc).
 */
export function sessionToCsv(session: SessionDTO): string {
  const lines = [CSV_HEADER]
  for (const log of session.logs) lines.push(toCsvRow(logRowCells(session, log)))
  return `${lines.join("\n")}\n`
}

/**
 * Full archive export: every CLEARED session (active/abandoned excluded),
 * rows ordered by startedAt ascending (ISO strings sort lexically), then by
 * exercise name as the deterministic tiebreaker — regardless of the order
 * the API handed back.
 */
export function sessionsToArchiveCsv(sessions: SessionDTO[]): string {
  const rows: { startedAt: string; name: string; line: string }[] = []
  for (const session of sessions) {
    if (session.status !== "cleared") continue
    for (const log of session.logs) {
      rows.push({ startedAt: session.startedAt, name: log.name, line: toCsvRow(logRowCells(session, log)) })
    }
  }
  rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.name.localeCompare(b.name))
  return `${[CSV_HEADER, ...rows.map((r) => r.line)].join("\n")}\n`
}

/**
 * DOM: trigger a browser download of `contents` as `filename` — the
 * data-vault's anchor idiom matched exactly (appendChild → click → remove,
 * objectURL revoked on a 4s timeout so long downloads keep their URL).
 */
export function downloadTextFile(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** CSV flavor of downloadTextFile. */
export function downloadCsv(filename: string, csv: string): void {
  downloadTextFile(filename, csv, "text/csv;charset=utf-8")
}
