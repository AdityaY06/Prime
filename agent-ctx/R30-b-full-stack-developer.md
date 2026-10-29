# R30-b · full-stack-developer — GPX export for the GPS route recorder

Task ID: R30-b
Agent: full-stack-developer
Round: PRIME fitness app, Next.js 16 App Router, single `/` route, Tailwind v4, bun. Dev server pre-running on :3000 (never restarted, never built).

## Task
GPX export — the universal interchange format every fitness platform (Strava, Komoot, Runalyze) ingests: a pure GPX 1.1 serializer, the artifact frozen on RouteSummary at stopRoute (points still released; persist untouched), and an "EXPORT ROUTE · GPX" button on the route summary card with the honest <2-fix disabled state.

## Files owned & touched
- NEW `src/lib/sensors/gpx.ts` (111 lines) — pure GPX 1.1 serializer.
- `src/store/sensor-store.ts` (512 lines) — RouteSummary.gpx + stopRoute freeze + altitude through the watch pipe.
- `src/components/fitness/sensor-hub.tsx` (887 lines) — GpxExportButton + downloadGpx.
- NOTHING ELSE. A parallel agent owns session-raid.tsx + src/lib/rpe.ts — untouched. gps-route.ts deliberately untouched (not this round's file).

## Design decisions (for future rounds)
1. **RoutePoint has no altitude** (gps-route.ts, R21-c: lat/lon/accuracy?/t). Rather than editing the pure math module, the store's watchPosition pipe pushes fixes typed `RoutePoint & { alt?: number }` (`pos.coords.altitude ?? undefined` — no excess-property lint hit because the literal is assigned to the widened type first), and gpx.ts reads altitude tolerantly via `(p as GpxPoint).alt`. `<ele>` therefore only ever appears when the platform actually reported altitude.
2. **GPX frozen at stop, before point release**: stopRoute snapshots `startedAt`, calls `routeToGpx(r.points, { name: "PRIME {formatDistance} {YYYY-MM-DD}", startedAt ISO, distanceM, movingMs })`, stashes the string on the summary, then releases points to `{...IDLE_ROUTE}` exactly as before. resetRoute clears summary+gpx together. Partialize untouched — localStorage `prime-sensor-link` verified post-QA to contain ONLY {maxHrOverride, lastDeviceName}.
3. **Honest degenerate state**: routeToGpx returns null for <2 exportable fixes (non-finite lat/lon points are dropped and can push a thin track below the floor). The button renders disabled with muted zinc-500 "ROUTE TOO SHORT TO EXPORT — NEEDS 2+ GPS FIXES." in BOTH branches (full summary card + the 0-fix NO GPS FIX branch).
4. **Download discipline**: the shared `downloadTextFile` from `@/lib/export/csv` (Blob → objectURL → anchor appendChild → click → remove, URL revoked on 4s timeout) with MIME `application/gpx+xml`. Filename `prime-route-{YYYYMMDD-HHmm}.gpx` derived from the ROUTE's startedAt (verified live via an anchor-click hook: `prime-route-20261010-1732.gpx`). KB label = `(new Blob([gpx]).size / 1024).toFixed(1)` — the export-center idiom.
5. **GpxMeta's distanceM/movingMs are the naming contract only** — GPX 1.1 metadata carries name+time per spec; the numbers are NOT serialized into the document (documented in the gpx.ts header).

## GPX structure shipped
```
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PRIME Training System" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>PRIME 189 M 2026-10-10</name>
    <time>2026-10-10T17:32:48.710Z</time>
  </metadata>
  <trk>
    <trkseg>
    <trkpt lat="60.169800" lon="24.938400">
      <ele>12.3</ele>
      <time>2026-10-10T17:32:48.810Z</time>
    </trkpt>
    … (lat/lon toFixed(6), ele toFixed(1) only when the fix had altitude, ISO time per finite t)
    </trkseg>
  </trk>
</gpx>
```
Name XML-escaped (& < > " '); ONE trk / ONE trkseg; light 2-space indent + trailing newline.

## QA results
- eslint on the 3 files: exit 0 (run twice).
- Scratch QA (bun, deleted after): **19 PASS / 0 FAIL** — degenerate nulls (0/1 pts, NaN-lat drop), full structure asserts, escaping round-trip, empty-name meta, flat no-ele route, non-finite-t no per-point time.
- Downloaded-file verify (bun, deleted after): **12 PASS / 0 FAIL** on /tmp/r30b-route.gpx (1189 B, deleted after).
- Browser QA (agent-browser session r30b, fresh profile, 390×844): synthetic fake-watchPosition 8-point fixture → START RECORDING → 8 POINTS → STOP → summary card + EXPORT ROUTE · GPX · 1.2 KB enabled (screenshot `screenshots/r30b-summary-gpx.png`); download via `agent-browser download` verified; degenerate 0-point AND 1-point cases both show the disabled button + "ROUTE TOO SHORT TO EXPORT" (screenshot `screenshots/r30b-degenerate-short.png`); both routes DISCARDed (LOG AS RAID never tapped — dev.log grep: zero POST /api/gps-log); `agent-browser errors` EMPTY; scrollWidth 390.
- DB PURITY: 12 WorkoutSessions / 11 ExerciseLogs / 31 BodyMetrics / 15 XpEvents / KAEL L11·xp118·totalXp2943·77.5kg — identical before/after (readonly node scripts; bun cannot require @prisma/client in this sandbox — `node` works). NOTE: custom.db md5 shifted 7c3458…→6f1564… from AMBIENT app behavior (the dev server's own 2026-10-10 daily-quest generation, mtime 17:31:58 predates the route QA; no sacred-table row changed) — not this round.
- dev.log tail clean (all 200s; the parallel agent's traffic shares the server, no errors).

## Gotchas for future rounds
- bun can't `require('@prisma/client')` here (module resolution error from the bun cache) — use `node -e` for readonly DB scripts.
- The recorder's GPS watch persists across routes: after STOP RECORDING the watch stays live, so a re-armed fake watchPosition is NOT consulted on the next START RECORDING (gpsWatchId !== null short-circuits startGps). Tap STOP GPS (visible on the GPS LINK card when route idle + summary null) or reload before re-arming a synthetic fixture.
- `agent-browser find text` fails on buttons whose text is split by icon nodes — click via `[...document.querySelectorAll('button')].find(x => x.textContent.includes('…')).click()` in eval instead.
- `agent-browser download <sel> <path>` clicks and saves, but does NOT report the browser-proposed filename — hook `HTMLAnchorElement.prototype.click` to capture `this.getAttribute('download')`, then `delete HTMLAnchorElement.prototype.click` to restore the native method.
