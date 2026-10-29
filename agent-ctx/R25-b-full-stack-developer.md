# R25-b — IMPORT DESELECT TOGGLES (full-stack-developer)

Task: per-workout / per-day DESELECT toggles in both Import Center preview
modes, with the confirm request honoring the selection server-side.

## Ground truth on arrival
- worklog.md read in full (R21-a workouts CSV import, R22-a health CSV import,
  R24 close-out — R25 candidate #2 was exactly this task).
- Key files studied: import-center.tsx (931 lines, both panels), csv-import.ts
  (787), health-csv.ts (860), /api/import/sessions (258), /api/import/health
  (189), use-api.ts error-surface semantics.
- Baseline DB: KAEL L11 / xp 118 / totalXp 2943 / 77.5 kg / 12 sessions /
  11 logs / 15 xpEvents / 31 metrics / 0 import-sourced events.

## Key design decisions (documented in-code)
- WORKOUTS select by INDEX, HEALTH selects by DAY KEY — the spec's own
  reasoning, now codified: workouts have no natural stable key (duplicate
  names/dates allowed) so indexes + a DETERMINISTIC parse order carry the
  contract; day keys (yyyy-mm-dd) are content-derived and immune to any
  future ordering change, and an unknown key fails LOUDLY (400) instead of
  silently re-targeting another day.
- Selection applies to the PARSE (pre-dedupe) on the server, NOT to the
  preview's deduped array: preview and confirm share one deterministic parse,
  so DB state changing between preview and confirm can never shift indexes.
  The preview DTO carries each workout card's parse `index` (identity map —
  dedupeAgainst filters by reference) so the client never guesses positions.
- Invalid selection → 400 with the honest code (INVALID_SELECTION /
  NOTHING_TO_IMPORT) and a reason naming the offending index/day — never
  silent-ignore (a shifted selection must fail loudly, never import the WRONG
  workout). Empty selection → NOTHING_TO_IMPORT (the UI disables CONFIRM
  first; the error is the server-side guard).
