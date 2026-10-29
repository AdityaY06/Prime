// ─── PRIME · Recovery library (R19-b — muscle freshness map) ──────────────────
// Pure data + pure functions only (safe to import from client components).
// Fitbod parity: every muscle carries a recovery state (FRESH → RECOVERING →
// FATIGUED) derived from last-trained recency, steering exercise selection
// AWAY from fatigued muscles and TOWARD fresh ones.
//
// MUSCLE VOCABULARY: the same volume-landmarks vocabulary (R8-b) — a log's
// name resolves to a library exercise via progressionKey, and the exercise's
// uppercase muscle tags (CHEST/BACK/…/CALVES) are the muscle ids here, so the
// weekly-sets readout and the freshness map always agree on what a lift hit.
//
// CITATION INTEGRITY: the recovery timescale below carries its sources in the
// adjacent comments and in RECOVERY_CITATIONS (surfaced in the panel's
// footnote). These are evidence-informed GUIDELINES, not laws — the same
// honesty the volume landmarks run on. The Fitbod per-muscle recovery state
// is a convention homage; the curve itself is ours, documented in full.
//
// R70 — DAY ATTRIBUTION ROLLS WITH THE HUNTER'S TIMEZONE: lastTrainedByMuscle
// (and recoveryView, which threads it) take an optional `tz` and bucket
// session-start days via dayKeyIn (lib/game's R38 primitive — import-free,
// so no cycle; null/undefined/invalid zone → legacy server-local key, the
// documented contract). hoursSince/setsSince numerics are byte-identical —
// only the calendar day a session STARTED on moves. Both BODY-tab surfaces
// (the freshness panel and /api/body's 3D-scanner mirror) thread the hunter's
// timezone, so they agree on day attribution BY CONSTRUCTION now, not by
// mirroring a shared server-local assumption (R69's honest residual #1).

import { EXERCISES } from "@/lib/exercises"
import { progressionKey } from "@/lib/progression"
import { dayKeyIn } from "@/lib/game"

// ─── The recovery curve ───────────────────────────────────────────────────────
// A trained muscle recovers on a ~48–72h timescale:
//   · muscle protein synthesis stays elevated roughly 24–48h after a session
//     (Schoenfeld BJ, "The mechanisms of muscle hypertrophy and their
//     application to resistance training", J Strength Cond Res
//     2010;24:2857–2872 — the MPS-window heuristic);
//   · practical guidance spaces same-muscle hard sessions ~48–72h apart
//     (Schoenfeld, Ogborn & Krieger, "Dose-response relationship between
//     weekly resistance training frequency and … hypertrophy", Sports Med
//     2016;46:1689–1697 — training each muscle ≥2×/week is at least as good
//     as less frequent, i.e. the re-train window is ~3–4 days at most);
//   · HARD or unfamiliar sessions leave damage (edema, disruption) that
//     outlasts the MPS window (Damas F et al., Eur J Appl Physiol
//     2016;116:49–56) — the volume-slowdown modifier's rationale.
//
// Curve (ours, documented):
//   score(h, sets) = 100 × (1 − e^(−(h_eff / 28.8)^1.25))
//   h_eff = h / volumeFactor(sets)
//   volumeFactor = min(2, 1 + 0.05 × max(0, sets − 6))
//
// With a moderate session (≤6 sets that day, volumeFactor 1) the anchors are:
//   0h → 0% · 24h ≈ 55% · 48h ≈ 85% · 72h ≈ 96% · ~120h ≈ 99.7 (asymptote).
// Heavier recent volume slows the clock instead of capping the score: each
// set past 6 on the last training day adds +5% slowdown, capped at ×2 (a
// 12-set day stretches time ×1.3 — 48h reads ≈74% and FRESH slips from ~42h
// to ~55h; a 20-set day ×1.7; anything ≥26 sets that day ×2, where FRESH
// needs ~84h). A cap, not a permanent penalty: no day of training leaves a
// muscle permanently unrecovered.

/** Recovery time-constant (hours) — with CURVE_POWER, fixes the 24h≈55 / 48h≈85 anchors. */
export const RECOVERY_TAU_H = 28.8

