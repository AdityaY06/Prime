# R8-a — Effort & Volume Science: RIR capture loop + progression engine modulation

Task ID: R8-a · Agent: full-stack-developer · Files owned (ONLY these touched): src/lib/progression.ts, src/components/fitness/exercise-dialog.tsx, src/components/fitness/session-raid.tsx

## Context read first
- worklog.md full R7 section (R7-b pattern-chip idioms, R7-c teal »-science idiom, R7 orchestrator NEXT-ROUND candidate ① = exactly this RIR loop) + R1-c progression lineage
- Orchestrator plumbing verified BEFORE coding (untouched by me): `ExerciseLog.rir Int?` (db pushed), `ExerciseLogDTO.rir: number | null` in types.ts, `sessionDTO` maps it, POST /api/sessions/[id] action "add-log" accepts optional `rir` (clamped 0-5, floor, null/absent → null)
- suggest() call sites audited: /api/progression/route.ts:80 + /api/oracle/attack-plan/route.ts:112 — both 2-arg (`trend.map(r => ({day, e1rm, weightKg, reps}))`, isLower); both routes build `Row = ProgressionInput & {sessionId, createdAt, e1rm}` — so ALL my lib changes had to be additive-optional to keep them compiling untouched (routes are LOCKED this round; lastLog-shaping/wiring is the orchestrator's)

## src/lib/progression.ts (pure lib)
- `ProgressionInput` gained `lastRir?: number | null` (optional, documented)
- NEW exported `ProgressionHistoryRow` type = old inline history shape + `lastRir?: number | null`
- `suggest(history, isLower = false, lastRir?: number | null)` — 3rd optional arg; effective RIR = explicit arg ?? last history row's `lastRir` ?? null. **null/undefined/absent → returns baseSuggest() verbatim → byte-identical legacy verdicts** (hard requirement)
- Original 30-line verdict logic moved UNCHANGED into private `baseSuggest` (copy-paste, zero edits)
- NEW private `applyRir(base, rir)` modulation (deterministic, pure):
  - BUMP LOAD · rir 0 → bump HALVED, suffix " · RIR 0" (retargetBumpKg rewrites the "+N kg" token, mirroring parseBumpKg's regex); rir ≥ 3 → ×1.5 + " · RIR N"; rir 1-2 → suffix only
  - ADD REPS · rir 0 → "Add 1-2 reps" → "Add 1 rep" + suffix; rir ≥ 3 → "Add 2-3 reps" + suffix; 1-2 → suffix only (rep counts halved/×1.5 in whole-rep terms)
  - HOLD · rir 0 → stays HOLD + " · RIR 0 — RECOVER FIRST"; else suffix only
  - LOG MORE → suffix only
  - Rounding: round1 = Math.round(n*10)/10 (spec's "rounded to 1 decimal", matches app-wide fmtKg; 2.5→1.3, 2.5×1.5→3.8, 5→2.5, 5×1.5→7.5 — spec's inline "+1.25 KG" example traded against the twice-stated 1-decimal rule; parseBumpKg parses all of them and downstream suggestedLoad toFixed(1) lands identically)
- NEW exported `rirVerdictLine(rir: number | null): string | null` — 0 "TRUE FAILURE — PROGRESS WITH CARE" · 1 "VERY CLOSE — GROWTH ZONE" · 2-3 "PRODUCTIVE — THE SWEET SPOT" · 4-5 "EASY — LEAVE 2-3 NEXT TIME" · null/NaN → null (single source of truth, imported by BOTH components)

## src/components/fitness/exercise-dialog.tsx (Task 1 — capture)
- State `rir: number | null`, default null (SKIP — never force users to lie); reset to null in the template/open prefill effect
- EFFORT · RIR group between the numeric steppers and ESTIMATED XP (cascade index 6; XP→7, submit→8): sys-label "RIR · REPS IN RESERVE"; grid-cols-6 of 0-5 digit buttons (min-h-11, tabular-nums, selected = border-violet-400/70 bg-violet-500/20 text-violet-200 like the Class selector idiom; tap a selected digit again = deselect); full-width min-h-11 zinc SKIP toggle (aria-pressed, highlighted when null) → guarantees ≥48×44px targets at 390px (a 7-column row would have shrunk cells to ~40px wide)
- Renders ONLY for `!timeBased` (strength/bodyweight — cardio/mobility skip)
- Hint line mono text-[9px] zinc-600: `0 = NOTHING LEFT · 2-3 = PRODUCTIVE ZONE · ROBINSON 2024`; contextual coaching teal-400/80 text-[9px] role="status" via rirVerdictLine
- a11y: role="group" aria-label="Reps in reserve" wrapper, aria-pressed on all 7 buttons, digit aria-labels "N reps in reserve", focus-visible:outline-violet-400/70, native buttons = keyboard accessible
- POST body: `{ action: "add-log", ...form, rir: rirOut }` where rirOut = rir for strength/bodyweight else null (class-switch safe); XP calc untouched

## src/components/fitness/session-raid.tsx (Task 2 — display + feedback)
- EXERCISE LOG rows: prescription line is now flex-wrap with a `RIR ${l.rir}` chip (border-violet-400/30 text-violet-300/80 mono text-[9px] font-bold tracking-[0.15em] px-1 py-px — exact PatternChip idiom) + teal verdict feedback line (rirVerdictLine, text-[9px] truncate) under it when captured; chip carries title tooltip of the verdict
- Block rows: `rowLog` = LAST in-session log matching the block's progressionKey; when `entry` exists (progression guidance live) AND rowLog.rir ≤ 1 → tiny amber text-[9px] bold line under the prescription: strength-with-load "CLOSE TO FAILURE — HOLD LOAD NEXT" · bodyweight/unloaded "CLOSE TO FAILURE — REPEAT REPS" — one truncated line, no layout break at 390px
- rirVerdictLine IMPORTED from progression.ts (per spec directive — no duplicated mapping anywhere)

## Verification (all pasted in worklog)
- `bunx tsc --noEmit` → 0 src/ errors (only 4 pre-existing examples/skills); re-run after concurrent R8 agents landed — still clean
- `bunx eslint <3 files>` → exit 0
- Pure harness (`bun -e`, imports the real src/lib/progression.ts, legacy verbatim oracle): **81 PASS · 0 FAIL** — 7 histories × 2 isLower × {no-arg, null, undefined, row-carried-null} all byte-identical BEFORE/AFTER; 13-row modulation table; 7 rirVerdictLine cases; parseBumpKg round-trips (1.3/3.8/2.5/7.5) + halving/×1.5 math sanity (one initial harness FAIL was the assertion's own float epsilon — 1.3−1.25 = 0.05000000000000004 — fixed with +1e-9 tolerance, not a logic issue)
- agent-browser read-only (isolated session r8a, 390×844): app boots (PRIME title, LV.11 D-RANK 118/530), STATUS scrollWidth 390, TRAINING tab renders STORM LATTICE plan, ZERO console/page errors, no clicks that write, session closed. NOTE for orchestrator: TRAINING tab currently shows scrollWidth 393 (3px overflow from the rift-banner/gate-card decorations in gates-tab.tsx — a concurrently-owned file; session-raid is NOT mounted without an active session, so it cannot be my markup; STATUS tab is exactly 390)
- dev.log: all 200s, no compile errors; dev server never restarted, no build, no git commit, DB untouched (no session/log writes anywhere — orchestrator does live E2E)

## Handoff notes for the orchestrator
- Routes (locked) still call `suggest(history, isLower)` → byte-identical guidance until YOU wire RIR through: EITHER pass a 3rd arg `suggest(trend, isLower, lastLog.rir)` OR stamp `lastRir` on the trend rows (both supported; explicit arg wins over row-carried). ProgressionEntryDTO.lastLog does NOT yet echo rir — add `lastRir?: number | null` there when you wire it (my file, additive-safe)
- The amber close-to-failure coaching in session-raid keys off the ACTIVE session's log rir + progression entry existence, so it lights up immediately once RIR is captured in a live raid — no route changes needed for that piece
