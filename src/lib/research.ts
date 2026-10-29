// ─── PRIME · Research registry (R69-c — science & research surface) ───────────
// Pure data + pure functions only — isomorphic (NO React, NO server-only
// imports; the only dependency is lib/nutrition.ts, itself client-safe).
//
// WHAT THIS IS: the app's live formula/citation ledger. One row per formula
// family the app actually runs, with the citation EXACTLY as the code's own
// documentation states it (lightly reformatted, never upgraded), the honest
// validity domain, and the real file paths where the formula lives.
//
// IRON RULE (mirrors the R68 audits): a formula without an honest external
// source ships as a documented judgment call ("in-house composite…"), never a
// dressed-up citation. Where the code documents no external source, the
// citation field says so.
//
// Provenance: every entry below was harvested by reading its liveSurfaces
// files (R69-c, after the R68 audit rounds 2-a/2-b/2-c + fixes 3-a/3-b).

import {
  bmiCategory,
  bmiFor,
  calcTargets,
  hydrateGoalMl,
  type ProfileInput,
} from "@/lib/nutrition"

// ─── Types ────────────────────────────────────────────────────────────────────

/** The eight formula families the app's science runs in. */
export const RESEARCH_CATEGORIES = [
  "strength",
  "nutrition",
  "recovery",
  "cardio",
  "body-comp",
  "vitals",
  "readiness",
  "energy",
] as const

export type ResearchCategory = (typeof RESEARCH_CATEGORIES)[number]

export type ResearchEntry = {
  /** Stable kebab-case id — unique across the registry. */
  id: string
  category: ResearchCategory
  /** Human name of the formula family. */
  name: string
  /** Human-readable formula/rule, e.g. "1RM ≈ w × (1 + reps/30)". */
  expression: string
  /** Honest validity domain, e.g. "1-12 integer reps, load > 0". */
  validityDomain?: string
  /** As documented in the code's own comments — never invented or upgraded. */
  citation: string
  /** Real file paths where the formula lives (verified by harvest). */
  liveSurfaces: string[]
  notes?: string
}

// ─── The registry ─────────────────────────────────────────────────────────────