/** Curve exponent (>1: slight toe, then concave recovery — fastest mid-window). */
export const RECOVERY_POWER = 1.25

/** Sets on the last training day at or below which the baseline curve applies. */
export const VOLUME_EDGE_SETS = 6

/** Slowdown added per set beyond VOLUME_EDGE_SETS (5% each). */
export const SLOWDOWN_PER_SET = 0.05

/** Maximum cumulative slowdown (×2 — beyond this no evidence, kept honest). */
export const MAX_SLOWDOWN = 2

/** FRESH verdict edge (inclusive) — teal. */
export const FRESH_EDGE = 80

/** FATIGUED edge (exclusive below) — rose; between the edges is RECOVERING. */
export const FATIGUED_EDGE = 40

// ─── Types ────────────────────────────────────────────────────────────────────

/** The session fields the recovery model consumes (structural subset of SessionDTO). */
export interface RecoverySessionInput {
  /** only "cleared" sessions count — abandoned raids carry no completed work */
  status: string
  /** ISO timestamp — the training time credited to every log in the session
   *  (the wire DTO carries no per-log createdAt; within-session minutes are
   *  invisible at 48–72h granularity, same day-attribution convention as
   *  lib/load.ts) */
  startedAt: string | Date
  logs: { name: string; sets: number }[]
}

/** Recency record for one muscle (lastTrainedByMuscle's value). */
export interface MuscleRecency {
  /** yyyy-mm-dd calendar day of the most recent training (session start), in
   *  the caller's timezone when threaded — hunter-tz on both live surfaces */
  lastTrainedDay: string
  /** hours since that session started (timezone-independent) */
  hoursSince: number
  /** sets logged on that calendar day that touched this muscle */
  setsSince: number
}

/** Freshness verdict — semantic hues: teal / amber / rose. */
export type FreshnessVerdict = "FRESH" | "RECOVERING" | "FATIGUED"

/** One rendered row of the freshness grid. */
export interface MuscleFreshness {
  /** uppercase library muscle tag (CHEST / BACK / …) — doubles as the label */
  muscleId: string
  /** display label (the tag itself — house uppercase mono idiom) */
  label: string
  /** 0–100 recovery score (100 = never trained / fully recovered) */
  score: number
  verdict: FreshnessVerdict
  /** null = never trained */
  lastTrainedDay: string | null
  /** null = never trained */
  hoursSince: number | null
  /** sets on the last training day (0 when never trained) */
  setsSince: number
}

/** Clean DTO for the BODY tab's freshness surface. */
export type RecoveryView = {
  /** all landmark muscles (+ observation rows with a training record),
   *  fatigue-ascending: most-fatigued first — the actionable head */
  muscles: MuscleFreshness[]
  /** FRESH muscle ids, ranked score desc then id asc (steering headline) */
  ready: string[]
  /** non-FRESH muscle ids, score ascending — most urgent first */
  recovering: string[]
  /** set when no cleared sessions exist — the honest all-fresh empty state */
  emptyNote: string | null
  citations: string[]
}

/** The panel's footnote sources (house citation discipline). */
export const RECOVERY_CITATIONS: string[] = [
  "Freshness 0–100 = 100·(1−e^(−(h/28.8)^1.25)) over last-trained recency — MPS stays elevated ~24–48h post-session (Schoenfeld, J Strength Cond Res 2010;24:2857–2872) inside a ~48–72h practical re-train window (Schoenfeld, Ogborn & Krieger, Sports Med 2016;46:1689–1697). Anchors: 24h ≈ 55 · 48h ≈ 85 · 72h ≈ 96. GUIDELINES, not laws.",
  "Heavier recent volume slows the clock: each set past 6 on the last training day adds +5% slowdown, capped ×2 — after Damas et al., Eur J Appl Physiol 2016;116:49–56 (hard sessions leave damage outlasting the MPS window).",
  "Verdicts: FRESH ≥80 · RECOVERING 40–79 · FATIGUED <40 — steering bands, not physiological thresholds; per-muscle recovery states are the Fitbod app convention as homage, not their algorithm.",
]

