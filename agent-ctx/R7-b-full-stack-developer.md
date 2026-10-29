# R7-b — Program Integrity round: session raid + program panel display fixes

Task ID: R7-b
Agent: full-stack-developer
Files owned (ONLY these touched): src/components/fitness/session-raid.tsx · src/components/fitness/program-panel.tsx · src/components/fitness/exercise-dialog.tsx

## Context understood before writing
- Read worklog.md R5/R6 sections (R5-a offline queue, R5-b records drill, R6 evidence round) + the R1-c lineage of the program plan flow (session-raid plan checklist, program-panel day cards, exercise-dialog log sheet).
- Read all three owned files end-to-end plus: src/lib/exercises.ts (PlanBlock has `durationMin?` but NO pattern/unit yet — R7-a adds them in parallel), src/app/api/program/route.ts (legacy forge: cardio blocks = sets + durationMin, no reps; mobility blocks = reps-as-hold-seconds), src/lib/gates.ts (ExerciseTemplate shape), src/lib/progression.ts (progressionKey).
- DB read-only audit: active program STORM LATTICE day 1 = [Child's pose mob 1×40, Pike push-ups 3×7, Walking cardio 1×13MIN (no reps!), Plank hold 4×10, Lunges 3×8, Hip mobility mob 1×34] — the exact legacy shape everything below must keep rendering identically.

## Root causes found
1. "Walking — 1 SETS": session-raid's LOCAL PlanBlock type + extractPlanDays parser DROPPED durationMin (program-panel's imported type had it, session-raid's local one didn't) → reps==null → `${sets} SETS`.
2. Log sheet defaulted 10 MIN because blockTemplate hardcoded `defaultMinutes: timeType && !b.reps ? 10 : 0`.
3. Progress denominator counted ALL blocks (warm-up/cooldown have no log button) → "0/6 BLOCKS" unreachable.
4. Isometric holds prescribed bare reps (no unit concept existed pre-R7-a).

