// ─── PRIME · Strength science (R69-a) ─────────────────────────────────────────
// The SINGLE SOURCE OF TRUTH for 1RM estimation and the barbell warm-up ramp.
//
// POLICY (closes audit 2-b / I3 — "the drift root cause"): every 1RM in PRIME
// delegates here; a formula change happens in exactly one place. The five
// historical implementations are now thin, contract-preserving wrappers:
//   · lib/progression.ts      → re-exports epleyE1rm / validE1rmSet / E1RM_MAX_REPS
//   · lib/lifting-math.ts     → re-exports estimate1RM; warmupSets reads WARMUP_RAMP
//   · lib/muscles.ts          → epley1RM wraps epleyE1rm (its own guard contract)
//   · lib/fitness/calc.ts     → epley1RM / brzycki1RM / estimate1RM delegate below
// One formula core, several documented guard/rounding conventions — the core
// is shared, the rounding is not.
//
// CITATION REGISTRY (everything this module owns):
//   · Epley B. "The Method" (1985, Nebraska strength-coach handout) —
//     1RM ≈ w × (1 + r/30)
//   · LeSure et al. 1997, J Strength Cond Res — Epley cross-validated against
//     measured 1RMs; accuracy best at ≤10 reps, acceptable to ~12
//   · Brzycki M. 1993, JOPERD 64:88-90 — "Strength Testing: Predicting a
//     One-Rep Max from Reps-to-Fatigue" — 1RM ≈ w × 36/(37 − r)
//   · McGowan et al. 2015, Sports Med 45(11) "Warm-Up Strategies for Sport" —
//     ramped intensity ≈40-60% → ≈70% → ≈80-90% of working load with
//     decreasing volume (WARMUP_RAMP)
//
// Pure + isomorphic: no React, no "use client", no server-only imports, no
// side effects — safe from any route, component, script or worker.

// ── The one formula core ──────────────────────────────────────────────────────

/**
 * Epley validity ceiling: 12 reps.
 *
 * Epley's accuracy is best at ≤10 reps and acceptable to ~12 (LeSure et al.
 * 1997, J Strength Cond Res — cross-validation against measured 1RMs);
 * Brzycki's linear relationship is similarly validated in the sub-10-12
 * range. 13+ reps → no honest estimate (a 20-rep set "estimates" ~1.67× the
 * load — an inflated number, not a max).
 */
export const E1RM_MAX_REPS = 12

/**
 * The raw Epley core — the ONE expression every Epley estimate in PRIME
 * computes: `w × (1 + r/30)`, with the R68 r=1 identity pin: a 1-rep set IS
 * the measured 1RM, so `reps === 1` returns the load itself (the formula
 * would add a spurious +3.3% to an actual maximum — prediction equations
 * exist for submaximal reps only).
 *
 * Private on purpose: exported entry points apply their own documented
 * guard/rounding conventions AROUND this core; nobody computes Epley
 * anywhere else.
 */
function epleyCore(weight: number, reps: number): number {
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/**
 * The raw Brzycki core: `w × 36 / (37 − r)`. Naturally exact at r=1
 * (36/36 = 1 — the load itself), so no pin is needed. Private for the same
 * reason as {@link epleyCore}.
 */
function brzyckiCore(weight: number, reps: number): number {
  return (weight * 36) / (37 - reps)
}

/**
 * The honest estimation domain shared by the null-returning estimators:
 * integer reps 1..E1RM_MAX_REPS at a positive finite load. Outside it no 1RM
 * estimate exists, so the honest answer is `null` — never a fabricated value.
 */
function inE1rmDomain(w: number, r: number): boolean {
  return (
    Number.isFinite(w) &&
    w > 0 &&
    Number.isFinite(r) &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= E1RM_MAX_REPS
  )
}

// ── Epley entry points (three documented conventions, one core) ───────────────

/**
 * Epley estimated 1RM = `w × (1 + reps/30)`, UNROUNDED (the progression.ts
 * contract, byte-identical since R1-c/R68).
 *
 * Guarded: returns 0 when reps < 1, weight ≤ 0, or either input is
 * non-finite (bodyweight / cardio rows).
 *
 * Deliberately NO upper rep bound: the R68 design filters rows at every
 * grouping site with {@link validE1rmSet} instead — a bare 0-sentinel here
 * would collapse an all-invalid history into suggest()'s BUMP-LOAD branch
 * (0 ≥ 0 × 1.02).
 *
 * Citation: Epley B. "The Method" (1985, Nebraska strength-coach handout);
 * cross-validated against measured 1RMs by LeSure et al. 1997, J Strength
 * Cond Res.
 *
 * @example epleyE1rm(100, 5) // 116.66666666666667 — exact, unrounded
 */
export function epleyE1rm(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return 0
  if (reps < 1 || weightKg <= 0) return 0
  return epleyCore(weightKg, reps)
}

/**
 * R68 — true iff a logged set carries an honest Epley e1RM (1-12 reps at a
 * positive load). Grouping sites filter ROWS on this BEFORE any top-set /
 * trend / PR-pace math — never via a bare 0 sentinel (0 ≥ 0×1.02 would
 * collapse an all-invalid history into suggest()'s BUMP-LOAD branch).
 */
export function validE1rmSet(reps: number, weightKg: number): boolean {
  if (!Number.isFinite(reps) || !Number.isFinite(weightKg)) return false
  return reps >= 1 && reps <= E1RM_MAX_REPS && weightKg > 0
}

/**
 * Epley e1RM, INTEGER-rounded — the fitness/calc.ts display convention.
 *
 * Guard shape preserved from the legacy muscles.ts implementation
 * (0-sentinel for non-finite/non-positive load or reps ≤ 0; the legacy
 * `reps ≥ 37 → the load itself` branch is kept for contract compatibility).
 * r=1 identity pin applies (rounded to the integer convention).
 *
 * NOTE: no upper rep bound — this is the legacy guard shape, not the honest
 * domain. Callers that must enforce Epley's validity ceiling gate with
 * {@link validE1rmSet} / {@link estimate1RM} first (lib/fitness/calc.ts
 * does exactly that).
 *
 * @example epley1RMRound(100, 5) // 117
 */
export function epley1RMRound(w: number, r: number): number {
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0) return 0
  if (r <= 0) return 0
  if (r >= 37) return Math.round(w)
  return Math.round(epleyCore(w, r))
}

