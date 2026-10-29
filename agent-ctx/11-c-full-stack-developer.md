# Task 11-c — Oracle AI advisor (full-stack-developer)

## Context
ASCENDANT gamified fitness app (Next.js 16 App Router + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite).
Dark "System window" aesthetic: violet/fuchsia on #07060c, `sys-panel` corner brackets, mono labels.

## Work Log
- Read worklog.md + key pattern files (session-raid.tsx, system-panel.tsx, use-api.ts, engine.ts, game.ts, types.ts, titles.ts, prisma schema, globals.css).
- Created `src/app/api/oracle/route.ts` (POST, `force-dynamic`):
  - Validates body messages (role user/assistant, string content), keeps last 10, caps content at 2000 chars → 400 "No messages provided." on empty, 400 "Invalid request body." on bad JSON.
  - `requireHunter()` → 404 `NOT_AWAKENED` when NO_HUNTER.
  - Fetches live context via Promise.all: last 5 cleared `workoutSession`s, today's `daily` quests (`dayKey()`), all `personalBest`s.
  - Builds ORACLE system prompt: persona (clipped cryptic prose, ALL-CAPS SYSTEMS emphasis, <150 words, address as 'hunter', no AI mentions, no medical diagnoses) + compact hunter context block (name, archetype, level, rank, XP, streak, unspent points, essence, STR/VIT/END/AGI/FLEX, equipped title, lifetime totals, raid summaries, PRs, today's directives with progress/state).
  - Calls `z-ai-web-dev-sdk` server-side: `zai.chat.completions.create({ messages: [{role:'assistant',content:systemPrompt}, ...history], thinking:{type:'disabled'} })`.
  - Returns `{reply}`; SDK throw / empty completion → 500 `THE ORACLE IS SILENT. Try again.` (console.error logged).
- Created `src/components/fitness/oracle-console.tsx` ("use client"):
  - FAB: `fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40`, circular, `glow-breathe` slow pulse, Eye icon, aria-label "Consult the Oracle"; extra `sys-pulse` ring + title tooltip "Free points unspent — ask the Oracle" when `hunter.statPoints > 0`.
  - Console overlay (AnimatePresence, NOT shadcn Dialog): `fixed bottom-36 md:bottom-20 right-3 left-3 md:left-auto md:right-6 md:w-[26rem]`, `bg-zinc-950/95 backdrop-blur-xl border-violet-500/30`, 4 `sys-corner` brackets, header (THE ORACLE / CONSULTATION / X close), message body `max-h-80 overflow-y-auto scroll-sys`, user = right violet bubbles, oracle = left zinc with violet left border, `DIVINING▊` blinking cursor while pending, amber/rose inline error line (role=alert), input row (mono, `placeholder:text-zinc-600`, Send button, disabled while pending).
  - Local welcome message on first open + 3 quick-prompt chips (send on click, shown only while only welcome present).
  - `role="dialog" aria-label="Oracle console"`, Escape closes, focus-visible outlines everywhere, auto-scroll to latest, focus input on open, Enter sends (pending-guarded against double-send), `api()` helper throws server error messages.
- Wired into `src/app/page.tsx`: `<OracleConsole hunter={data.hunter} />` after `<BottomNav />`, before `<NotificationStack />`.

## Verification
- `bunx tsc --noEmit` → 0 errors in src/ (examples/skills pre-existing only).
- `bun run lint` → 0 errors.
- curl POST /api/oracle: real LLM replies (personalized to hunter data: FLEX 6, Iron Tithe 720kg remaining, streak 1, unspent points), 400 on empty/invalid body.
- agent-browser: FAB opens console; welcome + chips render; chip click → reply; typed message + Enter → multi-turn reply; Escape + X close; mobile 390×844 (FAB bottom=764, panel bottom=700 above FAB) and desktop 1280×800 (FAB right=1256/bottom=776, panel w=416) positions exact; FAB title tooltip confirmed; no console/page errors.
- Screenshots: screenshots/t11c-oracle-console.png, t11c-oracle-mobile.png, t11c-oracle-mobile-open.png, t11c-oracle-desktop.png.

## Notes for next agents
- Oracle is read-only — no game state mutation, no refreshKey bump after exchanges.
- History sent to API = last 10 client messages (welcome message included as first assistant turn).
- System prompt passed as `{role:'assistant'}` first message per SDK usage pattern required by task spec.
