# R28-a — Scroll-Reveal Flow System (full-stack-developer)

**Task:** Build a production-grade scroll-reveal animation layer so panels/cards flow in as the user scrolls through each tab. Hydration-safe pattern mandated: module-scope JS gate + shared IntersectionObserver + CSS-only transitions; NO hidden state in SSR HTML.

**Status: SHIPPED + QA 10/10 PASS.**

## Files

| File | Change | Lines |
|---|---|---|
| `src/components/system/reveal.tsx` | NEW | 134 |
| `src/app/globals.css` | appended reveal block | +52 (2182 → 2235) |
| `src/components/system/system-panel.tsx` | `reveal` prop (default ON) | 41 → 56 |
| `src/app/page.tsx` | `<RevealGate />` mount | +5 (216 → 221) |

Untouched per hard rules: `gates-tab.tsx`, `status-tab.tsx`, `src/app/api/**`, `src/lib/science.ts`, `motion.tsx` (easing value reused, not moved). No new deps, no schema changes, no new routes, DB read-only.

## Architecture (as built)

1. **Module gate** — `if (typeof document !== "undefined") document.documentElement.classList.add("js-reveal")` at reveal.tsx top level. Runs at client-bundle EVAL (before first client render → hidden states apply with zero flash). Server never executes → SSR HTML fully visible. Same reasoning as next-themes' theme class (layout.tsx `<html suppressHydrationWarning>` already covers the class-attr case).
2. **Singleton IntersectionObserver** — lazily created, `threshold: 0.15`, `rootMargin: "0px 0px -6% 0px"`. Callback adds `.is-visible`, stamps `data-revealed`, `unobserve`s immediately (once-only; scroll-up can never re-hide).
3. **`useReveal<T>()` hook** — ref + effect; re-observes on remount → tab re-entries re-flow (region keys remount tab trees). Early-return if `data-revealed` already present.
4. **`Reveal` component** — polymorphic (`div|section|article|li|ul|span`), `delay` seconds → inline `--reveal-delay` custom property + `data-reveal-delay` marker attribute (zero-delay elements carry neither).
5. **`RevealGate`** — renders null; mounted once in page.tsx beside ambient layers for import-graph insurance.
6. **SystemPanel `reveal = true` default** — hook unconditional (rules of hooks); prop gates ref + `data-reveal`. One edit → all 73 usages flow. Opt-out: `<SystemPanel reveal={false}>`.
7. **CSS** (globals.css, unlayered author CSS — beats layered utilities; verified no panel root uses opacity/transform utilities): hidden `opacity:0; transform:translateY(14px) scale(0.995)` with NO transition (js-reveal landing post-paint must hide instantly; will-change omitted — ~70 permanent GPU layers would be worse than compositor self-promotion); `.is-visible` carries both transitions on the app flow ease `cubic-bezier(0.22, 1, 0.36, 1)` (motion.tsx FLOW_EASE — no --flow CSS token existed, raw bezier is the app idiom) + `transition-delay: var(--reveal-delay, 0s)`; reduced-motion block forces visible/none/none with !important.

### Deviation from spec (additive, documented): the `data-revealed` self-heal

React re-assigns `element.className` whenever its rendered className string changes — which WIPES manually-added classes. A revealed panel whose className prop later changes would strand invisible (observer already unobserved it). Guard: the observer also stamps `data-revealed` (an attribute React never manages → survives any className re-assignment), and a third CSS rule `html.js-reveal [data-reveal][data-revealed] { opacity:1; transform:none }` keeps revealed elements visible with no re-transition if the class is wiped. Zero conflicts in the happy path (same values the .is-visible rule holds; transition/delay only declared there). Currently 0 of 73 SystemPanels have dynamic root classNames — this is future-proofing, 2 lines of CSS + 1 line of JS.

### Spec option NOT taken: records-tab row stagger

PR rows already stagger on mount (framer `delay: i*0.035` cap 0.3) and archive rows `i*0.03` cap 0.27 — a second scroll-based stagger would double-animate the same motion. Spec's own guidance: "keep scope tight; SystemPanel default covers the app." `Reveal` ships as the public API for future stagger use.

## QA ladder (fresh agent-browser profile, 390×844)

