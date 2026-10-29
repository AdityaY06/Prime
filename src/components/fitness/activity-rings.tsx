"use client"

// ── PRIME · Activity rings (Task 13-c) ────────────────────────────────────────
// Google-Fit-style concentric rings for the Status dashboard: MOVE (minutes of
// today's cleared sessions, WHO 60-min guideline), EST. ACTIVE BURN (duration +
// volume heuristic, 300 kcal target) and HYDRATION (daily water goal from the
// Fuel engine) — plus one-tap water quick-log with XP / goal-completion hooks.

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { SystemPanel } from "@/components/system/system-panel"
import { FLOW_EASE, MeterFlow, useCountUp } from "@/components/system/motion"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { DEFAULT_PROFILE, hydrateGoalMl } from "@/lib/nutrition"
import { dayKey, formatDayLabel } from "@/lib/game"
import type { HunterDTO, SessionDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

type NutritionRes = { waterMl: number; targets: { waterMl: number } }
type SessionsRes = { history: SessionDTO[] }
type WaterLogRes = { waterMl: number; questCompleted?: boolean; xpGranted?: number }

const MOVE_TARGET_MIN = 60
const BURN_TARGET_KCAL = 300
const STROKE = 11

/** Rings outer→inner: MOVE white→gold (the progress ring), BURN amber, HYDRATE teal. */
const RINGS = [
  { key: "move", r: 84, color: "url(#prime-move-stroke)", glow: "rgba(251,191,36,0.6)", label: "MOVE" },
  { key: "burn", r: 66, color: "#f59e0b", glow: "rgba(245,158,11,0.75)", label: "ACTIVE BURN" },
  { key: "hydrate", r: 48, color: "#14b8a6", glow: "rgba(20,184,166,0.75)", label: "HYDRATION" },
] as const

type RingKey = (typeof RINGS)[number]["key"]

/** Mount draw order — MOVE leads, then ACTIVE BURN, then HYDRATION (~120 ms apart). */
const RING_DELAYS: Record<RingKey, number> = { move: 0.15, burn: 0.27, hydrate: 0.39 }

const WATER_BUTTONS: readonly { ml: number; label: string; aria: string }[] = [
  { ml: -250, label: "−250", aria: "Remove 250 milliliters of water" },
  { ml: 250, label: "+250 ml", aria: "Add 250 milliliters of water" },
  { ml: 500, label: "+500", aria: "Add 500 milliliters of water" },
]

/** Liters, compact: whole tenths stay 1-decimal, mid-hundreds keep two. */
function fmtL(ml: number): string {
  return (ml / 1000).toFixed(ml % 100 === 0 ? 1 : 2)
}

/** One full-circle track + an animated progress arc (dasharray trick). */
function Ring({
  r,
  color,
  glow,
  pct,
  reduce,
  delay = 0,
}: {
  r: number
  color: string
  glow: string
  pct: number
  reduce: boolean
  /** Mount stagger (seconds) — plays once; later value changes glide without it. */
  delay?: number
}) {
  const [armed, setArmed] = useState(true)
  const c = 2 * Math.PI * r
  const shown = Math.min(1, Math.max(0, pct))

  // R15 — live completion burst: when a ring crosses 100% ON CAMERA (the
  // water quick-log is the canonical path), a one-shot halo peels off the
  // ring — radius +18, stroke thinning to a hairline, opacity fading to 0 —
  // and unmounts itself. Crossing detection uses the sanctioned
  // "adjust state when props change" render-time pattern (react.dev) — no
  // effect, no setState-in-effect. Mounts-already-complete never fire (prev
  // is seeded with the first pct); reduced motion stands down entirely.
  const [prevPct, setPrevPct] = useState(pct)
  const [burst, setBurst] = useState(0)
  if (pct !== prevPct) {
    setPrevPct(pct)
    if (!reduce && prevPct < 1 && pct >= 1) setBurst((b) => b + 1)
  }

  return (
    <>
      {/* R43 studio — the track is a soft neutral groove (the aurora-track
          tint), not a zinc rail */}
      <circle cx={100} cy={100} r={r} fill="none" stroke="rgba(212,212,216,0.12)" strokeWidth={STROKE} />
      {pct > 0 && (
        <motion.circle
          cx={100}
          cy={100}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - shown) }}
          transition={
            reduce ? { duration: 0 } : { duration: 0.9, delay: armed ? delay : 0, ease: FLOW_EASE }
          }
          onAnimationComplete={() => setArmed(false)}
          style={pct >= 1 ? { filter: `drop-shadow(0 0 6px ${glow})` } : undefined}
        />
      )}
      {burst > 0 && (
        <motion.circle
          key={`burst-${burst}`}
          cx={100}
          cy={100}
          r={r}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          initial={{ opacity: 0.55, strokeWidth: STROKE, r }}
          animate={{ opacity: 0, strokeWidth: 1.5, r: r + 18 }}
          transition={{ duration: 0.75, ease: FLOW_EASE }}
          onAnimationComplete={() => setBurst(0)}
          style={{ pointerEvents: "none", filter: `drop-shadow(0 0 10px ${glow})` }}
        />
      )}
    </>
  )
}

