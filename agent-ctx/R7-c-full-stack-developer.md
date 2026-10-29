# R7-c — full-stack-developer · Program Integrity (honesty audit)

Task: Fix the lying calibration copy (engine.ts calibrateDailies), add gate-card
evidence lines (gates-tab.tsx), and fact-audit the Oracle tip route; sync the
CALIBRATED chip tooltip. Files owned this round: `src/lib/engine.ts`
(calibrateDailies only), `src/components/fitness/gates-tab.tsx`,
`src/app/api/oracle/tip/route.ts`, `src/components/fitness/directives-tab.tsx`.

## What was wrong (audit findings confirmed)

1. **Calibration copy lied about its math.** The description hardcoded the SPEC
   ratio (`pct = Math.round(spec.ratio * 100)`) while the target was clamped:
   a 30-rep squat PR → target = clamp(0.6×30 → min 30) = 30, and the copy still
   said "60% of your 30-rep record" (30 is 100% of 30).
2. **Gate cards carried no evidence** (R6 established the teal »-science idiom
   everywhere else; the TRAINING/GATES view was bare).
3. **Oracle tip strings**: several claims overstated what the queries compute
   (see the change list below).

## Changes

### src/lib/engine.ts — ONLY calibrateDailies region touched
- NEW exported PURE `calibrationDescription(code, target, base, recordLabel, fallback)`
  + module-level `CALIBRATION_COPY` table (verb/noun/floorUnit per code —
  parameterized, no four-way fork). calibrateDailies now calls it.
- Honesty contract:
  - `base == null` (or ≤0) → template `fallback` untouched.
  - clamp neutral → pct = `Math.round((target / base) * 100)` — the ACTUAL
    ratio (e.g. base 51 squats → target 31 → "61% of your 51-rep record", the
    old copy would have lied "60%").
  - floor raised (target > round(base×ratio)) → "…your 60% target (18) was
    raised to the 20-rep floor."
  - cap cut (target < round(base×ratio)) → "…your 60% target (600) was capped
    at 250 to stay sane."
  - avg-volume keeps "calibrated to your X kg session average" (already honest)
    and gains the same raised/capped honesty when clamped.
- NOT changed: target computation, CALIBRATED_DAILIES specs, quest-roll flow,
  everything else in engine.ts (git-diff audited).
- bun -e test 4/4 PASS (pushups, ratio .6, min 20, max 250):
  - base=100 → `Perform 60 total push-ups — 60% of your 100-rep record.`
  - base=30 → `Perform 20 total push-ups — your 60% target (18) was raised to the 20-rep floor.`
  - base=1000 → `Perform 250 total push-ups — your 60% target (600) was capped at 250 to stay sane.`
  - base=null → fallback untouched.
  - Plus branch sanity: cardio floor/cap, volume clean/floor/cap, squats 61%
    odd-ratio case, unknown-code + base-0 guards → all honest.

### src/components/fitness/gates-tab.tsx — evidence lines
- NEW `GATE_EVIDENCE` map + ONE additive `<p>` per gate card (after `gate.desc`),
  R6 idiom: `sys-label text-[9px] text-zinc-400` statement, `»` prefix in
  `text-teal-400/80`, citation in `text-zinc-600`, static/reduced-motion-safe:
  - gale-fields (Cardio) → "»150-300 MIN/WK MODERATE ACTIVITY (WHO 2020)"
  - iron-forge (Strength) → "»2×/WK PER MUSCLE OUTPACES 1× (SCHOENFELD 2016)"
  - titan-trial (Calisthenics) → "»10+ HARD SETS/WK PER MUSCLE = THE GROWTH ZONE (SCHOENFELD 2017)"
  - flow-sanctum (Mobility) → "»RANGE OF MOTION RESPONDS TO FREQUENT, EASY PRACTICE" (uncited principle — R6 policy: no mobility consensus in the pool)
  - colossus-gate (Full Body) → "»2-3 FULL-BODY SESSIONS/WK COVER EVERY MAJOR MUSCLE (ACSM)"
