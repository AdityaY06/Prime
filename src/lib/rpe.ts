// ── PRIME · RPE/RIR autoregulation math — consensus CR10 mapping ──────────────
// Pure, typed, framework-free (client-safe, zero imports — science.ts discipline).
//
// WHY a dedicated module (R30-a): R19-d already captures RIR on logged sets;
// the live raid console now rates actual effort against the plan's target RPE
// and needs ONE shared mapping so the stepper readout, the verdict chip and
// the session autograph can never drift apart. Consensus framing only —
// "RPE 10 ≈ 0 reps in reserve, RPE 9 ≈ 1…" is the standard CR10↔RIR reading —
// no fabricated citations (mirrors src/lib/science.ts honesty rules).

/** Borg CR10 scale points — the 1–10 effort ladder. */
export type RpeScale = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/**
 * Consensus RPE→RIR mapping, table only: 10→0, 9→1, 8→2, 7→3, 6→4.
 * Interpolation/rounding is deliberately NOT invented — the anchors are the
 * honest reading, everything below 6 is the warm-up/easy band where "reps in
 * reserve" stops being meaningful, and non-finite input is unratable.
 * Out-of-range → null; the caller decides how to speak "no answer".
 */
export function rirForRpe(rpe: number): number | null {
  if (!Number.isFinite(rpe)) return null
  const table: Record<number, number> = { 10: 0, 9: 1, 8: 2, 7: 3, 6: 4 }
  const rir = table[rpe]
  return rir === undefined ? null : rir
}

/** How an actual effort read against its prescription. */
export type RpeVerdict = "in-zone" | "push" | "back-off"

/**
 * Verdict of an actual RPE against the prescribed target: within ±0.5 →
 * "in-zone"; below target−0.5 → "push" (effort undershot — leave fewer reps
 * in reserve); above target+0.5 → "back-off" (effort overshot — autoregulate
 * the load down). The ±0.5 tolerance absorbs honest rounding between anchors.
 */
export function rpeVerdict(actual: number, target: number): RpeVerdict {
  if (actual < target - 0.5) return "push"
  if (actual > target + 0.5) return "back-off"
  return "in-zone"
}

/**
 * Display copy per verdict — label is the short chip/autograph word, hint is
 * the full one-line guidance the live raid surfaces at rating time.
 */
export const RPE_VERDICT_META: Record<RpeVerdict, { label: string; hint: string }> = {
  "in-zone": { label: "IN ZONE", hint: "ON TARGET — EFFORT MATCHES THE PRESCRIPTION" },
  push: { label: "PUSH", hint: "BELOW TARGET — LEAVE FEWER REPS IN RESERVE" },
  "back-off": { label: "BACK OFF", hint: "ABOVE TARGET — AUTOREGULATE DOWN" },
}

/**
 * One-line intensity descriptor per CR10 anchor: 10 = maximal, 9 = 1 rep
 * left… 6 = 4+ reps left; ≤5 collapses to the warm-up/easy bucket (the RIR
 * reading stops being meaningful there). Unratable input (non-finite or off
 * the scale) returns "—" rather than inventing an anchor.
 */
export function describeRpe(rpe: number): string {
  if (!Number.isFinite(rpe) || rpe < 1 || rpe > 10) return "—"
  if (rpe >= 10) return "MAXIMAL — NOTHING LEFT IN THE TANK"
  if (rpe >= 9) return "1 REP LEFT — COULD NOT REPEAT"
  if (rpe >= 8) return "2 REPS LEFT — HARD BUT CLEAN"
  if (rpe >= 7) return "3 REPS LEFT — CHALLENGING"
  if (rpe >= 6) return "4+ REPS LEFT — MODERATE WORK"
  return "WARM-UP / EASY EFFORT"
}
