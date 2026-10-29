# R27-b — full-stack-developer — Phone-first bundle optimization (tab-level code splitting)

Task: Convert the 8 statically-imported ring tabs in src/app/page.tsx to lazy `next/dynamic` client chunks (ssr:false) with an honest TabSkeleton, keeping three.js/recharts/food-DB out of the initial payload for the Play Store TWA target. Navigation-only QA; DB purity law; no tsc (orchestrator's single combined run); eslint only.

## Files
- NEW `src/components/system/tab-skeleton.tsx` (34 lines) — honest chunk placeholder: hero h-32 (zinc-900/70 + zinc-800/50 border) + twin h-20 zinc-800/50 stat blocks + h-24 list block; aria-busy + role=status + sr-only "Loading panel"; framer opacity pulse 0.45→0.8→0.45 honoring useReducedMotion (verified animationName "none" under emulation); inline animate objects (no `variants`) → immune to the shell region's variant propagation (FlowReveal house rule).
- EDIT `src/app/page.tsx` — 8 static imports → dynamic wrappers:
  `StatusTab, DirectivesTab, GatesTab, RecordsTab, RewardsHubTab, FuelTab, VitalsTab, BodyAtlasTab` all `dynamic(() => import("@/components/fitness/…").then(m => m.X), { ssr: false, loading: () => <TabSkeleton /> })`.
  STAY STATIC (mount with the shell regardless of tab — deferring saves nothing, delays paint): BootScreen, AwakeningScreen, NotificationStack, RewardOverlay, SessionShareDialog, SystemVoice, TopNav/BottomNav, SwipeFlow, OracleConsole (global stateful FAB — verified NOT per-tab-scoped per dispatch rule).
- NOT touched: use-api.ts (R27-a owns), everything else. Zero new deps/routes/schema changes.

## Structural proof (the honest instrument = browser network timeline; dev.log does NOT log chunk requests)
- BEFORE: 44 initial scripts / 16,095,770 B dev-measure, incl. three stack ~4.1MB + recharts 1.0MB + all tab chunks + lodash/radix/floating-ui/lucide.
- AFTER: 19 initial scripts / 5,545,764 B (−10.55MB, −65.5% dev-measure; HTML 35.8→24.8KB). Win is structural — persists proportionally minified.
- On-demand timeline (session r27b): initial [.4–.23] shell only → STATUS render [.73–.81] status-tab + vitals-tab (VitalsSnapshot dep) + sensor-hub + recharts + lodash → GOALS [.95–.97] directives-tab + lucide → TRAINING [.100–.102] gates-tab → BODY [.114–.122] three_core + three_module×2 + RoomEnvironment + @react-three/fiber + body-atlas-tab → FUEL [.129–.131] fuel-tab → VITALS [.136] vitals-tab → PROGRESS [.152–.154] records-tab → REWARDS [.166] rewards-hub-tab.

## QA (390×844, named sessions r27b/r27b-skel, .grid-cols-8 click-by-eval)
- Boot → STATUS full (KAEL/XP/BRIEFING); TabSkeleton caught LIVE then cleared. All 8 tabs landmark-verified (GOALS: DAILY ORDERS+LONG GAME; TRAINING: coach strip + 5 gates Cardio/Strength/Calisthenics/Mobility/Full Body — dispatch's "IRON FORGE" names stale vs gates.ts; BODY: BIOMASS+ATLAS+canvas; FUEL: INTAKE+MICROS; VITALS: SIGNALS+ZONES+READINESS; PROGRESS: EXPORT+LOAD CURVE; REWARDS: VAULT+PERK FORGE). No stuck skeletons; scrollWidth 390 everywhere.
- Rapid TRAINING→VITALS→TRAINING @250ms: single region remains, exits unmount, nav current correct.
- Oracle FAB 48×48 opens console + closes on real Escape; deep-links ?tab=vitals → VITALS, ?tab=banana → STATUS (R20-a intact). Reduced motion: skeleton static (animationName none), VAULT renders.
- Console: documented-benign only (THREE.Clock — now only after BODY's on-demand load; recharts fixed-size warnings; DevTools info; Fast Refresh from parallel R27-a). Zero page errors. One R27-a rebuild mid-QA — re-verified green after.
- VLM audit r27b-tab-skeleton-live.png: 9/10.
- eslint both files exit 0 (twice). NO tsc (single-tsc law). dev.log all 200s.
- DB purity (read-only bun:sqlite, REAL tables): WorkoutSession 12 / ExerciseLog 11 / BodyMetric 31 / XpEvent 15; KAEL L11/118/2943/356 — byte-identical baseline.

## Decisions & deferred findings
- Prefetch SKIPPED (deliberate): idle import() warm-up would eagerly compile all 8 tabs in dev (destroying the on-demand evidence + stalling the server during R27-a's concurrent use-api edits); chunks are small/HTTP2 and the 0.32s enter transition covers the fetch. No hidden mounts, no hacks.
- Deferred to orchestrator: (1) status-tab.tsx:14 value-imports VitalsSnapshot from vitals-tab → STATUS chunk drags vitals+sensor-hub+recharts; extract VitalsSnapshot to decouple; (2) Turbopack dev duplicated vitals-tab under two chunk hashes across chunk graphs (dev-only; registry keeps single evaluation — don't read dev chunk counts as prod truth); (3) future bundle QA: use `agent-browser network requests --filter chunks`, not dev.log; (4) revisit prefetch only with a prod-build measurement on mid-range Android; (5) landmark drift — always audit dispatch landmarks against disk.
