# R9-c — FUEL / VITALS display moments (FLOW & IDENTITY round, Task 27-c)

Task: kill the "AI-made look" on the FUEL + VITALS tabs — kcal/readiness display
numerals, segmented macro meters, editorial section headers, accent-row logs,
scroll-revealed tails. Exactly 2 owned files: fuel-tab.tsx, vitals-tab.tsx.

## What landed

### FUEL (src/components/fitness/fuel-tab.tsx, +~120 net)
- ROOT RESTRUCTURE (the load-bearing move): tab root is now a PLAIN div
  (space-y-4/sm:5 + the loading opacity-dim) instead of FlowGroup. Top zone
  (OracleTip → date nav → hero) sits in a FlowGroup (stagger preserved); the
  below-fold tail (science, timing, quick-add, meal cards, history) is a series
  of FlowReveal siblings. WHY: framer-motion variant propagation — a FlowReveal
  (variants + initial + whileInView, no animate) inside a FlowGroup INHERITS the
  group's animate="visible" immediately (verified in the motion-dom source:
  animateChanges resolves `props[type] ?? context[type]`, and animateVariant →
  animateChildren animates every variant-child that DEFINES the propagated
  label) → whileInView would never gate. Under a plain root the only motion
  ancestor is page.tsx's wrapper, whose propagated labels (enter/center/exit)
  do NOT exist in flowRevealVariants → propagation no-ops → whileInView gates.
  EMPIRICALLY VERIFIED: below-fold panels measured opacity:0 + y-translate while
  off-screen, flip to opacity:1 on scroll.