## Changes (all additive, legacy-first)
### session-raid.tsx
- Local PlanBlock gains `durationMin?` / `pattern?` / `unit?: "reps"|"sec"`; extractPlanDays now parses all three defensively (string/number guards, unit validated to "sec"|"reps" else undefined).
- Module-level PATTERN_META (12 families → label + tinted 1px-border chip classes inside violet/fuchsia/teal/amber palette) + PatternChip component (unknown pattern → null).
- Module-level isWarmupRow/isCooldownRow — THE shared predicates: renderBlockRow and the new loggable count both use them so the denominator can never drift from the renderer.
- Module-level blockPrescription(b): durationMin>0 → `${sets}×${dm} MIN` / `${dm} MIN` (sets===1); unit "sec" → `${sets}×${reps}S`; legacy → `${sets}×${reps}` + ` @ X KG` (weightKg truthy, fmtKg); fallback `${sets} SETS`. Log button face AND its aria-label share the string.
- Warm-up/cooldown rows: reps span now renders `1×40S HOLD · REST 30S` for hold rows (unit "sec" OR mobility type — legacy mobility reps were always hold seconds per the old forge's prescribe()), bare `1×10` + `REST 45S` for cued non-hold warm-ups; single compact span, layout untouched.
- Progress: loggableBlocks = blocks minus warmup/cooldown rows (shared predicates); label `X/Y WORK BLOCKS`; aria `Program day N — X of Y work blocks remaining`; aria-valuemax=loggable; width = done/loggable guarded ÷0; doneCount matches progressionKey within loggable ONLY (custom "Child's pose" log can't tick the warm-up row).
- blockTemplate: `defaultMinutes: timeType && !b.reps ? (b.durationMin ?? 10) : 0` (Walking sheet now opens at 13 MIN); returns SheetTemplate = ExerciseTemplate & { repsAreSeconds?: boolean }, spread-in `repsAreSeconds: true` for `unit==="sec" && !timeType` (cardio/mobility minutes handling untouched). addExercise param widened to SheetTemplate|null.
- PatternChip inserted in the log-button row between exercise name (still truncating) and RPE chip.

### program-panel.tsx
- PlanBlockView = PlanBlock & { pattern?; unit? } (structural intersection — compiles with OR without R7-a's canonical fields).
- BlockRow prescription: cardio minutes with sets===1 → `13 MIN` (was `1×13 MIN`), unit sec → `3×40S`, legacy mobility keeps `1×40S HOLD`, legacy reps/weight/rest/RPE parts array idiom unchanged.
- PatternChip after the block name, before the ml-auto type tag (name keeps truncate, chip shrink-0).
- blockPhase(blocks, i) helper extracted (identical to the old inline ternary incl. single-mobility-block → warmup precedence) — shared by BlockRow rendering and dayPatternLine.
- DayCard gains ONE summary line under the header when work blocks carry patterns: `PATTERNS · PUSH·H PUSH·V CORE` — zinc-600, text-[9px], mono, tracking-[0.15em], single truncate line, first-seen dedupe, warmup/cooldown excluded, unknown patterns skipped, legacy plans → no line. RETIRE/START DAY logic and all API calls untouched.

### exercise-dialog.tsx
- SheetTemplate = ExerciseTemplate & { repsAreSeconds?: boolean } (local — gates.ts NOT touched, every other template producer unaffected).
- `repsAreSeconds = (template as SheetTemplate | null)?.repsAreSeconds === true` → REPS / SET NumRow label renders `SECS / SET`. Same input, same XP math, cardio/mobility MINUTES row + ESTIMATED XP untouched.

## Verification
- bunx tsc --noEmit: 0 errors in my 3 files (checked twice). During the run R7-a's in-flight src/lib/exercises.ts edit produced transient TS2353/500s (pattern on Exercise before the interface update) — THEIR file, settled to 0 errors after; my files stayed clean throughout.
- bunx eslint on the 3 files → exit 0.
- Throwaway mirror harness (40/40 PASS, outside repo, deleted): every prescription branch (incl. durationMin:0 guard, durationMin-vs-stray-reps precedence), warmup/cooldown meta strings, STORM LATTICE day-1 predicates (loggable=4, membership exact, Child's pose log → 0 ticks, 4/4 reachable, width 25% at 1/4), pattern-line dedupe/legacy-null/unknown-null, blockTemplate defaults for all 7 block shapes.
- Browser E2E BLOCKED: dev server (port 3000) exited mid-round during R7-a's concurrent exercises.ts Fast-Refresh crash cycle — connection refused, nothing listening, not restarted by the environment within polling window; per instructions ("do NOT restart it" / system "Do NOT run bun run dev") I did not restart it. Dev.log DOES show two `GET / 200` (2.1s compile + 189ms) served AFTER my edits + R7-a's settled file, with all API routes 200 — the app compiled and rendered with my changes before the process exited. Deep E2E is the orchestrator's job per the task brief.
- DB untouched (read-only sqlite queries only). No other files modified. No git commit.

## Backward-compat notes for the orchestrator
- The live legacy plan STORM LATTICE (no pattern/unit) renders: Walking → "13 MIN" (was "1 SETS" — the intended FIX), plank "4×10" unchanged, warm-up "1×40S HOLD · REST 30S" (was ambiguous "1×40 30S"), plan header "0/4 WORK BLOCKS" (was "0/6 BLOCKS"), sheet opens Walking at 13 MIN. Cardio-interval blocks (sets>1) render "3×4 MIN" in both components.
- New plans (R7-a forge) additionally render pattern chips + PATTERNS day line + "3×40S" holds + SECS/SET sheet — all guarded, unknown/missing fields degrade to legacy rendering.
- program-panel's PlanBlockView intersection stays valid whether or not R7-a adds pattern/unit to the canonical PlanBlock (identical optional fields intersect cleanly).
