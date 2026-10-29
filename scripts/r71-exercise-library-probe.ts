// R71-b · exercise-library + tier-rank probe — NET-NEW assertions only
// (does not restate any earlier suite; this locks the R71-b round):
//   1. Full-resolution invariant — every session EXERCISES name resolves
//      via mapExerciseToMuscles (the 23-fix lock; prints "161/161 resolve"),
//      plus alias-path spot-locks for the previously-unresolved names
//   2. session-list integrity — unique ids/names, count 93 → 161 with the
//      116/28/17 type split, valid MuscleIds, METs defined with sanity
//      bands, cues present
//   3. pickable pools — every atlas MuscleId (13) and every session
//      MuscleId (14) has ≥ 8 exercises reachable via primary-or-secondary
//      (the exact filter semantics of both picker UIs)
//   4. tier system — explicit coverage of all 161 exercises, no orphan ids,
//      sane distribution (T2 the biggest class), honest fallback
//   5. ranking — bestForMuscle tier-ascending with bench/squat/deadlift
//      families on top, strength-only hypertrophy picks, bestForActivity
//      non-empty with the accessibility anchor first, pure + deterministic
//   6. module purity — exercise-rank.ts imports ONLY types + exercise data
//      (the import at the top of this probe IS the no-side-effect proof:
//      it evaluates under bun with no DOM, no fetch, no timers)
//   7. picker wiring statics — TrainingView's dynamic count, "BEST FOR"
//      ranked line, TierBadge rendering, combined filter threading
// Run: bun scripts/r71-exercise-library-probe.ts
import { readFileSync } from "node:fs"
import { EXERCISES, searchExercises } from "@/lib/fitness/data/exercises"
import { EXERCISE_LIBRARY, MUSCLES as ATLAS_MUSCLES, mapExerciseToMuscles } from "@/lib/muscles"
import {
  EXERCISE_TIERS, bestForActivity, bestForMuscle, rankBadge, rankExercises, tierFor, whyFor,
} from "@/lib/exercise-rank"
import type { MuscleId } from "@/lib/fitness/types"

let pass = 0
let fail = 0
function assert(label: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.error(`  ✗ ${label}`)
  }
}

const SESSION_MUSCLE_IDS: MuscleId[] = [
  "chest", "lats", "traps", "shoulders", "biceps", "triceps", "forearms",
  "abs", "obliques", "glutes", "quads", "hamstrings", "calves", "lowerBack",
]

// ── 1 · full-resolution invariant (the 23-fix lock) ──────────────────────────
console.log("[R71-b probe] 1 · full-resolution invariant")

const unresolved = EXERCISES.filter((e) => mapExerciseToMuscles(e.name) === null)
console.log(`  → ${EXERCISES.length - unresolved.length}/${EXERCISES.length} session names resolve in the atlas library`)
assert(
  `FULL RESOLUTION: ${EXERCISES.length - unresolved.length}/${EXERCISES.length} session exercise names resolve via mapExerciseToMuscles (0 unresolved)`,
  unresolved.length === 0
)
assert(
  "the 23-fix alias paths resolve: incline barbell bench press · ez bar curl · ab wheel · cable glute kickback · foam roll · yoga · hip openers",
  ["incline barbell bench press", "ez bar curl", "ab wheel", "cable glute kickback", "foam roll", "yoga", "hip openers"]
    .every((a) => mapExerciseToMuscles(a) !== null)
)
assert(
  "fix semantics sane: incline barbell bench press → chest primary · ez bar curl → biceps · ab wheel rollout → core · cable glute kickback → glutes",
  mapExerciseToMuscles("incline barbell bench press")!.primary.includes("chest") &&
    mapExerciseToMuscles("ez bar curl")!.primary.includes("biceps") &&
    mapExerciseToMuscles("ab wheel rollout")!.primary.includes("core") &&
    mapExerciseToMuscles("cable glute kickback")!.primary.includes("glutes")
)

// ── 2 · session-list integrity (93 → 161 expansion) ──────────────────────────
console.log("[R71-b probe] 2 · session-list integrity")

