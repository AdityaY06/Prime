/**
 * R52 — the gamification glossary.
 *
 * One source of truth for the "small pop-up meanings": every game term the
 * UI shows gets a ≤2-sentence plain-language meaning here, rendered on tap
 * by <InfoHint>. Labels on screen stay SHORT; the explanation is never
 * printed inline — that is the whole declutter move.
 */

export type GlossaryKey =
  | "xp"
  | "level"
  | "rank"
  | "credits"
  | "power"
  | "streak"
  | "readiness"
  | "hrv"
  | "rift"
  | "pr"
  | "recovery"
  | "cycle"
  | "mastery"
  | "badges"
  | "attributes"
  | "goals"
  | "volume"
  | "rpe"
  | "standings"
  | "strain"
  | "acwr"
  | "fitness"
  | "sessionLoad"
  | "e1rm"
  | "checkIn"
  | "zones"
  | "raids"
  | "calibrated"
  | "milestones"
  | "ascent"
  | "perks"
  | "freshness"
  | "macros"
  | "micros"
  | "fuelTiming"
  | "chronicle"
  | "exportPack"
  | "rhr"
  | "listed"
  | "deload"

export const GLOSSARY: Record<GlossaryKey, { title: string; body: string }> = {
  xp: {
    title: "XP",
    body: "Experience points. Earned by finishing workouts, hitting goals and setting records. Fill the bar to level up.",
  },
  level: {
    title: "Level",
    body: "Your training age. Every level grants attribute points; certain features unlock at higher levels.",
  },
  rank: {
    title: "Rank",
    body: "F to S — the world's measure of a hunter, earned by level. F is awakening; S is apex.",
  },
  credits: {
    title: "Credits",
    body: "Forge currency earned from real workouts. Spend them on relics and titles in Rewards.",
  },
  power: {
    title: "Power Score",
    body: "One number blending all five attributes — a quick read of overall strength.",
  },
  streak: {
    title: "Streak",
    body: "Consecutive active days. One missed day resets it — a recovery day can shield it.",
  },
  readiness: {
    title: "Readiness",
    body: "How recovered you are today, from sleep, HRV and resting heart rate. Go hard when it's high, easy when it's low.",
  },
  hrv: {
    title: "HRV",
    body: "Heart-rate variability. A drop below your baseline means your body is still recovering.",
  },
  rift: {
    title: "Rift",
    body: "Today's bonus gate. Training it while it's open multiplies that session's XP.",
  },
  pr: {
    title: "PR",
    body: "Personal Record — your best-ever set for an exercise at a given rep range.",
  },
  recovery: {
    title: "Recovery Day",
    body: "One per week. Claim it to keep your streak alive on a day you don't train.",
  },
  cycle: {
    title: "New Cycle",
    body: "At level 30: restart at level 1 for a permanent ×1.15 XP multiplier. Badges, records and mastery endure.",
  },
  mastery: {
    title: "Mastery",
    body: "Long-term progress per exercise, earned by volume over months of training.",
  },
  badges: {
    title: "Badges",
    body: "Milestones earned by real feats — first workout, streaks, records. Collected in Rewards.",
  },
  attributes: {
    title: "Attributes",
    body: "STR, VIT, END, AGI, FLEX. They grow with training; spend free points to shape your build.",
  },
  goals: {
    title: "Daily Goals",
    body: "Today's directives — reps, sessions, volume. Complete them to bank XP before midnight.",
  },
  volume: {
    title: "Volume",
    body: "Total weight moved in a session — reps × load. The honest measure of work done.",
  },
  rpe: {
    title: "RPE",
    body: "Rate of Perceived Exertion, 1–10. How hard a set felt — lets training track your daily readiness.",
  },
  standings: {
    title: "Standings",
    body: "Ranked by lifetime XP. These boards compare the hunters registered on this device — nothing leaves it.",
  },
  listed: {
    title: "Listed",
    body: "Your standings visibility. Listed — your row appears on the boards. Hidden (eye-off) — you are off every board, while still able to view them. Your training data never changes either way.",
  },
  strain: {
    title: "Strain",
    body: "Today's training stress, 0–21 — a weighted blend of session effort and duration. High strain days call for easier ones after.",
  },
  acwr: {
    title: "Load Ratio (ACWR)",
    body: "This week's training load vs your 4-week average. Around 0.8–1.3 is the sweet spot; higher risks overload, lower means detraining.",
  },
  fitness: {
    title: "Fitness · Fatigue · Form",
    body: "CTL (42-day fitness), ATL (7-day fatigue) and TSB (form — the gap). Form goes positive as fatigue washes out and fitness holds.",
  },
  sessionLoad: {
    title: "Session Load",
    body: "One number per workout — effort (RPE) × duration. Session-load math after Foster's session-RPE method.",
  },
  e1rm: {
    title: "e1RM",
    body: "Estimated one-rep max — computed from a working set (weight × reps) without you ever attempting a true max.",
  },
  checkIn: {
    title: "Daily Check-In",
    body: "Morning vitals — BP, resting HR, SpO₂, HRV, sleep, stress, mood, energy. Readiness unlocks from what you log; nothing is invented.",
  },
  zones: {
    title: "Zones",
    body: "Your latest readings placed in clinical reference bands. One reading is never a diagnosis — trends over time are what matter.",
  },
  raids: {
    title: "Raids",
    body: "Training types — Strength, Cardio, Calisthenics, Mobility, HIIT. Each pays its own XP multiplier; finish one before starting the next.",
  },
  calibrated: {
    title: "Calibrated",
    body: "Auto-scaled to your recent logs, with a floor so it never turns trivial. Beat today's number to bank the reward.",
  },
  milestones: {
    title: "Milestones",
    body: "Long-game targets — rank, streaks, lifetime totals. The reward is claimable the moment the bar fills.",
  },
  ascent: {
    title: "Ascent Advisor",
    body: "Deterministic, no AI. It reads your real logs, flags what's missing, and prescribes the next training focus — thresholds, honestly labeled.",
  },
  perks: {
    title: "Perks",
    body: "Permanent boosts bought with credits. Each quietly raises XP in its own lane — forever, or until spent again.",
  },
  freshness: {
    title: "Freshness",
    body: "Per-muscle recovery, 0–100. It falls when you train a muscle and climbs back over roughly 48–72 hours.",
  },
  macros: {
    title: "Macros",
    body: "Protein, carbs and fat — daily gram targets scaled to your bodyweight and goal. Totals first; timing is refinement.",
  },
  micros: {
    title: "Micros",
    body: "Fiber, sodium, sugar. Fiber is a goal to reach; sodium and sugar are ceilings to stay under.",
  },
  fuelTiming: {
    title: "Fuel Timing",
    body: "Spread ~0.4 g/kg of protein across 3–4 meals. Helpful, not magic — daily totals matter far more.",
  },
  chronicle: {
    title: "Chronicle",
    body: "Your session history ledger — every cleared raid with its volume, duration and XP. The archive behind the Progress charts.",
  },
  exportPack: {
    title: "Export Pack",
    body: "A single JSON file with your full history: profile, sessions, logs, vitals, goals and records. Import it on any device to restore everything.",
  },
  rhr: {
    title: "Resting HR",
    body: "Resting heart rate. A few bpm above your 7-day baseline can flag fatigue or illness; below it often means growing fitness.",
  },
  deload: {
    title: "Deload",
    body: "A planned easy week — volume cut 25–40% — after a stretch of heavy weeks so the body banks the gains. The advisor reads your week strain and flags when one is due; a rest week resets the clock.",
  },
}