/** Compact footnote line rendered under the freshness grid (R18-d LOAD-console idiom). */
export const RECOVERY_FOOTER =
  "FRESHNESS 0–100 = 100·(1−E^(−(H/28.8)^1.25)) · MPS ~24–48H (SCHOENFELD 2010, JSCR) · RE-TRAIN 48–72H (SCHOENFELD, OGBORN & KRIEGER 2016) · VOLUME SLOWDOWN AFTER DAMAS 2016, EJAP · FRESH ≥80 · RECOVERING 40–79 · FATIGUED <40 — GUIDELINES, NOT LAWS"

// ─── Log-name resolution (volume-landmarks approach, reused verbatim) ─────────

/** Library index by normalized name — same key the progression engine uses. */
const EXERCISE_BY_KEY = new Map(EXERCISES.map((e) => [progressionKey(e.name), e]))

/** The 9 landmark muscles — always rendered (the never-trained gap is the point). */
const LANDMARK_MUSCLES = ["CHEST", "BACK", "SHOULDERS", "QUADS", "HAMSTRINGS", "GLUTES", "BICEPS", "TRICEPS", "CALVES"]

/** Observation muscles — rendered only when they carry a training record. */
const OBSERVATION_MUSCLES = ["CORE", "FULL BODY"]

const HOUR_MS = 3_600_000

// ─── lastTrainedByMuscle ──────────────────────────────────────────────────────

/**
 * Recency record per muscle tag, from CLEARED sessions only:
 * - resolves each log's exercise by normalized name (progressionKey — the
 *   volume-landmarks matching: exact after trim/lowercase/collapse)
 * - counts the log into EVERY muscle the library entry tags (indirect volume
 *   counts, same disclosure the weekly-sets readout runs on)
 * - unresolved names (custom entries) contribute to NO muscle — honest: we
 *   don't know what they hit
 * - setsSince sums every log on the lastTrainedDay (multiple sessions that
 *   day included; midnight-straddling sessions belong to the day they
 *   STARTED — in `tz` when threaded, R70), non-positive/non-finite sets
 *   skipped
 * - `now` defaults to the wall clock; recoveryView threads its own clock in;
 *   `tz` defaults to absent = legacy server-local days (dayKeyIn's contract)
 */
export function lastTrainedByMuscle(
  sessions: RecoverySessionInput[],
  now: Date = new Date(),
  tz?: string | null,
): Record<string, MuscleRecency> {
  // day → muscle → sets, plus the latest training timestamp per muscle
  const daySets = new Map<string, Map<string, number>>()
  const lastAt = new Map<string, number>()

  for (const s of sessions) {
    if (s.status !== "cleared") continue
    const started = new Date(s.startedAt)
    const at = started.getTime()
    if (!Number.isFinite(at)) continue
    const day = dayKeyIn(tz, started)

    for (const log of s.logs) {
      if (!Number.isFinite(log.sets) || log.sets <= 0) continue
      const exercise = EXERCISE_BY_KEY.get(progressionKey(log.name))
      if (!exercise) continue
      for (const muscle of exercise.muscles) {
        const prev = lastAt.get(muscle)
        if (prev === undefined || at > prev) lastAt.set(muscle, at)
        const byMuscle = daySets.get(day) ?? new Map<string, number>()
        byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + log.sets)
        daySets.set(day, byMuscle)
      }
    }
  }

  const out: Record<string, MuscleRecency> = {}
  const nowMs = now.getTime()
  for (const [muscle, at] of lastAt) {
    const started = new Date(at)
    const day = dayKeyIn(tz, started)
    out[muscle] = {
      lastTrainedDay: day,
      hoursSince: (nowMs - at) / HOUR_MS,
      setsSince: daySets.get(day)?.get(muscle) ?? 0,
    }
  }
  return out
}

// ─── The curve ────────────────────────────────────────────────────────────────

