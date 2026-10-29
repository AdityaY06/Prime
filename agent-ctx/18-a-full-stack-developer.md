# Task 18-a — Adaptive next-day recommendation + progression load prefill

Agent: full-stack-developer
Files owned: src/app/api/readiness/route.ts (EDIT) · src/components/fitness/program-panel.tsx (EDIT) · src/components/fitness/session-raid.tsx (EDIT) · src/components/fitness/exercise-dialog.tsx (EDIT)
No other file touched. No schema change, no new route, no new lib.

## What was built

1. **src/app/api/readiness/route.ts** — additive `nextDay` on GET:
   - New query in the existing `Promise.all`: cleared sessions since `weekStartKey()` Monday with `programDay NOT NULL` → `select: { programDay }` (distinct set computed in JS; the old `count` for `week.done` is untouched — done still counts ALL cleared sessions, program or free).
   - Active-program `select` extended `days` → `days, plan` (+plan JSON parsed defensively via `planDayInfos()`: `{day, focus}[]`, `[]` on unparseable/invalid JSON).
   - `nextDay: { day, focus, reason, daysDone, allDone } | null`:
     - `null` when no active program (or plan JSON unusable → nothing honest to recommend).
     - `daysDone` = sorted distinct cleared programDays this week.
     - `day` = lowest plan day number NOT in daysDone; `focus` = that ProgramDay's focus from plan JSON.
     - all plan days done → `day: null, focus: null, allDone: true, reason: "ALL PROGRAM DAYS CLEARED THIS WEEK — REGENERATE OR REST"` (object kept, per spec).
     - reasons: `"NOT YET TRAINED THIS WEEK"` (daysDone empty) / `"NEXT UNTRAINED DAY"` (partial) / the all-done string above.
   - Existing `readiness` / `rhrTrend` / `week` fields byte-identical (verified live: 96/100 PRIMED, week {planned 3, done 4} unchanged before/after).

2. **src/components/fitness/program-panel.tsx** — NEXT UP badge + week-complete strip:
   - Panel does its own `useApi<ReadinessRes>("/api/readiness")` (spec-blessed independent fetch; loading/error/null → no badge, no crash — `readiness-banner.tsx`/`week-compliance.tsx` precedent).
   - `DayCard` gains optional `nextUp`: header shows a violet-glow `NEXT UP` chip (Sparkles icon, 9px mono, `border-violet-400/60 bg-violet-500/25` + glow shadow) next to "DAY N · FOCUS"; card border becomes `border-violet-400/60` + violet shadow glow; ENTER GATE button brightens (bg-violet-500/40, border-violet-300/70, text-violet-50, persistent glow). Header spans got `shrink-0`/`min-w-0 truncate` so the chip never breaks 390px layouts.
   - `allDone` → slim full-width emerald strip above the day grid: BadgeCheck icon + "PROTOCOL WEEK COMPLETE — {daysDone.length}/{program.days} DAYS CLEARED. REGENERATE FOR A NEW SPLIT OR TAKE THE EARNED REST." (`role=status`; daysDone.length = distinct PROGRAM days cleared, not week.done).
   - lucide `Verify` does NOT exist in this lucide-react version → **BadgeCheck** used (visual twin). `nextUpDay === d.day` drives the prop; allDone suppresses badges.

3. **src/components/fitness/session-raid.tsx` — LOAD PREFILL from progression:
   - `useApi<ProgressionRes>("/api/progression")` fetched ONLY when `session.programDay !== null` (same gate as the plan fetch — free sessions unchanged, zero requests).
   - `progressionByExercise`: Map keyed by `progressionKey(e.name)` from `@/lib/progression` (client-safe pure lib).
   - `suggestedLoad(entry)` → `{ from, to, bumping } | null`: `from = lastLog.weightKg` (null when ≤0), BUMP LOAD → `to = from + parseBumpKg(detail)` (regex `\+?(\d+(?:\.\d+)?)\s*kg`, fallback repeat when unparseable), clamped ≤500; other actions → repeat (`to = from`).
   - `blockToTemplate(b, entry?)`: strength/bodyweight blocks with loaded history → `defaultWeight = load.to` (everything else byte-identical; cardio/mobility/time blocks never prefill weight).
   - `PlanRow` gains `load?: LoadHint | null` → tiny 9px mono tabular-nums chip on the existing second chip line: `40→42.5 KG` emerald (`border-emerald-400/40 bg-emerald-500/10 text-emerald-200`) when bumping, `40 KG` zinc when repeating last load; title tooltip explains the chip. Row height unchanged (chip rides the existing flex-wrap line).
   - Local `fmtKg` (trailing-zero trim, same as exercise-dialog's).

4. **src/components/fitness/exercise-dialog.tsx` — SUGGESTED line:
   - LAST TIME hint area restructured into a wrapper `<div className="mb-3">`: first `<p>` byte-identical (same classes/text), plus — when the matched entry's suggestion is BUMP LOAD — a second emerald line `TrendingUp` icon + "SUGGESTED: {last + bump} KG ({detail})" (`border-emerald-400/40 bg-emerald-500/10 text-emerald-200`, truncate).
   - `suggestedLine` memo (parseBumpKg local twin; line hidden when detail unparseable). Weight-stepper prefill path re-verified: the `[template, open]` effect sets `form.weightKg = template.defaultWeight` on open → program prefill (42.5 etc.) lands in the stepper with no regression.

