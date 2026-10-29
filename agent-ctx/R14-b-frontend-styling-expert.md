# R14-b · frontend-styling-expert — STATUS hero flow layer

Task: "the whole flow more animated and flowy" for the app's home screen — XPBar rail sweep, hunter-card entrance bloom, stat-grid per-tile flow + spring interactions.

## Owned files (all three edited; nothing else touched)
- `src/components/system/xp-bar.tsx`
- `src/components/fitness/hunter-card.tsx`
- `src/components/fitness/stat-grid.tsx`

Consumed (READ-only): `src/components/system/motion.tsx` — `MeterFlow` (new this round), `useCountUp`, `DecodeText`, `FLOW_EASE`, `SPRING_BOUNCE`, `SPRING_SNAPPY`.

## Key context facts established before coding
- `page.tsx` renders tabs conditionally (`{tab === "status" && <StatusTab/>}`) → STATUS content REMOUNTS on every tab entry → every mount animation replays per visit (this is what makes MeterFlow's 0%→pct sweep "mirror the activity-ring arc").
- XPBar's sole consumer is hunter-card (grep-verified) — MeterFlow conversion has no blast radius.
- No `MotionConfig reducedMotion` anywhere → every gesture/inline motion must gate on `useReducedMotion()` itself (app convention: `whileTap={reduce ? undefined : …}` in nav/ascension-card).
- HunterCard's name was a plain `h1`, decoded nowhere else on the card (share-card renders the name via canvas, not DecodeText).

## Deltas

### xp-bar.tsx
- Fill div → `<MeterFlow pct={pct}>`: gradient (violet-700→violet-500→fuchsia-500), `xp-shine`, both R11 hairlines (forwarded as children via MeterFlow's rest spread), `0_0_16px_rgba(139,92,246,0.55)` glow — ALL kept; old `transition-[width] duration-700 ease-out` + inline `style={{width}}` dropped (MeterFlow owns the 0%→pct 0.8s FLOW_EASE sweep + update glides).
- `%` label: `useCountUp(pct)` + `Math.round` on render → numeral resolves in the same 0.8s envelope as the rail.
- `role="progressbar"` / aria-valuenow/min/max byte-for-byte; `sys-seg` overlay untouched.

### hunter-card.tsx
- **Entrance bloom**: p-5 body gained `relative` (verified NO abs-positioned descendant re-anchors — spine span and XPBar each own nearer relative parents); last-child overlay `absolute inset-0 z-10 overflow-hidden pointer-events-none aria-hidden` with a `w-1/4` band `from-transparent via-[rgba(196,181,253,0.18)] to-transparent` flying `x: "-100%" → "400%"` (band-width units = full traverse) over 0.7s on FLOW_EASE; unmounts via `onAnimationComplete → setSweepDone(true)`. Peak opacity = via-stop 0.18 (violet-300 = 196,181,253 — family value precedented in gates-tab stroke / daily-briefing pupil). Never renders under reduced motion.
- **Rank emblem**: lg RankBadge wrapped in `motion.div` — `initial {scale: 0.6, opacity: 0}` → 1 on `SPRING_BOUNCE` (stiffness 480/damping 24/mass 0.9, ~0.5s settle), delay 0.15s. reduce → plain badge.
- **Name**: h1 → `DecodeText as="h1" delay={0.1}` with identical classes (`min-w-0 truncate font-mono text-2xl font-black tracking-[0.12em] text-violet-50 sm:text-3xl`) → zero layout delta; decrypt length is char-for-char constant so `truncate` never reflows.

### stat-grid.tsx
- `StatValue`: added `useCountUp(value)`, renders `Math.round(shown)` — mount-from-zero roll + glide on allocation refresh; composes with the pre-existing Web-Animations scale/glow pulse (value roll + pulse ≠ double).
- Tile bars: static width fill → `<MeterFlow pct={pct}>` (def.bar/def.glow + sys-seg-sm skin kept). No per-tile stagger — FlowItem already staggers tiles.
- Allocate buttons: `whileTap={reduce ? undefined : { scale: 0.96, transition: SPRING_SNAPPY }}`; added invisible hit-slop `relative after:absolute after:-inset-[10px] after:content-['']` (24px glyph + 10px/side = **44px target**, zero visual/layout delta; slop only overlays non-interactive zones, button pitch ~52px → no slop collisions); scoped `transition-all` → `transition-[color,background-color,border-color,box-shadow,opacity]` so CSS no longer tweens framer's per-frame transform (every property `all` actually animated here is preserved); focus-visible outline/disabled/aria untouched.
- FREE badge: `motion.span key={popKey}` replaying `scale 0.6→1` on SPRING_BOUNCE; popKey bumps ONLY on statPoints INCREASE (level-up grant — spend just updates the numeral); one-shot per grant, never loops; reduce → `initial={false}`.

## Validation
- `bunx tsc --noEmit`: **zero `src/` errors**; only the 4 documented pre-existing examples/+skills/ errors. (One transient `fuel-tab.tsx TS2304 'offset'` appeared during a mid-edit run — parallel R14-c agent's in-flight save, gone on re-run, not my file.)
- `bunx eslint` on all three touched files → exit 0.
- `git diff --stat`: exactly my 3 files (hunter-card +56, stat-grid +53, xp-bar +19). No browser QA, no DB mutation, no build.

## Reduced-motion audit (every new animation)
| Animation | Gate |
|---|---|
| XPBar MeterFlow sweep / label count-up | self-gated in kit |
| Stat tile MeterFlow + StatValue count-up | self-gated in kit |
| HunterCard light sweep | `!reduce && !sweepDone` — never rendered |
| Rank emblem spring | reduce → plain RankBadge |
| Name DecodeText | self-gated in kit |
| Allocate whileTap spring | `reduce ? undefined` |
| FREE badge pop | `initial={false}` under reduce |

## Deviations / judgment calls (flagged for orchestrator E2E)
1. `transition-all` → scoped property list on allocate buttons: necessary or the CSS transition eats the spring; visually identical hover/disabled behavior.
2. "keep 44px targets" — buttons were actually 24px; fixed via invisible ::after slop rather than resizing (zero layout shift).
3. FREE badge pops on grant (increase) only, not on spend — per spec wording.
4. Bloom sweep covers the card body (p-5 region), not the SystemPanel's thin header strip — a children-provided overlay cannot cross the panel header; imperceptible at 0.18 peak alpha.
5. Badge spring delay is 0.15s from card-content mount (spec's number) — the FlowItem rise (0.45s) still overlaps slightly; reads as the emblem blooming as the card lands.
