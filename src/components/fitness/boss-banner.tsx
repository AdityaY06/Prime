"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { Anvil, Crown, Eye, Ghost, Skull, Swords, Timer, Zap } from "lucide-react"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { FLOW_EASE, SPRING_SOFT } from "@/components/system/motion"
import { useApi } from "@/hooks/use-api"
import { bossCountdownLabel, msUntilNextBoss, type BossDTO } from "@/lib/bosses"
import { cn } from "@/lib/utils"

const BOSS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Ghost,
  Anvil,
  Skull,
  Eye,
  Crown,
}

/** Live countdown until the next boss spawns — Monday midnight in the
 *  hunter's timezone when set, else Monday 00:00 UTC. The interval is only a
 *  one-second heartbeat: the label is derived at render time from the CURRENT
 *  timezone prop, so a tz change is reflected immediately. */
function BossCountdown({ timezone }: { timezone?: string | null }) {
  const [, setBeat] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setBeat((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const label = bossCountdownLabel(msUntilNextBoss(timezone))
  return (
    <span className="font-mono text-[10px] tabular-nums tracking-widest text-rose-300/80" aria-label="Challenge ends in">
      {label}
    </span>
  )
}

// ── R5-c: three-beat entrance choreography ────────────────────────────────────
// BEAT 1  0.00–0.45s — the panel rises on a soft spring (R15-a) while a black
//         vignette flashes across the frame (opacity 0 → 0.5 → 0): the "the
//         boss is here" darkening beat.
// BEAT 2  0.14–0.55s — the sigil materializes from 1.3× scale; the boss NAME
//         slams in (1.15× scale + tracking contracting to rest); kicker and
//         epithet settle beneath it.
// BEAT 3  0.40–0.85s — the HP fill sweeps left→right to its true width, the
//         damage numeral counts up in lockstep, and the hunt CTA pops with a
//         2px overshoot.
// One parent variants object orchestrates; children inherit "show" with their
// own delays. Reduced motion → everything renders the final state instantly.
const vPanel: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { ...SPRING_SOFT } },
}
const vFlash: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: [0, 0.5, 0], transition: { duration: 0.3, times: [0, 0.45, 1], ease: "easeOut" } },
}
const vSigil: Variants = {
  hidden: { opacity: 0, scale: 1.3 },
  show: { opacity: 1, scale: 1, transition: { delay: 0.14, duration: 0.34, ease: FLOW_EASE } },
}
const vKicker: Variants = {
  hidden: { opacity: 0, y: 5 },
  show: { opacity: 1, y: 0, transition: { delay: 0.22, duration: 0.3, ease: FLOW_EASE } },
}
const vName: Variants = {
  hidden: { opacity: 0, scale: 1.15, letterSpacing: "0.16em" },
  show: { opacity: 1, scale: 1, letterSpacing: "0.05em", transition: { delay: 0.2, duration: 0.32, ease: FLOW_EASE } },
}
const vEpithet: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { delay: 0.3, duration: 0.3, ease: FLOW_EASE } },
}
const vHp: Variants = {
  hidden: { width: 0 },
  show: (pct: number) => ({ width: `${pct}%`, transition: { delay: 0.4, duration: 0.45, ease: FLOW_EASE } }),
}
const vStatus: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { delay: 0.45, duration: 0.3, ease: FLOW_EASE } },
}
const vRight: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.3, ease: FLOW_EASE } },
}
const vCta: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  // spring pops past 1 and settles — the +2px overshoot beat (unambiguous
  // final state under reduced motion, unlike keyframe arrays)
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      delay: 0.5,
      opacity: { duration: 0.2 },
      scale: { type: "spring", stiffness: 500, damping: 22 },
    },
  },
}

/**
 * BOSS RAID banner — the weekly world-boss hunt. Sits beneath the Rift of the
 * Day: one boss per week, tied to a gate; a single raid in its gate dealing
 * the boss's full HP in XP slays it for a bounty.
 */