/** Colored dot + label + tabular value + the R42 aurora hairline meter. */
function LegendRow({
  color,
  label,
  value,
  pct,
  fill,
}: {
  color: string
  label: string
  value: string
  pct: number
  /** R42 — the aurora fill class poured inside the hairline track. */
  fill: string
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: pct >= 1 ? `0 0 7px ${color}` : undefined }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold tracking-[0.12em] text-zinc-400">{label}</span>
          <span className="text-[11px] font-semibold tabular-nums text-zinc-100">{value}</span>
        </div>
        {/* R15/R42 — legend fills: MeterFlow still pours the width (mount
            sweep + update glide); the aurora classes give it the luminous
            hairline skin. Inline `transition: none` keeps framer the sole
            width driver — the class's CSS width-transition would low-pass
            its per-frame writes. */}
        <div className="aurora-track mt-1.5">
          <MeterFlow
            className={fill}
            pct={Math.min(100, Math.max(0, pct * 100))}
            duration={0.7}
            style={{ transition: "none" }}
          />
        </div>
      </div>
    </li>
  )
}

/** TODAY panel — MOVE / EST. ACTIVE BURN / HYDRATION rings + water quick-log. */
export function ActivityRingsPanel({ hunter: _hunter }: { hunter: HunterDTO }) {
  const { data: nutrition, reload } = useApi<NutritionRes>("/api/nutrition")
  const { data: sessions } = useApi<SessionsRes>("/api/sessions")
  const { pushNotice, speak, bumpRefresh } = useSystem()
  const reduce = useReducedMotion()
  const [pending, setPending] = useState(false)

  const today = dayKey()
  const stats = useMemo(() => {
    const clearedToday = (sessions?.history ?? []).filter(
      (s) => s.status === "cleared" && dayKey(new Date(s.startedAt)) === today
    )
    const moveMin = Math.round(clearedToday.reduce((acc, s) => acc + s.durationMin, 0))
    const burnKcal = Math.round(
      clearedToday.reduce((acc, s) => acc + s.durationMin * 5.5 + s.volumeKg * 0.02, 0)
    )
    const waterMl = Math.max(0, nutrition?.waterMl ?? 0)
    const waterTarget = nutrition?.targets?.waterMl ?? hydrateGoalMl(DEFAULT_PROFILE.weightKg)
    return {
      moveMin,
      burnKcal,
      waterMl,
      waterTarget,
      movePct: moveMin / MOVE_TARGET_MIN,
      burnPct: burnKcal / BURN_TARGET_KCAL,
      waterPct: waterTarget > 0 ? waterMl / waterTarget : 0,
    }
  }, [sessions, nutrition, today])

  const goalsHit = [stats.movePct, stats.burnPct, stats.waterPct].filter((p) => p >= 1).length
  const pcts: Record<RingKey, number> = { move: stats.movePct, burn: stats.burnPct, hydrate: stats.waterPct }
  const moveMinShown = useCountUp(stats.moveMin)

  async function logWater(ml: number) {
    if (pending) return
    setPending(true)
    try {
      const res = await api<WaterLogRes>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({ action: "log-water", ml }),
      })
      if (res.xpGranted) {
        pushNotice({ kind: "xp", title: `+${res.xpGranted} XP`, body: "Hydration milestone" })
      }
      if (res.questCompleted) {
        pushNotice({ kind: "info", title: "HYDRATION GOAL COMPLETE", body: "Claim it in the Goals tab." })
        speak("Hydration goal complete.")
      }
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "WATER LOG FAILED", body: (e as Error).message })
    } finally {
      setPending(false)
    }
  }

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <SystemPanel
        label="Today · Activity"
        labelAccent={
          <span className="text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
            {formatDayLabel(today)}
          </span>
        }
      >
        <div className="p-4 sm:p-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
            {/* concentric rings — inner painted first so outer glows sit on top */}
            <div
              className="relative h-52 w-52 shrink-0"
              role="img"
              aria-label={`Today's activity rings: ${stats.moveMin} of ${MOVE_TARGET_MIN} move minutes, ${stats.burnKcal} of ${BURN_TARGET_KCAL} estimated active burn kilocalories, ${fmtL(stats.waterMl)} of ${fmtL(stats.waterTarget)} liters of water, ${goalsHit} of 3 goals hit.`}
            >
              <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden>
                {/* R43 studio — the MOVE progress ring pours white→gold (the
                    aurora register) instead of the grove's emerald. Geometry,
                    draw order and animation contracts unchanged. */}
                <defs>
                  <linearGradient id="prime-move-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#e4e4e7" />
                    <stop offset="55%" stopColor="#f4f4f5" />
                    <stop offset="100%" stopColor="#fbbf24" />
                  </linearGradient>
                </defs>
                {[...RINGS].reverse().map((ring) => (
                  <Ring
                    key={ring.key}
                    r={ring.r}
                    color={ring.color}
                    glow={ring.glow}
                    pct={pcts[ring.key]}
                    reduce={!!reduce}
                    delay={RING_DELAYS[ring.key]}
                  />
                ))}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                {/* R42 studio — the panel's hero numeral goes truly oversized
                    (Mirage scale) and keeps the spring count-up. */}
                <p className="sys-display text-[42px] text-zinc-50">
                  {Math.round(moveMinShown)}
                </p>
                <p className="mt-1.5 text-[9px] font-bold tracking-[0.12em] text-zinc-400">min move</p>
                <p
                  className={cn(
                    "mt-2 text-[8px] font-bold tabular-nums tracking-wider",
                    goalsHit === 3 ? "text-amber-300" : "text-zinc-400"
                  )}
                >
                  {goalsHit}/3 goals hit
                </p>
              </div>
            </div>

            {/* legend + water quick-log */}
            <div className="w-full min-w-0 flex-1 space-y-4">
              <ul className="space-y-3.5">
                <LegendRow
                  color="#e4e4e7"
                  label="Move"
                  value={`${stats.moveMin}/${MOVE_TARGET_MIN} min`}
                  pct={stats.movePct}
                  fill="aurora-fill"
                />
                <LegendRow
                  color="#f59e0b"
                  label="Active burn"
                  value={`${stats.burnKcal}/${BURN_TARGET_KCAL} kcal`}
                  pct={stats.burnPct}
                  fill="aurora-fill aurora-fill-amber"
                />
                <LegendRow
                  color="#14b8a6"
                  label="Hydration"
                  value={`${fmtL(stats.waterMl)}/${fmtL(stats.waterTarget)} L`}
                  pct={stats.waterPct}
                  fill="aurora-fill"
                />
              </ul>

              <div>
                <p className="text-[8px] font-bold tracking-[0.14em] text-zinc-400">Water quick log</p>
                <div className="mt-2 flex flex-wrap gap-2" aria-busy={pending}>
                  {WATER_BUTTONS.map(({ ml, label, aria }) => (
                    <button
                      key={ml}
                      type="button"
                      onClick={() => logWater(ml)}
                      disabled={pending}
                      aria-label={aria}
                      className="pill-action inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/60 px-3 text-[10px] font-bold tracking-[0.12em] text-zinc-400 transition-colors hover:border-teal-500/50 hover:bg-teal-500/10 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-4"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SystemPanel>
    </motion.div>
  )
}
