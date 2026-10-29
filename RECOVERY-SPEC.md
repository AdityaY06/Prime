# PRIME RECOVERY SPEC — Tasks 16–20 rebuild reference

## INCIDENT (2026-09-30 ~15:56 UTC)
The platform restored the entire `/home/z` home from the last checkpoint (git `beed5e3`, 2026-09-29 17:58 UTC). Result:
- Source tree → Task 15 state (all Task 16–20 files gone, including untracked NEW files)
- `db/custom.db` → Task 15 state: **Program / MetricGoal tables never existed**; hunter KAEL Level 11, 12 sessions, 4 PBs, 40 quests, 8 achievements, 1 relic, 31 body metrics (data through Sep 29)
- Screenshots (`.qa/`, agent-browser tmp), `/agent-ctx` gone
- No git history contains the work (platform rolling checkpoint had not been amended since Sep 29 17:58)

**Protection going forward: git-commit after every work unit** (a future restore then rolls back to OUR checkpoint, not Sep 29).

Recovery executed: schema foundation re-applied (Program + MetricGoal models + `WorkoutSession.programDay Int?`) and `db:push` done BEFORE agent dispatch (shared ownership, orchestrator-applied).

---

## LOST FEATURE INVENTORY (rebuilt in phases; R1 = the spine)

