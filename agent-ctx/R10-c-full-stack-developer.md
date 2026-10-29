# R10-c — STATUS tab spatial continuity (hero spine) + press-depth tactility

Agent: full-stack-developer · Files owned: `src/components/fitness/status-tab.tsx`, `src/components/fitness/hunter-card.tsx`

## Task
Fix the VLM audit's remaining STATUS verdict ("floating head"): stitch the hunter card's vertical flow (LEVEL hero → rank ladder → POWER/STREAK/SESSIONS cluster) into one composition via a hero spine, add press-depth tactility to all CTAs in my 2 files, and adopt the shared `SysSection` (deleting status-tab's local `SectionMark` helper).

## Spine — Option A chosen (vertical rail + anchored grid ties)
`.sys-hairline` is horizontal-only (`height:1px`, 90deg gradient), and globals.css is locked — so the rail is composed purely from Tailwind zinc/violet utilities (explicitly allowed), keeping the same visual DNA (1px, violet-400, ≤0.3 alpha, gradient fade):

- Zones from the LEVEL hero through the metrics row are wrapped in one `relative` container; an `absolute left-0 top-0 bottom-3 w-px` span paints the rail: `bg-gradient-to-b from-violet-400/30 via-violet-400/25 to-transparent` (max opacity 0.3 — stitching, not decoration).
- The rail's top anchors at the LEVEL hero; it passes behind the XPBar (the bar's track roots exactly ON the rail, so the violet fill flows out of it), crosses the ladder's `border-t` (which anchors on the rail at full width), then the pre-metrics tie, and its fading tail reaches down through the metrics zone to the micro-stat band (`bottom-3`).
- Text column hangs off the rail by a 10px gutter (`pl-2.5` on hero row, ladder container, metrics row) — the classic print margin-rule idiom: rules run rail→right-edge, entries are indented.
- The floating `.sys-hairline` divider before the metrics zone was REPLACED by an anchored tie (`h-px bg-gradient-to-r from-violet-400/25 via-violet-400/15 to-transparent`) that emanates from the rail instead of fading in from nothing — this was the exact "islands" mechanism the VLM flagged. Its separator role survives, better stitched.
- `pl-2.5` (10px, not 12px) was chosen after measuring the ladder header: "RANK LADDER" (101px) + "NEXT: C-RANK AT LV.16 · 5 TO GO" (195px) + gap (8px) = 304px vs 306px available — one line preserved (verified in DOM: header h=15, single line).
- Identity row (masthead) stays full-width at the content edge — it aligns ON the rail line; the data column hangs from it. Essence footer stays outside the spine (full-width, centered).
- Micro-stat cluster keeps `ml-auto` (R9-a's flanking layout at desktop); it ties into the structure via the anchored tie above it + the rail's tail reaching its band + the shared 10px gutter of its accent-row spines.

Measured at 390×844 (before → after): hero row y=368 h=82 single line (unchanged), XPBar y=462 (unchanged), ladder y=494 h=72 (unchanged), tie y=586, metrics y=603 h=129 wrapping identically (micros x=98/x=233 y=684 — identical), essence y=748 (unchanged). Rail x=37 y=368 h=352. Nothing moved except the intended 10px text indent inside the spine column.

## Press-depth (VLM candidate ③)
- `OPEN GOAL LOG` (plain button): + `active:scale-[0.97] active:brightness-90` (had only active:bg).
- Quick raid CTA (motion.button): `whileTap` deepened 0.99 → 0.97 (whileHover 1.01 kept) — single whileTap, no duplication, now inside the 0.96–0.97 spec band.
- Forge CTA (plain button): + `active:scale-[0.97] active:brightness-90` (had only active:shadow).
- Rank ladder pips + NEXT: C-RANK chip: audited — purely decorative (no handlers) → left untouched per instructions.
- Audited locked STATUS-tab CTA components: daily-briefing Begin Session `whileTap 0.95` ✓, session-raid end/abort `whileTap 0.92` ✓, rest-day submit `whileTap 0.98` ✓, digest-share `whileTap 0.98` ✓. GAPS OUTSIDE MY FILES (report to orchestrator): share-card.tsx + data-vault.tsx trigger panels have active:shadow only, no scale — both files LOCKED for R10-c.

## Shared SysSection adoption (mechanical)
- Deleted status-tab's local `SectionMark`; imported `SysSection` from `@/components/system/section-mark`; 3 usages renamed (01 OPERATOR / 02 TELEMETRY / 03 PROTOCOL). Shared defaults (hue violet, flow true) render byte-identical markup. Dropped the now-unused `DecodeText` import.

## Verification
- `bunx tsc --noEmit` → exactly the 4 pre-existing examples/skills errors, 0 src errors (a transient rewards-hub-tab error mid-session was R10-a's in-flight edit, gone in their final state).
- `bunx eslint` both files → exit 0.
- agent-browser 390×844: scrollWidth exactly 390; zero page/console errors; LEVEL "11" @93.6px single-line hero intact; XP "118"; POWER "163" @54.6px; 2 sys-accent-row + 1 sys-bloom + 1 sys-bloom-amber + 4 sys-dim + 3 section marks all intact; rail gradient + geometry verified via computed styles; DOM class check confirms active:scale-[0.97] + active:brightness-90 + focus-visible:outline-violet-400/70 on both plain CTAs. 1280×800: scrollWidth 1280, rail x=113 h=352, metrics single-line with micros flanking right (R9-a desktop layout preserved), hero 136px.
- VLM audit of the mobile screenshot: "thin violet hairline rail runs down the left margin anchoring the header, Level zone and bottom stats… ONE connected composition… subtle… nothing clipped." (Its two "minor" notes — oracle-tip 2-line text wrap and ID label baseline — are pre-existing locked-file elements, false positives on wrap ≠ overlap.)
- Read-only DB check: KAEL L11 · xp 118 (of 530) · totalXp 2943 · essence 356 · 12 sessions · 0 live · 15 xpEvents — untouched. No data-mutating clicks performed.
- Screenshots: `screenshots/r10c-baseline-390.png` (pre-change), `r10c-status-spine-390.png`, `r10c-status-spine-1280.png`, `r10c-status-ctas-390.png`.

## Incidents
- Dev server died silently mid-verification again (documented OOM pattern; curl returned 000 with instant failure = connection refused; the browser sat on an eternal BootScreen because its hunter fetch hung). Fixed with the documented detached double-fork spawn `bash -c '( setsid nohup bun run dev </dev/null >/dev/null 2>&1 & )'` — healthy 200s after. Also: `agent-browser reload` kept serving a stale app state; a fresh `agent-browser open http://localhost:3000/` booted correctly. One transient agent-browser CLI native crash (uv_thread_create assertion) on `set viewport 1280 800` — retried successfully.
