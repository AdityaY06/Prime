# R28-b — full-stack-developer · Science-Based Content Layer

Task: make PRIME a genuinely evidence-based exercise helper by surfacing consensus
sports-science guidance at the moments users make training decisions.

## Deliverables

### 1. `src/lib/science.ts` (NEW · 133 lines · pure, typed, framework-free)

Single audited source of truth. `ScienceEntry = { id, title, body, source }`.

14 shipped entries (all spec-required):

| id | title | source |
| --- | --- | --- |
| who-aerobic | Weekly aerobic target | WHO 2020 |
| who-strength | Weekly strength target | WHO 2020 |
| acsm-fitt | The FITT-VP framework | ACSM |
| issn-protein | Protein for adaptation | ISSN |
| nsca-overload | Progressive overload | NSCA |
| nsca-recovery | Recovery & supercompensation | NSCA |
| rpe-rir | RPE & reps-in-reserve | CONSENSUS |
| hrv-rmssd | HRV (rMSSD) recovery | CONSENSUS |
| sleep-athletes | Sleep for athletes | CONSENSUS |
| ramp-warmup | The RAMP warm-up | CONSENSUS |
| hydration | Hydration | GENERAL GUIDANCE |
| polarized | Polarized endurance | CONSENSUS |
| muscle-hypertrophy | Hypertrophy drivers | CONSENSUS |
| zone2 | Zone 2 aerobic base | CONSENSUS |

Helpers: `scienceFor(id)` (undefined on unknown ids — callers render nothing),
`SCIENCE_BY_TOPIC: Record<string, ScienceEntry[]>` for keys
`sleep / recovery / protein / cardio / strength / hrv / warmup`.

Honesty discipline: consensus positions only, "guidelines recommend" phrasing,
source labels = org + year at most (or honest CONSENSUS / GENERAL GUIDANCE);
zero study citations, journals, DOIs.

### 2. `src/components/fitness/gates-tab.tsx` (+69/−20 → 774 lines)

- `GATE_SCIENCE: Record<gateId, string[]>`:
  gale-fields → [who-aerobic, zone2, polarized]; iron-forge → [nsca-overload,
  muscle-hypertrophy]; titan-trial → [muscle-hypertrophy, nsca-overload];
  flow-sanctum → [ramp-warmup]; colossus-gate → [who-strength, acsm-fitt].
- `ScienceFootnote` component: ONE muted line per gate card
  (`text-[10px] text-zinc-500`, `FlaskConical` teal glyph, `SCIENCE ·` prefix,
  org source label). Deterministically rotates by local day-of-year.
- Supersedes the R7-c `GATE_EVIDENCE` block (same slot, same facts — the
  Schoenfeld study-level cites give way to org-level labels; no stacked
  duplicate science lines).

### 3. `src/components/fitness/status-tab.tsx` (+52 → 501 lines)

- `FieldManualPanel`: compact SystemPanel between the data-utilities grid and
  section 03. 4 rotating entries (window = dayOfYear..+3 over all 14), exact
  existing panel idioms (label + `FlaskConical · CONSENSUS SCIENCE`
  labelAccent, `p-4 sm:p-5`, title·source mono row + zinc-400 body).
  Read-only text — nothing interactive.

### 4. `src/app/api/oracle/tip/route.ts` (+39 → 486 lines)

- `FIELD_MANUAL: Record<TabId, readonly string[]>` — all 14 entries pooled
  across the 7 tabs (6+ per spec, 14 shipped).
- Selection logic (after the existing per-tab state switch, inside the GET):
  - cadence: `(dayOfYear + tabIndex) % 3 === 0` → the tab's `tip` becomes
    `[FIELD MANUAL] <body> · <SOURCE>` (staggered: 2–3 tabs carry the manual
    on any day; each tab alternates state-read / manual every 3rd day);
  - null-state fallback: a null state tip always falls back to the manual —
    the oracle is never silent;
  - the state `evidence` line is preserved on manual days.
  Deterministic only (day-of-year + tab index, no RNG). No new params,
  no new endpoints — existing GET only.

