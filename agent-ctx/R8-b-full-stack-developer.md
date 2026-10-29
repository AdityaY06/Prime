# R8-b — full-stack-developer — VOLUME LANDMARKS (Effort & Volume Science round)

Task: weekly per-muscle hard-set readout vs Israetel 2020 landmark ranges on the TRAINING tab.

## Files owned (exactly 3, everything else untouched)
1. `src/lib/volume-landmarks.ts` (NEW, pure lib)
2. `src/app/api/volume/route.ts` (NEW, GET only)
3. `src/components/fitness/gates-tab.tsx` (additive panel: +157/−1 — the −1 is the lucide import line gaining FlaskConical)

## Design decisions
- **Zones (5 + zero case, per spec's "keep it tight")**: UNTRAINED (0) · UNDER (<MEV) · PRODUCTIVE (MEV..MAV-hi incl) · STIMULATING (MAV-hi..MRV incl) · OVERREACH (>MRV). MAINTAIN dropped as instructed. GLUTES has mavHi===mrv===16 → empty STIMULATING band — kept exactly as the source table says (16 → PRODUCTIVE, 17 → OVERREACH; harness-proven).
- **tallyWeeklySets** resolves names via `progressionKey` (imported read-only from progression.ts — it IS exported). Sets sum into EVERY muscle tag of the library entry (indirect volume counts — disclosed in the footer). Unresolved custom names → no muscle (honest: unknown hit). 7-day window enforced INSIDE the tally (Date.now()−7d) so the function is honest to its name even if a caller forgets to pre-filter; the API ALSO pre-filters in SQL (idempotent). Logs with sets≤0 skipped.
- **CORE / FULL BODY**: no landmark (not in the table, nothing invented) → observation-only rows, landmark:null + zone:null in the DTO, rendered WITHOUT a bar as "NO LANDMARK". FULL BODY path implemented per spec though the current 194-exercise library has zero FULL BODY tags (audited: tag census = CORE/GLUTES/SHOULDERS/BACK/HAMSTRINGS/QUADS/BICEPS/TRICEPS/CALVES/CHEST only) — it fires the day an entry gains the tag.
- **API** `/api/volume` GET: requireHunter + NOT_AWAKENED 404 try/catch copied from forge/route.ts; query = ExerciseLog where session.hunterId = hunter (ANY session status — the sets happened — but owned sessions only), createdAt >= now−7d; returns `{ readouts, footer, everLogged }`. `everLogged` (findFirst any log ever) distinguishes "never logged" (panel empty state) from "quiet week" (all-zero rows = the gap to see). force-dynamic.
- **Readout order**: all 9 landmark muscles ALWAYS (0-set ones included — the gap is the point), weeklySets desc then name asc; CORE/FULL BODY appended after when non-zero, same order rule.
- **Citation integrity**: exact Israetel 2020 table only; footer string is a lib constant `LANDMARK_FOOTNER`… `LANDMARK_FOOTER = "WEEKLY SET LANDMARKS ARE GUIDELINES, NOT LAWS (ISRAETEL 2020) — INDIRECT SETS COUNTED"` served by the API and rendered verbatim in the panel footer (teal » + zinc-600 rest, the R6/R7 idiom).

## Bar geometry — one spec conflict resolved
Task asked for dot `position = clamp(weeklySets/mrv, 0, 1.1)` on a 100%-width track AND "row layout must survive 390px". Measured live: a 110% dot on a 324px track reached x=393 at a 390px viewport → 3px page overflow. Fix that honors both: the track's scale runs **0 → 1.1×MRV** (MRV sits at 90.91%, the last 9.09% is a faint amber "past-MRV" strip), dot left = `max(4px, dotPct%)` with −50% translate. The position is still EXACTLY proportional to clamp(weeklySets/mrv, 0, 1.1); overreach dots now visibly sit past the band, pinned at the track end (4px overhang into panel padding, never off-panel). Re-measured post-fix: docScrollW = 390 exactly, dotRight 361 < panelRight 374.

## Panel (gates-tab.tsx)
- Placement: last FlowItem of the tab's FlowGroup, after the Training Programs grid.
- Header: SystemPanel "Volume Landmarks" + labelAccent `FlaskConical (teal-400/70) · 7 DAYS` (matches the MapPin "N TRAINING TYPES" idiom).
- Rows: mono uppercase name left; `{n} SETS` tabular-nums + right-aligned zone label (min-w-[78px] keeps the numbers column-aligned); 4px zinc-800 bar under with MEV→MRV violet band + amber past-MRV strip + violet dot. Zone colors: UNTRAINED zinc-600 · UNDER amber-400/80 · PRODUCTIVE teal-300/80 · STIMULATING violet-300/80 · OVERREACH amber-400/90 + "▲" (no new hue — palette discipline).
- a11y: role=list/listitem, per-row aria-label states sets + zone + the actual MEV/MAV/MRV numbers + "guidelines" caveat; bars aria-hidden.
- Motion: FlowItem rows with y:6 rise, 0.04s stagger, FLOW_EASE — reduced motion → plain divs via the kit.
- Fetch: `useApi<VolumeRes>("/api/volume")` (refresh-key aware → updates after a session finishes), silent-skip while loading (WeekCompliance idiom). Empty state: "NO SETS LOGGED — THE LANDMARKS AWAIT YOUR FIRST RAID".

## Verification (all pasted in worklog)
- tsc --noEmit: 0 src errors (4 pre-existing examples/skills only).
- eslint on the 3 files: exit 0.
- bun -e pure harness: 37/37 PASS — landmark table exact for all 9 muscles + CORE/FULL BODY/LEGS null; boundary sweep 0/7/8/20/28/31 → UNTRAINED/UNDER/PRODUCTIVE/PRODUCTIVE/STIMULATING/OVERREACH + GLUTES degenerate band; tally (push-ups 3 + bench 4 + deadlift 2 + custom + 8-day-stale) → CHEST/TRICEPS/SHOULDERS 7, BACK/GLUTES/HAMSTRINGS 2, CORE 5 (library tags CORE on Push-ups+Deadlift), stale excluded, custom → nothing; buildVolumeReadouts ordering + all-9-always + empty-tally all-UNTRAINED.
- curl /api/volume (KAEL, live): CHEST=76/OVERREACH · SHOULDERS=76/OVERREACH · TRICEPS=76/OVERREACH · GLUTES=7/PRODUCTIVE · HAMSTRINGS=7/PRODUCTIVE · QUADS=7/UNDER · CALVES=1/UNDER · BACK=0/UNTRAINED · BICEPS=0/UNTRAINED · CORE=74 obs — hand-verified against a read-only SQLite dump (all 11 logs are 0.3–4.8 days old: push-ups 68 sets + bench 8 + split squat 6 + run 1; math exact).
- agent-browser read-only at 390×844: panel last on TRAINING tab, 10 rows, footer text exact, zone labels + ▲, scrollW 390 (fixed from 393), desktop 1280 clean, zero console/page errors, dev.log `GET /api/volume 200`. No write-clicks anywhere; DB reads only; browser closed.

## Notes for siblings
- `/api/volume` response: `{ readouts: MuscleVolumeReadout[], footer: string, everLogged: boolean }` — MuscleVolumeReadout has `landmark`/`zone` NULLABLE (observation rows); narrow with a type-guard before using `r.landmark.mev`.
- The library currently has NO FULL BODY / LEGS muscle tags — LEGS-tagged sets would silently miss every row (landmark table has QUADS/HAMSTRINGS instead). Not an issue today; flag if anyone adds LEGS tags.
