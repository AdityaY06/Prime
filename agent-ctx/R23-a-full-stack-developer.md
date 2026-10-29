# R23-a — GPX 1.1 export of recorded GPS routes (Strava/Garmin/Runkeeper bridge)

Task ID: R23-a · Agent: full-stack-developer · Status: SHIPPED + VERIFIED

## What was built
The ROUTE RECORDER's missing interoperability half: the stopped ROUTE SUMMARY now carries an **EXPORT GPX** action that serializes the frozen in-memory fix log as a standards-compliant GPX 1.1 document and dispatches it through the R20-c Web Share bridge (OS share sheet → Strava upload / Gmail / Drive; honest direct download otherwise). Zero DB writes, zero new dependencies, zero new routes.

## Files
- `src/lib/export/gpx.ts` (NEW, ~230 lines, pure — no DOM, no store imports): `buildGpx` (XML decl + gpx root w/ standard schemaLocation attrs, metadata name/desc/time in XSD-verified order, ONE trk + ONE trkseg + per-fix trkpt lat/lon 6dp + ISO8601-UTC-ms time), `gpxFileName` (prime-route-YYYY-MM-DD-HHmm.gpx, UTC), `gpxStats` (distance via cumulativeDistanceM + kept points + start→end ISO + skip disclosure), `sanitizeTrackPoints` ({points, skipped} — drops non-finite/out-of-range coords + non-finite t, COUNTS every drop), `isPlausibleGpx` (regex structural round-trip check for QA). NO `<ele>` ever (RoutePoint carries no altitude — fabricated 0 would render as a confident sea-level flatline).
- `src/lib/export/share.ts` (EDIT): + `shareGpxFile` — third sibling of the shareCsvFile/shareJsonFile idiom, `application/gpx+xml`, same never-throw contract + AbortError-is-dismissal semantics; download fallback reuses the text-generic `downloadTextFile`.
- `src/store/sensor-store.ts` (EDIT): `RouteSummary` gained `points: RoutePoint[]` — stopRoute() now freezes the fix log INTO the summary (reference; pushRoutePoint never mutates, always fresh arrays). Honest source for the export: the LIVE recorder buffer is still released at stop, the frozen copy dies with the summary on reset/discard/next-start. Persist partialize untouched (routeSummary was never persisted).
- `src/components/fitness/sensor-hub.tsx` (EDIT): EXPORT GPX button (h-11/44px, violet-500/60 idiom matching LOG AS RAID, FileDown icon, spinner while exporting, disabled when no plausible coords) between LOG AS RAID and DISCARD; exportRouteGpx handler (never consumes the route); notification-stack toast "ROUTE EXPORTED — STRAVA-READY" + filename/outcome body (pushNotice idiom from export-center); emerald inline "GPX EXPORTED — STRAVA · GARMIN · RUNKEEPER READY" note; amber "NO VALID GPS COORDINATES — NOTHING TO EXPORT" + zinc "N FIXES DROPPED FROM EXPORT" honest notes; zero-fix copy widened to "NO GPS FIX — NOTHING LOGGED OR EXPORTED."; exportPhase reset on start/discard; footer copy updated.

## KEY DECISION — `<type>` element (spec asked to check the docs)
Verified against the OFFICIAL XSD (fetched live: topografix.com/GPX/1/1/gpx.xsd): `trk/type` is a **free-form xsd:string** ("Type (classification) of track.") with NO numeric enumeration; the spec's suggested "9" is a Strava/Garmin vendor export convention, not the schema. Honest choice: the human-readable string `running` — PRIME's recorder is a run recorder by design (OUTDOOR RUN copy, min/km pace), importers that read types get a real word, importers that ignore it lose nothing. Schema orders byte-verified too (metadata: name,desc,…,time; trk: name,…,type,…,trkseg; lat∈[-90,90], lon∈[-180,180]).
- Empty-input behavior (spec offered valid-empty vs thrown guard): **valid GPX, empty trkseg, NO metadata time** — absence, not fabrication; documented in-file.

## Verification
- Scratch bun suite (30/30 PASS, deleted after; sample artifact byte-inspected): exact head/tail, 3×trkpt 6dp coords + ISO8601 ms times, XML escaping of `&<>"'` in both name slots + desc, skip-and-count (NaN/∞/out-of-range/non-finite-t), empty-GPX shape, isPlausibleGpx round-trips, gpxFileName format + padding + non-finite fallback, gpxStats line, desc-before-time schema order.
- `bunx tsc --noEmit` (run ONCE): only the 4 documented pre-existing examples/skills errors — zero new src/ errors.
- `bunx eslint <4 touched files> --ext .ts,.tsx`: exit 0.
- Browser QA (agent-browser, session r23a, viewport 390×844, fake GPS via watchPosition override — 4 synthetic fixes ~4.5 m apart / 500 ms): VITALS tab → START RECORDING → live readout (9 M, REC) → STOP → ROUTE SUMMARY with EXPORT GPX (44px, enabled, violet) → click → toast "ROUTE EXPORTED — STRAVA-READY · prime-route-2026-10-08-0411.gpx · GPX 1.1 · DOWNLOADED" + inline emerald note + summary/LOG AS RAID still up (export consumes nothing). Zero-fix path: silent watch → STOP → "NO GPS FIX — NOTHING LOGGED OR EXPORTED." + NO export button. Console + page errors clean after reload (one transient Fast Refresh parse blip mid-edit, gone on reload; dev.log all 200s). Screenshot: /home/z/r23a-scratch/r23a-route-summary.png.

## Notes for next agents
- RouteSummary.points is the frozen-at-stop fix log — any future summary consumer (map render, TCX export) should read it, NOT the live route buffer.
- Headless Chrome: canShareFiles() = false → the honest DOWNLOADED path is what QA exercises; the SHARED path needs a real device.
- Known pre-existing quirk (NOT R23-a scope): the first GPS fix is eaten by the startRecording race (startGps emits before startRoute arms) — synthetic runs anchor on fix #2.
