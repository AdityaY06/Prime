// ─── PRIME · Lifting math (R28-c — super exercise helper tools) ───────────────
// Pure, typed coaching math for the training toolkit, the plate calculator and
// the global rest timer. NO React, NO side effects, NO state — every function
// is deterministic and safe to import from both server and client components.
//
// Companion surfaces (R28-c):
//   · src/components/fitness/training-toolkit.tsx — ToolkitPanel (GATES 04) +
//     the floating RestTimerWidget
//   · src/store/rest-timer-store.ts — the persistent countdown store
//
// Science anchors (JSDoc per function, full citations where relevant):
//   · 1RM estimation — R69-a: delegated to lib/strength-science.ts (the single
//     source of truth for every 1RM in PRIME); Epley 1985 (validated by
//     LeSure et al. 1997, JSCR) — re-exported below unchanged
//   · Rest intervals — Schoenfeld et al. 2016, J Strength Cond Res
//   · Warm-up ramping — McGowan et al. 2015, Sports Med — the ramp rungs now
//     read the shared strength-science.WARMUP_RAMP constant (R69-a: one voice)

import { WARMUP_RAMP } from "@/lib/strength-science"

/** Olympic plate denominations, largest → smallest (kg). */
export const KG_PLATES: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25]

/** Olympic plate denominations, largest → smallest (lb). */
export const LB_PLATES: readonly number[] = [45, 35, 25, 10, 5, 2.5]

/** Standard olympic bar (kg). */
export const KG_BAR = 20

/** Standard olympic bar (lb). */
export const LB_BAR = 45

/** Rest-interval prescription class — see {@link restSeconds}. */
export type RestKind = "compound" | "isolation" | "default"

/** Unit for plate math — see {@link plateBreakdown}. */
export type PlateMode = "kg" | "lb"

/** Float-tolerance for greedy plate math (1.25/2.5 denominations are exact
 *  in binary up to this scale; anything larger than this remainder means the
 *  target genuinely cannot be loaded). */
const PLATE_EPS = 1e-6

// ── 1RM estimation ────────────────────────────────────────────────────────────

// R69-a — estimate1RM now lives in lib/strength-science.ts (the single source
// of truth for every 1RM in PRIME) and is re-exported here with its contract
// unchanged: Epley w×(1+r/30), null outside the 1-12 integer-rep domain (the
// formula's accuracy decays sharply past a dozen reps — a 15-rep set
// "estimates" a max most lifters cannot hit, so the honest answer is no
// estimate at all), 2-decimal rounding, r=1 pinned to the load itself.
// Citations (Epley 1985; LeSure et al. 1997, J Strength Cond Res — accuracy
// best at ≤10 reps, acceptable to ~12) live in strength-science.ts.
//
// @example estimate1RM(100, 5) // 116.67 — 100 kg × (1 + 5/30)
export { estimate1RM } from "@/lib/strength-science"

// ── Warm-up ramp ──────────────────────────────────────────────────────────────

/** One rung of the warm-up ramp produced by {@link warmupSets}. */
export type WarmupSet = {
  /** Ramp label — `"BAR"` for the empty-bar primer, else the percentage tag (`"50%"`). */
  label: string
  /** Total load for the set, in the same unit as the working weight. */
  weight: number
  /** Prescribed reps for the rung (10 / 8 / 5 / 3 down the ramp). */
  reps: number
  /** Ramp percentage of the working weight; `null` for the empty-bar primer. */
  pct: number | null
}

/**
 * Warm-up ramp toward a barbell working set, as an ordered list:
 * empty-bar ×10 → ~50% ×8 → ~70% ×5 → ~85% ×3, each ramp rung rounded to the
 * nearest loadable weight (2.5 kg by default).
 *
 * The empty-bar primer is emitted only when the working weight exceeds the
 * bar (a 20 kg working set has no primer to prime). Ramp rungs are clamped to
 * at least the bar so no rung prescribes a load lighter than an empty
 * barbell. A working weight at or below the bar has no barbell ramp — the
 * honest result is an empty list.
 *
 * `opts` keeps the function unit-aware without a second entry point:
 * kg callers use the defaults (bar 20, step 2.5); lb callers pass
 * `{ bar: 45, step: 5 }` (smallest lb plate is 2.5 per side → 5 total).
 *
 * Citation: McGowan et al. 2015, Sports Med 45(11) — "Warm-Up Strategies for
 * Sport": ramped intensity (≈40–60% → ≈70% → ≈80–90% of working load with
 * decreasing volume) primes the specific movement without fatiguing it.
 *
 * @example warmupSets(100) // [BAR 20×10, 50% 50×8, 70% 70×5, 85% 85×3]
 */
