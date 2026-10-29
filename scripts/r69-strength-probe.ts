/**
 * R69 STRENGTH-CONSOLIDATION PROBE — Task R69-a (strength-consolidator).
 * Throws on the first failed assertion (non-zero exit) so `bun
 * scripts/r69-strength-probe.ts` is a one-command guard for the FIVE-way 1RM
 * consolidation onto lib/strength-science.ts (audit 2-b / I3 — the drift root
 * cause):
 *   1. delegation equivalence — every entry point computes the ONE Epley core
 *      (re-exports are reference-identical; wrappers are value-identical)
 *   2. r=1 identity pins across epleyE1rm / epley1RM / estimate1RM /
 *      brzycki1RM / consensus1RM (+ every delegate)
 *   3. Brzycki math — w × 36/(37−r), naturally exact at r=1, absurd r≥37
 *      guard dead
 *   4. domain guards — honest null/0 outside each entry point's documented
 *      domain (calc-family: null outside 1-12 reps + r≥1)
 *   5. consensus path — round((epley-int + brzycki-int)/2) preserved
 *   6. WARMUP_RAMP single voice — lifting-math.warmupSets reads the ONE
 *      shared constant (50/70/85% × 8/5/3)
 *
 * HONEST DEVIATION from the brief's probe sketch (documented, not silently
 * applied): the sketch said "all five return null/0 for reps 13, 20" — that
 * cannot hold for epleyE1rm and muscles.epley1RM, whose EXACT current
 * behavior is pinned by the zero-numeric-change contract ("EXACT current
 * progression.ts behavior"; muscles byte-equality). The R68 design
 * deliberately keeps those two formulas un-ceilinged and filters rows at
 * every grouping site with validE1rmSet instead. This probe therefore locks
 * epleyE1rm(100,13) === the formula value (no regression) AND asserts
 * null/0 for reps 13/20 on every DOMAIN-CARRYING estimator (estimate1RM,
 * brzycki1RM, consensus1RM and the whole calc family) — asserting otherwise
 * would require corrupting a pinned contract, violating the iron rule.
 */
import {
  epleyE1rm,
  epley1RMRound,
  estimate1RM,
  brzycki1RM,
  consensus1RM,
  validE1rmSet,
  E1RM_MAX_REPS,
  WARMUP_RAMP,
} from "@/lib/strength-science"
import {
  epleyE1rm as progressionEpleyE1rm,
  validE1rmSet as progressionValidE1rmSet,
  E1RM_MAX_REPS as progressionMaxReps,
} from "@/lib/progression"
import { epley1RM } from "@/lib/muscles"
import { estimate1RM as liftingEstimate1RM, warmupSets } from "@/lib/lifting-math"
import {
  epley1RM as calcEpley1RM,
  brzycki1RM as calcBrzycki1RM,
  estimate1RM as calcEstimate1RM,
} from "@/lib/fitness/calc"

let checked = 0
function assert(cond: boolean, label: string): void {
  checked++
  if (!cond) throw new Error(`R69 PROBE FAILED: ${label}`)
  console.log(`  ✓ ${label}`)
}

const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

