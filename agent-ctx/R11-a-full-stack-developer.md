# R11-a — SwipeRow adoption: rose tone + fuel meal swipe-to-delete + milestone swipe-to-claim

Task ID: R11-a · Agent: full-stack-developer · Round: R11 (Adoption & Finish)

Owned files (touched nothing else): `src/components/system/swipe-row.tsx`, `src/components/fitness/fuel-tab.tsx`, `src/components/fitness/directives-tab.tsx`

## What changed

### 1. swipe-row.tsx — `rose` destructive tone (+9/−4)
- `SwipeRowAction["tone"]` union: `"emerald" | "violet"` → `"emerald" | "violet" | "rose"`; all three tone maps extended: TONE_RAIL `rgba(251,113,133,.85)` (rose-400), TONE_TEXT `text-rose-300`, TONE_GLOW `0 0 16px rgba(251,113,133,.35)` — exactly the values the brief specified, matching the app's existing rose danger language (X-button `hover:text-rose-400`, error `border-rose-500/70`).
- Type doc comments updated (tone semantics + "DELETE" label example); header note now credits the R11-a extension. Zero behavioral changes to the gesture engine — purely additive union + Record entries.

### 2. fuel-tab.tsx — MealCard meal-entry swipe-to-delete (+126 net)
- Imports: `Trash2` added to the lucide set; `SwipeRow, type SwipeRowAction` imported from the primitive.
- New module constant `SWIPE_DELETE: SwipeRowAction = { icon: Trash2, tone: "rose", label: "DELETE" }` (sits beside `entryAccent`).
- Each entry `<li>` now wraps a SwipeRow: the li keeps `key` (list semantics intact); the row's visual treatment — `sys-accent-row rounded-r-sm px-2.5 py-1.5` + `--row-accent: entryAccent(e)` spine — moved onto the SwipeRow root (exact R10-b quest-row recipe); the flex row content (`min-w-0 flex-1` name/qty, kcal + P/C/F chips, X button) rides an opaque surface div (`relative flex items-center gap-2 rounded-r-sm`, backgroundImage `linear-gradient(90deg, var(--row-lift, rgba(167,139,250,.05)), transparent 68%), linear-gradient(160deg, #14111F, #0B0A12)` — the orchestrator-refined sys-panel composite approximation) so the rose rail sleeps beneath at rest.
- `onCommit={() => onDelete(e.id)}` — the swipe IS the delete, same handler as the button; `enabled={!reduce}` (MealCard's existing reduced-motion prop; SwipeRow also self-disables via useReducedMotion).
- Grip hint `«` (zinc-700, `sys-row-hint`, `-left-2` sized for the row's px-2.5 padding so it stays inside the overflow-hidden root) renders only when the gesture is live.
- The X button is untouched: h-11 w-11 (44px), `hover:text-rose-400`, `focus-visible:outline focus-visible:outline-violet-400/70`, `aria-label` — the accessible path under reduced motion / when the gesture stands down.
- Dropped the li's dead `hover:bg-violet-500/5`: `.sys-accent-row`'s unlayered `background` shorthand (globals.css:1869) beats Tailwind's layered `hover:bg` utility in the cascade (same unlayered-beats-layered mechanism the worklog documents for `.sys-panel` vs `fixed`) — the wash never painted, so removing it is a zero-visual-change cleanup, and an opaque surface would have swallowed it anyway.
- Vertical scroll guard chain holds for the `max-h-72 overflow-y-auto` list: root `touch-action: pan-y` (re-asserted after the style spread) keeps the ul's native pan-y; SwipeRow bails on vertical intent (|dy|>10 && |dy|>|dx| → ptr cleared), engages only on horizontal dominance (|dx|>12 && |dx|>1.3×|dy|), and pointercancel → spring-home release.

### 3. directives-tab.tsx — milestone swipe-to-claim (+133/−~45 churn, milestones block only)
- Daily quest rows untouched (reference pattern); milestones map callback refactored: `swipeClaim = q.completed && !q.claimed`, `swipeEnabled = swipeClaim && busyId !== q.id && !reduceMotion`; rowClass/rowVars extracted verbatim from today's FlowItem props (kind spines, hunt/rite classes, --row-accent/--row-lift values byte-identical); row content extracted into a shared `body` fragment so both render paths are pixel-identical.
- completed && !claimed → SwipeRow with `SWIPE_CLAIM` (Gift/emerald/CLAIM — existing constant), `onCommit → act(q, "claim")` through the same busyId-guarded path + reward overlay as the button; root carries rowClass + `overflow-hidden`, surface carries the opaque two-layer gradient; grip hint `«` at `-left-3` (p-3.5 keeps it inside the root).
- not completed → SwipeRow with `SWIPE_IDLE` + `enabled={false}` (standby pattern from the daily rows — rail asleep, no gesture).
- claimed → NOT wrapped (lightest DOM, brief-sanctioned choice): FlowItem > plain div with rowClass/rowVars + body — today's exact DOM one block level deeper inside the animation wrapper, zero visual change.
- FlowItem gained `whileTap={swipeClaim ? { scale: 0.985 } : undefined}` — press-depth mirrors the daily rows, actionable rows only.
- CLAIM motion.button preserved verbatim inside completed rows (accessible path); hunt/rite blade strips + scanline fields live on the root (painted over/beside the sheet exactly as today — ::before in the padding strip, ::after in tree order above the sheet).

## Verification
- `bunx tsc --noEmit` → only the 4 documented pre-existing errors (examples/websocket ×2, skills/image-edit, skills/stock-analysis) — src/ clean.
- `bunx eslint` on all three owned files → exit 0, zero errors/warnings.
- dev.log: healthy `✓ Compiled` entries after the edits, all routes 200.
- No DB access, no browser tests (orchestrator runs E2E), no build, no other files touched (git diff scope-checked).

## Notes for the orchestrator
- The meal rows' rose rail peeks at 0.25 resting opacity in the px-2.5 padding strip (the designed sleeping-rail affordance, same as quest rows).
- Suggested E2E touchpoints: FUEL meal row sub-threshold drag → springs home, no delete; full commit → entry removed (DELETE via /api/nutrition delete-entry, reload); vertical drag inside max-h-72 list → native scroll, no engage; DIRECTIVES milestone commit on a completed row → claim flow + reward overlay; claimed rows render identical to R10.