export const RESEARCH_REGISTRY: readonly ResearchEntry[] = [
  // ── STRENGTH ────────────────────────────────────────────────────────────────
  {
    id: "epley-e1rm",
    category: "strength",
    name: "Epley estimated 1RM",
    expression: "1RM ≈ w × (1 + reps/30); reps = 1 → w (identity pin)",
    validityDomain:
      "1-12 integer reps at a positive load (E1RM_MAX_REPS = 12, validE1rmSet row filter); r=1 is the measured max; guards: reps < 1 or load ≤ 0 → 0/null",
    citation:
      'Epley B. "The Method" (1985, Nebraska strength-coach handout); cross-validated against measured 1RMs by LeSure et al. 1997, J Strength Cond Res (accuracy best at ≤10 reps, acceptable to ~12) — as documented in strength-science.ts (the R69-a single source of truth) and its re-export surfaces',
    liveSurfaces: [
      "src/lib/strength-science.ts",
      "src/lib/progression.ts",
      "src/lib/lifting-math.ts",
      "src/lib/muscles.ts",
      "src/lib/fitness/calc.ts",
      "src/app/api/insights/route.ts",
      "src/app/api/oracle/route.ts",
      "src/components/fitness/directives-tab.tsx",
    ],
    notes:
      "1RM consolidation (R69-a) landed mid-harvest: strength-science.ts was absent at first read, then arrived as the single Epley/Brzycki/ramp core with the historical modules re-exporting it — this registry was re-verified against the landed tree (the four-implementation drift audit 2-b I3 flagged is closed). The R69-d orchestrator close-out folded the last three inline Epley copies (insights strength-standards, oracle view facts, directives squat-e1RM) onto the same core: r=1 pin + 1-12 domain everywhere; insights' 13+ rep records contribute their raw weight as an e1RM lower bound (the R68 PR-pace precedent).",
  },
  {
    id: "brzycki-1rm-toolkit",
    category: "strength",
    name: "Brzycki 1RM + consensus blend + %-of-max table",
    expression:
      "1RM ≈ w × 36 / (37 − reps) — naturally exact at r=1 (36/36), no pin needed; consensus 1RM = round((Epley + Brzycki) / 2); %-of-max ladder 95/90/85/75/70/65/60% (muscles.ts repMaxTable: 95…50%)",
    validityDomain:
      "integer reps 1-12 at a positive finite load — else null (no honest estimate); muscles.ts's legacy guard returns 0 outside the domain (its number contract)",
    citation:
      'Brzycki M. 1993, JOPERD 64:88-90 — "Strength Testing: Predicting a One-Rep Max from Reps-to-Fatigue"; the 36/(37−r) linear relationship is validated in the same sub-10-12 rep range as Epley (LeSure et al. 1997); the consensus mean is documented as "the two best-validated formulas" (strength-science.ts / calc.ts)',
    liveSurfaces: ["src/lib/strength-science.ts", "src/lib/muscles.ts", "src/lib/fitness/calc.ts"],
    notes:
      "R69-a's consolidation replaced calc.ts's legacy r ≥ 37 → w × 1.06 branch (an invented constant with no citation — audit 2-b B6) with the honest null domain. PERCENT_1RM remains a coherent NSCA coarsening per the audit.",
  },
  {
    id: "warmup-ramp-mcgowan-2015",
    category: "strength",
    name: "Barbell warm-up ramp",
    expression: "empty-bar ×10 → ~50% ×8 → ~70% ×5 → ~85% ×3, rungs rounded to the nearest loadable weight (2.5 kg default)",
    validityDomain: "working weight above the bar; a working weight at/below the bar → no ramp (empty list)",
    citation:
      'McGowan et al. 2015, Sports Med 45(11) — "Warm-Up Strategies for Sport": ramped intensity (≈40–60% → ≈70% → ≈80–90% of working load with decreasing volume)',
    liveSurfaces: [
      "src/lib/strength-science.ts",
      "src/lib/lifting-math.ts",
      "src/components/fitness/body-atlas-tab.tsx",
    ],
    notes:
      "R69-a closed the audit 2-b I2 ramp-voice split: the WARMUP_RAMP constant in strength-science.ts is now the ONE ramp voice (percentages AND reps), replacing exercise-dialog's 40/60/80 presets and the oracle's inline ramp string; lifting-math's warmupSets reads it. The R69-d close-out folded body-atlas's OneRmPanel (the last 40/60/80 × 5/3/1 holdout) onto the same constant — 4 of 4 voices harmonized.",
  },
  {
    id: "rest-intervals-schoenfeld-2016",
    category: "strength",
    name: "Rest-interval prescription",
    expression: "compound 180 s · isolation 90 s · default 120 s",
    citation:
      "Schoenfeld et al. 2016, J Strength Cond Res 30(7) — trained men resting 3 minutes between compound sets gained significantly more hypertrophy than the 1-minute group; isolation tolerates the short end (~1–2 min)",
    liveSurfaces: ["src/lib/lifting-math.ts"],
  },
  {
    id: "rpe-rir-cr10-scale",
    category: "strength",
    name: "RPE ↔ reps-in-reserve",
    expression: "RPE 10 → 0 RIR, 9 → 1, 8 → 2, 7 → 3, 6 → 4, 5 → 5; > 10 clamps to 0; below 5 (or non-finite) unratable → null",
    validityDomain: "RPE 5–10 — 'hard set' territory; the scale is only defined there",
    citation:
      "RIR-based RPE scale as defined by Tuchscherer (2008, RTF Systems) and operationalized for barbell training by Zourdos et al. 2016, J Strength Cond Res (lifting-math.ts rpeToRir); the rpe.ts table-only twin is documented as the consensus CR10↔RIR reading with NO study citation (its header's honesty rule)",
    liveSurfaces: ["src/lib/lifting-math.ts", "src/lib/rpe.ts"],
  },
  {
    id: "double-progression-engine",
    category: "strength",
    name: "Double-progression verdicts + RIR modulation",
    expression:
      "e1rm ≥ prev × 1.02 → BUMP LOAD (+2.5 kg upper / +5 kg lower); within ±2% → ADD REPS; < prev × 0.98 → HOLD; bodyweight-only history judged on reps; RIR 0 → prescribed counts halved, RIR ≥ 3 → × 1.5",
    validityDomain: "≥ 3 sessions of history (else LOG MORE); RIR modulation only when RIR was captured",
    citation:
      "in-house composite — documented judgment call, see src/lib/progression.ts suggest() JSDoc (header labels the R8-a RIR modulation 'Robinson 2024 proximity logic' as written)",
    liveSurfaces: ["src/lib/progression.ts"],
  },
  {
    id: "volume-landmarks-israetel-2020",
    category: "strength",
    name: "Weekly hard-set volume landmarks",
    expression:
      "weekly hard sets per muscle vs MEV / MAV / MRV (e.g. CHEST 8 / 12–20 / 22; BACK 10 / 14–22 / 25; …CALVES 8 / 12–16 / 20); zones 0 → UNTRAINED, < MEV → UNDER, ≤ MAV-hi → PRODUCTIVE, ≤ MRV → STIMULATING, > MRV → OVERREACH; cardio/mobility rows excluded (not hard resistance sets)",
    validityDomain:
      "last 7 days of logs; indirect sets counted into every muscle tag (footer discloses); unresolved custom names contribute to no muscle (honest); CORE / FULL BODY are observation-only rows with no landmark",
    citation:
      "Israetel 2020 (Renaissance Periodization volume landmarks — evidence-informed expert GUIDELINES, not laws) — exact table as documented in volume-landmarks.ts",
    liveSurfaces: ["src/lib/volume-landmarks.ts", "src/app/api/volume/route.ts"],
  },

  // ── NUTRITION ───────────────────────────────────────────────────────────────
  {
    id: "mifflin-st-jeor-bmr-tdee",
    category: "nutrition",
    name: "Mifflin-St Jeor BMR → TDEE",
    expression:
      "BMR = 10×kg + 6.25×cm − 5×age + (male +5 / female −161); TDEE = BMR × {sedentary 1.2 · light 1.375 · moderate 1.55 · active 1.725 · very 1.9}; calories = max(floor, TDEE + {cut −450 · maintain 0 · bulk +300}), floors 1200 (female) / 1500 (male)",
    validityDomain: "age clamped 15–80; unknown activity → 1.55 fallback inside calcTargets (defaults disclosed by the digest's honest-null gating)",
    citation:
      'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. "A new predictive equation for resting energy expenditure in healthy individuals." Am J Clin Nutr. 1990;51(2):241-7 — validated on 498 subjects, most accurate general-population BMR equation (Frankenfield et al. 2005) — full citation in fitness/calc.ts; activity multipliers documented as "position-stand multipliers" (calc.ts)',
    liveSurfaces: ["src/lib/nutrition.ts", "src/lib/fitness/calc.ts"],
  },
  {
    id: "goal-macro-dosing",
    category: "nutrition",
    name: "Goal macro dosing + split presets",
    expression:
      "protein = kg × {cut 2.2 · maintain 1.8 · bulk 1.6} (or MACRO_SPLITS preset: balanced 1.8 · highprotein 2.4 · lowcarb 2.0 · carbload 1.6 g/kg); fat = calories × {25% default · preset 18–40%} / 9; carbs = remainder with a 50 g floor",
    validityDomain: "an explicit non-null macroSplit preset overrides the per-goal defaults; null keeps them",
    citation:
      "per-goal dosing documented as 'Morton-adjacent attribution — goal dosing above the general guideline, not a contradiction' (science.ts R68 comment); fitness/calc.ts documents '1.6 g/kg breakpoint (Morton et al. 2018, BJSM meta-analysis, n=1,863); 2.2 g/kg upper context; lean dieters higher end (Helms et al. 2014, JISSN)' and 'fat: ≥0.8 g/kg floor · 20–35% AMDR'",
    liveSurfaces: ["src/lib/nutrition.ts", "src/lib/fitness/calc.ts", "src/lib/science.ts"],
  },
  {
    id: "protein-per-meal-dose",
    category: "nutrition",
    name: "Per-meal protein dose + feeding spacing",
    expression: "per-meal target = round(0.4 g × kg); verdict DOSE ≥ target · LIGHT ≥ half · SKIP below; spacing 3–4 h, 4+ feedings beat 2",
    citation:
      "~0.4 g/kg per meal (Schoenfeld & Aragon 2018) and the Areta 2013 feeding-frequency signal (4 × 20 g whey beat 2 × 40 g for myofibrillar protein synthesis) — as documented in nutrition.ts R8-c",
    liveSurfaces: ["src/lib/nutrition.ts"],
  },
  {
    id: "micro-target-caps",
    category: "nutrition",
    name: "Fiber / sodium / sugar micro targets",
    expression:
      "fiber = round(14 g per 1000 kcal); sodium cap 2300 mg flat (not calorie-scaled); added-sugar cap = max(25 g, round(calories × 10% / 4 kcal))",
    citation:
      "fiber 'Institute of Medicine AI' (nutrition.ts FIBER_PER_KCAL; calc.ts adds '14 g / 1,000 kcal — IOM AI; risk ↓15–30% (Reynolds 2019, Lancet)'); sodium 'AHA/WHO 2300 mg'; sugar '<10% of calories, 4 kcal/g' — all as documented in nutrition.ts",
    liveSurfaces: ["src/lib/nutrition.ts", "src/lib/fitness/calc.ts"],
  },
  {
    id: "hydration-35-ml-per-kg",
    category: "nutrition",
    name: "Hydration goal",
    expression: "water = 35 ml × kg, rounded to 50, clamped 2000–4000 ml",
    citation:
      "in-house 35 ml/kg heuristic, disclosed against 'EFSA 2010 adequate intake — 2.0 L/day (women) / 2.5 L/day (men) total water; the 35 ml/kg app heuristic sits within that AI range' (health.ts maintenance citation, corrected in R68 fix 3-a B5)",
    liveSurfaces: ["src/lib/nutrition.ts", "src/lib/health.ts"],
  },
  {
    id: "issn-protein-consensus",
    category: "nutrition",
    name: "ISSN protein position (field-manual footnote)",
    expression: "1.4-2.0 g of protein per kg bodyweight per day to support training adaptation",
    citation:
      "ISSN 2017 (org+year label per science.ts's R29-b discipline — no study citations in that file); re-ranged in R68 fix 3-a B6 from the misattributed 1.6–2.2",
    liveSurfaces: ["src/lib/science.ts"],
    notes:
      "One of the 18 SCIENCE_ENTRIES consensus positions (org-level labels only): who-aerobic, who-strength, acsm-fitt, issn-protein, nsca-overload, nsca-recovery, rpe-rir, hrv-rmssd, sleep-athletes, ramp-warmup, hydration, polarized, muscle-hypertrophy, zone2, plyo-training, relative-strength, pullup-progress, fivek-pace.",
  },
  {
    id: "foods-local-estimator-policy",
    category: "nutrition",
    name: "Honest local food estimator (FOODS database)",
    expression:
      "the NL parser matches ONLY the real 118-food FOODS database (curated ~25-alias map, every alias verified against a genuine FOODS id); an unknown dish is surfaced as unknown: matched:false + ALL macros null — kcal are NEVER invented locally; weight tokens ('100 g chicken') scale against the matched food's OWN servingLabel grams",
    citation:
      "honest-local-database estimator policy — documented judgment call, see the HONESTY LEDGER in src/lib/food-parse.ts header; FOODS values 'cross-checked against USDA FoodData Central + Indian food tables' and common labels (nutrition.ts headers)",
    liveSurfaces: ["src/lib/food-parse.ts", "src/lib/nutrition.ts"],
  },
  {
    id: "qty-grid-two-decimal",
    category: "nutrition",
    name: "Two-decimal quantity grid",
    expression:
      "parsed/logged quantities live on a 2-decimal grid (0.10–50 per serving); unicode fractions and number words convert exactly (½ → 0.5, one → 1, 'one and a half' → 1.5 pre-normalized); ⅛ rides the grid as 0.13 (+4% label tolerance, disclosed)",
    citation:
      "documented numeric-honesty policy — food-parse.ts HONESTY LEDGER + the R68 nutrition fix round's regression lock (scripts/r68-nutrition-probe.ts, '⅛ roti qty = 0.13 (round2 grid)')",
    liveSurfaces: ["src/lib/food-parse.ts", "scripts/r68-nutrition-probe.ts"],
  },
  {
    id: "atwater-energy-policy",
    category: "nutrition",
    name: "Atwater energy consistency policy",
    expression:
      "kcal ≈ 4×protein + 4×carbs + 9×fat (dietary fibre ~0); documented exceptions: beer/wine keep published kcal (ethanol 7 kcal/g, untracked macro); sugar 387 kcal/100 g and oils 884 (USDA metabolisable-energy factors 3.87 / 8.84 kcal/g vs crude 4-4-9's 399/900)",
    citation:
      "energy policy documented in src/lib/fitness/data/foods.ts header (USDA FoodData Central / IFCT 2017 / manufacturer labels sourcing)",
    liveSurfaces: ["src/lib/fitness/data/foods.ts"],
    notes:
      "The per-serving FOODS DB in nutrition.ts keeps USDA-verbatim produce entries that do not reconstruct 4/4/9 exactly (externally faithful, internally non-reconstructing — R68 audit 2-c B13, accepted by design).",
  },

  // ── RECOVERY ────────────────────────────────────────────────────────────────
  {
    id: "muscle-freshness-curve",
    category: "recovery",
    name: "Muscle freshness curve + volume slowdown",
    expression:
      "score = 100 × (1 − e^(−(h_eff/28.8)^1.25)); h_eff = h / volumeFactor(sets); volumeFactor = min(2, 1 + 0.05 × max(0, sets − 6)); verdicts FRESH ≥ 80 · RECOVERING 40–79 · FATIGUED < 40",
    validityDomain:
      "cleared sessions only; anchors at volumeFactor 1: 0 h → 0%, 24 h ≈ 55, 48 h ≈ 85, 72 h ≈ 96, ~120 h ≈ 99.7; never-trained → 100 (absence of training cannot be fatigue); each set past 6 on the last training day adds +5% slowdown, capped ×2 — a cap, not a permanent penalty",
    citation:
      "in-house curve, documented in full against: Schoenfeld BJ, J Strength Cond Res 2010;24:2857–2872 (MPS elevated ~24–48h) inside a ~48–72h re-train window (Schoenfeld, Ogborn & Krieger, Sports Med 2016;46:1689–1697); volume slowdown after Damas F et al., Eur J Appl Physiol 2016;116:49–56; per-muscle recovery states are the Fitbod app convention as homage, not their algorithm (recovery.ts header + RECOVERY_CITATIONS)",
    liveSurfaces: ["src/lib/recovery.ts"],
  },

  // ── READINESS ───────────────────────────────────────────────────────────────
  {
    id: "readiness-composite",
    category: "readiness",
    name: "Daily readiness composite + HRV modulation",
    expression:
      "score = 70 + integer contributions — sleep (−20…+15 across <5…>9.5 h) · RHR deviation (−15 above +6 bpm; +10 in −6…−3) · mood+energy mean (±8 / −10) · HRV ≤ −20% vs baseline → −10; bands ≥ 85 PRIMED · ≥ 70 READY · ≥ 45 MODERATE · else BACK OFF; HRV modulation thresholds +5% primed / −8% light / −20% cut vs the prior-7-day baseline (≥ 3 of 7 days required)",
    validityDomain:
      "no vitals today → null (never fabricated); RHR/rMSSD baselines are prior-7-day means needing ≥ 3 of 7 days; HRV suppression counts once (readiness AND the coach read the same band — no double count)",
    citation:
      "READINESS_CITATION: 'SOURCE: PLEWS ET AL. 2013 (HRV-GUIDED TRAINING); STANLEY ET AL. 2013.' — the point tables and band edges are app-designed heuristics under that umbrella (audit 2-a noted the exact edges are unverified against a single citable source); the −20%/−8%/+5% thresholds are documented in-code as 'the Plews idiom'",
    liveSurfaces: ["src/lib/health.ts", "src/app/api/readiness/route.ts"],
  },

  // ── CARDIO ──────────────────────────────────────────────────────────────────
  {
    id: "hrmax-derivations",
    category: "cardio",
    name: "HRmax derivations + 5-zone %HRmax ladder",
    expression:
      "sensor hub: HRmax = 220 − age (age clamped 13–90; null birth year → 190 default; persisted MAX HR OVERRIDE wins everywhere); Insights heart model: HRmax = round(208 − 0.7 × age); zones Z1–Z5 at 50–60 / 60–70 / 70–80 / 80–90 / 90–100 % HRmax",
    validityDomain: "below 50% clamps to Z1, above 100% to Z5 (strap glitches stay sane)",
    citation:
      "HRmax = 220 − age — Fox SM, Naughton JP, Haskell WL (1971), 'Physical activity and the prevention of coronary heart disease'; DISCLOSED IN CODE: Tanaka H, Monahan KD, Seals DR (2001) showed HRmax = 208 − 0.7 × age predicts better across ages (the Fox formula ships as the chest-strap convention; the override lets a hunter pin a lab-tested number); 5-zone %HRmax convention — ACSM's Guidelines for Exercise Testing and Prescription + the classic Edwards 5-zone model, Edwards S., The Heart Rate Monitor Book (hr-zones.ts header)",
    liveSurfaces: ["src/lib/sensors/hr-zones.ts", "src/app/api/insights/route.ts"],
    notes:
      "Two HRmax formulas coexist by design (Fox on the sensor surfaces, Tanaka on Insights) — each individually labeled; the R68 audit listed harmonization as an improvement, not a bug.",
  },
  {
    id: "karvonen-hrr-zones",
    category: "cardio",
    name: "Karvonen heart-rate-reserve zones",
    expression: "zone BPM = rhr + (hrMax − rhr) × pct when HRR > 20 bpm; otherwise pure %HRmax (rhr unknown or implausibly close to max); the method label is rendered honestly ('Karvonen (HRR)' vs '%HRmax')",
    citation:
      "Karvonen heart-rate-reserve method — as implemented in the Insights heart model (src/app/api/insights/route.ts heartInsight); audit 2-a verified 'rhr + pct × hrr exact with HRR > 20 guard and honest method label'",
    liveSurfaces: ["src/app/api/insights/route.ts"],
  },
  {
    id: "field-vo2max-tests",
    category: "cardio",
    name: "Field VO₂max estimates (Cooper / Rockport / Uth)",
    expression:
      "Cooper 12-min run: VO₂ = (distanceM − 504.9) / 44.73; Rockport 1-mile walk: 132.853 − 0.0769×lb − 0.3877×age + 6.315×male − 3.2649×min − 0.1565×hr (kg→lb × 2.20462); Uth shortcut (Insights): VO₂ ≈ 15.3 × HRmax / RHR",
    validityDomain:
      "Cooper distance 400–5000 m; Rockport minutes 8–40 and HR 80–200 bpm (null outside); Uth needs a resting-HR reading",
    citation:
      "Cooper KH, JAMA 1968 (12-minute run); Kline GM et al., Med Sci Sports Exerc 1987 (1-mile track walk); Uth–Sørensen–Overgaard–Pedersen estimate (insights route comment) — as documented in tests.ts / the Insights heart model",
    liveSurfaces: ["src/lib/tests.ts", "src/app/api/insights/route.ts"],
  },
  {
    id: "fitness-test-norm-bands",
    category: "cardio",
    name: "Fitness-test norm bands",
    expression:
      "VO₂: ACSM-style percentile bands by decade + sex (e.g. male 20s: poor 32 / fair 38 / good 44 / excellent 48 / superior 54 ml/kg/min); push-ups: ACSM-style reps by decade + sex (male 20s: 20/35/45/54); plank < 30 / 30–60 / 60–120 / ≥ 120 s; sit & reach −5 / 0 / +10 / +20 cm relative to toes",
    validityDomain: "decades clamp to 20–60; percentile ranks approximate (5/20/45/70/90/98)",
    citation:
      "VO2_NORM_SOURCE: 'ACSM approximate norms'; PUSHUP_NORM_SOURCE: 'Commonly cited ACSM-style norms, approximate'; plank/sit-reach: 'General benchmarks — plank norms are not standardized' / 'General bands, approximate' — plus Kodama et al. 2009 JAMA meta-analysis CRF context line (each 1-MET ≈ 10–25% lower all-cause mortality)",
    liveSurfaces: ["src/lib/tests.ts", "src/app/api/insights/route.ts"],
    notes:
      "Since R68 fix 3-a B7, Insights rates VO₂ through the SAME vo2Band function (one norm source, two surfaces).",
  },

  // ── BODY-COMP ───────────────────────────────────────────────────────────────
  {
    id: "navy-tape-body-fat",
    category: "body-comp",
    name: "US Navy tape body-fat",
    expression:
      "male: 495 / (1.0324 − 0.19077 × log10(waist − neck) + 0.15456 × log10(height)) − 450, clamped 3–60%; female: 495 / (1.29579 − 0.35004 × log10(waist + hips − neck) + 0.221 × log10(height)) − 450, clamped 8–60% (cm inputs)",
    validityDomain:
      "male needs waist > neck; female needs hips and waist + hips > neck; missing tape inputs → honest missing list + null (the R68 3-a B1 fix made 'neck' loggable in-app)",
    citation:
      "US Navy tape method — as documented at the insights route § 'Body composition (US Navy tape method)'; the R68 audit 2-a verified the cm constants algebraically reproduce the DoD inch-linear equation (Hodgdon & Beckett 1984) to ±0.2 pp across lean/normal/obese test points",
    liveSurfaces: ["src/app/api/insights/route.ts"],
  },
  {
    id: "bmi-who-bands",
    category: "body-comp",
    name: "BMI + WHO classification",
    expression: "BMI = kg / m² (1-decimal); bands < 18.5 Underweight · 18.5–25 Normal · 25–30 Overweight · 30–35 Obese I · 35–40 Obese II · ≥ 40 Obese III",
    validityDomain:
      "derived ONLY from a latest logged weight AND a real profile height — null height → null BMI (R68 fix 3-a B8; a 175 cm default must never fabricate the user's number)",
    citation:
      "WHO BMI classification bands — as cited in health.ts's Body subscore ('Ashwell et al. 2012 … + WHO BMI bands'); the band ladder itself is nutrition.ts bmiCategory",
    liveSurfaces: ["src/lib/nutrition.ts", "src/app/api/metrics/route.ts", "src/lib/health.ts"],
  },
  {
    id: "whtr-ashwell",
    category: "body-comp",
    name: "Waist-to-height ratio",
    expression: "WHtR = waist / height (3-decimal); < 0.5 KEEP · 0.5–0.6 WATCH · > 0.6 ACT",
    citation:
      "Ashwell et al. 2012 (BMJ Open) — keep your waist under half your height (health.ts maintenance citation + nutrition.ts verdict note 'LOW CARDIOMETABOLICAL RISK (ASHWELL)')",
    liveSurfaces: ["src/lib/nutrition.ts", "src/lib/health.ts"],
  },

  // ── VITALS ──────────────────────────────────────────────────────────────────
  {
    id: "bp-acc-aha-2017",
    category: "vitals",
    name: "Blood-pressure categories",
    expression:
      "Crisis ≥ 180 or ≥ 120 · Stage 2 ≥ 140 or ≥ 90 · Stage 1 130–139 or 80–89 · Elevated 120–129 & < 80 · Normal < 120 & < 80 (one home reading; AHA method caveat attached)",
    citation: "ACC/AHA 2017 BP guideline (Whelton et al., Hypertension 2018)",
    liveSurfaces: ["src/lib/health.ts"],
    notes: "The audit 2-a left the ≥ vs strict > crisis boundary (180/120 exactly) as a one-mmHg unverified class — untouched.",
  },
  {
    id: "temp-mackowiak-1997",
    category: "vitals",
    name: "Oral body-temperature zones",
    expression: "normal band 36.1–37.2 °C (mean 36.8); < 35 low · < 36.1 below band · < 38 feverish · ≥ 38 fever",
    citation: "Mackowiak et al. 1997, JAMA — mean oral temp 36.8°C (not 37.0)",
    liveSurfaces: ["src/lib/health.ts"],
  },
  {
    id: "vitals-standard-ranges",
    category: "vitals",
    name: "SpO₂ + resting-HR conventional ranges",
    expression:
      "SpO₂ ≥ 95 normal · 91–94 watch (retest — consumer oximeters ±2–4%) · ≤ 90 low; resting HR < 40 very low · 40–59 trained (sinus bradycardia acknowledged) · 60–100 normal · > 100 high",
    citation:
      "SPO2_CITATION: 'Standard pulse-oximetry reference ranges; consumer devices ±2–4% accuracy'; HR_CITATION: 'Resting HR 60–100 bpm: conventional clinical range; lower is common in trained hearts' — as documented in health.ts",
    liveSurfaces: ["src/lib/health.ts"],
  },
  {
    id: "health-score-composite",
    category: "vitals",
    name: "Six-part health score",
    expression:
      "weighted mean over available subscores — cardio 0.2 (minutes/150) · strength 0.2 (sessions/2) · sleep 0.2 (7–9 h window, linear falloff /3) · nutrition 0.15 (protein adherence + kcal adherence ±10%) · body 0.1 (WHtR ≤ 0.5 + BMI band) · recovery 0.15 (inverse stress + energy + sleep trend); null subscores are excluded, never guessed; WHO 2020 150 min + 2 sessions are the same positions the science.ts field manual carries",
    citation:
      "WHO 2020 guidelines (cardio/strength); Cappuccio et al. 2010 meta-analysis (Sleep) — 7–8 h optimal, app scores 7–9 h as full; Morton et al. 2018 (Br J Sports Med) — protein plateau ~1.6 g/kg/d, kcal adherence vs Fuel target; Ashwell et al. 2012 + WHO BMI bands (body); recovery: 'Self-reported stress/energy + sleep trend — estimates, not measurements'; the weights themselves are in-house (health.ts)",
    liveSurfaces: ["src/lib/health.ts", "src/lib/science.ts"],
  },

  // ── ENERGY ──────────────────────────────────────────────────────────────────
  {
    id: "met-kcal-ainsworth-acsm",
    category: "energy",
    name: "MET energy expenditure",
    expression: "kcal = MET × 3.5 × kg / 200 × min (e.g. MET 8, 30 min, 80 kg → 336 kcal)",
    citation:
      "ACSM metabolic equation: kcal = MET × 3.5 × kg / 200 × min (METs from Ainsworth 2011 Compendium) — as documented in fitness/calc.ts",
    liveSurfaces: ["src/lib/fitness/calc.ts"],
    notes: "Module orphaned at the R68 audit (2-b liveness map: zero importers) — kept here as the app's documented MET reference while R69-a consolidation is in flight.",
  },
  {
    id: "session-load-and-strain",
    category: "energy",
    name: "Session load (AU) + daily strain (0–21)",
    expression:
      "session load = effort × duration — effort = 10 − RIR averaged reps-weighted over RIR-captured lifting logs; cardio = 5 AU/min; no intensity signal → flat effort 7; mobility excluded; daily strain = 21 × (e^(load/2200) − 1) / (e^(600/2200) − 1), clamped at 21 (strictly convex below the 600 AU saturation)",
    citation:
      "session load after Foster et al., 'Session RPE method for monitoring exercise training', J Strength Cond Res 2001 (effort is an RPE-equivalent on 1–10); the strain curve is in-house — the WHOOP 0–21 strain-scale convention as homage (whoop.com strain explainer), not their algorithm (load.ts header + LOAD_CITATIONS)",
    liveSurfaces: ["src/lib/load.ts"],
  },
  {
    id: "acwr-gabbett-bands",
    category: "energy",
    name: "Acute:chronic workload ratio",
    expression:
      "ACWR = 7-day acute mean ÷ 28-day chronic mean of daily load; < 0.8 UNDERTRAINED · 0.8–1.3 OPTIMAL · 1.3–1.5 ELEVATED · > 1.5 DANGER; rolling-average coupled model, windows shrink to available history (disclosed)",
    validityDomain: "no chronic baseline → null + INSUFFICIENT verdict (never a ratio from absence)",
    citation:
      'Gabbett TJ, "The training–injury prevention paradox", Br J Sports Med 2016;50:273–280',
    liveSurfaces: ["src/lib/load.ts"],
  },
  {
    id: "ctl-atl-tsb-banister",
    category: "energy",
    name: "Fitness / fatigue / form (CTL·ATL·TSB)",
    expression:
      "CTL = 42-day EWMA of daily load (fitness); ATL = 7-day EWMA (fatigue); TSB = CTL − ATL, both iterated through YESTERDAY; verdicts fresh > 5 · neutral ≥ −5 · fatigued ≥ −10 · else watch",
    citation:
      "Banister fitness–fatigue model (1991); Allen & Coggan, 'Training and Racing with a Power Meter' / TrainingPeaks convention (load.ts header + LOAD_CITATIONS)",
    liveSurfaces: ["src/lib/load.ts"],
  },
]

