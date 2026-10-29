# R6-c · full-stack-developer — Evidence round (Task 24 / R6)

Scope: surface the science inside the EXISTING fuel / vitals / body experience.
Strict 4-file ownership honored: `src/lib/nutrition.ts` (additive only),
`src/components/fitness/fuel-tab.tsx`, `vitals-tab.tsx`, `body-metrics.tsx`.
No schema changes, no dev/build runs, no touches to muscles.ts /
exercise-dialog / attack-plan / oracle-tip (concurrent agents own them).

## What landed

### A) FUEL SCIENCE strip (fuel-tab.tsx)
- NEW pure helper `fuelScienceRows(data, waterMl)` + `FuelSciencePanel` — one
  compact SystemPanel ("Fuel Science", labelAccent "EVIDENCE · REACTS TO
  TODAY'S LOG") mounted in its own FlowItem between DailyFuelPanel and
  QuickAddPanel (after the macro/target block, after water — where the layout
  breathes). Max 4 rows, teal `»` prefix, sys-label text-[9px] zinc-400,
  citations zinc-600, reactive data tails teal-200/90 tabular-nums.
- Row 1 protein dosing — meals grouped by mealType: concentration
  (one meal > 60 % of total protein) flags FIRST so a skewed day never reads
  as "on track" → "EVEN DOSING — SPLIT PROTEIN ~4×/DAY (ARETA 2013)";
  else any meal ≥ 0.4 g/kg bodyweight (profile weight, else 70 kg default) →
  "EVEN DOSING ON TRACK — ~0.4 G/KG PER MEAL (SCHOENFELD & ARAGON 2018)";
  no meals → static principle "SPREAD ~0.4 G/KG PROTEIN ACROSS 3-4 MEALS";
  logged-but-under-dosed fallback → "SCALE EACH MEAL TOWARD ~0.4 G/KG".
- Row 2 total target — "1.6-2.2 G/KG/DAY PROTEIN COVERS GROWTH (MORTON 2018)"
  + tail from targets.protein / weight: IN RANGE / ABOVE RANGE / BELOW RANGE;
  cut + above 2.2 → qualitative "CUT DOSE, MUSCLE GUARD (HELMS)" (no numbers —
  Helms' range is per kg FFM, so only the qualitative claim is quoted).
- Row 3 hydration — gap ≤ 0 → "HYDRATION ON TARGET — 35 ML/KG RULE";
  gap > 500 ml AND > 50 % of goal → "REPLACE SWEAT LOSS — DRINK BEYOND THIRST
  AFTER TRAINING (ACSM/SAWKA)"; middle → "35 ML/KG DAY RULE · N ML OUTSTANDING".
- Row 4 fiber — "FIBER TARGET — 14 G PER 1000 KCAL (IOM)" + tail
  "≈ 38 G/DAY AT 2720 KCAL" via fiberGoalFor(targets.calories).
- Reacts to the optimistic water override (waterMl prop) — no new fetches.

### B) Vitals evidence lines (vitals-tab.tsx) — additive only
- ReadinessPanel gained an optional-ish `sleepAvg7` prop (only call site
  updated); ONE evidence line rendered in the hero fragment after the RHR
  trend line, before READINESS_CITATION — never stacked:
  sleepAvg7 < 7 → "7-9H SLEEP IS THE RECOVERY MULTIPLIER (HIRSHKOWITZ 2015)"
  (priority), else band MODERATE/BACK OFF → "LOW READINESS — TRAIN AT 3+ RIR
  OR SWAP INTENSITY FOR VOLUME (ROBINSON 2024 PRINCIPLE)", else → "GREEN
  LIGHT — PUSH TOP SETS TO 1-2 RIR TODAY (ROBINSON 2024)". readiness null →
  no line (empty state keeps its own copy).
- Daily check-in: teal "» MORNING RHR ABOVE YOUR 7-DAY BASELINE FLAGS
  INCOMPLETE RECOVERY" right after the AHA method hint (restingHr field
  context exists in CHECK_FIELDS — principle, no citation per policy).
- Testing lab: "» VO₂ BASELINE — 150 MIN/WK MODERATE CARDIO SUPPORTS HEALTH
  (ACSM)" under the FITNESS TESTING LAB header, above <TestLab /> (test-lab.tsx
  itself untouched — not in my ownership).