/** Volume slowdown factor for the sets logged on the last training day. */
export function volumeFactor(setsSince: number): number {
  if (!Number.isFinite(setsSince) || setsSince <= VOLUME_EDGE_SETS) return 1
  return Math.min(MAX_SLOWDOWN, 1 + SLOWDOWN_PER_SET * (setsSince - VOLUME_EDGE_SETS))
}

/**
 * Freshness score 0–100 from recency and last-day volume.
 * Never-trained / non-finite recency → 100 (fully fresh — the honest default:
 * absence of training cannot be fatigue). Negative hours (clock skew) clamp
 * to 0 (train-time). See the header for the curve and its anchors.
 */
export function freshness(hoursSince: number, setsSince: number): number {
  if (!Number.isFinite(hoursSince)) return 100
  const h = Math.max(0, hoursSince) / volumeFactor(setsSince)
  const score = 100 * (1 - Math.exp(-Math.pow(h / RECOVERY_TAU_H, RECOVERY_POWER)))
  return Math.min(100, Math.max(0, score))
}

/** Verdict from a score: FRESH ≥80 (teal) · RECOVERING 40–79 (amber) · FATIGUED <40 (rose). */
export function freshnessVerdict(score: number): FreshnessVerdict {
  if (!Number.isFinite(score)) return "FRESH"
  if (score >= FRESH_EDGE) return "FRESH"
  if (score >= FATIGUED_EDGE) return "RECOVERING"
  return "FATIGUED"
}

// ─── recoveryView ─────────────────────────────────────────────────────────────

/**
 * Assemble the freshness map DTO (`tz` threads into lastTrainedByMuscle —
 * R70; absent/null keeps legacy server-local day attribution):
 * - ALL 9 landmark muscles render (never-trained ones read 100 FRESH — the
 *   gap is the point), CORE / FULL BODY as observation rows when a record
 *   exists (no landmark, same idiom as the weekly-sets readout)
 * - rows ordered fatigue-ascending (score asc, then id asc) — the actionable
 *   head: what to avoid sits on top
 * - ready: FRESH ids ranked (score desc, then id asc) for the headline strip
 * - recovering: non-FRESH ids, most urgent first
 * - zero cleared sessions → all-fresh + emptyNote (honest empty state)
 */
export function recoveryView(
  sessions: RecoverySessionInput[] | null | undefined,
  now: Date,
  tz?: string | null,
): RecoveryView {
  const recency = lastTrainedByMuscle(sessions ?? [], now, tz)
  const hasHistory = Object.keys(recency).length > 0

  const rows: MuscleFreshness[] = []
  const pushRow = (muscleId: string) => {
    const r = recency[muscleId]
    if (r) {
      const score = freshness(r.hoursSince, r.setsSince)
      rows.push({
        muscleId,
        label: muscleId,
        score,
        verdict: freshnessVerdict(score),
        lastTrainedDay: r.lastTrainedDay,
        hoursSince: r.hoursSince,
        setsSince: r.setsSince,
      })
    } else if (LANDMARK_MUSCLES.includes(muscleId)) {
      rows.push({
        muscleId,
        label: muscleId,
        score: 100,
        verdict: "FRESH",
        lastTrainedDay: null,
        hoursSince: null,
        setsSince: 0,
      })
    }
  }
  for (const m of LANDMARK_MUSCLES) pushRow(m)
  for (const m of OBSERVATION_MUSCLES) pushRow(m) // observation rows: only with a record

  rows.sort((a, b) => a.score - b.score || a.muscleId.localeCompare(b.muscleId))

  const fresh = rows.filter((r) => r.verdict === "FRESH")
  const stale = rows.filter((r) => r.verdict !== "FRESH")
  fresh.sort((a, b) => b.score - a.score || a.muscleId.localeCompare(b.muscleId))
  stale.sort((a, b) => a.score - b.score || a.muscleId.localeCompare(b.muscleId))

  return {
    muscles: rows,
    ready: fresh.map((r) => r.muscleId),
    recovering: stale.map((r) => r.muscleId),
    emptyNote: hasHistory ? null : "NO CLEARED SESSIONS YET — EVERY MUSCLE READS FRESH UNTIL YOU TRAIN IT",
    citations: RECOVERY_CITATIONS,
  }
}
