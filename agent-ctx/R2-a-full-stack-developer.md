# R2-a — Records/status intelligence (work record for sibling/QA agents)

Task: rebuild the lost Task 19/20 "records/status intelligence" polish slice on the recovered R1 spine.

## Owned files (FILE OWNERSHIP respected)
- src/app/api/monthly-summary/route.ts (NEW)
- src/components/fitness/status-tab.tsx (MONTHLY DIGEST panel)
- src/components/fitness/records-tab.tsx (PR board upgrade)
- src/components/fitness/directives-tab.tsx (RESETS IN countdown)
- src/components/fitness/rest-day-card.tsx (streak shield inventory strip)
- src/app/api/rest-day/route.ts (additive `ward` field on GET only)
- src/app/api/oracle/briefing/route.ts (additive prompt enrichment in POST)

## Contracts delivered
- **GET /api/monthly-summary** → `{ window:{from,to}, sessions, xp, volumeKg, minutes, cardioMin, prsSet, activeDays, avgReadiness|null, avgReadinessPrev|null (additive extra), bestDay:{day,xp}|null, deltas:{sessions,xp,volumeKg,minutes,prsSet} }`. 30d window = [today−29, today], prior = [today−59, today−30]. **xp / bestDay / activeDays come from the XpEvent ledger (same rule as /api/chronicle — consistent numbers between the 7-day chronicle and 30-day digest); sessions/volume/minutes from cleared WorkoutSessions; cardioMin from cardio ExerciseLogs; prsSet from PersonalBest.updatedAt; avgReadiness = mean of per-day readinessScore (health.ts helpers, RHR deviation vs prior-7d baseline, metrics queried from prevFrom−7).** Verified live: `{sessions:9, xp:2943, volumeKg:15040, minutes:9, cardioMin:22, prsSet:4, activeDays:4, avgReadiness:77.7 ((85+70+78)/3 — Sep27 sleep7.5→+15=85, Sep28 70, Sep29 mood/energy4→+8=78), avgReadinessPrev:null, bestDay Sep26 +1792, deltas all =cur (prev all zero)}`.
- **GET /api/rest-day** now also returns `ward: { owned:true, charges } | null` (null when the hunter does not own the `ward-of-continuity` Streak Shield relic). POST response unchanged (byte-compatible) — client re-GETs after claim anyway.
- **POST /api/oracle/briefing** prompt: every pre-existing line byte-identical; STANZA 2 spec line gained one appended conditional clause ("When today's readiness score and a recommended program day appear in the data below, weave that recovery state and the recommended day into THE DAY AHEAD; if readiness is not logged, skip both and do not mention them."); after the RECOVERY DAY line a new block is appended: `READINESS & PROGRAM CONTEXT:` with (a) readiness score/band + non-zero drivers or "not logged (no vitals today)", (b) `Week compliance: done/planned planned sessions done`, (c) next program day line or allDone line (guarded parsePlanDays copied from /api/readiness; corrupt plan → line omitted). 110-word cap untouched. Verified: POST 200; with readiness null the LLM cleanly skipped mentioning it (negative path verified live; positive path follows same helpers as /api/readiness which R1-b verified at 85 PRIMED).
- **OracleTip mounts are LIVE** in all three tabs (`<OracleTip tab="status|records|directives" />` at the top of each tab's root div) — R2-b's oracle-tip.tsx existed on disk at final-check time (17:11, contract `import { OracleTip } from "./oracle-tip"`); E2E saw all three banners render.

## Deviations / decisions to know
1. Monthly xp/bestDay/activeDays use the XpEvent ledger (chronicle-consistent) rather than session-only sums — spec listed sessions+logs+PRs+BodyMetric queries; ledger added for honest total-XP semantics matching the sibling ChroniclePanel.
2. `avgReadinessPrev` added additively to the response (not in the spec's field list) so the AVG READINESS tile can render its delta chip when both windows have vitals.
3. Records sparkline + Δ chip render only when the matched progression entry has ≥2 trend points AND a nonzero e1RM (bodyweight/cardio e1RM series are all-zero — a flat zero line / "e1RM 0.0" chip conveys nothing). Bench press is the only record that qualifies today (trend 50.67→53.33, best 53.33 → emerald "e1RM 53.3 ▲").
4. Sparkline is `hidden sm:block` (mobile hides it, Δ chip stays visible) — verified 390px safe; Δ chip + records filter counts verified on mobile.
5. Directives countdown is `hidden sm:flex` (replaces the old static "RESETS AT MIDNIGHT" span which was also sm-only — byte-compatible mobile behavior, zero 390px risk). Ticks every 30_000ms with cleanup; target recomputed from `now` each tick so midnight rollover re-aims automatically; role="timer" + aria-label "Daily quests reset in {h} hours {m} minutes".
6. RELIC WARD chip path (hunter owns the relic) is code-verified only — KAEL owns no ward-of-continuity row and the task forbids creating test DB rows; ward:null → only the WEEKLY RECOVERY chip shows (verified live).
7. Dev server died mid-round (no process on :3000); restarted the single instance with setsid (not a second instance — nothing was listening). Note for others: servers on this box keep dying; check before blaming your code.
8. One DB mutation, via the feature's own API: POST /api/oracle/briefing upserted today's existing Briefing row (stale "streak 1d" text → fresh "2-day streak" text). No rows created or deleted.

## QA evidence (screenshots .qa/r2a-*)
- bunx tsc --noEmit → 0 errors in src/ (only pre-existing examples/+skills/).
- bunx eslint on all 7 owned files → exit 0.
- E2E (agent-browser): STATUS digest panel (4 tiles + NEW chips + MOST PROFITABLE DAY · SEP 26 · +1,792 XP + 4/30 ACTIVE DAYS progressbar with aria) · RECORDS filter chips ALL·4/STRENGTH·1/BODYWEIGHT·2/CARDIO·1 clickable + filtering verified (STRENGTH→bench only, CARDIO→run only) + bench row sparkline SVG (recharts-curve path present) + Δ chip + hover tooltip "SEP 26 / e1RM 50.7 KG" · DIRECTIVES timer aria "Daily quests reset in 6 hours 31 minutes" + "RESETS IN 06H 31M" · zero console errors throughout · 390×844 STATUS+RECORDS documentElement.scrollWidth === 390 (mobile Δ chip visible, sparkline display:none).
- curls: /api/monthly-summary 200 · /api/rest-day 200 (ward:null) · /api/oracle/briefing GET 200 + POST 200 · /api/oracle/tip?tab=status|records|directives 200 (R2-b).
