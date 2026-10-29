# R29-a · full-stack-developer · Scroll-reveal flow system + lazy tabs + useApi hardening (re-land)

Rollback recovery #5. Prior round shipped this design, sandbox rollback wiped it, worklog had
no record (tail = R22). Specs were authoritative; this round re-landed them exactly. The
concurrent R29-b agent owns the science/HRV files (gates-tab, status-tab, oracle route,
fuel-tab, health.ts, readiness route) — untouched here.

## Files changed

| File | Change | Lines |
|---|---|---|
| `src/components/system/reveal.tsx` | NEW — spec byte-equivalent | 134 |
| `src/components/system/tab-skeleton.tsx` | NEW | 34 |
| `src/components/system/system-panel.tsx` | EDIT — `reveal = true` default-ON prop | 40 → 49 |
| `src/app/globals.css` | EDIT — appended reveal CSS block | 2182 → 2214 |
| `src/app/page.tsx` | EDIT — RevealGate + 8 dynamic tab imports | 217 → 251 |
| `src/hooks/use-api.ts` | EDIT — gen counter / null-reset / stable reload | 81 → 104 |

## Architecture notes (why it's built this way)

- **NOT framer-motion by design**: ~70 live panels → ONE shared IntersectionObserver + pure CSS
  (opacity/transform only, compositor, 60fps). 70 whileInView subscribers would each own
  measurement + rAF machinery.
- **Hydration safety (load-bearing)**: module-scope `js-reveal` gate on `<html>` runs at
  client-bundle EVAL time (before first client render → zero flash); `typeof document` guard →
  SSR HTML fully visible; React never diffs classes it didn't render (next-themes reasoning —
  layout.tsx already suppresses that warning).
- **Once-only + React-proof**: unobserve on intersect; `data-revealed` attribute survives
  React's className re-assignment (`.is-visible` class can be wiped by a re-render —
  `[data-revealed]` self-heals visibility).
- **Tab re-entry re-flows for free**: region keys remount the tab tree; useReveal's effect
  re-runs on mount; `data-revealed` short-circuit prevents StrictMode double-effects.
- **Lazy tabs**: `next/dynamic` ssr:false + TabSkeleton per tab. Shell (navs, overlays,
  OracleConsole, boot) stays STATIC — first paint and the hydration-audit surface never depend
  on tab chunk fetches.
- **useApi**: `genRef` counter checked after EVERY await; null-path resets state; `reload` is
  `useCallback`-stable. `api()` + offline queue + silent-reload semantics untouched.

## Fixed-overlay `reveal={false}` audit — ZERO edits (all verified by reading components)

- settings-dialog (system/), share-card, digest-share-card, divination-dialog, exercise-dialog,
  data-vault, pr-drilldown: render `sys-panel` class DIRECTLY on `DialogContent` — no nested
  SystemPanel → no `data-reveal` attribute → reveal system cannot touch them at all.
- rest-day-card: SystemPanels inline in Records tab flow. sensor-hub: inline in Vitals flow
  (vitals-tab.tsx:767) — not a modal. session-raid: both "fixed" hits are comments; the log
  sheet/PR banner are in-flow. fuel-tab: all 17 SystemPanels sit before its two
  DialogContent blocks (L1864+). No createPortal renders SystemPanel; no inline position:fixed.

## QA ladder — all PASS (fresh sessions, 390×844)

1. errors JSON `"errors":[]` — zero errors, zero hydration errors (verified twice: pre- and
   post-server-restart brand-new sessions).
2. `js-reveal` gate → true.
3. Scroll 700 → visible 1→3, computed opacity "1" on revealed panels.
4. Once-only: bottom (10/10) → up+down → still 10.
5. Reduced-motion: all `[data-reveal]` opacity "1", none hidden.
6. 8 tabs: regions STATUS/DIRECTIVES/GATES/BODY/FUEL/VITALS/RECORDS/FORGE render; re-entry
   re-flows (fresh counts 1–9 per switch).
7. SSR purity: curl `/` → 0 matches for `data-reveal|js-reveal|is-visible`.
8. scrollWidth 390 on all 8 tabs (one 500 reading = test-daemon viewport reset, not overflow).
9. dev.log clean; tab chunks on-demand (dev indicative).
10. Screenshots: `screenshots/r29a-reveal-mid.png` (390×844 mid-scroll),
    `screenshots/r29a-tab-skeleton.png` (390×844 — GENUINE skeleton captured via network-route
    hold on the body-atlas chunk; DOM-verified role=status aria-busy + sr-only
    "Loading BODY view…" + 6 zinc blocks).
11. dev.log tail clean (all 200s).

## Incidents & lessons (watch-items for future rounds)

1. **Turbopack CSS silent-miss is REAL**: after appending to globals.css the served CSS chunk
   did NOT contain the new rules; `touch` alone fixed nothing. Opening a browser session (HMR
   websocket) + touch regenerated the chunk. ALWAYS curl-verify CSS appends
   (`curl -s <chunk> | rg <rule>`), never trust "✓ Compiled".
2. **Dev server OOM-killed mid-QA** (known pattern): restarted via double-fork nohup subshell
   `(nohup bash -c 'cd … && exec bun run dev' > /dev/null 2>&1 &)` — pid 6650, healthy since.
   The transient ChunkLoadError on one session was the dying server, not a code defect.
3. **Capturing the dynamic loading state**: localhost chunk loads outrun screenshot latency;
   a network route returning a no-op body (chunk loads, module never registers → import
   hangs without rejecting → skeleton stays, page responsive) is the honest capture trick.
   NEVER use `--abort` on a code chunk — it rejects the import, React unmounts the app
   (expected for any lazy app, but it poisons the session's error accumulator).
4. `agent-browser errors` accumulates across a session's lifetime — after any deliberate
   sabotage experiment, open a brand-new session for a definitive error verdict.
5. Skeleton flash on real switches is ~10–50 ms (localhost) — users on real networks will see
   it; dev captures need the hold trick.

## Validation

- `bunx eslint` on all 5 touched files → exit 0. No tsc (orchestrator owns it — OOM discipline).
- DB read-only (zero writes). No new deps. No new routes. Zinc-only skeleton colors.
- Dev server: pid 6650 on :3000, dev.log all 200s.
