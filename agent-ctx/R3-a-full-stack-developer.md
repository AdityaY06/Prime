# R3-a — PR Dossier Drill-Down + 30-Day Digest Share Card

Task ID: R3-a · Agent: full-stack-developer · 2026-09-30

## What I built (own files only)
1. **NEW `src/components/fitness/pr-drilldown.tsx`** — PR DOSSIER dialog:
   - Props: `record: PersonalBestDTO | null`, `entry: ProgressionEntryDTO | null`, `open`, `onOpenChange`
   - Header: displayName + type chip (exercise-dialog TYPE_CHIP mirror) + amber PR badge + mono sub-line `N SESSIONS · SEP 26 → SEP 27` (same-day collapses to single date)
   - Primary metric series by type: strength → e1rm, bodyweight → top-set reps, cardio → honest reps fallback (durationMin absent from trend rows per ProgressionEntryDTO); chart hidden when < 2 usable (non-zero) points
   - Recharts LineChart ~200px: violet #a78bfa, faint CartesianGrid, XAxis day labels via formatDayLabel (same-day duplicate ticks deduped), compact YAxis, sys-panel tooltip, amber ReferenceDot on the best session
   - Chart x keys are synthetic `day#index` so ReferenceDot lands exactly on the right session when several share a day (push-ups: 5 sessions on Sep 26)
   - Verdict chip (BUMP LOAD emerald / ADD REPS amber / HOLD + LOG MORE zinc) with detail — shown at ≥2 sessions; single-session shows the zinc "LOG 2-3 MORE SESSIONS TO UNLOCK PROGRESSION GUIDANCE" hint instead
   - SESSION LOG table newest-first: DAY | TOP SET (`4×10 @ 40 KG` / `3×12` / cardio reps or —) | METRIC (e1RM 53.3 / 12 REPS / —) | Δ vs chronologically-previous session (emerald ▲ / rose ▼ / zinc ±0 / — oldest); tds h-11 align-middle (exactly 44px rows), scroll region scroll-sys max-h-64 (wrapper div + sticky thead — tbody display:block breaks column alignment), newest row violet left border + bg
   - framer-motion subtle entrance (useReducedMotion respected); Escape + X close; aria-label `PR dossier — {name}`; dialog root aria-describedby=undefined (existing convention)
2. **EDIT `src/components/fitness/records-tab.tsx`** (byte-identical visuals preserved):
   - `drillKey` state + single `<PrDrilldown>` instance resolved via `progressionKey(r.name)` (row key matches progByKey keying exactly)
   - PR row div → `<button type="button">` (min-h-11, w-full, text-left, aria-haspopup/aria-expanded/aria-label, focus-visible outline) with all existing visuals intact (shimmer, crown, NO.1, sparkline, Δ chip, ctx hover line)
   - "TAP FOR HISTORY ▸" hint under BEST (7px zinc-600 mono, fades in via group-hover + group-focus-visible)
   - prog lookup hardened: `progByKey.get(progressionKey(r.name))`
3. **NEW `src/components/fitness/digest-share-card.tsx`** — 30-day digest share card:
   - `DigestShareButton({ hunter, summary })` — h-11 amber mono button, Share2 icon, 44px, renders DigestShareDialog
   - Dialog: "30-DAY DIGEST · {NAME}" header + window range; canvas preview (720×1096 logical @2× dpr = 1440×2192, share-card.tsx convention); EXPORT PNG (amber h-11, canvas.toBlob → temp anchor → pushNotice) + CLOSE (zinc h-11); corner-bracket/border-amber chrome
   - Canvas: zinc-950 + glows/vignette/scanlines/corner brackets; PRIME + TRAINING DIGEST header; rank diamond + name (auto-fit) + title chip + archetype + LEVEL right; "LAST 30 DAYS · SEP 1 → SEP 30" window line; 2×3 stat grid (XP/SESSIONS/VOLUME/TIME/PRS/ACTIVE DAYS, big tabular numerals, 6 accents violet-fuchsia-amber-emerald-rose-teal); delta strip vs prior 30 days (▲ emerald / ▼ rose / ±0 zinc, auto-wraps to 2 lines, measured widths); BEST DAY amber callout (omitted when null); READINESS teal line (omitted when null); footer "ASCENDANT PROTOCOL · PRIME SYSTEM" + tiny GENERATED date. Never invents numbers.
