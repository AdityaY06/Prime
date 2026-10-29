# R3-c — Tab-aware Oracle chat + briefing replay polish + aria audit

Task ID: R3-c · Agent: full-stack-developer · Status: COMPLETE (2026-09-30)

## What landed

### 1. Tab-aware Oracle chat (candidate ④)
- **`src/app/api/oracle/route.ts`** (additive): optional `tab` body param validated against the 8 known ids; unknown/absent → no view context (backward compatible). New `ACTIVE VIEW` prompt block with live per-tab facts (~2-4 lines, honest null-safe):
  - status → level/rank/streak/unspent/credits snapshot
  - directives → unclaimed count + claimable XP (reuses fetched dailies)
  - gates → active session + exercise count (one `findFirst` + `_count`) + readiness band (reuses vitalRows)
  - body → latest weight + MetricGoal progress (2 cheap queries)
  - fuel → today's kcal/P/C/F/water vs `calcTargets(hunterProfile(hunter))` (inline day-total queries)
  - vitals → readiness band + RHR trend + 7d sleep avg (health.ts pure fns, shared via refactored `vitalsFacts()`)
  - records → top-3 PRs by updatedAt + best strength e1RM (Epley from context JSON) with honest trend phrasing
  - forge → essence + achievements + titles-earned counts
- **`src/components/fitness/oracle-console.tsx`**: `tab?: string` prop ("titles"→"forge"); POST body carries tab; per-view chip map (3 chips × 8 views, generic fallback); welcome line `◈ THE EYE RESTS ON THE {VIEW} ◈`; each console owns its thread (view change re-seats welcome so chips stay reachable); FAB `aria-expanded` + `aria-haspopup="dialog"`; dialog `aria-modal`.
- **`src/app/page.tsx`** (additive): passes `tab={tab}`; tab wrapper gains `role="region"` + `aria-label="{TAB} view"`.

### 2. Briefing replay speaking state (candidate ⑦)
- **`daily-briefing.tsx`**: two-state replay control — idle → SPEAKING (amber styling, 4-bar voice-eq, "SPEAKING…" label, motion-safe pulse ring, aria-pressed + live announcement). Hybrid state model: store's real `speaking` completion signal when observed, else timed words/2.5s clamp 4-20s. Second click = visual-only stop (audio never cancelled). Zero logic change to auto-divine flow.

### 3. Aria landmarks (candidate ⑧, scoped)
- `nav.tsx`: audit only — `aria-current="page"` was ALREADY correct on active tabs (both navs). No changes made.
- Single `<main>` confirmed (page.tsx); no duplicate introduced.

## QA evidence
- `bunx tsc --noEmit` → 0 src errors · `bunx eslint` (5 files) → exit 0
- E2E (agent-browser r3c-e2e): fuel welcome + chips → LLM reply cites live macros ("Targets: 2720 kcal, 140g protein, 371g carbs, 76g fat"); vitals reopen → different chips; briefing SPEAKING state screenshot + real-clip resolution (POST /api/tts 200); DOM audit (1 main, region labels move, aria-current moves); 390×844 exact fit; zero console/page errors
- DB: zero writes from my QA (SQLite-audited: 0 food/water/goals today, bench PB 40kg intact)

## Notes for other agents
- dev.log has 3 POST /api/nutrition 500s + 2 stray XpEvents (+10 forge 16:28, +5 first-meal 17:38; totalXp 2943) from PARALLEL R3-a/R3-b windows — orchestrator cleanup pending, do not attribute to R3-c.
- Dev server OOM-died once mid-audit; respawned via documented detached-spawn (6th occurrence).
- One upstream LLM 429 during rapid 8-tab curl smoke (route handled with designed friendly error; recovered).

## Screenshots
`/home/z/my-project/screenshots/`: r3c-oracle-fuel-reply · r3c-oracle-vitals-chips · r3c-briefing-speaking · r3c-final-status-briefing · r3c-mobile-briefing · r3c-mobile-oracle-fuel
