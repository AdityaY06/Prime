/**
 * R68 PLANNER-FIX REGRESSION PROBE — Task 3-b (planner-fixer).
 * Throws on the first failed assertion (non-zero exit) so `bun
 * scripts/r68-planner-probe.ts` is a one-command guard for:
 *   1. epleyE1rm r=1 identity pin (a 1-rep set IS the measured 1RM)
 *   2. Epley's 1-12 rep validity domain (E1RM_MAX_REPS + validE1rmSet)
 *   3. the same r=1 pins in muscles.epley1RM + lifting-math.estimate1RM
 *   4. the weekly volume tally skipping cardio/mobility rows (Israetel
 *      landmarks count hard RESISTANCE sets — a walk or stretch is not one)
 * NOT in scope here: prawns / push-up aggregate fixes (owned elsewhere).
 */
import { epleyE1rm, E1RM_MAX_REPS, validE1rmSet } from "@/lib/progression"
import { epley1RM } from "@/lib/muscles"
import { estimate1RM } from "@/lib/lifting-math"
import { tallyWeeklySets } from "@/lib/volume-landmarks"

let checked = 0
function assert(cond: boolean, label: string): void {
  checked++
  if (!cond) throw new Error(`R68 PROBE FAILED: ${label}`)
  console.log(`  ✓ ${label}`)
}

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

console.log("[R68 probe] 1 · Epley r=1 identity pin + validity domain (progression.ts)")
assert(epleyE1rm(100, 1) === 100, "epleyE1rm(100, 1) === 100 — a 1-rep set IS the 1RM (no +3.3%)")
assert(near(epleyE1rm(100, 5), 100 * (1 + 5 / 30)), "epleyE1rm(100, 5) ≈ 116.6667 — exact Epley w×(1+r/30)")
assert(epleyE1rm(100, 0) === 0 && epleyE1rm(0, 5) === 0 && epleyE1rm(-5, 5) === 0, "epleyE1rm guards: reps<1 / weight≤0 → 0")
assert(E1RM_MAX_REPS === 12, "E1RM_MAX_REPS === 12 (LeSure 1997 acceptable-to-~12 ceiling)")
assert(validE1rmSet(13, 100) === false, "validE1rmSet(13, 100) === false — 13+ reps have no honest e1RM")
assert(validE1rmSet(5, 0) === false, "validE1rmSet(5, 0) === false — unloaded rows carry no e1RM")
assert(validE1rmSet(1, 100) && validE1rmSet(12, 100) && !validE1rmSet(12, 0) && !validE1rmSet(0, 100), "validE1rmSet bounds: 1..12 reps AND weight>0")

console.log("[R68 probe] 2 · Same r=1 pins in the sibling 1RM implementations")
assert(epley1RM(100, 1) === 100, "muscles.epley1RM(100, 1) === 100 — r=1 identity pin")
assert(near(epley1RM(100, 5), 100 * (1 + 5 / 30)), "muscles.epley1RM(100, 5) ≈ 116.6667 — formula untouched")
assert(estimate1RM(100, 1) === 100, "lifting-math.estimate1RM(100, 1) === 100 — r=1 identity pin")
assert(estimate1RM(100, 5) === 116.67, "lifting-math.estimate1RM(100, 5) === 116.67")
assert(estimate1RM(100, 13) === null, "lifting-math.estimate1RM(100, 13) === null — rep ceiling already guarded")

console.log("[R68 probe] 3 · Volume tally skips cardio/mobility rows (volume-landmarks.ts)")
const now = new Date()
// synthetic 7-day window: 3 loaded bench sets + a legacy (type-less) bench row,
// a cardio row and a mobility row that BOTH tag landmark muscles in the library
const tally = tallyWeeklySets([
  { name: "Bench press", sets: 3, createdAt: now, type: "strength" },
  { name: "Rowing machine", sets: 5, createdAt: now, type: "cardio" }, // BACK/BICEPS/CORE/QUADS
  { name: "Couch stretch", sets: 2, createdAt: now, type: "mobility" }, // QUADS/GLUTES/BACK/HAMSTRINGS
  { name: "Walking", sets: 4, createdAt: now, type: "CARDIO" }, // case-insensitive skip
  { name: "Bench press", sets: 2, createdAt: now }, // legacy row, no type → still counts
])
assert((tally.get("CHEST") ?? 0) === 5, "CHEST 5 — strength(3) + legacy type-less bench(2) counted")
assert((tally.get("TRICEPS") ?? 0) === 5 && (tally.get("SHOULDERS") ?? 0) === 5, "bench indirect tags counted (TRICEPS/SHOULDERS 5 — both bench rows)")
assert(!tally.has("BACK") && !tally.has("BICEPS") && !tally.has("CORE"), "cardio Rowing machine contributes NOTHING (BACK/BICEPS/CORE 0)")
assert(!tally.has("QUADS") && !tally.has("GLUTES") && !tally.has("CALVES") && !tally.has("HAMSTRINGS"), "mobility Couch stretch + cardio Walking contribute NOTHING (QUADS/GLUTES/CALVES/HAMSTRINGS 0)")

console.log(`[R68 probe] ✅ ALL ${checked} ASSERTIONS PASSED`)
