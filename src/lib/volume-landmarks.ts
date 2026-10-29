// ─── PRIME · Volume landmarks (R8-b — Effort & Volume Science round) ──────────
// Weekly hard-set readout per muscle vs evidence-informed landmark ranges:
// "am I doing enough volume?" becomes a number next to a band, not a guess.
//
// CITATION INTEGRITY: the table below is Israetel 2020 (Renaissance
// Periodization volume landmarks — evidence-informed expert GUIDELINES, not
// laws). Every number here comes from that table and nowhere else; the panel
// footer states the caveat where the readout is rendered. CORE and FULL BODY
// carry no landmark and are rendered as observation-only rows — we show what
// was logged without pretending to know its optimal range.

import { EXERCISES } from "@/lib/exercises"
import { progressionKey } from "@/lib/progression"

/** Weekly hard-set landmark band for one muscle (Israetel 2020). */
export interface MuscleLandmark {
  muscle: string
  /** minimum effective volume — weekly sets below this undertrain the muscle */
  mev: number
  /** maximum adaptive volume, low end of the productive band */
  mavLo: number
  /** maximum adaptive volume, high end of the productive band */
  mavHi: number
  /** maximum recoverable volume — above this, recovery starts to buckle */
  mrv: number
}

/** Five zone verdicts (plus the zero case) — tight by design (R8-b spec). */
export type VolumeZone = "UNTRAINED" | "UNDER" | "PRODUCTIVE" | "STIMULATING" | "OVERREACH"

/** One rendered row: a muscle's weekly hard sets vs its landmark (if any). */
export interface MuscleVolumeReadout {
  muscle: string
  /** hard sets in the last 7 days (indirect sets counted) */
  weeklySets: number
  /** null → observation-only row (CORE / FULL BODY): no landmark exists */
  landmark: MuscleLandmark | null
  /** null → no landmark to zone against */
  zone: VolumeZone | null
}

/** Israetel 2020 weekly set landmarks — GUIDELINES, not laws. Exact table. */
export const VOLUME_LANDMARKS: MuscleLandmark[] = [
  { muscle: "CHEST", mev: 8, mavLo: 12, mavHi: 20, mrv: 22 },
  { muscle: "BACK", mev: 10, mavLo: 14, mavHi: 22, mrv: 25 },
  { muscle: "SHOULDERS", mev: 8, mavLo: 12, mavHi: 20, mrv: 26 },
  { muscle: "QUADS", mev: 8, mavLo: 12, mavHi: 18, mrv: 20 },
  { muscle: "HAMSTRINGS", mev: 6, mavLo: 10, mavHi: 16, mrv: 20 },
  { muscle: "GLUTES", mev: 4, mavLo: 8, mavHi: 16, mrv: 16 },
  { muscle: "BICEPS", mev: 8, mavLo: 14, mavHi: 20, mrv: 28 },
  { muscle: "TRICEPS", mev: 6, mavLo: 10, mavHi: 14, mrv: 18 },
  { muscle: "CALVES", mev: 8, mavLo: 12, mavHi: 16, mrv: 20 },
]

/** The one caveat the whole readout runs on — rendered in the panel footer. */
export const LANDMARK_FOOTER =
  "WEEKLY SET LANDMARKS ARE GUIDELINES, NOT LAWS (ISRAETEL 2020) — INDIRECT SETS COUNTED · CARDIO/MOBILITY SETS EXCLUDED (NOT HARD RESISTANCE SETS)"

const BY_MUSCLE = new Map(VOLUME_LANDMARKS.map((l) => [l.muscle, l]))

/** Muscles that get an observation row when non-zero but hold no landmark. */
const OBSERVATION_MUSCLES: string[] = ["CORE", "FULL BODY"]

/** Library index by normalized name — same key the progression engine uses. */
const EXERCISE_BY_KEY = new Map(EXERCISES.map((e) => [progressionKey(e.name), e]))

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Landmark for a muscle tag, or null when the muscle has no landmark. */
export function landmarkFor(muscle: string): MuscleLandmark | null {
  return BY_MUSCLE.get(muscle) ?? null
}

