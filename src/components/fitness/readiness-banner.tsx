"use client"

// ── PRIME · Readiness banner (R1-b · R42 studio pass) ────────────────────────
// TRAINING-tab top banner: composite daily readiness scored from today's
// vitals (sleep / RHR-vs-baseline / mood+energy). R42: what was a boxed,
// multi-row strip is now ONE subtle glass pill — amber chrome, a breathing
// ambient aura behind it, sentence-case copy at a whisper. The score still
// counts up on the spring landing; band hue still carries the verdict; the
// driver chips + citation ride along in the pill's title tooltip and the
// screen-reader label (single-line chrome, zero information lost). The
// no-vitals / offline states keep their honest slim strips — now on the same
// glass-pill chrome.

import { Activity } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { SPRING_SOFT, useCountUp } from "@/components/system/motion"
import { useApi } from "@/hooks/use-api"
import {
  READINESS_BAND_META,
  READINESS_CITATION,
  type ReadinessBand,
  type ReadinessRes,
} from "@/lib/health"
import { cn } from "@/lib/utils"

/** R42 — band display names at a whisper (the data keys shout; the pill doesn't). */
const BAND_WORD: Record<ReadinessBand, string> = {
  PRIMED: "Primed",
  READY: "Ready",
  MODERATE: "Moderate",
  "BACK OFF": "Back off",
}

/** R42 — the advice strings arrive ALL-CAPS from lib/health (shared contract
 *  with the Vitals panel); the pill renders them in sentence case — every
 *  sentence gets its capital, not just the first. Display-only. */
function soften(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^\s*\p{L}|([.!?])\s+\p{L})/gu, (m) => m.toUpperCase())
}

/** Slim neutral strip shared by the no-data / offline states. */
function SlimStrip({ text, syncing }: { text: string; syncing?: boolean }) {
  return (
    <div
      role="status"
      className="glass-pill flex min-h-11 items-center gap-2.5 px-4 py-2.5"
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full border", syncing ? "sys-pulse border-violet-400/60 bg-violet-500/30" : "border-zinc-600 bg-zinc-800")}
        aria-hidden
      />
      <p className="min-w-0 truncate text-[10px] font-semibold tracking-wide text-zinc-400">{text}</p>
    </div>
  )
}

export function ReadinessBanner() {
  const { data, error, loading } = useApi<ReadinessRes>("/api/readiness")
  const reduce = useReducedMotion()
  // R4-b: animated score numeral (kit count-up; instant under reduced motion).
  // Hook runs before the early returns; it idles at 0 while data is absent.
  const score = useCountUp(data?.readiness?.score ?? 0, 0.9)

  if (loading && !data) return <SlimStrip text="Gathering today's readiness…" syncing />
  if (error && !data) return <SlimStrip text="Readiness is unavailable right now" />
  if (!data) return null

  const r = data.readiness
  if (!r) {
    // R55 — quiet variant; the full instruction (log sleep or resting heart
    // rate in Vitals) rides the strip's existing aria/title plumbing.
    return <SlimStrip text="No vitals yet — log sleep or RHR in Vitals." />
  }

  const meta = READINESS_BAND_META[r.band]
  const advice = soften(meta.advice)

  // The demoted detail — signed drivers + the citation — rides in the pill's
  // tooltip (and the screen-reader label below) instead of chip rows.
  const driverSummary = r.drivers
    .map((d) => `${d.label} ${d.delta > 0 ? "+" : "−"}${Math.abs(d.delta)}`)
    .join(" · ")

  return (
    <motion.div
      // R15-a: spring rise — the pill content mounts when readiness data
      // lands (SlimStrip held the slot until then), so its entrance plays on
      // data arrival, landing with the score count-up. Reduce → final state.
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      role="status"
      aria-label={`Daily readiness: ${r.band}, ${r.score} out of 100. ${advice}${driverSummary ? `. Drivers: ${driverSummary}` : ""}`}
      title={driverSummary ? `${driverSummary} — ${READINESS_CITATION}` : READINESS_CITATION}
      className="aura-glow relative"
    >
      {/* R42 studio — the single-line glass pill: amber chrome, soft amber
          aura breathing behind it, one whisper of copy. */}
      <div className="glass-pill glass-pill-amber flex min-h-11 items-center gap-x-3 px-4 py-2.5 sm:px-5">
        <Activity className="h-4 w-4 shrink-0" style={{ color: meta.hex }} aria-hidden />
        <p className="flex min-w-0 items-baseline gap-x-2 text-[11px] font-medium text-zinc-300">
          <span className="shrink-0 text-zinc-400">Readiness</span>
          {/* the score lands on the spring count-up, set in the display grotesque */}
          <span className="sys-display shrink-0 text-xl" style={{ color: meta.hex }}>
            {Math.round(score)}
          </span>
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-zinc-500">/ 100</span>
          <span
            className="shrink-0 text-[10px] font-bold tracking-wide"
            style={{ color: meta.hex }}
          >
            {BAND_WORD[r.band]}
          </span>
          <span className="min-w-0 truncate text-[11px] text-zinc-400">{advice}</span>
        </p>
      </div>
    </motion.div>
  )
}