### 5. `src/components/fitness/fuel-tab.tsx` (+18/−2)

- Fuel Science panel protein row now module-driven:
  `1.6-2.2 G/KG/DAY PROTEIN SUPPORTS ADAPTATION (ISSN)` with the cite sourced
  via `scienceFor("issn-protein")`; the state-reactive tail
  (`YOUR TARGET = 1.8 G/KG — IN RANGE`) preserved.
- **Documented deviation**: no separate `SCIENCE ·` footnote line was added —
  the panel already renders this exact position as its one-line row; a second
  line would duplicate the fact. The module wiring + org-level ISSN label is
  the upgrade.

## Key engineering decision — hydration-safe daily rotation

The spec suggested useEffect-set state; the repo's new
`react-hooks/set-state-in-effect` rule flags that pattern (it failed lint).
Resolution: `useSyncExternalStore` with a no-op subscription —
server snapshot `0` (static first entries → stable SSR markup), client
snapshot = today's day-of-year, which React itself swaps in after hydration.
This is the framework-blessed idiom for exactly this client/server-divergent
value; zero date math influences the first render, zero hydration warnings
(console verified). Used in both `ScienceFootnote` (gates) and
`FieldManualPanel` (status); day-of-year computed via
`Math.floor((now − new Date(y,0,0)) / 86400000)` at module-scope snapshot
functions.

## QA ladder (fresh agent-browser session · 390×844)

1. **GATES tab** — PASS. Exactly 5 science footnotes render under the gate
   cards (texts verified per-gate; sources `WHO 2020 / NSCA / CONSENSUS /
   CONSENSUS / WHO 2020`); footnote in viewport (top 379 / bottom 421);
   screenshot `screenshots/r28b-gates.png` (224 KB).
2. **STATUS tab** — PASS. FIELD MANUAL panel renders 4 entries (today's
   window: FITT-VP·ACSM, PROTEIN·ISSN, PROGRESSIVE OVERLOAD·NSCA,
   RECOVERY & SUPERCOMPENSATION·NSCA); panel in viewport (top 285 / bottom
   560); oracle banner carries the `[FIELD MANUAL]` FITT-VP line; screenshot
   `screenshots/r28b-status.png` (281 KB).
3. **Oracle API** — PASS. `curl /api/oracle/tip?tab=status` →
   `[FIELD MANUAL] The FITT-VP framework (…) · ACSM` (repeat hits identical —
   deterministic). Also today (doy 282, `(282+i)%3===0` for i∈{0,3,6}):
   gates → polarized · CONSENSUS, fuel → issn-protein · ISSN; records (i=1)
   returned its normal state tip — proving the state selection logic is
   intact on non-manual days.
4. **Errors** — PASS. `agent-browser errors` empty; console shows only the
   benign React DevTools infos; zero hydration warnings.
5. **Overflow** — PASS. `document.documentElement.scrollWidth === 390` on all
   8 tabs (STATUS/GOALS/TRAINING/BODY/FUEL/VITALS/PROGRESS/REWARDS).
6. **dev.log** — PASS. All 200s, zero compile errors (grep for
   Error/error TS/Failed to compile → 0 matches).
7. **Lint** — PASS. `bunx eslint` on all 5 changed files → exit 0.

## Ops notes

- The platform dev instance OOM-flapped repeatedly mid-QA (dmesg:
  `oom-kill … next-server anon-rss ~1.85 GB` under the concurrent R28-a
  agent's load). Restarted `bun run dev` in background (the documented R22
  recovery pattern); healthy since — all routes 200. My agent-browser session
  was closed after QA to free memory.
- No file collisions with R28-a: touched only science.ts (new),
  gates-tab.tsx, status-tab.tsx, fuel-tab.tsx, oracle/tip/route.ts. The
  R28-a-owned files (reveal.tsx, system-panel.tsx, globals.css, page.tsx,
  records-tab.tsx) were not modified — confirmed via git status (their diffs
  belong to the other agent).
- DB: read-only round. Zero schema changes, zero dependencies, zero new
  routes/endpoints.