const ids = EXERCISES.map((e) => e.id)
assert(
  `unique ids AND unique display names across all ${EXERCISES.length} exercises (no collisions on either key)`,
  new Set(ids).size === ids.length && new Set(EXERCISES.map((e) => e.name)).size === EXERCISES.length
)
{
  const byType = EXERCISES.reduce((acc, e) => { acc[e.type] = (acc[e.type] ?? 0) + 1; return acc }, {} as Record<string, number>)
  console.log(`  → count ${EXERCISES.length} · strength ${byType.strength} · cardio ${byType.cardio} · mobility ${byType.mobility}`)
  assert(
    `count in [150, 175] and exactly 161 = 116 strength + 28 cardio + 17 mobility (got ${EXERCISES.length}/${byType.strength}/${byType.cardio}/${byType.mobility})`,
    EXERCISES.length >= 150 && EXERCISES.length <= 175 &&
      byType.strength === 116 && byType.cardio === 28 && byType.mobility === 17
  )
}
assert(
  "every muscles/secondary entry is a valid MuscleId, no primary/secondary overlap, muscles never empty",
  EXERCISES.every(
    (e) =>
      e.muscles.length > 0 &&
      [...e.muscles, ...e.secondary].every((m) => (SESSION_MUSCLE_IDS as string[]).includes(m)) &&
      e.muscles.every((m) => !e.secondary.includes(m))
  )
)
assert(
  "every entry: met defined finite > 0 · difficulty ∈ {1,2,3} · cues non-empty with no blank strings",
  EXERCISES.every(
    (e) =>
      typeof e.met === "number" && Number.isFinite(e.met) && e.met > 0 &&
      ([1, 2, 3] as number[]).includes(e.difficulty) &&
      Array.isArray(e.cues) && e.cues.length > 0 && e.cues.every((c) => c.trim().length > 0)
  )
)
assert(
  "MET sanity bands: every cardio + mobility MET in [1.5, 16] · every strength MET in the documented assignment band [3, 8.5] (6.0 compounds · 5.0 machines · 3.5 isolations · 3.8/8.0 calisthenics)",
  EXERCISES.filter((e) => e.type === "cardio" || e.type === "mobility").every((e) => e.met >= 1.5 && e.met <= 16) &&
    EXERCISES.filter((e) => e.type === "strength").every((e) => e.met >= 3 && e.met <= 8.5)
)
assert(
  "MET spot-locks: ski-erg 9.0 · rowing-vigorous 8.5 · badminton 5.5 · dance-cardio 7.3 · pilates 3.0 · cat-cow 2.3 · worlds-greatest 2.5 · brisk-walk 4.3",
  [
    ["ski-erg", 9.0], ["rowing-machine-vigorous", 8.5], ["badminton-social", 5.5],
    ["dance-cardio", 7.3], ["pilates-mat", 3.0], ["cat-cow", 2.3],
    ["worlds-greatest-stretch", 2.5], ["brisk-walk", 4.3],
  ].every(([id, met]) => EXERCISES.find((e) => e.id === id)?.met === met)
)

// ── 3 · pickable pools + atlas integrity ─────────────────────────────────────
console.log("[R71-b probe] 3 · pickable pools + atlas library")

{
  const pools = ATLAS_MUSCLES.map(
    (m) => [m.id, EXERCISE_LIBRARY.filter((d) => d.muscles.primary.includes(m.id) || d.muscles.secondary.includes(m.id)).length] as const
  )
  const min = Math.min(...pools.map(([, n]) => n))
  console.log(`  → atlas pools (primary-or-secondary): ${pools.map(([id, n]) => `${id} ${n}`).join(" · ")}`)
  assert(
    `every one of the 13 atlas MuscleIds has ≥ 8 pickable exercises (min ${min})`,
    ATLAS_MUSCLES.length === 13 && pools.every(([, n]) => n >= 8)
  )
}
{
  const pools = SESSION_MUSCLE_IDS.map(
    (m) => [m, EXERCISES.filter((e) => e.muscles.includes(m) || e.secondary.includes(m)).length] as const
  )
  const min = Math.min(...pools.map(([, n]) => n))
  console.log(`  → session pools (primary-or-secondary): ${pools.map(([id, n]) => `${id} ${n}`).join(" · ")}`)
  assert(
    `every one of the 14 session MuscleIds has ≥ 8 pickable exercises via the picker's filter semantics (min ${min})`,
    pools.every(([, n]) => n >= 8)
  )
}
assert(
  `atlas EXERCISE_LIBRARY is 212 (≥ 205 — the 194 → 212 expansion) with unique ids, unique names, no empty names, no empty-string aliases`,
  EXERCISE_LIBRARY.length === 212 &&
    new Set(EXERCISE_LIBRARY.map((d) => d.id)).size === EXERCISE_LIBRARY.length &&
    EXERCISE_LIBRARY.every((d) => d.name.trim().length > 0 && d.aliases.every((a) => typeof a === "string" && a.trim().length > 0))
)
{
  const src = readFileSync("src/lib/fitness/data/exercises.ts", "utf8")
  const n = (src.match(/Compendium 2011/g) ?? []).length
  assert(
    `new cardio/mobility METs carry source comments: ≥ 12 "Compendium 2011" notes in the data file (found ${n})`,
    n >= 12
  )
}

