// ─── PRIME · Progression intelligence (R1-c) ───────────────────────────────────
// Shared pure helpers behind /api/progression and the log-dialog coaching UI:
// name normalization, Epley e1RM and double-progression verdicts.
// R8-a: optional reps-in-reserve (RIR) modulation — null/absent RIR keeps every
// verdict byte-identical to the legacy engine (Robinson 2024 proximity logic).

/** Normalized grouping key for an exercise name: trim, lowercase, collapse spaces. */
export function progressionKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

// ── 1RM estimation (R69-a — delegated to the single source of truth) ─────────
// The Epley e1RM, its validity ceiling and the honest-domain row filter now
// live in lib/strength-science.ts — every 1RM in PRIME delegates there; a
// formula change happens in exactly one place. Re-exported here so the seven
// live call sites (/api/progression, /api/weekly-review, /api/oracle ×2,
// lib/export/csv, session-raid, exercise-dialog) keep importing from
// "@/lib/progression" with zero import churn.
//
// Contracts (unchanged byte-for-byte — full JSDoc + citations in
// strength-science.ts):
//   · epleyE1rm(weightKg, reps) — Epley w×(1+r/30), r=1 pinned to the load
//     itself (a 1-rep set IS the measured 1RM), 0-sentinel for reps<1 /
//     weight≤0 / non-finite, UNROUNDED, no upper rep bound (grouping sites
//     filter rows with validE1rmSet instead — never a bare 0 sentinel).
//     Citation: Epley 1985; LeSure et al. 1997, J Strength Cond Res.
//   · E1RM_MAX_REPS = 12 — accuracy best ≤10 reps, acceptable to ~12
//     (LeSure et al. 1997, JSCR); 13+ reps have no honest estimate.
//   · validE1rmSet(reps, weightKg) — 1-12 reps at a positive load, finite
//     guards; the row filter every grouping site applies BEFORE any
//     top-set / trend / PR-pace math.
export { epleyE1rm, validE1rmSet, E1RM_MAX_REPS } from "@/lib/strength-science"

/** One logged working set, day-keyed, as fed into the progression engine. */
export interface ProgressionInput {
  day: string
  sets: number
  reps: number
  weightKg: number
  durationMin: number
  /** R8-a: reps-in-reserve captured on the last set (0 = failure, 5 = easy).
   *  Optional + nullable — legacy rows and RIR-less call sites are unchanged. */
  lastRir?: number | null
}

/** One per-exercise intelligence row from GET /api/progression. */
export interface ProgressionEntryDTO {
  name: string
  /** Normalized grouping key echoed for cheap client-side matching. */
  key?: string
  type: string
  sessions: number
  firstDay: string | null
  lastDay: string | null
  lastLog: { day: string; sets: number; reps: number; weightKg: number; durationMin?: number; e1rm: number }
  bestE1rm: number
  bestE1rmDay: string | null
  trend: { day: string; e1rm: number; sets?: number; reps?: number; weightKg?: number }[]
  suggestion: Suggestion
}

export type SuggestionAction = "BUMP LOAD" | "ADD REPS" | "HOLD" | "LOG MORE"

export interface Suggestion {
  action: SuggestionAction
  detail: string
}

/** History row shape consumed by suggest() — e1RM-keyed per-session top sets. */
export type ProgressionHistoryRow = {
  day: string
  e1rm: number
  weightKg: number
  reps: number
  /** R8-a: optional RIR echoed on the row (last row wins when no explicit
   *  third argument is passed to suggest). Absent = not captured. */
  lastRir?: number | null
}

/**
 * Double-progression verdict from per-session history (chronological).
 * - <3 sessions → LOG MORE (guidance unlocks at 3)
 * - progressing (last e1rm ≥ prev × 1.02) → BUMP LOAD (+2.5 kg upper / +5 kg lower heuristic)
 * - flat (within ±2%) → ADD REPS
 * - declining (< prev × 0.98) → HOLD
 * - bodyweight-only history (both weights 0) judges reps instead → ADD REPS / HOLD
 *
 * R8-a effort modulation (only when RIR was captured — null/undefined keeps the
 * verdict and detail byte-identical to the legacy engine):
 * - RIR 0 (true failure): prescribed bump/rep counts HALVED (recover first);
 *   a HOLD verdict stays HOLD with "· RIR 0 — RECOVER FIRST"
 * - RIR 1-2 (productive zone): verdict unchanged, detail annotated "· RIR N"
 * - RIR ≥ 3 (easy set): prescribed counts ×1.5 — standard double progression
 *   says an easy set earns a harder next step
 */
