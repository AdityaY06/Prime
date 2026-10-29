// ─── PRIME · Best-exercise recommender (R71-b) ────────────────────────────────
// Pure, isomorphic tier-ranking over the session exercise list
// (src/lib/fitness/data/exercises.ts). No side effects — data + pure functions
// only, safe on server and client.
//
// TIER CRITERIA (honest, documented — no fabricated citations):
//   Tier 1 — multi-joint COMPOUNDS with the strongest activation and systemic
//   load: the classic barbell/bodyweight competition lifts and their closest
//   loaded kin (bench family, rows, pull-ups, overhead pressing, squat/lunge
//   family, deadlift/hinge family, hip thrust, carries, Olympic lifts,
//   kettlebell swing, ab-wheel rollout). For cardio/mobility the Tier-1 set is
//   the guideline-anchor layer: the accessible modalities the ~150 min/wk
//   base is actually built from (ACSM position stand) and the foundational
//   daily mobility pieces. Where an EMG/activation citation is already used
//   elsewhere in this codebase it is reused by name (Barnett et al. 1995
//   bench-angle EMG; Calatayud et al. 2015 loaded push-ups vs bench; Maeo
//   et al. 2021 lengthened-position growth; Schoenfeld et al. 2017 volume
//   dose-response; Gillen et al. 2016 low-volume HIIT; Wiewelhove et al. 2015
//   foam-rolling meta; Paluch et al. 2022 steps). Anything we cannot cite
//   confidently is phrased as movement-pattern reasoning instead of a fake
//   citation — that is the rule.
//   Tier 2 — proven accessories: machines, cables, band work, scalable
//   stand-ins (lat pulldown, leg press, machine rows), loaded isolations with
//   a long track record (barbell/EZ/hammer curls, skull crushers, lateral
//   raises, leg curls, calf raises — calves have no compound, isolation IS
//   the tool there), vigorous/specialised cardio, targeted mobility.
//   Tier 3 — small-ROM / fixed-path / single-joint finishers and activation
//   drills (flys, pec deck, concentration/preacher/band curls, kickbacks,
//   wrist work, shrugs, abduction machines, wall sit) plus max-intensity
//   niche cardio (8-mph race pace). Legit tools — last in a ranked list.
//
// RANKING (bestForMuscle / strength activity):
//   tier asc → compound-pattern breadth ASC (the FOCUSED compound beats the
//   everything-tagger — a squat is a better quad pick than a clean that tags
//   eight muscles) → difficulty asc (the accessible pick wins ties) → name.
// bestForMuscle ranks STRENGTH exercises only — cardio/mobility entries list
// their movers as activity description, not as trainable hypertrophy targets.
// CARDIO activity: accessibility first (difficulty as the skill/impact
//   proxy), then gentlest MET first (the sustainable guideline pick outranks
//   the extreme burn — an honest reading of "rank by accessibility + MET
//   honesty"), then name. MOBILITY activity: foundational-first — difficulty
//   asc, then breadth desc (broad daily flows before targeted single-region
//   holds), then name.

import type { Exercise, ExerciseType, MuscleId } from '@/lib/fitness/types'
import { EXERCISES } from '@/lib/fitness/data/exercises'

export type Tier = 1 | 2 | 3

export interface TierEntry {
  tier: Tier
  /** One-line justification — cited where confident, pattern-reasoned otherwise. */
  why: string
}