// ─── The manifesto ────────────────────────────────────────────────────────────

export const RESEARCH_MANIFESTO: string =
  "This registry is the app's live formula-and-citation ledger: one row for every formula family PRIME actually runs — strength math, nutrition targets, recovery curves, load models, vitals bands, body composition — each with the validity domain it honestly holds, the file paths where it lives, and the citation exactly as the code's own documentation states it (harvested after the R68 line-by-line science audits, never invented or upgraded). It is not a bibliography of everything in fitness science: if a formula is not running in this app, it is not in this list. The standing rule is the one the audits enforced: a formula without an honest external source ships as a documented judgment call — an in-house composite, a heuristic, an homage — never a dressed-up citation; and a number the profile cannot support ships as null, never a default wearing the user's name."

// ─── The personalized digest (pure — zero new formulas) ───────────────────────
// Every surfaced number traces to an existing pure function in nutrition.ts
// (calcTargets / hydrateGoalMl / bmiFor / bmiCategory). Library defaults that
// calcTargets applies internally to null profile fields are GATED OFF here:
// a value is surfaced only when the inputs it actually depends on are the
// hunter's own (the honest-null doctrine — a default-derived number is never
// presented as the user's).

/** Latest logged tape metrics, as read by the route (latest-wins per type). */
export type ResearchDigestLatestMetrics = {
  weightKg: number | null
  waistCm: number | null
  neckCm: number | null
  hipsCm: number | null
}

