// ─── ASCENDANT · The Ascension Protocol (prestige cycles) ─────────────────────
//
// At the height of B-rank the System offers a choice: cling to the level you
// have earned, or shed it. Ascension resets level, XP and attributes to the
// awakening state — but every completed cycle permanently sharpens all future
// growth (+15% XP per cycle) and marks the hunter with an eternal sigil.
// Titles, records, mastery, essence, relics and lifetime totals survive.

/** Level required to begin an ascension. */
export const ASCEND_MIN_LEVEL = 30

/** Permanent XP multiplier gained per completed ascension cycle (0.15 = +15%). */
export const ASCEND_XP_BONUS_PER = 0.15

/** Aether essence paid per ascension: 100 × the cycle number being entered. */
export function ascensionEssenceReward(newAscension: number): number {
  return 100 * newAscension
}

/** Effective global XP multiplier for a hunter with `n` completed cycles. */
export function ascensionXpMult(n: number): number {
  return 1 + n * ASCEND_XP_BONUS_PER
}

/** Formatted multiplier label, e.g. "×1.15" — never shows "×1.00" noise. */
export function ascensionMultLabel(n: number): string {
  return `×${ascensionXpMult(n).toFixed(2).replace(/0$/, "")}`
}

// ─── Ascension title track ────────────────────────────────────────────────────

export const ASCENSION_TITLES: { count: number; code: string }[] = [
  { count: 1, code: "asc-1" },
  { count: 2, code: "asc-2" },
  { count: 3, code: "asc-3" },
  { count: 5, code: "asc-5" },
  { count: 10, code: "asc-10" },
]

/** Title codes earned for having completed `n` ascension cycles. */
export function earnedAscensionTitleCodes(n: number): string[] {
  return ASCENSION_TITLES.filter((t) => n >= t.count).map((t) => t.code)
}

/** The next ascension title and how many cycles it needs (null at track end). */
export function nextAscensionTitle(n: number): { count: number; code: string } | null {
  return ASCENSION_TITLES.find((t) => t.count > n) ?? null
}
