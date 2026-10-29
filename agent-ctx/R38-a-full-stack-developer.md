# R38-a — rift/boss countdown timezone threading (subagent record)

Task ID: R38-a
Agent: subagent (R38-a — rift/boss countdown tz threading)
Owned files (EXCLUSIVE): src/lib/rift.ts · src/lib/bosses.ts · src/components/fitness/gates-tab.tsx · src/components/fitness/boss-banner.tsx · src/components/fitness/rest-day-card.tsx

## What was done

R38 threads per-device timezone day boundaries through the product. The
orchestrator landed `Hunter.timezone` (IANA, nullable) + the pure tz helpers in
src/lib/game.ts (`dayKeyIn`, `weekStartKeyIn`, `tzDayWindow`,
`msUntilNextTzMidnight`, `keyAfter`, `keyBefore`, `isValidTimeZone` — all
null/invalid-safe with legacy fallback). This agent threaded the timezone into
the two countdown libraries and their three UI consumers.

### 1. rift.ts
- `msUntilNextRift(tz?: string | null, now: Date = new Date())` — valid tz →
  delegates to `msUntilNextTzMidnight(tz, now)`; null/undefined/invalid → the
  EXACT legacy `Date.UTC(y, m, d+1)` math, byte-compatible for pre-R38 hunters.
- File header rewritten: rotation rolls at the HUNTER's midnight when
  Hunter.timezone is set (server routes pass `dayKeyIn(hunter.timezone)` to
  `riftOfTheDay`); null-timezone hunters keep the 00:00 UTC roll.
- `riftOfTheDay` / `isRiftGate` / `riftEffectiveMult` signatures UNCHANGED
  (explicit day param; no-day callers keep device-local behavior).
- Doc comment keeps the R37-a history + adds the R38 semantics.

### 2. bosses.ts
- `msUntilNextBoss(tz?: string | null, now: Date = new Date())` — valid tz →
  `weekStartKeyIn(tz, now)` (this week's Monday key in tz) → local `keyAfter7`
  helper (loops `keyAfter` ×7 — no new game.ts exports) →
  `tzDayWindow(nextMonday, tz).start.getTime()` is the DST-correct spawn
  instant; returns `Math.max(0, boundary − now)`. Null/undefined/invalid →
  exact legacy UTC math preserved.
- `bossOfTheWeek` / `weekStartOf` signatures UNCHANGED. Doc comment updated
  (Monday midnight in the hunter's zone; UTC fallback for null).

### 3. gates-tab.tsx
- Import: `import { dayKeyIn, type ExerciseType } from "@/lib/game"`.
- `GatesTab`: `const riftDay = dayKeyIn(hunter.timezone)` (single source of
  truth) → `rift = riftOfTheDay(riftDay)` (matches the server's grant day) and
  `isRiftGate(gate.id, riftDay)` in the gate-card map.
- `RiftCountdown` / `RiftBanner` gain `timezone: string | null`, threaded from
  `hunter.timezone`; `BossBanner` gets `timezone={hunter.timezone}`.
- Countdown idiom REWRITTEN to the heartbeat pattern: the interval only bumps a
  beat counter; the label is DERIVED at render time from the CURRENT timezone
  prop. Rationale: the first attempt re-set state synchronously inside the
  effect body on tz change and tripped `react-hooks/set-state-in-effect`
  (eslint error). The heartbeat is lint-clean AND strictly more correct — a
  timezone prop change reflects on the very next render with no stale
  useState initializer and no ≤1s lag.
- Stale R37-a comment "(next local midnight)" replaced with the truthful
  per-timezone description. No display copy in gates-tab claimed a fixed UTC
  reset ("ROTATES IN" is zone-neutral) — nothing else to change.

### 4. boss-banner.tsx
- `BossCountdown({ timezone?: string | null })` — heartbeat pattern (same
  reasoning as RiftCountdown); `BossBanner` gains optional
  `timezone?: string | null` prop (documented: weekly challenge rolls at the
  hunter's Monday midnight; absent/null keeps UTC).
- BossBanner receives NO hunter itself — the timezone is passed as a prop from
  its only render site, gates-tab.tsx (which has `hunter`), per the spec's
  "cleanest existing prop path; no new global stores". Verified via grep:
  gates-tab.tsx is the ONLY importer of BossBanner.
- `BossCountdown` doc comment updated; display copy ("ENDS IN" /
  "NEXT CHALLENGE IN") is zone-neutral — unchanged.

### 5. rest-day-card.tsx (words only, zero logic)
- Line 247: "STREAK SHIELD ACTIVE UNTIL MIDNIGHT" →
  `STREAK SHIELD ACTIVE UNTIL {hunter.timezone ? "YOUR MIDNIGHT" : "MIDNIGHT UTC"}`
  (the component already receives `hunter: HunterDTO`). Truthiness check
  matches the spec's letter; an invalid stored tz can't occur through the app's
  write path (orchestrator validates on save).

## Verification
- `bunx eslint src/lib/rift.ts src/lib/bosses.ts src/components/fitness/gates-tab.tsx src/components/fitness/boss-banner.tsx src/components/fitness/rest-day-card.tsx` → **exit 0** (first run exit 1 with 2 `react-hooks/set-state-in-effect` errors from the sync-setLabel-in-effect variant; fixed via the heartbeat rewrite, re-run clean).
- Caller sweep (grep): `msUntilNextRift` / `msUntilNextBoss` are called ONLY in
  gates-tab.tsx + boss-banner.tsx (both mine) — the signature change
  (tz-first optional param) breaks no positional-Date callers.
- Byte-compatibility reasoned line-by-line: null/undefined/invalid tz paths
  execute the exact pre-R38 expressions (`Date.UTC(y, m, d+1)` /
  weekday-aware `Date.UTC(y, m, d + (7 − dow))`).
- No dev server, no DB writes, no tsc (orchestrator owns merged type-check),
  no new deps, no test files, colors untouched (violet/fuchsia/teal/amber +
  emerald/rose/zinc only).
- NOT verified (out of my reach this round): live browser rendering (dev server
  down between orchestrator calls), merged tsc, and DST-boundary spot checks at
  runtime — recommend the orchestrator's R38 QA suite covers
  `msUntilNextRift`/`msUntilNextBoss` with tz set (e.g. Asia/Kolkata Monday
  03:30 wallclock case: null-tz hunter sees ~2h on Sunday 22:00 UTC, tz hunter
  sees ~6d20h — intended R38 behavior change, not a bug).

## Deviations from spec
1. Heartbeat-derived countdown label instead of "re-create the interval on
   timezone change" — the spec's own fallback ("or compute inside the tick
   from a ref — keep it simple and correct") anticipated flexibility; the
   direct interval-recreate variant I wrote first tripped the repo's
   `react-hooks/set-state-in-effect` rule, and the heartbeat is simpler and
   strictly more correct (tz change reflects immediately, no 1s staleness).
2. `isRiftGate(gate.id, riftDay)` uses one shared `riftDay` const instead of
   calling `dayKeyIn(hunter.timezone)` inline twice — same value, single
   source of truth, one fewer computation per render.
3. BossBanner takes `timezone?: string | null` (optional) rather than required
   — it has no hunter of its own and gates-tab is its only render site; the
   optional prop keeps the component usable if another parent ever renders it
   without a hunter (falls back to UTC semantics, never crashes).
