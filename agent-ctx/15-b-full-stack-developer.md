# Task 15-b — ANALYSIS section (Progress/Records tab)

## What was built
New `src/components/fitness/analysis-panel.tsx` (only new file) + 2-line mount in `src/components/fitness/records-tab.tsx` (after `<ChroniclePanel />`). Five real-science meter panels driven by `GET /api/insights` (InsightsDTO) + `GET /api/body` (BodyDTO):

1. **STRENGTH STANDARDS (hero)** — mono 73/100 + ADVANCED level chip + 2/8 LIFTS RATED; shared 5-segment legend (zinc-700→violet-500→fuchsia-500→amber-500→emerald-400); per-lift equal-fifth band gauges with glowing marker at `progressPct`, active-level segment highlighted, under-segment standard-value ticks (+KG/REPS); unmatched lifts dim (NOT LOGGED · FIRST LOG SETS YOUR BASELINE); null-score EmptyGlyph state; footnotes `E1RM = W × (1 + REPS/30) EPLEY · BODYWEIGHT 77.5 KG · MALE SCALE`.
2. **WEEKLY VOLUME LOAD** — 13 muscle meters (sorted weeklySets desc, scroll-sys max-h-96, 2-col sm+), track 0..max×1.25, emerald [min,max] zone, violet primary fill, hatched 60% secondary extension labeled +Ns, UNTRAINED/UNDER/OPTIMAL/OVER chips, all-zero empty state.
3. **STRUCTURAL BALANCE** — Push:Pull ratio meter (0..2, window 0.8–1.25 emerald, 2dp readout, ticks, PUSH-HEAVY chip + hint) + PUSH/PULL/LOWER/CORE tiles + Upper:Lower meter (0..3, window 0.8–1.8).
4. **ENERGY BALANCE** — Recharts 7-day intake BarChart (violet, null days skipped, amber dashed TARGET 2720 ReferenceLine, hidden YAxis domain max(target×1.18, dataMax×1.08) so line always visible, formatDayLabel axis, custom tooltip); AVG INTAKE / TDEE / WEEKLY BALANCE (surplus violet / deficit teal) / WEIGHT TREND (TrendingUp/Down/Minus, null→LOG MORE WEIGH-INS) tiles; status chip; `logged7Days < 4` amber advisory.
5. **RECOVERY ROW** — SLEEP DEBT (avg-vs-target bar meter + amber target line, "0.5 H BANKED DEBT", rating chip, consistency label, mini 7-night BarChart w/ weekday initials) + PROTEIN (0..125% meter w/ 100% target line, TODAY 0/140 G, TARGET 1.8 G/KG, 7D AVG) — md:grid-cols-2, stacked mobile.

## Key implementation notes
- `useApi<InsightsDTO>("/api/insights")` + `useApi<BodyDTO>("/api/body")` (body fetch independent → own skeleton/error); error panels have RETRY (min-h-11) wired to `reload`.
- Every gauge: `role="meter"` + aria-valuemin/max/now + aria-valuetext + descriptive aria-label; charts `role="img"` + aria-label.
- Reused SystemPanel / SkeletonPanel / EmptyGlyph; sys-label micro-labels; font-mono tabular-nums; violet/fuchsia primary + teal/amber/emerald/rose secondary (no blue/indigo); framer-motion entrances honoring useReducedMotion.
- Recharts gotcha fixed: ReferenceLine above dataMax is clipped unless YAxis domain raised → hidden YAxis with computed yMax.
- progressPct is linear over the ratio floor→ceiling while segments are ordinal fifths — highlighted active segment + white linear marker resolves the visual ambiguity (VLM-verified fix).

## Verification
- `bunx tsc --noEmit` → 0 errors in src/ (transient body-metrics duplicates were a concurrent agent's mid-edit state).
- `bun run lint` → exit 0. Both endpoints 200 (JSON inspected).
- agent-browser a11y snapshot: all 6 panels + every meter rendered with correct live values; 390×844 `scrollWidth == 390` (no horizontal overflow); zero page/console errors; bounding-box check: no clipped labels (right 357 < panel right 374).
- VLM QA on strength + balance/energy screenshots: applied active-segment highlight + micro-label contrast bumps.
- Dev server died mid-QA (EADDRINUSE contention with concurrent agent) → restarted once with nohup (Task-13 precedent); stable, all 200s.
