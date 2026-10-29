# PRIME — Project Status

> Charter-mandated persistent memory (Phase F). Factual, concise, updated after
> meaningful changes. The full round-by-round history lives in `/worklog.md`
> (append-only); this file is the current truth at a glance.
>
> **R37 NOTE — PLATFORM ROLLBACK RECOVERY**: between R36 and R37 the platform
> restored an end-of-R34 snapshot, wiping R35+R36 from disk (code, worklog
> entries, this doc, the watchdog, package.json hardening — everything except
> the platform-side cron job). R37 re-landed both rounds from the orchestrator's
> context and re-proved them (race QA 41/41, timer QA across 3 timezones,
> banner E2E both directions). The worklog contains restored entries marked as
> such. Assume ANY round can be rolled back: this doc + the worklog are the
> recovery source of truth.

## Product purpose & architecture

**PRIME** is a Solo-Leveling-flavored personal progression system: real
workouts → verified quests → XP/levels/ranks → feedback. Single-page mobile-first
app (Play-Store-bound TWA). No accounts: profiles are **device-keyed** via an
unguessable cookie token (`prime-hunter`, 10y) resolving to a
first-party server-side profile. R40: the cookie's attributes are adaptive —
loopback hosts (localhost QA) get `SameSite=Lax`; any non-loopback host —
i.e. every request that arrived through the platform's HTTPS edge — gets
`SameSite=None; Secure; Partitioned` so the cross-site preview iframe keeps
its identity (plus requestStorageAccess() on the AWAKEN tap for Safari).
The discriminator is the HOST header, which survives the whole proxy chain
(Caddy preserves it); the x-forwarded-proto signal R39 trusted is ALWAYS
"http" on the real path (Caddy :81 terminates no TLS — see Decisions R40).

- **Stack**: Next.js 16 App Router (Turbopack dev), TypeScript strict, Tailwind 4,
  shadcn/ui (New York), Prisma + SQLite (`db/custom.db`), Zustand, recharts,
  framer-motion, z-ai-web-dev-sdk (backend only).
- **Routes**: exactly one user route `/` (R57 CLEAN SLATE: 5 facades — HOME /
  TRAIN / LOG / STATS / YOU — each mounting its full legacy console behind a
  ShowEverything expander; the 8 legacy tabs' features are all preserved,
  merge & hide) + ~35 JSON API routes under
  `/api/*`. Everything client-rendered behind a cookie identity gate (404
  `NOT_AWAKENED` for cookie-less requests is the DESIGNED gate, not an error).
- **Commands**: `bun run dev` (port 3000, background), `bun run lint`,
  `bunx tsc --noEmit` (purge `tsconfig.tsbuildinfo` before counting; the box
  is memory-starved — a cold whole-tree tsc once OOM-killed the dev server;
  see the tsc-baseline note under Known bugs), `bun run db:push` then
  **restart the dev server** (stale Prisma client 500s).
- **Process-reap doctrine (R38 discovery — CRITICAL for future rounds)**: the
  platform harness **reaps every process spawned during a tool call at the
  call boundary** (even `setsid`+`nohup`+redirected-stdio daemons; a bare
  `sleep` dies too). ONLY platform-boot processes (started by `/start.sh` at
  container boot: the dev server via line ~426 + every `mini-services/*`
  sub-service via the mini-services scan) survive long-term. Consequences:
  (a) QA must run in **single-call windows** — one Bash call that launches the
  server, waits for ready, runs the whole scripted suite, then checks logs;
  (b) never kill the platform-booted dev server/watchdog unless the work
  absolutely requires it (a db:push needs the restart, but expect the server
  to be down between calls until the next container boot); (c) agent-browser
  sessions also die at call boundaries — full browser sweeps (launch + cookie
  + navigate + click-through + error checks) must live in one call; (d) at
  end-of-session, leave the dev server running — it survives until the
  platform cleans up, and the next container boot resurrects everything
  (start.sh boots dev + watchdog automatically).
- **Dev watchdog** (R36, re-landed R37): `mini-services/dev-watchdog/` — a bun
  mini-service probing `/` every 20s; resurrects the dev server (2 failures ⇒
  pkill+setsid relaunch with the 1536MB V8 heap cap) and restarts proactively
  when next-server RSS ≥ 2.75GB. Three self-kill bugs were found by live
  kill-tests and are baked into the re-land: cwd-scoped `bun run dev` kills,
  self-pid hot-reload lock, file-only logging. Runs detached via `bun run dev`
  in its dir; pidfile `watchdog.pid`, log `watchdog.log`.
- **Publish hardening** (R36 postinstall + R39 root-cause fix — VERIFIED): the
  publish pipeline runs a fresh install + `next build`, and `next build`
  compiles EVERY route while Turbopack dev only compiles routes on demand —
  so refactor fallout can sit latent in never-hit routes and kill the publish
  while dev looks healthy. R39 reproduced it in an isolated copy
  (/tmp/publish-verify: fresh `bun install` + capped `next build`) and fixed
  SIX build blockers: (1) comment tokens shaped `h:mm[:ss][AM/PM]]` in
  import/health-csv.ts + import/csv-import.ts — Tailwind's class scanner
  reads comments, emitted the invalid rule `hh: mm[:ss][AM/PM];`, and the
  production postcss parse died ("Missed semicolon"); reworded to h·mm prose.
  (2–6) five missing-export import errors from the R24-a readiness refactor:
  `HRV_PCT_THRESHOLDS` + `hrvBaselineFromRows` restored to health.ts (single-
  sourced into hrvTrainingModulation, byte-identical bands), `readinessScore`
  gained the documented-but-never-implemented `hrvPctDeviation` component
  (hrvContribution: ≤−20% costs 10 points; readiness + coach routes now feed
  it), weekly-review migrated to `readinessScore`/`epleyE1rm` (its old-API
  calls were dead), `ensureDeloadQuest` implemented in engine.ts (insights'
  deload-advised side-effect: idempotent daily Recovery Directive quest,
  mobility metric, 30 XP). Post-fix isolated build: **exit 0, clean** (twice).
  `build` script now caps its own V8 heap (`NODE_OPTIONS=--max-old-space-
  size=1280`) — verified to complete WITH the dev server live; the concurrent
  build did OOM-kill dev once and the watchdog resurrected it in ~45s
  (watchdog.log 16:13 evidence — the self-healing works under real pressure).
  `postinstall` (R36) remains necessary. The publish-verify procedure: copy
  src/public/prisma/play-assets/configs to a scratch dir with a sandboxed
  .env, `bun install`, `NODE_OPTIONS=… next build`, expect exit 0.

## Feature inventory (verified states, R37)

| Feature | State | Evidence | Priority |
|---|---|---|---|
| Device identity (cookie token) | VERIFIED WORKING | R33 E2E; re-verified R36/R37 cold starts | — |
| Awakening (3-step guided) | VERIFIED WORKING | R37 cold-start E2E: all CTAs land, app mounts (R37RLQA) | — |
| Install offer suppression during onboarding | VERIFIED WORKING | R36 discovered + fixed; R37 re-verified: banner absent 14s into the ritual (old code covered the CTAs at 6s), re-arms ~6s after app mount | — |
| Quest claim/check integrity | VERIFIED WORKING | R37-a race QA 41/41 (re-land): concurrent claims → exactly one 200, XP/stats/essence exactly once; CAS +1 exactly; re-claim 400 grants nothing | — |
| Once-per-day XP bonuses | VERIFIED WORKING | R37-a: concurrent grantXpDeduped → one true; legacy fresh-cuid row blocks regrant, no duplicate rows | — |
| Session complete XP | VERIFIED WORKING | status guard (`active` only → 400 on re-complete); no XP at abandon | — |
| RPE/RIR capture + Effort Ledger | VERIFIED WORKING | R34-a QA 97/97 + browser; KAEL legacy nulls → designed empty state | — |
| Profile erase (honest exit) | VERIFIED WORKING | R34-b E2E: type-name interlock → DELETE cascades 15 relations → cookie cleared → AwakeningScreen | — |
| Vault export/import (JSON) | VERIFIED WORKING | Export/restore E2E in prior rounds; erase complements it | — |
| Reset/rift/boss countdowns | VERIFIED WORKING | R38: all three countdowns target the HUNTER's midnight/Monday-midnight (live browser proof: rift chip 04:33:15 at 13:56:44 UTC = 18:30 UTC = IST midnight; boss 6D 04:33:15 = next Monday 00:00 IST; GOALS chip "RESETS IN 04H 37M" + title "Today's goals reset at your midnight"); null-tz hunters keep byte-compatible UTC math | — |
| Per-device timezone day boundaries | VERIFIED WORKING | R38 E2E (R38TZQA hunter, tz Asia/Kolkata): dailies rolled for the IST day; ledger row day + deterministic dedupe id keyed to the IST day; gates tip references the IST-day rift; quests GET selects the tz day (the UTC-day select would show zero dailies between UTC- and tz-midnight); 8-way claim race + 8-way dedupe race re-proven on the tz-threaded engine; pure tz suite 34/34 (IST/LA boundaries, DST 23h/25h windows) | — |
| Dev-server self-healing | VERIFIED WORKING | R36 kill-test ×2 (self-kill bug found + fixed); R37 hot-reload lock re-verified | — |
| Streaks + shields | IMPLEMENTED, UNVERIFIED (concurrency) | touchStreak read-modify-write races remain under concurrent grants (residual, documented) | P3 |
| Day-boundary semantics | VERIFIED WORKING (R38) | Per-device: `Hunter.timezone` (IANA, captured at awakening, validated server-side; null = byte-compatible legacy UTC). All live mechanics roll at the hunter's midnight: quest roll/stale-fail (ensureQuests), daily aggregates windows (tzDayWindow), streak day (touchStreak), rest decree week (restDayState + /api/rest-day), rift rotation + entered-day (sessions/gps-log), boss weeks (all consumers), once-per-day XP ledger day, metrics/nutrition day defaults + history anchor, oracle tips/briefings. Historical analytics (chronicle/progression/readiness/insights/export grouping) intentionally stay UTC-day — documented P3 deviation | — |
| Offline queue / PWA shell | IMPLEMENTED, UNVERIFIED | Awakening offline FIFO + SW shell verified in R33; not re-driven since R34 exorcism | P2 |
| 768–900px layout | UNVERIFIED | Standing candidate; 390×844 is the verified target | P3 |
| Play assets | VERIFIED WORKING | Graphics + listing + TWA docs current through R34 (in-app deletion declared) | — |
| Insights integration (BODY tab → /api/insights) | VERIFIED WORKING | R47 E2E on a throwaway hunter (tz Asia/Kolkata, seeded spike ×2.0 + tape metrics): opening BODY fired BOTH designed side effects live in the browser — recovery-directive quest injected (2026-10-15 IST, target 10, 30 XP), bf-goal-reached achievement + 200 XP granted (L1→L2, totalXp 200), celebrate banner rendered ("11.7% BODY FAT · Fitness ZONE · +200 XP"), TRAINING LOAD row shows "DELOAD ADVISED · ×2.00 … RECOVERY DIRECTIVE ISSUED — SEE DIRECTIVES"; KAEL sweep side-effect-free (insufficient-data verdict, no tape) with DB byte-stable; KAEL analysis surfaces heart/strength verdicts + locked bodyComp state honestly | — |