// ── 4 · tier system ──────────────────────────────────────────────────────────
console.log("[R71-b probe] 4 · tier coverage + distribution")

{
  const explicit = EXERCISES.filter((e) => EXERCISE_TIERS[e.id] !== undefined)
  assert(
    `every session exercise has an EXPLICIT tier entry in EXERCISE_TIERS (no T2-fallback reliance) — ${explicit.length}/${EXERCISES.length}`,
    explicit.length === EXERCISES.length
  )
}
{
  const sessionIds = new Set(ids)
  const orphans = Object.keys(EXERCISE_TIERS).filter((k) => !sessionIds.has(k))
  assert("no EXERCISE_TIERS key outside the session list (no orphan ids / typos)", orphans.length === 0)
}
assert(
  "every tier entry: tier ∈ {1,2,3} and a non-empty why line (≥ 12 chars)",
  Object.values(EXERCISE_TIERS).every((t) => [1, 2, 3].includes(t.tier) && t.why.trim().length >= 12)
)
{
  const dist = { 1: 0, 2: 0, 3: 0 } as Record<number, number>
  EXERCISES.forEach((e) => dist[tierFor(e.id)]++)
  console.log(`  → tier distribution: T1 ${dist[1]} · T2 ${dist[2]} · T3 ${dist[3]}`)
  assert(
    `tier distribution sane: T1 ${dist[1]} < T2 ${dist[2]} and T3 ${dist[3]} < T2 (T2 the proven-accessory majority)`,
    dist[1] < dist[2] && dist[3] < dist[2] && dist[1] > 0 && dist[3] > 0
  )
}
assert(
  "tierFor/whyFor fallback is honest: unknown id → tier 2 + pattern-reasoned why (no fabricated citation)",
  tierFor("definitely-not-an-exercise") === 2 &&
    whyFor("definitely-not-an-exercise").includes("no fabricated citation")
)

// ── 5 · ranking (bestForMuscle / bestForActivity / rankExercises) ────────────
console.log("[R71-b probe] 5 · ranking")

assert(
  "bestForMuscle is tier-ascending for chest · quads · lats (every pick's tier ≥ the one above it)",
  (["chest", "quads", "lats"] as const).every((m) => {
    const tiers = bestForMuscle(m).map((r) => r.tier)
    return tiers.length > 0 && tiers.every((t, i) => i === 0 || tiers[i - 1] <= t)
  })
)
assert(
  "bench-press family in chest's top 3 (best chest picks are presses, not flys)",
  bestForMuscle("chest").slice(0, 3).some((r) => /bench/i.test(r.exercise.name))
)
assert(
  "squat family in quads' top 3 AND deadlift/hinge family in hamstrings' top 3",
  bestForMuscle("quads").slice(0, 3).some((r) => /squat/i.test(r.exercise.name)) &&
    bestForMuscle("hamstrings").slice(0, 3).some((r) => /deadlift|hinge/i.test(r.exercise.name))
)
assert(
  "bestForMuscle ranks STRENGTH exercises only (cardio/mobility movers are not hypertrophy picks)",
  ["chest", "quads", "lats", "glutes", "hamstrings", "shoulders", "traps", "calves", "abs", "obliques", "biceps", "triceps", "forearms", "lowerBack"].every(
    (m) => bestForMuscle(m as MuscleId).every((r) => r.exercise.type === "strength")
  )
)
assert(
  "bestForActivity non-empty for strength (116) · cardio (28) · mobility (17), every row carrying tier + why",
  (["strength", "cardio", "mobility"] as const).every(
    (t) => bestForActivity(t).length > 0 && bestForActivity(t).every((r) => [1, 2, 3].includes(r.tier) && r.why.length > 0)
  ) &&
    bestForActivity("strength").length === 116 && bestForActivity("cardio").length === 28 && bestForActivity("mobility").length === 17
)
assert(
  "cardio ranks accessibility-first: brisk-walk (the guideline anchor) is pick #1; mobility ranks foundational-first: worlds-greatest-stretch is #1",
  bestForActivity("cardio")[0].exercise.id === "brisk-walk" &&
    bestForActivity("mobility")[0].exercise.id === "worlds-greatest-stretch"
)
assert(
  "rankBadge maps tone → label: T1 gold · T2 neutral · T3 dim",
  rankBadge(1).label === "T1" && rankBadge(1).tone === "gold" &&
    rankBadge(2).label === "T2" && rankBadge(2).tone === "neutral" &&
    rankBadge(3).label === "T3" && rankBadge(3).tone === "dim"
)
{
  const before = EXERCISES.map((e) => e.id).join(",")
  const a = rankExercises(EXERCISES)
  const b = rankExercises(EXERCISES)
  assert(
    "rankExercises is pure + deterministic: input array unmutated (ids byte-identical after the call), two calls deep-equal",
    EXERCISES.map((e) => e.id).join(",") === before && JSON.stringify(a) === JSON.stringify(b) && a.length === EXERCISES.length
  )
}

