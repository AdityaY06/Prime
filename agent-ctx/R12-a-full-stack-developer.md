# R12-a — SwipeRow TERMINAL ADOPTION (records PR rows + titles badge cards)

Task ID: R12-a
Agent: full-stack-developer
Task: SwipeRow gesture adoption on the last two major surfaces — RECORDS tab PR rows (swipe-to-open-dossier) + TITLES tab badge cards (swipe-to-feature).

## Context absorbed (read-only)
- Worklog R10/R10-b/R11-a entries: the SwipeRow interaction contract (data-no-swipe + pan-y re-assert, engage |dx|>12 && >1.3×|dy|, 1:1 follow ±96px, commit >64px or velocity >0.5px/ms, committed swipe suppresses trailing click), the quest-row adoption recipe (opaque #14111F→#0B0A12 two-layer sheet so the reveal rail sleeps at rest, grip hint «, busy/reduced-motion gating, lightest-DOM unwrapping for non-actionable rows).
- swipe-row.tsx (LOCKED): tone union "emerald" | "violet" | "rose" (violet = verify/neutral semantic — the right tone for dossier-open and feature).
- fuel-tab.tsx MealCard rows (~1096-1175): the canonical adoption structure.
- records-tab.tsx + titles-tab.tsx end-to-end before editing.

## records-tab.tsx (+~87/−68 on the map block, 2 imports, 1 constant)
- Imports: FolderOpen added to lucide-react; `SwipeRow, type SwipeRowAction` from system/swipe-row.
- Module constant: `SWIPE_DOSSIER: SwipeRowAction = { icon: FolderOpen, tone: "violet", label: "DOSSIER" }`.
- `visibleRecords.map`: the motion.button (PR row) is now wrapped in SwipeRow — root `className={cn("relative overflow-hidden rounded-sm", top && "sm:col-span-2")}`, `onCommit={() => setDrillKey(key)}` (EXACT same handler as the tap — the swipe IS the dossier open), `enabled={!reduce}`, `key={r.id}` moved onto the SwipeRow (array child).
- Grid subtlety handled: `sm:col-span-2` MOVED off the top-row button's className onto the SwipeRow root so the 2-col grid sees it; button keeps `min-h-11 w-full`; mobile stays single-column.
- Opaque backing per spec: `<div className="relative rounded-sm" style={{ backgroundImage: "linear-gradient(160deg, #14111F, #0B0A12)" }}>` rides under the button — the button's own translucent layers (from-amber-500/15 hero wash / bg-zinc-950/40) paint ON TOP of the opaque base, so resting visuals stay ~identical and the violet rail sleeps beneath.
- Grip hint «: `sys-row-hint pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[10px] leading-none text-zinc-700`, aria-hidden, only when `!reduce`. KEY INTERPRETATION: it renders AFTER the motion.button in DOM — the button carries `position:relative` (class `relative`), so a before-button hint would be painted UNDER it (positioned siblings paint in DOM order); after-button placement paints the whisper above the button's px-3 padding strip, and `left-1` (4px) keeps it inside the overflow-hidden root (fuel's `-left-2` trick relies on root padding these rows don't have).
- motion.button preserved 100% verbatim otherwise: onClick, aria-haspopup/aria-expanded/aria-label, initial/animate/transition entrance (delay i*0.035, FLOW_EASE), {...tapMotion}, focus-visible ring, shimmer/crown/sparkline/delta-chip/context bodies — only `key` (moved to array child) and `sm:col-span-2` (moved to grid cell) relocated.
- Vertical scroll guard: rows live in the max-h-80 overflow-y-auto scroller — SwipeRow's own touch-action pan-y + vertical-intent bail handle it; nothing added that could break the scroller (no style prop passed — the primitive's default root style IS touchAction pan-y).

