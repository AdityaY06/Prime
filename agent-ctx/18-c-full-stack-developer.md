# Task 18-c — Program usage achievements (5 new titles)

Files owned: `src/lib/titles.ts`, `src/lib/engine.ts`, `src/app/api/program/route.ts`

## What was added

1. **titles.ts** — new section "Program usage titles (forging + following training protocols)" appended after the boss slayer block: `program-architect` (common), `program-followed-10` (rare), `program-followed-50` (epic), `program-perfect-week` (rare), `program-multi-forge` (common). Catalog 53 → 58 entries. UI renders automatically (titles-tab maps over /api/achievements titles).

2. **engine.ts checkAchievements** (additive, after the bossKills block, before toUnlock):
   - `Promise.all` → `db.program.count({hunterId})`, `db.workoutSession.count({hunterId, status:"cleared", programDay:{not:null}})`, active program findFirst (latest by createdAt, `select:{days}`).
   - ≥1 → program-architect · ≥5 → program-multi-forge · ≥10 → program-followed-10 · ≥50 → program-followed-50.
   - Perfect week: if active program days ≥ 2 → findMany this week's program-linked cleared sessions (`startedAt: { gte: new Date(\`${weekStartKey()}T00:00:00\`) } }` — exact local-midnight idiom from /api/readiness route), distinct programDays ≥ days → program-perfect-week.
   - Prisma `programDay: { not: null }` — nullable Int filter, Prisma 6 documented syntax (no prior use in src/; verified at runtime).

3. **program/route.ts POST** — after programOut validation, `titlesUnlocked` computed via `checkAchievements(hunter.id)` wrapped in try/catch (logs "POST /api/program — title check", never fails the forge); spread into the 201 JSON only when non-empty. Import line extended with checkAchievements.

## QA

- `bunx tsc --noEmit` → 0 src/ errors (only pre-existing examples/+skills/).
- `bunx eslint` on the 3 files → exit 0.
- POST /api/program (valid forge) → 201, `titlesUnlocked: ["program-architect"]` on the FIRST post-change forge (achievement row created at 08:22:48Z matching the POST; second POST correctly omitted the field — owned-dedupe works). XP ledger dedupe held (already granted today) → `xpGranted` absent.
- Negative POSTs: bogus goal → 400, days 9 → 400 (validation untouched).
- GET /api/achievements (recompute-on-read sync): 58 titles; after restoring FORGE FRAME as the only program → architect UNLOCKED, followed-10/50, perfect-week, multi-forge LOCKED (3 program-linked cleared sessions, distinct days this week = 1 < 3).
- Synthetic positive test: 7 temp cleared sessions (fake `qa-t18c-gate` gateId → unknown to GATE_TITLES so no mastery codes leak) with programDays {1,2,3} → GET /api/achievements unlocked program-followed-10 (10 total) + program-perfect-week (distinct 3 ≥ days 3); followed-50/multi-forge stayed locked. Cleanup: 7 sessions + 2 synthetic achievement rows deleted → final GET shows exactly architect unlocked (legit) and the other 4 locked.
- DB restored: programs = [FORGE FRAME active], qa sessions = 0, cleared total = 12, achievements = pre-existing 9 + program-architect.
- E2E (agent-browser t18c, 1280×800): REWARDS → BADGES → all 5 new cards render: Protocol Architect UNLOCKED with FEATURE button; Protocol Devotee (RARE) / Iron Strategist (EPIC) / Perfect Week (RARE) / Master Forger (COMMON) LOCKED with epithet + desc. 0 page errors, 0 console errors. Mobile 390×844 scrollWidth = 390 (no overflow). Screenshots: `t18c-badges-new-titles.png`, `t18c-badges-mobile.png` in project root.

## Notes for other agents

- `weekStartKey()` is declared textually AFTER checkAchievements in engine.ts but is a hoisted function declaration — safe (verified).
- Perfect-week counts DISTINCT programDay values this week vs active program `days`; sessions from a retired higher-day program can legitimately satisfy a lower-day active program (spec: distinct ≥ N).
- Titles unlock permanently once written to db.achievement; only the *condition* is recomputed on each sync.
