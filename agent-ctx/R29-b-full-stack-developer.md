# R29-b — full-stack-developer · Working Record

**Task:** Re-land of two sandbox-rollback-wiped layers (recovery #5): (1) science content layer, (2) HRV training modulation. Current disk at arrival = clean R22-era code (last worklog entry R22). Both layers rebuilt from the authoritative R29-b spec — no invented designs.

## Ground truth at arrival

- `worklog.md` tail → R22 close-out; Strain Coach never landed (R23 was the rollback illusion).
- Dev server alive on :3000 (next-server v16.1.3). DB baseline confirmed: 12 WorkoutSessions / 11 ExerciseLogs / 31 BodyMetrics / 15 XpEvents / KAEL L11 xp 118 totalXp 2943 weightKg 77.5, streak 1. hrv BodyMetric rows exist but dated 2026-09-27..29 (stale vs today 2026-10-10 → live readiness must honestly return nulls).
- Gate ids on disk: gale-fields/Cardio (Wind), iron-forge/Strength (Dumbbell), titan-trial/Calisthenics (Swords), flow-sanctum/Mobility (Waves), colossus-gate/Full Body (Castle). Existing R7-era `GATE_EVIDENCE` map carried study-level citations (SCHOENFELD 2016/2017) — spec says replace.
- `ReadinessRes` consumers: readiness-banner.tsx, gates-tab.tsx (already fetches /api/readiness — reused for the strip), vitals surfaces. ReadinessRes extension must be additive-optional.
- Oracle tip route: TABS order status/records/directives/fuel/body/vitals/gates; every tip function degrades to null rather than lying.

## Deliverables (files owned — nothing else touched)

| File | Delta | What |
|---|---|---|
| `src/lib/science.ts` | NEW 127 | 14-entry consensus field manual + scienceFor + SCIENCE_BY_TOPIC; org-level labels only (WHO 2020 / ACSM / ISSN / NSCA / CONSENSUS / GENERAL GUIDANCE) |
| `src/lib/health.ts` | +56 | HrvModulation types, HRV_MODULATION_META, pure hrvTrainingModulation (cut ≤−20, light ≤−8, primed ≥5, else aligned; null on missing/implausible); ReadinessRes += hrvMs?/hrvPctDeviation?/hrvModulation? |
| `src/app/api/readiness/route.ts` | +29 | "hrv" in metric types; baseline via generic rhrBaselineFromRows; latest = most recent ≤2-day row; modulation computed ROUTE-SIDE (one site); raw numbers + object passthrough |
| `src/components/fitness/gates-tab.tsx` | +80 | GATE_EVIDENCE → GATE_SCIENCE (scienceFor per gate archetype); FlaskConical "SCIENCE · body · source" footnotes (text-[10px] zinc-500); HrvModulationStrip above the gate grid (4 chips amber/rose/teal/violet, aria-current on active, honest null state) |
| `src/components/fitness/status-tab.tsx` | +52 | FieldManualPanel — useSyncExternalStore(subscribeNoop, epoch-day, 0) rotation, 4 consecutive entries from (day*4)%14, placed after DailyBriefing |
| `src/app/api/oracle/tip/route.ts` | +19 | [FIELD MANUAL] family: fills null-tip tabs on (epochDay+tabIndex)%3===0; state tips keep priority; rotates all 14 entries |
| `src/components/fitness/fuel-tab.tsx` | +12 | protein row re-sourced: scienceFor("issn-protein") body + "ISSN" label (MORTON 2018 gone) |

Gate→science mapping (by on-disk training character): gale-fields→who-aerobic, iron-forge→nsca-overload, titan-trial→muscle-hypertrophy, flow-sanctum→ramp-warmup, colossus-gate→who-strength.

## Deviations from spec (with reasons)

1. **Readiness route computes modulation route-side** — spec's authoritative DECISION paragraph (route passes `hrvModulation: HrvModulation | null` alongside raw `hrvMs`/`hrvPctDeviation`); followed exactly. The pure function stays in health.ts.
2. **`hrvPctDeviation` derives from `hrvModulation.pctDeviation`** (not computed twice) — guarantees the two numbers can never disagree; spec only demanded rounded-0.1 %.
3. **Latest-HRV recency inlined in the route** (day-diff via local-midnight Date math mirroring rhrTrendFromRows) instead of calling rhrTrendFromRows wholesale — keeps hrvMs honest-independent of baseline availability, per the spec's "factor a tiny shared helper or inline the same pattern" option.
4. **Oracle tip cadence semantics**: "science tip leads" implemented as fills-null-only (state tips always keep priority) — the only self-consistent reading of "science is the fallback flavor, never overriding a critical state warning". Documented in the route comment.
5. **FIELD MANUAL labelAccent** adds "4 OF 14 · DAILY ROTATION" with FlaskConical — matches the VolumeLandmarksPanel labelAccent idiom (spec said match existing panel styling).

## QA ladder — results

1. **STATUS FIELD MANUAL** — PASS. 4 rows render (today start=8: sleep-athletes, ramp-warmup, hydration, polarized) with right-aligned sources; VLM-verified legible, no overlap. Screenshot `screenshots/r29b-status-fieldmanual.png`.
2. **GATES deep-link** — PASS. 5 "SCIENCE ·" footnotes (bodies verified per gate); HRV strip null state: all 4 chips computed opacity 0.4, no aria-current, "LOG HRV IN VITALS TO UNLOCK TRAINING MODULATION" present. Screenshot `r29b-gates-null.png`. (VLM misread dimmed amber as "lit" — settled by DOM computed-style truth.)
3. **HRV LIVE via fetch override** (R21-c/R22-b precedent) — PASS. Mock {hrvMs:36, hrvPctDeviation:-22.5, hrvModulation:{band:"cut",…}} → CUT INTENSITY opacity 1 + aria-current="true" (others 0.4/null), advice + "HRV 36 MS · -22.5% VS 7-DAY BASELINE" both VLM-quoted exactly. Fetch restored via reload. Screenshot `r29b-gates-cut.png`. Bonus: [FIELD MANUAL] oracle tip rendered end-to-end via the same mock pattern.
4. **curl /api/readiness** — PASS. `"hrvMs":null,"hrvPctDeviation":null,"hrvModulation":null` (honest nulls, stale DB), no error.
5. **curl oracle tip?tab=status ×3** — PASS. Stable identical responses; state tip flows (4 GOALS UNCLAIMED · STREAK 1D). No [FIELD MANUAL] today — status's cadence hit but the state tip correctly keeps priority; branch covered by scratch replica.
6. **agent-browser errors / overflow** — PASS. Errors EMPTY on STATUS, GATES(Training), FUEL, VITALS; scrollWidth = 390 at 390 viewport everywhere.
7. **Scratch QA (bun, deleted)** — PASS 106/0. All spec cases incl. boundary (36.8,46)→exactly −20.0 IS cut; (null,46)/(45,null)/(45,0)→null; scienceFor lookups + SCIENCE_BY_TOPIC coverage; honesty regexes; rotation wrap; cadence replica. (Two initial failures were my fixture math — fixed, code correct.)
8. **dev.log** — PASS. Clean tail (100/100 recent 200s).

Plus: eslint exit 0 on all 7 files; DB purity byte-verified (counts + KAEL stats identical; zero writes — git byte-diff on custom.db predates the session, md5 stable across pure reads).

## Environment incidents + lessons

- **Turbopack stale-module trap**: after editing health.ts, the readiness route compiled but linked the OLD module namespace → "hrvTrainingModulation is not a function". `touch` did NOT bust it; a real content change did. If a route throws "not a function" after a shared-lib edit, force a content change in the lib (append+remove a comment), don't restart the server.
- **OOM mid-QA**: dev server (next-server ~2GB RSS) killed while multiple agent-browser Chrome instances ran on the 4GB box. Remedy: closed orphaned Chromes (freed ~1.5GB), restarted dev via nohup double-fork, confirmed single :3000 listener. Keep ONE browser session during QA.
- The browser reload after server death showed "SYSTEM FAULT / Failed to fetch" — that's the app's own honest offline state, not a bug.

## Watch-items for future rounds

- Live HRV modulation stays null until the user logs fresh HRV in Vitals (DB rows are 2026-09-27..29). The strip's locked state is the correct honest behavior.
- [FIELD MANUAL] oracle tips are only observable on cadence days with null-tip tabs; a QA-only query param could make them curl-verifiable if wanted.
- status-tab FieldManualPanel day rotation uses epoch days (`Math.floor(Date.now()/86400000)`) — same snapshot idiom the spec's snippet prescribes.