## QA (all green)

- `bunx tsc --noEmit` → **0 src/ errors** (only pre-existing examples/ + skills/ folder errors). `bunx eslint` on the 4 owned files → **exit 0**.
- curl GET /api/readiness vs direct Prisma query (bun script): daysDone **[1]** matches (3 cleared sessions this week with programDay=1 on 09-30), nextDay.day = **2** = lowest untrained plan day, focus "Full Body B", reason "NEXT UNTRAINED DAY" — byte-exact spec shape.
- Browser E2E (agent-browser session `t18a`, 1280×800): TRAINING tab → exactly ONE NEXT UP chip on the DAY 2 card (aria "Day 2, Full Body B — next up this week", button "— recommended next", computed violet border/glow); cross-checked with curl (day 2) ✓.
- Bodyweight program had no weight-bearing blocks → per spec RETIRED + forged GYM/3d/INTERMEDIATE via UI; NEXT UP persisted on Day 2 (daysDone carries); ENTER GATE day 2 → SESSION IN PROGRESS + PROGRAM PLAN · DAY 2 — FULL BODY B with weight chip **"30→32.5 KG"** (emerald computed) on the seeded-history block and NO chips on the other 6 blocks → clicked it → dialog: WEIGHT stepper **32.5**, SETS 4, REPS 8, LAST TIME: 3×10 @ 30 KG · e1RM 40 KG + **SUGGESTED: 32.5 KG (+2.5 kg next session (upper-body heuristic))** → Custom dialog typed "Bench press" (real DB history + synthetic 3rd day): LAST TIME: 4×10 @ 40 KG + SUGGESTED: 42.5 KG ✓ → ABANDON (0 logs, 0 XP — hunter XP 262 before/after) ✓.
- Mocked-state sweep (non-destructive network route on /api/readiness only): allDone → emerald strip "PROTOCOL WEEK COMPLETE — 3/3 DAYS CLEARED…" + 0 NEXT UP chips ✓; empty week → NEXT UP on DAY 1 ✓; unroute + reload → real state restored (Day 2) ✓.
- Mobile 390×844 TRAINING tab: `document.documentElement.scrollWidth === 390 === clientWidth` (zero horizontal overflow), NEXT UP chip visible within header (x=203 w=78, header right 356), 0 page/console errors.
- Final state restored per spec: RETIRE gym → FORGE none/3-days/novice (name "HYPERTROPHY ENGINE" — same profile as the original FORGE FRAME: bodyweight/3d/novice/hypertrophy), all 4 synthetic seed sessions deleted, progression back to original (Bench press 2 sessions → LOG MORE), no active sessions, dev.log clean (all 200s).

## Deviations / notes for future agents

1. **Chip text for repeat-load** renders `40 KG` (not `40→40 KG`) — "40→42.5 KG" only when bumping (zinc when repeating, emerald when bumping), per the spec's emerald/zinc split.
2. **`Verify` icon unavailable** in the installed lucide-react → BadgeCheck (identical checkmark-badge glyph).
3. **allDone strip uses `daysDone.length`** (distinct program days cleared) not `week.done` (which counts free sessions too) — "PROTOCOL WEEK COMPLETE — 3/3" stays honest to the protocol.
4. **nextDay is null when the plan JSON is unparseable** even though a program row exists — no honest recommendation possible in that corruption case (documented in route comment).
5. E2E data seeding: the live DB only had 2 bench-press days (LOG MORE verdict) and the gym program's recommended day carried no exact-name match — so the E2E used 4 synthetic cleared sessions (1 bench "today" + 3 Band-chest-press days incl. 2 last-week, all programDay null, xpEarned 0) to exercise the BUMP path, ALL deleted afterward (verified). The real "Bench press" history remains untouched at 2 sessions.
6. First-forge-of-day XP (+10) was granted by the UI forge during the E2E (legit app behavior, ledger-deduped — same precedent as Task 16); the session cleanup itself granted zero XP.
7. Parallel siblings 18-b/18-c were live during QA (two rejected POST /api/program 400s in dev.log are theirs, no mutations) — if program state looks different later, check their worklog entries.
