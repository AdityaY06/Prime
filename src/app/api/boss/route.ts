import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { tzDayWindow, weekStartKeyIn } from "@/lib/game"
import {
  BOSS_XP_REWARD_RATIO,
  bossHpForLevel,
  bossOfTheWeek,
  enrageFor,
  gateNameOf,
  type BossDTO,
} from "@/lib/bosses"

export const dynamic = "force-dynamic"

// GET /api/boss — the weekly world-boss hunt state: who spawned, its HP at the
// hunter's level, the best damage dealt in its gate this week, and the kill
// tally. Read-only — kills are recorded when a qualifying raid is completed.
export async function GET() {
  try {
    const hunter = await requireHunter()
    // R38 — the boss week rolls with the hunter's timezone (Monday midnight
    // in their zone; null tz = legacy UTC Monday).
    const weekStart = weekStartKeyIn(hunter.timezone)
    const weekStartInstant = tzDayWindow(weekStart, hunter.timezone).start
    const boss = bossOfTheWeek(weekStart)

    const [defeat, raids, totalDefeats, bossKills] = await Promise.all([
      db.bossDefeat.findUnique({ where: { hunterId_weekStart: { hunterId: hunter.id, weekStart } } }),
      db.workoutSession.findMany({
        where: {
          hunterId: hunter.id,
          status: "cleared",
          gateId: boss.gateId,
          startedAt: { gte: weekStartInstant },
        },
        select: { xpEarned: true },
      }),
      db.bossDefeat.count({ where: { hunterId: hunter.id } }),
      // enrage fuel: lifetime kills of THIS boss (its rage, not the herd's)
      db.bossDefeat.count({ where: { hunterId: hunter.id, bossCode: boss.code } }),
    ])

    const enrage = enrageFor(bossKills)
    const hp = bossHpForLevel(hunter.level, bossKills)
    const damage = raids.reduce((max, r) => Math.max(max, r.xpEarned), 0)

    const dto: BossDTO = {
      code: boss.code,
      name: boss.name,
      epithet: boss.epithet,
      threat: boss.threat,
      glyph: boss.glyph,
      gateId: boss.gateId,
      gateName: gateNameOf(boss.gateId),
      hp,
      damage,
      defeated: !!defeat,
      defeatedAt: defeat?.defeatedAt.toISOString() ?? null,
      xpReward: Math.round(hp * BOSS_XP_REWARD_RATIO),
      essenceReward: enrage.essence,
      totalDefeats,
      weekStart,
      enrage: { tier: enrage.tier, label: enrage.label, kills: enrage.kills, hpMult: enrage.hpMult },
    }

    return NextResponse.json(dto)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/boss", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