/** Documented tier assignment for every session exercise (id → tier + why). */
export const EXERCISE_TIERS: Record<string, TierEntry> = {
  /* ── Chest ── */
  'barbell-bench-press': { tier: 1, why: 'The horizontal-press standard — chest activation benchmarks are defined against it.' },
  'incline-barbell-bench-press': { tier: 1, why: 'Loaded upper-chest compound; 30–45° biases the clavicular pec (Barnett et al. 1995 EMG).' },
  'dumbbell-bench-press': { tier: 1, why: 'Compound press with a deeper stretch than a bar allows — lengthened-position bias (Maeo et al. 2021).' },
  'incline-dumbbell-press': { tier: 1, why: 'Upper-chest compound through the fullest safe range.' },
  'decline-dumbbell-press': { tier: 2, why: 'Sternal-fiber bias (Barnett et al. 1995) — flat and incline already cover the growth angles.' },
  'machine-chest-press': { tier: 2, why: 'Fixed-path press — chest work without balance limits.' },
  'cable-fly': { tier: 3, why: 'Single-joint chest isolation — a finisher after the pressing is done.' },
  'pec-deck': { tier: 3, why: 'Fixed-path chest isolation — squeeze work, zero stabiliser demand.' },
  'push-up': { tier: 2, why: 'The floor press — loaded push-ups match bench activation at matched effort (Calatayud et al. 2015).' },
  'chest-dip': { tier: 1, why: 'Loaded bodyweight compound — the dip loads the sternal pec at depth.' },
  'dumbbell-fly': { tier: 3, why: 'Single-joint chest isolation — the bottom stretch is the stimulus (Maeo et al. 2021).' },
  'cable-crossover': { tier: 3, why: 'Constant-tension chest isolation — squeeze and stretch work.' },
  'decline-push-up': { tier: 2, why: 'Feet-elevated press — the loadable push-up progression.' },

  /* ── Back · lats ── */
  deadlift: { tier: 1, why: 'The heaviest hinge — glutes, hamstrings and the whole back as one system.' },
  'barbell-row': { tier: 1, why: 'Heavy horizontal pull — the mid-back mass standard.' },
  'dumbbell-row': { tier: 1, why: 'Unilateral compound pull — full lat stretch, heavy load, no grip sharing.' },
  'seated-cable-row': { tier: 2, why: 'Cable horizontal pull — constant tension, chest-braced.' },
  'lat-pulldown': { tier: 2, why: 'Machine vertical pull — the pull-up’s scalable cousin.' },
  'pull-up': { tier: 1, why: 'The vertical-pull standard — lats and arms moving the whole body.' },
  'chin-up': { tier: 1, why: 'Vertical pull with extra biceps bias — same compound class.' },
  'straight-arm-pulldown': { tier: 3, why: 'Single-joint lat isolation — arms as levers.' },
  't-bar-row': { tier: 1, why: 'Chest-braced heavy row — big lat/trap loads on a fixed path.' },
  'inverted-row': { tier: 1, why: 'Bodyweight horizontal pull that scales with leverage — rows anywhere.' },
  'machine-row': { tier: 2, why: 'Chest-braced machine pull — rows without the hinge tax.' },
  'assisted-pull-up': { tier: 2, why: 'Machine-assisted vertical pull — the road to the bar.' },
  'band-lat-pulldown': { tier: 2, why: 'Band vertical pull — light but real lat work.' },
  'dumbbell-pullover': { tier: 2, why: 'Lat/chest accessory across the bench — a stretch mover.' },
  'renegade-row': { tier: 2, why: 'Plank-row hybrid — pulling under a full-body brace.' },

  /* ── Traps ── */
  'barbell-shrug': { tier: 3, why: 'Small-ROM trap isolation — elevation only.' },
  'dumbbell-shrug': { tier: 3, why: 'Small-ROM trap isolation — pure elevation.' },
  'rack-pull': { tier: 2, why: 'Overload hinge accessory — top-half range, heavy traps.' },

  /* ── Shoulders ── */
  'standing-overhead-press': { tier: 1, why: 'Whole-body vertical press — delts, triceps and trunk as one chain.' },
  'seated-dumbbell-shoulder-press': { tier: 2, why: 'Seated vertical press — solid delt compound, less trunk demand.' },
  'arnold-press': { tier: 2, why: 'Rotating dumbbell press — ROM variety for the delts.' },
  'dumbbell-lateral-raise': { tier: 2, why: 'The side-delt width classic — pressing alone starves this head.' },
  'cable-lateral-raise': { tier: 3, why: 'Constant-tension delt isolation.' },
  'dumbbell-front-raise': { tier: 3, why: 'Single-joint front-delt isolation — the delts already press.' },
  'rear-delt-fly': { tier: 2, why: 'Rear-delt isolation most pressing programs starve.' },
  'face-pull': { tier: 2, why: 'Rear-delt and rotator-cable accessory — posture insurance.' },
  'upright-row': { tier: 2, why: 'Upper-back compound — elevation with a narrow-grip caveat.' },
  'band-overhead-press': { tier: 2, why: 'Band vertical press — the travel-kit overhead work.' },
  'machine-shoulder-press': { tier: 2, why: 'Fixed-path vertical press — honest overhead stand-in.' },
  'pike-push-up': { tier: 1, why: 'The no-equipment overhead press — vertical pressing load without a bar.' },
  'push-press': { tier: 1, why: 'Leg-drive overhead compound — power and pressing in one movement.' },

  /* ── Biceps / forearms ── */
  'barbell-curl': { tier: 2, why: 'Loaded elbow-flexion isolation — the biceps classic.' },
  'ez-bar-curl': { tier: 2, why: 'Wrist-kind loaded curl — same stimulus class.' },
  'dumbbell-hammer-curl': { tier: 2, why: 'Neutral-grip loaded curl — brachialis and forearm thickness.' },
  'incline-dumbbell-curl': { tier: 2, why: 'Stretched-position loaded curl (Maeo et al. 2021 lengthened bias).' },
  'preacher-curl': { tier: 3, why: 'Fixed-path biceps isolation that punishes the stretch.' },
  'cable-curl': { tier: 3, why: 'Constant-tension biceps isolation.' },
  'concentration-curl': { tier: 3, why: 'Single-arm biceps isolation — zero cheat possible.' },
  'zottman-curl': { tier: 3, why: 'Forearm-biased curl variant — the eccentric rules.' },
  'band-curl': { tier: 3, why: 'Light band isolation — travel-grade.' },
  'wrist-curl': { tier: 3, why: 'Direct wrist-flexor isolation.' },
  'reverse-barbell-curl': { tier: 3, why: 'Forearm-extensor isolation — thickness where grips fail.' },
  "farmers-carry": { tier: 1, why: 'Loaded gait — grip, traps and trunk under whole-body tension.' },

  /* ── Triceps ── */
  'close-grip-bench-press': { tier: 1, why: 'Compound press with triceps priority — pressing volume that grows the arms.' },
  'tricep-rope-pushdown': { tier: 2, why: 'Loaded triceps isolation — the elbow-only classic.' },
  'overhead-cable-extension': { tier: 2, why: 'Long-head triceps isolation overhead.' },
  'skull-crusher': { tier: 2, why: 'Loaded triceps isolation on a bar.' },
  'bench-dip': { tier: 3, why: 'Bench-height triceps isolation — beginner-friendly.' },
  'dumbbell-overhead-triceps-extension': { tier: 2, why: 'Overhead triceps isolation — long-head stretch.' },
  'dumbbell-kickback': { tier: 3, why: 'Small-ROM triceps isolation — peak-squeeze work.' },
  'band-triceps-pushdown': { tier: 3, why: 'Band triceps isolation.' },
  'diamond-push-up': { tier: 2, why: 'Triceps-biased bodyweight compound — pressing class, not isolation.' },

  /* ── Core ── */
  plank: { tier: 2, why: 'The anti-extension baseline — the floor standard.' },
  'hanging-leg-raise': { tier: 2, why: 'Top-shelf hip-flexion ab work — grip and shoulders gate it.' },
  'cable-crunch': { tier: 3, why: 'Loaded spinal-flexion isolation.' },
  'ab-wheel-rollout': { tier: 1, why: 'Anti-extension at scale — a moving plank with a real brace cost.' },
  'russian-twist': { tier: 3, why: 'Rotational drill — load usually outruns form.' },
  'dead-bug': { tier: 2, why: 'Anti-extension floor drill — the safe rollout teacher.' },
  'mountain-climber': { tier: 2, why: 'Plank plus knees — core conditioning.' },
  'side-plank': { tier: 2, why: 'Lateral chain baseline — anti-lateral-flexion.' },
  'cable-woodchopper': { tier: 2, why: 'Loaded rotational accessory — the obliques’ moving lift.' },
  'pallof-press': { tier: 2, why: 'Anti-rotation press — the core’s honest stability test.' },
  'copenhagen-plank': { tier: 2, why: 'Adductor-biased side plank — groin armor.' },
  'bird-dog': { tier: 2, why: 'Contralateral brace drill — spinal control.' },
  'hollow-hold': { tier: 2, why: 'The gymnast’s anti-extension brace.' },
  'v-up': { tier: 2, why: 'Dynamic trunk flexion — fold work.' },
  'superman-hold': { tier: 2, why: 'Prone extension hold — spinal-erector endurance.' },
  'turkish-get-up': { tier: 2, why: 'Slow whole-body control lift — shoulder armor.' },

  /* ── Glutes ── */
  'barbell-hip-thrust': { tier: 1, why: 'Loaded hip extension at peak contraction — the glute’s heaviest direct line.' },
  'glute-bridge': { tier: 2, why: 'The unloaded hip-thrust teacher — glute activation.' },
  'cable-kickback': { tier: 3, why: 'Glute isolation — constant tension, small load.' },
  'hip-abduction-machine': { tier: 3, why: 'Glute-medius isolation.' },
  'cable-pull-through': { tier: 2, why: 'Constant-tension hip extension — an accessory hinge.' },
  'band-lateral-walk': { tier: 3, why: 'Glute-medius activation drill.' },
  clamshell: { tier: 3, why: 'Glute-medius activation drill — small range.' },
  'kettlebell-swing': { tier: 1, why: 'Hinge power with a conditioning dividend — the glutes’ fast lift.' },

  /* ── Quads ── */
  'back-squat': { tier: 1, why: 'The loaded squat standard — quads and glutes through the deepest safe range.' },
  'front-squat': { tier: 1, why: 'Upright-loaded squat — maximum quad demand, honest torso tax.' },
  'hack-squat': { tier: 2, why: 'Machine squat — quad-heavy, spine-free.' },
  'leg-press': { tier: 2, why: 'The machine squat workhorse — huge quad loads, no balance tax.' },
  'bulgarian-split-squat': { tier: 1, why: 'Unilateral loaded squat — long-length quad/glute work with a free spine.' },
  'walking-lunge': { tier: 1, why: 'Loaded locomotion — quad and glute compound with a big stretch.' },
  'leg-extension': { tier: 2, why: 'Knee-extension isolation — the quad finisher.' },
  'goblet-squat': { tier: 2, why: 'The loadable beginner squat — upright torso keeps it honest, capped load.' },
  'wall-sit': { tier: 3, why: 'Isometric quad hold — zero-ROM conditioning.' },
  'jump-squat': { tier: 2, why: 'Plyometric squat accessory — rate-of-force work.' },
  'reverse-lunge': { tier: 2, why: 'The joint-friendlier lunge — reverse stepping spares the knees.' },
  'step-up': { tier: 2, why: 'Loaded locomotion accessory — box height caps the load.' },

  /* ── Hamstrings / lower back ── */
  'romanian-deadlift': { tier: 1, why: 'Loaded hinge with hamstrings at long length — stretch-under-load drives growth (Maeo et al. 2021).' },
  'stiff-leg-deadlift': { tier: 2, why: 'Hamstring-biased hinge variant — strict back rules.' },
  'lying-leg-curl': { tier: 2, why: 'Knee-flexion isolation — the curl half of the hamstring story.' },
  'seated-leg-curl': { tier: 2, why: 'Knee-flexion isolation at the seated angle.' },
  'nordic-curl': { tier: 2, why: 'Eccentric hamstring isolation — brutal and proven.' },
  'single-leg-rdl': { tier: 2, why: 'Unilateral hinge — balance plus long-length hamstrings.' },
  'sumo-deadlift': { tier: 1, why: 'Competition hinge variant — same system, more hip.' },
  'trap-bar-deadlift': { tier: 1, why: 'The friendliest deadlift frame — same hinge, neutral-grip back sparing.' },
  'back-extension': { tier: 2, why: 'Bodyweight hip-back extension — erector and glute endurance.' },
  'good-morning': { tier: 2, why: 'Light-load hinge for the posterior chain — strict tempo only.' },

  /* ── Power ── */
  'power-clean': { tier: 1, why: 'Explosive pull — rate of force development is its own trainable quality.' },
  snatch: { tier: 1, why: 'The full-body power lift — hinge to overhead in one punch.' },

  /* ── Calves (no compound exists — isolation IS the tool) ── */
  'standing-calf-raise': { tier: 2, why: 'The loaded calf standard — gastrocnemius at straight knees.' },
  'seated-calf-raise': { tier: 2, why: 'Soleus-biased calf isolation — bent knees change the story.' },
  'single-leg-calf-raise': { tier: 2, why: 'Unilateral calf isolation — fixes the side gap.' },

  /* ── Cardio · guideline-anchor Tier 1 ── */
  'brisk-walk': { tier: 1, why: 'The most accessible guideline cardio — every step counts toward ~150 min/wk (ACSM).' },
  'incline-treadmill-walk': { tier: 1, why: 'Grade replaces speed — low-impact cardio that still counts (ACSM).' },
  'run-5-mph': { tier: 2, why: 'The conversational run — guideline pace with impact.' },
  'run-6-mph': { tier: 2, why: 'Steady running — above conversational, below tempo.' },
  'run-7-mph': { tier: 2, why: 'Tempo running — skilled-effort territory.' },
  'run-8-mph': { tier: 3, why: 'Race-pace running — an intensity ceiling, not a default pick.' },
  'moderate-cycling': { tier: 1, why: 'Low-impact guideline cardio — the commuter’s engine.' },
  'vigorous-cycling': { tier: 2, why: 'Hard riding — 75 vigorous minutes match 150 easy ones (ACSM).' },
  'jump-rope': { tier: 2, why: 'Vigorous, portable, skill-gated cardio.' },
  'rowing-machine': { tier: 1, why: 'Whole-body guideline cardio — legs, back, lungs in one stroke.' },
  'hiit-circuit': { tier: 2, why: 'Brief all-out bursts rival longer steady work (Gillen et al. 2016) — recovery-gated.' },
  elliptical: { tier: 1, why: 'Low-impact, zero-skill guideline cardio.' },
  'freestyle-swimming': { tier: 1, why: 'Full-body low-impact cardio — the joint-kind guideline dose.' },
  'stair-machine': { tier: 1, why: 'Vertical guideline cardio — real stairs, machine cadence.' },
  'boxing-bag-work': { tier: 2, why: 'Interval cardio with a skill dividend.' },
  hiking: { tier: 1, why: 'The outdoor guideline dose — the cheapest cardio there is (Paluch et al. 2022 steps logic).' },
  'ski-erg': { tier: 2, why: 'Whole-body machine cardio — 9-MET double-poling.' },
  'rowing-machine-vigorous': { tier: 2, why: 'The hard erg session — vigorous minutes.' },
  'dance-cardio': { tier: 2, why: 'Compliance cardio — 7.3 METs of minutes that don’t feel like minutes.' },
  'jumping-jacks': { tier: 2, why: 'The zero-skill vigorous warm-up.' },
  burpees: { tier: 2, why: 'The full-body vigorous classic — love-hate it.' },
  'battle-ropes': { tier: 2, why: 'Near-max heart-rate intervals (Ratamess et al. 2015) — short bursts.' },
  'trail-run': { tier: 2, why: 'Vigorous running plus terrain — the ankles vote too.' },
  'swimming-laps-vigorous': { tier: 2, why: 'Vigorous laps — 9.8 METs of stroke work.' },
  'recreational-basketball': { tier: 2, why: 'Intermittent vigorous sport — 8 METs of cuts and sprints.' },
  'casual-soccer': { tier: 2, why: 'The world’s interval workout — ~7 METs of jog-sprint-walk.' },
  'tennis-doubles': { tier: 2, why: 'Moderate court cardio — social doubles.' },
  'badminton-social': { tier: 2, why: 'Fast hands, gentle joints — 5.5 METs.' },

  /* ── Mobility · foundational Tier 1 ── */
  'full-body-stretch': { tier: 1, why: 'The daily mobility baseline — head-to-toe holds.' },
  'hatha-yoga-flow': { tier: 1, why: 'A full mobility practice — breath-led holds.' },
  'foam-rolling': { tier: 1, why: 'Daily tissue prep — ROM gains without performance cost (Wiewelhove et al. 2015).' },
  'hip-mobility-flow': { tier: 1, why: 'The desk-body antidote — 90/90 plus couch in one flow.' },
  'shoulder-band-dislocate': { tier: 2, why: 'Overhead-range maintenance — pre-lift insurance for pressing days.' },
  "worlds-greatest-stretch": { tier: 1, why: 'One lunge that sweeps hips, hamstrings, thorax and shoulders.' },
  'cat-cow': { tier: 1, why: 'The spine’s daily greaser — flexion and extension in rhythm.' },
  'kneeling-hip-flexor-stretch': { tier: 1, why: 'The desk-chair antidote — the stretch modern sitting makes mandatory.' },
  'thoracic-rotation': { tier: 2, why: 'Targeted t-spine mobility — the rotation pressing desks erase.' },
  'pigeon-pose': { tier: 2, why: 'Targeted outer-hip release — deep but single-region.' },
  'childs-pose': { tier: 2, why: 'Rest-and-release pose — recovery is training.' },
  'couch-stretch': { tier: 2, why: 'Targeted quad/hip-flexor length — the desk’s opposite.' },
  'standing-hamstring-stretch': { tier: 2, why: 'Targeted hamstring length — the classic hold.' },
  'wall-slides': { tier: 2, why: 'Scapular-gliding drill — desk-shoulder antidote.' },
  'downward-dog': { tier: 2, why: 'The yoga keystone pose — posterior chain plus shoulders.' },
  'dynamic-warm-up': { tier: 1, why: 'Pre-lift priming — range plus temperature before load.' },
  'pilates-mat': { tier: 2, why: 'Structured trunk control practice — quality over load.' },
}

