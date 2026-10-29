# R33-a — full-stack-developer — THE GUIDED FIRST RUN

Task: turn the one-tap AwakeningScreen into a skippable 3-step calibration flow so a brand-new user's first 60 seconds end with a personalized system instead of a wall of zeros.

(A full copy of this record is appended to /home/z/my-project/worklog.md under "Task ID: R33-a".)

## Files changed (owned, complete list)
- `src/components/fitness/guided-steps.tsx` — NEW, 488 lines
- `src/components/fitness/awakening-screen.tsx` — REWRITTEN, 138 → 427 lines

Nothing else touched. No new deps, no new API routes, no schema changes. NEVER touched: engine.ts, api/hunter/**, api/body/**, api/nutrition/**, schema.prisma, page.tsx, the 5 parallel-owned tabs, src/components/system/** (read-only reuse). No suppressHydrationWarning removed (none existed in my files).

## What shipped
- **Step machine**: IDENTITY → BODY BASELINE → DIRECTIVE → AWAKEN commit, inside the same AwakeningScreen (renders on GET /api/hunter 404). Thin violet progress rail + 01 IDENTITY / 02 BODY / 03 DIRECTIVE labels; panel accent `STEP n/3` → `QUEUED` when offline-parked. Directional AnimatePresence crossfade (custom dir variants, FLOW_EASE, reduced-motion → duration 0).
- **Step 2 (skippable)**: weight/height/birth-year CalibStepper rows (house NumRow −/+ idiom, h-11 targets, placeholders = library defaults) + MALE/FEMALE toggle chips. Bounds byte-mirror set-profile (25–300 / 100–250 / 1920–currentYear integer) — reject-don't-clamp: live in-card rose `▚ REJECT` line with the server's verbatim message; CONTINUE disabled while invalid; explicit full-width **SKIP — DEFAULTS APPLY** (clears the draft; defaults stated in a zinc footnote).
- **Step 3 (skippable)**: goal cards CUT/MAINTAIN/BULK (the exact GOALS enum set-profile accepts, kcalAdj shown, tap-again to clear) + STRENGTH/ENDURANCE/MOBILITY primary-focus chips marked **OPTIONAL · LOCAL-ONLY** → persisted to localStorage `prime-onboarding-goal` (guarded read/write, corrupt reads as absent) for the ASCENT advisor to read later — NO new API fields. **ON AWAKEN readout** computes the real macro targets via calcTargets (null-fill = the server's own default path) with an honest "* LIBRARY DEFAULTS" footnote.
- **Commit**: client fences → writeOnboardingGoal → POST /api/hunter (idempotent, sets device cookie) → ONE POST /api/nutrition `{action:"set-profile", ...filledFields}` (round1 parity, absent keys = keep-as-is) → title/info notice + speak + bumpRefresh (app mounts). Server errors = in-card rose lines; partial failure message names the idempotent retry. **Offline**: both POSTs park in the queue FIFO (awaken first → cookie lands before the calibration leg replays; a mid-flicker non-offline failure is manually enqueued), amber warn notice, button locks to "Queued — auto-sync", NO bumpRefresh while down — the layout-level OfflineIndicator's flush handles refresh on reconnect.

## Verification numbers
- Scratch unit tests (bun, temp dir outside src/, deleted): **60/60 passed** — bounds at every edge, name gates, payload shape + POST body, preview parity, localStorage contract, enum sets, skip defaults.
- `bunx eslint` on owned files ×2 (after code, after all QA): **exit 0** both.
- Browser QA (isolated session, viewport 390×844 set after open): full flow / skip flow / offline flow all E2E — profile landing proven via GET /api/nutrition ({181/82/1996/male/cut, isDefault:false}; skip = all-null isDefault:true; offline replay = {178/75/1990} after queue flush, queue empty). localStorage `prime-onboarding-goal="strength"` verified. scrollWidth=390 on 4+ checks; `agent-browser errors` EMPTY. 9 screenshots `screenshots/r33a-*.png`. VLM audit ×2: PASS, PASS (notes: pre-existing PWA install banner overlaps the readout footnote at the viewport bottom; minor cosmetic gap before the selected-goal checkmark).
- DB purity (throwaway-hunter technique): baseline 12 sessions / 11 logs / 31 metrics / 15 xp / 1 nutrition / 4 water, hunters=2 (KAEL + the PARALLEL R33-b agent's in-flight R33BQATEST — left untouched, theirs to clean). Cleanup deleteMany IN [R33AQATEST, R33AQASKIP, R33AQAOFFL] → survivors [KAEL, R33BQATEST], kaelOwned **exactly 12/11/31/15/1/4**, orphansAfterCascade **0** on all six tables, KAEL byte-identical (L11 · xp118 · totalXp2943 · 182cm · 77.5kg · kael-dev-token). Stale-cookie self-heal verified; session closed.

## Deviations / notes for the next agent
- Transient 12-line 500 burst in dev.log L311–322 during my QA window (all GETs; oracle/briefing, oracle/tip, nutrition, sessions, metrics, monthly-summary, rest-day, quests), bracketed by recompiles and self-recovered — attributed to the parallel round's mid-compile source/db change (I wrote no files in that window; my files are client-only; all my POSTs 200). 404s on /api/hunter from cookie-less requests are the identity gate, not errors.
- agent-browser coverage guard rejects clicks under the Next dev-tools portal / install banner — scrollintoview + retry or dismiss the banner; never eval-click.
- ExerciseLog has no hunterId (joins via sessionId) — per-owner purity counts need the relation filter.
- The `prime-onboarding-goal` localStorage contract: values "strength" | "endurance" | "mobility"; readers should treat corrupt/absent as no-preference.
