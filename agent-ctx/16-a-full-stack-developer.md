# Task 16-a — Equipment-aware workout program generator

Agent: full-stack-developer
Files owned: src/lib/program.ts (NEW), src/app/api/program/route.ts (NEW), src/components/fitness/program-panel.tsx (NEW), src/components/fitness/gates-tab.tsx (+2-line mount)

## What was built

1. **src/lib/program.ts** — pure, client-safe generator:
   - Enums: ProgramGoal (strength/hypertrophy/fatloss/general), EquipmentProfile (none/home/gym), Experience (novice/intermediate/advanced)
   - EQUIPMENT_ALLOWANCE: none → bodyweight+none; home → +dumbbell/kettlebell/band; gym → all 9
   - EXPERIENCE_CEILING: novice 1 / intermediate 2 / advanced 3
   - Splits: 2→FB A/B · 3→FB A/B/C · 4→UL×2 · 5→PPL+UL · 6→PPL×2; FOCUS_TARGETS ordered muscle agendas + FOCUS_FALLBACK for gutted pools (none+novice pull day) with an advisory note
   - Selection: compound-first (2+ primary muscles or KNOWN_COMPOUNDS ~60 ids), phase-2 target cycling to goal budget (5/6/4/4, +1 at ≤2 days), phase-3 top-up floor ≥4; variety = global usage count; determinism = mulberry32 seeded shuffle rank; prefer bodyweight for general / loaded for strength+hypertrophy
   - RX_TABLE goal×experience×compound/isolation (strength 3-5×3-8 r180 RPE7-8, novice 3×5-8; hypertrophy 3-4×8-12 r90-120; fatloss 3×12-15 r45-60 RPE8 + finisher; general 2-3×10-12 r60-90); repsToTime for time-unit exercises; fatloss finisher (FINISHER_PREF); general conditioning block; region-matched mobility cooldown block; seeded warm-up/cooldown string pools
   - estMinutes = mean(8 + Σ sets×(rest/60+0.75)); weeklyVolume = Σ sets
   - `generateProgram(input)` + SPLIT_LABEL + ProgramDTO exported

2. **src/app/api/program/route.ts** — GET (active latest, plan JSON safely parsed → null on corrupt) / POST (validate enums + days int 2-6 → generate with random seed → tx retire-old + create-active → +10 XP "Program forged" grantOnce ledger-deduped + enqueueGrant serialized → 201 { program, xpGranted? }) / DELETE (deactivate → { ok: true }). requireHunter + force-dynamic + NO_HUNTER→404 conventions.

3. **src/components/fitness/program-panel.tsx** — Forge wizard (4 sections, aria-pressed, ≥44px, live client-side preview via generateProgram seed 7, glowing violet FORGE button) ↔ Training Protocol overview (chips, volume/minutes accent, REGENERATE/RETIRE, day cards lg:grid-cols-2 with warm-up/cooldown strips, scroll-sys max-h-80 block lists, expandable cues + teal science). TYPE_CHIP/EQUIP_SHORT copied from exercise-dialog idioms.

4. **gates-tab.tsx** — import + `<ProgramPanel />` above "Training Programs" SystemPanel in the non-active-session return. Nothing else changed.

## QA
- `bunx tsc --noEmit` → 0 src/ errors (examples/skills pre-existing only)
- `bunx eslint <4 files>` → exit 0
- Runtime sanity: 540 programs (12 goal×equipment combos × days 2..6 × 3 experiences × 3 seeds) — 0 failures (ids exist, equipment allowed, difficulty ≤ ceiling, ≥3 blocks/day, estMinutes > 0); same seed identical, different seed different
- curl E2E: 201+XP, XP dedupe, 400 validation, DELETE ok, corrupt-plan → null
- agent-browser E2E: wizard → forge → overview → expand cues/science → regenerate variety → retire → wizard; mobile 390px zero overflow; 0 page errors; screenshots t16a-*.png

## Deviations / notes
- GeneratedProgram uses `days: ProgramDay[]` (spec listed scalar days AND days array — TS conflict; scalar lives on ProgramDTO)
- ProgramDay gained optional `notes?` (advisory for substituted days)
- Dev server had died silently (known pattern) — restarted via `setsid nohup bun run dev` on :3000 (no build)
- DB: Program table emptied after tests; +10 XP ledger row retained; stale prior-QA active session abandoned (designed no-XP action)
