# Task 18-b — full-stack-developer · Daily briefing enrichment (readiness + program day + week compliance)

OWNED FILE (only this one): `src/app/api/oracle/briefing/route.ts` — GET cached briefing per hunter+day; POST divines via LLM with `briefingSystemPrompt`.

## What was done

- **Local math (re-implemented in-file, never imported from other routes):** `latestPerType` (day then updatedAt), `trendVsBaseline` (prior `slice(-8,-1)`, ≥3 distinct prior days, 1-decimal mean/deviation), `fmtSigned` (typographic minus) — byte-identical to the oracle/route.ts + /api/readiness approach. `rhrTrendLabel` mirrors health.ts rhrTrend branch order as a compact parenthetical (stable / trending down—adaptation / slightly below baseline / drifting up / ELEVATED warning).
- **`coachLines(metrics, weekSessions, program)`** builds 3 ATHLETE DATA lines:
  - `Readiness: 96/100 PRIMED — Green light — full intensity, chase PRs` (health.ts `readiness()`; honest `Readiness: no vitals logged yet` when honestNoData)
  - `RHR trend: −3.2 bpm vs 7-day baseline (slightly below baseline)` (health.ts `rhrTrend()`; pending / no-history copies while the baseline builds; watch/warn branches read as warnings)
  - `Weekly plan: 4/3 program days cleared · next up: Day 2 · Full Body B` (done = ALL cleared sessions since `weekStartKey()` Monday — same honesty as /api/readiness `week.done`; planned = program.days; recommended day = lowest plan day whose programDay was NOT cleared this week; alternatives: "no active program" / "program week complete — all days done" / degenerate "program plan unreadable" with the /api/program guarded JSON.parse)
- **POST Promise.all extended 5→8 queries:** bodyMetric rows (6 readiness types) · cleared week sessions (select programDay) · active program (select days+plan). Lines injected into the ATHLETE DATA block after the New Cycle line, same list style.
- **STANZA 2 guidance: one sentence added** — when the weekly plan data names a recommended program day, open the stanza with it and calibrate intensity to the readiness band (PRIMED → push, MODERATE/BACK OFF → cap, BACK OFF → recovery-first + Rest Day option). All other prompt text, the GET path, the POST flow and the 110-word Hard limits line are byte-identical.

## QA results

- `bunx tsc --noEmit` → 0 src/ errors · `bunx eslint src/app/api/oracle/briefing/route.ts` → exit 0 (re-run after removing the temporary QA log — clean).
- Prompt data verified verbatim via temp console.log in dev.log: `Readiness: 96/100 PRIMED — Green light — full intensity, chase PRs` / `RHR trend: −3.2 bpm vs 7-day baseline (slightly below baseline)` / `Weekly plan: 4/3 program days cleared · next up: Day 2 · Full Body B` — every number cross-checks against `GET /api/readiness` (readiness 96 PRIMED with drivers SLEEP 7.5H +10 / RHR −3.2 BPM +8 / STRESS 3/10 −2 / MOOD 4/5 +5 / ENERGY 4/5 +5; rhrTrend deviation −3.2 ok; week {planned 3, done 4}; nextDay {day 2, focus Full Body B} — exact match with the parallel 18-x field).
- POST → briefing woven with the data; GET afterwards → same-day cached briefing, byte-identical.
- Browser E2E (agent-browser t18b, 1280×800): STATUS → DAILY BRIEFING → REGENERATE → new text: "Athlete Kael, Level 11, streak 2d, 37 unspent points. Day 2: Full Body B — you are PRIMED, push for a PR. Focus on the weakest attribute, FLEX, or finish the Mobility Goal. The Full-Body Gauntlet challenge requires a 308+ XP Calisthenics session; your best is 53, so a massive effort is needed. Today's bonus is Cardio with a 1.65 XP boost. You've got this." (~75 words, 3 stanzas). REPLAY (TTS) click → POST /api/tts 200, zero console/page errors. Screenshot /tmp/t18b-briefing.png.

## Notes for later agents

- done counts program AND free cleared sessions (cross-check contract with /api/readiness `week`); distinct cleared programDays drives the recommended day.
- The client briefing card (daily-briefing.tsx), GET path and word limit were deliberately untouched.
- Deviations + full step log: see the Task 18-b entry in `/home/z/my-project/worklog.md`.
