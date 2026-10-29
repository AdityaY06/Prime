# R10-a — BODY ATLAS + REWARDS HUB identity pass (full-stack-developer)

Task ID: R10-a · Files owned: `src/components/fitness/body-atlas-tab.tsx`, `src/components/fitness/rewards-hub-tab.tsx` · All other files untouched (locked).

## What was applied

### rewards-hub-tab.tsx (76 → 178 lines, full restructure)
- **GATING RESTRUCTURE (the R9-c load-bearing rule)**: old root was `FlowGroup` with everything inside → now PLAIN root `div.space-y-4` + `FlowGroup` wrapping ONLY the above-fold masthead + a single `FlowReveal` sibling below. The existing `motion.div key={view}` shop/badges swap animation is preserved verbatim inside the FlowReveal (FlowReveal is a stable wrapper, so view switches never re-gate).
- **Masthead**: new tab header (Gem icon in amber-bordered 44px box + `DecodeText "REWARDS" as="h2"` + sub-label) mirroring vitals-tab's header idiom.
- **01 / VAULT (amber hollow marker)** — the tab's ONE hero numeral: ESSENCE balance as `.sys-display.sys-display-lg` + `sys-bloom-teal` + `text-glow-teal` + `useCountUp(hunter.essence)` (teal = the app's pre-existing essence identity from forge-tab; amber marker per the trophy/reward hue policy). Supporting cast = 2 borderless `sys-accent-row` micro-stats (hunter-card idiom, value-over-tiny-label): STREAK (amber, bloomed Flame icon — "session complete + streak" is what pays essence) + TOTAL SESSIONS (violet, Dumbbell icon).
- **02 zone below**: `SysSection` marker that re-decodes per view — `02 / FORGE` (violet) in shop, `02 / TITLES` (amber) in badges (per-view numbering because the hub switch means only one zone is ever visible below the masthead; task's "03/TITLES" global numbering was adapted to the actual switch structure).
- Hub switch (role=tablist, aria-selected, focus-visible, 44px) preserved EXACTLY — only re-seated inside the masthead FlowGroup.
- NO de-boxing targets existed inside this file (all relic/title rows live in locked forge-tab/titles-tab); no meters exist here either.

### body-atlas-tab.tsx (1990 → 2181 lines)
- **GATING RESTRUCTURE**: old root was `FlowGroup` with all three FlowItems inside → plain root `div.space-y-4` + `FlowGroup` masthead (OracleTip · new tab header · 01/BIOMASS hero · sub-view toggle) + `FlowReveal` wrapping the existing `motion.div key={view}` swap zone (stable wrapper — the four sub-view rises are preserved and never re-gate).
- **Tab header**: PersonStanding icon (violet box) + `DecodeText "BODY ATLAS" as="h2"` + sub-label "SCANNER · LIBRARY · TOOLS · METRICS".
- **01 / BIOMASS hero (violet marker)** — the tab's ONE hero numeral moment: LATEST BODY WEIGHT from a new read-only `useApi<MetricsHeroRes>("/api/metrics")` window (GET only; falls back `latest.weight → profile.weightKg → NO MASS LOG / OFFLINE dim states, skel-bar while loading`). Numeral: `.sys-display-lg` + `sys-bloom` + `text-glow-violet` + `useCountUp` rendered via existing `fmtOne` (1 decimal). Supporting cast: HEIGHT (violet accent-row) + BMI (teal accent-row) — all values exactly as the metrics API returns them. LOGGED {day} stamp via existing `formatDayLabel`.
- **Per-view numbered zones** (sub-view structure adapted): ATLAS = `02 / TARGETING` (violet, scanner zone) + `03 / READOUT` (teal, DetailPanel sidebar — inside its own `FlowReveal`, so it scroll-gates on mobile and reveals instantly on desktop); LIBRARY = `02 / LIBRARY` (teal); TOOLS = `02 / TOOLKIT` (violet) + RestTimerPanel wrapped in FlowReveal (deep panel); METRICS = `02 / TELEMETRY` (teal) above the locked BodyMetrics component.
- **De-boxing → sys-accent-row** (borderless, `--row-accent`/`--row-lift` inline vars, pre-existing hues ONLY):
  - DetailPanel default state: TOTAL WEEKLY SETS (violet) + FATIGUED MUSCLES (rose when >0 / zinc when 0) — the `border-t` container divider became a `sys-hairline`; values bumped to text-lg bold (labels stay tiny).
  - DetailPanel TOP EXERCISES buttons → violet accent rows + `min-h-11` (44px touch target — was ~36px).
  - DetailPanel PERSONAL BESTS rows → amber accent rows (trophy zone), values text-base bold amber-300.
  - ExerciseRow (library, 194 rows) → de-boxed; hue keyed to the EXISTING `TYPE_CHIP` palette via `TYPE_ACCENT` (strength=amber, bodyweight=rose, cardio=fuchsia, mobility=teal).
  - Kept boxed where a real container semantic exists: 1RM/plate-loader/rest tools, scanner panel, selects/inputs, CANNOT-LOAD alert.
- **Meters (sys-seg)**: weekly-volume guideline band gains `<span class="sys-seg sys-seg-sm">` inside the band; rest-timer progress bar parent gains `relative` + `<span class="sys-seg">` (fill gradient untouched per task).
- **Display moments**: EPLEY/BRZYCKI 1RM numerals → `.sys-display-md` (33px@390 / 48px desktop, glow kept, still instant — it's a calculator); REST TIMER clock → `.sys-display-xl` (93.6px@390) + `sys-bloom` when finished (state light; running/idle colors preserved). 4-week trend NOW bar flattened gradient→solid violet-500 (R9-c chart-fill idiom).

## Verification (all green)
- `bunx tsc --noEmit` → **0 src errors** (only the 4 documented pre-existing examples/skills errors). One intermediate fix: CSS custom-prop row constants needed the `as React.CSSProperties` assertion form (annotation form fails weak-type check) — same pattern as gates-tab/hunter-card.
- `bunx eslint <both files>` → **exit 0**.
- agent-browser (named session, 390×844): BODY — scrollWidth **exactly 390**, hero "77.5"@54.6px w900, sections 01 BIOMASS/02 TARGETING/03 READOUT in DOM, **FlowReveal gating measured pre-scroll (opacity 0 + translateY(22px)) and revealed after scroll**, 4 accent rows default → 6 with CHEST selected (1 sys-seg-sm on the volume band); TOOLS — EPLEY 70@33.15px + BRZYCKI 67.5@33.15px + clock "1:30"@93.6px, 1 sys-seg on the rest bar; LIBRARY — 02 LIBRARY marker, 194 de-boxed rows with 2px accent rails, scrollWidth 390; METRICS — 02 TELEMETRY + 10 BodyMetrics panels; REWARDS — hero "356"@54.6px teal bloom + count-up, 01 VAULT/02 FORGE markers, 2 accent rows, tablist intact; BADGES switch → marker re-decodes to 02 TITLES (amber hollow verified) + badge grid renders. **Zero console errors, zero page errors** on every view (only benign THREE.Clock deprecation + Fast Refresh logs).
- Desktop 1280×800: BODY scrollWidth 1280, hero @80px clamp, lg sidebar layout present; REWARDS scrollWidth 1280.
- 8 screenshots: r10a-body-masthead/readout/tools/rest-timer/desktop, r10a-rewards-vault/badges/desktop.
- **NO data-mutating clicks** (only view/sub-view switches + a muscle chip selection). DB baseline re-verified read-only after everything: **KAEL L11 · xp 118/530 · totalXp 2943 · essence 356 — untouched.**

## Incidents
- Dev server was found DEAD early in verification (documented OOM pattern; curl 000, no next-server process) → respawned with the prescribed double-fork orphan `bash -c '( setsid nohup bun run dev </dev/null >/dev/null 2>&1 & )'` — healthy on :3000 for the entire browser pass.
- One agent-browser CDP timeout storm mid-verification (CPU contention from concurrent sibling agents + dev compiles on the 4GB box) → recovered by closing and relaunching the named session; all subsequent commands clean.
- Concurrent-agent note: dev.log shows siblings (R10-b on directives etc.) hitting the shared dev server concurrently — expected per the R10 FOUNDATION entry.
