"use client"

import { useMemo } from "react"
import { ArrowDown, ArrowLeftRight, ArrowUp, Minus } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { useApi } from "@/hooks/use-api"
import { formatDayLabel } from "@/lib/game"
import { cn } from "@/lib/utils"

// ─── PRIME · Week Compare — THIS WEEK vs LAST WEEK on the PROGRESS tab ────────
//
// Side-by-side columns for SESSIONS / XP EARNED / TOTAL VOLUME / AVG READINESS
// with emerald ▲ / rose ▼ / zinc − delta chips between them and a one-line
// verdict. Every number comes from GET /api/weekly-review (current week at the
// top level, previous ISO week under `lastWeek`); null readiness stays an
// honest "—" rather than a fake zero.

type WeekStats = {
  weekStart: string
  xpEarned: number
  sessionsCleared: number
  volumeKg: number
  readinessAvg: number | null
  readinessDays: number
}

type WeeklyReviewRes = WeekStats & { lastWeek: WeekStats }

type DeltaDir = "up" | "down" | "flat"

/** Signed number with the project's typographic minus — "+38" / "−12" / "±0". */
function fmtSigned(v: number, dec = 0): string {
  const mag = dec > 0 ? Math.abs(v).toFixed(dec) : String(Math.round(Math.abs(v)))
  return v > 0 ? `+${mag}` : v < 0 ? `−${mag}` : dec > 0 ? "±0.0" : "±0"
}