export type ResearchDigest = {
  nutrition: {
    bmr: number | null
    tdee: number | null
    targets: {
      calories: number | null
      protein: number | null
      carbs: number | null
      fat: number | null
      waterMl: number | null
    }
    model: "Mifflin-St Jeor"
    inputsUsed: {
      weightKg: number | null
      heightCm: number | null
      age: number | null
      sex: string | null
      activityLevel: string | null
      goal: string | null
    }
    /** Profile fields the surfaced numbers are gated on (honest missing list). */
    missingInputs: string[]
  }
  strength: {
    e1rmDomain: string
    formula: string
  }
  bodyComp: {
    navyInputsPresent: { heightCm: boolean; waist: boolean; neck: boolean; hips: boolean }
    bmi: number | null
    bmiCategory: string | null
  }
  readiness: {
    /** The vitals the readiness model consumes (mirrors READINESS_METRIC_TYPES
     *  in /api/readiness — not exported there, mirrored verbatim). */
    inputsConsidered: string[]
  }
}

const has = (v: number | string | null | undefined): boolean => v !== null && v !== undefined

/**
 * The personalized science powering today's numbers, from the hunter's real
 * profile + latest tape metrics. Pure: same inputs → same digest; the API
 * route is a thin db-read wrapper around this.
 */
