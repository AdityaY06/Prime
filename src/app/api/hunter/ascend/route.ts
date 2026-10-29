import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ARCHETYPES } from "@/lib/game"
import { checkAchievements, hunterDTO, requireHunter } from "@/lib/engine"
import { ASCEND_MIN_LEVEL, ascensionEssenceReward, ascensionXpMult } from "@/lib/ascension"
import type { RewardResult } from "@/lib/types"

export const dynamic = "force-dynamic"

// POST /api/hunter/ascend — the Ascension Protocol (prestige reset).
// Requires LV.30+. Resets level, XP and attributes to the awakening state;
// keeps titles, records, mastery, essence holdings, relics, streak and
// lifetime totals. Grants +1 ascension, a permanent XP multiplier and an
// aether bounty.
export async function POST() {
  try {
    const hunter = await requireHunter()

    if (hunter.level < ASCEND_MIN_LEVEL) {
      return NextResponse.json(
        { error: `The New Cycle requires Level ${ASCEND_MIN_LEVEL}.` },
        { status: 400 }
      )
    }

    const arch = ARCHETYPES.find((a) => a.id === hunter.archetype)
    if (!arch) {
      return NextResponse.json({ error: "Corrupted profile — cannot restart." }, { status: 500 })
    }

    const newAscension = hunter.ascension + 1
    const essenceGain = ascensionEssenceReward(newAscension)

    const updated = await db.hunter.update({
      where: { id: hunter.id },
      data: {
        level: 1,
        xp: 0,
        statPoints: 0,
        str: arch.stats.str,
        vit: arch.stats.vit,
        endur: arch.stats.endur,
        agi: arch.stats.agi,
        flex: arch.stats.flex,
        ascension: newAscension,
        essence: { increment: essenceGain },
      },
    })

    const unlockedTitles = await checkAchievements(hunter.id)

    const reward: RewardResult = {
      xpGained: 0,
      levelUps: 0,
      newLevel: 1,
      rankUp: false,
      newRank: null,
      statPointsGained: 0,
      unlockedTitles,
      hunter: hunterDTO(updated),
      essenceGained: essenceGain,
      ascended: {
        count: newAscension,
        xpMultiplier: ascensionXpMult(newAscension),
        essenceGained: essenceGain,
      },
    }

    return NextResponse.json({ hunter: hunterDTO(updated), reward })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/hunter/ascend", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
