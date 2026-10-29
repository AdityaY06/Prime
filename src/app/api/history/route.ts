import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKey } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import type { HistoryDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/history — XP ledger by day (last 14 days) + recent cleared raids
export async function GET() {
  try {
    const hunter = await requireHunter()

    // Build a 14-day window
    const days: { day: string; xp: number }[] = []
    const byDay = new Map<string, number>()
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push({ day: dayKey(d), xp: 0 })
    }
    const minDay = days[0].day

    const events = await db.xpEvent.findMany({
      where: { hunterId: hunter.id, day: { gte: minDay } },
      select: { day: true, amount: true },
    })
    for (const ev of events) byDay.set(ev.day, (byDay.get(ev.day) ?? 0) + ev.amount)
    for (const d of days) d.xp = byDay.get(d.day) ?? 0

    const sessions = await db.workoutSession.findMany({
      where: { hunterId: hunter.id, status: "cleared" },
      orderBy: { startedAt: "desc" },
      take: 15,
      include: { logs: { select: { id: true } } },
    })

    const dto: HistoryDTO = {
      daily: days,
      recentSessions: sessions.map((s) => ({
        id: s.id,
        gateName: s.gateName,
        gateId: s.gateId,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
        xpEarned: s.xpEarned,
        durationMin: s.durationMin,
        volumeKg: Math.round(s.volumeKg),
        logCount: s.logs.length,
      })),
      totalVolumeKg: Math.round(hunter.totalVolumeKg),
      totalMinutes: hunter.totalMinutes,
      totalSessions: hunter.totalSessions,
    }

    return NextResponse.json(dto)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/history", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
