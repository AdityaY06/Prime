# Task 17-c — Readiness gate banner + weekly compliance strip

Agent: full-stack-developer
Files owned: src/app/api/readiness/route.ts (NEW), src/components/fitness/readiness-banner.tsx (NEW), src/components/fitness/week-compliance.tsx (NEW), src/components/fitness/gates-tab.tsx (+2-line mount)

## What was built

1. **src/app/api/readiness/route.ts** — GET (force-dynamic, requireHunter):
   - Promise.all: BodyMetric rows for [restingHr, hrv, sleep, stress, mood, energy] + workoutSession.count (status "cleared", startedAt ≥ Monday 00:00 local via engine.weekStartKey) + active program days
   - `latestPerType` (day then updatedAt — mirrors oracle route / GET /api/metrics) supplies sleep/stress/mood/energy; `trendVsBaseline` (prior `slice(-8,-1)`, ≥3 prior distinct days, 1-decimal mean/deviation — oracle math) supplies rhrDeviation + hrvBaselineDev
   - Calls health.ts `readiness()` → honest null when honestNoData (no fake 70); health.ts `rhrTrend({recent, baseline})` → null iff restingHr never logged (pending object when rows exist but baseline < 3 prior days)
   - Response: `{ readiness: Readiness|null, rhrTrend: RhrTrend|null, week: { planned: number|null, done: number, goalDays: number|null } }` — planned = active program days (null when retired), done = ALL cleared sessions this week (program or free), goalDays mirrors planned (future use)
   - Errors: NO_HUNTER → 404 NOT_AWAKENED; console.error + 500 INTERNAL otherwise

2. **src/components/fitness/readiness-banner.tsx** ("use client", own useApi("/api/readiness")):
   - null while loading / on fetch error (no flash); both null → one quiet zinc-600 line "LOG VITALS TO UNLOCK READINESS INTELLIGENCE · VITALS TAB"
   - Main banner ≥44px (measured 58-62): pulse dot (BACK OFF) + Activity icon + "READINESS" eyebrow + band label (PRIMED emerald-400 / READY teal-300 / MODERATE amber-400 / BACK OFF rose-400) + score tabular-nums "96/100"; right = message (truncate on mobile) + tiny citation; per-band border + glow; framer-motion slide-in (reduced-motion aware); role=status + full aria-label
   - BACK OFF → rose border + sys-pulse dot + "SYSTEM ADVISORY: RECOVERY PRIORITY — consider the Rest Day protocol or technique work" (+ appends rhrTrend.title when tone "warn"); PRIMED → emerald border + "GREEN LIGHT — ATTACK TODAY'S SESSION"; else recommendation
   - Fallback RhrTrendBanner when readiness null but RHR history exists (tone-colored teal/amber/rose, warn pulse)

3. **src/components/fitness/week-compliance.tsx** ("use client", own useApi("/api/readiness") — spec-blessed):
   - Violet mono strip: "THIS WEEK · 2/3 SESSIONS CLEARED" + segmented diamonds (planned count, violet filled = min(done, planned), emerald surplus + "+N", Flame + amber "AHEAD OF PLAN" chip when done > planned)
   - No program → "THIS WEEK · N SESSIONS CLEARED" plain; done 0 → quiet "NO SESSIONS CLEARED THIS WEEK — START DAY 1" (+ empty pips when planned); role=status with count aria

4. **gates-tab.tsx** — import + `<ReadinessBanner />` + `<WeekCompliance />` directly above `<ProgramPanel />` in the no-active-session return. Byte-minimal diff (git-verified).

## QA
- `bunx tsc --noEmit` → 0 src/ errors; `bunx eslint` on 4 files → exit 0
- Live curl: readiness 96/100 PRIMED (hand-verified 70+10+8−2+5+5; drivers SLEEP 7.5H/RHR −3.2/STRESS 3/MOOD 4/ENERGY 4, HRV honestly absent — 2 prior days only); week 2/3 matching a direct Prisma count since Monday 2026-09-28 + active FORGE FRAME days=3
- agent-browser: banner above program panel w/ emerald border + full aria; Vitals tab DAILY READINESS gauge cross-check matches ("Readiness 96 of 100 — PRIMED"); mocked (network-route, non-destructive) BACK OFF / AHEAD-OF-PLAN 5/3 "+2" emerald dots / empty / pending-fallback states all render correctly; active-session state → banner correctly absent; mobile 390×844 scrollWidth===390 zero overflow; 0 page errors; screenshots /tmp/t17c-final-desktop.png + t17c-final-mobile.png

## Deviations / notes for next agents
- Strip copy says "SESSIONS CLEARED" not the spec's literal "RAIDS CLEARED" — Task 12's terminology sweep removed "raid" from all user-visible copy; spec's "raid" read as orchestrator shorthand (documented in worklog)
- rhrTrend is the honest pending object (not null) when RHR rows exist but the ≥3-prior baseline isn't met — surfaces via the fallback banner
- `/api/readiness` is cheap and read-only; both Gates components fetch it independently and silently refetch on the global refreshKey (bumpRefresh after a session clear updates the strip)
- Dev server was OOM-killed twice mid-QA by parallel-agent compile churn (known pattern) — system auto-recovered in ~30-70s; no restart/build issued by this agent
- Parallel agents in this round touched: sessions route, session-raid, exercise-dialog, program-panel, records-tab, engine.ts, types.ts, schema (programDay), progression module — all outside 17-c ownership