export function warmupSets(
  workingWeight: number,
  opts?: { bar?: number; step?: number },
): WarmupSet[] {
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) return []
  const bar = Number.isFinite(opts?.bar) && (opts?.bar ?? 0) > 0 ? (opts?.bar as number) : KG_BAR
  const step = Number.isFinite(opts?.step) && (opts?.step ?? 0) > 0 ? (opts?.step as number) : 2.5
  if (workingWeight <= bar) return []

  const roundToStep = (n: number) => Math.max(bar, Math.round(n / step) * step)
  // R69-a — the ramp rungs read the ONE shared constant (McGowan et al. 2015:
  // ≈40-60% → ≈70% → ≈80-90% with decreasing volume): 50%×8 · 70%×5 · 85%×3.
  // Previously an inline duplicate array here — now impossible to drift from
  // strength-science.ts, exercise-dialog and the oracle attack-plan ramp.
  const ramp = WARMUP_RAMP
  const out: WarmupSet[] = []
  // the early return above guarantees workingWeight > bar here
  out.push({ label: "BAR", weight: bar, reps: 10, pct: null })
  for (const r of ramp) {
    out.push({ label: `${r.pct}%`, weight: roundToStep(workingWeight * (r.pct / 100)), reps: r.reps, pct: r.pct })
  }
  return out
}

// ── Plate math ────────────────────────────────────────────────────────────────

/**
 * Per-side plate breakdown for a target total, greedy largest-first with an
 * exact-match check. Returns the per-side plate list (largest → smallest,
 * one entry per plate — e.g. 100 kg on a 20 kg bar → `[25, 15]`), an empty
 * array for a bare bar, or `null` when the target cannot be loaded exactly
 * (target below the bar, or a per-side remainder that no plate combination
 * covers — e.g. 21.5 kg).
 *
 * KG mode (default): 20 kg bar, plates [25, 20, 15, 10, 5, 2.5, 1.25].
 * LB mode: 45 lb bar, plates [45, 35, 25, 10, 5, 2.5].
 * `opts.bar` overrides the bar weight (same unit) for technique bars.
 *
 * @example plateBreakdown(100) // [25, 15] — (100−20)/2 = 40 per side
 * @example plateBreakdown(135, { mode: "lb" }) // [45] — bare bar + one 45
 */
export function plateBreakdown(
  targetWeight: number,
  opts?: { mode?: PlateMode; bar?: number },
): number[] | null {
  if (!Number.isFinite(targetWeight)) return null
  const mode: PlateMode = opts?.mode === "lb" ? "lb" : "kg"
  const defaultBar = mode === "lb" ? LB_BAR : KG_BAR
  const bar = Number.isFinite(opts?.bar) && (opts?.bar ?? 0) >= 0 ? (opts?.bar as number) : defaultBar
  const plates = mode === "lb" ? LB_PLATES : KG_PLATES
  if (targetWeight < bar) return null

  // per-side load to build; negative is impossible here (target ≥ bar)
  let perSide = (targetWeight - bar) / 2
  if (perSide < -PLATE_EPS) return null

  const out: number[] = []
  for (const p of plates) {
    while (perSide >= p - PLATE_EPS) {
      out.push(p)
      perSide -= p
    }
    if (perSide <= PLATE_EPS) break
  }
  // exact-match check: any real remainder means the greedy walk could not
  // build this per-side load from the available denominations
  if (perSide > PLATE_EPS) return null
  return out
}

// ── Rest intervals ────────────────────────────────────────────────────────────

/**
 * Science-default rest interval in seconds: compound 180 / isolation 90 /
 * default 120.
 *
 * Citation: Schoenfeld et al. 2016, J Strength Cond Res 30(7) — trained men
 * resting 3 minutes between compound sets gained significantly more
 * hypertrophy than the 1-minute group (full acute volume + recovery of
 * mechanical output). Isolation work tolerates the short end (~1–2 min);
 * the default splits the difference for mixed/unknown work.
 */
export function restSeconds(kind: RestKind): number {
  switch (kind) {
    case "compound":
      return 180
    case "isolation":
      return 90
    default:
      return 120
  }
}

// ── RPE ↔ RIR ─────────────────────────────────────────────────────────────────

/**
 * Convert an RPE (10-point rating of perceived exertion) to reps-in-reserve:
 * RPE 10 → 0 RIR, 9 → 1 … 5 → 5. Values above 10 clamp to 0 RIR; anything
 * below 5 (or non-finite) returns `null` — the scale is only defined for
 * RPE 5–10, where "hard set" territory actually lives.
 *
 * Citation: RIR-based RPE scale as defined by Tuchscherer (2008, RTF Systems)
 * and operationalized for barbell training by Zourdos et al. 2016, J Strength
 * Cond Res (average RPE correlates with bar speed / proximity to failure).
 *
 * @example rpeToRir(8) // 2 — two reps left in the tank
 */
export function rpeToRir(rpe: number): number | null {
  if (!Number.isFinite(rpe) || rpe < 5) return null
  const clamped = Math.min(10, rpe)
  return Math.max(0, 10 - clamped)
}

// ── Loadable weight ───────────────────────────────────────────────────────────

/**
 * Nearest achievable weight at 2.5 kg granularity (the smallest per-side
 * olympic pair steps the total by 2.5 kg). Non-finite or negative targets
 * clamp to 0. Pure granularity math — pair it with a bar check when the
 * result must be barbell-loadable.
 *
 * @example loadableKg(63) // 62.5
 */
export function loadableKg(target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0
  return Math.max(0, Math.round(target / 2.5) * 2.5)
}