/**
 * Zone verdict for a weekly set count against a landmark:
 * 0 → UNTRAINED · <MEV → UNDER · MEV..MAV-hi → PRODUCTIVE ·
 * MAV-hi..MRV → STIMULATING · >MRV → OVERREACH (inclusive upper bounds).
 */
export function zoneFor(weeklySets: number, landmark: MuscleLandmark): VolumeZone {
  if (weeklySets <= 0) return "UNTRAINED"
  if (weeklySets < landmark.mev) return "UNDER"
  if (weeklySets <= landmark.mavHi) return "PRODUCTIVE"
  if (weeklySets <= landmark.mrv) return "STIMULATING"
  return "OVERREACH"
}

/** One logged exercise row as fed to the tally (7-day window enforced inside). */
export interface VolumeLogInput {
  name: string
  sets: number
  createdAt: Date
  /** R68 — the log's exercise type ("strength" | "bodyweight" | "cardio" |
   *  "mobility", as stored on ExerciseLog.type). Optional for legacy callers;
   *  absent rows keep counting (the API always sends it now). */
  type?: string
}

/** R68 — exercise classes that are NOT hard resistance sets. Israetel's
 * MEV/MAV/MRV landmarks count challenging RESISTANCE sets; a walk or a
 * stretch is not one, so cardio/mobility rows never enter the tally. */
const NON_RESISTANCE_TYPES = new Set(["cardio", "mobility"])

/**
 * Tally hard sets per muscle tag over the last 7 days.
 * - resolves each log's exercise by normalized name (progressionKey)
 * - counts the sets into EVERY muscle the library entry tags (indirect volume
 *   counts — the footer says so)
 * - unresolved names (custom entries) contribute to NO muscle — honest: we
 *   don't know what they hit
 * - FULL BODY-tagged entries land in a "FULL BODY" observation key, no landmark
 * - logs older than 7 days (or with non-positive sets) are skipped
 * - R68 — cardio/mobility rows are skipped entirely: they are not hard
 *   resistance sets, and the Israetel landmarks do not count them (a walk or
 *   a stretch must not inflate the readout — the footer discloses it)
 */
export function tallyWeeklySets(logs: VolumeLogInput[]): Map<string, number> {
  const cutoff = Date.now() - WEEK_MS
  const tally = new Map<string, number>()
  for (const log of logs) {
    if (log.createdAt.getTime() < cutoff) continue
    if (!Number.isFinite(log.sets) || log.sets <= 0) continue
    if (log.type && NON_RESISTANCE_TYPES.has(log.type.toLowerCase())) continue
    const exercise = EXERCISE_BY_KEY.get(progressionKey(log.name))
    if (!exercise) continue
    for (const muscle of exercise.muscles) {
      tally.set(muscle, (tally.get(muscle) ?? 0) + log.sets)
    }
  }
  return tally
}

/**
 * Assemble the full readout: ALL landmark muscles (even 0-set ones — the gap
 * is the point), ordered by weeklySets desc then muscle name asc, with CORE /
 * FULL BODY observation rows appended when non-zero (ordered likewise).
 */
export function buildVolumeReadouts(tally: Map<string, number>): MuscleVolumeReadout[] {
  const rows: MuscleVolumeReadout[] = VOLUME_LANDMARKS.map((landmark) => {
    const weeklySets = tally.get(landmark.muscle) ?? 0
    return { muscle: landmark.muscle, weeklySets, landmark, zone: zoneFor(weeklySets, landmark) }
  })
  rows.sort((a, b) => b.weeklySets - a.weeklySets || a.muscle.localeCompare(b.muscle))

  const observations = OBSERVATION_MUSCLES.map((muscle) => ({
    muscle,
    weeklySets: tally.get(muscle) ?? 0,
    landmark: null as MuscleLandmark | null,
    zone: null as VolumeZone | null,
  }))
    .filter((r) => r.weeklySets > 0)
    .sort((a, b) => b.weeklySets - a.weeklySets || a.muscle.localeCompare(b.muscle))

  return [...rows, ...observations]
}