### Phase R1-a — Program system (was Task 16)
- `src/lib/exercises.ts` — **194-exercise library**: fields { name, type: strength|bodyweight|cardio|mobility, equipment: none|barbell|dumbbell|kettlebell|machine|cable|band, muscles: string[], difficulty: 1|2|3, cue?: string }. 81 exercises need NO equipment. Equipment filter chips in dialog showed counts (e.g. "NO EQUIPMENT · 81"). Dialog library browser: textbox → "8 matching exercises — use the down arrow key to browse, enter to pick" + equipment chips (ALL/BW/BARBELL/DB/KB/MACHINE/CABLE/BAND) + option rows (name, STR tag, equipment tag, Difficulty n of 3, muscle tags).
- `/api/program` — GET (active program + parsed plan; guarded JSON parse), POST forge { equipment, goal, days, experience } → periodized split (retires old actives), DELETE retire. Response includes `titlesUnlocked` on forge.
- `program-panel.tsx` — PROGRAM FORGE wizard: equipment (NONE/HOME/FULL GYM) × goal (STRENGTH/HYPERTROPHY/CONDITIONING/MOBILITY) × days (2–6) × experience (NOVICE/INTERMEDIATE/ADVANCED) → FORGE button (+10 XP first forge of day, ledger-deduped). Active-protocol view: program name header (e.g. "HYPERTROPHY ENGINE"), day cards (DAY n · focus) each with ENTER GATE · START DAY button (auto-picks gate by day's dominant block type), block rows (sets×reps @ weight · rest · RPE · cue · science refs), RETIRE button. Day cards carry NEXT UP violet chip + glow on the recommended day. PROTOCOL WEEK COMPLETE emerald strip when all days done + Wand2 difficulty-scale hint.
- Program achievements (5, total 58): `program-architect` (first forge), `program-followed-10`, `program-followed-50`, `program-perfect-week` (all plan days cleared in one week), `program-multi-forge` (5 forges).
- Program names were themed (e.g. "FORGE FRAME", "HYPERTROPHY ENGINE").

### Phase R1-b — Readiness + vitals intelligence (was Task 16/17/18)
- `/api/readiness` GET composite: { readiness: { score 0–100, band, drivers: [{ label, delta }] }, rhrTrend: { baseline, latest, deviation, title }, week: { planned, done }, nextDay: { day, focus, reason, daysDone: number[], allDone } | null }.
  - Readiness scored from daily vitals (sleep hrs, restingHr vs baseline, mood/energy, soreness if present). Bands: PRIMED ≥85, READY 70–84, MODERATE 45–69, BACK OFF <45. Days with only restingHr logged are honest-partial. Driver chips show signed contributions.
  - `nextDay`: lowest plan day not in this week's cleared-program-session days (distinct programDay, Monday-based week); reason "NEXT UNTRAINED DAY" / "NOT YET TRAINED THIS WEEK" / "ALL PROGRAM DAYS CLEARED THIS WEEK — REGENERATE OR REST" (allDone).
- `readiness-banner.tsx` — TRAINING tab top banner colored by band (PRIMED emerald / READY teal / MODERATE amber / BACK OFF rose + recovery advice), score + driver chips + science citation (Plews et al. 2013 HRV-guided; Stanley et al. 2013).
- `week-compliance.tsx` — THIS WEEK strip: planned vs done sessions, "n AHEAD" flame when ahead.
- `vitals-tab.tsx` — DAILY READINESS panel (score, band, driver chips); RHR trend alert (7-day rolling baseline, deviation >6 bpm warn badge); check-in inputs with typical-range hints ("40-100"); RHR chart ReferenceArea zones (trained 50–60 emerald / normal 60–80 / elevated 80+ rose) + mood/energy 7-day trailing moving-average dashed teal line; "Speak the daily readiness summary" Volume2 button (store speak(), respects voiceEnabled).
- Oracle chat injection: system prompt gains real vitals facts (readiness band, RHR trend, sleep avg).

### Phase R1-c — Progression + program→raid integration (was Task 17/18/20)
- `src/lib/progression.ts` — progressionKey (normalized lowercase name), Epley e1RM = w×(1+reps/30), verdicts from history: BUMP LOAD (+2.5 kg upper / +5 kg lower heuristic; detail "+2.5 kg next session (upper-body heuristic)"), ADD REPS, HOLD, LOG MORE (needs ≥3 sessions).
- `/api/progression` GET — 90d non-abandoned logs, day-keyed entries per exercise: { name, type, sessions, firstDay, lastDay, lastLog { day, sets, reps, weightKg, e1rm }, bestE1rm, bestE1rmDay, trend [{ day, e1rm }], suggestion { action, detail } }.
- `exercise-dialog.tsx` — LAST TIME hint ("4×10 @ 40 KG · e1RM 53 KG · Sep 27"), SUGGESTED line (emerald, TrendingUp, "SUGGESTED: 42.5 KG (+2.5 kg next session (upper-body heuristic))") on BUMP; PERSONAL BEST section (PB value + set + date, from /api/prs) + LAST 2 SESSIONS mini-list (from /api/progression); live PR PACE chip (amber pulsing, "PR PACE · 56 > 53.3 KG E1RM") when current form inputs beat PB e1RM.
- `session-raid.tsx` — ENTER GATE · START DAY per program day (POST /api/sessions { gateId, programDay }); in-session PROGRAM PLAN · DAY n — FOCUS checklist: 0/N BLOCKS progress, block rows with load chips (emerald "30→32.5 KG" on BUMP / zinc repeat), click block → dialog prefilled (name/type/sets/reps/weight from plan + suggested load), ✓ when logged, warmup/cooldown bars; in-session PR celebration banner "NEW PERSONAL BEST · {EXERCISE} · {KG} · E1RM {X} KG" (once per exercise per session, framer-motion, inline never fixed).
- `rest-timer.tsx` — floating pill auto-starts on log add, prescription-aware duration (block restSec → strength 180s / bodyweight 90s / cardio 45s / mobility 30s), ±15s + SKIP, REST COMPLETE pulse + WebAudio beep (respects voiceEnabled), role="timer".

### Phase R2 (next round — was Task 19/20 polish; NOT in R1)
Weekly review + week compare + monthly digest cards, settings dialog (rename/voice/export + PWA install), streak shield (Relic code + charges, engine interception), PWA (manifest.ts + icons + sw.js dev-safe network-first + sw-register + offline pill), MetricGoal UI (target dialogs + ReferenceLine/shading/progress chips — **schema already restored in R1 foundation**), FUEL quick-add presets (whey 24P/3C/2F · chicken150 46P/0C/5F · rice cup 45C/4P/1F · banana 27C/1P/0F · eggs×3 19P/1C/15F · oats 54C · greek yog 17P · almonds 12F; kcal 4/4/9) + water ±250/+500, oracle tip route + per-tab banners, chart Δ chips, quest RESETS IN countdown, sparkline tooltips + type filters, briefing enrichment (readiness + recommended day + week compliance woven into morning LLM briefing ~75 words, 110 cap).

---

## SHARED CONTRACTS (all R1 agents must follow)
- **Plan JSON**: `{ days: [{ day: 1, focus: "Full Body A", blocks: [{ name, type, sets, reps?, weightKg?, restSec, rpe?, cue?, refs? }] }] }` — stored in `Program.plan` string column.
- **Program model** (already in schema): id, hunterId, name, goal, equipment, days, experience, plan, active, createdAt, retiredAt.
- **Session create**: POST /api/sessions accepts `{ gateId, programDay? }` → stored on WorkoutSession (field now in schema).
- **weekStartKey**: Monday-based yyyy-mm-dd (engine.ts has this helper — reuse).
- **db import**: `import { db } from "@/lib/db"` (direct-path import; client regenerated 2026-09-30 after push — verified working).
- **Design language**: zinc-950 base, violet/fuchsia/teal/amber accents, NEVER blue/indigo; `sys-label` mono uppercase micro-labels; 44px touch targets; tabular-nums for numbers; 390px-safe flex-wrap.
- **Environment**: single `/` route; dev server already running on 3000 (never `bun run build`, never second instance); QA via `bunx tsc --noEmit` (0 src/ errors; examples/+skills/ pre-existing ignorable) + `bunx eslint <files>`; worklog append-only.

## REBUILD STATUS LOG
- [x] R1-0 foundation: schema (Program/MetricGoal/programDay) + db:push + client regen verified (2026-09-30 ~16:15 UTC)
- [x] R1-a Program system (194-exercise library / forge API / panel / 5 achievements)
- [x] R1-b Readiness intelligence (/api/readiness + banner + compliance + vitals panel + oracle vitals injection)
- [x] R1-c Progression + raid integration (/api/progression + dialog context + PR PACE + PROGRAM PLAN + rest timer)
- [x] R1-QA integration (E2E all-green, test programs cleaned, VOID MATRIX forged for user)
- [x] R2-a Records/status intelligence: /api/monthly-summary + 30-DAY DIGEST + PR board (type filters/e1RM sparkline/Δ chip) + quest RESETS IN countdown + streak-shield inventory (/api/rest-day ward extension) + briefing READINESS & PROGRAM CONTEXT enrichment
- [x] R2-b Fuel/body/oracle tips: /api/body/goal (MetricGoal UI: SET TARGET dialog + ReferenceLine + shading + progress chip + remove) + fuel 8 quick-add presets + water +250/+500 + oracle-tip.tsx + /api/oracle/tip (deterministic, 7 tabs) + mounts all 8 tabs
- [x] R2-c PWA + settings: manifest.ts + 4 icons (AI master → sharp) + dev-safe network-first sw.js (api network-only) + sw-register + offline pill + settings-dialog (rename/voice/offline/install/export) + TopNav gear
- [x] R2-QA integration (2026-09-30 ~17:50 UTC): tsc 0 src errors · eslint 20 files clean · all 8 tabs E2E · 390px sweep exact · zero console errors · dev.log zero 500s · /sw.js 404 self-healed · PB/XpEvent pollution restored (bench 40kg, totalXp 2938)

**RECOVERY COMPLETE** — PRIME is back at (and beyond) pre-incident Task-20 feature level. Next rounds return to the standing user directive: improve each feature one by one (see worklog R2 final for the candidate queue).
