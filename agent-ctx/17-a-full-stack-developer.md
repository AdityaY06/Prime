# Task 17-a — Program→raid integration (START DAY button + session plan checklist)

Agent: full-stack-developer
Files owned: src/app/api/sessions/route.ts (EDIT), src/components/fitness/program-panel.tsx (EDIT), src/components/fitness/session-raid.tsx (EDIT)
One out-of-scope but REQUIRED infra fix: src/lib/db.ts (stale Prisma client after orchestrator's db push — see Deviation 1)

## What was built

1. **src/app/api/sessions/route.ts** — POST now accepts optional `programDay` (int 1–6):
   - absent/null → stored as null (free session, byte-identical behavior)
   - present but not an integer 1–6 (string, 0, 9, float…) → 400 `"Invalid program day."`
   - valid → persisted on the created WorkoutSession (`programDay` column, orchestrator-provided)
   - gate check → programDay validation → active-session 409 check → create. Everything else untouched.

2. **src/components/fitness/program-panel.tsx** — START DAY flow:
   - `gateForDay(blocks)` helper: counts block types → mobility-only → `flow-sanctum`; ≥3 distinct types → `colossus-gate`; top-two tie → `colossus-gate`; strength top → `iron-forge`; bodyweight majority → `titan-trial`; cardio majority → `gale-fields`; fallback `colossus-gate`
   - DayCard gains `onStart`/`startingDay`/`disabled` props + a card-footer button `ENTER GATE · START DAY N` (h-11, violet border/glow, Zap + ArrowRight icons, `ENTERING GATE…` busy state, disabled while posting or while panel busy)
   - ProgramPanel `startDay(d)`: POST `/api/sessions {gateId: gateForDay(...), programDay: d.day}` → success notice `DAY N RAID INITIATED — follow the plan checklist…` + `bumpRefresh()` (GatesTab's `useApi("/api/sessions")` refetches on the global refresh key and swaps the panel out for SessionRaid — verified in use-api.ts); error → warn notice "Entry refused" carrying the server message verbatim (covers the 409 already-active case). REGENERATE/RETIRE untouched.

3. **src/components/fitness/session-raid.tsx** — PROGRAM PLAN checklist:
   - `useApi<ProgramRes>("/api/program")` fetched ONLY when `session.programDay !== null` (path is null for free sessions → zero requests, zero render change)
   - `planDay = plan.days.find(d => d.day === session.programDay)`; program retired mid-session / day missing → section simply doesn't render
   - Section ABOVE "Quick deploy": `PROGRAM PLAN · DAY N — {FOCUS}` header + `{done}/{total} BLOCKS` counter + thin violet gradient progress bar; amber WARM-UP / teal COOLDOWN compact strips (joined with ·)
   - `PlanRow` block buttons (min-h-11, two-line BlockRow idiom): index, name, `sets × reps` (as-is), EQUIP_SHORT tag, `NS REST` chip; logged blocks (normalizeName match against session logs — mirrors muscles.ts export) get emerald Check + `border-emerald-500/25 bg-emerald-500/[0.04] opacity-60`; pending rows show a dim Plus affordance
   - `parseRx(reps)` handles all three generator formats: `"8-12"` → reps, `"45-60s"` → seconds, `"8-10 min"` → minutes
   - `blockToTemplate(b)` → ExerciseTemplate `{id:"program-"+exerciseId, name, type, unit: time iff cardio|mobility|seconds-reps, defaultSets, defaultReps: range bottom (rep-counted cardio finishers keep reps), defaultWeight: 0, defaultMinutes: min-suffix bottom | max(1, round(sec/60))}` → existing `addExercise(t)` → dialog prefilled
   - All existing sections (quick deploy, logs, XP preview, finish/abandon) intact; add-log/remove-log re-renders flip ✓ states live

## Deviations (read before building on this)

1. **src/lib/db.ts was edited (outside owned files) — REQUIRED for the feature to run at all.** The orchestrator pushed the `programDay` column while the dev server was running; Turbopack kept serving the stale cached `@prisma/client` bundle (create() rejected `programDay`: "Unknown argument"), so every runtime write/read of the column 500'd. Fix: import the generated client by direct file path `../../node_modules/.prisma/client/index.js` (fresh module specifier → re-read from disk on rebuild; the `@prisma/client` stub is cached for the server process lifetime) + bump the versioned singleton key `prisma_v7` → `prisma_v9`. NOTE the key bump alone is NOT enough if an intermediate evaluation already cached a stale instance under the new key. A dev-server restart also loads fresh — either path works now.
2. Dev server was OOM-killed twice mid-task (dmesg: `Killed process … next-server`, 3.9GB box shared with a parallel agent's chrome). Restarted once via `setsid nohup bun run dev >> dev.log` on :3000 (same documented recovery as Task 16-a; no build, port unchanged). Port flapped briefly during next-server respawns — curl/browser actions need retries during those windows.
3. Post-restart the app resets to the STATUS tab (client remount) — re-click TRAINING when verifying.

## QA
- `bunx tsc --noEmit` → 0 src/ errors; `bunx eslint` on the 3 owned files + db.ts → exit 0
- curl matrix: `{gateId, programDay:2}` → 200 session.programDay=2; GET active.programDay=2; programDay 9 / "2" / 0 → 400 "Invalid program day."; duplicate → 409 with active payload; abandon → clean
- curl full flow: day-1 session (FORGE FRAME day 1 = 6 bodyweight + 1 mobility → gateForDay → titan-trial/CALISTHENICS) → add-log "Incline push-up" 3×8 (bottom of 8-12) → active shows programDay 1 + log → complete → cleared +53 XP → active null; free session (gale-fields) → programDay null → abandon clean
- agent-browser E2E (session t17a, 1280×800): TRAINING → protocol view → click ENTER GATE · START DAY 1 → "DAY 1 RAID INITIATED" notice + SESSION IN PROGRESS · CALISTHENICS + PROGRAM PLAN · DAY 1 — FULL BODY A + 0/7 BLOCKS + WARM-UP strip → click Incline push-up row → dialog prefilled (name, SETS 3, REPS 8) → LOG EXERCISE → row ✓ ("— logged") + 1/7 BLOCKS + EXERCISE LOGGED +15 XP notice → FINISH SESSION → reward overlay (CONTINUE) → back to FORGE FRAME program view; free session via START WORKOUT → SESSION console with NO plan section (plan-ul count 0, no /api/program fetch tied to it) → ABANDON → program view. 0 page/console errors. Screenshots: t17a-session-started.png, t17a-plan-checked.png, t17a-free-session.png (project root)
- NOTE for successors: a Strength session (programDay null, started 06:15:59Z) was active at hand-off — that belongs to the PARALLEL 17-b agent's QA, left untouched
