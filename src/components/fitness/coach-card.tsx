"use client"

// ── PRIME · Strain Coach card (R23-b) ────────────────────────────────────────
// The daily training directive, rendered in the STATUS tab right under the
// Daily Briefing: the coach reads load (strain / ACWR / TSB) + readiness
// (band / sleep debt / RHR deviation) every morning and issues ONE honest
// verdict with the evidence lines that produced it. A readout by design —
// no buttons; the engine's BUILDING PICTURE state renders verbatim (never
// fabricated numbers). Self-contained fetch (LoadConsolePanel precedent):
// useApi rides the global refreshKey, so the directive recomputes with
// every session and check-in.

import { motion, useReducedMotion } from "framer-motion"
import { Compass } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { useApi } from "@/hooks/use-api"
import { COACH_VERDICT_META, type CoachDirective, type CoachTone } from "@/lib/coach"
import { cn } from "@/lib/utils"

type CoachRes = { directive: CoachDirective; asOf: string }

/** Evidence tone dots — good ivory / caution amber / alert rose / neutral
 *  zinc (R43 studio lab register: a positive reading reads neutral-bright). */
const TONE_DOT: Record<CoachTone, string> = {
  good: "bg-zinc-200 shadow-[0_0_5px_rgba(228,228,231,0.45)]",
  caution: "bg-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.6)]",
  alert: "bg-rose-400 shadow-[0_0_5px_rgba(251,113,133,0.6)]",
  neutral: "bg-zinc-600",
}

/** One evidence row — label left, tone dot + value right. */
function EvidenceRow({ label, value, tone }: { label: string; value: string; tone: CoachTone }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-800/50 py-1.5 last:border-b-0">
      <p className="sys-label shrink-0 text-[9px] text-zinc-400">{label}</p>
      <p className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold tabular-nums tracking-wide text-zinc-300">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
        <span className="truncate">{value}</span>
      </p>
    </div>
  )
}

/** The STRAIN COACH — verdict, evidence, ceiling, honest footer. */
export function CoachCard() {
  const { data, loading, error } = useApi<CoachRes>("/api/coach")
  const reduce = useReducedMotion()

  if (loading && !data) {
    return (
      <SkeletonPanel label="Reading today's directive" rows={3}>
        <div className="skel-bar h-10 w-2/5" style={{ animationDelay: "0.12s" }} />
        <div className="skel-bar h-3 w-full" style={{ animationDelay: "0.24s" }} />
        <div className="skel-bar h-3 w-4/5" style={{ animationDelay: "0.3s" }} />
      </SkeletonPanel>
    )
  }
  if (error || !data) {
    return (
      <SystemPanel label="Strain Coach">
        <div className="p-5 text-center">
          <p className="text-xs font-semibold tracking-wide text-rose-400/80">The coach is unavailable</p>
          <p className="mt-1 text-[10px] font-medium tracking-wider text-zinc-400">
            {error ?? "No data"}
          </p>
        </div>
      </SystemPanel>
    )
  }

  const d = data.directive
  const meta = COACH_VERDICT_META[d.verdict]
  const asOf = new Date(data.asOf).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  // The verdict's own family tint rides the ceiling numeral; TRAIN HARD's
  // "no cap" line is the green light itself.
  const noCap = d.strainCap === null

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      role="status"
      aria-label={`Strain coach directive: ${d.verdict}. ${d.directive}. ${d.rationale}`}
    >
      <SystemPanel
        label="Strain Coach"
        labelAccent={
          <span className="flex items-center gap-1.5 text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
            <Compass className="h-3 w-3 text-violet-400/80" aria-hidden />
            Daily directive
          </span>
        }
      >
        <div className="p-4 pt-5 sm:p-5">
          {/* the verdict — big, uppercase, tone-colored by rule family */}
          <p
            className={cn(
              "sys-display text-2xl font-bold leading-none tracking-[0.08em] sm:text-3xl",
              meta.text,
            )}
          >
            {d.verdict}
          </p>

          {/* the imperative + the plain-language why */}
          <p className="mt-2.5 text-[11px] font-bold tracking-wide text-zinc-200">
            {d.directive}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{d.rationale}</p>

          {/* the evidence — what the coach read this morning (≤7 rows by
              construction; absent signals render NOT LOGGED, never invented) */}
          <div className="mt-4 border-t border-zinc-800/60 pt-2.5">
            {d.evidence.map((row) => (
              <EvidenceRow key={row.label} label={row.label} value={row.value} tone={row.tone} />
            ))}
          </div>

          {/* today's strain ceiling — the actionable number on the 0–21 scale */}
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5",
              noCap ? "border-teal-500/30 bg-teal-500/5" : "border-zinc-800/70 bg-zinc-950/40",
            )}
          >
            <p className="sys-label text-[9px] text-zinc-400">STRAIN CEILING TODAY</p>
            <p
              className={cn(
                "text-xs font-bold tabular-nums tracking-wider",
                noCap ? "text-teal-300" : meta.text,
              )}
            >
              {noCap ? "NO CAP — EARN IT" : `${d.strainCap} / 21`}
              <span className="ml-2 text-[9px] font-semibold tracking-wider text-zinc-400">0–21 scale</span>
            </p>
          </div>

          {/* honest footer — when it was computed, and that it moves */}
          <p className="mt-3.5 flex items-center justify-end gap-2.5 border-t border-violet-500/10 pt-2.5 text-[8px] font-bold tracking-[0.12em] text-zinc-400">
            <span className="h-px w-6 bg-violet-500/20" aria-hidden />
            As of {asOf} · recomputes with every session and check-in
            <span className="h-1 w-1 rounded-full bg-zinc-700" aria-hidden />
          </p>
        </div>
      </SystemPanel>
    </motion.div>
  )
}