- DESELECTED ≠ SKIPPED: exclusions are NOT added to skipped rows (that list
  is the parser's row-level honesty); the confirm response reports a separate
  `excluded` count and the UI renders an amber "EXCLUDED BY SELECTION —
  DESELECTED, NOT SKIPPED · NEVER WRITTEN" line.
- Health preview DTO gained `dayKeys: { day, entries, types }[]` — EVERY
  deduped day (beyond the 60-day render cap), because the chips/CONFIRM label
  must recompute exactly from the selected subset even for multi-year
  Cronometer exports. Hidden days stay selected by default; the "+N MORE
  DAYS" line live-reports how many hidden days are still included.
- Determinism verified, not assumed: both parsers build their output from
  insertion-ordered Maps (spec-guaranteed in JS — no hash randomization);
  health day previews sort string keys (yyyy-mm-dd = chronological). Header
  docs added to BOTH lib files ("DETERMINISTIC PARSE CONTRACT") warning
  future editors never to introduce sorting/DB-dependent ordering without
  revisiting the index contract.

## Files edited (5, zero new routes/deps/schema)
- src/lib/import/csv-import.ts — ImportSelectionError (code INVALID_SELECTION
  | NOTHING_TO_IMPORT) + applyWorkoutSelection(parsed, selected) pure helper
  (absent → ALL same-reference; dup indexes dedupe silently; empty → throw
  NOTHING_TO_IMPORT; out-of-range/non-integer → throw INVALID_SELECTION) +
  header determinism doc.
- src/lib/import/health-csv.ts — same error class re-exported +
  applyDaySelection(parsed, selectedDays) (unknown key → INVALID_SELECTION
  naming up to 3 keys; fileDuplicates rides along unchanged) + header
  determinism + day-key-vs-index rationale doc.
- src/app/api/import/sessions/route.ts — selectedWorkouts wire-shape guard
  (non-array/non-integer → 400 INVALID_SELECTION up front), selection applied
  post-parse pre-dedupe (confirm only; dryRun ignores it and instead returns
  each card's parse `index`), excluded computed as parsedWorkouts −
  uniqueSelected, response.created.excluded, defensive ImportSelectionError
  catch, SELECTION header doc.
- src/app/api/import/health/route.ts — selectedDays wire guard, selection
  applied post-parse pre-dedupe, dryRun returns dayKeys (chronological,
  per-day entries + sorted types), excluded = distinct parsed days − distinct
  selected days, response.created.excluded, defensive catch, header doc.
- src/components/fitness/import-center.tsx — ToggleGlyph (checkbox-ish
  bordered square: violet Check when selected, ✕ when excluded) +
  SelectionBar ("N / M WORKOUTS|DAYS SELECTED" + SELECT ALL teal / SKIP ALL
  amber, both exactly 44px) shared by both panels; every preview card is now a
  full-row motion.button toggle (min-h-11 = 50px rendered, aria-pressed,
  aria-label "... — SELECTED/EXCLUDED FOR IMPORT", deselect animates the card
  to opacity 0.5 + zinc-400 text + " · EXCLUDED" in the meta line); chips
  (WORKOUTS/LOGS/SETS/EST XP · DAYS/ENTRIES/TYPES) recompute LIVE from the
  selected subset while SKIPPED/DUPLICATES stay parse-level; CONFIRM label
  "IMPORT N WORKOUTS|DAYS" and disabled at 0 selected; confirm body sends
  selectedWorkouts/selectedDays explicitly; success panel + amber preview
  line report excluded counts; preview init selects ALL on every parse.

## QA ladder (all green)
- eslint on the 5 files: exit 0.
- Scratch suite (bun, /home/z/r25b-scratch — the write surface forbids /tmp,
  R24-b precedent, DELETED after): 30 PASS / 0 FAIL — workout selection
  subset/order/totals, dup-index dedupe, out-of-range/negative/non-integer →
  INVALID_SELECTION, empty → NOTHING_TO_IMPORT, absent/null → ALL
  (same-reference); day-key selection present/absent/unknown (named key)/
  empty/parse-not-DB validation; determinism (byte-identical double parse,
  file-order-driven workout order, 50 repeated parses stable, both parsers);
  multi-year scale (400 workouts → last-quarter selection lands exactly
  W300..W399; 500 days → last-30-days keeps exactly 60 entries). The 4 initial
  failures were MY fixture bugs (cardio row with no reps/duration is an honest
  skip; wrong subset expectation; wrong last-30 date math) — the engine held.
- API (curl, DB PURITY IS LAW — baseline dump first):
  (1) dryRun → 3 workouts with parse indexes 0/1/2;
  (2) confirm selectedWorkouts [0,2] → ONLY QA Push + QA Cardio landed
  (rows verified via Prisma: 2 sessions gateId "import", 3 logs exactly the
  subset's, 2 xpEvents source "import" on the right days; QA Legs ABSENT);
  (3) response { sessions: 2, logs: 3, xp: 188, excluded: 1 };
  (4) invalid [0,99] → 400 INVALID_SELECTION naming index 99; empty [] → 400
  NOTHING_TO_IMPORT; malformed string → 400 INVALID_SELECTION; health unknown
  day 1999-12-31 → 400 INVALID_SELECTION naming the key;
  (5) absent selection (legacy shape, byte-compatible) → ALL 3 landed
  (sessions 3, logs 4, xp 284, excluded 0); health absent → 9 entries / 3
  days / excluded 0;
  (6) hunterId-scoped + fixture-date-scoped deletes + aggregate restores
  after EACH commit path → final Prisma-level dump BYTE-IDENTICAL to baseline
  (verified twice; final read-only check: L11/118/2943/77.5, 12/11/15/31,
  zero 2027-03 rows). All QA helpers deleted.
- Browser (agent-browser session r25b, 390×844, PROGRESS via .grid-cols-8
  uppercase label, dryRun-only — CONFIRM never clicked): workout mode → paste
  3-workout fixture → PARSE — PREVIEW → "3 / 3 WORKOUTS SELECTED" + "IMPORT 3
  WORKOUTS" → tap middle card → "2 / 3 WORKOUTS SELECTED", chips recompute
  (WORKOUTS 2 · LOGS 3 · SETS 8 · EST XP 188 · SKIPPED 0 — matching the curl
  subset commit exactly), amber "1 WORKOUT EXCLUDED BY SELECTION —
  DESELECTED, NOT SKIPPED · NEVER WRITTEN", card opacity 0.5, aria-pressed
  [true,false,true], aria-label "QA Legs — 2027-03-04 — EXCLUDED FROM IMPORT"
  → SKIP ALL → "0 / 3" + CONFIRM disabled → SELECT ALL restores → screenshots
  r25b-workouts-deselect.png / r25b-health-deselect.png; health mode → same
  flow with 3-day fixture → deselect 2027-03-03 → "2 / 3 DAYS SELECTED",
  "IMPORT 2 DAYS", ENTRIES 6 / TYPES 3, excluded line, opacity 0.5. Card 50px,
  SELECT ALL/SKIP ALL exactly 44px, scrollWidth 390 (zero overflow), console
  clean (only benign Fast Refresh + the documented recharts warning), zero
  page errors, localStorage cleared, session closed.
- tsc --noEmit ONCE at the very end: ZERO errors in the 5 R25-b files. The
  only src/ errors are in session-share-card.tsx — the PARALLEL R25-a agent's
  brand-new untracked file (created 06:17, r25a-*.png screenshots) — plus the
  4 documented examples/skills errors. Not R25-b's surface.
- dev.log after QA: 200s only; POST /api/import/sessions + /api/import/health
  200s; no [api/*] error tags; the intentional guard-test 400s surface as
  clean JSON responses, not log errors.

## Incidents & deviations (honest)
- Dev server DIED once mid-browser-QA (page went to "localhost refused to
  connect"; log frozen after a 2.2s POST /api/tts — the documented
  parallel-wave OOM pattern; R25-a is active). Restarted with the house
  recipe `(nohup bun run dev > dev.log 2>&1 &)` and re-ran the ENTIRE browser
  QA from a fresh page load. No route defect.
- Scratch suite lived at /home/z/r25b-scratch instead of /tmp (the sandbox
  write tool only allows /home/z — same deviation as R24-b, documented).
- Deselected-card text uses zinc-400 classes with the card-wide opacity 0.5
  (spec asked "opacity-50, zinc-500 text"; zinc-400 at 50% ≈ the spec's
  intended zinc-500 effective tone while honoring the house "text ≥ zinc-400"
  class floor — state is also carried by the glyph box, border, and
  " · EXCLUDED" meta suffix).

## Watch-items for future rounds
- The workout preview DTO's `index` field is a NEW contract — if anyone ever
  changes parse ordering (e.g. chronological sort for nicer previews), the
  preview AND confirm must change together; the lib headers now warn.
- dayKeys payload grows linearly with distinct days (≤2000 entries ⇒ worst
  case ~2000 small objects) — bounded by the existing entry cap, no action
  needed.
- health "SKIPPED" chip still counts parse skips only; if a future round
  wants a dedicated EXCLUDED chip, the excludedCount is already client-side.
