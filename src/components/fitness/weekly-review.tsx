"use client"

import { Flame, TrendingDown, TrendingUp } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { useApi } from "@/hooks/use-api"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

type WeeklyReviewRes = {
  weekStart: string
  xpEarned: number
  sessionsCleared: number
  programDays: { done: number; planned: number | null }
  readinessAvg: number | null
  readinessDays: number
  bestE1rmDeltas: { name: string; delta: number }[]
  topGate: { name: string; count: number } | null
  streakNow: number
}

/** Readiness score → band color (health.ts band thresholds, 85/70/50). */
function readinessColor(avg: number): string {
  if (avg >= 85) return "text-emerald-300"
  if (avg >= 70) return "text-teal-300"
  if (avg >= 50) return "text-amber-300"
  return "text-rose-300"
}

/** Compact stat tile — mono label over a big tabular number. */
function Tile({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className="min-w-0 bg-zinc-950/60 p-3.5 transition-colors hover:bg-zinc-900/50">
      <p className="truncate font-mono text-[8px] font-bold tracking-[0.3em] text-zinc-600">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-bold tabular-nums leading-tight", color)}>{value}</p>
      {sub && <p className="mt-0.5 truncate font-mono text-[9px] tabular-nums tracking-wider text-zinc-600">{sub}</p>}
    </div>
  )
}

/** e1RM delta chip — "BENCH +2.5 KG" emerald up / rose down. */
function E1rmChip({ name, delta }: { name: string; delta: number }) {
  const up = delta >= 0
  const short = name.trim().split(/\s+/)[0] ?? name
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[10px] font-bold tabular-nums tracking-[0.15em]",
        up
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-rose-500/40 bg-rose-500/10 text-rose-300"
      )}
      title={`${name} — best e1RM this week vs best before: ${up ? "+" : ""}${delta} kg`}
    >
      {up ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
      {short.toUpperCase()} {up ? "+" : "−"}
      {Math.abs(delta)} KG
    </span>
  )
}

/** THIS WEEK · REVIEW — live week-to-date dashboard strip (STATUS tab). */
export function WeeklyReview({ hunter }: { hunter: HunterDTO }) {
  const { data, loading } = useApi<WeeklyReviewRes>("/api/weekly-review")

  if (loading && !data) {
    return <SkeletonPanel label="SYNCING WEEKLY REVIEW" rows={2} />
  }
  if (!data) return null

  const programValue =
    data.programDays.planned === null ? `${data.programDays.done}/—` : `${data.programDays.done}/${data.programDays.planned}`

  return (
    <SystemPanel
      label="This Week · Review"
      labelAccent={
        <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-500">
          SINCE MON {data.weekStart.slice(5).replace("-", "/")}
        </span>
      }
    >
      <div className="space-y-3.5 p-4 sm:p-5">
        {/* four headline tiles — mobile 2×2, desktop 1×4 */}
        <div
          className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-zinc-800/70 bg-zinc-800/70 sm:grid-cols-4"
          role="list"
          aria-label="This week's totals"
        >
          <div role="listitem">
            <Tile label="XP EARNED" value={`+${data.xpEarned.toLocaleString()}`} color="text-violet-300" sub="ALL SOURCES" />
          </div>
          <div role="listitem">
            <Tile label="SESSIONS" value={String(data.sessionsCleared)} color="text-teal-300" sub="CLEARED" />
          </div>
          <div role="listitem">
            <Tile
              label="PROGRAM DAYS"
              value={programValue}
              color="text-fuchsia-300"
              sub={data.programDays.planned === null ? "NO ACTIVE PLAN" : "OF PLAN"}
            />
          </div>
          <div role="listitem">
            <Tile
              label="READINESS AVG"
              value={data.readinessAvg === null ? "—" : String(data.readinessAvg)}
              color={data.readinessAvg === null ? "text-zinc-500" : readinessColor(data.readinessAvg)}
              sub={data.readinessAvg === null ? "NO VITALS LOGGED" : `${data.readinessDays}D LOGGED`}
            />
          </div>
        </div>

        {/* e1RM deltas — best loaded lift this week vs best before */}
        {data.bestE1rmDeltas.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[8px] font-bold tracking-[0.3em] text-zinc-600">E1RM DELTAS</span>
            {data.bestE1rmDeltas.map((d) => (
              <E1rmChip key={d.name} name={d.name} delta={d.delta} />
            ))}
          </div>
        ) : (
          <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-700">
            NO LOADED LIFTS THIS WEEK — LOG BARBELL WORK TO TRACK E1RM DELTAS
          </p>
        )}

        {/* footer line — top gate + live streak */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-zinc-800/60 pt-3">
          <p className="min-w-0 truncate font-mono text-[10px] tabular-nums tracking-[0.2em] text-zinc-500">
            {data.topGate ? (
              <>
                TOP GATE · <span className="text-violet-300">{data.topGate.name.toUpperCase()}</span> ×{data.topGate.count}
              </>
            ) : (
              "NO SESSIONS CLEARED THIS WEEK YET"
            )}
          </p>
          <p className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-[0.2em] text-amber-300/90">
            <Flame className="h-3 w-3 text-amber-400" aria-hidden />
            STREAK <span className="text-amber-200">{Math.max(data.streakNow, hunter.streak)}D</span>
          </p>
        </div>
      </div>
    </SystemPanel>
  )
}