## titles-tab.tsx (+51, 2 imports, 1 constant, 1 hook)
- Imports: `useReducedMotion` added to framer-motion; SwipeRow + SwipeRowAction added.
- Module constant: `SWIPE_FEATURE: SwipeRowAction = { icon: Crown, tone: "violet", label: "FEATURE" }` (Crown already imported).
- `const reduce = useReducedMotion()` added to the component (file had NO reduced-motion awareness before — gesture + hint gated by it; the card entrance animation left as-is per spec).
- `titles.map` restructured with the R11-a shared-body pattern: `const card = (<motion.div …verbatim…>)` defined once, then `return t.unlocked && !t.equipped ? (<SwipeRow key action onCommit enabled className>…opaque wrapper + {card} + hint…</SwipeRow>) : card` — both render paths pixel-identical, card body byte-untouched.
- SwipeRow: `onCommit={() => equip(t.code)}` (EXACT same handler as the FEATURE button — the swipe IS the feature; SwipeRow's committed-swipe click suppression prevents the inner button double-firing), `enabled={busy === null && !reduce}` (gesture stands down while an equip PATCH is in flight and under reduced motion), root `className="relative overflow-hidden rounded-sm"` (grid gap-3 sm:grid-cols-2 lg:grid-cols-3 cell).
- Opaque sheet wrapper div (`linear-gradient(160deg, #14111F, #0B0A12)`) under the card's own translucent `bg-gradient-to-br from-zinc-900/80 to-zinc-950/90`; tier border/glow, rune watermark, FEATURED ribbon, FEATURE/FEATURED buttons all verbatim inside.
- Grip hint « after the (position:relative) card in DOM — same paint-order reasoning as records — at `left-1` in the card's p-4 padding strip; rendered only when `!reduce && busy === null` (the live-gesture condition).
- Equipped cards + locked cards NOT wrapped (lightest DOM, R11-a sanctioned pattern): un-feature stays a deliberate tap, locked has no action.
- Card entrance animation (initial/animate/delay i*0.04) stays on the inner motion.div, not the SwipeRow root.

## Cross-surface consistency decisions
- `sys-row-hint` marker class included on both new hints — it's the zero-CSS marker used by all 3 existing adoption sites (fuel/directives ×2); keeps the grip-hint set greppable/QA-targetable. Undefined in globals.css → no visual delta, no globals.css edit.
- Glow clipping tradeoff accepted (same as every adopted surface): SwipeRow root `overflow-hidden` (required so the dragged sheet can't paint into neighboring grid cells) clips the top PR row's 16px amber glow bleed and the epic/legend tier glows to the cell box. Sanctioned by the recipe; the classes themselves are preserved verbatim.

## VERIFICATION (all mandatory steps)
1. `bunx tsc --noEmit` → ZERO errors in src/ (only the 4 documented pre-existing examples/skills errors: examples/websocket ×2, skills/image-edit, skills/stock-analysis-skill).
2. `bunx eslint src/components/fitness/records-tab.tsx src/components/fitness/titles-tab.tsx` → exit 0, zero errors/warnings.
3. `git diff --stat` scope: MY changes are exactly records-tab.tsx + titles-tab.tsx. The working tree additionally shows `src/components/system/swipe-flow.tsx` (+139) — that is a CONCURRENT sibling agent's work (diff header literally says "R12-b — per-tab ghost silhouettes", mtime 03:24:59, not written by me; my only tool-writes were the 2 MultiEdits on my owned files) and `src/components/system/swipe-row.tsx` | 0 — a pre-existing 100644→100755 mode bit flip that predates my session. Neither file touched by me.
4. Dev server untouched (no restart, no DB, no browser tests). dev.log healthy: stale EADDRINUSE from a historical duplicate spawn at the log head (documented pattern), then ✓ Ready, all routes 200; post-edit smoke `GET /` → HTTP 200 with fresh compile (106ms) and zero errors.

## Non-negotiables audit
- Zero behavior regressions: tap paths, aria, focus-visible rings, busy guards, entrance staggers all intact (button/card bodies verbatim; only structural wrap + key/col-span relocation).
- Zero new hues: violet rail + existing amber/zinc/teal card colors only. No new dependencies. No globals.css edits. No changes to swipe-row.tsx.
- Both files remain "use client" and lint-clean.