- KCAL RING = the tab's display moment: center numeral now
  `.sys-display .sys-display-md` (clamp 2–3rem, 900, -0.045em, tabular) +
  `.sys-bloom` (violet) / `.sys-bloom-amber` when over target, stacked with the
  existing text-glow (text-shadow + animated drop-shadow filter coexist).
  useCountUp remaining/consumed kept. REMAINING/OVER + KCAL labels stay tiny
  sys-labels beside/below. Ring arc mechanics untouched (arm-on-mount sweep).
  NOTE: CalorieRing lives IN fuel-tab.tsx (not activity-rings.tsx — that file
  renders the STATUS tab's activity rings), so the ring AND its number were
  both editable; no limitation.
- PROTEIN = macro hero: new `hero?: boolean` prop on MacroBar (protein only) →
  label tiny sys-label, current grams `.sys-display .sys-display-md` teal-300
  (amber when over) + useCountUp, "/ {target} G" zinc secondary. Carbs/fat:
  `text-xl font-bold tabular-nums` (clearly heavier than their 9px labels).
- SEGMENTED METERS: all 3 macro tracks gained `<span className="sys-seg" />`
  overlays; fills flattened from linear-gradient(90deg, c55, c) → solid color
  (meters, not gradients — the audit's "smooth gradients everywhere" defect).
  Glow boxShadow + arm-on-mount sweep kept.
- SECTION HEADERS (3, via local SysSection helper): 01 / INTAKE (violet hollow,
  above hero), 02 / TIMING (TEAL hollow — science zone, above FuelSciencePanel),
  03 / HISTORY (violet hollow, above HistoryPanel). Index = .sys-section-index
  + .sys-display-hollow(-teal), label = DecodeText (scramble reveal, sr-only
  safe), rule = .sys-section-rule. Restraint kept: QuickAdd/meal cards carry no
  header.
- LOG ROWS → sys-accent-row: ProteinTimingPanel per-meal rows keyed to the
  EXISTING verdict (DOSE teal / LIGHT amber / SKIP zinc — DOSE_ACCENT map) and
  the ✓DOSE chip gains `.sys-bloom-teal`; MealCard food rows keyed by a local
  entryAccent() visual shorthand (teal protein anchor ≥20 g ≈ near the app's
  ~0.4 g/kg per-meal science; amber ≥500 kcal energy hit; violet neutral) —
  display-only grouping, no text claims. Full-border row boxes removed.
- Date-strip headline "TODAY/SEP 27" → DecodeText (re-scrambles on every date
  change — the date nav's little signature). Scroller mechanics untouched.
- HISTORY chart: kcal bars flattened url(#fuelKcalGrad) → solid #8b5cf6; water
  mini-columns bg-gradient-to-t teal → solid bg-teal-500. All numbers/footers
  byte-identical.

### VITALS (src/components/fitness/vitals-tab.tsx, +~80 net)
- Same root restructure: plain div root > FlowGroup (OracleTip, tab header,
  01/SIGNALS + ReadinessPanel, Daily Check-In) + FlowReveal tail (02/ZONES +
  RiskMonitor, HealthScorePanel, 03/TRENDS + TrendsPanel, MaintenancePanel,
  testing lab). Early-return skeleton/error states untouched.
- READINESS = the tab's display moment (the vital the tab leads with): score
  numeral `.sys-display .sys-display-lg` (clamp 3–5rem) + band-keyed bloom —
  PRIMED/READY → sys-bloom-teal, MODERATE → sys-bloom-amber, BACK OFF → NO
  bloom (alarm states don't breathe). Existing useCountUp(0.9) + band-hex color
  + textShadow kept. Band bar track + sys-seg (track now relative).
- Tab header "VITALS" → DecodeText as="h2" (semantic kept).
- SECTION HEADERS (3): 01 / SIGNALS (violet), 02 / ZONES (AMBER hollow — risk/
  warning zone), 03 / TRENDS (TEAL hollow — evidence/citation zone).
- RISK CARDS → sys-accent-row (borderless): RiskCard gained an `accent` prop;
  zoneAccent() maps the EXISTING zone tone → left-edge hue (ok teal / watch
  amber / warn+danger rose / no-data violet-faint). Zone chips stay the source
  of truth; BP crisis alert box keeps its border (an alert, not decoration).
- HEALTH SCORE (supporting cast): ring numeral `.sys-display-md` + new
  useCountUp; subscore values text-xs → text-sm bold; subscore bars + sys-seg.
- MAINTENANCE rows → sys-accent-row keyed by status (met teal / behind amber /
  nodata zinc — STATUS_ACCENT map); footer divider border-t → .sys-hairline.
- VitalsSnapshot (Status-tab insert) deliberately untouched — cross-tab
  territory.

## Verification (all green)
- bunx tsc --noEmit → 0 src errors (only the 4 pre-existing examples/skills
  ignorable errors; a transient gates-tab.tsx error seen mid-session was a
  concurrent R9 agent's in-flight edit, resolved by their final state).
- bunx eslint on both files → exit 0.
- agent-browser isolated read-only session (r9c) at 390×844:
  - FUEL: scrollWidth 390; section headers 01/02(teal)/03 present in DOM;
    ring numeral "2590" computed 33.15px/900/ls-1.49px + bloom class on Sep 27
    (130 kcal logged), "2720" on today; protein hero teal display numeral;
    3 sys-seg meters; below-fold FlowReveals measured opacity:0 + transform
    pre-scroll → opacity:1 after scroll (gating CONFIRMED); Sep 27 accent rows:
    SKIP row zinc rgba(113,113,122,.5), "Roti / Chapati" violet neutral; zero
    console/page errors; date-nav arrows (client-side) drove the Sep-27 check;
    NO data-logging clicks.
  - VITALS: scrollWidth 390; headers 01/(02 amber)/(03 teal); health-score
    numeral live at 33px→48px (clamp verified at 1280×800 too, no overflow);
    6 subscore seg bars; 13 accent rows (5 risk cards + 8 maintenance rows)
    with correct tone-keyed hues (BP/RHR/SpO₂ ok→teal, HRV/waist violet,
    maintenance met/behind/nodata mix); hairline present; scroll-reveals fire;
    zero console/page errors.
  - Readiness display numeral could NOT be live-verified: readiness is null
    today (no vitals logged 2026-10-03; DB untouched per rules) and
    /api/readiness is today-only — structurally verified (same class family
    live-verified on the ring + health score); flagged in the report.
  - Desktop 1280×800: FUEL display numerals at 48px clamp max, no overflow.
  - Screenshots: r9c-fuel-hero / r9c-fuel-science-zone / r9c-fuel-desktop /
    r9c-vitals-hero / r9c-vitals-zones.
- Infra note: dev server was found DEAD mid-session (documented OOM pattern,
  no listener on :3000) → respawned via the documented detached double-fork
  procedure; one racing concurrent spawn hit EADDRINUSE and died, exactly one
  next-server (pid 6889) now serves; dev.log all 200s after.
- git status: my edits = fuel-tab.tsx + vitals-tab.tsx ONLY (+5 r9c-* screenshots
  as untracked). Other modified files belong to the orchestrator foundation and
  concurrent R9 agents (gates/status/records/directives/hunter-card/stat-grid/
  xp-bar) — untouched by me.

## Locked/platform notes for the orchestrator
- FLOWREVEAL-IN-FLOWGROUP GOTCHA (motion.tsx is locked): placing FlowReveal
  inside FlowGroup self-reveals on mount (variant propagation animates any
  child that defines the propagated "visible" label). Both my tabs therefore
  use a PLAIN root div with FlowGroup only around the above-fold zone. Other
  R9 application agents should follow the same pattern or FlowReveal's
  whileInView silently no-ops. Root cause chain (framer-motion 12.26.2):
  isControllingVariants(whileInView/initial labels)=true blocks CONTEXT
  inheritance, but animateVariant→animateChildren still directly animates
  variantChildren by the parent's label.
- activity-rings.tsx is NOT involved in FUEL's kcal ring (it renders the STATUS
  tab) — no ring limitation existed for this task.