## Domain rules (authoritative)

- **XP**: `applyXp` = overflow level-ups; `xpToNext(l) = 80 + (l−1)·45`;
  ascension multiplier `1 + n·0.15`; `STAT_POINTS_PER_LEVEL`/`RANK` bonuses in
  `grantXp` (engine.ts — the single award path; gps-log/import mirror it inline
  inside transactions, documented there).
- **Ledger-first grant** (R35, re-landed R37-a): `grantXp` accepts an optional
  deterministic event id; when present the xpEvent row is inserted BEFORE the
  hunter update, so `dedupe:{hunter}:{day}:{note}` (id = @id, unique) makes the
  INSERT the atomic once-per-day gate — P2002 wrapped as
  `LedgerAlreadyGrantedError` fires before any hunter state mutates.
  `grantXpDeduped` = findFirst pre-check (hunter+note+day — covers
  restored-backup rows with fresh cuid ids) + gated insert.
  `grantXpOncePerDay` is a thin alias.
- **Quest claim**: atomic CAS `updateMany({claimed:false, progress:{gte:target},
  progress:{lt:target} on check})`; stat rewards via ONE `hunter.update` of
  `{increment}` atoms (never `{vit: 1}` — that is a SET); check = CAS increment
  + predicate-scoped idempotent `completedAt` follow-up.
- **Day boundary (R38)**: `Hunter.timezone` (IANA, nullable) owns the day.
  `dayKeyIn(tz)` / `yesterdayKeyIn` / `weekStartKeyIn` / `tzDayWindow` /
  `msUntilNextTzMidnight` (all in lib/game.ts, formatter-cached,
  DST-correct via wallclock-offset fixed-point iteration) are the ONLY day
  math — never reimplement locally. Null/invalid tz → legacy server-local
  (UTC) behavior, byte-compatible. Quest roll/stale-fail, daily aggregate
  windows, streak day, rest-decree week, rift rotation + entered-day, boss
  weeks, once-per-day XP ledger day, metrics/nutrition day defaults, oracle
  tip/briefing/reading windows all roll at the hunter's midnight. KAEL is
  backfilled to Asia/Kolkata (R38 product migration — see purity baseline).
- **Rest-day / recovery / deload**: streaks never incentivize training through
  injury (rest-day cards, recovery science layer, 18 consensus-tagged notes).

## Data model & persistence

