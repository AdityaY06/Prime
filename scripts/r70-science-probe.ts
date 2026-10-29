// R70-a · science-facade probe — the 6th tab's wiring + the new pure display
// helpers + registry facts r69-research did NOT already lock.
//   1. registry facts net-new of r69-research (which locks: unique kebab ids,
//      non-empty fields, valid categories, count ≥ 25, every category ≥ 1,
//      manifesto-is-one-paragraph, + live-module math) — this probe locks the
//      EXACT count (33), the exact per-category distribution, the src/-rooted
//      liveSurfaces contract, and the notes field's shape.
//   2. facade wiring — system-store TAB_ORDER, nav TABS/dock grid, page.tsx
//      dynamic import + FACADE_OF + render line, the component's client
//      contract + /api/research fetch, and the forced swipe-flow ghost ripple.
//   3. pure helpers exported by science-tab.tsx (standfirstOf sentence slice,
//      categoryLabel, inputLabel, inputValueChip) — behavior-locked, including
//      against buildResearchDigest's real missing-input vocabulary.
// Run: bun scripts/r70-science-probe.ts
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { TAB_ORDER } from "@/store/system-store"
import { standfirstOf, categoryLabel, inputLabel, inputValueChip } from "@/components/prime/science-tab"
import {
  RESEARCH_CATEGORIES,
  RESEARCH_MANIFESTO,
  RESEARCH_REGISTRY,
  buildResearchDigest,
} from "@/lib/research"

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

const src = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8")

// ── 1 · Registry facts NOT already locked by r69-research ────────────────────
console.log("[R70-a probe] 1 · registry facts (net-new of r69)")
assert(`registry count is EXACTLY 33 (got ${RESEARCH_REGISTRY.length})`, RESEARCH_REGISTRY.length === 33)
const expectedCounts: Record<string, number> = {
  strength: 7,
  nutrition: 9,
  recovery: 1,
  cardio: 4,
  "body-comp": 3,
  vitals: 4,
  readiness: 1,
  energy: 4,
}
assert(
  "per-category distribution 7·9·1·4·3·4·1·4 (the facade's filter counts)",
  RESEARCH_CATEGORIES.every(
    (c) => RESEARCH_REGISTRY.filter((e) => e.category === c).length === expectedCounts[c]
  )
)
assert(
  "every liveSurfaces path is a repo-rooted real path (src/ or scripts/)",
  RESEARCH_REGISTRY.every((e) => e.liveSurfaces.every((s) => s.startsWith("src/") || s.startsWith("scripts/")))
)
assert(
  "some entries carry notes, and every notes field is a non-empty string",
  RESEARCH_REGISTRY.some((e) => e.notes != null) &&
    RESEARCH_REGISTRY.every((e) => e.notes == null || (typeof e.notes === "string" && e.notes.trim().length > 0))
)
assert(
  "an entry name contains \"Epley\" (the E2E render hook)",
  RESEARCH_REGISTRY.some((e) => e.name.includes("Epley"))
)

// ── 2 · Facade wiring ─────────────────────────────────────────────────────────
console.log("[R70-a probe] 2 · facade wiring")
assert(
  `TAB_ORDER is exactly the six-facade ring (got ${JSON.stringify(TAB_ORDER)})`,
  JSON.stringify(TAB_ORDER) === JSON.stringify(["home", "train", "log", "stats", "science", "you"])
)
assert(
  '"science" sits between "stats" and "you" on the ring',
  TAB_ORDER.indexOf("stats") < TAB_ORDER.indexOf("science") && TAB_ORDER.indexOf("science") < TAB_ORDER.indexOf("you")
)

const navSrc = src("src/components/prime/nav.tsx")
assert(
  'nav TABS carries { id: "science", label: "Science", icon: FlaskConical }',
  navSrc.includes('{ id: "science", label: "Science", icon: FlaskConical }')
)
assert("nav imports FlaskConical from lucide-react", /import\s*\{[^}]*FlaskConical[^}]*\}\s*from\s*"lucide-react"/.test(navSrc))
assert("nav dock grid is grid-cols-6 and grid-cols-5 is gone", navSrc.includes("grid-cols-6") && !navSrc.includes("grid-cols-5"))

