# R13-b — frontend-styling-expert working notes

Task: row-gesture hint chip (per-surface, one-time) + ghost hero-zone accent.

## Files owned & changed
- `src/components/system/row-hint.tsx` — NEW, 103 lines
- `src/app/globals.css` — +46-line `.row-hint` block (after swipe-hint-float keyframes, ~line 2090) + reduced-motion selector extended (1 line)
- `src/components/system/swipe-flow.tsx` — GHOST_HERO_EDGE/FILL/NOTCH constants + hero branch in panel render + comments (+44/−13)
- `src/components/fitness/directives-tab.tsx` (+4) — RowHint surface="quests" after SysSection 01 DAILY ORDERS
- `src/components/fitness/fuel-tab.tsx` (+4) — RowHint surface="fuel" above MealCard grid (inside data branch)
- `src/components/fitness/records-tab.tsx` (+5) — RowHint surface="records" after SysSection 03 RECORDS
- `src/components/fitness/titles-tab.tsx` (+4) — RowHint surface="titles" above badge grid
- session-raid.tsx: NOT touched (parallel agent).

## Key mechanism decisions (documented for E2E)
1. **Dismiss-on-row-swipe**: MutationObserver on `document.body`, `subtree: true, attributeFilter: ["data-swipe-live"]`. Chosen over body-class observation because `body.swiping` is raised by BOTH SwipeFlow (tab drags) and SwipeRow — it would mis-dismiss on tab gestures. `data-swipe-live` is stamped only by SwipeRow at the engage beat and never rendered by React, so the filtered observer fires only on genuine row engage/release. Observer lives for the surface's lifetime (also suppresses the chip if a row swipe happens during the 600ms pre-show delay).
2. **Portal**: chip renders via `createPortal(document.body)`. The tab content sits inside SwipeFlow's sheet (`will-change-transform`), which is a containing block for fixed descendants — without the portal, `bottom: calc(...)` would resolve against full content height and the chip would ride the sheet during tab drags.
3. **Key stamped at SHOW** (spec-literal: "render … and set the key") — one appearance per surface per session even across instant tab switches.
4. **Reduced motion**: chip never renders (SwipeRow disables the gesture under reduced motion — teaching it would be dishonest); CSS also kills all its animations.
5. **Zone**: bottom center at `+7.5rem` (one chip above swipe-hint's 5.25rem) so both can coexist on a first-session screen; mobile-only (≤767px) like the family sibling.
6. **44px dismiss target**: invisible `::after` pad `inset: -0.75rem -0.5rem` → ~56px × (width+16px) hit area; visual chip stays family-small.
7. **Ghost hero**: row 0 / panel 0 of every TAB_GHOST set → border rgba(167,139,250,0.32), fill rgba(167,139,250,0.05), 2px inset left-edge notch rgba(167,139,250,0.4) (echoes app left-spine row language; side-agnostic). All other panels keep 0.18/0.13/0.09. Paint-only; `undefined` style values omitted by React so class defaults stand elsewhere.

## E2E checklist for orchestrator
- Fresh session (clear sessionStorage) → directives tab: chip appears ~600ms after data mount, floats, auto-gone at 6s; second visit same session: nothing.
- `sessionStorage["prime-row-hint:quests"] === "1"` immediately after first show.
- Tap chip (aim center ±20px — pad covers 44px+) → instant dismiss.
- Start a row swipe (sub-threshold drag on a daily quest row) → chip dismisses the moment the row engages (data-swipe-live stamp beat).
- Fresh session → fuel/records/titles each surface their own chip once (independent keys).
- Deep tab drag → ghost wireframe: first panel of the destination set visibly brighter (0.32) + notch; remaining rows keep the descending fade.
- prefers-reduced-motion: no chip at all; ghost accents are static color (fine — color, not motion).
- Both hints visible case: land on status, nav-TAP to directives within ~5s → tab hint at 5.25rem, row hint at 7.5rem, stacked, no overlap.

## Validation already run
- `bunx tsc --noEmit`: only 4 pre-existing examples/skills errors; src/ clean.
- `bunx eslint` on all 6 touched TS/TSX: exit 0.
- `postcss.parse(globals.css)`: clean; all rules verified present.
- Dev server GET / → 200. No browser QA / DB mutation performed (orchestrator owns E2E).
