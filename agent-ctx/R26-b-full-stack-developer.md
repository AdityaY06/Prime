# R26-b — HRV-guided training modulation (full-stack-developer)

## Task
Per-gate intensity advisories from today's HRV percent deviation vs the 7-day
rolling baseline (Plews at the point of choice), rendered on the TRAINING-tab
gate cards: suppressed days → amber "CUT INTENSITY" on high-multiplier gates +
teal "RECOVERY-ALIGNED" on recovery gates; hard suppression → rose "TRAIN
LIGHT"; elevated days → violet "PRIMED" on high gates only.

## Disk truth found (one correction to the dispatch)
- The dispatch claimed `/api/readiness` "returns hrvMs + hrvPctDeviation
  (lines ~112–121)". FALSE on disk: those lines compute the values and feed
  them into `readinessScore`, but the response DTO was
  `{ readiness, rhrTrend, hrvTrend, week, nextDay }` — no top-level deviation
  (curl-verified). The deviation existed only inside `hrvTrend.pctDeviation`,
  which uses ≤2-day-LATEST semantics (not the score's today-only semantics).
- FIX: `ReadinessRes` + the route response gained `hrvMs` + `hrvPctDeviation`
  (additive; the route is the only ReadinessRes constructor; every other
  consumer is read-only). This honors the spec's exact consumption pattern
  (`readiness.data?.hrvPctDeviation`) AND keeps the advisories on the same
  today-only signal the readiness score + coach verdict consumed — chips can
  never fire on a day the score ignored HRV.

## Edits
- `src/lib/health.ts` (+54):
  - `hrvTrainingModulation(hrvPctDeviation: number | null | undefined): HrvModulation`
    placed right after `hrvContribution`. Types:
    `HrvModulationTone = "suppressed" | "suppressed-hard" | "elevated"`;
    `HrvModulation = { active: false } | { active: true; tone: HrvModulationTone; pct: number }`.
    Thresholds REUSE `HRV_PCT_THRESHOLDS` (≤−20 hard / ≤−8 suppressed / ≥+5
    elevated; steady zone, null, undefined, non-finite → `{ active: false }`).
  - `ReadinessRes` gains `hrvMs: number | null` + `hrvPctDeviation: number | null`
    (today-only semantics documented in-type).
- `src/app/api/readiness/route.ts` (+14/−2): response object carries
  `hrvMs: hrvToday` + `hrvPctDeviation` (pure passthrough of values already
  computed for readinessScore).
- `src/components/fitness/gates-tab.tsx` (+100/−1):
  - `HRV_HIGH_INTENSITY_MULT = 1.2`, `HRV_RECOVERY_MULT = 1.1`
    (xpMultiplier is the catalog's intensity proxy).
  - `HRV_CHIP_STYLE` (DriverChip/BAND_CHIP idiom — tone text + rotated-45 dot
    on zinc-900/90 chip): cut amber-400 / light rose-300 / primed violet-300 /
    aligned teal-300.
  - `hrvPctLabel` — U+2212 minus, whole percent ("−12%" / "+7%").
  - `hrvGateChip(mod, gate)` — the matrix (see below); returns null for
    steady/inactive, elevated-on-recovery (honest non-endorsement), and gates
    between the class edges (defensive).
  - `GatesTab` computes `hrvModulation` once from
    `readiness.data?.hrvPctDeviation`; each gate card renders the chip in a
    `{chip && <div className="relative mt-3">…}` between the exercise chips
    and the START button — purely conditional (no reserved space), aria-label
    carries the full advisory, informational never a button.

## Chip matrix (tone × gate class → color / text)
| HRV tone | High gates (≥1.2: Strength 1.25, Calisthenics 1.2, Full Body 1.6) | Recovery gates (≤1.1: Mobility 1.0, Cardio 1.1) |
|---|---|---|
| suppressed (−8..−20) | amber `HRV −12% · CUT INTENSITY` | teal `HRV LOW · RECOVERY-ALIGNED` |
| suppressed-hard (≤−20) | rose `HRV −23% · TRAIN LIGHT` | teal `HRV LOW · RECOVERY-ALIGNED` |
| elevated (≥+5) | violet `HRV +7% · PRIMED` | — nothing (honest) |
| steady / null / absent | — nothing | — nothing |

## Verification ladder
- Scratch suite (`/home/z/r26b-scratch`, bun, real module imports, DELETED):
  **47 PASS / 0 FAIL** — spec edges (null, undefined, −20.0→hard, −19.9→
  suppressed, −8.0→suppressed, −7.9→inactive, +4.9→inactive, +5.0→elevated,
  0→inactive), NaN/±Infinity→inactive, deep excursions carry pct unchanged,
  threshold source === HRV_PCT_THRESHOLDS, 20-sample zone-alignment vs
  hrvContribution (active ⇔ non-zero contribution), union key-shape, purity.
- Browser (agent-browser session r26b, 390×844, network-route fetch-mocks,
  ZERO DB writes):
  - (a) unmocked before/after: 5/5 gate-card outerHTMLs BYTE-IDENTICAL
    (twice), 0 chips, scrollWidth 390 — regression guard green.
  - (b) full ReadinessRes DTO mock with hrvPctDeviation −12: amber CUT
    INTENSITY ×3 (Strength/Calisthenics/Full Body) + teal RECOVERY-ALIGNED ×2
    (Cardio/Mobility); banner renders mocked MODERATE band + HRV driver chip
    (full-DTO contract held); START button 44px.
  - (c) −23 → rose TRAIN LIGHT ×3 + teal ×2; +7 → violet PRIMED ×3, recovery
    gates nothing (3 chips).
  - (d) unroute + reload → 0 chips, honest NO VITALS banner, console clean,
    zero page errors; STATUS + VITALS sweep clean with extended DTO.
  - localStorage cleared, session closed.
- eslint (3 touched files) exit 0. `bunx tsc --noEmit` ONCE at end: ZERO
  src/ errors (only the 4 documented examples/skills exceptions).
- dev.log: 200s only (POST /api/tts = pre-existing briefing voice synthesis,
  DB-free route). DB purity byte-identical: 12 sessions / 11 logs / 31 metrics
  / 3 hrv rows, KAEL L11/118/2943.

## Screenshots (screenshots/)
r26b-before-unmocked.png, r26b-before-unmocked-revealed.png,
r26b-before-cards-viewport.png, r26b-after-unmocked.png,
r26b-after-cards-viewport.png, r26b-suppressed12-viewport.png,
r26b-suppressed12-full.png, r26b-suppressed23-viewport.png,
r26b-elevated7-viewport.png, r26b-elevated7-full.png,
r26b-final-unmocked.png.

## Watch-items
- RiftBanner's "TRAIN THE BONUS" + BossBanner carry no chips (scope: the 5
  catalog gate cards; the featured rift gate's own card carries the advisory).
- Modulation reads TODAY-only deviation — every-other-day HRV loggers see
  advisories only on logged days (same signal the score consumed;
  hrvTrend.pctDeviation remains available for a "recent-HRV" variant).
- Pixel-diff of full-page screenshots is inherently noisy on this app
  (scroll-dependent FlowReveal states + ambient animations) — DOM
  byte-comparison is the regression authority; screenshots are for eyeballing.