// ── 6 · module purity (exercise-rank.ts) ─────────────────────────────────────
console.log("[R71-b probe] 6 · exercise-rank.ts purity")

{
  const src = readFileSync("src/lib/exercise-rank.ts", "utf8")
  const specifiers = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
  console.log(`  → imports: ${specifiers.join(" · ")}`)
  assert(
    "exercise-rank.ts imports ONLY types + exercise data (no side-effect modules, no fetch/DOM/timers)",
    specifiers.length === 2 &&
      specifiers.includes("@/lib/fitness/types") &&
      specifiers.includes("@/lib/fitness/data/exercises") &&
      !/\b(fetch|setTimeout|setInterval|document\.|window\.|localStorage)/.test(src)
  )
  assert(
    "the module evaluated under bun with exports intact (import-at-top IS the no-side-effect proof — a browser/DOM global would have thrown)",
    typeof EXERCISE_TIERS === "object" && typeof tierFor === "function" && typeof bestForMuscle === "function"
  )
}

// ── 7 · picker wiring statics (TrainingView source) ─────────────────────────
console.log("[R71-b probe] 7 · picker wiring statics (src/components/fitness/TrainingView.tsx)")

const tv = readFileSync("src/components/fitness/TrainingView.tsx", "utf8")
assert(
  "dynamic count rendered, not a stale literal: {EXERCISES.length} exercises · MET values from the 2011 Compendium (sheet) + header line",
  tv.includes("{EXERCISES.length} exercises · MET values from the 2011 Compendium") &&
    tv.includes("{EXERCISES.length} exercises · Compendium MET burn model")
)
assert(
  'ranked status line present: "Best for {label} — ranked" (the BEST FOR … header)',
  tv.includes("Best for {label} — ranked")
)
assert(
  "TierBadge rendered on picker rows with the gold/neutral/dim class ladder",
  tv.includes("<TierBadge tier={tier} />") &&
    tv.includes("gold: 'border border-amber-700/60 bg-amber-950/40 text-amber-300'") &&
    tv.includes("dim: 'border border-zinc-800 bg-zinc-900/40 text-zinc-600'")
)
assert(
  "picker wired to the recommender: imports bestForMuscle + bestForActivity + rankExercises + tierFor + whyFor, rows show the why-line when ranked",
  tv.includes("bestForActivity, bestForMuscle, rankBadge, rankExercises, tierFor, whyFor,") &&
    tv.includes("bestForMuscle(muscle).forEach") &&
    tv.includes("bestForActivity(type).forEach") &&
    tv.includes("{ranked && <div className=\"mt-0.5 truncate text-[10px] text-zinc-500\">{why}</div>}")
)
assert(
  "search threads the active chips (filters combine instead of overriding): searchExercises(q, { muscle … type … })",
  tv.includes("searchExercises(q, { muscle: muscle === 'all' ? undefined : muscle, type: type === 'all' ? undefined : type })")
)

// ── 8 · searchExercises behavior over the expanded list ─────────────────────
console.log("[R71-b probe] 8 · searchExercises")

assert(
  '"incline" finds the fixed exercise: Incline Barbell Bench Press among the hits',
  searchExercises("incline").some((e) => e.id === "incline-barbell-bench-press")
)
assert(
  'filters combine + case-insensitive + honest empty: muscle+type intersect, "BENCH" works, "zzz" → 0',
  searchExercises("", { muscle: "chest", type: "strength" }).every((e) => e.type === "strength" && (e.muscles.includes("chest") || e.secondary.includes("chest"))) &&
    searchExercises("BENCH").length > 0 && searchExercises("zzz").length === 0
)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log(`[R71-b probe] ✅ ALL ${pass} ASSERTIONS PASSED`)
