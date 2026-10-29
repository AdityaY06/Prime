// R69-c · research-registry probe — integrity + live-module spot-verification
// + digest-math check for the /api/research surface.
//   1. registry integrity (unique kebab ids, non-empty fields, valid
//      categories, count ≥ 25, every category represented)
//   2. three registry expressions verified against their live modules
//      (Epley e1RM · MET kcal · Israetel landmarks) plus neighbors
//   3. digest math — buildResearchDigest reproduces the same calcTargets
//      call the route uses, and honest-nulls when the profile is incomplete
// Run: bun scripts/r69-research-probe.ts
import {
  RESEARCH_CATEGORIES,
  RESEARCH_MANIFESTO,
  RESEARCH_REGISTRY,
  buildResearchDigest,
  type ResearchEntry,
} from "@/lib/research"
import { epleyE1rm, E1RM_MAX_REPS, validE1rmSet } from "@/lib/progression"
import { estimate1RM, restSeconds, rpeToRir, warmupSets } from "@/lib/lifting-math"
import { landmarkFor, zoneFor } from "@/lib/volume-landmarks"
import { metKcal } from "@/lib/fitness/calc"
import { calcTargets, hydrateGoalMl } from "@/lib/nutrition"
import { dailyStrain, acwrVerdictOf } from "@/lib/load"
import { freshness } from "@/lib/recovery"

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
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

// ── 1 · Registry integrity ────────────────────────────────────────────────────
console.log("[R69 probe] 1 · registry integrity")
const ids = RESEARCH_REGISTRY.map((e) => e.id)
assert(
  `unique ids (${ids.length} entries, ${new Set(ids).size} distinct)`,
  new Set(ids).size === ids.length
)
assert("every id is kebab-case", ids.every((id) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)))
assert(
  "every entry has non-empty name / expression / citation / liveSurfaces",
  RESEARCH_REGISTRY.every(
    (e: ResearchEntry) =>
      e.name.trim().length > 0 &&
      e.expression.trim().length > 0 &&
      e.citation.trim().length > 0 &&
      Array.isArray(e.liveSurfaces) &&
      e.liveSurfaces.length > 0 &&
      e.liveSurfaces.every((s) => s.trim().length > 0)
  )
)
assert(
  "every category ∈ the RESEARCH_CATEGORIES union",
  RESEARCH_REGISTRY.every((e) => (RESEARCH_CATEGORIES as readonly string[]).includes(e.category))
)
assert(`registry count ≥ 25 (got ${RESEARCH_REGISTRY.length})`, RESEARCH_REGISTRY.length >= 25)
for (const cat of RESEARCH_CATEGORIES) {
  const n = RESEARCH_REGISTRY.filter((e) => e.category === cat).length
  assert(`category "${cat}" has ≥ 1 entry (${n})`, n >= 1)
}
assert(
  "manifesto is one honest non-empty paragraph",
  RESEARCH_MANIFESTO.length > 200 && !RESEARCH_MANIFESTO.includes("\n")
)

// ── 2 · Spot-verify registry expressions against their live modules ──────────
console.log("[R69 probe] 2 · live-module spot-verification")
// Epley entry (src/lib/progression.ts)
assert("epleyE1rm(100, 5) ≈ 116.6667 — w × (1 + reps/30)", near(epleyE1rm(100, 5), 100 * (1 + 5 / 30)))
assert("epleyE1rm(100, 1) === 100 — r=1 identity pin", epleyE1rm(100, 1) === 100)
assert("E1RM_MAX_REPS === 12 (domain)", E1RM_MAX_REPS === 12)
assert("validE1rmSet(13, 100) === false — outside the 1-12 domain", validE1rmSet(13, 100) === false)
assert("lifting-math estimate1RM(100, 5) ≈ 116.67 (2-decimal twin)", estimate1RM(100, 5) === 116.67)

// MET entry (src/lib/fitness/calc.ts)
assert(
  "metKcal(8, 30, 80) === round((8×3.5×80/200)×30) = 336 — ACSM metabolic equation",
  metKcal(8, 30, 80) === Math.round(((8 * 3.5 * 80) / 200) * 30)
)

// Volume landmark entry (src/lib/volume-landmarks.ts)
const chest = landmarkFor("CHEST")
assert('landmarkFor("CHEST").mev === 8 (Israetel 2020)', chest !== null && chest.mev === 8)
assert(
  'landmarkFor("CHEST") = { mev 8 · mav 12-20 · mrv 22 }',
  chest !== null && chest.mavLo === 12 && chest.mavHi === 20 && chest.mrv === 22
)
assert("zoneFor(23, CHEST) === OVERREACH (> mrv 22)", chest !== null && zoneFor(23, chest) === "OVERREACH")
assert("landmarkFor(\"CORE\") === null (observation-only, no landmark)", landmarkFor("CORE") === null)

