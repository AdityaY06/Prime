# Task 20-b — full-stack-developer — PWA (manifest + offline shell + install) & Monthly Digest

## Scope (file ownership honored — no other file touched)
- NEW `src/app/manifest.ts` — Next.js MetadataRoute.Manifest at `/manifest.webmanifest`
- NEW `public/sw.js` — hand-written dev-safe service worker (127 lines)
- NEW `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — rendered from `public/logo.svg` via cairosvg+Pillow (zinc-950 tile; maskable variant has extra safe-zone padding)
- NEW `src/components/system/sw-register.tsx` — SW registration + OFFLINE pill (useSyncExternalStore on navigator.onLine)
- EDIT `src/app/layout.tsx` — mounted `<SwRegister />` in body; viewport themeColor #07060c → #09090b (zinc-950, matches manifest)
- EDIT `src/components/fitness/settings-dialog.tsx` — INSTALL PRIME section above DANGER ZONE
- NEW `src/app/api/monthly-summary/route.ts` — rolling 30-day digest GET
- NEW `src/components/fitness/monthly-summary.tsx` — MONTHLY DIGEST card
- EDIT `src/components/fitness/status-tab.tsx` — +1 import, +2 lines (mount below WeeklyReview)

## PWA design decisions (dev-safety first)
- sw.js fetch handler: non-GET / cross-origin / `/api/*` / `/_next/*` are NEVER intercepted (HMR + live data safe). `/logo.svg` + `/manifest.webmanifest` + `/icons/*` are cache-first. Navigations are NETWORK-FIRST — offline fallback only when the fetch rejects (never serves stale dev HTML). Everything else → untouched network.
- Offline fallback = inline-constructed Response cached at `/__prime-offline` (PRIME-styled zinc-950/amber page, "OFFLINE — RECONNECT TO SYNC"). **v2 addition: the page self-heals** — inline script polls `HEAD /sw.js?probe=<ts>` every 2.5s and `location.replace("/")` the moment the origin answers, so the preview can never get stranded (added after an organic incident, see verification).
- `self.skipWaiting()` + `clients.claim()` (first-party SW, no multi-version UX). Cache versioned `prime-shell-v2`, activate purges older `prime-shell-*`.
- Registration: silent, guarded, console.debug only. OFFLINE pill: fixed top-center, amber border, mono, z-50, fits 390px.

## Settings dialog INSTALL section
- Captures `beforeinstallprompt` (own listener, preventDefault), button INSTALL AS APP (44px violet outline) → `prompt()`; INSTALLED state via `display-mode: standalone` / `navigator.standalone` + `appinstalled` event (emerald "INSTALLED — RUNNING AS APP"); honest fallback hint "USE YOUR BROWSER'S INSTALL MENU" when the browser never offers the prompt (the case in headless Chromium).
- Amber "OFFLINE READY · APP SHELL CACHED" line lights up once `navigator.serviceWorker.controller` is set (listens to `controllerchange`); neutral "OFFLINE SHELL ARMING…" before that.

## Monthly summary API (honest fields)
`windowStart` (29d ago) · `xpEarned` · `sessionsCleared` · `programDays {done, planned|null}` · `avgReadiness`+`readinessDays` (per-day /api/readiness math, mirrors weekly-review helpers) · `currentStreak` · `topGate {name, xp}` (most XP in window, NOT session count) · `busiestWeekday {label, count}` (Mon-based, null under 2 sessions) · `bestE1rmDeltas` (top 3, best-in-window vs best-before-window).

## Verification results
- `bunx tsc --noEmit` → 0 src/ errors · `bunx eslint` (7 TS files) → exit 0 · `node --check sw.js` → OK
- `curl /manifest.webmanifest` → valid JSON, 4 icons (192/512/maskable PNG + SVG any); `/manifest` bare 404s (expected — Next serves the .webmanifest path only); `/sw.js` 200 application/javascript; icons 200 image/png
- `curl /api/monthly-summary` → cross-checked against direct Prisma queries: xp 3362=3362, sessions 13=13, programDays 2 (of 3 active), busiest SAT ×7 (7/4/1/1), topGate Calisthenics +1829 (1829/1209/144) — ALL MATCH. avgReadiness 88.3 over 4 days is honest: 7 metric-days exist but 09-24..26 only have restingHr (deviation-based driver with no ≥3-day baseline yet) → correctly unscored.
- agent-browser session `t20b`: MONTHLY DIGEST card renders with live numbers (+3,362 XP / 13 SESSIONS / 2/3 PROGRAM DAYS / 88.3 AVG READINESS 4D / TOP GATE CALISTHENICS +1,829 XP / BUSIEST SAT ×7 / STREAK 2D / honest empty e1RM line); settings gear → INSTALL PRIME section + honest install-menu hint + OFFLINE READY line; `getRegistrations()` = 1, controller ACTIVE.
- CRITICAL reload test: reload with SW active → live app renders (NOT offline fallback); `[HMR] connected` + multiple `[Fast Refresh] rebuilding/done` cycles observed THROUGH the SW-registered page (incl. a controlled probe on my own file) — hot reload fully works.
- Offline emulation (`set offline on`): mid-session → amber OFFLINE pill appears (and dismisses on `online`); offline RELOAD → Chromium quirk: Playwright offline emulation does NOT apply to service-worker-originated fetches, so the SW still pulled live HTML while page-level chunk fetches were blocked → SSR boot screen without hydration (tooling artifact, not app behavior; in true offline the navigation fetch rejects → fallback). The real fallback was validated ORGANICALLY: a navigation raced against a Turbopack rebuild rejected → SW served the PRIME offline page (screenshot 10). Network route `--abort` likewise bypasses SW fetches (documented tooling limitation).
- Self-heal proof: dev server died mid-verification (env resource limits — no next/bun process left, port 3000 dead, 000s from curl; nothing in dev.log). With the page on the offline fallback, after restarting the dev server the offline page auto-reloaded itself into the live app within one 2.5s poll cycle (title flipped to live app, controller ACTIVE).
- Mobile 390×844: scrollWidth === 390 on STATUS; digest card 358px wide; settings dialog fits 390 (scrollable, install section reachable); forced offline pill at top-center fits, no horizontal overflow.
- 0 page errors in browser console.

## Deviations / incidents
1. Viewport themeColor changed #07060c → #09090b (spec asked for zinc-950 #09090b and manifest/meta consistency; single-line edit).
2. PNG icons generated with cairosvg+Pillow (ImageMagick unavailable) — rendered from the real logo.svg onto zinc-950 tiles, maskable variant with extra padding.
3. sw.js v1 → v2 during verification: added the offline page's self-healing poll after observing a rebuild-window navigation failure leave the fallback on screen; bumped cache name so the new offline page replaces the old.
4. Dev server died mid-task (no process, connection refused, log ends mid-200s — environment resource limits with 3 parallel agents + 2 headless Chromes). Verified no instance was running, then restarted with the project's standard `bun run dev` (not a second instance). Documented here for the orchestrator.
5. Transient 500s from PARALLEL agents' mid-edit files (20-c's body-metrics.tsx, then fuel-tab.tsx) were observed and waited out — not caused by 20-b; my files never broke the app.
6. `busiestWeekday` null threshold: spec said "null if <2 sessions" — implemented exactly.
7. Offline HTML is inside sw.js as a template string (~40 lines) — sw.js totals 127 lines vs "~120" guideline (over by 7 for the self-heal script; kept for the stranded-preview guarantee).

## Key evidence paths
- Screenshots: `.qa/t20b/01..11*.png` (digest card desktop/390, settings install section desktop/390, offline pill desktop/390, organic offline fallback page, final recovered status)
- Cross-check script: /tmp/verify-monthly.ts (throwaway)
