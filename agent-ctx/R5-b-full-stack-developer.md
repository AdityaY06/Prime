# R5-b — Records-tab deepening: Oracle attack plan + chronicle day drill-through

Task: Task 23/R5 — two RECORDS-tab deepening features: (A) a "DEVISE ATTACK PLAN" action inside the PR dossier dialog backed by a new deterministic Oracle API, and (B) expandable day rows in the chronicle DAY-BY-DAY view revealing that day's cleared sessions.

## Files (strict 5-file ownership, respected)

1. **src/app/api/oracle/attack-plan/route.ts** (NEW)
   - `GET /api/oracle/attack-plan?name=<pb.name>&type=<type>` — `force-dynamic`, `requireHunter()` + NOT_AWAKENED 404 pattern, missing/unknown lift → 404 `{error:"UNKNOWN_LIFT"}`; the PB row is the source of truth for `type` (a stale client `type` param never 404s a living lift)
   - Mirrors the /api/progression pipeline for ONE lift: ExerciseLog rows joined through cleared WorkoutSessions in a ~10-week (70d) window, grouped by `progressionKey(l.name)`, per-session top set (best e1RM, ties → latest log), chronological trend — maximum reuse: `epleyE1rm`, `progressionKey`, `suggest`, `parseBumpKg` + `ProgressionInput` all imported from `@/lib/progression` (zero duplicated e1RM logic), `mapExerciseToMuscles` + the same LOWER_MUSCLES set for the +2.5/+5 kg heuristic
   - Pure deterministic plan (no LLM, no writes): verdict = engine suggestion; target/topSet/scheme/notes per type — strength: best weight + bump kg (BUMP LOAD) / same weight × bestReps+1 (ADD REPS) / repeat record (HOLD/LOG MORE), working top set snapped to the 2.5 kg grid at ~93%; bodyweight: best top-set reps + 2, sets × target reps; cardio: best duration × 1.1; mobility: best duration × 1.15; 3-5 type-aware scheme steps (ramp → top set → back-off → log); 2-4 notes (computed spacing note from last raid, rest times, focus cue)
   - `stallRisk`: true when none of the last 3 sessions beat the running best before them (primary metric = e1RM for strength, reps for bodyweight, durationMin for cardio/mobility — dossier convention); with exactly 3 sessions the first is the baseline. True → API prepends a "-10% deload first" note
   - Response = flat `AttackPlanDTO`; standard try/catch (console.error + 500 INTERNAL)

2. **src/lib/types.ts** (MODIFY — additive only)
   - `ChronicleDaySession` (id/gateName/xpEarned/volumeKg/durationMin/prCount/startedAt ISO)
   - `ChronicleDTO.sessionsByDay?: Record<string, ChronicleDaySession[]>` (optional — old payloads parse)
   - `AttackPlanDTO` (name/displayName/type/unit/best{value,day}/verdict/targetLine/topSet/scheme[]/stallRisk/notes[]/sessionsAnalyzed) — `Suggestion` type-imported from ./progression (no runtime cycle)

3. **src/app/api/chronicle/route.ts** (MODIFY — additive only)
   - session `select` gains `id: true`; every existing response field byte-identical (curl-verified)
   - `sessionsByDay`: ALL cleared sessions of the 14-day window grouped by the route's existing `dayKey(s.startedAt)` convention, per-day sorted by startedAt ISO, volumeKg rounded

4. **src/components/fitness/chronicle-panel.tsx** (MODIFY)
   - DayRow → wrapper `motion.li` (original stagger entrance kept) containing a `motion.button` row (min-h-11, w-full, `aria-expanded` + `aria-controls=chronicle-day-{day}`, rich aria-label with "— show/hide cleared sessions" suffix, `focus-visible:outline-violet-400/70`, `{...tapMotion}`) + `AnimatePresence` expansion below it
   - Expansion: `motion.div` height 0→auto + opacity on FLOW_EASE 0.28s, exit reversed, `useReducedMotion` → duration 0; `Plus` indicator rotating 90° into a close cross (violet when expanded)
   - Session rows (new `SessionRow`): gate-name chip + `+XP` + `KG` + `MIN` + amber `N PR` + start-time, min-h-11, staggered x-slide entrance (index*0.05 delay); zero-session day → single "NO RAIDS — REST" zinc line
   - Accordion: one `expandedDay` state in DayByDaySection (clicking another day collapses the previous — verified live); weekday compare strip, grid header, all other content untouched

