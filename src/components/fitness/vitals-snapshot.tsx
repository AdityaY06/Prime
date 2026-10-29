"use client"

// ── PRIME · Vitals snapshot (Status-tab insert) — R28-b extraction ───────────
// Compact Vitals summary for the Status dashboard — self-contained fetches.
// Born inside vitals-tab.tsx (1891 lines) whose chunk graph carries the full
// VITALS surface (sensor-hub + recharts + lodash). status-tab VALUE-imported
// it, so the DEFAULT LANDING TAB dragged that entire tree on first paint.
// Now a leaf: SystemPanel + useApi + store + lib/health zone helpers + the
// vitals-shared primitives — chart-free (tiles only), so STATUS loads without
// recharts, sensor-hub, or vitals-tab itself. Pure module-boundary move —
// the rendered DOM is byte-identical to the vitals-tab-hosted original.

import { useMemo } from "react"
import { ChevronRight } from "lucide-react"

import { SystemPanel } from "@/components/system/system-panel"
import { useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import {
  bpZone,
  healthScore,
  hrZone,
  spo2Zone,
  type ZoneTone,
} from "@/lib/health"
import { cn } from "@/lib/utils"

import { CountNum, seriesTrend, weekTraining, ZoneChip, type MetricsRes, type SessionsRes } from "./vitals-shared"

function SnapshotTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  /** R15-b — value widened to ReactNode so the primary numerals can ride
   *  CountNum (mount count-up, glide on live refresh). */
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: ZoneTone
}) {
  return (
    <div className="min-w-0 rounded-sm border border-zinc-800/70 bg-zinc-950/40 p-3">
      <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-400">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-xl font-bold tabular-nums",
          tone === "ok" ? "text-zinc-200" : tone === "watch" ? "text-amber-300" : tone === "warn" || tone === "danger" ? "text-rose-300" : "text-zinc-300"
        )}
      >
        {value}
      </p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  )
}

/** Compact Vitals summary for the Status dashboard — self-contained fetches. */
export function VitalsSnapshot() {
  const { setTab } = useSystem()
  const metrics = useApi<MetricsRes>("/api/metrics")
  const sessions = useApi<SessionsRes>("/api/sessions")

  const latest = metrics.data?.latest ?? {}
  const sys = latest.bpSystolic
  const dia = latest.bpDiastolic
  const bp = sys && dia ? bpZone(sys.value, dia.value) : null
  const hr = latest.restingHr ? hrZone(latest.restingHr.value) : null
  const spo2 = latest.spo2 ? spo2Zone(latest.spo2.value) : null

  const score = useMemo(() => {
    const l = metrics.data?.latest ?? {}
    const sleepStats = seriesTrend(metrics.data?.series?.sleep)
    const week = sessions.data ? weekTraining(sessions.data.history) : null
    return healthScore({
      cardioMinutesThisWeek: week ? week.cardioMin : null,
      strengthSessionsThisWeek: week ? week.strengthSessions : null,
      sleep7dAvg: sleepStats.avg7,
      waistCm: l.waist?.value ?? null,
      heightCm: metrics.data?.profile.heightCm ?? null,
      bmi: l.bmi?.value ?? null,
      stress: l.stress?.value ?? null,
      energy: l.energy?.value ?? null,
      sleepTrend: sleepStats.delta,
    })
  }, [sessions.data, metrics.data])

  return (
    <SystemPanel
      label="Vitals Snapshot"
      labelAccent={
        <button
          type="button"
          onClick={() => setTab("vitals")}
          className="flex h-8 items-center gap-1 rounded-sm border border-rose-400/40 bg-rose-500/10 px-2.5 font-mono text-[9px] font-bold tracking-[0.2em] text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          OPEN VITALS <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3 p-3 sm:p-4 md:grid-cols-4">
        <SnapshotTile
          label="BLOOD PRESSURE"
          value={
            sys && dia ? (
              <>
                <CountNum value={sys.value} />/<CountNum value={dia.value} />
              </>
            ) : (
              "—"
            )
          }
          sub={bp ? <ZoneChip zone={bp} /> : <p className="font-mono text-[8px] tracking-wider text-zinc-400">NO DATA</p>}
        />
        <SnapshotTile
          label="RESTING HR"
          value={latest.restingHr ? <CountNum value={latest.restingHr.value} /> : "—"}
          sub={
            hr ? (
              <p className="font-mono text-[8px] tracking-wider text-zinc-200/80">{hr.label.toUpperCase()} · {hr.citation.split(":")[0]}</p>
            ) : (
              <p className="font-mono text-[8px] tracking-wider text-zinc-400">NO DATA</p>
            )
          }
        />
        <SnapshotTile
          label="BLOOD O₂"
          value={
            latest.spo2 ? (
              <>
                <CountNum value={latest.spo2.value} />%
              </>
            ) : (
              "—"
            )
          }
          sub={
            spo2 ? (
              <p className="font-mono text-[8px] tracking-wider text-zinc-200/80">{spo2.label.toUpperCase()}</p>
            ) : (
              <p className="font-mono text-[8px] tracking-wider text-zinc-400">NO DATA</p>
            )
          }
        />
        <SnapshotTile
          label="HEALTH SCORE"
          value={score.total !== null ? <CountNum value={score.total} /> : "—"}
          sub={
            <p className="font-mono text-[8px] tracking-wider text-zinc-400">
              {score.total !== null ? "ESTIMATE · LOGGED DATA" : "LOG VITALS TO COMPUTE"}
            </p>
          }
        />
      </div>
    </SystemPanel>
  )
}
