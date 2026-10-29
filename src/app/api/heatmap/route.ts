import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKey } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import type { HeatmapDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

// ─── /api/heatmap — lifetime daily-XP calendar ───────────────────────────────
// A 26-ISO-week window of daily XP totals (zero-filled), feeding the Records
// tab calendar grid. Read-only — the XpEvent ledger already holds every grant.

const WEEKS = 26

/** Monday (ISO week start) of the given date, local time. */
function mondayOf(d: Date): Date {
  const c = new Date(d)
  const dow = (c.getDay() + 6) % 7 // Monday=0 … Sunday=6
  c.setDate(c.getDate() - dow)
  c.setHours(0, 0, 0, 0)
  return c
}

export async function GET() {
  try {
    const hunter = await requireHunter()

    // window: 26 Monday-based weeks ending with the current one
    const first = mondayOf(new Date())
    first.setDate(first.getDate() - 7 * (WEEKS - 1))
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const events = await db.xpEvent.findMany({
      where: { hunterId: hunter.id, day: { gte: dayKey(first) } },
      select: { day: true, amount: true },
    })

    const byDay = new Map<string, number>()
    for (const ev of events) byDay.set(ev.day, (byDay.get(ev.day) ?? 0) + ev.amount)

    // zero-filled day series first..today
    const days: { day: string; xp: number }[] = []
    const cursor = new Date(first)
    while (cursor <= today) {
      const key = dayKey(cursor)
      days.push({ day: key, xp: byDay.get(key) ?? 0 })
      cursor.setDate(cursor.getDate() + 1)
    }

    let bestDay: HeatmapDTO["bestDay"] = null
    let activeDays = 0
    let windowXp = 0
    for (const d of days) {
      if (d.xp > 0) {
        activeDays += 1
        windowXp += d.xp
        if (!bestDay || d.xp > bestDay.xp) bestDay = { day: d.day, xp: d.xp }
      }
    }

    // display streak — consecutive active days ending today; if today is still
    // untrained, the chain is counted up to yesterday (grace until midnight)
    let streakDays = 0
    const walk = new Date(today)
    if ((byDay.get(dayKey(walk)) ?? 0) === 0) walk.setDate(walk.getDate() - 1)
    while ((byDay.get(dayKey(walk)) ?? 0) > 0) {
      streakDays += 1
      walk.setDate(walk.getDate() - 1)
    }

    const dto: HeatmapDTO = {
      firstDay: dayKey(first),
      today: dayKey(today),
      days,
      bestDay,
      activeDays,
      totalDays: days.length,
      windowXp,
      streakDays,
    }
    return NextResponse.json(dto)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/heatmap", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