// Neighbors the registry also documents
assert('restSeconds("compound") === 180 (Schoenfeld 2016)', restSeconds("compound") === 180)
assert("rpeToRir(8) === 2 (Tuchscherer/Zourdos CR10↔RIR)", rpeToRir(8) === 2)
assert(
  "warmupSets(100) = BAR×10 · 50%×8 · 70%×5 · 85%×3 (McGowan 2015)",
  (() => {
    const w = warmupSets(100)
    return (
      w.length === 4 &&
      w[0].label === "BAR" && w[0].reps === 10 && w[0].weight === 20 &&
      w[1].pct === 50 && w[1].reps === 8 && w[1].weight === 50 &&
      w[2].pct === 70 && w[2].reps === 5 && w[2].weight === 70 &&
      w[3].pct === 85 && w[3].reps === 3 && w[3].weight === 85
    )
  })()
)
assert("freshness(48, 6) ≈ 85 (curve anchor at volumeFactor 1)", Math.abs(freshness(48, 6) - 85) < 0.5)
assert("dailyStrain(600) === 21 (saturation ceiling)", dailyStrain(600) === 21)
assert("acwrVerdictOf(0.9) === OPTIMAL (Gabbett sweet spot)", acwrVerdictOf(0.9) === "OPTIMAL")

// ── 3 · Digest math — same calcTargets call the route uses ───────────────────
console.log("[R69 probe] 3 · digest math (buildResearchDigest vs calcTargets)")

// Full profile → every surfaced number equals the calcTargets output.
const fullProfile = {
  heightCm: 180,
  weightKg: 80,
  birthYear: 1990,
  sex: "male",
  activityLevel: "moderate",
  goal: "cut",
  macroSplit: null,
}
const t = calcTargets(fullProfile)
const d = buildResearchDigest(fullProfile, { weightKg: 80, waistCm: null, neckCm: null, hipsCm: null })
assert("digest bmr === calcTargets().bmr (Mifflin-St Jeor)", d.nutrition.bmr === t.bmr)
assert("digest tdee === calcTargets().tdee", d.nutrition.tdee === t.tdee)
assert("digest calories === calcTargets().calories", d.nutrition.targets.calories === t.calories)
assert("digest protein === calcTargets().protein", d.nutrition.targets.protein === t.protein)
assert("digest carbs === calcTargets().carbs", d.nutrition.targets.carbs === t.carbs)
assert("digest fat === calcTargets().fat", d.nutrition.targets.fat === t.fat)
assert("digest waterMl === hydrateGoalMl(80)", d.nutrition.targets.waterMl === hydrateGoalMl(80))
assert("digest model label is Mifflin-St Jeor", d.nutrition.model === "Mifflin-St Jeor")
assert("full profile → missingInputs empty", d.nutrition.missingInputs.length === 0)
assert("digest inputsUsed echoes the real profile", d.nutrition.inputsUsed.weightKg === 80 && d.nutrition.inputsUsed.heightCm === 180)
assert(
  "digest bodyComp bmi = bmiFor(80 kg, 180 cm) = 24.7 · Normal weight",
  d.bodyComp.bmi === 24.7 && d.bodyComp.bmiCategory === "Normal weight"
)
assert("navyInputsPresent: height true, tape false", d.bodyComp.navyInputsPresent.heightCm === true && d.bodyComp.navyInputsPresent.neck === false)
assert("readiness inputsConsidered = the readiness metric list", JSON.stringify(d.readiness.inputsConsidered) === JSON.stringify(["sleep", "restingHr", "mood", "energy", "hrv"]))

// KAEL-shaped partial profile (height/weight/birthYear only) → honest nulls.
const partial = {
  heightCm: 182,
  weightKg: 77.5,
  birthYear: 1994,
  sex: null,
  activityLevel: null,
  goal: null,
  macroSplit: null,
}
const dp = buildResearchDigest(partial, { weightKg: 77.5, waistCm: null, neckCm: null, hipsCm: null })
assert("partial profile → bmr null (Mifflin needs sex)", dp.nutrition.bmr === null)
assert("partial profile → tdee null", dp.nutrition.tdee === null)
assert("partial profile → calories/protein/carbs/fat null (never default-derived)", dp.nutrition.targets.calories === null && dp.nutrition.targets.protein === null && dp.nutrition.targets.carbs === null && dp.nutrition.targets.fat === null)
assert("partial profile → waterMl = hydrateGoalMl(77.5) = 2700 (weight-only dependency)", dp.nutrition.targets.waterMl === hydrateGoalMl(77.5) && dp.nutrition.targets.waterMl === 2700)
assert("partial profile → missingInputs = [sex, activityLevel, goal] (age present via birthYear)", JSON.stringify(dp.nutrition.missingInputs) === JSON.stringify(["sex", "activityLevel", "goal"]))
assert("partial profile → inputsUsed echoes nulls honestly", dp.nutrition.inputsUsed.sex === null && dp.nutrition.inputsUsed.activityLevel === null && dp.nutrition.inputsUsed.goal === null && dp.nutrition.inputsUsed.age === new Date().getFullYear() - 1994)
assert("partial profile → bmi = bmiFor(77.5, 182) = 23.4 · Normal weight", dp.bodyComp.bmi === 23.4 && dp.bodyComp.bmiCategory === "Normal weight")

// No weight metric at all → bmi null (the /api/metrics R68 B8 mirror).
const dn = buildResearchDigest(partial, { weightKg: null, waistCm: null, neckCm: null, hipsCm: null })
assert("no latest weight → bmi null + category null", dn.bodyComp.bmi === null && dn.bodyComp.bmiCategory === null)
assert("no weight in profile → waterMl null too", buildResearchDigest({ heightCm: 180, weightKg: null, birthYear: 1990, sex: "male", activityLevel: "light", goal: "maintain", macroSplit: null }, { weightKg: null, waistCm: null, neckCm: null, hipsCm: null }).nutrition.targets.waterMl === null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log(`ALL ${pass} ASSERTIONS PASSED`)