Prisma models: Hunter (token-unique, `timezone String?` — R38), Quest,
WorkoutSession→ExerciseLog (rpe/rir nullable), Achievement, XpEvent,
PersonalBest, Relic, Briefing, RestDay, BossDefeat, NutritionLog, WaterLog,
Program, MetricGoal, BodyMetric — every child `onDelete: Cascade` from Hunter
(erase = one delete).
**DB purity baseline (SACRED, QA read-only; R38 rebaseline)**: hunters=1 [KAEL
L11·xp118·totalXp2943·essence356·77.5kg·**timezone="Asia/Kolkata"** (R38
backfill — deliberate product migration; pre-R38 specs said null)],
12 sessions / 11 logs (rpe null) / 31 metrics / 15 xpEvents / 1 nutri /
4 water / 3 programs. **Quest count is DAY-DEPENDENT, not fixed**: `20
NULL-day quests + 4 dailies per rolled day` (80 as of 2026-10-12; a new UTC
day on which KAEL's profile loads adds exactly 4 — that is the roll working,
NOT drift; per-hunter-tz the roll day changes at the hunter's midnight).
Throwaway QA pattern: awaken distinctively-named hunter (send
`timezone:"Asia/Kolkata"` to exercise the tz paths) → drive flows →
`DELETE /api/hunter` with its cookie (cascades) → byte-identical baseline.

## Ownership map (post-R34 exorcism)

- `src/app/page.tsx` — single route, tab mount, awakening gate.
- `src/components/fitness/*` — live components (49 template-era dead files were
  quarantined at `/home/z/quarantine-r34` — NOTE: the rollback appears to have
  removed that quarantine dir; the exorcism's src/ state is intact, so nothing
  needs restoring; treat the quarantine as consumed).
- `src/components/system/*` — shared chrome (incl. the LIVE settings dialog).
- `src/lib/engine.ts` — hunter/quest/XP core (ledger-first grants).
  `src/lib/{game,quests,rift,bosses}` — pure domain math. `src/lib/sensors/*`
  — HR/GPS/GPX/HRV.
- API routes mirror the DTOs in `src/lib/types.ts` (additive only).
- `mini-services/dev-watchdog/` — independent bun project (tsconfig-excluded).

## Known bugs / technical debt

1. **PLATFORM ROLLBACK RISK (new, R37)** — the sandbox restored an end-of-R34
   snapshot overnight, wiping two rounds. Mitigation: this doc + worklog
   restoration discipline; assume any round can vanish. The recovery playbook
   that worked: map the rollback boundary (worklog line count, feature greps,
   DB drift), re-land from orchestrator context, re-prove with the same QA
   suites.
2. **Streak read-modify-write race** (touchStreak) — narrower now that award
   doors are CAS-gated; single-tab flows serialized by UI busy states. P3.
3. **Per-device timezone day boundaries** — DONE in R38 (see inventory). The
   remaining tz gap is historical analytics grouping (chronicle/progression/
   readiness/insights/export group past sessions by UTC day) — P3 follow-up,
   invisible unless a session is logged in the 00:00–05:30 IST window.
4. **Type-surface debt — RESOLVED R46** (after eight consecutive deferrals):
   `bunx tsc --noEmit` now reports **0 src errors + 4 platform-owned
   examples/+skills/ errors** (examples/websocket ×2 socket.io module
   resolves, skills/image-edit, skills/stock-analysis — outside the app,
   never counted in project debt). The R46 exorcism: (a) the lost insights
   type family (15 names) reconstructed in lib/types.ts from the route's
   runtime-authoritative construction sites — the family was erased by the
   R36 platform rollback and every consumer ran type-blind since; (b)
   ImportFormat/ImportRow/ImportSummary defined for lib/csv.ts; (c)
   progression-panel's stale ProgressionEntry/ProgressionSuggestion imports
   aligned to ProgressionEntryDTO/Suggestion; (d) DEAD CODE DELETED (zero
   imports anywhere, verified by name + path + export-name greps):
   session-share-card.tsx, gate-call.ts (half-feature written against a
   CoachDirective API that never shipped — focus/rirTarget/"RECOVER"), and
   the five pre-tab-architecture legacy components (analysis-panel,
   lift-progression, readiness-meter, vitals-panel, progression-panel —
   superseded by the *-tab.tsx family; vitals-tab re-implements its own
   ReadinessPanel internally). tsc is now a REAL regression signal: any
   future error is a future defect, not baseline noise.
5. **Cron review job** — recreated as 455216 (fixed_rate 900s, webDevReview;
   the two prior jobs 452603/453461 were purged by the platform); still
   "Disabled due to exec limits exceeded" at creation — a platform-side quota
   persistent across every recreate. If it stays disabled, retry in later
   rounds.
6. **4GB/no-swap box** — next-server was kernel-OOM-killed once (R36 dmesg
   evidence); mitigations shipped (watchdog + 1536MB cap). Keep verification
   light: incremental tsc, one browser context at a time. **R44 update:**
   the sandbox now reaps ALL Bash-spawned background processes at tool-call
   boundaries (watchdog dies at call end despite setsid/nohup/stdin-detach;
   no cron daemon) — restart the watchdog per active window only. The
   platform-supervised dev server itself is resilient (survived the R44
   chrome OOM kill) but its current instance carries NO NODE_OPTIONS cap
   (R44 /proc evidence) — do NOT restart it from the Bash tool; a
   replacement would be reaped at call end, leaving no server.
7. **Copy stragglers** — RESOLVED R38-a: rest-day-card "UNTIL MIDNIGHT" →
   zone-truthful ("UNTIL YOUR MIDNIGHT" / "UNTIL MIDNIGHT UTC"), gates-tab
   stale local-midnight comment fixed. No remaining known stale copy.

## Test status

- No standing test suite (charter permits strongest-feasible verification).
  Verification = per-round scratch QA (unit + HTTP E2E against the live server,
  deleted after), agent-browser 390×844 sweeps, dev.log 500 greps, DB purity
  enumeration. **R41 (THE GROVE re-theme)**: computed-style font proof (body =
  Nunito, display elements = Fraunces — after moving the next/font variable
  classes from `<body>` to `<html>`, which both subagents independently
  diagnosed as a dead-var bug); DOM audit of the live dashboard (85
  rounded-full elements, 44 grove-lift/press interactives, 12 fireflies + 6
  leaves mounted, font-mono reduced to 23 legit tabular spots); 8-tab KAEL
  sweep via bottom-nav refs — ZERO page errors; fresh-context onboarding
  render check (ritual mounts, `#awakening-ritual` marker intact, zero mono,
  no DB writes); grove-lift transition verified live (computed transition ≠
  0s); two VLM screenshot audits (first: ~70% converted, colors/serif/particles
  landed; second flagged neon glow intensity → sys-bloom/glow-breathe softened
  ~50% in response; its "geometric sans" read of Fraunces at 390px was
  contradicted by computed-style evidence — VLM oscillates, DOM rules);
  eslint 0 on all 25 changed files (7 orchestrator + 8 + 10 subagent);
  incremental tsc = 49 total = EXACTLY the 45 src + 4 examples baseline,
  ZERO new; dev.log zero 500s / zero errors through the whole round.
  R40: curl cookie-attribute MATRIX through the real gateway path
  shape (external Host + x-forwarded-proto=http → `Secure; SameSite=none;
  Partitioned` — the request shape the user's browser actually sends;
  loopback → Lax; idempotent re-awaken re-issues same token with strict attrs;
  DELETE clear-cookie carries the same attrs), the `[identity]` evidence line
  confirmed live (host=preview.space-z.ai x-forwarded-proto=http), fresh-
  context onboarding E2E @390×844 with the R40 probe ordering visible in the
  network trace (mount-404 → create-200 → verify-200 → calibration-200 →
  mount-200, app mounts, notice shown), KAEL 8-tab sweep zero page errors /
  zero console errors beyond known warnings, eslint 2 changed files 0 errors,
  tsc 45+4 pre-existing with 0 new (changed files contribute zero), DB pure
  (QA hunter cascaded; KAEL byte-identical; user's "Kael" + "sdfgh" shells
  left adoptable; quest count 132 = 60 null + 72 rolled with the +4 Oct-13
  IST roll being the designed day-boundary behavior). R39: curl cookie-attribute tests (http→Lax, https→None/
  Secure/Partitioned; empty-shell adoption 200 with the shell replaced; KAEL
  protected 400 + counts byte-identical), fresh-device onboarding E2E @390×844
  (full 3-step ritual → app mounts, calibration lands 78kg/175cm/bulk, network
  trace 404→POST 200→nutrition 200→verify 200→mount 200), 8-tab KAEL sweep zero
  page errors, the four formerly-broken routes 200×4 from browser context,
  isolated publish build exit 0 (twice, dev server live), eslint 11 changed
  files 0 errors, tsc 45 pre-existing src + 4 outside — 0 new. R38: pure tz
  suite 34/34 + E2E 33/33 (tz-set throwaway) + live countdown proofs; eslint
  23 touched files 0 errors; tsc = 51 pre-existing src + 4 examples/+skills/
  errors, 0 new from R38 (see Known bugs #4 — the R37 "tsc 0 src" claim does
  not reproduce and is retracted); 8-tab browser sweep zero page errors /
  zero 500s. R37: race QA 41/41 +
  timers 29/29 across 3 timezones + banner E2E both directions.

## Decisions log (recent)

- **R42 · MIRAGE × KOTA studio pass**: the user's reference directive
  ("combine the elements from studiomirage.io + madebykota.com, almost like
  studiomirage.io") was executed as an ADDITIVE TOKEN LAYER on the R41 Grove
  rather than another full re-theme — the grove palette/architecture stays,
  the chrome language upgrades. (1) A "R42 · STUDIO GROVE" section in
  globals.css ships 8 new utilities (.sys-italic, .aurora-track/.aurora-fill,
  .glass-pill, .aura-glow, .grove-marquee, .line-reveal, .depth-card,
  .pill-action) mirroring the references' synthesis: film grain + oversized
  editorial serif + glassy pills + luminous hairline meters + ambient auras +
  gentle marquees; (2) Fraunces gets a TRUE italic axis in layout.tsx (the
  madebykota Times-accent signature) — no faux slant; (3) R42-b discovered
  the LightningCSS backdrop-filter stripping bug (both-prefixed declarations
  get BOTH stripped — every R41 panel silently had no blur; fix = standard
  property only); (4) subagent split R42-a (home surface) + R42-b (chrome:
  marquee/nav/xp-bar/hints/skeleton) with disjoint file sets — R42-a hit a
  context deadline AFTER completing its edits (work verified + worklog
  recovered by orchestrator); (5) the orchestrator integration pass retired
  the last HUD tells (INSTALL PRIME ad-unit → amber glass capsule, SWIPE
  billboards → whisper pills, rank-ladder keyboard → organic-arc glass
  pills). Lore/domain vocabulary untouched; zero API/DB/logic changes.
- **R41 · THE GROVE re-theme**: the user's redirect — "completely change the
  whole feel, more natural and flowy, more animations and interactive" — was
  executed at the DESIGN-TOKEN layer, not by hand-editing 70 components: (1)
  Tailwind 4 `@theme` re-declaration remaps the whole violet scale → emerald
  and fuchsia scale → amber, so ~1,750 existing utility class usages
  re-render natural with ZERO class renames (contract preserved); (2) literal
  rgb/hex forms batch-sedded (zero violet/fuchsia literals remain in src);
  (3) `:root` re-hued to forest greens with `--radius` 0.375rem → 1rem;
  (4) chrome classes rewritten in place — `.sys-panel` organic glass,
  `.sys-corner` brackets → breathing dew-lights, `.sys-label` → Nunito
  700 @ 0.18em, `.sys-scanlines` retired, `.sys-display`/`.sys-section-index`
  → Fraunces serif, blueprint grid → ripple rings; (5) fonts swapped under
  the SAME CSS variable names (Nunito/--font-geist-sans, new
  Fraunces/--font-fraunces) with variables moved `<body>` → `<html>` after
  both subagents proved the body placement left them dead at `:root`;
  (6) a ~150-line GROVE motion kit (breathe/sway/drift/sprout/ripple/flow +
  fireflies + leaf-fall + grove-lift/press micro-interactions, all
  reduced-motion self-guarding) + a deterministic `grove-ambient.tsx` particle
  field; (7) lore preserved (Hunter/Oracle/Gate/XP) — TECHNIQUE words
  softened (system/neural/calibration → grove/roots/sunlight), display
  strings only, zero logic/API/DB surface touched. Subagent split R41-a
  (shell: nav/awakening visuals/tab-skeleton/notifications/rewards/install/
  offline) + R41-b (dashboard: hunter-card/status/briefing/stat-grid/rings/
  readiness/rest/coach) — both eslint 0, awakening cookie-recovery logic
  byte-verified intact.
- **R40**: the cookie wall's TRUE root cause. R39's adaptive cookie keyed off
  `x-forwarded-proto === "https"` — but the platform edge terminates TLS and
  forwards PLAIN HTTP to Caddy :81 (no tls directive ⇒ Caddy's {scheme} is
  "http" for every request it will ever see), so the strict branch NEVER fired
  on the real path; R39's curl verification had set the header manually and so
  passed while the user kept failing. Live proof tonight: a fresh device
  awakened ("sdfgh"), empty-shell adoption healed both retries (P2002 → 200),
  and the calibration leg 404'd NOT_AWAKENED all three times — the cookie
  never landed. Fix: `identityCookieOpts` now derives "user-facing HTTPS" from
  the HOST (non-loopback ⇒ through the edge ⇒ strict attrs;
  `x-forwarded-proto=https` still short-circuits for future TLS proxies), a
  `logIdentityDecision` evidence line logs host+proto at every hunter create,
  and the awakening flow's cookie verify probe moved BEFORE the calibration
  leg (blocked-cookie message shows before calibration "fails"). Verified:
  curl through the real gateway path shape (external Host + proto=http →
  `Secure; SameSite=none; Partitioned`), loopback → Lax, idempotent re-awaken
  + DELETE clear carry the same attrs, fresh-browser onboarding E2E with the
  new probe ordering in the network trace, KAEL 8-tab sweep clean.
- **R39**: the cookie wall + the publish root causes. (1) The preview panel
  embeds the app cross-site, so SameSite=Lax identity cookies were silently
  discarded — onboarding was bricked for every fresh device (dev.log: POST
  hunter 200 → nutrition 404 → P2002 retry). Fix: adaptive cookie attributes
  (x-forwarded-proto=https → SameSite=None; Secure; Partitioned/CHIPS; plain
  http keeps Lax for localhost QA) + `document.requestStorageAccess()` on the
  AWAKEN tap + a post-POST verify probe with an honest "cookie blocked —
  retry or open first-party" message. (2) Empty-shell adoption: P2002 against
  a provably-empty hunter deletes the unreachable shell and recreates it in
  one transaction — burned names self-heal on retry (the user's orphaned
  "Kael" stays in the DB, deliberately, for their retry to adopt). (3) The
  publish build blockers (see Publish hardening): Tailwind-scans-comments CSS
  fix + five R24-a-refactor import restorations + ensureDeloadQuest. Build
  script self-caps at 1280MB. tsc truth: 45+4 pre-existing, 0 new.
- **R38**: per-device timezone day boundaries — `Hunter.timezone` + the
  lib/game.ts tz helper family threaded through every live mechanic (quest
  roll, aggregates windows, streaks, rest decrees, rift/boss weeks, XP ledger
  day, metrics/nutrition/oracle days); KAEL backfilled to Asia/Kolkata;
  countdown copy zone-honest ("your midnight" when tz set). Also discovered
  the platform process-reap (see Commands section) and the 51-error
  type-surface debt (see Known bugs #4).
- **R37**: disaster recovery — re-landed R35 (reward integrity: CAS/deterministic-id
  INSERT gates, 41/41 race QA) + R36 (awakening-aware banner suppression, dev
  watchdog with 3 self-kill fixes, publish postinstall) after the platform
  rollback; DB purity re-restored (3 stray QA hunters purged again).
- **R36** (lost to rollback, re-landed): user-reported bugs triaged to banner-
  covers-CTA + kernel-OOM-killed server + missing prisma generate on fresh
  installs.
- **R35** (lost to rollback, re-landed): reward integrity via CAS/deterministic-id
  INSERT (no schema change); ledger-first grantXp ordering; UTC-honest countdowns.
- **R34**: effort ledger (RPE pays dividends); erase profile (honest exit);
  49-file dead-code exorcism (quarantine > rm — no git undo for untracked).
- **R33**: device identity over shared profile; guided awakening; empty states.

## Current cycle (R58) & next action

R58 · **FLOW — the motion round** COMPLETE. User directive: "nice, now
continue to build, dont add clutter / make the whole more flowy and more
animations." Pure motion on the R57 clean shell: ZERO new visible
characters (density re-measured byte-identical where data allowed — Home
299 · Log 311 · You 361 unchanged; Train 368 / Stats 331 within real-data
noise). The three dark-era transient overlays finally went light.

**Foundation (kit + CSS + page):** `.prime-rise` became a STAGGERED cascade
(children rise in 60ms steps, replays per tab entry); `ProgressBar` fill
sweeps in from 0% on mount + one-shot shine sweep (`.prime-progress-fill::
before`); `StatTile` gained `countTo` (animated count-up numerals, rAF);
TapRow/rows gained `active:scale-[0.99]` press; page tab-crossfade enter
became a soft spring (380/34); NEW `prime/confetti.tsx` — ConfettiBurst,
26 pieces, tween keyframes (spring keyframes with >2 frames THROW in
framer-motion 12 — see the E2E war story below), aria-hidden, reduce-safe.

**Chrome motion (nav):** TabBar active pill GLIDES between tabs
(`layoutId="prime-tab-pill"` — the legacy bottomnav-indicator idiom);
icon activation bounce = pure CSS (`.prime-tab-bounce`) — deliberately NOT
framer; streak flame breathes (`.prime-flame`, 2.6s); LV numeral pops per
level change. TopBar/TabBar text unchanged.

**Celebrations:** quest claim on Home fires confetti + quest rows exit
gracefully (AnimatePresence, slide-fade + layout spring); Log quick-log
successes (food/water/weight/vitals) fire confetti; the RewardOverlay was
REBUILT LIGHT (R58-b): white card 2px border on dimmed backdrop, big green
XP count-up, staggered spring blocks (essence/rift/boss/PR/shield/level-up/
rank-up/titles — every field preserved), Continue = chunky green 3D button,
confetti burst on mount. Toasts (R58-c): white cards, per-kind accent
colors, spring entrances, one-shot glyph pop; install banner + iOS sheet
re-skinned light with springy entrances.

**Facades (R58-d):** countTo wired on 9 real-numeral tiles (Train 2, Log 3,
Stats 3, You 1; 5 deliberately skipped where crafted values/glyphs would
change visible copy); Train's session-history + PR rows animate in/out;
Log fires ConfettiBurst on genuine successes only.

**THE E2E WAR STORY (both root causes found live, both fixed):**
(1) **Tab switching froze** — Log/Stats/You mounted stuck at opacity 0 with
the old view never exiting; only Train worked. Bisected via git stash →
HEAD page.tsx → CSS strip → nav revert: the R58-a agent's TabBar icon
wrapper used a KEYED REMOUNT (`key={active}`) with keyframe animate — a
motion span remounting in the same commit as the page AnimatePresence
child swap kills the entering view's animation (framer-motion 12 scheduler
edge). Fix: the legacy nav's no-remount discipline — layoutId pill via
conditional mount (proven idiom) + CSS-only bounce class. This is now LAW:
anything that re-renders on tab change in the chrome uses CSS or
animate-prop transitions, NEVER keyed motion remounts.
(2) **Confetti + toast never rendered** on water log — the toast icon pop
used THREE keyframes with a spring (`scale: [0.6, 1.1, 1]`), which THROWS
at runtime in framer-motion 12 ("only two keyframes currently supported
with spring and inertia animations") and killed the entire render commit.
Fix: two-value spring (0.6 → 1, natural overshoot). Swept all touched
files — no other instance (confetti's own keyframes are tween-based, safe).

**Golden path (throwaway R58QA hunter, deleted after, zero residue):**
water log → confetti verified flying (DOM geometry mid-flight + VLM "yes,
colorful confetti pieces visible mid-air") + light toast ("Water logged /
500 ml today"); vitals check-in; Start workout → real SessionRaid console →
logged a set → FINISH SESSION → light RewardOverlay (VLM: "very consistent
with a modern light mode aesthetic (like Duolingo)" — +117 XP green
count-up, +29 essence teal pill, 1 new record gold pill, LEVEL UP block,
First Workout badge unlock) → Continue dismisses; Session Goal quest 1/1 →
claim → overlay + row exits the list (4→3). KAEL byte-stable throughout:
L11 / 123xp / 2948totalXp / 356essence / streak 1.

Verified: eslint 0/0 across all touched files; tsc exactly the 4 platform
baseline errors (zero in src/); 5-tab round-trip all switch cleanly; mobile
390px zero overflow; legacy expander opens (11 sys-panels); density
re-measured (no clutter); dev.log clean.

**Honesty notes**: (a) reward-overlay keyboard dismiss (Escape/Enter) works
in code but synthetic key events from agent-browser don't reach it — the
Continue button path is browser-verified; (b) AwakeningScreen + Stats
heatmap keep dark-era internals inside legacy-surface (unchanged from R57);
(c) all cron predecessors platform-disabled; a fresh R58 job was created at
cycle end.

**Next highest-priority (R59)**: (a) rollback check (grep "R58" across
prime/ + globals + system/; git log; KAEL L11/123/2948/356); (b) offline/
PWA simulation E2E (carried since R54); (c) AwakeningScreen light restyle;
(d) reward overlay max-h pass for short viewports; (e) cron fire-watch;
(f) optional VLM-driven micro-polish pass (quest icon contrast already
bumped #c9c9c9→#a3a3a3 this round).

(Previous cycle R57 — CLEAN SLATE Duolingo redesign — COMPLETE, condensed
below.)
\n(Previous cycle R56 — chart tick densification + standings visibility —
COMPLETE, condensed below.)

## Previous cycle detail (R56)

R56 · CHART TICK DENSIFICATION + STANDINGS VISIBILITY (leaderboard opt-out)
COMPLETE. The R55 next-lever list executed, honestly measured:

**1. CHART TICK DENSIFICATION (the last big density lever).** Live
before/after (KAEL, 1280×800, collapsed defaults): PROGRESS tick mass
193→136 chars (XP FLOW 14→7 day labels via minTickGap 64; strain/load
minTickGap 48→96; Y axes tickCount 3); VITALS 130→118 (TrendChart minTickGap
20→48 + tickCount 3 across all four minis); test-lab 12→32; body-metrics
weight-trend 20→48. Full-tab ledger: **PROGRESS 1,851/1,797 → 1,645/1,592 ·
VITALS 1,573/1,573 → 1,467/1,467 (now UNDER the ~1,500 bar)**. Honest
finding: the addressable mass was ~320 chars (not the speculated −300-500) —
BODY/FUEL/TRAINING render zero axes at defaults (data-empty, or behind
R55's unmount-while-closed expanders). Hover Tooltips keep every value
reachable — merge & hide, zero data removed.

**2. STANDINGS VISIBILITY — leaderboardOptOut (Strava-style privacy switch).**
Schema column (default false) + PATCH /api/hunter (strict boolean, never
coerced) + GET /api/leaderboard pool filter (opted-out hunters off every
tier, own row included; they still SEE boards) + response `optedOut` + the
**eye toggle in the Standings header** — Eye/EyeOff icon button, zero
visible characters (context rides aria-label/title/sibling InfoHint),
44px touch target. Glossary +1 → 39 terms (`listed`). Eye round-trip E2E on
KAEL: opt-out → boards honestly empty ("0 HUNTERS") → re-list → row back at
true rank; numerals byte-stable throughout.

**3. THE GUARDED ADMIN CURATION PATH (R55 candidate d — not a manual db
write).** `POST /api/admin/curate`: guard = random secret in gitignored
`db/admin-token.txt` (chmod 600) + `x-admin-token` header compared
hash-then-timingSafeEqual; no token file → 404 (endpoint invisible); wrong
token → 403; unknown name → 404; non-boolean → 400 (all verified live).
Contract = ONE flag (leaderboardOptOut) on ONE hunter per call — no XP, no
essence, no deletion. The three dev-artifact profiles ("Kael" dup,
"sdfgh", "sdfghj") curated OFF: WORLD standings now population 1 (KAEL
alone — merge & hide, their data intact).

**4. lib/db.ts self-heal extended to v12** (probe `leaderboardOptOut`, new
__r56Healed flag): the running dev server healed its stale Prisma client
LIVE ("[lib/db] Prisma client healed — R56 standings visibility aware") —
no restart needed. Plus `devd.py` recreated (the double-fork dev-daemon the
cron runbook references; lost in the container reboot) and 7 reboot-stray
755 mode-changes normalized back to 644.

Verified: eslint 0/0 ×10 touched files; tsc EXACTLY 4 platform errors; eye
toggle + listed InfoHint popover E2E; curated standings re-verified across
world/state/country; fresh-reload 8-tab sweep zero page errors (only the
pre-existing THREE.Clock deprecation warnings); 390px zero overflow ×2;
VLM audits — desktop CHARTS pass / STANDINGS HEADER pass / COHESION A−,
mobile PASS. KAEL byte-stable L11/123/2948/356/Maharashtra/India at every
checkpoint. Screenshots qa/r56-*.png.

**Honesty notes**: (a) the first mobile screenshot graded the PrimeGate
splash — JS `.click()` bypasses hit-testing so DOM QA ran under the overlay;
visual captures need the gate dismissed first (re-taken, PASS). (b) PROGRESS
full-tab delta (−205) exceeds computed attribution (ticks −57 + junk rows
−~72) by ~−77 — recorded as measured; ambient same-day state drift possible.
(c) The full-reap regime was NOT active this session (server survived across
calls — probed first, per doctrine). (d) Cron: all four jobs still
platform-disabled ("exec limits exceeded"); a fresh R57 job created at cycle
end — may die the same way.

**Next highest-priority (R57)**: (a) rollback check (grep "R56" across
leaderboard/admin/curate/db/glossary; git log; worklog tail; KAEL
L11/123/2948/356; standings population 1); (b) STATUS sits +111 over the bar
— the residual lives in files the R55 round quarantined (activity-rings,
vitals-snapshot, rest-day-card); needs an orchestrator-owned pass; (c)
expanded-state tick re-measure (chronicle + test-lab charts render only
when their expanders open); (d) offline/PWA simulation E2E (carried since
R54 — `agent-browser set offline on` makes it testable); (e) cron fire-watch.

(Previous cycle R55 — destination badges honest rebuild + per-section
improvement pass — COMPLETE, condensed below.)

## Previous cycle detail (R55)

(R55 section condensed from its full worklog entry.)

R55 (condensed): (1) /api/destinations (the R51 void closed): DestinationsDTO
+ lean tz-aware GET (same readiness pipeline as /api/readiness, 7 parallel
queries, 404 gate) + destination-index self-fetch — ALL SEVEN STATUS rows
badge live honest state (Body 77.5 KG · Fuel KCAL/L · Vitals 93 PRIMED
band-tinted · Progress 5 PRS; null when unfed, never a placeholder).
(2) Second-pass density audit on every section: PROGRESS 2790→1797 visible
(−993), VITALS 2540→1573 (−967), TRAINING 2147→1725 (−422), GOALS
1681→1400 (−281), STATUS 1740→1611 (−129) via 4 parallel agents on disjoint
files + orchestrator polish; glossary +3 → 38 terms. Agent discovery:
clipped≠removed — framer height-fold content feeds innerText, expanders must
unmount while closed. Verified: eslint 0/0 ×17, tsc 4 platform errors
exactly, single-call-window E2E under the full-reap regime, expanders,
InfoHints, destination-row navigation, 390px ×5, zero console errors, KAEL
byte-stable. Honesty: residuals are core data + intended index surface;
next lever = chart tick densification (→ done in R56).

(Previous cycle R54 — declutter round 3, "super simplify the whole site" —
COMPLETE, condensed below.)

## Previous cycle detail (R54)

R54 (condensed): declutter round 3 across the five remaining tabs — TRAINING
4,951→2,190/2,024 (day expanders, cues → titles, raids InfoHint), GOALS
4,169→1,698/1,470 (short imperatives, calibrated/ascent InfoHints, milestone
cap 6), BODY 1,580→945/805 (freshness InfoHint), FUEL 1,762→1,307/832 visible
(science wall → one personalized line + fuelTiming/micros InfoHints), REWARDS
2,026→1,071/948 (perks InfoHint). Glossary +9 → 35. Four parallel agents +
orchestrator-only E2E; lint 0/0 ×11; tsc 4 platform errors; VLM A−/B+.
Measurement convention born: raw innerText includes .sr-only — visibility-
filtered figures recorded alongside.

## Previous cycle detail (R53)

R53 (condensed): declutter round 2 — PROGRESS 4,628→2,789 (citation wall →
InfoHints/titles, TAP-FOR-HISTORY → titles, export capped + SHOW ALL
expanders, bothEmpty guard quiets the chronicle) and VITALS 5,845→2,630
(helper lines → placeholders, zone-card verdict prose + ACC/AHA citations →
titles, CHECKED IN ✓ state); glossary +7 → 26. KAEL baseline drift +5 XP
(authorized E2E check-in, metrics/route.ts:226) → **L11/123/2948/356** —
the CURRENT regression baseline. Honesty: both launches hit harness
timeouts; R53-a self-recovered, R53-b orchestrator-verified from diff;
import-center.tsx touched as documented deviation.

## Previous cycle detail (R50 → R49 condensed)

R50 (condensed): session-raid.tsx studio pass (chrome-only, 73+/53−) — the
raid console, the app's last pre-studio surface, converted to the R43–R49
voice (aurora-fill-teal plan meter, Space Grotesk gate hero + sys-italic
epithet, rounded-lg glass rows, pill CTAs, 44px accessible paths); E2E-proven
in-session on throwaway R50QA-Raid (real START DAY, plan-prefilled log → RPE
7 persisted → FINISH → xpEarned 104 exact, real-pointer swipe commit, KAEL
byte-stable, VLM A-). App-wide chrome unification COMPLETE (R43→R50).
QA lessons: dismiss the PrimeGate entry splash before pointer QA; verify
overlays via elementFromPoint.

## Previous cycle detail (R49)

R49 shipped the swipe-gesture family to the studio language end-to-end:
`.aurora-fill-rose/-fuchsia` tokens + mastery-near re-arm in globals.css
(+43); swipe-row.tsx reveal layer re-skinned (vertical aurora filaments,
two-layer commit bloom, glyph halos, static TONE_WASH, rounded-xl —
R49-a); all 7 consumer row frames → neutral studio charcoal
`#17171B→#0B0B0E` + rounded-lg + 44px row CTAs (R49-b); and the round's
engine find — a live-discovered orphaned-gesture `body.swiping` lock on
Fast Refresh remount, fixed by a 3-line unmount-safety useEffect (the
only logic delta). Gesture E2E on throwaway R49QA-Drift with REAL pointer
events: sub-threshold spring-home (zero commit), 7 verify swipes
completing a quest purely by gesture (CAS +1 each), the 8th swipe
committing the claim (XP exactly +20, xpEvent exactly 1); KAEL
byte-stable; VLM mid-drag audits A-/A-. Full record: worklog R49/R49-a/
R49-b.

(Previous cycle R48 — Phase E design integration — COMPLETE and detailed
below.)

## Previous cycle detail (R48)

R48 · PHASE E DESIGN INTEGRATION (GOALS + TRAINING reading surfaces) COMPLETE
— the last two tabs still carrying pre-R43 "sci-fi HUD" chrome (VLM-audited:
tracked-mono headers, boxy zinc-bordered cards, thick opaque chrome vs the
studio language) brought up to the R43-R45 voice. Shipped via two parallel
frontend-styling subagents (R48-a, R48-b), orchestrator-verified:

1. **directives-tab.tsx (GOALS, 226 diff lines, chrome-only)** — 8 inner-card
   recipes → translucent studio glass (`rounded-xl` white-alpha borders +
   gradient fills + soft shadow; violet/amber accent variants); the daily +
   milestone meter systems (~23 live tracks) → `aurora-track`/`aurora-fill`
   (violet active, amber complete) with inline `transition:none` (framer stays
   sole width driver — the documented low-pass hazard); 7 CTAs → pill-action /
   ghost-zinc (REROLL fuchsia→violet operator pill); 6 toggle groups + 14
   state chips → rounded-full; ~20 header lines de-HUDed to `font-display`;
   quest-flavor descriptions → the `sys-italic` editorial tier.
2. **gates-tab + program-panel + week-compliance + boss-banner (TRAINING,
   175 diff lines, chrome-only)** — gate cards/day cards/BlockRows → studio
   editorial cards (framer-transform-bearing surfaces got static glass, NOT
   depth-card — documented low-pass rationale); mastery meters → aurora
   (amber for rift gates, violet otherwise); NEXT UP chip → glass-pill-violet;
   EmptySurface mirrored to the R45 status-tab studio version; program/day/
   exercise names → font-display; hunt CTA + RETIRE/CANCEL → h-11 pills; boss
   epithet → the one sys-italic accent; week-compliance bar → aurora violet.

Verification (orchestrator-run, subagent reports not trusted per truth
hierarchy): strict diff token-scan = ZERO logic/text-content lines changed
across all 5 files (only className/style/comments; the 2 regex hits were
comment/className false positives); eslint 0 ×5 files; tsc = 4 total, src = 0
(exact R46 baseline); browser E2E @390×844 — GOALS: no horizontal overflow,
23 aurora tracks + 18 fills live, sys-seg 0, goal-selector toggle works,
ANALYZE ASCENT click-through renders 15 studio glass cards; TRAINING: aurora
mastery meters, 28 font-display elements, 10 pill-actions, sys-italic exactly
1; 8/8-tab sweep ok with zero page errors (console = known benign THREE.Clock
only); dev.log zero 500s; KAEL byte-stable (xpEvents 15, sessions 12,
bodyMetrics 31, L11/xp118) and side-effect-free after the sweep's BODY visit
(recoveryQuests 0 — the designed insufficient-data path). VLM re-audit: studio
language confirmed landed on both tabs; its "monospace headers" /
"FAB clipping" / "zinc #333 borders" claims DISPROVEN by computed styles
(sys-label = Space Grotesk, chain verified end-to-end: body/sys-label/
font-display/sectionIndex = Space Grotesk, sys-italic = Instrument Serif,
font-mono = Geist Mono) and geometry (FAB bottom 829 vs install top 732 — no
intersection). VLM oscillates; DOM rules (standing R41 doctrine).

Honest scope notes: (1) the GOALS quest rows themselves (SwipeRow surfaces)
still carry the R10 gesture chrome — the shared `swipe-row.tsx` primitive is
used by fuel/records/titles/session-raid too, so its studio conversion is
deliberately deferred to its own round with cross-tab regression; (2)
session-raid.tsx (the ACTIVE session overlay, 1936 lines) deferred by design
— highest interaction density, deserves dedicated QA; (3) `mastery-near`
shimmer is inert now (aurora sheen replaced it; a `.mastery-near
.aurora-fill::after` CSS hook could re-arm — orchestrator CSS backlog);
(4) subagent token wish: `aurora-fill-rose`/`-fuchsia` would complete the
milestone family (hunt/rite fills ride plain gradients on aurora tracks).

**Next highest-priority (R49)**: (a) rollback check (greps: `R48-a studio` +
`R48-b studio` comment markers; git log R48; worklog R48 entries at tail);
(b) **swipe-row.tsx studio skin** (the shared gesture primitive — app-wide
chrome unification, needs fuel/records/titles/directives cross-tab E2E);
(c) session-raid studio pass (deferred from R48); (d) /api/destinations
honest index badges endpoint; (e) offline/PWA simulation; (f) cron quota
retry (still platform-disabled every recreate since 452603). Process: QA in
single-call windows; leave the dev server running.

(Previous cycle R47 — insights integration — COMPLETE and detailed below.)

## Previous cycle detail (R47)

R47 · INSIGHTS INTEGRATION COMPLETE — the R46-discovered latent gap (designed
behaviors that never fired) closed by making BODY the live /api/insights
consumer, exactly per the route's own designed contract ("any tab's insights
fetch (readiness/vitals/body) can render the banner"). Shipped:

1. **`src/components/fitness/body-insights.tsx` (NEW)** — the ANALYSIS
   surface: BodyCompPanel (US-Navy body-fat verdict: numeral + category +
   zone rail with current-zone highlight, lean/fat/weight split, goal
   trajectory with delta-to-goal + weekly fat trend, goal-reached state;
   honest LOCKED state listing the missing tape metrics + a pointer to
   TELEMETRY), VerdictsPanel (8 verdict rows — HEART/SLEEP/PROTEIN/HYDRATION/
   BALANCE/ENERGY/STRENGTH/TRAINING LOAD — each with tone-colored icon chip,
   status dot, right-aligned mono value, two-line-clamped hint; the deload
   row's hint appends "RECOVERY DIRECTIVE ISSUED — SEE DIRECTIVES" when the
   injection fired), and BodyCompCelebrateBanner (the golden side-effect-②
   moment: amber gradient + breathing glow + swaying trophy, reduced-motion
   guarded, aria-live).
2. **`body-atlas-tab.tsx` wired** — mount-level `useApi<InsightsDTO>("/api/insights")`
   (opening BODY now fires both designed side effects), the celebrate banner
   at the tab head, and a new "03 / ANALYSIS" SysSection (teal science zone)
   in the metrics sub-view beneath TELEMETRY (inputs → what the System
   concludes). Zero API/DB/logic changes server-side — the route was already
   correct; it simply had no live caller.
3. **QA-driven fix during verification** — the first VLM/DOM audit caught a
   real defect: VerdictRow hints used `truncate` (the deload hint "Log 3+
   weeks…" clipped mid-sentence); now a 2-line clamp with break-word
   (DOM re-measure: zero clipped elements).

Verification: eslint 0 on both files; tsc = 4 total (all platform-owned
examples/skills; src = 0 — R46 baseline holds); dev.log all-200 zero 500s
through the whole round; KAEL browser sweep @390×844 — BODY tab mounts,
/GET /api/insights 200 in the network trace, BODY COMPOSITION · LOCKED +
all 8 verdict rows render with real KAEL data (58 BPM Excellent / VO₂max 49
Fair / 2 lifts Intermediate / the rest honest unknowns), celebrate banner
absent (goal not reached — honest), ATLAS/LIBRARY/TOOLS sub-views regression-
clean, full 8-tab sweep zero page errors (console = known benign THREE.Clock
warnings only); **the side-effect E2E on a throwaway hunter (R47QA-Sentry,
tz Asia/Kolkata, seeded ×2.0 load spike + waist 80/neck 38 tape)** — opening
BODY in the BROWSER fired: recovery-directive quest injected (day 2026-10-15
IST, target 10, 30 XP), bf-goal-reached achievement + 200 XP granted (L1→L2,
totalXp 200), celebrate banner rendered live ("11.7% BODY FAT · Fitness ZONE
· +200 XP AWARDED BY THE SYSTEM"), TRAINING LOAD row "DELOAD ADVISED · ×2.00
· … RECOVERY DIRECTIVE ISSUED — SEE DIRECTIVES"; throwaway cascaded, KAEL
byte-stable after (deloadQuests=0, bfGoals=0, xpEvents=15, sessions=12,
metrics=31). Screenshots: r47-qa-analysis.png, r47-qa-bodycomp.png,
r47-qa-verdicts-fixed.png, r47-qa-celebrate-banner.png.

**Next highest-priority (R48)**: (a) rollback check (greps: `R47 ·` in
body-insights.tsx; worklog R47 entry at tail; insightsApi in body-atlas-tab);
(b) Phase E design integration (directives/gates tabs still carry pre-R42
chrome); (c) /api/destinations summary endpoint (honest index badges);
(d) Mirage scroll-scrub illumination on one long surface; (e) offline/PWA
simulation; (f) cron quota retry (every recreate since 452603 lands
platform-disabled "exec limits exceeded" — see Known bugs #5).
Process: QA in single-call windows; leave the dev server running.

(Previous cycle R46 — type-debt + dead-code exorcism — condensed below.)

## Previous cycle detail (R46)

1. **Insights type family restored** — 15 lost type names (InsightsDTO +
   14 sub-types) reconstructed in lib/types.ts verbatim from the
   /api/insights route's construction sites. The family was wiped by the
   R36 platform rollback; the route + csv.ts kept importing the names, so
   every analytics surface ran type-blind for ten rounds (runtime was
   never broken — `import type` is erased by SWC).
2. **Import family defined** — ImportFormat / ImportRow / ImportSummary
   for lib/csv.ts (live server code behind /api/import).
3. **Naming aligned** — progression-panel's ProgressionEntry /
   ProgressionSuggestion imports → the real ProgressionEntryDTO / Suggestion.
4. **Seven dead modules deleted** (~1,900 lines): session-share-card.tsx
   + gate-call.ts (both documented dead) + the five legacy pre-tab
   components (analysis-panel, lift-progression, readiness-meter,
   vitals-panel, progression-panel) — all zero-import orphans verified by
   path + export-name greps; the live *-tab.tsx family supersedes them.
5. **Latent gap DISCOVERED (not fixed — R47 candidate)**: /api/insights'
   side effects (ensureDeloadQuest injection, bf-goal-reached achievement
   + 200 XP) fire ONLY inside GET /api/insights, and after the dead-code
   deletion NOTHING in the live app fetches /api/insights — the live stack
   uses /api/coach + /api/readiness instead. The deload directive + body-
   fat goal celebration therefore never trigger on a live user path.

Verification: tsc **49 → 4** (the 4 are platform-owned examples/skills;
   src = 0 — first time since R36); eslint 0 on all touched files;
   agent-browser E2E: fresh-context gate → ENTER (prime.gate.seen=1, zero
   lingering canvases) → KAEL cookie → command deck renders truthfully →
   full 8-tab sweep (STATUS/DIRECTIVES/GATES/BODY/FUEL/VITALS/RECORDS/
   FORGE regions all switch + render, /api/insights 200, /api/progression
   4 entries with live suggestions) → zero page errors; console shows only
   the known benign warnings (THREE.Clock deprecation from the gate,
   Recharts fixed-dims); dev.log all-200 zero 500s; DB purity: KAEL
   byte-stable (L11/xp118/essence356/streak1/9 sessions) — read-only
   round by construction.

**Next highest-priority (R47)**: (a) rollback check (greps: `R46 ·` in
lib/types.ts; worklog R46 entry at tail; absence of session-share-card /
gate-call / vitals-panel in src/components/fitness/); (b) **the insights
integration decision** — either wire a live surface to /api/insights (e.g.
BODY tab analysis) or move the deload/bf-goal side effects onto a live
path (/api/readiness or /api/coach GET) so the designed behaviors actually
fire — needs DB-write QA discipline if side effects move; (c) Phase E
design integration (directives/gates tabs still carry pre-R42 chrome);
(d) /api/destinations summary endpoint (honest index badges); (e) Mirage
scroll-scrub illumination on one long surface; (f) offline/PWA simulation;
(g) cron quota retry (every recreate since 452603 lands platform-disabled
"exec limits exceeded" — 457454 was R45's attempt; retry this round).
Process: QA in single-call windows; leave the dev server running.

(Previous cycle R45 — command deck + destination index — COMPLETE; the R45
agent updated the worklog but NOT this doc (the doc's current-cycle header
still read R44 until this R46 edit). Condensed detail below.)

## Previous cycle detail (R45)

R45 · brief Phase D COMPLETE: Status is the command center — Layer A
command deck (NEW command-deck.tsx: time-aware editorial greeting +
five-readout telemetry strip over one hairline — XP/LEVEL/STREAK/CREDITS/
COMBAT POWER with violet aurora meter + count-ups — and ONE truthful
verdict pill absorbing the old raid/forge CTAs; priority ladder: active
session → claims ready → day banked → begin today's session) + Layer C
destination index (NEW destination-index.tsx: 7 KOTA-style editorial rows,
hollow index numerals, live badges ONLY where data is in hand). status-tab
wiring: heading replaced, raid/forge CTA blocks removed, "04 DESTINATIONS"
section appended. CSS: R45 COMMAND KIT layer (.aurora-fill-violet violet
body + amber tip; .index-row hover hairline-draw). Identity cohesion:
R43 white-alpha literals → violet on status-tab/daily-briefing/hunter-card.
Environment bug documented: appending to globals.css does NOT invalidate
Turbopack's watcher — after any CSS append, touch layout.tsx and reload.
Verification: eslint 0; tsc 49 = baseline; E2E gate→ENTER→deck renders
truthfully (verdict "BEGIN TODAY'S SESSION · ×1.5 rift" cross-checked
against /api/sessions); destination rows navigate; 390×844 zero overflow;
7-tab sweep clean; VLM audits A+ / A-; DB byte-stable. SW/PWA re-verified
by inspection (precache = shell only; runtime SWR for chunks).

## Previous cycle detail (R44)

R44 · IMMERSIVE 3D ENTRY (brief Phases A–C) COMPLETE — the "PRIME Immersive
3D Experience Redesign" brief (Studio Mirage × KOTA; existing product
redesign, not greenfield; preserve the v2.0 handoff spec) landed its first
three phases:

1. **Phase A — reference + audit**: studiomirage.io + madebykota.com
   studied live (DOM/computed-style extraction + VLM screenshots; worklog
   Task ID 2): 15 ranked transferable techniques (one-accent discipline,
   −0.03em display tracking law, hairlines 8–20% white, glass pill +
   conic border-shine, tiny meta tier, section rhythm tokens) + a
   do-not-copy list (their blues/oranges/commercial fonts/full
   scroll-hijack). Disk audit: R43 monochrome base confirmed; the three
   old blockers (NOT_AWAKENED calibration loop, name-claimed, publish
   failure) already fixed WITH evidence in R39/R40 — no re-litigation;
   dev-watchdog was down (stale pidfile) → restarted.
2. **Phase B — violet-primary identity restored** (the brief
   re-establishes violet on R43's structure): @theme violet-* un-remapped
   from R43 zinc to a true violet scale — electric bright end
   (#a78bfa/#8b5cf6) → deep aubergine dark end (#3b1375/#270b52/#170630)
   — so ~1,600 existing violet-* usages re-render app-wide with ZERO
   component edits; :root --primary → electric violet oklch(0.62 0.19
   285) (+ring/chart-1 follow, background takes a hue-285 breath); body
   ambient air gold→violet (gold now achievements-only, never ambient);
   ripple rings → violet/teal whispers; gate kit added
   (.glass-pill-violet, .aura-glow-violet, .gate-breathe, .gate-rise +
   reduced-motion guards).
3. **Phase C — signature entry experience**: NEW
   src/components/system/prime-gate.tsx + gate-scene.tsx. Gate = cinematic
   full-viewport overlay, ONCE per browser session (sessionStorage
   prime.gate.seen); PWA-standandalone + awakened profile skips it
   entirely; ENTER visible from first frame (no timed gate), Esc enters,
   auto-focused, role=dialog; CSS composition (layered-gradient monolith
   + seam + ellipse rings + breathing aura) renders instantly and doubles
   as the WebGL loading placeholder AND permanent fallback (no-WebGL /
   import-failure-via-boundary / reduced-motion). Scene = R3F obsidian
   monolith (plinth/shaft/crown) + violet emissive seam + 3 orbit rings
   (violet×2 + one teal data whisper) + seeded-LCG particles + additive
   aura; pointer parallax; REAL-state only: ready → ignition lerp,
   entered → camera push z 6.2→4.55 + ring surge + seam flare; lowPower
   → dpr 1 + 70 particles; lazy ssr:false, texture disposed on unmount.
   Copy: "Your next evolution starts here." / "One system. Real training.
   Measurable progression."; truthful status line (verified live:
   "HUNTER KAEL · D-RANK · LV 11"); ENTER pill = glass + rotating conic
   border-shine (framer GPU transform) + violet aura. In-round bug fixes:
   SSR window-guard crash (2 transient 500s, fixed same round) +
   react-hooks/set-state-in-effect compliance.

Verification: eslint 0 on all 4 touched files; incremental tsc = 49 =
exact 45+4 baseline, 0 new; agent-browser 390×844 E2E — fresh-context
gate → ENTER → #awakening-ritual present (install-prompt coordination
contract intact) → session marked → scroll lock released; reload → gate
skipped with ZERO lingering canvases (disposal verified); KAEL cookie →
real identity status + ignition; 8-tab sweep all [role=region] render,
zero error screens, zero page errors; dev.log zero post-fix 500s; VLM
gate audit: "Cinematic Immersive Entry", palette strictly
obsidian/violet/teal (no blue/green/gold flags), legibility Good, WebGL
centerpiece visually confirmed. DB: zero write paths touched (purity by
construction).

(Previous cycle R43 — MIRAGE STUDIO re-theme — detail below; also
condensed in worklog R43 entry.)

## Previous cycle detail (R43)

R43 · MIRAGE STUDIO re-theme COMPLETE (user directive: "remove the nature
feel, i meant more professional less sci fi — combine the elements from
studiomirage.io + madebykota.com, almost like studiomirage.io"). The R40-R42
Grove nature theme (forest greens, fireflies, falling leaves, botanical
Fraunces) is RETIRED. References re-researched fresh this round (live DOM +
VLM): Mirage = void black #050505, ivory monochrome, frosted glass pills,
warm gold CTA glow, film grain, oversized grotesque; Kota = white-on-black,
italic serif micro-accents, ghost pills. Shipped:

1. **Foundation** — @theme violet-* remapped to the neutral white-grey scale
   (zinc values; ~1,600 usages re-render monochrome instantly, class names
   preserved); fuchsia-* stays amber (the ONE gold accent); :root tokens →
   void black #060607 / ivory / WHITE primary (Mirage squircle CTA);
   .sys-panel + .glass-pill → true white-alpha frosted glass; 105 emerald
   literals + forest substrates swept to ivory/neutral; fonts Nunito→Space
   Grotesk + Fraunces→Instrument Serif (same CSS var names — zero component
   edits); .sys-display/.sys-section-index → grotesque; metadata/title/
   manifest/themeColor → "PRIME — Training Studio" / #060606.
2. **Nature layer deleted** — grove-ambient.tsx (fireflies+leaves) replaced
   by studio-ambient.tsx (Mirage edge rim-light: two breathing white
   crests); firefly/leaf keyframes + guards swapped for .studio-rim;
   footer/error copy professionalized ("TRAINING STUDIO · SESSION BY
   SESSION", "SOMETHING BROKE").
3. **Shell pass** (R43-a) — nav leaf badge → ivory "P" monogram; marquee
   "walks the grove"→"on the board", 🌿→"·"; boot "Preparing your studio";
   awakening-screen VISUALS ONLY (#awakening-ritual + cookie logic
   untouched); system-panel glyph → static ivory squircle; "Plant PRIME"→
   "Install PRIME"; row-hint/tab-skeleton neutral.
4. **Home surface** (R43-b) — rank ladder sinusoidal arc flattened to a
   clean rail; ivory→gold two-tier rank letters; "The studio is open."
   editorial heading; emerald deltas/badges → amber; MOVE ring white→gold
   SVG gradient.
5. **Data semantic layer** (R43-c + orchestrator sweep) — game.ts RANKS →
   zinc-lightness F→C then gold-ascending B→S (also kills the pre-existing
   sky-BLUE D-rank violation); STAT_DEFS 5-distinct re-hue (str rose / vit
   ivory / endur amber / agi teal / flex dim-zinc); READINESS_BAND_META →
   PRIMED gold / READY teal / MODERATE orange / LOW rose; vitals NORMAL
   chips zinc; ALL literal emerald/green hexes eliminated app-wide (fuel,
   week-compare, body-metrics, chronicle, HumanModel 3D heat ramp zinc→gold,
   BodyView MEV/MAV/MRV, ScienceView → teal clinical, analysis-panel ramps/
   zones, data-vault, share/digest canvases → black/ivory/gold).
6. **Sci-fi signature killed** — DecodeText glyph pool "▚▞▮▯/\\|<>+*#01" →
   "ABCDEFGHIJKLMNOPQRSTUVWXYZ" (editorial flipboard settle; identical
   motion/aria/reduced-motion contract); "▚ REJECT" → "× REJECTED".

Verification: tsc 49 = exact baseline (0 new across ~45 touched files);
eslint 0 everywhere; 8-tab sweep all-200 zero console errors, dev.log clean
(no 500s the whole round); DOM probes (Space Grotesk live, grain+rim+
panels, zero grove remnants); app-wide rg zero literal greens/glitch glyphs/
emojis/nature vocabulary; VLM home audit **B+** ("nails the monochrome void,
grotesque typography, and gold accent — strictly monochrome, no green";
remaining gap = the gamified HUD chrome, which is standing domain
vocabulary, not a styling defect); DB purity byte-stable (KAEL L11/xp118/
essence356; two documented adoptable shells; zero writes this round).

**Next highest-priority (R44)**: (a) rollback check (greps: `R43 · MIRAGE
STUDIO` in globals.css; `studio-ambient` in page.tsx; `Space_Grotesk` in
layout.tsx; worklog R43 entries ~line 3769+); (b) typographic de-HUD pass
(chip/label editorialization toward the VLM's A grade); (c) the 45-error
type exorcism (sixth straight preemption — genuinely top P2); (d)
per-device timezone day boundaries; (e) offline/PWA re-verification post
re-theme; (f) cron quota retry. Process-reap doctrine: QA in single-call
windows; leave the dev server running.

(Previous cycle R42 — Mirage × Kota studio pass — COMPLETE and documented below.)

## Previous cycle detail (R42)

R42 · MIRAGE × KOTA studio pass COMPLETE (user directive: "combine the
elements from studiomirage.io + madebykota.com and create almost like
studiomirage.io" — continuing the natural/flowy/animated de-sci-fi arc).
Both references researched live (agent-browser) + VLM synthesis. Shipped:

1. **Foundation tokens** — globals.css "R42 · STUDIO GROVE" layer:
   .sys-italic (Fraunces TRUE italics — style axis enabled in layout.tsx),
   .aurora-track/.aurora-fill (3px luminous hairline meters, dissolved
   ends, sheen), .glass-pill(-amber), .aura-glow(-amber) (breathing radial
   behind content), .grove-marquee (54s whisper ticker), .line-reveal,
   .depth-card, .pill-action. All reduced-motion guarded, palette untouched.
2. **Pipeline bug fixed** — LightningCSS strips backdrop-filter when the
   -webkit- twin is co-declared; twins dropped (.sys-panel/.sys-notice/
   .glass-pill) — every R41 panel regains its intended blur (R42-b's
   served-CSS discovery; R41 panels had silently rendered blur-less).
3. **Chrome** (R42-b) — GroveMarquee ticker under the TopNav (hunter's own
   story drifting by), floating glass-pill BottomNav (safe-area contract
   preserved; aura halos on the active tab; label-collision fix),
   XPBar → aurora hairline, whisper row-hint, fern tab-skeleton.
4. **Home surface** (R42-a, recovered after its context deadline) — amber
   glass-pill readiness banner (driver detail → tooltip/sr), 2x header
   breathing, single organic-ring avatar, 31vw oversized LEVEL numeral,
   rank ladder glass pills, aurora quest meters, capsule CTA with aura.
5. **Integration pass** (orchestrator) — INSTALL PRIME ad-unit → amber
   glass capsule ("Plant PRIME"/"Not now"); SWIPE TO NAVIGATE billboard →
   whisper pill; D-RANK contrast zinc-300; rank ladder ±2px organic arc;
   sections 02/03 pt-9 rhythm.

Verification: VLM re-audit **A-** (five flagged tells all verified fixed,
zero new defects); 8-tab sweep zero console errors; clean-mark sweep 50/50
requests 200, zero 500s (earlier nutrition-500 burst root-caused to a
subagent's mid-edit compile window — self-healed); unawakened flow marker
intact; eslint 0 on every touched file; tsc 49 = exact baseline (0 new);
DB untouched (KAEL byte-stable; two adoptable shells remain).

**Next highest-priority (R43)**: (a) rollback check (greps: `R42 · STUDIO
GROVE` in globals.css; `GroveMarquee` in nav.tsx; `style: ["normal",
"italic"]` in layout.tsx; worklog R42 entries ~line 3708+); (b) extend the
studio pass to the seven non-home tab surfaces (directives/gates/body/fuel/
vitals/records/rewards + oracle-console — the tokens are ready, those tabs
still carry pre-R42 chrome); (c) the 45-error type exorcism (fifth straight
preemption — genuinely top P2); (d) per-device timezone day boundaries;
(e) offline/PWA re-verification; (f) cron quota retry. Process-reap
doctrine: QA in single-call windows; leave the dev server running.

(Previous cycle R41 — THE GROVE re-theme — COMPLETE and documented below.)

(Previous cycle R40 — cookie wall round 2 — COMPLETE and documented below.)

R40 (user-blocking cookie wall — round 2) COMPLETE. The R39 fix was verified
against a manually-set header and so passed a test the real path could never
take: the platform edge terminates TLS and forwards plain HTTP to Caddy :81,
so `x-forwarded-proto` is ALWAYS "http" and the strict cookie branch never
fired — tonight's dev.log showed the user awakening ("sdfgh"), the adoption
code healing both retries, and the calibration leg 404ing all three times.
Fixed, verified, documented:

1. **Host-based identity cookie** (`identityCookieOpts`): non-loopback Host ⇒
   came through the platform's HTTPS edge ⇒ `SameSite=None; Secure;
   Partitioned`; loopback keeps Lax; `x-forwarded-proto=https` still
   short-circuits for future TLS proxies. Evidence line `[identity] hunter …
   host=… x-forwarded-proto=…` logs the decision inputs at every create.
2. **Early cookie verify probe** in the awakening flow — moved BEFORE the
   calibration leg (mount-404 → create-200 → verify-200 → calibration-200 →
   mount-200 in the live network trace); the honest blocked-cookie message
   now shows before calibration "fails".
3. **Verification ladder** — curl matrix through the real gateway path shape
   (external Host + proto=http → strict attrs on create, idempotent re-awaken,
   and DELETE clear), loopback → Lax; fresh-browser onboarding E2E @390×844
   (app mounts, calibration lands, notice shown, zero page errors); KAEL
   8-tab sweep clean; eslint 0; tsc 45+4 pre-existing, 0 new; DB pure (QA
   cascaded; user's "Kael" + "sdfgh" shells left adoptable; 132 quests = 60
   null + 72 rolled with KAEL's +4 Oct-13 IST roll being the designed
   day-boundary behavior, not drift).

**USER ACTION NEEDED**: retry awakening in the preview panel — the cookie
should now land (Chrome/Firefox); if the browser still refuses (Safari), the
screen now says so honestly with the open-first-party escape. Watch dev.log
`[identity]` lines for live evidence. The publish button re-test also remains
from the user's seat (R39 made the isolated build exit 0 twice).

**Next highest-priority (R41)**: (a) rollback check first (greps: `loopback`
regex + `logIdentityDecision` in hunter route, `R40 — verify the identity
cookie` in awakening-screen; worklog ≥ ~3,6xx lines; the "Kael"/"sdfgh"
shells + `[identity]` lines in dev.log); (b) **finish the type-surface
exorcism** (45 tsc src errors — re-export the insights type family from
lib/types.ts, align ProgressionEntry naming, delete the dead
session-share-card, decide gate-call's focus/rirTarget half-feature) —
preempted by R40's P0, still the top P2; (c) offline/PWA re-verification;
(d) analytics tz-grouping (P3); (e) cron job 455216 quota retry. Remember the
process-reap doctrine: QA in single-call windows; leave the dev server
running at session end.
