// ─── ASCENDANT · Title (achievement) catalog ──────────────────────────────────

export type TitleDef = {
  code: string
  title: string
  epithet: string
  desc: string
  tier: "common" | "rare" | "epic" | "legend"
}

export const TITLES: TitleDef[] = [
  { code: "awakened", title: "First Steps", epithet: "The journey begins", desc: "Create your training profile.", tier: "common" },
  { code: "first-raid", title: "First Workout", epithet: "Every athlete starts somewhere", desc: "Complete your first workout session.", tier: "common" },
  { code: "raider-10", title: "Ten Sessions In", epithet: "The habit is forming", desc: "Complete 10 workout sessions.", tier: "common" },
  { code: "raider-50", title: "Fifty Sessions In", epithet: "Training is routine now", desc: "Complete 50 workout sessions.", tier: "epic" },
  { code: "raider-100", title: "Century Athlete", epithet: "A hundred sessions strong", desc: "Complete 100 workout sessions.", tier: "legend" },
  { code: "streak-7", title: "Week Streak", epithet: "Seven days, no misses", desc: "Keep a 7-day streak.", tier: "rare" },
  { code: "streak-30", title: "Month Streak", epithet: "Thirty days of showing up", desc: "Keep a 30-day streak.", tier: "epic" },
  { code: "streak-100", title: "Hundred-Day Streak", epithet: "Consistency incarnate", desc: "Keep a 100-day streak.", tier: "legend" },
  { code: "level-10", title: "D-Rank Athlete", epithet: "Foundations built", desc: "Reach Level 10.", tier: "common" },
  { code: "level-20", title: "C-Rank Athlete", epithet: "A thousand reps deep", desc: "Reach Level 20.", tier: "rare" },
  { code: "level-40", title: "A-Rank Athlete", epithet: "Mastery of the body", desc: "Reach Level 40.", tier: "epic" },
  { code: "level-60", title: "S-Rank Athlete", epithet: "Flesh and will, aligned", desc: "Reach Level 60.", tier: "legend" },
  { code: "volume-25k", title: "25 Tonnes Moved", epithet: "25,000 kg under your hands", desc: "Move 25,000 kg of lifetime volume.", tier: "rare" },
  { code: "volume-250k", title: "250 Tonnes Moved", epithet: "A quarter million kilograms", desc: "Move 250,000 kg of lifetime volume.", tier: "legend" },
  { code: "century", title: "Century Club", epithet: "One hundred push-ups in one session", desc: "Log 100+ push-up reps in one session.", tier: "rare" },
  { code: "night-raider", title: "Night Owl Lifter", epithet: "The dark hours are yours", desc: "Finish a session between 22:00 and 04:00.", tier: "rare" },
  { code: "dawn-wolf", title: "Sunrise Athlete", epithet: "You train before the sun", desc: "Finish a session before 07:00.", tier: "rare" },
  { code: "marathon-mind", title: "Marathon Mind", epithet: "Sixty minutes in one session", desc: "Log 60+ active minutes in one session.", tier: "rare" },

  // ── Program Forge titles (training protocols) ──────────────────────────────
  { code: "program-architect", title: "Program Architect", epithet: "The plan precedes the pain", desc: "Forge your first training program.", tier: "common" },
  { code: "program-followed-10", title: "Protocol Devotee", epithet: "Ten days executed as written", desc: "Clear 10 program-day sessions.", tier: "epic" },
  { code: "program-followed-50", title: "Doctrine Incarnate", epithet: "Fifty days, zero excuses", desc: "Clear 50 program-day sessions.", tier: "legend" },
  { code: "program-perfect-week", title: "Perfect Week", epithet: "Every planned day, cleared", desc: "Clear every planned program day in one week.", tier: "epic" },
  { code: "program-multi-forge", title: "Master Forger", epithet: "Five protocols struck in the forge", desc: "Forge 5 programs.", tier: "epic" },

  // ── Gate mastery titles (unlocked by per-gate clear counts) ──────────────
  { code: "mastery-gale-1", title: "Engine Started", epithet: "Your engine is real", desc: "Reach REGULAR tier in Cardio (3 completed sessions).", tier: "common" },
  { code: "mastery-gale-2", title: "Road Regular", epithet: "The miles know your name", desc: "Reach COMMITTED tier in Cardio (10 completed sessions).", tier: "rare" },
  { code: "mastery-gale-3", title: "Pace Setter", epithet: "You run your own pace", desc: "Reach VETERAN tier in Cardio (25 completed sessions).", tier: "epic" },
  { code: "mastery-gale-4", title: "Steady Lungs", epithet: "Breath stays calm at speed", desc: "Reach ELITE tier in Cardio (50 completed sessions).", tier: "epic" },
  { code: "mastery-gale-5", title: "Endurance Elite", epithet: "Distance is your home turf", desc: "Reach MASTER tier in Cardio (100 completed sessions).", tier: "legend" },

  { code: "mastery-forge-1", title: "Iron Initiate", epithet: "The bar no longer feels strange", desc: "Reach REGULAR tier in Strength (3 completed sessions).", tier: "common" },
  { code: "mastery-forge-2", title: "Barbell Regular", epithet: "The rack is part of your week", desc: "Reach COMMITTED tier in Strength (10 completed sessions).", tier: "rare" },
  { code: "mastery-forge-3", title: "Heavy Lifter", epithet: "Big numbers, clean reps", desc: "Reach VETERAN tier in Strength (25 completed sessions).", tier: "epic" },
  { code: "mastery-forge-4", title: "Strength Specialist", epithet: "The weights answer to you", desc: "Reach ELITE tier in Strength (50 completed sessions).", tier: "epic" },
  { code: "mastery-forge-5", title: "Iron Veteran", epithet: "Years of load under the bar", desc: "Reach MASTER tier in Strength (100 completed sessions).", tier: "legend" },

  { code: "mastery-titan-1", title: "Bodyweight Basics", epithet: "Your own weight, mastered", desc: "Reach REGULAR tier in Calisthenics (3 completed sessions).", tier: "common" },
  { code: "mastery-titan-2", title: "Repetition Machine", epithet: "Rep after rep after rep", desc: "Reach COMMITTED tier in Calisthenics (10 completed sessions).", tier: "rare" },
  { code: "mastery-titan-3", title: "Bar Artist", epithet: "The bar is your stage", desc: "Reach VETERAN tier in Calisthenics (25 completed sessions).", tier: "epic" },
  { code: "mastery-titan-4", title: "Pull-Up Power", epithet: "Gravity works for you now", desc: "Reach ELITE tier in Calisthenics (50 completed sessions).", tier: "epic" },
  { code: "mastery-titan-5", title: "Gravity Proof", epithet: "Gravity is a suggestion", desc: "Reach MASTER tier in Calisthenics (100 completed sessions).", tier: "legend" },

  { code: "mastery-flow-1", title: "Stretch Starter", epithet: "The first stretch sticks", desc: "Reach REGULAR tier in Mobility (3 completed sessions).", tier: "common" },
  { code: "mastery-flow-2", title: "Flow Builder", epithet: "A little mobility every day", desc: "Reach COMMITTED tier in Mobility (10 completed sessions).", tier: "rare" },
  { code: "mastery-flow-3", title: "Limber", epithet: "Deep bends, easy breaths", desc: "Reach VETERAN tier in Mobility (25 completed sessions).", tier: "epic" },
  { code: "mastery-flow-4", title: "Mobility Devotee", epithet: "Recovery is part of your training", desc: "Reach ELITE tier in Mobility (50 completed sessions).", tier: "epic" },
  { code: "mastery-flow-5", title: "Full Range", epithet: "Every joint moves freely", desc: "Reach MASTER tier in Mobility (100 completed sessions).", tier: "legend" },

  { code: "mastery-colossus-1", title: "Circuit Breaker", epithet: "Full-body circuits, done right", desc: "Reach REGULAR tier in Full Body (3 completed sessions).", tier: "rare" },
  { code: "mastery-colossus-2", title: "Full-Body Regular", epithet: "Mixed sessions are your habit", desc: "Reach COMMITTED tier in Full Body (10 completed sessions).", tier: "epic" },
  { code: "mastery-colossus-3", title: "Conditioning Machine", epithet: "All domains at once, mastered", desc: "Reach VETERAN tier in Full Body (25 completed sessions).", tier: "epic" },
  { code: "mastery-colossus-4", title: "Hybrid Athlete", epithet: "Strong, fast and mobile", desc: "Reach ELITE tier in Full Body (50 completed sessions).", tier: "legend" },
  { code: "mastery-colossus-5", title: "Complete Athlete", epithet: "The whole picture, trained", desc: "Reach MASTER tier in Full Body (100 completed sessions).", tier: "legend" },

  // ── Ascension Protocol titles (prestige cycles) ───────────────────────────
  { code: "asc-1", title: "New Cycle", epithet: "You outgrew the old level", desc: "Complete your first New Cycle.", tier: "rare" },
  { code: "asc-2", title: "Double Cycle", epithet: "Two resets, two strong comebacks", desc: "Complete 2 New Cycles.", tier: "epic" },
  { code: "asc-3", title: "Triple Cycle", epithet: "Every ending, a beginning", desc: "Complete 3 New Cycles.", tier: "epic" },
  { code: "asc-5", title: "Cycle Master", epithet: "Five resets, five rebuilds", desc: "Complete 5 New Cycles.", tier: "legend" },
  { code: "asc-10", title: "Cycle Legend", epithet: "Levels are just a number", desc: "Complete 10 New Cycles.", tier: "legend" },

  // ── Boss slayer titles (world-boss kills) ─────────────────────────────────
  { code: "boss-1", title: "First Challenge", epithet: "One weekly challenge beaten", desc: "Complete your first weekly challenge.", tier: "common" },
  { code: "boss-3", title: "Challenge Chaser", epithet: "Three challenges down", desc: "Complete 3 weekly challenges.", tier: "rare" },
  { code: "boss-10", title: "Challenge Crusher", epithet: "Ten challenges crushed", desc: "Complete 10 weekly challenges.", tier: "epic" },
  { code: "boss-25", title: "Challenge Machine", epithet: "Twenty-five challenges done", desc: "Complete 25 weekly challenges.", tier: "legend" },
  { code: "boss-50", title: "Challenge Legend", epithet: "Fifty challenges completed", desc: "Complete 50 weekly challenges.", tier: "legend" },
]

export const TIER_STYLES: Record<TitleDef["tier"], { text: string; border: string; glow: string; label: string }> = {
  common: { text: "text-zinc-300", border: "border-zinc-500/40", glow: "", label: "COMMON" },
  rare: { text: "text-sky-300", border: "border-sky-400/50", glow: "shadow-[0_0_14px_rgba(125,211,252,0.25)]", label: "RARE" },
  epic: { text: "text-violet-300", border: "border-violet-500/50", glow: "shadow-[0_0_16px_rgba(167,139,250,0.3)]", label: "EPIC" },
  legend: { text: "text-amber-300", border: "border-amber-500/60", glow: "shadow-[0_0_20px_rgba(245,158,11,0.4)]", label: "LEGEND" },
}

export function titleByCode(code: string): TitleDef | undefined {
  return TITLES.find((t) => t.code === code)
}