export function suggest(
  history: ProgressionHistoryRow[],
  isLower = false,
  lastRir?: number | null
): Suggestion {
  const base = baseSuggest(history, isLower)
  // explicit argument wins; otherwise the last history row may carry it
  const rir =
    lastRir != null ? lastRir : history.length > 0 ? (history[history.length - 1].lastRir ?? null) : null
  if (rir == null) return base
  return applyRir(base, rir)
}

/** Legacy verdict engine — the exact pre-R8 logic, untouched (byte-identical). */
function baseSuggest(
  history: { day: string; e1rm: number; weightKg: number; reps: number }[],
  isLower: boolean
): Suggestion {
  if (history.length < 3) {
    return { action: "LOG MORE", detail: "Log 2-3 more sessions to unlock progression guidance" }
  }
  const last = history[history.length - 1]
  const prev = history[history.length - 2]

  // Bodyweight-only track: e1rm is always 0, so rep progression is the signal.
  if (last.weightKg <= 0 && prev.weightKg <= 0) {
    if (last.reps > prev.reps) {
      return { action: "ADD REPS", detail: "Add 1-2 reps before adding load" }
    }
    return { action: "HOLD", detail: "Repeat the last effort — consolidate before pushing" }
  }

  if (last.e1rm >= prev.e1rm * 1.02) {
    return {
      action: "BUMP LOAD",
      detail: isLower
        ? "+5 kg next session (lower-body heuristic)"
        : "+2.5 kg next session (upper-body heuristic)",
    }
  }
  if (last.e1rm >= prev.e1rm * 0.98) {
    return { action: "ADD REPS", detail: "Add 1-2 reps at the same load before adding weight" }
  }
  return { action: "HOLD", detail: "Repeat the last working load — consolidate before pushing" }
}

/** Rounds a modulated increment to 1 decimal (matches fmtKg/parseBumpKg output). */
const round1 = (n: number) => Math.round(n * 10) / 10

/** Rewrites the "+N kg" increment inside a BUMP LOAD detail line. */
function retargetBumpKg(detail: string, kg: number): string {
  return detail.replace(/(\d+(?:\.\d+)?)\s*kg/i, `${kg} kg`)
}

/** Rewrites the "1-2 reps" range inside an ADD REPS detail line. */
function retargetReps(detail: string, range: string): string {
  return detail.replace("1-2 reps", range)
}

/** Deterministic RIR modulation on top of a legacy verdict (see suggest docs). */
function applyRir(s: Suggestion, rir: number): Suggestion {
  const tag = `· RIR ${rir}`
  if (s.action === "BUMP LOAD") {
    if (rir <= 0) {
      return { action: "BUMP LOAD", detail: `${retargetBumpKg(s.detail, round1(parseBumpKg(s.detail) / 2))} ${tag}` }
    }
    if (rir >= 3) {
      return { action: "BUMP LOAD", detail: `${retargetBumpKg(s.detail, round1(parseBumpKg(s.detail) * 1.5))} ${tag}` }
    }
    return { action: s.action, detail: `${s.detail} ${tag}` }
  }
  if (s.action === "ADD REPS") {
    if (rir <= 0) return { action: "ADD REPS", detail: `${retargetReps(s.detail, "1 rep")} ${tag}` }
    if (rir >= 3) return { action: "ADD REPS", detail: `${retargetReps(s.detail, "2-3 reps")} ${tag}` }
    return { action: s.action, detail: `${s.detail} ${tag}` }
  }
  if (s.action === "HOLD") {
    return { action: "HOLD", detail: rir <= 0 ? `${s.detail} ${tag} — RECOVER FIRST` : `${s.detail} ${tag}` }
  }
  return { action: "LOG MORE", detail: `${s.detail} ${tag}` }
}

/**
 * One-line effort coaching for a captured RIR value — shared by the log sheet
 * (R8-a) and the live-session feedback so the mapping never drifts.
 * null / not-captured → null.
 */
export function rirVerdictLine(rir: number | null): string | null {
  if (rir == null || !Number.isFinite(rir)) return null
  if (rir <= 0) return "TRUE FAILURE — PROGRESS WITH CARE"
  if (rir <= 1) return "VERY CLOSE — GROWTH ZONE"
  if (rir <= 3) return "PRODUCTIVE — THE SWEET SPOT"
  return "EASY — LEAVE 2-3 NEXT TIME"
}

/** Extracts the "+N kg" increment from a BUMP LOAD detail line (default 2.5). */
export function parseBumpKg(detail: string): number {
  const m = /(\d+(?:\.\d+)?)\s*kg/i.exec(detail ?? "")
  if (!m) return 2.5
  const v = Number(m[1])
  return Number.isFinite(v) && v > 0 ? v : 2.5
}
