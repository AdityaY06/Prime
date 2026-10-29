# R22-a · full-stack-developer · working notes

Task: Health Metrics CSV Import (Cronometer/Whoop/Oura/Apple-Health/generic → BodyMetric) — pure parser lib + /api/import/health dryRun/confirm route + Import Center mode switch.

## Ground truth (read before coding)
- `src/lib/import/csv-import.ts` exports `parseCsvTable`, `sniffDelimiter`, `parseCsvDate`, `ImportParseError` — REUSE the tokenizer + delimiter sniff directly (no copy).
- Sessions import route pattern: POST { csv, dryRun|confirm booleans } → CONFIRM_REQUIRED guard, requireHunter → NOT_AWAKENED, ImportParseError → 400 NO_SESSIONS, dryRun NEVER writes, confirm = ONE db.$transaction with dedupe re-checked inside.
- BodyMetric: `@@unique(hunterId, day, type)`; types consumed by /api/metrics METRIC_TYPES = weight|chest|waist|hips|arm|thigh|calf|sleep|restingHr|mood|energy(+vitals/tests). Readiness consumes sleep|restingHr|mood|energy (READINESS_METRIC_TYPES). → mood/energy ARE genuinely consumed (metrics GET series + Vitals check-in + readiness) → import them.
- /api/metrics range philosophy = REJECT out-of-range (400), so health import uses SKIP-with-reason for out-of-bounds (not clamp) — documented.
- DB baseline (pre-R22-a): hunter KAEL `cmuiwiu690000jpjtdamztt1r` L11 xp 118 weightKg 77.5; 31 BodyMetric rows on 2026-09-27/28/29. DB PURITY IS LAW — restore after tests.

## Owned files
- `src/lib/import/health-csv.ts` (NEW, pure)
- `src/app/api/import/health/route.ts` (NEW)
- `src/components/fitness/import-center.tsx` (EDIT — extend, extract workout flow verbatim into local component, add HEALTH mode)

## Design decisions (documented in code headers)
- Within-file dedupe: LAST row wins (matches BodyMetric "latest wins via upsert" storage semantic). `dedupeAgainst(existing)` excludes existing (day,type) pairs → re-import no-op by construction; commit still upserts (never crashes on unique).
- Weight: kg native; lb/lbs/pounds header-or-cell-suffix evidence → ×0.45359237. Sleep: h:mm / "450m" / suffix+header unit hints / plain ≤24h=hours, 25–1440=minutes, 1441–90000=seconds heuristic (Oura seconds, Whoop minutes) — all documented. Measurements: in/inch → ×2.54.
- Out-of-bounds → skipped row w/ reason (weight 20–400 kg, sleep 0–24 h, rhr 25–250 bpm, measure 20–300 cm, mood/energy 1–5).
- Long-format (Apple Health style Date|Type|Value|Unit) supported when no wide metric columns found.
- Caps: ≤2000 aggregated entries per file.
- Confirm: upserts + hunter.weightKg sync ONLY when imported weight extends the latest weight day forward (no regression to older values). NO XP, NO quest auto-verify, NO streak — historical backfill (sessions-import precedent).

## Final record (validation outcomes)

