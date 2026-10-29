# R14-a · frontend-styling-expert — Tab transition + Nav motion layer

Owned files touched (ONLY these two): `src/app/page.tsx`, `src/components/fitness/nav.tsx`.
Consumed read-only from `src/components/system/motion.tsx`: `FLOW_EASE`, `SPRING_SNAPPY`, `useCountUp`.

## 1. Overlapping tab crossfade (page.tsx)

- `AnimatePresence mode="wait"` → **`mode="popLayout"`**, `custom={tabDirection}` kept.
- Variants retuned:
  - `enter`: `{ opacity: 0, x: dir*72, scale: 0.985 }` (identity x/scale under reduce or dir===0)
  - `center`: `{ opacity: 1, x: 0, scale: 1, transition: { duration: 0.32, ease: FLOW_EASE } }`
  - `exit`: `{ opacity: 0, x: dir*-48, scale: 0.99, transition: { duration: 0.2, ease: FLOW_EASE } }`
  - The div-level `transition` prop was dropped — both variant targets now carry their own transitions (enter duration comes from `center`, exit from `exit`).
- Incoming region keeps `style={{ zIndex: 1 }}` → layers above the outgoing (verified in framer-motion 12.26.2 `AnimatePresence/index.mjs`: the exiting child is spliced BEFORE the present child, so equal z-index + later DOM = incoming on top).
- **popLayout width preservation (verified, not assumed)**: `PopChild.mjs` snapshots `offsetWidth/offsetHeight/offsetTop/offsetLeft` in `getSnapshotBeforeUpdate` and injects `[data-motion-pop-id] { position:absolute; width/height/top/left !important }` — the popped region is pinned to its exact measured box. No `width:"100%"` needed (it would be overridden by the !important rule anyway); no `layout` prop needed.
- **Overflow choice: `overflow-x-clip` on the `<div className="relative">` wrapper.**
  - Why: enter x ±72 and the popped exit translate bleed up to ~56px past the viewport edge (wrapper inset 16px by main's px-4) → horizontal scrollbar flash risk while both regions coexist.
  - Why `clip` and not `hidden`: `overflow-x:hidden` computes `overflow-y:auto` → the wrapper becomes a vertical scroll container (gutter risk when the popped region's pinned height exceeds the shorter incoming tab's height). `clip` leaves overflow-y visible — no scroll container on either axis.
  - Drag safety (reasoned against swipe-flow.tsx): the drag translates the SHEET (parent of this wrapper) — wrapper + contents translate as one unit, so the clip plane rides along and nothing internal is ever clipped by the drag; ghost silhouettes / edge glows / edge buttons live OUTSIDE the sheet; `guardedByScroller` only honors `overflowX auto|scroll` → `clip` never steals a tab gesture.
  - Tailwind 4 utility emission verified against the live dev-server CSS chunk (`overflow-x: clip` present).

## 2. Two-layer directional light sweep (page.tsx)

- Container unchanged (keyed `${tab}-sweep`, `!reduce && tabDirection !== 0` gate, `absolute inset-y-0 left-0 z-20 w-full overflow-hidden`).
- **Soft body**: existing `w-1/3` via-violet-400/10 gradient, identical ±330% x-keyframes + `opacity:[0.9,0]`, but `transition delay: 0.06`.
- **Leading edge** (new): `w-[10%]` via-violet-300/25 gradient, `x ±1000%` of own width (= exactly one container width — fully clear of the container at both ends), `opacity:[1,0]`, undelayed → leads the body by ~0.06s in the travel direction.
- Both bands re-anchored `absolute inset-y-0 left-0` — REQUIRED: they were in-flow children; a second in-flow `h-full` band would stack below the first (block layout) and be clipped invisible.
- Direction-awareness is inherited from the tabDirection sign mirroring; time-stagger is direction-symmetric (edge leads whether traveling L→R or R→L).
- Deviation note: implemented the lead as the time-stagger (body delayed) rather than initial-x head-start — perfect direction symmetry and both bands start fully outside the overflow-hidden container (no t=0 edge sliver pop).

## 3. TopNav / BottomNav flow (nav.tsx)

- Count-ups: `useCountUp(hunter.xp)`, `useCountUp(hunter.xpNeeded)`, `useCountUp(hunter.essence)`; XP renders `{Math.round(xpShown)}/{Math.round(xpNeededShown)} XP`, essence renders `{Math.round(essenceShown).toLocaleString()}`. `tabular-nums` kept. Reduce → instant final value (primitive handles). `LV.{level}` and `⛓ {streak}D` left static per brief.
- Indicators: `topnav-indicator` + `bottomnav-indicator` transitions → `SPRING_SNAPPY` (was 0.35s FLOW_EASE). layoutId still `undefined` under reduce.
- Boot choreography (mount-only `initial=`, never re-runs — navs persist across tab changes):
  - Desktop tab buttons (8): `initial={{opacity:0,y:-6}}` → settle, FLOW_EASE 0.4s, `delay: 0.05 + i*0.03`.
  - TopNav header contents join the wave: brand `delay 0.05` (wave head), mini-status cluster `delay 0.05 + TABS.length*0.03 = 0.29` (wave tail; includes voice/settings buttons).
  - BottomNav buttons (8): rise from `y: 8`, `delay: 0.08 + i*0.03`, same 0.4s FLOW_EASE.
  - All reduce-gated to `undefined` (no stagger). Transform/opacity only → zero layout shift; 44px targets untouched.

## Validation

- `bunx tsc --noEmit` → only the 4 documented pre-existing errors (examples/ + skills/), ZERO in src/.
- `bunx eslint src/app/page.tsx src/components/fitness/nav.tsx` → exit 0.
- `git diff` confined to the 2 owned files (other modified files in tree = parallel R14 agents' pre-existing work; baseline git status captured before editing).
- Dev server recompiled clean (`✓ Compiled`, `GET / 200`); no browser QA, no DB touches, no `bun run build` per rules.

## E2E watch-items for orchestrator

1. Rapid tab hammering at 390px + 1280px — confirm no horizontal scrollbar flash (wrapper `overflow-x-clip` should hold).
2. Tall→short tab switch: popped outgoing region keeps pinned height for 0.2s, may paint briefly below the wrapper (overflow-y visible BY DESIGN — lesser evil vs gutter); fades under the incoming layer.
3. popLayout + smooth scroll-to-top compose naturally (pinned top is wrapper-relative).
4. Boot stagger fires once after boot screen → verify no re-run on tab changes; reduce-motion should show zero stagger and instant numerals.