/** Tier for any exercise id — unknown ids default to Tier 2 (the proven-accessory
 *  class) with pattern reasoning, never a fabricated evidence claim. */
export function tierFor(id: string): Tier {
  return EXERCISE_TIERS[id]?.tier ?? 2
}

/** The one-line why for any exercise id (mirrors tierFor's fallback). */
export function whyFor(id: string): string {
  return (
    EXERCISE_TIERS[id]?.why ??
    'Proven-accessory class by default — movement-pattern reasoning, no fabricated citation.'
  )
}

export interface RankedExercise {
  exercise: Exercise
  tier: Tier
  why: string
}

/** Compound-pattern breadth — distinct muscles the exercise touches (focused
 *  compounds score LOW and rank FIRST: see header). */
function breadth(ex: Exercise): number {
  return new Set([...ex.muscles, ...ex.secondary]).size
}

/** Canonical ranked order: tier asc → focused breadth first → difficulty asc → name. */
function compareStrength(a: Exercise, b: Exercise): number {
  const ta = tierFor(a.id)
  const tb = tierFor(b.id)
  if (ta !== tb) return ta - tb
  const br = breadth(a) - breadth(b)
  if (br !== 0) return br
  if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty
  return a.name.localeCompare(b.name)
}

/** Sort ANY list of exercises by the canonical ranked order (pure — copies). */
export function rankExercises(list: Exercise[]): RankedExercise[] {
  return [...list]
    .sort(compareStrength)
    .map((exercise) => ({ exercise, tier: tierFor(exercise.id), why: whyFor(exercise.id) }))
}