export function BossBanner({
  onEnterGate,
  disabled,
  timezone,
}: {
  onEnterGate: (gateId: string) => void
  disabled?: boolean
  /** R38 — the hunter's IANA zone; the weekly challenge rolls at its Monday
   *  midnight. Absent/null (legacy hunters) keeps the UTC boundary. */
  timezone?: string | null
}) {
  const { data, loading } = useApi<BossDTO>("/api/boss")
  const reduce = useReducedMotion()

  // R15-a: beat-3 lockstep — the damage numeral resolves INSIDE the HP fill's
  // sweep window (0.4s delay + 0.45s sweep), so number and bar land together.
  // The kit's useCountUp has no delay param, so a local rAF count mirrors the
  // vHp timing; glides from the previous value on live damage updates, and
  // reduce → the final value instantly. Runs before the early returns and
  // idles at 0 while data is absent.
  const hpTarget = Math.min(data?.damage ?? 0, data?.hp ?? 0)
  const [hpShown, setHpShown] = useState(0)
  const hpFromRef = useRef(0)
  useEffect(() => {
    if (reduce) return
    const from = hpFromRef.current
    let raf = 0
    const t0 = performance.now() + 400 // vHp's delay
    const tick = (t: number) => {
      const elapsed = t - t0
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick)
        return
      }
      const p = Math.min(1, elapsed / 450)
      const eased = 1 - Math.pow(1 - p, 3)
      setHpShown(Math.round(from + (hpTarget - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else hpFromRef.current = hpTarget
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [hpTarget, reduce])

  if (loading && !data) {
    return (
      <div className="mt-3">
        <SkeletonPanel label="LOADING WEEKLY CHALLENGE" rows={1}>
          <div className="skel-bar h-16 w-full" style={{ animationDelay: "0.15s" }} />
        </SkeletonPanel>
      </div>
    )
  }
  if (!data) return null

  const Icon = BOSS_ICONS[data.glyph] ?? Skull
  const pct = Math.min(100, Math.round((data.damage / data.hp) * 100))
  // standing damage already exceeds HP but no kill recorded yet (e.g. the boss
  // spawned mid-week) — the next clearing raid in its gate finishes the job
  const staggering = !data.defeated && data.damage >= data.hp
  const wounded = !data.defeated && data.damage > 0 && data.damage < data.hp

  // R55 — short verdicts on the surface; the full sentence rides the <p>'s
  // title (hover/AT keeps every word; innerText drops the chrome).
  const statusFull = data.defeated
    ? `COMPLETED THIS CYCLE — REWARD PAID: +${data.xpReward} XP · +${data.essenceReward} CREDITS`
    : staggering
      ? `ALMOST THERE — ONE MORE SESSION AT ${data.gateName.toUpperCase()} FINISHES IT`
      : wounded
        ? `IN PROGRESS — BEST SESSION THIS WEEK: ${data.damage.toLocaleString()} / ${data.hp.toLocaleString()} XP`
        : `FRESH — A SINGLE SESSION AT ${data.gateName.toUpperCase()} EARNING ${data.hp.toLocaleString()} XP COMPLETES IT`
  const statusLine = data.defeated
    ? "COMPLETED — REWARD PAID"
    : staggering
      ? "ALMOST THERE — ONE MORE SESSION"
      : wounded
        ? `IN PROGRESS — ${data.damage.toLocaleString()} / ${data.hp.toLocaleString()} XP`
        : "FRESH — ONE SESSION COMPLETES IT"

  // enrage suffix — a returning challenge wears its completions openly
  const rageSuffix =
    !data.defeated && data.enrage.tier > 0
      ? ` · COMPLETED ${data.enrage.kills}× BEFORE — NEXT TIME: ×${data.enrage.hpMult} HP`
      : ""

  const tierClasses = [
    "", // STANDARD never renders
    "enrage-empowered border-amber-400/50 bg-amber-500/10 text-amber-300",
    "enrage-enraged border-rose-400/60 bg-rose-500/10 text-rose-300",
    "enrage-apex border-red-400/70 bg-red-500/15 text-red-300",
  ]

  return (
    <motion.div
      variants={vPanel}
      initial={reduce ? "show" : "hidden"}
      animate="show"
      className={cn(
        "boss-banner relative mt-4 overflow-hidden rounded-xl border p-4",
        data.defeated
          ? "boss-slain border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.07] via-zinc-950/70 to-zinc-950/60"
          : "boss-live border-rose-400/40 bg-gradient-to-br from-rose-500/10 via-zinc-950/70 to-black/40",
        !data.defeated && data.enrage.tier > 0 && "boss-enraged"
      )}
      role="region"
      aria-label={`Weekly challenge: ${data.name}`}
    >
      {/* faint crossed-slash watermark behind the sigil */}
      <div className="boss-marks pointer-events-none absolute -left-8 top-1/2 h-32 w-32 -translate-y-1/2" aria-hidden />

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* sigil — beat 2: materializes from 1.3× scale */}
        <motion.div
          variants={vSigil}
          className={cn(
            "relative grid h-12 w-12 shrink-0 place-items-center rounded-full border",
            data.defeated
              ? "border-emerald-400/50 bg-emerald-500/10"
              : "border-rose-400/60 bg-rose-500/10 shadow-[0_0_18px_rgba(244,63,94,0.3)]"
          )}
          aria-hidden
        >
          <Icon
            className={cn(
              "h-6 w-6",
              data.defeated ? "text-emerald-300/70" : "boss-pulse text-rose-300 drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]"
            )}
          />
        </motion.div>

        {/* identity + HP bar */}
        <div className="min-w-0 flex-1">
          <motion.div variants={vKicker} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <p className="sys-label text-[9px] text-rose-300/90">WEEKLY CHALLENGE</p>
            {data.enrage.tier > 0 && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 font-mono text-[8px] font-bold tracking-[0.2em]",
                  tierClasses[data.enrage.tier],
                  data.defeated && "enrage-stilled"
                )}
                title={`Completed ${data.enrage.kills}× before — target scales to ×${data.enrage.hpMult} HP`}
              >
                {data.enrage.label} ×{data.enrage.hpMult}
              </span>
            )}
            <span className="font-mono text-[8px] tracking-[0.25em] text-zinc-400">
              {data.threat.toUpperCase()}
            </span>
          </motion.div>
          {/* beat 2: the name slams in — 1.15× scale + tracking contracting to rest */}
          <motion.p
            variants={vName}
            style={{ originX: 0 }}
            className={cn("mt-0.5 font-mono text-sm font-bold tracking-wider", data.defeated ? "text-zinc-400 line-through decoration-rose-400/60" : "text-rose-100")}
          >
            {data.name}
          </motion.p>
          {/* R48-b studio — the tagline is the banner's one editorial flourish
              (Instrument Serif italic, amber-100) */}
          <motion.p variants={vEpithet} className="sys-italic mt-0.5 line-clamp-2 text-[11px] text-amber-100">
            {data.epithet}
          </motion.p>

          {/* HP / damage bar — beat 3: the fill sweeps to its true width */}
          <div className="mt-3 flex items-center gap-2.5">
            <div
              className={cn("relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-900/80")}
              role="progressbar"
              aria-valuenow={data.damage}
              aria-valuemin={0}
              aria-valuemax={data.hp}
              aria-label={`Progress ${data.damage} of ${data.hp}`}
            >
              <motion.div
                variants={vHp}
                custom={pct}
                className={cn(
                  "boss-hp-fill h-full",
                  data.defeated
                    ? "bg-gradient-to-r from-emerald-700 via-emerald-500 to-lime-400"
                    : staggering
                      ? "boss-fill-full h-full bg-gradient-to-r from-rose-800 via-rose-500 to-amber-400"
                      : "bg-gradient-to-r from-rose-800 via-rose-600 to-rose-400"
                )}
              />
              {/* tick marks every 25% — engraved notches */}
              {[25, 50, 75].map((t) => (
                <span
                  key={t}
                  className="boss-tick absolute top-0 h-full w-px"
                  style={{ left: `${t}%` }}
                  aria-hidden
                />
              ))}
            </div>
            <span
              className={cn(
                "shrink-0 font-mono text-[10px] font-bold tabular-nums tracking-wider",
                data.defeated ? "text-emerald-300" : staggering ? "text-amber-300" : "text-rose-200"
              )}
            >
              {(reduce ? hpTarget : hpShown).toLocaleString()}/{data.hp.toLocaleString()}
              <span className="ml-1 text-[8px] text-zinc-400">HP</span>
            </span>
          </div>

          <motion.p
            variants={vStatus}
            title={statusFull + rageSuffix}
            className={cn(
              "mt-2 font-mono text-[8px] tracking-[0.18em]",
              data.defeated ? "text-emerald-400/70" : staggering ? "text-amber-300/80" : "text-zinc-400"
            )}
          >
            {statusLine}
            {rageSuffix}
          </motion.p>
        </div>

        {/* right column — countdown + tally */}
        <motion.div variants={vRight} className="flex flex-col items-end gap-1.5">
          <span className="hidden flex-col items-end font-mono text-[8px] tracking-widest text-zinc-400 sm:flex">
            {data.defeated ? "NEXT CHALLENGE IN" : "ENDS IN"}
            <BossCountdown timezone={timezone} />
          </span>
          <span
            className="flex items-center gap-1.5 font-mono text-[9px] tabular-nums tracking-widest text-zinc-400"
            title={`Completed ${data.totalDefeats}× lifetime`}
          >
            <Swords className="h-3 w-3 text-rose-400/70" aria-hidden />
            ×{data.totalDefeats}
          </span>
          {data.defeated && data.enrage.tier > 0 && (
            <span className="enrage-felled font-mono text-[8px] tracking-widest text-rose-400/60">
              {data.enrage.label} COMPLETED
            </span>
          )}
        </motion.div>

        {/* hunt CTA — beat 3: pops with a 2px overshoot */}
        {!data.defeated && (
          <motion.button
            variants={vCta}
            onClick={() => onEnterGate(data.gateId)}
            disabled={disabled}
            className="pill-action relative flex h-11 w-full items-center justify-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/15 text-[10px] font-bold tracking-[0.12em] text-rose-200 uppercase transition-colors hover:bg-rose-500/30 hover:shadow-[0_0_24px_rgba(244,63,94,0.45)] active:bg-rose-500/40 focus-visible:outline focus-visible:outline-rose-400/70 disabled:opacity-40 sm:w-auto"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden /> Take on {data.gateName}
          </motion.button>
        )}
      </div>

      {/* beat 1 — the darkening flash rides above the frame, then vanishes */}
      <motion.div
        variants={vFlash}
        className="pointer-events-none absolute inset-0 z-20 bg-black"
        aria-hidden
      />
    </motion.div>
  )
}
