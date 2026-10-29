// ─── PRIME · Exercise-science fact library (R28-b evidence layer) ──────────────
//
// A curated, TYPED library of real exercise-science findings — the evidence
// behind the app's coaching surfaces. Every entry is drawn from published,
// commonly-cited research; nothing here is invented. `claim` is the punchy
// headline (≤90 chars), `detail` carries the actual numbers, `citation` names
// the source, and `practical` says how PRIME applies it. Findings that trace
// back to review articles rather than single trials say so in the detail.
//
// Sourcing notes (2026 audit, verified against the literature):
// - Rest-interval, load, frequency and volume facts → the Schoenfeld-group
//   meta-analyses; the volume dose-response paper lives in J Sports Sci.
// - Plews 2013 HRV monitoring → Sports Med (not IJSPP — corrected to the
//   journal of record during verification).
// - Barr's dehydration review is 1999 (Can J Appl Physiol); the ~2% body-mass
//   threshold is anchored on the ACSM fluid position stand (Sawka 2007).
// - The deload numbers (~40–60% every 4–8 weeks) are standard periodization
//   practice, labelled as such — never attributed to a trial that didn't
//   measure them.
//
// Pure static data + pure helpers — safe to import from any client component;
// `dailyFact` is deterministic (day-of-year rotation, zero randomness), so the
// same fact serves an entire local day and SSR/client can never disagree.

export type ScienceDomain =
  | "rest"
  | "hypertrophy"
  | "protein"
  | "cardio"
  | "sleep"
  | "hrv"
  | "warmup"
  | "overload"
  | "recovery"
  | "supplement"
  | "volume"

export interface ScienceFact {
  id: string
  domain: ScienceDomain
  /** Punchy headline, ≤90 chars. */
  claim: string
  /** 1–2 sentences with the actual numbers. */
  detail: string
  /** "Author et al., YEAR — Journal" — real sources only. */
  citation: string
  /** How PRIME applies it (app context). */
  practical?: string
}

