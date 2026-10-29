# Task 13-c — full-stack-developer — Activity Rings + Body Metrics

## Task
Round 13, Task 13-c: Google-Fit-style daily activity rings (MOVE / EST. ACTIVE BURN / HYDRATION) for the PRIME Status dashboard + a full body-metrics module (weight trend, BMI gauge, tape measurements, sleep log) as the 4th METRICS view of the Body tab. Backend was already done by Task 13-a (`/api/nutrition` + `/api/metrics` + `src/lib/nutrition.ts`).

## Files touched (strict ownership honored)
- `src/components/fitness/activity-rings.tsx` — OVERWRITTEN (placeholder → ~260 lines). Exports `ActivityRingsPanel({ hunter })`.
- `src/components/fitness/body-metrics.tsx` — OVERWRITTEN (placeholder → ~640 lines). Exports `BodyMetrics({ hunter })`.
- `src/components/fitness/status-tab.tsx` — +3 lines only (import + `<ActivityRingsPanel hunter={hunter} />` inserted after `<HunterCard />`, before the share/vault grid).
- `src/components/fitness/body-atlas-tab.tsx` — +10 lines only (lucide `Activity` import, `import { BodyMetrics }`, `"metrics"` in `AtlasViewMode`, 4th Chip, conditional render using the existing `_hunter` prop).
- `worklog.md` — appended the 13-c record (this session).

No other files were edited (verified via `git diff` — remaining working-tree changes belong to Tasks 12/13-a).

## Key contracts consumed
- GET `/api/nutrition` → `{ waterMl, targets: { waterMl } }` (rings panel; graceful fallback target `hydrateGoalMl(DEFAULT_PROFILE.weightKg)` = 2450 ml on fetch failure).
- POST `/api/nutrition` `{ action: "log-water", ml }` → `{ waterMl, questCompleted?, xpGranted? }` (water quick-log; xp → xp notice, quest → info notice + `speak("Hydration goal complete.")`).
- GET `/api/sessions` → `{ history: SessionDTO[] }` (today's `status === "cleared"` sessions → MOVE = Σ durationMin / 60; BURN = Σ(durationMin × 5.5 + volumeKg × 0.02) / 300).
- GET `/api/metrics` → `{ profile(+isDefault), latest (incl. derived "bmi"), bmiCategory, series }`.
- POST `/api/metrics` `{ type, value }` → `{ metric, questCompleted? }` (sleep ≥ 7 h auto-completes the daily-sleep goal → info notice "SLEEP GOAL COMPLETE").

## Implementation notes for future agents
- Ring animation: `motion.circle` with `strokeDasharray = 2πr` + framer-motion `animate` on `strokeDashoffset` (800 ms ease-out; 0 with `useReducedMotion`); ≥100% renders a full circle with a `drop-shadow` glow via inline `style.filter`. Rings paint inner→outer so outer glows layer correctly.
- Today filter: `dayKey(new Date(s.startedAt)) === dayKey()` (client-local interpretation, consistent with the server's dayKey-based quest logic).
- BMI gauge geometry: viewBox 240×140, center (120,122), r=92, stroke 13, arc spans BMI 14–40 over 180° (`bmiAngle` + `polar` helpers in body-metrics.tsx); zones rose-400 / emerald-400 / amber-500 / rose-500 with 0.9° gaps; marker dot + center number/category as SVG `<text>` (Tailwind `fill-*`/`text-[30px]`/`tracking-*` classes work on SVG text).
- Client-side validation mirrors the server's `METRIC_RANGES` messages (weight 25–300, cm metrics 20–250, sleep 0–16) → `pushNotice({kind:"warn", title:"LOG FAILED"})`; success → silent `reload()` + `bumpRefresh()`.
- recharts conventions copied from records-tab.tsx: dark `sys-panel` tooltip, `#71717a` 9px mono ticks, `formatDayLabel` X formatter, violet `#a78bfa` strokes.
- `hunter` props are accepted per spec but unused (`{ hunter: _hunter }` pattern, same as `BodyAtlasTab`).

## Verification
- `bunx tsc --noEmit` → 0 errors in `src/` (only pre-existing `examples/` + `skills/` errors).
- `bun run lint` → exit 0, zero warnings.
- Dev server (already running, port 3000, hot reload — NOT restarted, no build): `dev.log` shows clean `✓ Compiled` runs and `/api/nutrition`, `/api/sessions`, `/api/metrics` all 200 after the edits. (A lone historical `findMany` TypeError deep in the log is 13-a's pre-fix stale-prisma artifact — all later requests are 200.)
- No agent-browser, no z-ai-web-dev-sdk, no test files (per instructions — parent runs E2E QA).