/** Volume stays readable at any scale — "540 KG" below a tonne, "15.0 T" above. */
function fmtVol(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)} T` : `${Math.round(v)} KG`
}

/** The delta chip — emerald ▲ up, rose ▼ down, zinc − flat (title carries detail). */
function DeltaChip({ dir, label, title }: { dir: DeltaDir; label: string; title: string }) {
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus
  return (
    <span
      title={title}
      className={cn(
        "inline-flex min-w-[3.25rem] items-center justify-center gap-0.5 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums tracking-wider",
        dir === "up" && "border-amber-400/50 bg-amber-500/10 text-amber-300",
        dir === "down" && "border-rose-400/50 bg-rose-500/10 text-rose-300",
        dir === "flat" && "border-zinc-700/60 bg-zinc-900/60 text-zinc-500"
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}

/** One comparison line — label, this-week value, delta chip, last-week value. */
function StatRow({
  label,
  thisVal,
  chip,
  lastVal,
  thisDim = false,
  lastDim = false,
}: {
  label: string
  thisVal: string
  chip: React.ReactNode
  lastVal: string
  thisDim?: boolean
  lastDim?: boolean
}) {
  return (
    <div className="grid grid-cols-[minmax(4rem,1fr)_minmax(0,1.1fr)_auto_minmax(0,1.1fr)] items-center gap-2">
      <p className="truncate font-mono text-[9px] font-bold tracking-[0.18em] text-zinc-500">{label}</p>
      <p
        className={cn(
          "truncate text-right font-mono text-sm font-bold tabular-nums",
          thisDim ? "text-zinc-700" : "text-violet-100"
        )}
      >
        {thisVal}
      </p>
      <div className="justify-self-center">{chip}</div>
      <p
        className={cn(
          "truncate font-mono text-sm font-bold tabular-nums",
          lastDim ? "text-zinc-700" : "text-zinc-500"
        )}
      >
        {lastVal}
      </p>
    </div>
  )
}

/** THIS WEEK vs LAST WEEK — mounted on the PROGRESS tab above load progression. */
export function WeekCompare() {
  const { data, loading, error } = useApi<WeeklyReviewRes>("/api/weekly-review")

  const rows = useMemo(() => {
    if (!data) return null
    const cur = data
    const prev = data.lastWeek

    const sessionsDelta = cur.sessionsCleared - prev.sessionsCleared
    const xpDelta = cur.xpEarned - prev.xpEarned
    const volDelta = cur.volumeKg - prev.volumeKg
    const readyDelta =
      cur.readinessAvg !== null && prev.readinessAvg !== null
        ? Math.round((cur.readinessAvg - prev.readinessAvg) * 10) / 10
        : null

    // volume % only when a baseline exists; a first non-zero week is "NEW"
    const volPct = prev.volumeKg > 0 ? Math.round((volDelta / prev.volumeKg) * 100) : null

    return {
      sessions: {
        thisVal: String(cur.sessionsCleared),
        lastVal: String(prev.sessionsCleared),
        dir: (sessionsDelta > 0 ? "up" : sessionsDelta < 0 ? "down" : "flat") as DeltaDir,
        label: fmtSigned(sessionsDelta),
        title: `${fmtSigned(sessionsDelta)} sessions vs last week`,
      },
      xp: {
        thisVal: cur.xpEarned.toLocaleString(),
        lastVal: prev.xpEarned.toLocaleString(),
        dir: (xpDelta > 0 ? "up" : xpDelta < 0 ? "down" : "flat") as DeltaDir,
        label: fmtSigned(xpDelta),
        title: `${fmtSigned(xpDelta)} XP vs last week`,
      },
      volume: {
        thisVal: fmtVol(cur.volumeKg),
        lastVal: fmtVol(prev.volumeKg),
        dir: (volDelta > 0 ? "up" : volDelta < 0 ? "down" : "flat") as DeltaDir,
        label:
          volPct !== null
            ? fmtSigned(volPct)
            : cur.volumeKg > 0
              ? "NEW"
              : "±0",
        title: `${fmtSigned(Math.round(volDelta))} kg vs last week`,
      },
      readiness: {
        thisVal: cur.readinessAvg !== null ? cur.readinessAvg.toFixed(1) : "—",
        lastVal: prev.readinessAvg !== null ? prev.readinessAvg.toFixed(1) : "—",
        dir: (readyDelta !== null && readyDelta !== 0 ? (readyDelta > 0 ? "up" : "down") : "flat") as DeltaDir,
        label: readyDelta !== null ? fmtSigned(readyDelta, 1) : "—",
        title:
          readyDelta !== null
            ? `${fmtSigned(readyDelta, 1)} readiness vs last week`
            : "not enough vitals for a readiness comparison",
        thisDim: cur.readinessAvg === null,
        lastDim: prev.readinessAvg === null,
      },
    }
  }, [data])

  /** One-line verdict — outpacing / recovery / easing / steady, honest when there is no baseline. */
  const verdict = useMemo(() => {
    if (!data) return null
    const cur = data
    const prev = data.lastWeek
    const lastEmpty = prev.sessionsCleared === 0 && prev.xpEarned === 0
    if (lastEmpty) return { tone: "zinc" as const, text: "FIRST TRACKED WEEK — NO LAST-WEEK BASELINE" }

    const xpDelta = cur.xpEarned - prev.xpEarned
    const xpPct = prev.xpEarned > 0 ? Math.round((xpDelta / prev.xpEarned) * 100) : null
    const volPct = prev.volumeKg > 0 ? Math.round(((cur.volumeKg - prev.volumeKg) / prev.volumeKg) * 100) : null

    if (xpDelta > 0) {
      return {
        tone: "emerald" as const,
        text: `OUTPACING LAST WEEK · +${xpPct !== null ? `${xpPct}%` : `${xpDelta}`} XP`,
      }
    }
    if (volPct !== null && volPct < 0) {
      return { tone: "amber" as const, text: `RECOVERY WEEK — DOWN ${Math.abs(volPct)}% VOLUME` }
    }
    if (xpPct !== null && xpPct < 0) {
      return { tone: "amber" as const, text: `EASING OFF — DOWN ${Math.abs(xpPct)}% XP` }
    }
    return { tone: "zinc" as const, text: "MATCHING LAST WEEK — STEADY PACE" }
  }, [data])

  if (loading && !data) {
    return <SkeletonPanel label="SYNCING WEEK COMPARE" rows={2} />
  }

  if (error && !data) {
    return (
      <SystemPanel label="Week Compare">
        <p className="px-4 py-6 text-center font-mono text-[10px] tracking-[0.2em] text-rose-300/80" role="alert">
          WEEK REVIEW SYNC FAILED — {error.toUpperCase()}
        </p>
      </SystemPanel>
    )
  }

  if (!data || !rows) {
    return null
  }

  return (
    <SystemPanel
      label="Week Compare"
      labelAccent={
        <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-widest text-zinc-500">
          <ArrowLeftRight className="h-3 w-3 text-violet-400/70" aria-hidden />
          {formatDayLabel(data.weekStart).toUpperCase()} VS {formatDayLabel(data.lastWeek.weekStart).toUpperCase()}
        </span>
      }
    >
      <div className="space-y-2.5 px-4 py-4 sm:px-5">
        {/* column headers */}
        <div className="grid grid-cols-[minmax(4rem,1fr)_minmax(0,1.1fr)_auto_minmax(0,1.1fr)] items-center gap-2">
          <span aria-hidden />
          <p className="truncate text-right font-mono text-[9px] font-bold tracking-[0.18em] text-violet-300/80">
            THIS WEEK
          </p>
          <span aria-hidden />
          <p className="truncate font-mono text-[9px] font-bold tracking-[0.18em] text-zinc-600">LAST WEEK</p>
        </div>

        <StatRow
          label="SESSIONS"
          thisVal={rows.sessions.thisVal}
          lastVal={rows.sessions.lastVal}
          chip={<DeltaChip dir={rows.sessions.dir} label={rows.sessions.label} title={rows.sessions.title} />}
        />
        <StatRow
          label="XP EARNED"
          thisVal={rows.xp.thisVal}
          lastVal={rows.xp.lastVal}
          chip={<DeltaChip dir={rows.xp.dir} label={rows.xp.label} title={rows.xp.title} />}
        />
        <StatRow
          label="TOTAL VOLUME"
          thisVal={rows.volume.thisVal}
          lastVal={rows.volume.lastVal}
          chip={<DeltaChip dir={rows.volume.dir} label={rows.volume.label} title={rows.volume.title} />}
        />
        <StatRow
          label="AVG READINESS"
          thisVal={rows.readiness.thisVal}
          lastVal={rows.readiness.lastVal}
          thisDim={rows.readiness.thisDim}
          lastDim={rows.readiness.lastDim}
          chip={<DeltaChip dir={rows.readiness.dir} label={rows.readiness.label} title={rows.readiness.title} />}
        />

        {/* verdict */}
        {verdict && (
          <p
            aria-live="polite"
            className={cn(
              "mt-1 rounded-sm border px-3 py-2 text-center font-mono text-[9px] font-bold tracking-[0.18em]",
              verdict.tone === "emerald" && "border-amber-400/40 bg-amber-500/10 text-amber-300",
              verdict.tone === "amber" && "border-amber-400/40 bg-amber-500/10 text-amber-300",
              verdict.tone === "zinc" && "border-zinc-700/60 bg-zinc-900/50 text-zinc-400"
            )}
          >
            {verdict.text}
          </p>
        )}
      </div>
    </SystemPanel>
  )
}
