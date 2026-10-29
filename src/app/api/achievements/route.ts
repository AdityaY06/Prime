import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { checkAchievements, requireHunter } from "@/lib/engine"
import { TITLES, TIER_STYLES } from "@/lib/titles"

export const dynamic = "force-dynamic"

// GET /api/achievements — full title catalog + unlocked state
export async function GET() {
  try {
    const hunter = await requireHunter()
    // recompute on read so computed titles (gate mastery) unlock retroactively
    await checkAchievements(hunter.id)
    const owned = await db.achievement.findMany({
      where: { hunterId: hunter.id },
      select: { code: true, unlockedAt: true },
    })
    const ownedMap = new Map(owned.map((a) => [a.code, a.unlockedAt]))

    const titles = TITLES.map((t) => ({
      code: t.code,
      title: t.title,
      epithet: t.epithet,
      desc: t.desc,
      tier: t.tier,
      tierLabel: TIER_STYLES[t.tier].label,
      unlocked: ownedMap.has(t.code),
      unlockedAt: ownedMap.get(t.code)?.toISOString() ?? null,
      equipped: hunter.equippedTitle === t.code,
    }))

    return NextResponse.json({ titles, equipped: hunter.equippedTitle })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/achievements", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