const pageSrc = src("src/app/page.tsx")
assert('page.tsx dynamic-imports @/components/prime/science-tab', pageSrc.includes('import("@/components/prime/science-tab")'))
assert('page.tsx lazy facade skeleton is labeled "Science"', pageSrc.includes('label="Science"'))
assert('FACADE_OF maps science → "science" (live facade, not legacy)', pageSrc.includes('science: "science"'))
assert(
  "page.tsx renders view === science with the hunter prop (sibling shape)",
  pageSrc.includes('{view === "science" && <ScienceTab hunter={data.hunter} />}')
)

const compSrc = src("src/components/prime/science-tab.tsx")
assert("science-tab.tsx exists and is a client component ('use client')", compSrc.startsWith('"use client"'))
assert('science-tab.tsx fetches "/api/research" via the shared useApi hook', compSrc.includes('useApi<ResearchRes>("/api/research")'))

const swipeSrc = src("src/components/system/swipe-flow.tsx")
assert("swipe-flow TAB_GHOST gained the science silhouette (forced Tab-union ripple)", swipeSrc.includes("science: ["))

// ── 3 · Pure helpers exported by science-tab.tsx ─────────────────────────────
console.log("[R70-a probe] 3 · pure display helpers")
const s1 = standfirstOf(RESEARCH_MANIFESTO, 1)
const s2 = standfirstOf(RESEARCH_MANIFESTO, 2)
assert(
  "standfirstOf(m, 1) is a proper prefix of the manifesto cut on a sentence boundary",
  RESEARCH_MANIFESTO.startsWith(s1) && s1.length < RESEARCH_MANIFESTO.length
)
assert(
  "standfirstOf(m, 2) extends (m, 1) and is still a prefix",
  s2.startsWith(s1) && s2.length > s1.length && RESEARCH_MANIFESTO.startsWith(s2)
)
assert(
  "standfirstOf with a large max returns the whole manifesto (trimmed)",
  standfirstOf(RESEARCH_MANIFESTO, 99) === RESEARCH_MANIFESTO.trim()
)
assert('standfirstOf("") → "" (no-sentence edge)', standfirstOf("", 1) === "")

assert(
  "categoryLabel humanizes every registry category (no raw kebab leaks)",
  RESEARCH_CATEGORIES.every((c) => categoryLabel(c) === categoryLabel(c) && categoryLabel(c) !== c && categoryLabel(c).length > 0)
)
assert('categoryLabel("body-comp") === "Body comp"', categoryLabel("body-comp") === "Body comp")

assert(
  "inputLabel covers the digest's exact missing-input vocabulary",
  inputLabel("weightKg") === "Weight" &&
    inputLabel("heightCm") === "Height" &&
    inputLabel("age") === "Age" &&
    inputLabel("sex") === "Sex" &&
    inputLabel("activityLevel") === "Activity level" &&
    inputLabel("goal") === "Goal"
)
assert('inputLabel falls back to de-camel-cased lower (unknown keys)', inputLabel("heartRateVar") === "heart rate var")
assert(
  "inputValueChip renders units for the measured inputs and plain strings otherwise",
  inputValueChip("weightKg", 77.5) === "77.5 kg" &&
    inputValueChip("heightCm", 182) === "182 cm" &&
    inputValueChip("age", 31) === "31 y" &&
    inputValueChip("sex", "male") === "male"
)

// the helpers against the REAL digest vocabulary (KAEL-shaped partial profile
// — the exact honest-null case the facade renders as amber chips)
const dp = buildResearchDigest(
  {
    heightCm: 182,
    weightKg: 77.5,
    birthYear: 1994,
    sex: null,
    activityLevel: null,
    goal: null,
    macroSplit: null,
  },
  { weightKg: 77.5, waistCm: null, neckCm: null, hipsCm: null }
)
assert(
  "partial-profile digest missingInputs render as [Sex, Activity level, Goal] chips",
  JSON.stringify(dp.nutrition.missingInputs.map(inputLabel)) === JSON.stringify(["Sex", "Activity level", "Goal"])
)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
console.log(`[R70-a probe] ✅ ALL ${pass} ASSERTIONS PASSED`)