| Step | Result |
|---|---|
| 1. Open app, past boot screen | PASS — app loaded, 11 panels in DOM |
| 2. `document.documentElement.classList.contains("js-reveal")` | PASS — true |
| 3. Above-fold visible; scroll 600 → below-fold 0→1 | PASS — "Athlete Status" opacity 1/is-visible; below-fold opacity 0, `matrix(0.995,0,0,0.995,0,14)`; after scroll: is-visible + data-revealed + opacity 1 + transform none. Mid-flight probe with a 0.35s `--reveal-delay` showed opacity 0 while class present → transition-delay machinery proven live |
| 4. Once-only (scroll up/down again) | PASS — stays visible, no re-hide |
| 5. Reduced motion (`set media dark reduced-motion` + reload) | PASS — all 10 below-fold panels computed opacity 1 / transform none PRE-SCROLL (never hidden); js-reveal true but CSS-neutralized |
| 6. `agent-browser errors` + console | PASS — errors EMPTY; console only the 2 documented benign warnings (recharts ResponsiveContainer fixed-size, framer reduced-motion notice) + HMR/DevTools info |
| 7. No horizontal overflow | PASS — `scrollWidth 390 <= 390` |
| 8. Screenshots | PASS — `screenshots/r28a-mid-reveal.png`, `r28a-final-state.png` (+ bonus `r28a-reduced-motion.png`) |
| 9. `curl -s localhost:3000` — no baked hidden state | PASS — 0 `js-reveal`, 0 `is-visible`, 0 `data-reveal` (initial SSR render is the boot/loading screen — strongest possible form of the rule) |
| 10. dev.log tail | PASS — all 200s, no compile errors |

**Extra beyond ladder:** SPA tab re-entry re-flow — clicked PROGRESS nav → fresh records mount: 2/2 above-fold panels visible, 6 below-fold hidden at opacity 0 → re-revealed on scroll. Confirms the remount-reobserve design end to end.

`bunx eslint` on the 3 TSX files: exit 0 (run twice: post-edit and post-QA). Project-wide tsc NOT run (orchestrator owns merged tsc — hard rule).

## Environment incidents (root-caused, both fixed — future agents read this)

1. **Turbopack missed a `cat >>` append to globals.css.** Symptom: `✓ Compiled` logged, yet the stable-name CSS chunk (`[root-of-the-server]__*.css`) served STALE content — proven via curl (not the R22-b service-worker case: curl bypasses SWs; this was server-side). Remedy: append any 1-line change (e.g. a comment) to force the watcher, verify with `curl .../_next/static/chunks/<chunk>.css | rg <rule>`, then remove the marker. **After ANY globals.css edit, curl-verify the compiled chunk.**
2. **Platform dev server OOM-killed mid-QA** (dmesg: `next-server (v1)` pid 1632, anon-rss 1.85GB — the R22-a memory-pressure pattern, 2nd occurrence). Restarted; then found this sandbox **kills direct tool-shell children when a Bash call ends** — `setsid`/`nohup`/`disown` on a DIRECT child do NOT survive (sleep-test-proven). Persistent remedy: **double-fork subshell** `( setsid nohup bun run dev > dev.log 2>&1 < /dev/null & )` — re-parented orphans survive (verified HTTP 200 across multiple subsequent calls). Also: two `bun run dev` instances can race for :3000 (the loser logs EADDRINUSE) — kill both trees before the clean restart.

## Design notes for future rounds

- SkeletonPanel uses the raw `sys-panel` class (not the SystemPanel component) → skeletons never reveal; real panels reveal when data lands. Correct: loading states shouldn't animate.
- Dialogs (`DialogContent className="sys-panel ..."` in data-vault/exercise-dialog/divination/ascension/share/digest/fuel drawers) also use the raw class → dialogs keep their own open animations, no double-reveal. The reveal layer is panel-flow only.
- The transform exists only during the 0.5s transition (then `transform: none`) → no lasting containing-block side effects; all `fixed` chrome (nav/FAB/toasts/overlays) lives outside SystemPanels; the one `sticky` table header (pr-drilldown) is inside a radix portal dialog, untouched.
- Above-fold reveal on app boot compounds with FlowGroup's mount stagger — reads as layered depth, verified visually via screenshots + DOM probes.
- FLOW_EASE `[0.22, 1, 0.36, 1]` is duplicated in the reveal CSS — if motion.tsx's ease ever changes, update globals.css's reveal block to match (comment in both places says so).
