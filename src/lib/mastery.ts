// ─── ASCENDANT · Gate Mastery — per-gate clear progression ─────────────────────
// Every gate tracks lifetime clears. Clear counts climb five mastery tiers,
// each unlocking a gate-specific title. Pure logic — DB access stays in routes.

import type { HunterDTO } from "./types"
import type { Hunter } from "@prisma/client"

export type MasteryTier = {
  tier: number // 1–5
  label: string
  clears: number // clears required to reach this tier
  title: string // tier label shown in UI
}

/** The five mastery tiers shared by every gate. */
export const MASTERY_TIERS: MasteryTier[] = [
  { tier: 1, label: "REGULAR", clears: 3, title: "I" },
  { tier: 2, label: "COMMITTED", clears: 10, title: "II" },
  { tier: 3, label: "VETERAN", clears: 25, title: "III" },
  { tier: 4, label: "ELITE", clears: 50, title: "IV" },
  { tier: 5, label: "MASTER", clears: 100, title: "V" },
]

/** Per-gate mastery titles unlocked at each tier. */
export const GATE_TITLES: Record<string, { code: string; name: string; epithet: string }[]> = {
  "gale-fields": [
    { code: "mastery-gale-1", name: "Engine Started", epithet: "Your engine is real" },
    { code: "mastery-gale-2", name: "Road Regular", epithet: "The miles know your name" },
    { code: "mastery-gale-3", name: "Pace Setter", epithet: "You run your own pace" },
    { code: "mastery-gale-4", name: "Steady Lungs", epithet: "Breath stays calm at speed" },
    { code: "mastery-gale-5", name: "Endurance Elite", epithet: "Distance is your home turf" },
  ],
  "iron-forge": [
    { code: "mastery-forge-1", name: "Iron Initiate", epithet: "The bar no longer feels strange" },
    { code: "mastery-forge-2", name: "Barbell Regular", epithet: "The rack is part of your week" },
    { code: "mastery-forge-3", name: "Heavy Lifter", epithet: "Big numbers, clean reps" },
    { code: "mastery-forge-4", name: "Strength Specialist", epithet: "The weights answer to you" },
    { code: "mastery-forge-5", name: "Iron Veteran", epithet: "Years of load under the bar" },
  ],
  "titan-trial": [
    { code: "mastery-titan-1", name: "Bodyweight Basics", epithet: "Your own weight, mastered" },
    { code: "mastery-titan-2", name: "Repetition Machine", epithet: "Rep after rep after rep" },
    { code: "mastery-titan-3", name: "Bar Artist", epithet: "The bar is your stage" },
    { code: "mastery-titan-4", name: "Pull-Up Power", epithet: "Gravity works for you now" },
    { code: "mastery-titan-5", name: "Gravity Proof", epithet: "Gravity is a suggestion" },
  ],
  "flow-sanctum": [
    { code: "mastery-flow-1", name: "Stretch Starter", epithet: "The first stretch sticks" },
    { code: "mastery-flow-2", name: "Flow Builder", epithet: "A little mobility every day" },
    { code: "mastery-flow-3", name: "Limber", epithet: "Deep bends, easy breaths" },
    { code: "mastery-flow-4", name: "Mobility Devotee", epithet: "Recovery is part of your training" },
    { code: "mastery-flow-5", name: "Full Range", epithet: "Every joint moves freely" },
  ],
  "colossus-gate": [
    { code: "mastery-colossus-1", name: "Circuit Breaker", epithet: "Full-body circuits, done right" },
    { code: "mastery-colossus-2", name: "Full-Body Regular", epithet: "Mixed sessions are your habit" },
    { code: "mastery-colossus-3", name: "Conditioning Machine", epithet: "All domains at once, mastered" },
    { code: "mastery-colossus-4", name: "Hybrid Athlete", epithet: "Strong, fast and mobile" },
    { code: "mastery-colossus-5", name: "Complete Athlete", epithet: "The whole picture, trained" },
  ],
}

export type GateMasteryView = {
  gateId: string
  clears: number
  tier: number // 0 = unranked
  tierLabel: string // e.g. "ADEPT" or "UNRANKED"
  nextTierAt: number | null
  progressPct: number // 0–100 toward next tier
  titleUnlocked: string | null // highest gate-title name earned
}

/** Compute the mastery view for one gate from its lifetime clears. */
export function masteryForGate(gateId: string, clears: number): GateMasteryView {
  let tier = 0
  for (const t of MASTERY_TIERS) {
    if (clears >= t.clears) tier = t.tier
  }
  const next = MASTERY_TIERS.find((t) => t.tier === tier + 1) ?? null
  const prevClears = tier === 0 ? 0 : (MASTERY_TIERS.find((t) => t.tier === tier)?.clears ?? 0)
  const progressPct = next
    ? Math.round(Math.min(100, ((clears - prevClears) / (next.clears - prevClears)) * 100))
    : 100

  const titles = GATE_TITLES[gateId] ?? []
  const titleUnlocked = tier > 0 && titles[tier - 1] ? titles[tier - 1].name : null

  return {
    gateId,
    clears,
    tier,
    tierLabel: tier === 0 ? "UNRANKED" : (MASTERY_TIERS.find((t) => t.tier === tier)?.label ?? "UNRANKED"),
    nextTierAt: next?.clears ?? null,
    progressPct,
    titleUnlocked,
  }
}

/** All mastery-title codes currently earned by this hunter (for achievement unlock). */
export function earnedMasteryTitleCodes(perGateClears: Record<string, number>): string[] {
  const codes: string[] = []
  for (const [gateId, clears] of Object.entries(perGateClears)) {
    const view = masteryForGate(gateId, clears)
    for (let t = 1; t <= view.tier; t++) {
      const title = (GATE_TITLES[gateId] ?? [])[t - 1]
      if (title) codes.push(title.code)
    }
  }
  return codes
}

/** Small summary line for the STATUS tab hunter card. */
export function masterySummary(perGateClears: Record<string, number>): {
  totalClears: number
  bestGate: { gateId: string; clears: number; tier: number } | null
  sovereignGates: number
} {
  const entries = Object.entries(perGateClears)
  const totalClears = entries.reduce((a, [, c]) => a + c, 0)
  let best: { gateId: string; clears: number; tier: number } | null = null
  let sovereign = 0
  for (const [gateId, clears] of entries) {
    const view = masteryForGate(gateId, clears)
    if (view.tier === 5) sovereign++
    if (!best || clears > best.clears) best = { gateId, clears, tier: view.tier }
  }
  return { totalClears, bestGate: best, sovereignGates: sovereign }
}

// Client-side helper DTO (hunter unchanged — mastery is computed, not stored)
export type MasteryDTO = {
  gates: GateMasteryView[]
  summary: { totalClears: number; bestGate: string | null; sovereignGates: number }
}

export function hunterNameOf(h: Hunter | HunterDTO): string {
  return h.name
}
