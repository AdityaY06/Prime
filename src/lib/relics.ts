// ─── ASCENDANT · Forge relic definitions ──────────────────────────────────────
// Aether essence is earned by clearing gates, setting personal records and
// claiming directives. It is spent at THE FORGE on permanent and charged relics.

export type RelicKind = "passive" | "charged" | "instant"

export type RelicDef = {
  code: string
  name: string
  epithet: string
  desc: string
  effect: string // short human-readable effect line
  kind: RelicKind
  cost: number
  maxCharges: number // how many charges a single purchase grants
  glyph: string // mono glyph shown in the forge card
  accent: string // tailwind text color
  border: string // tailwind border color
  glow: string // box-shadow glow
  // Which stat gates the lore hint (display only)
  lore: string
}

export const RELICS: RelicDef[] = [
  {
    code: "ember-of-zeal",
    name: "XP Surge",
    epithet: "ALWAYS ON",
    desc: "Every completed session pays out a little more. A permanent boost to all XP gains.",
    effect: "All session XP +10%",
    kind: "passive",
    cost: 150,
    maxCharges: 1,
    glyph: "◈",
    accent: "text-amber-300",
    border: "border-amber-500/50",
    glow: "shadow-[0_0_18px_rgba(245,158,11,0.35)]",
    lore: "Passive · Permanent",
  },
  {
    code: "sigil-of-titan",
    name: "Strength Spark",
    epithet: "BUILT FOR HEAVY DAYS",
    desc: "Built for barbell days. Weighted exercises earn bonus XP across every session.",
    effect: "Strength exercise XP +15%",
    kind: "passive",
    cost: 100,
    maxCharges: 1,
    glyph: "⬢",
    accent: "text-rose-300",
    border: "border-rose-500/50",
    glow: "shadow-[0_0_18px_rgba(244,63,94,0.35)]",
    lore: "Passive · Permanent",
  },
  {
    code: "lens-of-gales",
    name: "Cardio Spark",
    epithet: "EVERY MINUTE COUNTS",
    desc: "Built for runners and riders. Cardio minutes earn bonus XP in every session.",
    effect: "Cardio exercise XP +15%",
    kind: "passive",
    cost: 100,
    maxCharges: 1,
    glyph: "◇",
    accent: "text-teal-300",
    border: "border-teal-500/50",
    glow: "shadow-[0_0_18px_rgba(20,184,166,0.35)]",
    lore: "Passive · Permanent",
  },
  {
    code: "prism-of-flow",
    name: "Mobility Spark",
    epithet: "RECOVERY PAYS",
    desc: "Built for recovery days. Mobility and bodyweight work earn bonus XP.",
    effect: "Mobility & bodyweight XP +12%",
    kind: "passive",
    cost: 80,
    maxCharges: 1,
    glyph: "△",
    accent: "text-violet-300",
    border: "border-violet-500/50",
    glow: "shadow-[0_0_18px_rgba(139,92,246,0.35)]",
    lore: "Passive · Permanent",
  },
  {
    code: "ward-of-continuity",
    name: "Streak Shield",
    epithet: "STREAK INSURANCE",
    desc: "Miss a day and the shield covers it — your streak carries on as if you trained.",
    effect: "Auto-shields your streak for one missed day",
    kind: "charged",
    cost: 60,
    maxCharges: 3,
    glyph: "⌘",
    accent: "text-emerald-300",
    border: "border-emerald-500/50",
    glow: "shadow-[0_0_18px_rgba(16,185,129,0.35)]",
    lore: "Charged · Stackable",
  },
  {
    code: "phoenix-ember",
    name: "Streak Revival",
    epithet: "ONE MORE CHANCE",
    desc: "Bring one failed daily goal back to life so you can finish it and claim the reward.",
    effect: "Revive one failed daily goal",
    kind: "charged",
    cost: 50,
    maxCharges: 3,
    glyph: "✦",
    accent: "text-orange-300",
    border: "border-orange-500/50",
    glow: "shadow-[0_0_18px_rgba(249,115,22,0.35)]",
    lore: "Charged · Stackable",
  },
  {
    code: "void-compass",
    name: "Smart Swap",
    epithet: "FRESH TARGETS",
    desc: "Not feeling today's goals? Draw a fresh set of dailies matched to your records.",
    effect: "Reroll today's unclaimed dailies",
    kind: "charged",
    cost: 40,
    maxCharges: 3,
    glyph: "◆",
    accent: "text-fuchsia-300",
    border: "border-fuchsia-500/50",
    glow: "shadow-[0_0_18px_rgba(217,70,239,0.35)]",
    lore: "Charged · Stackable",
  },
  {
    code: "mirror-of-ascension",
    name: "Cycle Keepsake",
    epithet: "CREDITS INTO GROWTH",
    desc: "Trade credits for progress — spend it to gain two free attribute points instantly.",
    effect: "Instantly gain +2 attribute points",
    kind: "instant",
    cost: 200,
    maxCharges: 1,
    glyph: "◎",
    accent: "text-teal-300",
    border: "border-teal-400/50",
    glow: "shadow-[0_0_18px_rgba(45,212,191,0.35)]",
    lore: "Instant · Single use",
  },
]

