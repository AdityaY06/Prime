# Task 17-d — full-stack-developer — Body-Fat Goal Celebration UX (body-metrics.tsx)

## Task
Extend the Body Composition panel (METRICS view, BODY tab) to celebrate body-fat goal milestones driven by the new `/api/insights` bodyComp payload: `celebrate` (true only during the 2-minute window after the goal was first reached; backend grants +200 XP + the "Composition Master" achievement/title exactly once on the first crossing fetch) and `goalReached` (persistent). Only `src/components/fitness/body-metrics.tsx` was allowed to change.

## What was built

- **GoalCelebrationBanner** — rendered above the Navy-tape gauge whenever `bodyComp.celebrate` is true on the panel's fetch: full-width emerald strip (border `emerald-500/50`, bg `emerald-500/[0.08]`), lucide `Sparkles` icon with static emerald drop-shadow, "TARGET ZONE REACHED" mono `tracking-[0.25em]` emerald-300 headline, "COMPOSITION MASTER TITLE UNLOCKED · +200 XP" zinc-300 sub-line (`sm:ml-auto`), and a min-h-11 "SET A NEW GOAL" button (`setTab("fuel")`) plus "GOAL SETTING · FUEL TAB → CALIBRATE PROFILE" hint (the goal select lives in the fuel tab's CALIBRATE PROFILE dialog). Framer-motion scale-in 0.96→1 + `boxShadow` keyframe loop (0→22px emerald glow, 2.8s repeat ∞), both gated on `useReducedMotion` (opacity fade only); `role="status"` + `aria-live="polite"`.
- **One toast + one voice** — `useEffect` on `celebrate` → `claimBfCelebration()` guard (module-level in-memory flag + `sessionStorage` key `"bf-celebration-v1"` with try/catch storage fallback) → `pushNotice({kind:"xp", title:"GOAL REACHED", body:"Body-fat target zone — +200 XP · Composition Master"})` + `speak("Target zone reached. Composition Master unlocked.")`. The banner itself renders on every celebrate fetch; the toast/voice fire once per browser session across panel remounts, reloads, and sibling insights consumers.
- **Persistent IN TARGET ZONE badge** — `goalReached && !celebrate`: small emerald chip (emerald-300, border `emerald-500/40`, bg `emerald-500/[0.07]`, `CheckCircle2` icon, `title` + `aria-label` tooltip "Current body fat is at or below your goal target") appended in the tile row. Row converted grid→`flex flex-wrap` (tiles `grow basis-[calc(50%-4px)] sm:basis-[calc(25%-9px)] min-w-[118px]` — identical 2-up mobile / 4-up sm+ sizing as before), badge `ml-auto self-center` so it can never collide with the GOAL tile or the TREND chip (toward/away semantics untouched).
- **Aria** — gauge meter `aria-label` gains a "Target zone reached." clause when goalReached.

## Verification (all passed)
- `bunx tsc --noEmit` → 0 errors (only pre-existing examples/+skills/ noise, excluded per spec); `bun run lint` → exit 0.
- Dev server healthy on :3000; `tail -30 dev.log` all 200s, no errors.
- agent-browser QA (`--session t17d`, 1280×900): reset script → page load (STATUS readiness fetch fires the grant) → BODY → METRICS → emerald banner above gauge + XP toast top-right + `POST /api/tts` in dev.log → `screenshots/t17d-celebration.png`. VLM 2-pass review confirms banner (border/icon/headline/sub-line/button clean, above the gauge) and toast fully inside the viewport.
- Achievement landed: `/api/achievements` lists `bf-goal-reached` (Composition Master, epic tier). SET A NEW GOAL click-verified → FUEL tab active (aria-current "Fuel", DAILY FUEL panel).
- Window expiry (120s): API shows `goalReached=true, celebrate=false`; page reload → banner gone, **no** second toast (sessionStorage guard held), "IN TARGET ZONE" badge in DOM + VLM-verified in `screenshots/t17d-badge.png` (chip at the right edge of the GOAL tile row, four tiles still evenly sized, TREND −1.2%/WK chip collision-free, zero overlap/cut-off).
- Mobile 390×844: BODY → METRICS → `scrollWidth === 390` (zero horizontal overflow), badge readable below the GOAL tile, 0 page errors (console only pre-existing THREE.Clock deprecation) → `screenshots/t17d-mobile.png`.
- Final cleanup per spec: reset executed + printed (`FINAL RESET — achievements deleted: 1 | xpEvents deleted: 1`), DB-verified (achievement count 0, xpEvent count 0, XP reverted 51/530 · totalXp 2876). No `/api/insights` fetch after the reset → the lead agent's integration QA will observe the live grant + banner + toast on the first fetch.

## Files changed
- `src/components/fitness/body-metrics.tsx` (only file touched; +~110 lines, imports +useEffect/+CheckCircle2/+Sparkles)
- `/home/z/my-project/worklog.md` (appended Task 17-d record)

## Deviations
- Toast screenshot required a re-trigger: the agent-browser `wait "text=…"` selector syntax timed out while the 4.5s toast lived; cleared the sessionStorage guard + reloaded — each trigger fired exactly one toast + one (cached) TTS POST, proving the dedupe guard.
- At ≥sm the badge sits right-aligned under the GOAL column (the four tiles fill the row exactly, so the chip wraps to its own line — flex-wrap per spec, never overlapping); on mobile it wraps below the GOAL tile.
- Hunter XP left at the pre-grant baseline 51/2876: the achievement present at task start was a post-backend-reset re-fire; every trigger/reset pair run during QA was symmetric, and the mandated final reset restores exactly the state the backend QA handed over (celebration armed).
- VLM pass-1 false positives disproved by cropped re-check: toast "cut off at right edge" (fully inside, `right-3` margin) and "GOAL 13.5 caption overlaps arc" (misread of the pre-existing 16-d GOAL 15.5 caption — code unchanged).