console.log("[R69 probe] 1 · Delegation equivalence — one Epley core, five entry points")
assert(epleyE1rm(100, 5) === 100 * (1 + 5 / 30), "epleyE1rm(100, 5) === 116.66666666666667 — exact Epley w×(1+r/30), zero numeric change")
assert(epley1RM(100, 5) === epleyE1rm(100, 5), "muscles.epley1RM(100, 5) === epleyE1rm(100, 5) — the un-rounded core agrees")
assert(epley1RMRound(100, 5) === 117 && epley1RMRound(100, 5) === Math.round(epleyE1rm(100, 5)), "epley1RMRound(100, 5) === 117 — integer rounding of the same core")
assert(estimate1RM(100, 5) === 116.67, "estimate1RM(100, 5) === 116.67 — 2-decimal rounding of the same core")
assert(consensus1RM(100, 5) === 115, "consensus1RM(100, 5) === 115 — mean of the integer Epley + Brzycki")
assert(progressionEpleyE1rm === epleyE1rm, "progression.epleyE1rm IS strength-science.epleyE1rm (re-export — zero drift possible)")
assert(progressionValidE1rmSet === validE1rmSet && progressionMaxReps === E1RM_MAX_REPS, "progression.validE1rmSet / E1RM_MAX_REPS are the same bindings (re-export)")
assert(liftingEstimate1RM === estimate1RM, "lifting-math.estimate1RM IS strength-science.estimate1RM (re-export — zero drift possible)")
assert(calcEpley1RM(100, 5) === epley1RMRound(100, 5), "calc.epley1RM(100, 5) === 117 — delegates to epley1RMRound byte-exactly")
assert(calcBrzycki1RM(100, 5) === brzycki1RM(100, 5) && calcEstimate1RM(100, 5) === consensus1RM(100, 5), "calc.brzycki1RM / calc.estimate1RM delegate to strength-science byte-exactly")
assert([1, 2, 3, 5, 8, 12].every((r) => epley1RM(100, r) === epleyE1rm(100, r)), "muscles.epley1RM === epleyE1rm across the whole 1-12 domain sweep")
assert(
  [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every((r) => calcEpley1RM(100, r) === Math.round(100 * (1 + r / 30))),
  "calc.epley1RM r=2..12 sweep byte-identical to the legacy integers (107,110,113,117,…,140)",
)

console.log("[R69 probe] 2 · r=1 identity pins — a 1-rep set IS the measured 1RM")
assert(epleyE1rm(100, 1) === 100, "epleyE1rm(100, 1) === 100")
assert(epley1RM(100, 1) === 100, "muscles.epley1RM(100, 1) === 100")
assert(epley1RMRound(100, 1) === 100, "epley1RMRound(100, 1) === 100")
assert(estimate1RM(100, 1) === 100, "estimate1RM(100, 1) === 100")
assert(brzycki1RM(100, 1) === 100, "brzycki1RM(100, 1) === 100 — naturally exact (36/36 = 1)")
assert(consensus1RM(100, 1) === 100, "consensus1RM(100, 1) === 100")
assert(calcEpley1RM(100, 1) === 100 && calcBrzycki1RM(100, 1) === 100 && calcEstimate1RM(100, 1) === 100, "calc.epley1RM / brzycki1RM / estimate1RM(100, 1) === 100")
assert(liftingEstimate1RM(100, 1) === 100, "lifting-math.estimate1RM(100, 1) === 100")

console.log("[R69 probe] 3 · Brzycki math — w × 36/(37−r), Brzycki 1993 (JOPERD 64:88-90)")
assert(brzycki1RM(100, 5) === 113 && brzycki1RM(100, 5) === Math.round((100 * 36) / 32), "brzycki1RM(100, 5) === round(100×36/32) === 113")
assert(brzycki1RM(100, 12) === 144 && brzycki1RM(100, 12) === Math.round((100 * 36) / 25), "brzycki1RM(100, 12) === round(100×36/25) === 144")
assert(brzycki1RM(100, 40) === null, "brzycki1RM(100, 40) === null — the invented r≥37 → w×1.06 guard is dead (audit 2-b B6)")

console.log("[R69 probe] 4 · Domain guards — honest null/0, never a fabricated number")
assert(
  epleyE1rm(100, 0) === 0 && epleyE1rm(100, -3) === 0 && epleyE1rm(100, NaN) === 0 &&
  epleyE1rm(0, 5) === 0 && epleyE1rm(-5, 5) === 0 && epleyE1rm(NaN, 5) === 0,
  "epleyE1rm guards: reps 0/-3/NaN, weight 0/-5/NaN → 0",
)
assert(epleyE1rm(100, 13) === 100 * (1 + 13 / 30) && epleyE1rm(100, 20) === 100 * (1 + 20 / 30), "epleyE1rm(100, 13/20) === the formula value, LOCKED — the R68 design filters rows with validE1rmSet at call sites, the formula itself stays un-ceiled (zero regression)")
assert(
  epley1RM(100, 0) === 0 && epley1RM(100, -3) === 0 && epley1RM(100, NaN) === 0 &&
  epley1RM(0, 5) === 0 && epley1RM(-5, 5) === 0 && epley1RM(NaN, 5) === 0 && epley1RM(100, 40) === 100,
  "muscles.epley1RM guards: reps 0/-3/NaN, weight 0/-5/NaN → 0; legacy reps≥37 → the load itself",
)
assert(
  epley1RMRound(100, 0) === 0 && epley1RMRound(100, -3) === 0 && epley1RMRound(100, NaN) === 0 &&
  epley1RMRound(0, 5) === 0 && epley1RMRound(-5, 5) === 0,
  "epley1RMRound guards: reps 0/-3/NaN, weight 0/-5 → 0",
)
assert(
  estimate1RM(100, 0) === null && estimate1RM(100, 13) === null && estimate1RM(100, 20) === null &&
  estimate1RM(100, -3) === null && estimate1RM(100, NaN) === null && estimate1RM(100, 5.5) === null &&
  estimate1RM(0, 5) === null && estimate1RM(-5, 5) === null,
  "estimate1RM: null for reps 0/13/20/-3/NaN/5.5 and weight 0/-5 — no honest estimate outside 1-12 integer reps",
)
assert(
  brzycki1RM(100, 0) === null && brzycki1RM(100, 13) === null && brzycki1RM(100, 20) === null &&
  brzycki1RM(100, -3) === null && brzycki1RM(100, NaN) === null && brzycki1RM(100, 5.5) === null &&
  brzycki1RM(0, 5) === null && brzycki1RM(-5, 5) === null,
  "brzycki1RM: null for reps 0/13/20/-3/NaN/5.5 and weight 0/-5",
)
assert(
  consensus1RM(100, 0) === null && consensus1RM(100, 13) === null && consensus1RM(100, 20) === null &&
  consensus1RM(100, -3) === null && consensus1RM(100, NaN) === null && consensus1RM(0, 5) === null && consensus1RM(-5, 5) === null,
  "consensus1RM: null for reps 0/13/20/-3/NaN and weight 0/-5 — the shared domain guard",
)
assert(
  calcEpley1RM(100, 0) === null && calcEpley1RM(100, 13) === null && calcEpley1RM(100, 20) === null &&
  calcEpley1RM(100, -3) === null && calcEpley1RM(100, NaN) === null && calcEpley1RM(0, 5) === null && calcEpley1RM(-5, 5) === null,
  "calc.epley1RM honesty upgrade: null for reps 0/13/20/-3/NaN and weight 0/-5 (a 20-rep set no longer 'estimates' ~1.67× the load)",
)
assert(
  calcBrzycki1RM(100, 0) === null && calcBrzycki1RM(100, 13) === null && calcBrzycki1RM(100, 20) === null &&
  calcBrzycki1RM(100, -3) === null && calcBrzycki1RM(100, NaN) === null && calcBrzycki1RM(0, 5) === null && calcBrzycki1RM(-5, 5) === null,
  "calc.brzycki1RM honesty upgrade: null for reps 0/13/20/-3/NaN and weight 0/-5",
)
assert(
  calcEstimate1RM(100, 0) === null && calcEstimate1RM(100, 13) === null && calcEstimate1RM(100, 20) === null &&
  calcEstimate1RM(100, -3) === null && calcEstimate1RM(100, NaN) === null && calcEstimate1RM(0, 5) === null && calcEstimate1RM(-5, 5) === null,
  "calc.estimate1RM honesty upgrade: null for reps 0/13/20/-3/NaN and weight 0/-5 — the old r≤1→round(w) quirk (r=0 fabricating the load as a 'max') is dead",
)
assert(validE1rmSet(13, 100) === false && validE1rmSet(5, 0) === false && validE1rmSet(1, 100) && validE1rmSet(12, 100), "validE1rmSet bounds unchanged: 1..12 reps AND weight>0 (E1RM_MAX_REPS === 12)")

console.log("[R69 probe] 5 · Consensus path — round((epley-int + brzycki-int)/2) preserved")
assert(
  consensus1RM(100, 5) === Math.round((epley1RMRound(100, 5) + (brzycki1RM(100, 5) as number)) / 2) && consensus1RM(100, 5) === 115,
  "consensus1RM(100, 5) === round((117 + 113)/2) === 115 — the (epley-int + brzycki-int)/2 path",
)
assert(
  deepEq(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((r) => consensus1RM(100, r)),
    [100, 105, 108, 111, 115, 118, 122, 126, 130, 133, 138, 142],
  ),
  "consensus1RM r=1..12 sweep byte-identical to the legacy calc.estimate1RM integers",
)

console.log("[R69 probe] 6 · WARMUP_RAMP single voice — 50/70/85% × 8/5/3 (McGowan 2015)")
assert(deepEq(WARMUP_RAMP, [{ pct: 50, reps: 8 }, { pct: 70, reps: 5 }, { pct: 85, reps: 3 }]), "strength-science.WARMUP_RAMP === 50%×8 · 70%×5 · 85%×3")
assert(
  deepEq(warmupSets(100).map((s) => s.label), ["BAR", "50%", "70%", "85%"]) &&
  deepEq(warmupSets(100).map((s) => s.weight), [20, 50, 70, 85]) &&
  deepEq(warmupSets(100).map((s) => s.reps), [10, 8, 5, 3]),
  "lifting-math.warmupSets(100) → BAR 20×10, 50% 50×8, 70% 70×5, 85% 85×3",
)
assert(
  deepEq(warmupSets(100).filter((s) => s.pct !== null).map((s) => ({ pct: s.pct, reps: s.reps })), WARMUP_RAMP),
  "the ramp warmupSets actually uses (pct rungs) deep-equals strength-science.WARMUP_RAMP — one voice, drift impossible",
)

console.log(`[R69 probe] ✅ ALL ${checked} ASSERTIONS PASSED`)
