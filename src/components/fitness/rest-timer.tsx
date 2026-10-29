"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Check, Minus, Plus, SkipForward } from "lucide-react"
import { useSystem } from "@/store/system-store"
import { cn } from "@/lib/utils"

// ── PRIME · Rest timer — the floating countdown pill between sets ──────────────
//
// Mounts with a duration (prescription restSec from the session's program plan
// or the per-type heuristic) and auto-starts. Each newly added log remounts it
// via a `key` in session-raid, so every logged exercise restarts the countdown.
// Silence (and the completion chime) respects the System Voice mute toggle.

const TICK_MS = 200
const COMPLETE_AUTO_DISMISS_MS = 4000
const BUMP_SEC = 15
/** Ring circumference — r=17 inside a 40×40 viewBox. */
const RING_C = 2 * Math.PI * 17

/** m:ss clock face — 95s renders as "1:35". */
function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Short 0.2s WebAudio chime (880 → 1318.5 Hz sine sweep). Guarded by the
 * System Voice toggle at the call site; wrapped so autoplay policies or a
 * missing API degrade to silence instead of an error.
 */
function restChime(): void {
  try {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext }
    const Ctx = w.webkitAudioContext ?? AudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t0 = ctx.currentTime
    osc.type = "sine"
    osc.frequency.setValueAtTime(880, t0)
    osc.frequency.exponentialRampToValueAtTime(1318.5, t0 + 0.16)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.22)
    osc.onended = () => {
      void ctx.close().catch(() => undefined)
    }
  } catch {
    // audio unavailable or blocked — silence beats an error toast
  }
}

/**
 * The floating rest pill — fixed bottom-center, above the mobile bottom nav
 * (z-40: under the nav/dialog/notice layers, over page content). The parent
 * renders a scroll spacer while it is mounted so the FINISH actions can
 * always scroll clear of the pill.
 */
export function RestTimer({
  restSec,
  exerciseName,
  onDismiss,
}: {
  /** Rest length in seconds — auto-starts the moment the pill mounts. */
  restSec: number
  /** The exercise that just landed — grounds the label + aria-label. */
  exerciseName: string
  onDismiss: () => void
}) {
  const voiceEnabled = useSystem((s) => s.voiceEnabled)
  const [now, setNow] = useState(() => Date.now())

  // mutable countdown state — the parent re-renders every second (elapsed
  // timer), so refs keep the ±15s / completion effects from re-firing
  const endAtRef = useRef(Date.now() + Math.max(1, restSec) * 1000)
  const totalMsRef = useRef(Math.max(1, restSec) * 1000)
  const voiceRef = useRef(voiceEnabled)
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    voiceRef.current = voiceEnabled
    onDismissRef.current = onDismiss
  })

  // heartbeat
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [])

  const remaining = Math.max(0, (endAtRef.current - now) / 1000)
  const complete = remaining <= 0
  const fraction = Math.max(0, Math.min(1, remaining / (totalMsRef.current / 1000)))

  // completion — chime (only when the System Voice is unmuted), then auto-dismiss
  useEffect(() => {
    if (!complete) return
    if (voiceRef.current) restChime()
    const t = setTimeout(() => onDismissRef.current(), COMPLETE_AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [complete])

  /** ±15s. While complete, +15 re-arms a fresh 15s countdown. */
  const bump = (deltaSec: number) => {
    if (deltaSec < 0 && complete) return
    const nowMs = Date.now()
    if (complete) {
      endAtRef.current = nowMs + deltaSec * 1000
      totalMsRef.current = Math.abs(deltaSec) * 1000
    } else {
      endAtRef.current += deltaSec * 1000
      totalMsRef.current = Math.max(BUMP_SEC * 1000, totalMsRef.current + deltaSec * 1000)
    }
    setNow(nowMs)
  }

  const timeLabel = fmtClock(remaining)

  return (
    <motion.div
      role="timer"
      aria-label={complete ? `Rest complete — ${exerciseName}` : `Rest: ${timeLabel} remaining — ${exerciseName}`}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 28, scale: 0.96, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className={cn(
        "fixed inset-x-0 z-40 mx-auto flex w-[min(26rem,calc(100vw-1.5rem))] items-center gap-3 rounded-sm border px-3 py-2.5 backdrop-blur-xl",
        // floats above the mobile bottom nav (3.25rem + safe area), bottom-center on desktop
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-6",
        "shadow-[0_0_30px_rgba(139,92,246,0.35)]",
        complete
          ? "border-emerald-400/60 bg-emerald-950/95 shadow-[0_0_30px_rgba(52,211,153,0.35)]"
          : "border-violet-400/50 bg-zinc-950/95"
      )}
    >
      {/* progress ring — depletes clockwise as the rest burns down */}
      <div className="relative h-10 w-10 shrink-0" aria-hidden>
        <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90">
          <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(63,63,70,0.8)" strokeWidth="3" />
          <circle
            cx="20"
            cy="20"
            r="17"
            fill="none"
            stroke={complete ? "#34d399" : "#6ee7b7"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - fraction)}
            className="transition-[stroke-dashoffset] duration-200 ease-linear"
          />
        </svg>
        {complete && <Check className="sys-pulse absolute inset-0 m-auto h-4 w-4 text-emerald-300" />}
      </div>

      {/* label + countdown */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "sys-label truncate text-[8px]",
            complete ? "text-emerald-300/80" : "text-violet-300/80"
          )}
        >
          {complete ? "REST COMPLETE · NEXT SET" : `REST · ${exerciseName}`}
        </p>
        <p
          className={cn(
            "font-mono text-lg font-bold leading-tight tabular-nums",
            complete ? "text-glow-amber text-amber-200" : "text-glow-violet text-violet-100"
          )}
        >
          {complete ? "GO" : timeLabel}
        </p>
      </div>

      {/* controls — 44px targets throughout */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => bump(-BUMP_SEC)}
          disabled={complete}
          aria-label="Shorten rest by 15 seconds"
          title="Shorten rest by 15 seconds"
          className="grid h-11 w-11 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 transition-all hover:border-violet-400/60 hover:text-violet-200 active:bg-violet-500/20 disabled:opacity-30 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => bump(BUMP_SEC)}
          aria-label={complete ? "Rest 15 more seconds" : "Extend rest by 15 seconds"}
          title={complete ? "Rest 15 more seconds" : "Extend rest by 15 seconds"}
          className="grid h-11 w-11 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 transition-all hover:border-violet-400/60 hover:text-violet-200 active:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onDismissRef.current()}
          aria-label="Skip the rest"
          title="Skip the rest"
          className={cn(
            "flex h-11 items-center gap-1.5 rounded-sm border px-3 font-mono text-[10px] font-bold tracking-[0.25em] uppercase transition-all active:bg-violet-500/45 focus-visible:outline focus-visible:outline-violet-400/70",
            complete
              ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/30"
              : "border-violet-400/60 bg-violet-500/20 text-violet-200 hover:bg-violet-500/35"
          )}
        >
          <SkipForward className="h-3.5 w-3.5" aria-hidden />
          SKIP
        </button>
      </div>
    </motion.div>
  )
}
