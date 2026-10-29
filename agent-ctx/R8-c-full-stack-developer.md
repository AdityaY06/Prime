# R8-c — full-stack-developer — Science-data polish

Task ID: R8-c · Files owned: src/lib/nutrition.ts, src/components/fitness/fuel-tab.tsx, src/lib/exercises.ts, src/lib/forge.ts

## What landed

### 1 · Protein timing helpers (src/lib/nutrition.ts — additive, +35 lines)
Section "Protein timing (R8-c)" after R6-c's fiber helpers, matching file style:
- `PROTEIN_PER_MEAL_G_PER_KG = 0.4` — Schoenfeld & Aragon 2018 per-meal dose
- `mealProteinTarget(weightKg)` → `round(0.4 × weightKg)`, guarded (non-finite/≤0 → 0) like `fiberGoalFor`
- `type ProteinDoseVerdict = "DOSE" | "LIGHT" | "SKIP"` + `proteinDoseVerdict(proteinG, weightKg)` — DOSE ≥ target · LIGHT ≥ half · SKIP below
- `feedingSpacingNote()` → "SPREAD 3-4H APART · 4+ FEEDINGS BEAT 2 (ARETA 2013)"
- bun -e checks: target(70)=28 · (77.5)=31 · (52)=21; verdict 28/70=DOSE · 14/70=LIGHT · 13.9/70=SKIP · 0/70=SKIP

### 2 · PROTEIN TIMING panel (fuel-tab.tsx — additive component + render slot)
`ProteinTimingPanel` defined after FuelSciencePanel, rendered in its own FlowItem right AFTER the FUEL SCIENCE panel (same rhythm). Uses the same day payload (`data`) FUEL SCIENCE reacts to:
- Header: "Protein Timing" sys-label + teal `Clock` glyph (lucide import added) as labelAccent
- Line 1 teal » evidence: `~0.4 G/KG PER MEAL · 3-4H APART · 4+ FEEDINGS (SCHOENFELD & ARAGON 2018)` (zinc-400, » teal-400, cite zinc-600)
- Full state: `»SPREAD 3-4H APART · 4+ FEEDINGS BEAT 2 (ARETA 2013)` (feedingSpacingNote) + `TARGET ≈ {mealProteinTarget(weight)} G PER MEAL · {data.targets.protein} G/DAY` (teal-200/90 tabular-nums — daily target from the goal-aware calcTargets payload; NOTE: a `proteinTargetFor` helper does not exist in nutrition.ts, daily target comes from `data.targets.protein`) + one row per meal WITH entries (MEAL_META order, mono text-[10px], `fmt1` protein G, tabular-nums) + dose chip (text-[9px] 1px-border: ✓ DOSE teal · LIGHT amber · SKIP zinc) + footer `TIMING IS SECONDARY — HITTING THE DAILY TARGET COMES FIRST` (zinc-600 mono text-[9px])
- Guard state (weight null OR zero meal rows): evidence line + `LOG MEALS TO SEE DOSE COVERAGE` — empty meals get no row (no nagging)
- Static text only (no interactive elements → no touch-target concerns); aria-labels on the dose list

### 3 · Timed-isometric audit (exercises.ts — ONE flag added)
Full-file audit via rg over hold/hang/sit/plank/tuck/bridge/dead tokens:
- **FLAGGED (new): `Wall handstand hold`** — true static isometric, name says "hold" (only qualifying unflagged entry in the library)
- Existing R7-a six untouched: Plank hold · Wall sit · Copenhagen plank · Side plank · Hollow hold · Superman hold
- **Hold/hang-named, deliberately NOT flagged:** Hanging leg raise (dynamic) · L-sit progression (rep-scaled per spec — name lacks "hold") · Glute bridge (bodyweight) (dynamic — not named "hold") · Plank shoulder taps (dynamic) · Single-leg bridge (dynamic) · Bridge march (dynamic — cue says hold the lockout, movement is reps) · Dead bug (dynamic) · Pull-ups (dynamic; cue mentions dead-hang start, name carries no hold/hang token) · Deadlift family (dynamic lifts — "dead" is not a hold token)
- Task-mentioned candidates that DO NOT EXIST in the library (verified zero rg matches): Dead hang · Single-arm hang · Tuck hold · L-sit hold · Glute bridge hold
- Diff = exactly one line: `timed: true` inserted; no other field touched on any entry → 7 timed total

### 4 · Forge primary-slot loaded-first ranking (forge.ts — minimal tiebreak layer)
R7 QA defect: full-gym advanced PUSH headlined "Archer push-up" (bodyweight skill) over "Bench press". Fix inside `generatePlan`'s day loop:
- `loadedFirst(e) = e.equipment !== "none" && e.type === "strength" ? 0 : 1`
- `ranked(cands, primary = false)` prepends `byLoad(a) − byLoad(b)` to the existing `byDiff || byOverlap` stable sort ONLY when `primary`; `fillSlot` passes `slot.role === "primary"`
- Tier legality is inherent: pools are pre-filtered by `TIER_EQUIPMENT`, so every loaded candidate is tier-legal; on "none" nobody is loaded → the layer is a byte-equal no-op (day-1 of none/strength/3/intermediate is IDENTICAL to R7-a's recorded output). Circuit cardio / Flow mobility / any-bw primaries are structurally unaffected (verified: every cardio-pattern entry is cardio-typed; any-bw pools are bodyweight-typed only)

## Verification (all pasted in worklog R8-c entry)
- `bunx tsc --noEmit` → 0 src/ errors (4 pre-existing examples/skills only)
- `bunx eslint` on the 4 files → exit 0
- 5-config harness (R7-a's set) — integrity [] on all; full-gym/strength/5/advanced D1 PUSH now: **Bench press 4×4 @45kg RPE8 r180** (primary) · Push press 3×6 @70kg · Archer push-up 3×8 · L-sit progression · Copenhagen plank 3×25S — LOADED press headlines ✓
- Exhaustive sweep: 180 configs · 4320 blocks · 0 violations (integrity + timed-exercises-always-unit-"sec" + none-tier-never-loads-equipment)
- Determinism: 5 configs × 2 runs → JSON.stringify identical
- Wall handstand hold appears in 32/180 plans, always seconds (2-4 × 20-60s), never rep-prescribed, never on banned-pattern days
- Read-only E2E (agent-browser, isolated `r8c` session, closed after): FUEL tab renders PROTEIN TIMING after FUEL SCIENCE; guard state on today (no meals) = evidence line + LOG MEALS TO SEE DOSE COVERAGE; navigated (client-side date buttons only) to Sep 27 which has a logged breakfast → TARGET ≈ 31 G PER MEAL · 140 G/DAY · BREAKFAST 4 G [SKIP chip, zinc border verified in DOM]; zero page errors/console noise; 390×844 viewport scrollWidth=390 (no overflow); DB untouched (GET-only curls, no food logged); dev server never restarted, no build, no commit; scratch harnesses kept outside the repo (/home/z/.r8c-tmp)
