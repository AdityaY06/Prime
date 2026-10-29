# R22-b · full-stack-developer · working notes

Task: RR-interval HRV from the BLE chest strap — full 0x2A37 parse (flags bits 3/4, energy skip, RR 1/1024 s → ms, 300–2000 ms plausibility gate) → pure RMSSD engine → live HRV readout in the sensor hub.

## Arrival disk-truth (the recurring timeout-with-delivery pattern — 4th occurrence)
A prior R22-b agent (dispatched concurrently with R22-a; worklog has NO R22-b entry — it timed out pre-report) landed ~all deliverables on disk as UNCOMMITTED diffs: extended bluetooth-hr.ts parser, hrv.ts, store wiring, hub StrapHrvReadout. This re-dispatch = audit-against-spec + fix deviations + full QA ladder + report (the R21-a/R21-c/R22-a recovery recipe).

## Ground truth (read before coding)
- `src/lib/sensors/bluetooth-hr.ts` — R20-b GATT client; ambient hand-typed Web Bluetooth surface MUST stay untouched; parser was BPM-only with a header note that RR fields exist.
- `src/store/sensor-store.ts` — zustand persist "prime-sensor-link", partialize = maxHrOverride + lastDeviceName ONLY (R21-c precedent: high-frequency data never persists); BPM writes throttled ≥1 s leading-edge + trailing flush.
- `src/components/fitness/sensor-hub.tsx` — HR STRAP card 5 states; honesty idiom: zinc-500 small print ONLY for gap states, "—" for absent data.
- `src/lib/sensors/hr-zones.ts` — display idiom reference (violet/teal/amber/rose house palette, no blue/indigo).

## Deliverables (prior agent's work verified + this agent's fixes)
1. `parseHrMeasurement(view): { bpm, rrIntervals, rrDropped }` — flags bit 0 HR format, bit 3 energy (skipped, never read), bit 4 RR section; ALL RR parsed UINT16 LE (1/1024 s → ms float); 300–2000 ms gate, implausible dropped + COUNTED; `parseHeartRateMeasurement` kept as BPM-only wrapper (all existing callers compile). PURE.
2. `src/lib/sensors/hrv.ts` (NEW, pure) — `rmssd(rrs)` over the LAST 30 intervals, null < 5 (honest floor); `createHrvTracker(opts?)` factory → { push, snapshot:{rmssdMs,sampleCount,lastRrMs}, reset }, buffer cap 120 (oldest evicted); `formatHrv` — "—" on null. NO sdnn/meanRR (not displayed).
3. Store — `hrvMs`/`hrvSamples` (+ `rrSeen`, `liveSinceAt` for the no-RR watchdog) on the strap slice; tracker is a module-level IN-MEMORY singleton (R21-c gps-route precedent); reset on connect/disconnect/drop/retry; hrv fields ride the SAME throttled BPM write (one set()/s); **partialize byte-unchanged**.
4. Hub — `StrapHrvReadout` scoped row under the live BPM: "HRV · RMSSD" violet big number, "N SAMPLES", "COLLECTING RR INTERVALS — RMSSD FLOOR 5" mid-state, 10 s no-RR watchdog → "NO RR FROM STRAP — HRV NEEDS A CHEST SENSOR" (zinc-500). No new interactive elements (readout only).

## THIS AGENT'S EDITS (3 surgical)
1. **Spec-API alignment in hrv.ts**: prior agent shipped `createHrvState()`; spec mandates `createHrvTracker(opts?)` → renamed fn + `HrvTracker` type, added `HrvTrackerOptions` {window, minIntervals, bufferCap} (sanitized: non-finite → default, finite-below-min → clamped, bufferCap ≥ window), extracted internal `rmssdOver` core shared by exported `rmssd` and the tracker snapshot. Store import updated.
2. **REAL BUG (found by live browser QA, fixed in bluetooth-hr.ts)**: the notification listener delivered `onBpm` BEFORE `onRr` — the store's throttled write snapshots the tracker, so the CURRENT notification's RR landed AFTER the read → the readout lagged one notification behind FOREVER on the last update (live repro: 5 intervals pushed, display stuck at 3 SAMPLES). Fix: RR delivered BEFORE the BPM (one line swap + documenting comment).
3. Scratch fixtures round 1 had MY OWN byte-order bug (RR encoded big-endian) — the parser rightly dropped them as implausible (5.86 ms / 40 s), which became proof of garbage robustness (kept as test 5h). Fixed fixtures → 70/70.

