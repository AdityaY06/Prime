"use client"

// ── PRIME · Coach strip (R24-b) ───────────────────────────────────────────────
// The TRAINING-tab companion to the STATUS-tab Strain Coach card (R23-b): the
// daily directive AT THE POINT OF ACTION. The user starts sessions here, so
// the verdict must be visible the moment the gate choice is made — one
// compact strip above the readiness banner, mirroring readiness-banner's
// lightness (bordered strip, NOT a SystemPanel card; the full briefing lives
// on STATUS). Readout by design — no buttons. Tone logic is NOT re-implemented:
// lib/coach.ts's COACH_VERDICT_META is the single source of truth.
//
// Honesty rules (mirrored from readiness-banner):
//   · loading → thin "SYNCING STRAIN COACH…" strip (same SlimStrip idiom);
//   · /api/coach failed → a minimal neutral "COACH OFFLINE" strip +
//     console.debug only — a failed coach must never block training;
//   · BUILDING PICTURE (the engine's insufficient state emits exactly one
//     SIGNALS evidence row) → still renders, with the neutral tone.

import { motion, useReducedMotion } from "framer-motion"
import { Compass } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { COACH_VERDICT_META, type CoachDirective, type CoachTone, type CoachVerdict } from "@/lib/coach"
import { cn } from "@/lib/utils"

type CoachRes = { directive: CoachDirective; asOf: string }

/** Verdict chip frame — tone-colored by rule family (readiness-banner
 *  BAND_CHIP idiom; the text tone itself comes from COACH_VERDICT_META). */
const VERDICT_CHIP: Record<CoachVerdict, string> = {
  "TRAIN HARD": "border-teal-400/50 bg-teal-500/15 text-teal-300",
  TRAIN: "border-violet-400/50 bg-violet-500/15 text-violet-300",
  RECOVERY: "border-amber-400/50 bg-amber-500/15 text-amber-300",
  REST: "border-rose-500/60 bg-rose-500/20 text-rose-200",
  "DELOAD NOW": "border-rose-500/60 bg-rose-500/20 text-rose-200",
}

/** Neutral chip + text for the BUILDING PICTURE degradation. */
const NEUTRAL_CHIP = "border-zinc-600/50 bg-zinc-800/40 text-zinc-300"

/** Evidence tone dots — good ivory / caution amber / alert rose / neutral
 *  zinc (coach-card's TONE_DOT, single visual language across tabs — R43
 *  studio lab register: a positive reading reads neutral-bright). */
const TONE_DOT: Record<CoachTone, string> = {
  good: "bg-zinc-200",
  caution: "bg-amber-400",
  alert: "bg-rose-400",
  neutral: "bg-zinc-600",
}

/** Slim neutral strip shared by the syncing / offline states (readiness-banner
 *  SlimStrip idiom — the strip stays thin, never a full skeleton panel). */
function SlimStrip({ text, syncing }: { text: string; syncing?: boolean }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-full border border-zinc-800/70 bg-zinc-950/40 px-3.5 py-2"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full border",
          syncing ? "sys-pulse border-violet-400/60 bg-violet-500/30" : "border-zinc-600 bg-zinc-800",
        )}
        aria-hidden
      />
      <p className="text-[9px] font-semibold tracking-wider text-zinc-400">{text}</p>
    </div>
  )
}

/** The day's training directive, compressed to one strip — verdict chip +
 *  imperative + strain ceiling, one evidence line, AS OF time. */
export function CoachStrip() {
  const { data, loading, error } = useApi<CoachRes>("/api/coach")
  const reduce = useReducedMotion()

  if (loading && !data) return <SlimStrip text="Reading today's directive…" syncing />
  if (error && !data) {
    // Silent degrade: a failed coach must not block training — one quiet
    // debug line, a neutral strip, and the tab stays fully usable.
    console.debug("[coach-strip] /api/coach unavailable:", error)
    return <SlimStrip text="Coach offline — train by feel" />
  }
  if (!data) return null

  const d = data.directive
  const meta = COACH_VERDICT_META[d.verdict]
  const asOf = new Date(data.asOf).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  // BUILDING PICTURE — the engine's insufficient state emits exactly ONE
  // evidence row labelled SIGNALS (lib/coach.ts rule 6); render the verdict
  // with the neutral tone instead of the family tint (still useful, never
  // fabricated).
  const building = d.evidence.length === 1 && d.evidence[0].label === "SIGNALS"
  // The ONE most-important evidence line: alert beats caution beats context —
  // the row that produced the verdict, not the whole table.
  const pick = d.evidence.find((r) => r.tone === "alert") ?? d.evidence.find((r) => r.tone === "caution") ?? d.evidence[0]
  const toneText = building ? "text-zinc-400" : meta.text

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      role="status"
      aria-label={`Daily training directive: ${d.verdict}. ${d.directive}. ${meta.capHint}. As of ${asOf}.`}
      className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3.5 py-2"
    >
      {/* verdict — directive — ceiling (the actionable number on the 0–21 scale) */}
      <div className="flex min-w-0 items-center gap-2.5">
        <Compass className="h-3.5 w-3.5 shrink-0 text-violet-400/80" aria-hidden />
        <span
          className={cn(
            "grove-press inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider",
            building ? NEUTRAL_CHIP : VERDICT_CHIP[d.verdict],
          )}
        >
          {d.verdict}
        </span>
        <p
          className="min-w-0 flex-1 truncate text-[9px] font-bold tracking-wide text-zinc-200"
          title={d.directive}
        >
          {d.directive}
        </p>
        <p className={cn("shrink-0 text-[9px] font-bold tabular-nums tracking-wide", toneText)}>
          {meta.capHint}
        </p>
      </div>
      {/* the evidence that produced it (alert/caution row first) + AS OF */}
      <div className="mt-1 flex min-w-0 items-center gap-2 pl-6">
        {pick && (
          <p className="flex min-w-0 items-center gap-1.5 text-[8px] font-semibold tracking-wide text-zinc-400">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[pick.tone])} aria-hidden />
            <span className="truncate">
              {pick.label} · {pick.value}
            </span>
          </p>
        )}
        <p className="ml-auto shrink-0 text-[8px] font-semibold tabular-nums tracking-wide text-zinc-400">As of {asOf}</p>
      </div>
    </motion.div>
  )
}
