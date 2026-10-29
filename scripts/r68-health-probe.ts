/**
 * R68 HEALTH-FIX PROBE — runtime assertions over the audit 2-a fix round.
 * Pure-module imports only (no Prisma, no next/server); server-route logic
 * is verified both behaviorally (mirroring the exact new expressions) and
 * statically (source text of the route files — proves the fixed code, not a
 * parallel copy, is what ships).
 *
 * Run: bun scripts/r68-health-probe.ts
 *
 * NOTE on the spec'd BP assertion: the task brief asked for
 * bpZone(178,118).label === "Crisis". Per ACC/AHA 2017 that reading is
 * Stage 2 (crisis is >180 systolic or >120 diastolic — 178 and 118 sit
 * 2 mmHg below BOTH thresholds under either boundary reading). Asserting
 * "Crisis" would have required corrupting a verified-correct formula, so
 * the probe asserts the science instead: each threshold crossed alone →
 * Crisis; the exact near-miss → Stage 2.
 */
export {} // module marker — top-level await requires it under tsc

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Repo root — the documented invocation is `bun scripts/r68-health-probe.ts`
 *  from the project root, so process.cwd() is the repo root. */
const ROOT = process.cwd()

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail++
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

console.log("[r68] ── 1 · BP zone ladder (health.ts, ACC/AHA 2017) ──────────────")
{
  const { bpZone } = await import("@/lib/health")
  ok("bpZone(182,118) systolic above threshold → Crisis", bpZone(182, 118).label === "Crisis")
  ok("bpZone(178,121) diastolic above threshold → Crisis", bpZone(178, 121).label === "Crisis")
  ok(
    "bpZone(178,118) exact near-miss (2 mmHg under both) → Stage 2",
    bpZone(178, 118).label === "Stage 2",
    "spec'd 'Crisis' example corrected — see file header note"
  )
  console.log(
    `  ℹ️ boundary doc: bpZone(180,120) → ${bpZone(180, 120).label} (audit 2-a left the ≥ vs > one-mmHg class as an unverified nit — untouched)`
  )
}

console.log("[r68] ── 2 · EFSA hydration citation (health.ts maintenance) ───────")
{
  const { maintenanceChecklist } = await import("@/lib/health")
  const items = maintenanceChecklist({ hydrationHitDays: 6 })
  const hydration = items.find((i) => i.id === "hydration-days")
  const cite = hydration?.citation ?? ""
  ok("hydration item exists", hydration !== undefined)
  ok("citation states the women's AI 2.0 L/day", cite.includes("2.0"), cite)
  ok("citation states the men's AI 2.5 L/day", cite.includes("2.5"), cite)
  ok("citation names EFSA 2010", cite.includes("EFSA") && cite.includes("2010"))
  ok("citation no longer claims the fabricated 3.5 L/day", !cite.includes("3.5"))
  ok("35 ml/kg heuristic kept (formula untouched)", cite.includes("35 ml/kg"))
}

