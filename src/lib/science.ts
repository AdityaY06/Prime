// ─── PRIME · Science content layer — consensus training & nutrition positions ──
// Pure, typed, framework-free (client-safe, no imports beyond nothing at all).
//
// HONESTY DISCIPLINE (R29-b, mirrors the R7-c audit): every entry states a
// CONSENSUS position only, phrased as "guidelines recommend" / "is commonly
// structured" — never a personal prescription. Source labels are org names +
// year at most (WHO 2020 / ACSM / ISSN / NSCA) or the honest CONSENSUS /
// GENERAL GUIDANCE tags — NEVER study citations, journals or DOIs. The app
// gives lay users field-manual guidance; it does not litigate the literature.

export type ScienceEntry = {
  /** Stable id — surfaces reference entries by id. */
  id: string
  /** Short display title for field-manual style rows. */
  title: string
  /** The consensus position — 1–3 tight sentences, app tone but factual. */
  body: string
  /** Org-level source label. */
  source: string
}

/** The field manual — 18 consensus positions in a stable, curated order. */
export const SCIENCE_ENTRIES: readonly ScienceEntry[] = [
  {
    id: "who-aerobic",
    title: "Weekly aerobic target",
    body: "Guidelines recommend 150-300 min of moderate (or 75-150 min vigorous) aerobic activity per week.",
    source: "WHO 2020",
  },
  {
    id: "who-strength",
    title: "Weekly strength target",
    body: "Guidelines recommend muscle-strengthening activity on 2+ days per week, covering all major muscle groups.",
    source: "WHO 2020",
  },
  {
    id: "acsm-fitt",
    title: "The FITT-VP framework",
    body: "The FITT-VP framework (Frequency, Intensity, Time, Type, Volume, Progression) is the standard scaffold for prescribing exercise.",
    source: "ACSM",
  },
  // R68 — re-ranged to the ISSN position stand's own numbers (audit 2-a B6:
  // 1.6–2.2 was misattributed to ISSN — their stand says 1.4–2.0). Org+year
  // label per the file's R29-b discipline; the app's personalized 1.6/1.8/2.2
  // per-goal dosing lives in nutrition.ts under its own (Morton-adjacent)
  // attribution — goal dosing above the general guideline, not a contradiction.
  {
    id: "issn-protein",
    title: "Protein for adaptation",
    body: "Guidelines recommend 1.4-2.0 g of protein per kg bodyweight per day to support training adaptation.",
    source: "ISSN 2017",
  },
  {
    id: "nsca-overload",
    title: "Progressive overload",
    body: "Progressive overload (gradual increases in load, volume or reps) is what drives adaptation.",
    source: "NSCA",
  },
  {
    id: "nsca-recovery",
    title: "Recovery & supercompensation",
    body: "Guidelines suggest ~48 h before loading a trained muscle group hard again — recovery is when supercompensation happens.",
    source: "NSCA",
  },
  {
    id: "rpe-rir",
    title: "Autoregulation (RPE/RIR)",
    body: "Training to a target RPE or leaving reps in reserve lets daily effort track readiness — hard days stay hard, heavy fatigue dials itself down.",
    source: "CONSENSUS",
  },
  {
    id: "hrv-rmssd",
    title: "HRV recovery signal",
    body: "rMSSD heart-rate variability reflects parasympathetic recovery — sustained drops below your baseline flag under-recovery.",
    source: "CONSENSUS",
  },
  {
    id: "sleep-athletes",
    title: "Sleep is training fuel",
    body: "Guidelines recommend 7-9 h of sleep for adults; chronic short sleep measurably degrades performance and recovery.",
    source: "GENERAL GUIDANCE",
  },
  {
    id: "ramp-warmup",
    title: "RAMP warm-up",
    body: "Warm up with the RAMP protocol — Raise, Activate, Mobilise, Potentiate — before heavy sessions.",
    source: "CONSENSUS",
  },
  {
    id: "hydration",
    title: "Hydration",
    body: "Begin sessions well-hydrated and replace sweat losses afterwards — for long sessions, monitor your bodyweight delta.",
    source: "GENERAL GUIDANCE",
  },
  {
    id: "polarized",
    title: "Polarized endurance",
    body: "Endurance training is commonly structured ~80% easy volume / ~20% hard work — the polarized model.",
    source: "CONSENSUS",
  },
  {
    id: "muscle-hypertrophy",
    title: "Hypertrophy basics",
    body: "Mechanical tension from hard sets of ~5-30 reps, taken close to failure, drives hypertrophy.",
    source: "CONSENSUS",
  },
  {
    id: "zone2",
    title: "Zone 2 base work",
    body: "Zone 2 work (~60-70% of max heart rate) builds the aerobic base that carries all other training.",
    source: "CONSENSUS",
  },
  // R31-a — the two ASCENT advisor positions (org-level labels only, house
  // discipline: consensus phrasing, no citations).
  {
    id: "plyo-training",
    title: "Plyometric training",
    body: "Plyometric jump training improves vertical jump and lower-body power when volume progresses gradually and recovery between sessions is respected.",
    source: "NSCA",
  },
  {
    id: "relative-strength",
    title: "Relative strength",
    body: "Jump ability tracks closely with relative strength — force produced per kilogram of bodyweight — and the ability to express it quickly.",
    source: "CONSENSUS",
  },
  // R32-b — the two ASCENT-expansion positions (org-level labels only, house
  // discipline: consensus phrasing, no citations).
  {
    id: "pullup-progress",
    title: "Pull-up progression",
    body: "First pull-ups are commonly earned through progressive steps — dead hangs, scapular pulls, slow negatives and assisted reps — practised frequently but rarely to failure.",
    source: "CONSENSUS",
  },
  {
    id: "fivek-pace",
    title: "5K pace equivalency",
    body: "Shorter-race times convert to 5K equivalents with standard pace-equivalent formulas — an equivalent, not a guarantee; heat, hills and pacing shift the day.",
    source: "CONSENSUS",
  },
]

/** Look up one field-manual entry by its stable id — null when unknown. */
export function scienceFor(id: string): ScienceEntry | null {
  return SCIENCE_ENTRIES.find((e) => e.id === id) ?? null
}

/** Topic → entry ids, for surfaces that want guidance grouped by concern. */
export const SCIENCE_BY_TOPIC: Record<
  "sleep" | "recovery" | "protein" | "cardio" | "strength" | "hrv" | "warmup",
  readonly string[]
> = {
  strength: ["nsca-overload", "muscle-hypertrophy", "who-strength", "plyo-training", "relative-strength", "pullup-progress"],
  cardio: ["who-aerobic", "zone2", "polarized", "fivek-pace"],
  protein: ["issn-protein"],
  hrv: ["hrv-rmssd", "rpe-rir"],
  recovery: ["nsca-recovery", "sleep-athletes"],
  sleep: ["sleep-athletes"],
  warmup: ["ramp-warmup", "hydration"],
}