- tsc --noEmit: ZERO src/ errors (only the 4 documented examples/skills).
- eslint on all 3 owned files: exit 0.
- Scratch suite (/tmp/r22a-scratch.ts, bun): 72 PASS / 0 FAIL — then DELETED. Fixtures covered: Cronometer mixed headers; lb→kg (header + "Pounds" alias + cell suffix); "7:30"/"7:45"/"7h30m"/"450m"/plain-minutes/plain-seconds/Whoop "(min)" hint sleep; bad dates (4 forms) skipped w/ line-numbered reasons; within-file last-wins dedupe + dedupeAgainst; garbage ×5 → ImportParseError; Apple long-format (Body Mass kg / lb / grams, Resting Heart Rate count/min, unrecognized types, % unit); trap columns (Energy kcal, Sleep Performance, Deep/REM Sleep, Time in Bed, Sleep Need, Lean/Fat/Muscle Mass, Weight Goal) all rejected; bounds skips w/ reasons; inches→cm; semicolon sniff + decimal comma; maxEntries cap; blank lines; daysPreview cap.
- REAL BUG FOUND+FIXED during scratch QA: substring exclusion "ratio" matched inside "du-RATIO-n" and silently rejected EVERY "Sleep Duration" header — switched all three exclusion lists to TOKEN-prefix matching (tokenExcluded helper, documented in code).
- API (port 3100 — server flapped/restarted by platform mid-QA; route verified on the current instance): CSV_REQUIRED 400, CONFIRM_REQUIRED 400, garbage dryRun 400 NO_METRICS w/ reason, dryRun 200 (days 5 / entries 30 / byType 5×6 / range / day cards), confirm 200 (entries 30, days 5, profileWeightSynced true, unlocks readinessDays 8 / rhrDays 8 / sleepDays 6 / weightDays 6 — honest post-commit counts), re-confirm → NOTHING_TO_IMPORT no-op, re-dryRun → duplicates 30 + "ALREADY LOGGED — 2026-10-01 WEIGHT".
- DB PURITY: baseline dump (31 BodyMetric rows on 2026-09-27/28/29, KAEL L11 xp 118 totalXp 2943 weightKg 77.5, 12 sessions, 15 xpEvents) → confirm wrote 30 rows + weightKg 76.2 → RESTORE deleted exactly hunterId-scoped day≥2026-10-01 rows (30) + weightKg back to 77.5 → FINAL verification equals baseline byte-for-field (31 rows, L11/118/2943/77.5, 12 sessions, 15 xpEvents).
- Browser (agent-browser session r22a, 390×844 mobile): PROGRESS tab → IMPORT CENTER header "WORKOUTS + HEALTH CSV" + mode tablist → HEALTH tab → paste fixture → PARSE — PREVIEW → preview verified in DOM: chips DAYS 3 / ENTRIES 17 / TYPES 6 / DUPLICATES 0 / SKIPPED 2, RANGE line, 3 day cards ("WEIGHT 77.5 kg · WAIST 81.3 cm · SLEEP 7.5 h · RESTING HR 58 bpm · MOOD 3/5 · ENERGY 4/5"), SKIPPED ROWS expand shows "LINE 4 — RESTING HR OUT OF RANGE — 500 (25–250 BPM)" + "LINE 5 — BAD DATE — "not-a-date"", CONFIRM IMPORT + transaction copy. Measured: overflowX 0, mode chips 44px/44px, CONFIRM 44px, SKIPPED toggle 44px. WORKOUTS mode intact after switch-back (fresh intake, PARSE disabled). 3 screenshots archived (screenshots/r22a-import-*.png). Browser QA was dryRun-only — zero DB writes from the browser.
- dev.log: stale since 21:08 (frozen at the pre-crash instance; the platform supervisor's restarted instances on port 3100 log elsewhere) — route health verified by live curl + browser instead. Server crash mid-QA was platform-level (memory pressure; concurrent R22-b agent active), not caused by the route (guards + transaction verified on the current instance).
- Scratch hygiene: /tmp files deleted; project-root scratch scripts deleted (dbcheck-r2b.ts left alone — belongs to concurrent R22-b).

## Re-dispatch record (R22-a verification pass — work was on disk, agent had timed out pre-report)

Arrival state: all 3 deliverables present on disk + worklog entry appended, but no report ever returned and the platform dev server was DOWN (OOM-killed next-server; no listener on 3000/3100; dev.log frozen at 21:08). Re-ran the ENTIRE validation ladder and hardened one honest gap:

- RESTORED the dev server (`bun run dev`, background) — dmesg showed `oom-kill ... task=next-server anon-rss:1679376kB`; server healthy since (all 200s, only the 2 documented benign warnings).
- AUDIT of all 3 files against the spec + consumers (schema @@unique(hunterId,day,type) → upsert key hunterId_day_type ✓; /api/metrics METRIC_TYPES + /api/readiness READINESS_METRIC_TYPES consume mood/energy ✓; export-center mounts ImportCenter twice ✓).
- CODE HARDENING (one surgical edit): ENERGY_EXCLUDE += readiness/recovery/score/strain — "Energy Readiness"-style headers are 0–100 DEVICE scores, not subjective 1–5; they now resolve to nothing (caught by my scratch fixture, consistent with the documented exclusion philosophy).
- Scratch suite v2 (/tmp, bun, DELETED): **73 PASS / 0 FAIL** across 12 blocks. 15 initial failures were triaged to 14 fixture/expectation bugs of mine (per-(day,type) aggregation collapse, 16 cm calf under the 20 cm floor, March 32–70 invalid dates, missing maxEntries opt, byType key-order brittleness) + 1 real gray area → the ENERGY_EXCLUDE fix. The code's documented behavior (wide-format FIRST-resolving-column-per-canonical, header unit hints, skip-not-clamp bounds) held in every case.
- API on port 3000: dryRun 200 exact DTO (days 3 / entries 14 / byType / range / day cards / skipped≤20 / duplicates 0); CONFIRM_REQUIRED 400; NO_METRICS 400; CSV_REQUIRED 400; confirm 200 (14 entries / 3 days / profileWeightSynced true / unlocks readiness 6 · rhr 6 · sleep 4 · weight 4 — verified against actual DB rows: existing sleep days = 1, so sleepDays 4 is the honest count); re-confirm → NOTHING_TO_IMPORT 400; re-dryRun → duplicates 14, entries 0.
- DB PURITY (LAW, held): baseline (KAEL L11/118/2943/77.5/9 sessions/37 SP · 31 BodyMetrics · 12 sessions/11 logs/15 xpEvents) → commit (+14 rows, weightKg→77.1) → hunterId-scoped delete of exactly the 14 created rows + weightKg→77.5 → FINAL DUMP BYTE-IDENTICAL to baseline.
- Browser (agent-browser session r22a, 390×844): PROGRESS → IMPORT panel → HEALTH chip (aria-selected, both mode chips measured 44px) → paste fixture → PARSE — PREVIEW → DOM-verified preview (DAYS 2 · ENTRIES 7 · TYPES 4 · DUPLICATES 0 · SKIPPED 1; RANGE 2026-10-04 → 2026-10-05; day cards "WEIGHT 77.1 kg · WAIST 84 cm · SLEEP 7.5 h · RESTING HR 54 bpm" — 170 lb→77.1 kg + 7:30→7.5 h converted live; "LINE 4 — BAD DATE — \"baddate\"" after expanding SKIPPED ROWS) → WORKOUTS mode intact → overflowX 0 → console clean (only documented benign warnings). Screenshots: screenshots/r22a-import-health-preview.png + screenshots/r22a-import-mode-switch.png. dryRun-only — zero DB writes from the browser.
- Re-ran post-edit: tsc zero src/ errors; eslint 3 files exit 0.
