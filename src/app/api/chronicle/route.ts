import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKey } from "@/lib/game"
import { GATE_SHORT } from "@/lib/gates"
import { requireHunter } from "@/lib/engine"
import type { ChronicleDTO, ChronicleDaySession, ChronicleWindow } from "@/lib/types"

export const dynamic = "force-dynamic"

// ─── /api/chronicle — 7-day cycle analytics ──────────────────────────────────
// Compares the current 7-day cycle (days 0–6 ago) against the previous one
// (days 7–13 ago): XP, raids, volume, minutes, PRs + daily series + best day.

function dayOffsetAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dayKey(d)
}

function emptyWindow(): ChronicleWindow {
  return { xp: 0, sessions: 0, volumeKg: 0, minutes: 0, prs: 0 }
}

export async function GET() {
  try {
    const hunter = await requireHunter()

    // rolling windows: this week = [today-6, today], prev week = [today-13, today-7]
    const thisStart = dayOffsetAgo(6)
    const prevStart = dayOffsetAgo(13)
    const prevEnd = dayOffsetAgo(7)

    const [events, sessions] = await Promise.all([
      db.xpEvent.findMany({
        where: { hunterId: hunter.id, day: { gte: prevStart } },
        select: { day: true, amount: true },
      }),
      db.workoutSession.findMany({
        where: {
          hunterId: hunter.id,
          status: "cleared",
          startedAt: { gte: new Date(`${prevStart}T00:00:00`) },
        },
        select: { id: true, startedAt: true, xpEarned: true, volumeKg: true, durationMin: true, prCount: true, gateId: true, gateName: true },
      }),
    ])

    const thisWeek = emptyWindow()
    const prevWeek = emptyWindow()

    for (const ev of events) {
      if (ev.day >= prevEnd) thisWeek.xp += ev.amount
      else prevWeek.xp += ev.amount
    }

    // daily series for the current cycle
    const dailyMap = new Map<string, { xp: number; sessions: number }>()
    for (let i = 6; i >= 0; i--) dailyMap.set(dayOffsetAgo(i), { xp: 0, sessions: 0 })
    for (const ev of events) {
      const slot = dailyMap.get(ev.day)
      if (slot) slot.xp += ev.amount
    }

    // day-by-day compliance rows: one per day of the current cycle (oldest→newest)
    // + the matching weekdays one cycle back for the weekday-compare strip
    // (prevDaily[i].day is exactly perDay[i].day shifted 7 days back)
    const perDayMap = new Map<
      string,
      { xp: number; sessions: number; volumeKg: number; minutes: number; prs: number; gateShorts: string[] }
    >()
    const prevDailyMap = new Map<string, { xp: number; sessions: number }>()
    for (let i = 6; i >= 0; i--) {
      perDayMap.set(dayOffsetAgo(i), { xp: 0, sessions: 0, volumeKg: 0, minutes: 0, prs: 0, gateShorts: [] })
      prevDailyMap.set(dayOffsetAgo(i + 7), { xp: 0, sessions: 0 })
    }
    for (const ev of events) {
      const row = perDayMap.get(ev.day)
      if (row) row.xp += ev.amount
      else {
        const prevRow = prevDailyMap.get(ev.day)
        if (prevRow) prevRow.xp += ev.amount
      }
    }

    for (const s of sessions) {
      const d = dayKey(s.startedAt)
      const inThis = d >= prevEnd
      const w = inThis ? thisWeek : prevWeek
      w.sessions += 1
      w.volumeKg += s.volumeKg
      w.minutes += s.durationMin
      w.prs += s.prCount
      const slot = dailyMap.get(d)
      if (slot) slot.sessions += 1
      const row = perDayMap.get(d)
      if (row) {
        row.sessions += 1
        row.volumeKg += s.volumeKg
        row.minutes += s.durationMin
        row.prs += s.prCount
        const short = GATE_SHORT[s.gateId] ?? s.gateId.slice(0, 6).toUpperCase()
        if (!row.gateShorts.includes(short)) row.gateShorts.push(short)
      } else {
        const prevRow = prevDailyMap.get(d)
        if (prevRow) prevRow.sessions += 1
      }
    }

    thisWeek.volumeKg = Math.round(thisWeek.volumeKg)
    prevWeek.volumeKg = Math.round(prevWeek.volumeKg)

    const daily = Array.from(dailyMap.entries()).map(([day, v]) => ({ day, ...v }))
    const perDay = Array.from(perDayMap.entries()).map(([day, v]) => ({
      day,
      xp: v.xp,
      sessions: v.sessions,
      volumeKg: Math.round(v.volumeKg),
      minutes: v.minutes,
      prs: v.prs,
      // alphabetical keeps the chip cluster deterministic across queries
      gateShorts: [...v.gateShorts].sort(),
    }))
    const prevDaily = Array.from(prevDailyMap.entries()).map(([day, v]) => ({ day, ...v }))
    let bestDay: ChronicleDTO["bestDay"] = null
    for (const d of daily) {
      if (d.xp > 0 && (!bestDay || d.xp > bestDay.xp)) bestDay = { day: d.day, xp: d.xp }
    }
    const activeDays = daily.filter((d) => d.xp > 0).length

    // per-gate XP + raid counts for the current cycle (radar source)
    const gateMap = new Map<string, { gateName: string; xp: number; sessions: number }>()
    for (const s of sessions) {
      const d = dayKey(s.startedAt)
      if (d < prevEnd) continue // current cycle only
      const g = gateMap.get(s.gateId) ?? { gateName: s.gateName, xp: 0, sessions: 0 }
      g.xp += s.xpEarned
      g.sessions += 1
      gateMap.set(s.gateId, g)
    }
    const perGate = Array.from(gateMap.entries()).map(([gateId, g]) => ({
      gateId,
      gateName: g.gateName,
      short: GATE_SHORT[gateId] ?? gateId.slice(0, 6).toUpperCase(),
      xp: g.xp,
      sessions: g.sessions,
    }))

    // day drill-through source: every cleared raid in the 14-day window,
    // grouped by its local day key (same dayKey convention as the series above).
    const sessionsByDay: Record<string, ChronicleDaySession[]> = {}
    for (const s of sessions) {
      const d = dayKey(s.startedAt)
      ;(sessionsByDay[d] ??= []).push({
        id: s.id,
        gateName: s.gateName,
        xpEarned: s.xpEarned,
        volumeKg: Math.round(s.volumeKg),
        durationMin: s.durationMin,
        prCount: s.prCount,
        startedAt: s.startedAt.toISOString(),
      })
    }
    for (const list of Object.values(sessionsByDay)) {
      list.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    }

    const dto: ChronicleDTO = { thisWeek, prevWeek, daily, bestDay, activeDays, perGate, perDay, prevDaily, sessionsByDay }
    return NextResponse.json(dto)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/chronicle", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
