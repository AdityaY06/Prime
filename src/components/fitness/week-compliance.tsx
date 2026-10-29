"use client"

// ── PRIME · Week compliance strip (R1-b) ──────────────────────────────────────
// TRAINING-tab strip: cleared sessions this ISO week vs the active program's
// planned days. Free sessions count toward done; a flame marks being ahead.

import { Flame } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { MeterFlow } from "@/components/system/motion"
import { useApi } from "@/hooks/use-api"
import type { ReadinessRes } from "@/lib/health"

export function WeekCompliance() {
  const { data, error, loading } = useApi<ReadinessRes>("/api/readiness")
  const reduce = useReducedMotion()

  if (loading && !data) return null
  if (error && !data) return null
  if (!data) return null

  const { planned, done } = data.week
  const ahead = planned > 0 ? done - planned : 0
  const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0

  const body =
    planned > 0
      ? `${done}/${planned} SESSION${done === 1 && planned === 1 ? "" : "S"}`
      : done > 0
        ? `${done} FREE SESSION${done === 1 ? "" : "S"} LOGGED · NO ACTIVE PROGRAM — FORGE ONE IN THE PROTOCOL PANEL`
        : "NO ACTIVE PROGRAM — FORGE ONE IN THE PROTOCOL PANEL"

  const aria = `This week: ${done} of ${planned} planned sessions cleared${ahead > 0 ? `, ${ahead} ahead of plan` : ""}.`

  return (
    <div
      role="status"
      aria-label={aria}
      className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)] sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* R48-b studio — the strip title joins the Space Grotesk reading
            voice; the session tally stays the mono data voice. */}
        <p className="font-display text-sm font-medium text-zinc-100">
          THIS WEEK · <span className="font-mono text-[11px] tabular-nums text-zinc-200">{body}</span>
        </p>
        {ahead > 0 && (
          <motion.span
            initial={reduce ? { scale: 1, opacity: 1 } : { scale: 0.65, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.15em] text-amber-300"
          >
            <Flame className="h-3 w-3" aria-hidden /> {ahead} AHEAD
          </motion.span>
        )}
      </div>
      {planned > 0 && (
        <div className="aurora-track mt-2">
          {/* R48-b studio — the compliance bar joins the aurora family: a
              luminous 3px hairline whose ends dissolve. MeterFlow stays the
              sole width driver (inline transition:none — the class's CSS width
              transition would low-pass its per-frame writes).
              R15-a: sweeps 0→pct once in view (fires instantly when already on
              screen) and glides on live `done` updates; the 4% floor keeps a
              begun week visible. */}
          <MeterFlow
            pct={Math.max(pct > 0 ? 4 : 0, pct)}
            inView
            duration={0.8}
            className="aurora-fill aurora-fill-violet"
            style={{ transition: "none" }}
          />
        </div>
      )}
    </div>
  )
}
