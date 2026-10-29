# R14-c — frontend-styling-expert · DAILY LISTS FLOW (Fuel + Goals)

Owned files: `src/components/fitness/fuel-tab.tsx`, `src/components/fitness/directives-tab.tsx`
Consumed (never edited): `src/components/system/motion.tsx` (FLOW_EASE, SPRING_BOUNCE, MeterFlow, useCountUp, FlowItem/FlowGroup/FlowReveal), `src/components/fitness/activity-rings.tsx` (Ring arc-sweep reference), `src/components/system/swipe-row.tsx` (gesture contract).

## What shipped

### Fuel tab
- **CalorieRing arc sweep**: the arm-on-mount + CSS `stroke-dashoffset` transition is GONE. Now `motion.circle` with `initial={{ strokeDashoffset: CIRC }}` → `animate={{ strokeDashoffset: CIRC * (1 - ratio) }}`, `transition={reduce ? { duration: 0 } : { duration: 0.9, ease: FLOW_EASE }}` — mirrors activity-rings' Ring exactly. Drop-shadow filter, −90° rotation, round linecap, track + calibration ticks preserved.
- **Remaining-kcal numeral**: `useCountUp(remaining, 0.9)` + `useCountUp(consumed, 0.9)` — numerals resolve in lockstep with the 0.9s arc sweep. OVER-state amber variant and sys-display/bloom classes untouched.
- **Macro bars**: fill div → `<MeterFlow pct={pct} duration={0.7} className="h-full rounded-full" style={{ backgroundColor, boxShadow }} />` (0.7s = old CSS pacing). sys-seg overlay + colors kept. The old `index` prop / armed state / `reduce` var were removed (dead after conversion — useCountUp + MeterFlow self-gate).
- **Water row**: NO CHANGE — the droplet gauge is the water progress display and already staggers (motion.span, scale 0.5→1, delay i*0.05, reduce-gated). Verified, documented.
- **Meal entry rows**: `<li>` → `<motion.li>` rising staggered, `delay: Math.min(i, 8) * 0.05`, 0.45s FLOW_EASE, `initial={reduce ? false : { opacity: 0, y: 10 }}`. Motion rides the EXISTING li (no new wrapper around SwipeRow; data-no-swipe semantics untouched; the sheet stays the gesture's transform owner). Transform-only → zero layout shift.

### Goals tab (directives)
- **Quest meter fills** (daily rows only): inner div → `<MeterFlow pct={...} className={cn("h-full", gradient)} />` (0.8s default). Emerald-complete / violet-active gradients + `sys-seg sys-seg-sm` overlay preserved verbatim. Milestone meters intentionally NOT converted (out of stated scope; R12-c blade territory adjacent).
- **Claim-moment bloom**: `prevCompleted: Map<string, boolean>` + `rowSurfaces: Map<string, HTMLDivElement>` at tab level (usePrevious-style, keyed by quest id — rows stay inline, no component extraction). Effect on `[data, reduceMotion]` diffs completions per refresh and fires `animate(el, { scale: [1, 1.015, 1] }, { duration: 0.45, ease: FLOW_EASE })` on the row's surface div — ONLY on live incomplete→complete (prev === undefined → skip; un-complete → skip; reduceMotion → skip). Stale ids pruned (reroll / midnight). Pulse composes with, never touches, SwipeRow's sheet transform.
- **Failed rows**: static divs → `motion.div` standard rise (y:10→0, 0.45s FLOW_EASE, delay Math.min(i,8)*0.05, reduce-gated).
- **Reward chips**: new `RewardChip` component — `motion.span` scale 0.8→1 with `SPRING_BOUNCE`, reduced motion → identical static span. Used for XP / stat / point chips in `rewardChips` (both daily + milestone call sites). Chips are flex items so transform applies. Pops only on genuine mounts (stable keys across refreshes).

## Validation
- `bunx tsc --noEmit` → only the 4 documented pre-existing `examples/` + `skills/` errors; **zero src/ errors** (verified via `rg "^src/"` on full output → no matches).
- `bunx eslint src/components/fitness/directives-tab.tsx src/components/fitness/fuel-tab.tsx` → exit 0.
- Dev-server smoke: `GET /` → 200. No browser QA, no DB mutation, no build (per mandate).
- `git diff` confined to exactly the 2 owned files.

## Notes for the next agent
- The bash tool's output pipeline eats `[m`-style bracket sequences (displays `consumed[m.key]` as `consumed.key]`) — verify bracket-bearing lines with the Grep tool, not sed/git-diff output.
- MultiEdit is NOT always atomic in this environment (a failed edit left earlier edits applied) — always re-read the file after any partial-failure report.
- The claim pulse is best verified via MARK VERIFIED on a hydrate/sleep goal: row breathes once + meter sweeps to 100% + spine/emerald shadow swap, no pulse on remounts.
- Rows completing while the tab is unmounted mount already-complete on return → no pulse, by design (spec: never on mount).
