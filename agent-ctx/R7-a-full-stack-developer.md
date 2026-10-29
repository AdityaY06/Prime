# R7-a · full-stack-developer — Program Integrity round (forge brain rebuild)

Task ID: R7-a. Files owned (ONLY these touched): `src/lib/exercises.ts` ·
`src/lib/forge.ts` (NEW) · `src/app/api/program/route.ts`.
Concurrent R7-b owns session-raid/program-panel/exercise-dialog display;
R7-c owns engine calibrateDailies/gates-tab/oracle-tip honesty. No overlap.

## What was wrong (audit confirmed)
Legacy generator ranked by muscle-tag overlap with an unfiltered filler pool:
with equipment "none" the strength pool emptied and filler leaked off-focus
blocks (Lunges on PUSH, Dips on LEGS, Sissy squat on PULL; Pull-ups matched
PUSH via their CHEST tag). Timed isometrics got rep prescriptions ("Plank
hold 4×10"), RNG durations were odd (43s holds, 13min walks), and effort was
flat (same sets/RPE for primary and accessory).

## What landed

### A) src/lib/exercises.ts — pattern taxonomy (additive)
- Exported `Pattern` union; `Exercise.pattern: Pattern` (required) +
  `Exercise.timed?: boolean` on the interface; `PlanBlock.pattern?: string` +
  `PlanBlock.unit?: "reps" | "sec"` (optional — legacy plans keep parsing).
- All 194 entries tagged by movement biomechanics via an asserted one-shot bun
  migration (explicit 194-name table; the script's own duplicate/unmapped/
  count guards caught a regex group bug on first run — restored via git,
  fixed, re-run: 194 line-identical insertions, cues byte-untouched).
- Judgment calls (documented for review): shrug→pull-h, upright row→pull-v,
  dips/bench-dip/overhead+pushdown triceps work→push-v, skull-crusher/
  kickback→push-h, lateral/front raise→push-v (shoulder isolation joins the
  vertical bucket so Shoulders days stay coherent), leg-curl/Nordic/clamshell/
  fire-hydrant/band-lateral-walk/hip-abduction→hinge (hamstring/glute-hip
  bucket), leg-extension/thruster/jumps→squat, TGU + wall-handstand family→
  push-v, dumbbell pullover→pull-h (picked once, consistent), bear-crawl +
  inchworm→core, mountain climbers stay cardio (cardio-typed ⇒ pattern cardio,
  verified bidirectionally).
- `timed: true` on EXACTLY the spec'd six: Plank hold, Side plank, Copenhagen
  plank, Wall sit, Hollow hold, Superman hold. Bird dog + plank shoulder taps
  stay reps. (Wall handstand hold / L-sit progression follow the spec's
  explicit "ONLY" list and stay rep-based.)
- Pattern census: push-h 21 · push-v 19 · pull-h 26 · pull-v 6 · squat 21 ·
  hinge 29 · lunge 9 · carry 2 · core 22 · calves 5 · cardio 20 · mobility 14.

### B) src/lib/forge.ts — pure slot-based generator (NEW, ~460 lines)
- Kept verbatim (same semantics): ForgeInput/EquipmentTier/Goal/Experience,
  TIER_EQUIPMENT, hashString/mulberry32/shuffled (private), seed
  `hash(equipment|goal|days|experience)` + per-day `seed+(d+1)*7919`,
  programName tables (proven identical across all 180 inputs — names like
  STORM LATTICE survive the rebuild), splitFor, FOCUS_MUSCLES, familyOf +
  FAMILY_STOPWORDS, SETS_RANGE/RPE_BY_EXP/STRENGTH_REST/WEIGHT_BASE/LOWER_MUSCLES.
- focusKind() normalizes "Full Body A"→"Full Body", "... Circuit"→"Circuit",
  "... Flow"→"Flow".
- TEMPLATE_FOR: ordered role+pattern slots per spec — Push [push-h primary,
  push-v secondary, push accessory, core finisher] · Pull mirror · Legs
  [squat, hinge, lunge, calves-or-core] · Upper/Lower · Full Body · Chest/
  Back/Shoulders/Arms bro-days · Circuit [cardio, any-bw, cardio, any-bw] ·
  Flow all-mobility. workingCount = (5+expIndex)−2; trim from START; overflow
  appends day-agnostic core (then cardio capped 1) — never off-focus.
- Per-slot fill ladder: slot patterns → same-side substitutes (push-v↔push-h,
  pull-v↔pull-h, squat→lunge, lunge→squat, hinge→core, calves→core) → core →
  cardio capped 1; FOCUS_BANS filters every candidate (upper days ban squat/
  hinge/lunge/carry; Legs/Lower ban push-*+pull-v; Full Body/Circuit/Flow
  exempt). Strict pass = one block per movement family per day; ranking =
  |difficulty−(expIndex+1)| → focus-muscle overlap → seeded pre-shuffle
  (stable sort). Family-relaxed safety pass exists only so a day can never
  come up short (unreachable with real pools).
- prescribe() role-aware: primary 3/3/4 sets, RPE_BY_EXP, rest STRENGTH_REST/
  90/60; secondary 3(2) sets, RPE−1 (min 5), rest 120/75/45; accessory rng
  on SETS_RANGE capped 3, RPE−1, rest 60 (squat/hinge/push-h/pull-h @
  strength goal → 90); finisher 2-3 sets RPE 6 rest 45. Rep grids: strength
  3-5 (weighted) / 5-8 (bodyweight) / 6-8 / 8-12; hypertrophy 6-10 / 8-12 /
  10-15; conditioning 12-20. Timed → seconds {20,25,30} accessory,
  {30,40,45,60} lead, sets 2-4/2-3, rest 30-45, unit "sec". Mobility holds
  {30,40,45,60} unit "sec". Cardio: intervals rng<0.35 → 4-6 × 1-2min;
  steady {10,12,15,20} experience-biased grid, sets 1, rest 45. weightKg
  WEIGHT_BASE logic unchanged.
- planIntegrityIssues(plan, input): (a) banned-pattern working blocks on
  split days, (b) unit-sec reps ≤60 && %5===0, (c) steady cardio ∈{10,12,15,
  20,25} / interval ∈{1,2,3}, (d) mobility holds ∈{30,40,45,60}, (e) day
  count, (f) block count = 5+expIndex, (g) later-block RPE > primary RPE.
  Empty array = clean. Negative-tested — every class fires.

### C) route.ts — thin HTTP shell (−329 lines)
Imports generatePlan/programName/ForgeInput + TIERS/GOALS/EXPERIENCES from
@/lib/forge. GET/POST/DELETE byte-identical contract: same error strings,
same transaction retire+create, FORGE_XP 10 ledger-deduped grant,
checkProgramAchievements, programDTO guarded plan parse. No non-HTTP runtime
exports.

## Verification (all pasted in worklog R7-a entry)
- `bunx tsc --noEmit` → 0 src/ errors (4 pre-existing examples/skills only).
- `bunx eslint` on the three files → exit 0.
- 5-config printout: none/strength/3/int · none/hypertrophy/4/nov ·
  full-gym/strength/5/adv · home/conditioning/3/int · none/mobility/2/nov —
  every day pattern-coherent, integrity [] CLEAN on all five.
- Determinism: same config twice → JSON.stringify identical; programName
  old-vs-new across 180 inputs → 0 mismatches.
- Exhaustive sweep: all 180 valid inputs × 4320 blocks → integrity []
  everywhere, block counts exact, 28 focus names, 11 patterns emitted
  (carry has no template slot by design — it's also banned on upper days).
- planIntegrityIssues negative test: all 7 violation classes detected.
- DB untouched (no POST/DELETE to /api/program), dev server untouched, no
  build, no commit. Scratch scripts live outside the repo in ~/.r7a-tmp.

## Handoff notes for R7-b / orchestrator
- Fresh forges emit `pattern` + `unit` on every block ("sec" holds carry
  seconds in `reps`, cardio keeps durationMin with no unit) — R7-b's parser
  additions consume these directly. Stored legacy plans (e.g. the current
  STORM LATTICE with Lunges on the push day) still parse and still render;
  they will simply flag as dirty if run through planIntegrityIssues until
  re-forged.
- The user's current profile (none/strength/3/intermediate) re-forges to the
  same name STORM LATTICE with a coherent Push/Pull/Legs layout (see worklog
  stage summary for the exact day lists).