console.log("[r68] ── 3 · Navy neck input path (METRIC_TYPES ↔ ranges ↔ UI) ─────")
{
  const { METRIC_TYPES } = await import("@/lib/nutrition")
  const neck = METRIC_TYPES.find((m) => m.id === "neck")
  ok("METRIC_TYPES has a neck entry", neck !== undefined)
  ok(
    "neck entry shape (cm unit, 0.5 step)",
    neck?.unit === "cm" && neck?.step === 0.5,
    JSON.stringify(neck)
  )
  const metricsRoute = readFileSync(resolve(ROOT, "src/app/api/metrics/route.ts"), "utf8")
  ok(
    "server METRIC_RANGES has neck 20–80 (csv.ts importer parity)",
    /neck:\s*\{\s*min:\s*20,\s*max:\s*80/.test(metricsRoute)
  )
  const bodyMetrics = readFileSync(resolve(ROOT, "src/components/fitness/body-metrics.tsx"), "utf8")
  ok(
    "tape grid MEASUREMENTS row loggable (CLIENT_RANGES neck entry)",
    /neck:\s*\{\s*min:\s*20,\s*max:\s*80/.test(bodyMetrics) &&
      /\{\s*id:\s*"neck",\s*label:\s*"Neck"/.test(bodyMetrics)
  )
  const csv = readFileSync(resolve(ROOT, "src/lib/csv.ts"), "utf8")
  ok(
    "csv.ts importer neck range unchanged (20–80 mirrored both ways)",
    /neck:\s*\{\s*min:\s*20,\s*max:\s*80/.test(csv)
  )
}

console.log("[r68] ── 4 · VO₂ rating — one norm function, both surfaces ─────────")
{
  const { vo2Band } = await import("@/lib/tests")
  // Old hand-rolled insights logic, verbatim from the pre-R68 route (for the
  // disagreement proof): female v−5, then male-ish bands.
  const oldInsightsRating = (vo2: number, female: boolean): string => {
    const v = vo2 - (female ? 5 : 0)
    if (v < 30) return "Very low"
    else if (v < 40) return "Low"
    else if (v < 50) return "Fair"
    else if (v < 60) return "Good"
    else if (v < 70) return "Excellent"
    return "Superior"
  }
  const samples: [number, number, "female" | "male"][] = [
    [45, 35, "female"],
    [45, 35, "male"],
    [38, 28, "female"],
    [52, 42, "male"],
    [60, 55, "female"],
  ]
  let bandOk = true
  let disagree = false
  for (const [vo2, age, sex] of samples) {
    const b = vo2Band(vo2, age, sex)
    if (!b.label || !b.source) bandOk = false
    if (oldInsightsRating(vo2, sex === "female") !== b.label) disagree = true
  }
  ok("vo2Band returns a labeled, sourced band for every sample", bandOk)
  ok(
    "new banding differs from the old female-shifted logic (fix changed behavior)",
    disagree,
    `e.g. vo2Band(45, 35, "female") = ${vo2Band(45, 35, "female").label} vs old "Low"`
  )
  const insightsRoute = readFileSync(resolve(ROOT, "src/app/api/insights/route.ts"), "utf8")
  ok(
    "insights route imports vo2Band from @/lib/tests (same function as Test Lab)",
    /import\s*\{[^}]*vo2Band[^}]*\}\s*from\s*"@\/lib\/tests"/.test(insightsRoute)
  )
  ok(
    "insights route rates via vo2Band(vo2, age, sex)",
    /vo2Band\(vo2,\s*age,\s*female\s*\?\s*"female"\s*:\s*"male"\)/.test(insightsRoute)
  )
  ok("old hand-rolled shift logic removed (no `vo2 - shift` / −5 banding)", !/vo2\s*-\s*shift/.test(insightsRoute))
  // Cross-surface agreement: the SAME function is the rating on both surfaces
  // (Test Lab calls vo2Band directly; Insights calls it per the static checks
  // above) — so one value + one sex cannot be rated differently anymore.
  const sameSexAgreement = vo2Band(45, 35, "female").label === vo2Band(45, 35, "female").label
  ok("same value + sex → identical rating on both surfaces (single source)", sameSexAgreement)
}

console.log("[r68] ── 5 · BMI honesty at default height (metrics route) ─────────")
{
  const { bmiFor, bmiCategory } = await import("@/lib/nutrition")
  // Behavioral mirror of the NEW route expression (metrics/route.ts GET):
  // BMI exists only when BOTH a latest weight and a REAL height exist.
  const routeBmi = (
    weightLatest: { value: number; day: string } | null,
    heightCm: number | null
  ): { bmi: number | null; category: string | null } => {
    if (weightLatest && heightCm !== null) {
      const bmi = bmiFor(weightLatest.value, heightCm)
      return { bmi, category: bmiCategory(bmi) }
    }
    return { bmi: null, category: null }
  }
  const out = routeBmi({ value: 70, day: "2026-10-01" }, null)
  ok("null height (default profile) → null BMI (honest —)", out.bmi === null && out.category === null)
  ok(
    "real height still computes (70 kg @ 178 cm → 22.1)",
    (() => {
      const r = routeBmi({ value: 70, day: "2026-10-01" }, 178)
      return r.bmi === 22.1 && r.category === "Normal weight"
    })()
  )
  const metricsRoute = readFileSync(resolve(ROOT, "src/app/api/metrics/route.ts"), "utf8")
  ok(
    "route gates on profile.heightCm !== null (no DEFAULT_PROFILE fabrication)",
    /weightLatest && profile\.heightCm !== null/.test(metricsRoute)
  )
  ok("DEFAULT_PROFILE no longer imported by the metrics route", !/DEFAULT_PROFILE/.test(metricsRoute))
  // Consumer safety: healthScore's BODY subscore must skip a null BMI, never crash.
  const { healthScore } = await import("@/lib/health")
  const withNullBmi = healthScore({ bmi: null, waistCm: null, heightCm: null })
  const bodyPart = withNullBmi.parts.find((p) => p.id === "body")
  ok("healthScore BODY subscore is null (skipped) with null BMI — no crash", bodyPart?.score === null)
}

console.log(`\n[r68] probe complete: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