- Copy-vs-gates.ts audit: every card claim renders from data (exercise counts,
  ×multipliers, ranks, epithets/descs); "5 TRAINING TYPES" = GATES.length;
  rift banner ×bonusMult matches riftEffectiveMult; "+10 CREDITS" =
  RIFT_ESSENCE_BONUS; "MAX MASTERY — MASTER" matches mastery.ts tier-5 label.
  **No copy/data mismatch found — no fixes needed.**

### src/app/api/oracle/tip/route.ts — copy only, logic/queries untouched
Strings changed (5):
1. `FUEL ON TARGET · …` → `FUEL ON TARGET (ORACLE RULES) · …` — the oracle's
   1.8 g/kg + flat 3 L heuristics are NOT the goal-aware targets the FUEL panel
   computes (cut=2.2 / bulk=1.6 g/kg; water = 35 ml/kg clamped 2000-4000).
2. `PROTEIN AT X/Y G — N G SHORT …` → `PROTEIN AT X/Y G (1.8 G/KG) — …` —
   states the basis instead of masquerading as the panel target.
3. `WATER AT X/3000 ML — HYDRATION LAGGING · +250 ML SOON` → `… — THE
   ORACLE'S 3 L RULE · +250 ML SOON` — attributes the flat rule to the oracle.
4. bodyTip pace `· ON PACE` / `· LAGGING` → `· TRENDING TOWARD TARGET` /
   `· TRENDING AWAY` — there is no deadline to be "on pace" against; the query
   computes a 7-point window direction. (var renamed pace→trend, onPace→toward)
5. recordsTip `E1RM TRENDING +X%` → `E1RM +X% SINCE FIRST LOG` — the pct is the
   latest-vs-first logged-entry delta (≥2 entries), a change, not a trend.
All remaining strings audited and left byte-identical (computed-from-data or
R6-b-vetted consensus evidence; no GUARANTEED/PROVEN overpromises; "THE ORACLE
WILL TRACK THE MARCH" is true app behavior).

### src/components/fitness/directives-tab.tsx — chip tooltip sync
- CALIBRATED tooltip: "Target scaled from your personal record at roll time" →
  "…at roll time — floors and caps keep it humane" (syncs with descriptions
  that now name floors/caps).

## Verification
- `bunx tsc --noEmit` → 0 src/ errors (only 4 pre-existing examples/skills).
- `bunx eslint` on all 4 touched files → exit 0.
- bun -e calibration test → 4/4 PASS (output above) + 8 extra branch checks.
- Live curls of /api/oracle/tip for all 7 tabs → new records copy live
  ("BENCH PRESS E1RM +5% SINCE FIRST LOG"), all tabs healthy.
- agent-browser E2E (read-only): fresh isolated browser session with a
  CLIENT-SIDE network mock (`/api/sessions` → {active:null}) so the gates card
  grid renders while a sibling agent's live titan-trial session stays
  untouched; all 5 evidence lines verified inside their own gate cards
  (DOM-parentage check), scrollWidth exactly 390 at 390×844, zero page errors
  (one transient Fast-Refresh reload came from a sibling's exercises.ts edit,
  not my files). Mocks unrouted + both browser sessions closed afterwards.
- dev.log: all 200s, no errors from touched files. DB untouched (no
  REROLL/REVIVE/claim/session clicks; the sessions API was mocked in-browser).
- Init script NOT re-run: environment already initialized (existing
  package.json + live dev server); inspected the script instead of executing —
  it would either no-op or restart the dev server (prohibited this round).

## Notes for downstream agents
- `calibrationDescription` is exported + pure — use it in any future test/UI
  that needs to preview calibrated quest copy.
- New quest descriptions take effect at the NEXT daily roll (midnight / reroll
  / new hunter) — today's already-rolled quests keep their stored strings.