5. **src/components/fitness/pr-drilldown.tsx** (MODIFY — purely additive section; chart/table/verdict byte-identical)
   - "DEVISE ATTACK PLAN" `motion.button` at the dialog bottom (Sparkles icon, sys-label styling: border-violet-400/50 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20, min-h-11, focus-visible:outline-violet-400/70, tapMotion whileTap) → "RE-DEVISE" after first load; state resets per dossier opening (`[record?.id, open]` effect)
   - Loading: violet panel + skel-bar shimmer lines + "DIVINING…" (aria-live polite, aria-busy); error: rose line + 44px RETRY DIVINATION button
   - Plan section (new `AttackPlanSection`): "ORACLE ATTACK PLAN" sys-label + amber "STALL RISK — DELOAD" chip (spring pop) when stallRisk; verdict context line; TARGET big tabular-nums numeral with `useCountUp` (numeral extracted from targetLine's leading number, integer vs 1-decimal aware); TOP SET line (fuchsia); numbered SCHEME steps (self-animated stagger — dialog is not in a FlowGroup, so each row initial/animate with 0.12+i*0.08 delay on FLOW_EASE, reduced-motion safe); NOTES with "»" violet prefix; footer "N SESSIONS ANALYZED · RECORD … · date"
   - Plan auto-scrolls into the dialog's scroll view when devised (`scrollIntoView` block:"nearest", reduced-motion → "auto")
   - Uses the existing `api()` helper from "@/hooks/use-api" as-is (untouched — concurrent R5-a ownership)

## Verification

- `bunx tsc --noEmit` → **0 errors in my 5 files** (remaining src/ errors are the concurrent R5-a agent's in-flight use-api.ts `loading: boolean | null` change rippling through exercise-dialog/divination-dialog/settings-dialog — their files, untouched by me; plus pre-existing examples/+skills/)
- `bunx eslint <5 files>` → **exit 0**, zero errors/warnings
- Pure-logic branch harness (throwaway `bun -e`): suggest() BUMP LOAD detail → parseBumpKg 2.5 (upper) / 5 (lower via squat primary muscles); stall algorithm on 8 synthetic cases — flat-5 true, late-improve false, early-improve-len5 true, exactly-3-tied true, exactly-3-improved false, len<3 false — all as designed
- Live curl (dev server): chronicle old shape intact (thisWeek/prevWeek/daily/bestDay/activeDays/perGate/perDay/prevDaily identical) + `sessionsByDay` {09-26: 7 sessions, 09-27: 1, 09-29: 1} with per-day time-sorted rows; attack-plan 200 on all 4 real PBs (bench LOG MORE "40 KG × 10"/"4 × 10 @ 40 KG", push-ups HOLD "27 REPS"/"3 × 27" stallRisk false — the 25-rep PR sits inside the last-3 window, run cardio "24 MIN", bulgarian "12 REPS"); `?name=deadlift` and no-name → 404 UNKNOWN_LIFT; stale `&type=bodyweight` on bench → still resolves (PB is truth)
- agent-browser E2E (session r5b, desktop + 390×844): PROGRESS → bench dossier → DEVISE ATTACK PLAN → plan renders (target numeral counts up to 40, scheme 01-04, notes ×3, "2 SESSIONS ANALYZED · RECORD 40KG · SEP 27") → button becomes RE-DEVISE → re-click re-fetches (2× GET 200 in network log); push-ups dossier → "27 REPS" + "5 SESSIONS ANALYZED · RECORD 1000REPS"; chronicle DAY-BY-DAY → all 7 day rows are 44px aria-expanded buttons → SAT 26 expands (7 session listitems with full aria-labels) → SUN 27 click collapses SAT + expands SUN (accordion verified via aria-expanded + DOM panel count) → FRI 25 → "NO RAIDS — REST" → re-click collapses (0 panels); zero console errors; 390px sweep scrollWidth === clientWidth === 390 on records tab, with day expansion, and with dossier+plan open (dialog scrolls internally: 997/591)
- VLM audits: bench attack plan (scrolled view) — "no clipping/overlapping, colors coherent, TARGET 40 KG × 10 + TOP SET + SCHEME 01-04 + NOTES » all present, no defects"; chronicle expansion reconstructed faithfully by the model (chips, session rows, +/× indicators all legible)
- dev.log: clean after final edits (all 200s); two transient push-ups 500s mid-edit were Turbopack recompile-in-flight — self-healed on next compile, endpoint 200 since
- DB read-only audit: 4 PBs / 9 cleared sessions / 11 logs / 0 sessions or XP events today — zero writes from me

## Deviations from spec (all deliberate, minimal)

- **`type` query param is advisory**: the route reads the PB row's own type instead of validating the param — a stale client-side record.type can never 404 a lift that exists (spec didn't define the mismatch behavior; PB-as-truth is the honest reading).
- **Stall primary metric for cardio/mobility = durationMin** (spec said "reps otherwise"): cardio logs carry reps=0, so a reps-based stall check would permanently flag every cardio lift; the PB's own record metric (duration) is the honest signal.
- **Bodyweight target uses best top-set reps** (from the session trend, fallback PB context) rather than PB.total-reps: the dossier's primary metric is top-set reps, so the plan stays consistent with the dialog it lives in; `best.value` still echoes the official PB number honestly.
- **Exactly-3-session stall edge**: first session acts as the baseline (3 tied sessions → stall), generalizing the "running best before the window" rule to the smallest judgeable case.
- **Plan auto-scroll into view** (`scrollIntoView` nearest) — the plan renders below a potentially tall session table; keeps the devised result immediately visible without any layout change.
- Attack plan button placed at the dialog bottom (after table + hints) rather than directly after the verdict chip — spec allowed "near the bottom", and the plan section then lands "below the session table" exactly as specified.
