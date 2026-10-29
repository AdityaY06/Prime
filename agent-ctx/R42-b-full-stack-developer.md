# R42-b — full-stack-developer (app chrome "Studio Grove" polish)

Task: GroveMarquee ticker + floating glass BottomNav capsule + TopNav breathing room + aurora XP hairline + whisper row-hint + emerald shimmer skeleton. Files: nav.tsx, grove-marquee.tsx (new), xp-bar.tsx, row-hint.tsx, tab-skeleton.tsx, rank-badge.tsx (inspected, zero changes).

## Status: COMPLETE

- eslint exit 0 on all six files (run twice, before + after final tweaks).
- agent-browser 390×844 with prime-hunter=kael-dev-token: zero page errors across the full session (initial load, 4 tab taps, reloads, reduced-motion emulation, desktop pass).
- dev.log: clean compiles, no 500s.
- Full details in worklog.md → "Task ID: R42-b" (appended at the end).

## Key results

1. **GroveMarquee (new)** — 6 hunter-derived fragments (streak / totalXp / essence / equipped-title-or-archetype "walks the grove" / level—rankTag / sessions) ×2 copies, 🌿 separators, py-1.5 text-[9px] zinc-500, pointer-events-none + aria-hidden, useReducedMotion → null. Drift verified numerically (−87.8 → −283.8 px over 3s).
2. **BottomNav** — floating `.glass-pill` capsule: inset-x-2.5, `bottom: calc(env(safe-area-inset-bottom) + 0.625rem)` (safe-area contract preserved), `backdrop-blur-md` utility (pipeline workaround), emerald hairline on the top lip, active tile `.aura-glow` halo (rounded-full so the halo is circular), gliding underline kept, labels tracking 0.05em (fixed a measured 3px PROGRESS/REWARDS collision), tabs 46×52px.
3. **TopNav** — py-4.5 breathing room, marquee on the bottom edge, voice/settings faded to opacity-60 (hover/focus restore, ::after hit pads).
4. **XPBar** — aurora-track/aurora-fill hairline inside the original 12px wrapper (zero layout shift); % label byte-identical; props signature unchanged.
5. **RowHint** — whisper: chevrons + 8px zinc-600 "swipe rows to act", aura-breathe opacity breathing, faint blur pill, same session/portal/observer contract.
6. **TabSkeleton** — emerald gradient pulse (via-emerald-900/40), layout/aria identical.
7. **RankBadge** — untouched (git diff empty).

## Flag for the orchestrator (foundation bug)

The Turbopack/LightningCSS pipeline STRIPS `backdrop-filter` from any rule declaring BOTH `backdrop-filter` and `-webkit-backdrop-filter` (same value). Served CSS proof: `.glass-pill`, `.sys-panel`, `.sys-notice` compute `backdrop-filter: none` (no blur since R41!), while `.swipe-hint`/`.row-hint` (standard property only) keep theirs, and Tailwind `backdrop-blur-*` utilities work. Fix in globals.css: drop the `-webkit-` duplicates. My capsule uses the `backdrop-blur-md` utility as a local workaround.

## Notes for parallel agents

- The tab-level "SWIPE TO NAVIGATE" chip (`.swipe-hint`, env+5.25rem perch) visually overlaps the hunter-card rank-ladder area on first session — that surface belongs to the fitness-home agent.
- Bottom capsule geometry: 370×62px, 10px off-bottom → main content pb-28 (112px) clears it comfortably; row-hint perch (env+7.5rem) clears it by 48px.
