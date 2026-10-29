"use client"

// ── PRIME · Vitals shared leaf (R28-b module-boundary refactor) ───────────────
// The small contract surface BOTH the Vitals tab and the Status-tab Vitals
// Snapshot need: /api/metrics + /api/sessions response types, the pure
// date/series helpers they feed, and the ZoneChip / CountNum primitives.
// Previously all of this lived inside vitals-tab.tsx, so status-tab's VALUE
// import of VitalsSnapshot dragged the whole vitals-tab chunk (sensor-hub +
// recharts + lodash) into the STATUS first load — the heaviest non-BODY dep
// tree in the app. This leaf deliberately imports NOTHING from either tab:
// react-free helpers + lucide + system/motion + lib/game + lib/health only,
// so the dependency arrows only ever point downhill (tab → leaf, never
// tab → tab). Single source of truth — thresholds, zones and count-up
// idioms can never drift between the two render sites.

import { AlertTriangle } from "lucide-react"
import { useCountUp } from "@/components/system/motion"
import { dayKey } from "@/lib/game"
import type { Zone, ZoneTone } from "@/lib/health"
import { cn } from "@/lib/utils"

// ── API contract types ────────────────────────────────────────────────────────

export type LatestMetric = { value: number; day: string; unit: string }

export type MetricsRes = {
  profile: {
    heightCm: number | null
    weightKg: number | null
    birthYear: number | null
    sex: string | null
    activityLevel: string | null
    goal: string | null
    isDefault: boolean
  }
  latest: Record<string, LatestMetric | null>
  bmiCategory: string | null
  series: Record<string, { day: string; value: number }[]>
}

export type SessionHistoryItem = {
  id: string
  gateName: string
  status: string
  startedAt: string
  durationMin: number
  volumeKg: number
  logs: { name: string; type: string; sets: number; reps: number; weightKg: number; durationMin: number }[]
}

export type SessionsRes = { active: unknown; history: SessionHistoryItem[] }

// ── Pure date helpers (fuel-tab idioms) ───────────────────────────────────────

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  return dayKey(new Date(y, m - 1, d + delta))
}

/** Monday..Sunday day-keys of the current ISO week. */
export function isoWeekDays(): string[] {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) =>
    dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
  )
}

/** Average of series points whose day lies inside [from, to] (inclusive). */
export function windowAvg(series: { day: string; value: number }[] | undefined, from: number, to: number): number | null {
  if (!series || series.length === 0) return null
  const lo = shiftDay(dayKey(), from)
  const hi = shiftDay(dayKey(), to)
  const pts = series.filter((p) => p.day >= lo && p.day <= hi)
  if (pts.length === 0) return null
  return pts.reduce((acc, p) => acc + p.value, 0) / pts.length
}

/** 7-day average + trend vs the previous 7 days for one metric series. */
export function seriesTrend(series: { day: string; value: number }[] | undefined): {
  avg7: number | null
  prev7: number | null
  delta: number | null
} {
  const avg7 = windowAvg(series, -6, 0)
  const prev7 = windowAvg(series, -13, -7)
  const delta = avg7 !== null && prev7 !== null ? Math.round((avg7 - prev7) * 10) / 10 : null
  return { avg7, prev7, delta }
}

/** Cardio minutes + strength sessions logged this ISO week (cleared sessions). */
export function weekTraining(history: SessionHistoryItem[]): { cardioMin: number; strengthSessions: number } {
  const week = new Set(isoWeekDays())
  let cardioMin = 0
  let strengthSessions = 0
  for (const s of history) {
    if (s.status !== "cleared") continue
    if (!week.has(s.startedAt.slice(0, 10))) continue
    let hasStrength = false
    for (const log of s.logs) {
      if (log.type === "cardio") cardioMin += log.durationMin
      if (log.type === "strength" || log.type === "bodyweight") hasStrength = true
    }
    if (hasStrength) strengthSessions++
  }
  return { cardioMin, strengthSessions }
}

// ── Zone chip ─────────────────────────────────────────────────────────────────

// R43 studio register — "ok" reads as a professional lab NORMAL: ivory text on
// a quiet zinc chip (no hue); watch amber / warn+danger rose carry the alerts.
const TONE_CHIP: Record<ZoneTone, string> = {
  ok: "border-zinc-400/30 bg-zinc-500/10 text-zinc-200",
  watch: "border-amber-400/40 bg-amber-500/10 text-amber-300",
  warn: "border-rose-400/50 bg-rose-500/10 text-rose-300",
  danger: "border-rose-600/70 bg-rose-600/20 text-rose-100 shadow-[0_0_16px_rgba(225,29,72,0.45)]",
}

export function ZoneChip({ zone }: { zone: Zone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em] uppercase",
        TONE_CHIP[zone.tone]
      )}
    >
      {zone.tone === "danger" && <AlertTriangle className="h-3 w-3" aria-hidden />}
      {zone.label}
    </span>
  )
}

// ── R15-b flow helpers ────────────────────────────────────────────────────────

/** Count-up numeral for tile/row primary values — mounts from 0, glides on
 *  live refresh (a check-in commit reloads metrics on camera). `decimals`
 *  keeps the WHtR hundredths honest; default renders integers. */
export function CountNum({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const shown = useCountUp(value, 0.9)
  return <span>{shown.toFixed(decimals)}</span>
}