export function buildResearchDigest(
  profile: ProfileInput,
  latest: ResearchDigestLatestMetrics
): ResearchDigest {
  // The one calcTargets call the live nutrition route also makes
  // (/api/nutrition: calcTargets(hunterProfile(h))).
  const t = calcTargets(profile)

  const age =
    profile.birthYear != null && Number.isFinite(profile.birthYear)
      ? new Date().getFullYear() - Math.round(profile.birthYear)
      : null

  // Honest gating — each output only surfaces when ITS inputs are real.
  const mifflinReady =
    has(profile.weightKg) && has(profile.heightCm) && has(profile.sex) && profile.birthYear != null
  const tdeeReady = mifflinReady && has(profile.activityLevel)
  const fullChain = tdeeReady && has(profile.goal)

  const missingInputs: string[] = []
  if (!has(profile.weightKg)) missingInputs.push("weightKg")
  if (!has(profile.heightCm)) missingInputs.push("heightCm")
  if (profile.birthYear == null) missingInputs.push("age")
  if (!has(profile.sex)) missingInputs.push("sex")
  if (!has(profile.activityLevel)) missingInputs.push("activityLevel")
  if (!has(profile.goal)) missingInputs.push("goal")

  // BMI mirrors /api/metrics (R68 B8): latest logged weight × REAL profile
  // height; either missing → null.
  const bmi =
    latest.weightKg != null && latest.weightKg > 0 && has(profile.heightCm) && (profile.heightCm as number) > 0
      ? bmiFor(latest.weightKg, profile.heightCm as number)
      : null

  return {
    nutrition: {
      bmr: mifflinReady ? t.bmr : null,
      tdee: tdeeReady ? t.tdee : null,
      targets: {
        calories: fullChain ? t.calories : null,
        protein: fullChain ? t.protein : null,
        carbs: fullChain ? t.carbs : null,
        fat: fullChain ? t.fat : null,
        // waterMl depends on weight alone (hydrateGoalMl's own contract).
        waterMl: has(profile.weightKg) ? hydrateGoalMl(profile.weightKg as number) : null,
      },
      model: "Mifflin-St Jeor",
      inputsUsed: {
        weightKg: profile.weightKg ?? null,
        heightCm: profile.heightCm ?? null,
        age,
        sex: profile.sex ?? null,
        activityLevel: profile.activityLevel ?? null,
        goal: profile.goal ?? null,
      },
      missingInputs,
    },
    strength: {
      e1rmDomain: "1-12 reps, r=1 pinned",
      formula: "Epley 1985 (consensus available in toolkit)",
    },
    bodyComp: {
      navyInputsPresent: {
        heightCm: has(profile.heightCm),
        waist: latest.waistCm != null,
        neck: latest.neckCm != null,
        hips: latest.hipsCm != null,
      },
      bmi,
      bmiCategory: bmi !== null ? bmiCategory(bmi) : null,
    },
    readiness: {
      inputsConsidered: ["sleep", "restingHr", "mood", "energy", "hrv"],
    },
  }
}