### C) Body metrics science (body-metrics.tsx + nutrition.ts)
- nutrition.ts ADDITIVE: `waistToHeight(w, h)` (null on invalid, 3-decimals),
  `waistToHeightVerdict(ratio)` → KEEP / WATCH / ACT + the Ashwell note,
  `FIBER_PER_KCAL = 14`, `fiberGoalFor(calories)`. Existing exports untouched.
- body-metrics.tsx: NEW `WhtrReadout` — SystemPanel "Waist-To-Height" with
  threshold-scale labelAccent (<0.5 KEEP · 0.5–0.6 WATCH · >0.6 ACT), big
  count-up ratio (useCountUp from the motion kit, tabular-nums teal-200),
  verdict chip (KEEP emerald / WATCH amber / ACT rose), inputs line
  (95 CM ÷ 182 CM), the Ashwell note (citation dimmed), and the PROTOCOL row
  surfacing the untouched METRIC_TYPES waist hint + "SAME CONDITIONS EACH
  LOG". Mounted in its own FlowItem after the tape-measurements grid, ONLY
  when BOTH latest waist + profile height exist (plain compute after the
  early returns — no conditional hook).
- METRIC_TYPES hints left byte-untouched.

## Verification
- `bun -e` pure-function harness: 18/18 PASS (0/175 → null; 90/175 → 0.514 →
  WATCH; edges 0.5/0.6 → WATCH; 110/175 → ACT; fiberGoalFor 2720 → 38,
  2000 → 28, 0 → 0; FIBER_PER_KCAL 14; NaN → NO DATA).
- Branch-table mirror harness: dosing/target/hydration decision table all
  PASS (17 + 3 corrected-expectation cases; one initial "FAIL" was a
  mislabeled test expectation — gap was 79 % of goal, REPLACE SWEAT is
  correct per spec).
- `bunx tsc --noEmit` → 0 errors in src/ (only pre-existing examples/+skills).
- `bunx eslint` on all 4 files → exit 0, zero errors/warnings.
- agent-browser E2E (desktop, real dev server):
  - FUEL: strip renders 4 live rows on the pristine profile — SPREAD …
    (SCHOENFELD & ARAGON 2018) / MORTON + YOUR TARGET = 1.8 G/KG — IN RANGE /
    REPLACE SWEAT … (ACSM/SAWKA) / FIBER … ≈ 38 G/DAY AT 2720 KCAL.
  - VITALS: RHR + VO₂ lines render in place; readiness hero line verified in
    3 live states via real check-in POSTs — READY 78 → GREEN LIGHT (ROBINSON
    2024); MODERATE 60 → LOW READINESS (ROBINSON 2024 PRINCIPLE); sleep avg
    6.25 → SLEEP MULTIPLIER (HIRSHKOWITZ 2015) outranks the band line.
  - BODY: WAIST-TO-HEIGHT readout verified at 95 cm → 0.52 WATCH and 85 cm →
    0.47 KEEP (count-up, chip, Ashwell note, protocol row); correctly hidden
    with no waist logged.
  - Zero console errors (only pre-existing THREE.Clock warnings); dev.log all
    200s; screenshots r6c-fuel-science*.png, r6c-vitals-readiness.png,
    r6c-body-whtr-{watch,keep}.png.
- E2E cleanup (surgical, verified): deleted the 5 test bodyMetric rows
  (stress/mood/energy/sleep/waist), deleted the +5 "Vitals check-in" XpEvent,
  restored hunter snapshot totalXp 2943 / level 11 / xp 118; post-cleanup
  reload confirms NO VITALS TODAY + readout hidden + readiness null — DB
  pristine.

## Deviations / judgment calls
- Concentration check ordered BEFORE the ≥0.4 g/kg check (spec lists on-track
  first, but a >60 % concentrated day with a big meal must flag Areta, not
  read as "on track" — otherwise the Areta line would be near-dead code).
- Readiness evidence line renders only when readiness exists (the hero);
  sleepAvg7 (the tab's own 7-day series average) is the sleep input.
- "ROBINSON 2024" citations used exactly as dictated by the task text
  (not in the generic approved pool but explicitly specified in Task B).
- Hydration middle state (gap ≤ 500 ml or ≤ 50 %) shows the app-rule row with
  the outstanding ml instead of the aggressive thirst line.
- agent-browser network body-mocking didn't intercept (SW/CLI) → E2E used
  real API calls with full surgical DB restore instead (R5-a precedent).