4. **EDIT `src/components/fitness/status-tab.tsx`** (additive only): exported `MonthlySummaryRes` type, `MonthlyDigest({ hunter })` prop + pass-through, SHARE DIGEST button row inside the digest panel footer (rendered only in the loaded branch by construction)

## QA evidence
- `bunx tsc --noEmit`: 0 errors in my 4 files (only src/ errors = concurrent agent's in-flight `src/app/api/nutrition/route.ts` — NOT touched, noted for orchestrator)
- `bunx eslint` on all 4 files: exit 0
- agent-browser E2E (named session r3a, 1280×800 + 390×844):
  - Bench dossier: header "Bench press STRENGTH 40 KG 2 SESSIONS · SEP 26 → SEP 27", chart 2 points + 1 amber ReferenceDot, LOG MORE verdict, 2 rows with Δ "▲ 2.7" / "—"; ESC closes
  - Push-ups dossier: 5 reps-based rows (Δ ±0/▼5/▲5/±0/—), chart 5 points + amber dot on 25 max, single "Sep 26" X tick, HOLD verdict
  - Run dossier: table-only honest (no chart, "—" metrics, unlock hint)
  - Digest: SHARE DIGEST → dialog + canvas 1440×2192 → EXPORT PNG → notice "DIGEST CARD EXPORTED prime-digest-kael-2026-09-01-2026-09-30.png saved."
  - 390×844: scrollWidth=390 both tabs, dossier body scrolls inside max-h-[70vh], rows exactly 44px, EXPORT/CLOSE 44px, no h-overflow
  - Zero console errors; dev.log zero 500s post-E2E
  - VLM audits: digest card (all text legible, tiles aligned, no clipping) + bench dossier (all 6 checks) + records-tab integrity (all 6 sections present)
- DB read-only verified: 0 food/water/session rows today from me; a +5 "First meal logged" XpEvent @17:38Z + totalXp 2943 predates my session (started ~21:30Z) — R3-b nutrition agent's E2E residue, left for their/orchestrator cleanup
- Screenshots: screenshots/r3a-*.png (15 files)
- Protective git checkpoint: bbc3913 (my 4 files + screenshots only — other agents' in-flight changes untouched)

## Deviations / notes
- Hint uses `group-focus-visible:opacity-100` (literal `focus-visible:` on the span would never fire — span isn't focusable); hover path mirrors the existing ctx-detail pattern. NOTE: Tailwind 4 gates group-hover behind `@media (hover: hover)` → false in headless Chrome (pre-existing, app-wide; the ctx line behaves identically). Keyboard path verified live (opacity 0→1 transition). Real desktop browsers with a mouse: works.
- Negative Δ renders "▼ 5" (absolute value; arrow carries sign) for symmetry with "▲ 5"
- Table scroll on wrapper div + sticky thead instead of tbody (alignment); visual spec met exactly (scroll-sys, max-h-64, 44px rows)
- Canvas size = share-card's 720×1096 @2× (spec: "check what share-card.tsx uses and keep consistent" — overrides the ≈1080×1350 suggestion)
- status-tab MonthlyDigest gained a `hunter` prop (needed for the share button; everything else byte-identical)
- Environment interference (all from concurrent R3-b/R3-c agents, none of my files): Fast Refresh remounts invalidated a11y refs mid-E2E (solved with atomic evals); dev server was restarted by someone at ~21:35Z (NOT by me — log shows fresh "Ready in 1636ms", app healthy after); their nutrition route has tsc errors + a 500 (stale prisma client vs new macroSplit column, R3-0 commit) — flagged, not touched