export const SCIENCE_FACTS: ScienceFact[] = [
  // ── REST INTERVALS ──────────────────────────────────────────────────────────
  {
    id: "rest-compound",
    domain: "rest",
    claim: "Rest 2–3 min between compound sets to grow more",
    detail:
      "Trained lifters resting 2–3 min built more quad and arm muscle than those resting 60–90 s on the same exercises — recovered force output means more usable volume per set.",
    citation: "Schoenfeld et al., 2016 — J Strength Cond Res",
    practical:
      "On squats, bench, rows and deadlifts, take the full 2–3 min. If your working weight drops set-to-set, the rest clock — not your effort — is usually the culprit.",
  },
  {
    id: "rest-isolation",
    domain: "rest",
    claim: "Isolation moves still grow with 60–90 s rests",
    detail:
      "For single-joint exercises, 60–90 s rests matched long rests for hypertrophy — small muscles recover force fast, so short rests cost nothing there.",
    citation: "Schoenfeld et al., 2016 — J Strength Cond Res",
    practical:
      "Pair or superset isolation work inside Iron Forge sessions — curls, laterals and pressdowns don't need the bench-press rest clock.",
  },
  {
    id: "rest-meta",
    domain: "rest",
    claim: "Rest over a minute — short rests cost strength and size",
    detail:
      "A meta-analysis of rest-interval research: resting more than 60 s — 2–3 min especially — produced larger strength and hypertrophy gains than 60 s or less.",
    citation: "Grgic et al., 2018 — Sports Med",
    practical:
      "Rushing between sets turns a strength session into conditioning. Long rests on the big lifts are training, not slacking.",
  },

  // ── HYPERTROPHY ─────────────────────────────────────────────────────────────
  {
    id: "hypert-load",
    domain: "hypertrophy",
    claim: "Muscle grows across loads — take sets near failure",
    detail:
      "Hypertrophy was similar between heavy (low-rep) and moderate (high-rep) loading when sets ended close to failure; the load mainly changes strength, not size.",
    citation: "Schoenfeld et al., 2017 — J Strength Cond Res",
    practical:
      "Heavy barbell or moderate dumbbell — both build. Pick the load you can push with 1–3 reps in reserve and log it honestly.",
  },
  {
    id: "hypert-freq",
    domain: "hypertrophy",
    claim: "Train each muscle twice a week, not once",
    detail:
      "The frequency meta-analysis: hitting a muscle 2×/week produced more growth than 1×/week; splitting weekly volume across more sessions wins.",
    citation: "Schoenfeld et al., 2016 — Sports Med",
    practical:
      "The 2–3 full-body program days hit every major muscle across the week — exactly this cadence, no bro-split required.",
  },

  // ── VOLUME ──────────────────────────────────────────────────────────────────
  {
    id: "volume-dose",
    domain: "volume",
    claim: "10+ hard sets per muscle per week is the growth zone",
    detail:
      "Hypertrophy rises with weekly hard sets in a dose–response pattern up to about 10+ weekly sets per muscle — the curve keeps paying past where most people stop.",
    citation: "Schoenfeld et al., 2017 — J Sports Sci",
    practical:
      "The VOLUME panel on the Training tab reads your last 7 days against MEV→MRV landmark bands — this exact dose, per muscle.",
  },

  // ── PROTEIN ─────────────────────────────────────────────────────────────────
  {
    id: "protein-plateau",
    domain: "protein",
    claim: "1.6 g of protein per kg per day is the growth plateau",
    detail:
      "A 49-trial meta-regression: muscle gains rose with daily protein up to ~1.6 g/kg body weight and plateaued there; the upper confidence bound sits near 2.2 g/kg.",
    citation: "Morton et al., 2018 — Br J Sports Med",
    practical:
      "FUEL computes your daily protein target from body weight inside that range — the teal protein bar tracks it live.",
  },
  {
    id: "protein-per-meal",
    domain: "protein",
    claim: "Split protein into ~0.4 g/kg doses, four meals a day",
    detail:
      "Per-meal muscle protein synthesis tops out around 0.4 g/kg per sitting; spreading the day's protein across ~4 feedings covers the total without waste.",
    citation: "Moore et al., 2009; Schoenfeld & Aragon, 2018 — Am J Clin Nutr / J Int Soc Sports Nutr",
    practical:
      "The Protein Timing panel scores each logged meal DOSE / LIGHT / SKIP against your per-meal target — this is the science it runs on.",
  },
  {
    id: "protein-ceiling",
    domain: "protein",
    claim: "A meal's muscle-building signal tops out near 20 g",
    detail:
      "In the dose–response trial, 20 g of egg protein maximally stimulated muscle protein synthesis — doubling to 40 g added nothing but oxidation.",
    citation: "Moore et al., 2009 — Am J Clin Nutr",
    practical:
      "One giant protein meal doesn't bank surplus growth. Hitting the daily target across the day is what pays.",
  },

  // ── OVERLOAD & PROGRESSION ──────────────────────────────────────────────────
  {
    id: "overload-core",
    domain: "overload",
    claim: "Progressive overload is the one non-negotiable",
    detail:
      "The ACSM progression-models stand names progressive overload the core driver of adaptation: gradual increases in load, reps, sets or frequency over time.",
    citation: "Ratamess et al., 2009 — Med Sci Sports Exerc (ACSM)",
    practical:
      "Every logged set is evidence. Beat last month's numbers — the XP ledger is a progression log wearing armor.",
  },
  {
    id: "overload-double",
    domain: "overload",
    claim: "Add reps first, then load: double progression",
    detail:
      "Work inside a rep range (say 6–10); once every set reaches the top of the range, add load and rebuild — the double-progression method the ACSM stand endorses.",
    citation: "Ratamess et al., 2009 — Med Sci Sports Exerc (ACSM)",
    practical:
      "A PR on the same exercise at the same rep count is the engine rewarding exactly this method.",
  },
  {
    id: "overload-epley",
    domain: "overload",
    claim: "Estimate a 1RM: weight × (1 + reps ÷ 30)",
    detail:
      "The Epley formula projects a one-rep max from a submaximal set and ranked among the most accurate prediction equations in validation testing.",
    citation: "Epley, 1985 / LeSure et al., 1997 — J Strength Cond Res",
    practical:
      "Set a clean 5–10-rep best and the formula tracks your 1RM trend — no max-out roulette required.",
  },
  {
    id: "overload-rir",
    domain: "overload",
    claim: "Autoregulate: let reps-in-reserve set the day's load",
    detail:
      "RIR-based rating scales (repetitions in reserve) match each session's effort to daily readiness — progression without blind percentage chasing.",
    citation: "Helms et al., 2018 — Strength Cond J",
    practical:
      "The readiness banner already speaks RIR: green days push top sets to 1–2 RIR, moderate days back off to 3+.",
  },

  // ── SLEEP ───────────────────────────────────────────────────────────────────
  {
    id: "sleep-strength",
    domain: "sleep",
    claim: "One bad night can cost about 9% of your squat",
    detail:
      "After 24–48 h of sleep deprivation, trained lifters lost roughly 9% of squat and bench 1RM performance — strength is a sleep-dependent variable.",
    citation: "Blumert et al., 2007 — J Strength Cond Res",
    practical:
      "A red readiness flag after short sleep is the System applying this study — swap intensity for volume, don't force a PR day.",
  },
  {
    id: "sleep-mps",
    domain: "sleep",
    claim: "Sleep debt tips muscle toward breakdown",
    detail:
      "Under sleep restriction, protein-synthesis pathways slow while degradation pathways rise — the proposed mechanism behind muscle loss on short sleep.",
    citation: "Dattilo et al., 2011 — Med Hypotheses",
    practical:
      "Sleep is the cheapest anabolic you own. The 7-day sleep average feeds your health score and readiness.",
  },
  {
    id: "sleep-window",
    domain: "sleep",
    claim: "7–9 hours of sleep is the recovery dose",
    detail:
      "The National Sleep Foundation's expert panel recommends 7–9 h for adults aged 18–64; in PRIME, short sleep is the single strongest readiness penalty.",
    citation: "Hirshkowitz et al., 2015 — Sleep Health",
    practical:
      "Log sleep in the daily check-in — the readiness score listens, and it does not forgive 5-hour nights.",
  },

  // ── HRV ─────────────────────────────────────────────────────────────────────
  {
    id: "hrv-rmssd",
    domain: "hrv",
    claim: "RMSSD reads your vagal recovery brake",
    detail:
      "RMSSD — the root-mean-square of successive heartbeat differences — isolates parasympathetic (vagal) tone: the rest-and-recover branch of the nervous system.",
    citation: "Task Force of the ESC & NASPE, 1996 — Eur Heart J",
    practical:
      "The chest strap's live 'HRV · RMSSD' readout in the LINK section is this number, computed from raw RR intervals.",
  },
  {
    id: "hrv-baseline",
    domain: "hrv",
    claim: "Judge HRV against your own 7-day rolling baseline",
    detail:
      "Day-to-day HRV only means something versus a personal rolling baseline: deviations beyond roughly ±10% for several days signal it's time to modulate training.",
    citation: "Plews et al., 2013 — Sports Med",
    practical:
      "One reading can't judge you. Capture mornings consistently and let the trend — not a single number — make the call.",
  },

  // ── CARDIO ──────────────────────────────────────────────────────────────────
  {
    id: "cardio-polarized",
    domain: "cardio",
    claim: "Endurance is built ~80% easy, ~20% hard",
    detail:
      "The dominant distribution model across elite endurance athletes is polarized: most weekly volume low-intensity, a small hard slice — and it beats threshold-heavy mixing.",
    citation: "Seiler, 2010 — Int J Sports Physiol Perform",
    practical:
      "Gale Fields counts cardio minutes at any intensity — keep the bulk conversational and let the hard days stay rare.",
  },
  {
    id: "cardio-zone2",
    domain: "cardio",
    claim: "Zone 2 is the base: easy enough to talk through",
    detail:
      "Low-intensity zone 2 work builds mitochondria and fat oxidation at almost no recovery cost — the aerobic base the 80/20 model is made of.",
    citation: "Seiler, 2010 — Int J Sports Physiol Perform",
    practical:
      "Log long easy sessions as Gale Fields raids — duration is the metric, not suffering.",
  },
  {
    id: "cardio-order",
    domain: "cardio",
    claim: "Lift before you run — or separate them by hours",
    detail:
      "In a concurrent-training meta-analysis, interference with strength and size gains was smallest when resistance work came first, or the two were hours apart.",
    citation: "Wilson et al., 2012 — J Strength Cond Res",
    practical:
      "Colossus Gate mixed sessions: strength blocks before cardio blocks, and the interference effect stays out of your way.",
  },

  // ── WARM-UP ─────────────────────────────────────────────────────────────────
  {
    id: "warmup-ramp",
    domain: "warmup",
    claim: "Ramp warm-up sets toward the working weight",
    detail:
      "Structured warm-ups — empty bar, ~50% × 8–10, ~70% × 5, ~90% × 1–3 — measurably improved subsequent performance versus no specific warm-up.",
    citation: "McGowan et al., 2015 — Sports Med",
    practical:
      "The first approach to the bar in an Iron Forge raid is your ramp: climb to the working weight, then start logging working sets.",
  },
  {
    id: "warmup-protocol",
    domain: "warmup",
    claim: "Structure warm-ups with RAMP",
    detail:
      "Raise body temperature, Activate the key muscles, Mobilise the joints, Potentiate with ramped load — the RAMP framework for building effective warm-ups.",
    citation: "Jeffreys, 2007 — Prof Strength Cond",
    practical:
      "Five minutes of RAMP before a gate session costs nothing and buys the first working set.",
  },

  // ── RECOVERY ────────────────────────────────────────────────────────────────
  {
    id: "recovery-doms",
    domain: "recovery",
    claim: "Soreness is not a growth requirement",
    detail:
      "Post-exercise soreness is a poor indicator of hypertrophy — unaccustomed eccentric work hurts the most, yet growth tracks volume, not pain.",
    citation: "Schoenfeld, 2013 — Strength Cond J",
    practical:
      "A painless productive session still counts fully — PRIME scores work, not DOMS.",
  },
  {
    id: "recovery-window",
    domain: "recovery",
    claim: "Give a muscle ~48–72 h before hitting it hard again",
    detail:
      "Muscles are generally ready for productive hard training again within about 48–72 h — one reason 2×/week frequency beat 1×/week in meta-analysis.",
    citation: "Schoenfeld et al., 2016 — Sports Med",
    practical:
      "The streak shield's rest day and program spacing exist so recovery lands inside the supercompensation window, not after it.",
  },
  {
    id: "recovery-eccentric",
    domain: "recovery",
    claim: "Eccentrics hurt more — they don't necessarily grow more",
    detail:
      "Eccentric-emphasized training raises soreness and distinct remodelling signals, but total growth is similar — the extra damage mostly costs recovery.",
    citation: "Franchi et al., 2017 — Front Physiol",
    practical:
      "Control the lowering for joints and technique — not to farm soreness.",
  },
  {
    id: "recovery-hydration",
    domain: "recovery",
    claim: "2% dehydration already costs performance",
    detail:
      "Losing just ~2% of body mass as fluid measurably degrades endurance performance; ACSM's fluid-replacement stand advises starting exercise hydrated.",
    citation: "Sawka et al., 2007 — Med Sci Sports Exerc (ACSM)",
    practical:
      "The FUEL water tracker's daily target is the training-day dose — hit it before the first working set, not after.",
  },
  {
    id: "recovery-deload",
    domain: "recovery",
    claim: "Plan a light week every 4–8 weeks",
    detail:
      "Standard periodization practice: cut volume ~40–60% for one week every 4–8 weeks to shed accumulated fatigue — fitness rebounds once the debt clears.",
    citation: "Standard practice — periodization per Ratamess et al., 2009 — Med Sci Sports Exerc (ACSM)",
    practical:
      "A week of short sessions keeps the streak alive while the fatigue debt clears — planned rest, not failed discipline.",
  },

  // ── SUPPLEMENTS ─────────────────────────────────────────────────────────────
  {
    id: "supplement-creatine",
    domain: "supplement",
    claim: "Creatine, 3–5 g daily: the most-evidenced supplement",
    detail:
      "The ISSN position stand: creatine monohydrate at 3–5 g/day reliably increases strength and lean mass across hundreds of trials — no loading phase required.",
    citation: "Kreider et al., 2017 — J Int Soc Sports Nutr",
    practical:
      "The one supplement with evidence to match the marketing — cheap, daily, boring. Consistency does the rest.",
  },
  {
    id: "supplement-caffeine",
    domain: "supplement",
    claim: "Caffeine 3–6 mg/kg, an hour before training, works",
    detail:
      "Caffeine is reliably ergogenic for strength and endurance at 3–6 mg/kg taken ~60 min before exercise; beyond that dose, jitter — not performance — rises.",
    citation: "Graham, 2001 — Sports Med; Grgic et al., 2020 — Nutrients",
    practical:
      "A pre-session espresso lands about 40 minutes in — time it to the first working set, not the drive to the gym.",
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

/** All facts in one domain, catalog order. */
export function factsByDomain(domain: ScienceDomain): ScienceFact[] {
  return SCIENCE_FACTS.filter((f) => f.domain === domain)
}

/** Deterministic lookup by id — chips reference facts by id, unknown ids → undefined. */
export function getFact(id: string): ScienceFact | undefined {
  return SCIENCE_FACTS.find((f) => f.id === id)
}

/** Day-of-year for a local date, 1-based — the deterministic rotation seed. */
function dayOfYear(date: Date): number {
  // Date(y, 0, 0) is Dec 31 of the prior year — the subtraction pattern below
  // stays DST-safe for local-midnight rollovers.
  const start = new Date(date.getFullYear(), 0, 0)
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000)
}

/**
 * The fact of the day — a deterministic day-of-year rotation over the full
 * catalog. The same fact serves the entire local day (no randomness, so the
 * STATUS brief never flickers on re-render or hydration).
 */
export function dailyFact(date: Date = new Date()): ScienceFact {
  return SCIENCE_FACTS[dayOfYear(date) % SCIENCE_FACTS.length]
}