export function relicByCode(code: string): RelicDef | undefined {
  return RELICS.find((r) => r.code === code)
}

// ─── XP multiplier resolution ─────────────────────────────────────────────────

export type RelicMults = {
  all: number
  strength: number
  cardio: number
  mobility: number // also applied to bodyweight
}

export function resolveRelicMults(ownedCodes: Set<string>): RelicMults {
  return {
    all: ownedCodes.has("ember-of-zeal") ? 1.1 : 1,
    strength: ownedCodes.has("sigil-of-titan") ? 1.15 : 1,
    cardio: ownedCodes.has("lens-of-gales") ? 1.15 : 1,
    mobility: ownedCodes.has("prism-of-flow") ? 1.12 : 1,
  }
}

/** Multiplier for a single exercise log by type (per-type + prism applies to bodyweight too). */
export function relicMultForType(type: string, m: RelicMults): number {
  switch (type) {
    case "strength":
      return m.strength
    case "cardio":
      return m.cardio
    case "mobility":
      return m.mobility
    case "bodyweight":
      return m.mobility
    default:
      return 1
  }
}

// ─── Essence economy ──────────────────────────────────────────────────────────

/** Aether essence granted when a gate is cleared. */
export function essenceForGateClear(sessionXp: number, streak: number, prCount: number): number {
  const base = Math.floor(sessionXp / 8)
  const streakBonus = Math.min(streak * 2, 20)
  const prBonus = prCount * 15
  return base + streakBonus + prBonus
}

/** Aether essence granted when a directive is claimed. */
export function essenceForQuest(kind: "daily" | "main"): number {
  return kind === "main" ? 15 : 5
}

// ─── Personal records ─────────────────────────────────────────────────────────

export type PrMetric = { value: number; unit: string; label: string }

/** The headline metric an exercise's personal record is measured by. */
export function prMetricFor(
  type: string,
  sets: number,
  reps: number,
  weightKg: number,
  durationMin: number
): PrMetric {
  switch (type) {
    case "strength":
      return { value: weightKg, unit: "kg", label: "heaviest set" }
    case "bodyweight":
      return { value: sets * reps, unit: "reps", label: "total reps" }
    case "cardio":
      return { value: durationMin, unit: "min", label: "longest bout" }
    case "mobility":
      return { value: durationMin, unit: "min", label: "longest flow" }
    default:
      return { value: 0, unit: "", label: "" }
  }
}

/** Bonus XP baked into a log when it sets a new record (25% of base). */
export function prBonusXp(baseXp: number): number {
  return Math.max(2, Math.round(baseXp * 0.25))
}

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}