/**
 * Estimated one-rep max via the Epley formula, rounded to 2 decimals — the
 * lifting-math.ts contract.
 *
 * Returns `null` when the input is invalid, non-integer, or outside the 1-12
 * rep domain — the formula's accuracy decays sharply past a dozen reps (a
 * 15-rep set "estimates" a max most lifters cannot hit), so the honest
 * answer is no estimate at all rather than a confident wrong number.
 *
 * Citation: Epley B. "The Method" (1985, Nebraska strength-coach handout);
 * cross-validated against measured 1RMs by LeSure et al. 1997, J Strength
 * Cond Res — accuracy is best at ≤10 reps and acceptable to ~12.
 *
 * @example estimate1RM(100, 5) // 116.67 — 100 kg × (1 + 5/30)
 */
export function estimate1RM(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || weight <= 0) return null
  if (!Number.isFinite(reps) || !Number.isInteger(reps) || reps < 1 || reps > E1RM_MAX_REPS) return null
  return Math.round(epleyCore(weight, reps) * 100) / 100
}

// ── Brzycki + consensus ───────────────────────────────────────────────────────

/**
 * Brzycki estimated 1RM = `w × 36 / (37 − r)`, integer-rounded (calc.ts's
 * convention, kept for delegation compatibility).
 *
 * Honest domain: integer reps 1-12 at a positive finite load — else `null`.
 * This replaces the absurd legacy `r ≥ 37 → w × 1.06` guard (an invented
 * constant with no citation — audit 2-b B6) and the unguarded calc.ts
 * variant that happily "estimated" 20-rep sets. Brzycki is naturally exact
 * at r=1 (36/36 = 1 — the load itself), so no pin is needed.
 *
 * Citation: Brzycki M. 1993, JOPERD 64:88-90 — "Strength Testing: Predicting
 * a One-Rep Max from Reps-to-Fatigue"; the 36/(37−r) linear relationship is
 * validated in the same sub-10-12 rep range as Epley (LeSure et al. 1997).
 *
 * @example brzycki1RM(100, 5) // 113 — round(100 × 36/32)
 */
export function brzycki1RM(w: number, r: number): number | null {
  if (!inE1rmDomain(w, r)) return null
  return Math.round(brzyckiCore(w, r))
}

/**
 * Consensus e1RM = `round((Epley + Brzycki) / 2)` — the mean of the two
 * best-validated formulas (preserves calc.ts's estimate1RM intent: averaging
 * two independent predictors beats trusting either alone).
 *
 * `null` outside the shared 1-12 integer-rep domain — both constituents are
 * undefined there, so no honest mean exists.
 *
 * @example consensus1RM(100, 5) // 115 — round((117 + 113) / 2)
 */
export function consensus1RM(w: number, r: number): number | null {
  // the shared domain guard rides brzycki1RM — one predicate, one place
  const b = brzycki1RM(w, r)
  if (b == null) return null
  const e = epley1RMRound(w, r) // same domain → honest integer Epley
  return Math.round((e + b) / 2)
}

// ── Warm-up ramp ──────────────────────────────────────────────────────────────

/**
 * The barbell warm-up ramp toward a working set — the ONE ramp voice in
 * PRIME (R69-a closes the R68-deliberately-skipped I2 harmonization: this
 * constant replaced exercise-dialog's 40/60/80 × 5/3/1 presets,
 * lifting-math's inline ramp array and the oracle attack-plan's inline ramp
 * string — percentages AND reps now come from here).
 *
 * Citation: McGowan et al. 2015, Sports Med 45(11) "Warm-Up Strategies for
 * Sport" — ramped intensity (≈40-60% → ≈70% → ≈80-90% of working load with
 * decreasing volume) primes the specific movement without fatiguing it.
 */
export const WARMUP_RAMP: readonly { pct: number; reps: number }[] = [
  { pct: 50, reps: 8 },
  { pct: 70, reps: 5 },
  { pct: 85, reps: 3 },
]