## KEY ENVIRONMENT LESSON (documented for future rounds)
After edit #2, a plain page RELOAD still ran the OLD code — the R20 service worker's **stale-while-revalidate on /_next/static** served the cached dev chunk (the chunk URL is stable across content changes; no-store on the wire is irrelevant when the SW answers first). An "impossible" one-behind symptom after a confirmed source fix = suspect the SW cache. Remedy used: fresh browser context (new profile = no SW, no HTTP cache). Unregistering the SW does NOT help — the app re-registers on every mount.

## Validation ladder (final, all green)
- `bunx tsc --noEmit`: ZERO src/ errors (only the 4 documented examples/skills).
- `bunx eslint` on the 4 touched files: exit 0.
- Scratch suite (/tmp/r22b-scratch.ts, bun, then DELETED): **70 PASS / 0 FAIL** — spec fixtures 1–8 (flags 0x00/0x01/0x10/0x18/0x19, RR 1024→1000 ms & 1536→1500 ms exact at correct offsets incl. past energy; 200/2500 ms dropped+counted; boundary 300.78/2000 kept; rmssd hand fixture √(825/4); <5 → null; window 30 proof (40 pushed → exactly 200, a 40-window would give ≈173.2); buffer 120 proof (200 pushed → 120 kept, unit-step rmssd exactly 1)); parser edges (empty/1-byte/energy-short/RR-flag-empty/trailing-odd-byte/backward-compat wrapper); tracker lifecycle (multi-notification accumulation, reset, non-finite junk guard); custom opts + junk-opts fallbacks; formatHrv.
- Browser (agent-browser session r22b, 390×844, fresh context after the SW lesson): hub renders; unsupported honest state intact (fresh tab, no navigator.bluetooth); **synthetic GATT mock injected** (fake requestDevice/server/characteristic firing real DataView 0x2A37 notifications) → full live flow: connect → live BPM + SYNTH H10 + zone; 10 s BPM-only stream → "NO RR FROM STRAP — HRV NEEDS A CHEST SENSOR" appears (0 SAMPLES, HRV "—"); first RR → note clears instantly → "COLLECTING RR INTERVALS"; 5 intervals → live "14" RMSSD + "5 SAMPLES" (hand-computed 14.44 over the quantized fixture ✓); rolling update → "19" + "7 SAMPLES" (hand-computed 19.05 ✓). No horizontal overflow (scrollWidth 390). Console clean (only benign dev messages). 3 screenshots archived.
- dev.log after QA: clean (200s only, no new errors).
- DB PURITY: read-only check — hunter KAEL L11/xp 118/totalXp 2943/77.5 kg, 12 sessions, 11 logs, 15 xpEvents, 31 metrics = the R22-a final baseline, byte-identical. ZERO DB writes (pure client layer).
- Scratch files deleted; browser localStorage cleared; session closed.

## Watch-items for future rounds
- Hardware verification still shifts to the user's device (headless has no real Web Bluetooth — the GATT mock proves the wiring, not the radio).
- The rolling RMSSD is a LIVE estimate over ~30 s of beats — it is NOT the overnight/sleep HRV baseline Oura/Whoop use for readiness; the vitals Risk Monitor's logged HRV (manual check-in) remains the baseline surface. Do not conflate them in future readiness work without a capture protocol (e.g. a 5-min morning reading flow).
- sw.js stale-while-revalidate poisons dev-chunk reloads after ANY in-place edit — consider busting SW cache for /_next/static in dev (check `location.port`/NODE_ENV) in a future hardening round.