/** Best exercises for one muscle — STRENGTH-type primary movers only, ranked. */
export function bestForMuscle(muscle: MuscleId): RankedExercise[] {
  return rankExercises(EXERCISES.filter((e) => e.type === 'strength' && e.muscles.includes(muscle)))
}

/** Best exercises for one activity type. Cardio ranks by accessibility then
 *  gentlest MET; mobility foundational-first; strength by tier order. */
export function bestForActivity(type: ExerciseType): RankedExercise[] {
  const pool = EXERCISES.filter((e) => e.type === type)
  if (type === 'cardio') {
    return [...pool]
      .sort(
        (a, b) =>
          a.difficulty - b.difficulty ||
          a.met - b.met ||
          a.name.localeCompare(b.name)
      )
      .map((exercise) => ({ exercise, tier: tierFor(exercise.id), why: whyFor(exercise.id) }))
  }
  if (type === 'mobility') {
    return [...pool]
      .sort((a, b) => a.difficulty - b.difficulty || breadth(b) - breadth(a) || a.name.localeCompare(b.name))
      .map((exercise) => ({ exercise, tier: tierFor(exercise.id), why: whyFor(exercise.id) }))
  }
  return rankExercises(pool)
}

/** Tiny badge helper for the UI — label + tone; the component maps tone→styles. */
export function rankBadge(tier: Tier): { label: string; tone: 'gold' | 'neutral' | 'dim' } {
  if (tier === 1) return { label: 'T1', tone: 'gold' }
  if (tier === 2) return { label: 'T2', tone: 'neutral' }
  return { label: 'T3', tone: 'dim' }
}
