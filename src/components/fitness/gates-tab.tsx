"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowRight, Castle, ChevronDown, ChevronRight, Dumbbell, FlaskConical, Gem, MapPin, Sparkles, Swords, Trophy, Waves, Wind, Zap } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { FlowGroup, FlowItem, FlowReveal, FLOW_EASE, SPRING_SOFT, liftMotion, MeterFlow, pulseBreathe, useCountUp } from "@/components/system/motion"
// R54-c1 declutter: the numbered SysSection headers stood down on this tab —
// every panel below carries its own single label (section-mark.tsx stays on
// disk; the other tabs still import it).
import { InfoHint } from "@/components/system/info-hint"
import { SystemPanel } from "@/components/system/system-panel"
import { RankBadge } from "@/components/system/rank-badge"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { SessionRaid } from "./session-raid"
import { ReadinessBanner } from "./readiness-banner"
import { WeekCompliance } from "./week-compliance"
import { ProgramPanel } from "./program-panel"
import { BossBanner } from "./boss-banner"
import { OracleTip } from "./oracle-tip"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { GATES } from "@/lib/gates"
import { dayKeyIn, type ExerciseType } from "@/lib/game"
import {
  HRV_MODULATION_META,
  type HrvModulation,
  type HrvModulationBand,
  type ReadinessRes,
} from "@/lib/health"
import { scienceFor } from "@/lib/science"
import { type GateMasteryView, type MasteryDTO } from "@/lib/mastery"
import { isRiftGate, riftCountdownLabel, riftOfTheDay, msUntilNextRift, RIFT_ESSENCE_BONUS } from "@/lib/rift"
import type { HunterDTO, SessionDTO } from "@/lib/types"
import type { MuscleLandmark, MuscleVolumeReadout, VolumeZone } from "@/lib/volume-landmarks"
import { cn } from "@/lib/utils"

const GATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Wind,
  Dumbbell,
  Swords,
  Waves,
  Castle,
}

/** One consensus science footnote per gate — matched to what THAT gate
 *  actually trains. R29-b honesty re-land: the R7-era study-level evidence
 *  lines (SCHOENFELD 2016/2017 …) are replaced by the shared field-manual
 *  module — org-level consensus labels only, never study citations. */
const GATE_SCIENCE: Record<string, ReturnType<typeof scienceFor>> = {
  "gale-fields": scienceFor("who-aerobic"),
  "iron-forge": scienceFor("nsca-overload"),
  "titan-trial": scienceFor("muscle-hypertrophy"),
  "flow-sanctum": scienceFor("ramp-warmup"),
  "colossus-gate": scienceFor("who-strength"),
}

type SessionsRes = { active: SessionDTO | null; history: SessionDTO[] }

/** R33-b — cold-start empty surface: the designed "what will live here" slot
 *  for a brand-new hunter (zero data). One zinc-300 line, one zinc-500 action
 *  hint pointing at the flow that creates the data, and where natural a violet
 *  link-chip that navigates via the tab store. Strictly the zero/missing-data
 *  path — a data-rich hunter (KAEL regression) never renders it. */
function EmptySurface({
  label,
  line,
  hint,
  ctaLabel,
  onCta,
  glyph,
}: {
  label: string
  line: string
  hint: string
  ctaLabel?: string
  onCta?: () => void
  glyph?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: FLOW_EASE }}
      role="status"
      aria-label={`${label} — ${line.toLowerCase()} — ${hint.toLowerCase()}`}
      className="rounded-2xl border border-dashed border-zinc-700/60 bg-zinc-950/30 px-4 py-6 text-center transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:shadow-[0_0_18px_rgba(167,139,250,0.12)] sm:px-5"
    >
      <p className="sys-label text-[9px] text-zinc-400">{label}</p>
      {glyph && <EmptyGlyph className="mx-auto mt-2 h-16 w-16 opacity-70" />}
      <p className="mt-2 text-xs font-semibold tracking-wide text-zinc-300">{line}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-400">{hint}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="grove-press mt-4 inline-flex h-11 items-center gap-1.5 rounded-full border border-violet-400/50 bg-violet-500/15 px-4 text-[10px] font-bold tracking-[0.12em] text-violet-300 transition-colors hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(167,139,250,0.3)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {ctaLabel}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </motion.div>
  )
}

/** Decorative animated "gate network" divider — a flowing dash between rune nodes. */
function GateNetworkDivider() {
  return (
    <div className="relative mt-4 h-5 select-none" aria-hidden>
      <svg
        className="absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2"
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        fill="none"
      >
        <line x1="0" y1="4" x2="100" y2="4" stroke="rgba(167,139,250,0.14)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line
          x1="0"
          y1="4"
          x2="100"
          y2="4"
          stroke="rgba(196,181,253,0.75)"
          strokeWidth="1"
          strokeDasharray="6 94"
          vectorEffect="non-scaling-stroke"
          className="net-flow"
        />
      </svg>
      {[12, 32, 50, 68, 88].map((left, i) => (
        <span
          key={left}
          className={cn(
            "absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border",
            i === 2
              ? "sys-pulse border-violet-300/70 bg-violet-400/30 shadow-[0_0_8px_rgba(167,139,250,0.6)]"
              : "border-violet-500/40 bg-violet-500/10"
          )}
          style={{ left: `${left}%` }}
        />
      ))}
    </div>
  )
}

/** Live countdown until the rift rotates — the hunter's midnight when
 *  Hunter.timezone is set (the server grants by dayKeyIn(hunter.timezone)),
 *  else 00:00 UTC. The interval is only a one-second heartbeat: the label is
 *  derived at render time from the CURRENT timezone prop, so a tz change is
 *  reflected immediately (no stale initializer, no sync setState in effect). */
function RiftCountdown({ timezone }: { timezone: string | null }) {
  const [, setBeat] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setBeat((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const label = riftCountdownLabel(msUntilNextRift(timezone))
  return (
    <span className="font-mono text-[10px] tabular-nums tracking-widest text-amber-300/90" aria-label="Bonus rotates in">
      {label}
    </span>
  )
}

/** Chip order + frame colors for the HRV modulation bands — the app palette
 *  (amber/rose/teal/violet); NEVER indigo/blue. */
const HRV_CHIP_FRAMES: Record<HrvModulationBand, string> = {
  cut: "text-amber-300 border-amber-400/30",
  light: "text-rose-300 border-rose-400/30",
  aligned: "text-teal-300 border-teal-400/30",
  primed: "text-violet-300 border-violet-400/30",
}

/** R29-b — HRV TRAINING MODULATION strip: today's rMSSD vs the prior-7-day
 *  baseline, banded route-side by the pure hrvTrainingModulation (the client
 *  only renders). Honest by design — no fresh data renders four dim chips,
 *  never a fabricated green light. Chips are read-only status indicators
 *  (aria-current marks the live band), not buttons.
 *  R55-c second-pass declutter: the band's advice sentence (active) and the
 *  unlock note (locked) ride the strip root's title — the chips keep the
 *  verdict, the mono line keeps the numbers, and the root's aria-label still
 *  carries the full sentence for screen readers. */
function HrvModulationStrip({ modulation, hrvMs }: { modulation: HrvModulation | null; hrvMs: number | null }) {
  const bands: HrvModulationBand[] = ["cut", "light", "aligned", "primed"]
  return (
    <div
      className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] px-3.5 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
      role="status"
      aria-label={
        modulation
          ? `HRV training modulation: ${HRV_MODULATION_META[modulation.band].chip} — ${modulation.advice}`
          : "HRV training modulation locked — log HRV in Vitals"
      }
      title={
        modulation
          ? `${modulation.advice} — today's rMSSD vs the prior-7-day baseline`
          : "Log HRV in Vitals to unlock training modulation"
      }
    >
      <p
        className="sys-label text-[9px] text-zinc-400"
        title="HRV training modulation — today's rMSSD vs the prior 7-day baseline"
      >
        HRV MODULATION
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {bands.map((band) => {
          const active = modulation?.band === band
          return (
            <span
              key={band}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border px-1.5 text-center font-mono text-[8px] font-bold leading-tight tracking-[0.1em] transition-opacity",
                HRV_CHIP_FRAMES[band],
                active ? "opacity-100" : "opacity-40"
              )}
            >
              {HRV_MODULATION_META[band].chip}
            </span>
          )
        })}
      </div>
      {modulation ? (
        <p className="mt-1 font-mono text-[9px] tabular-nums tracking-[0.16em] text-zinc-400">
          HRV {Math.round(hrvMs ?? 0)} MS · {modulation.pctDeviation}% VS 7-DAY BASELINE
        </p>
      ) : null}
    </div>
  )
}

/** Mastery row — 5 tier pips + tier label + progress toward the next tier. */
function MasteryRow({ m, riftGate }: { m: GateMasteryView | undefined; riftGate: boolean }) {
  const reduce = useReducedMotion()
  // R4-b: kit count-up (instant under reduced motion; Math.round for pips)
  const clears = useCountUp(m?.clears ?? 0, 0.7)
  // R15-a: live-clear celebrate — if clears ever tick UP while the map is on
  // camera (silent mastery refetch via bumpRefresh), the strip breathes once
  // (pulseBreathe, imperative → caller gates on reduce). Never fires on mount:
  // prev is seeded with the current value on first render.
  const stripRef = useRef<HTMLDivElement>(null)
  const prevClears = useRef(m?.clears ?? 0)
  useEffect(() => {
    const cur = m?.clears ?? 0
    const prev = prevClears.current
    prevClears.current = cur
    if (reduce || cur <= prev || !stripRef.current) return
    void pulseBreathe(stripRef.current, 1.02, 0.45)
  }, [m?.clears, reduce])
  if (!m) return null
  const sovereign = m.tier === 5
  // a tier-up is one step away — the bar shimmers and the next pip beckons
  const near = m.nextTierAt !== null && m.progressPct >= 75
  // ambient tint for the strip's aura/scanlines: amber at SOVEREIGN, violet once
  // ranked, zinc while dormant (violet reads clearly on the amber rift card —
  // the same amber+violet pairing the rift banner itself uses)
  const tint = sovereign ? "251,191,36" : m.tier > 0 ? "167,139,250" : "113,113,122"
  // R9-b — the strip drops its own border (borders stay reserved for the outer
  // gate card, per the border-itis audit) and speaks through a left accent
  // spine + gradient lift instead: amber at SOVEREIGN, violet once ranked,
  // zinc while dormant
  const rowAccent = sovereign ? "rgba(251,191,36,.8)" : m.tier > 0 ? "rgba(167,139,250,.65)" : "rgba(113,113,122,.5)"
  const rowLift = sovereign ? "rgba(251,191,36,.07)" : m.tier > 0 ? "rgba(167,139,250,.05)" : "rgba(113,113,122,.04)"
  return (
    <motion.div
      ref={stripRef}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mastery-strip sys-accent-row relative mt-3 rounded-lg px-3 py-2.5"
      style={{ "--mastery-tint-rgb": tint, "--row-accent": rowAccent, "--row-lift": rowLift } as React.CSSProperties}
      role="status"
      aria-label={`Mastery: ${m.tierLabel}, ${m.clears} completed sessions`}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          {/* tier pips — filled diamonds up to current tier, staggering in */}
          <span className="flex items-center gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((pip) => {
              const filled = pip <= m.tier
              return (
                <span
                  key={pip}
                  style={{ animationDelay: `${0.14 + pip * 0.08}s` }}
                  className={cn(
                    "mastery-pip mastery-pip-in inline-block h-1.5 w-1.5 rotate-45 border",
                    filled && "mastery-pip-on",
                    pip === m.tier && m.tier > 0 && "mastery-pip-lead",
                    near && pip === m.tier + 1 && "mastery-pip-next",
                    filled
                      ? sovereign
                        ? "border-amber-300/80 bg-amber-400/70 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                        : "border-violet-300/70 bg-violet-400/60 shadow-[0_0_6px_rgba(167,139,250,0.55)]"
                      : "border-zinc-700 bg-transparent"
                  )}
                />
              )
            })}
          </span>
          <span
            className={cn(
              "font-mono text-[9px] font-bold tracking-[0.25em]",
              sovereign ? "text-amber-300" : m.tier > 0 ? "text-violet-300" : "text-zinc-400"
            )}
          >
            {m.tierLabel}
          </span>
          {m.titleUnlocked && (
            <span
              className={cn(
                "font-mono text-[9px] tracking-wider",
                sovereign ? "text-amber-400/70" : "text-violet-400/60"
              )}
              title="Badge earned in this training type"
            >
              «{m.titleUnlocked}»
            </span>
          )}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
          <Trophy className={cn("h-3 w-3", riftGate ? "text-amber-400/70" : m.tier > 0 ? "text-violet-400/70" : "text-zinc-500")} aria-hidden />
          {Math.round(clears)} CLEAR{m.clears === 1 ? "" : "S"}
          {m.nextTierAt !== null && (
            <span className="text-zinc-400">/ {m.nextTierAt}</span>
          )}
        </span>
      </div>
      {/* progress toward next tier — R48-b studio: the tier meter joins the
          aurora family (luminous hairline, ends dissolved); the seg skin stays
          for the counted-clears hard stops */}
      {m.nextTierAt !== null && (
        <div className={cn("aurora-track relative mt-2", near && "mastery-near")}>
          {/* R15-a: kit MeterFlow (inView) — the tier fill sweeps 0→pct only
              once the reader reaches this gate card (cards ride FlowReveal in
              the scrollable raid map); later pct changes glide. 4%
              begun-floor preserved; inline transition:none keeps framer the
              sole width driver (aurora-fill's CSS width transition would
              low-pass its per-frame writes). */}
          <MeterFlow
            pct={Math.max(m.progressPct > 0 ? 4 : 0, m.progressPct)}
            inView
            duration={0.7}
            className={cn("aurora-fill", riftGate || sovereign ? "aurora-fill-amber" : "aurora-fill-violet")}
            style={{ transition: "none" }}
          />
          {/* R9-b — hard-stop meter skin over the tier fill */}
          <span className="sys-seg sys-seg-sm" aria-hidden />
        </div>
      )}
      {sovereign && (
        <p className="mastery-max relative mt-1.5 font-mono text-[8px] tracking-[0.3em] text-amber-400/60">MAX MASTERY — MASTER</p>
      )}
    </motion.div>
  )
}

/** Featured-gate banner — the Rift of the Day. */
function RiftBanner({
  gateName,
  bonusMult,
  onEnter,
  timezone,
}: {
  gateName: string
  bonusMult: number
  onEnter: () => void
  timezone: string | null
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      // R15-a: spring rise on mount — same entrance language as the BossBanner
      // panel beat, so the raid map's two banners land as one family. Reduce →
      // final state instantly.
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className={cn(
        "rift-banner relative overflow-hidden rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 via-zinc-950/60 to-violet-500/10 p-4",
        "shadow-[0_0_28px_rgba(245,158,11,0.12)]"
      )}
      role="region"
      aria-label="Daily bonus"
    >
      {/* sweeping shine line */}
      <div className="rift-shine pointer-events-none absolute inset-y-0 w-1/3" aria-hidden />
      {/* concentric rift sigil watermark */}
      <div
        className="rift-sigil pointer-events-none absolute -right-10 -top-12 h-40 w-40 border border-amber-400/20"
        aria-hidden
      >
        <span className="absolute inset-3 border border-amber-400/10" />
        <span className="absolute inset-7 border border-amber-400/[0.07]" />
      </div>
      {/* rising embers */}
      <span className="rift-ember" style={{ left: "14%", width: 3, height: 3, "--rift-delay": "0s", "--rift-dur": "6.5s", "--rift-drift": "12px" } as React.CSSProperties} aria-hidden />
      <span className="rift-ember" style={{ left: "62%", width: 2, height: 2, "--rift-delay": "2.2s", "--rift-dur": "7.5s", "--rift-drift": "-10px" } as React.CSSProperties} aria-hidden />
      <span className="rift-ember" style={{ left: "86%", width: 3, height: 3, "--rift-delay": "4s", "--rift-dur": "6.8s", "--rift-drift": "8px" } as React.CSSProperties} aria-hidden />

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2.5">
          <Sparkles className="sys-pulse h-4 w-4 text-amber-300 drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]" aria-hidden />
          {/* R55-c second-pass declutter: the "DAILY BONUS" kicker stood down
              — the region's aria-label, the ×M XP chip and TRAIN THE BONUS
              all say it; the name keeps the meaning on hover. */}
          <p className="font-mono text-sm font-bold tracking-wider text-violet-50" title="Daily bonus">
            {gateName}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="sys-bloom-amber rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-amber-200">
            ×{bonusMult} XP
          </span>
          <span className="hidden items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-500/10 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-teal-200 sm:flex">
            <Gem className="h-3 w-3" aria-hidden /> +{RIFT_ESSENCE_BONUS} CREDITS
          </span>
          {/* pulsing diamond divider glyph */}
          <span className="rift-glyph hidden select-none text-[10px] text-amber-400/70 md:block" aria-hidden>
            ◈
          </span>
          {/* R55-c second-pass declutter: the "ROTATES IN" caption stood down
              (the countdown's own aria-label says "Bonus rotates in"). */}
          <span
            className="hidden flex-col items-end font-mono text-[8px] tracking-widest text-zinc-400 md:flex"
            title="Bonus rotates in"
          >
            <RiftCountdown timezone={timezone} />
          </span>
          {/* compact countdown — mobile only */}
          <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 md:hidden">
            <span className="rift-glyph select-none text-[9px] text-amber-400/70" aria-hidden>
              ◈
            </span>
            <RiftCountdown timezone={timezone} />
          </span>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onEnter}
          className="pill-action relative flex h-11 w-full items-center justify-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 text-[10px] font-bold tracking-[0.12em] text-amber-200 uppercase transition-colors hover:bg-amber-500/30 hover:shadow-[0_0_24px_rgba(245,158,11,0.45)] active:bg-amber-500/40 focus-visible:outline focus-visible:outline-violet-400/70 sm:w-auto"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden /> TRAIN THE BONUS
        </motion.button>
      </div>
    </motion.div>
  )
}

/** R8-b — weekly volume readout DTO from GET /api/volume. */
type VolumeRes = { readouts: MuscleVolumeReadout[]; footer: string; everLogged: boolean }

/** A readout narrowed to its landmark (the filter's type-guard target). */
type LandmarkedReadout = MuscleVolumeReadout & { landmark: MuscleLandmark; zone: VolumeZone }

/** Zone verdict styling — R8-b palette discipline: violet/teal/amber + zinc.
 *  OVERREACH stays amber (with the ▲ glyph) rather than adding a new hue. */
const ZONE_STYLE: Record<VolumeZone, string> = {
  UNTRAINED: "text-zinc-400",
  UNDER: "text-amber-400/80",
  PRODUCTIVE: "text-teal-300/80",
  STIMULATING: "text-violet-300/80",
  OVERREACH: "text-amber-400/90",
}

/** R9-b — zone → left-accent spine + gradient lift hues (.sys-accent-row):
 *  the verdict colors the row's EDGE instead of adding another bordered box. */
const ZONE_ROW: Record<VolumeZone, { accent: string; lift: string }> = {
  UNTRAINED: { accent: "rgba(113,113,122,.4)", lift: "rgba(113,113,122,.03)" },
  UNDER: { accent: "rgba(251,191,36,.5)", lift: "rgba(251,191,36,.05)" },
  PRODUCTIVE: { accent: "rgba(45,212,191,.6)", lift: "rgba(45,212,191,.05)" },
  STIMULATING: { accent: "rgba(167,139,250,.6)", lift: "rgba(167,139,250,.05)" },
  OVERREACH: { accent: "rgba(251,191,36,.75)", lift: "rgba(251,191,36,.07)" },
}

/** One landmark row: muscle · weekly sets · zone verdict + a 4px band bar.
 *  Track scale runs 0 → 1.1×MRV: the clamp ceiling gets its own visible strip
 *  past MRV (faint amber — overreach territory), so the position formula
 *  clamp(weeklySets / mrv, 0, 1.1) plays out INSIDE the track instead of
 *  bleeding off-panel — the row must survive 390px. Non-interactive row: no
 *  44px target required (R8-b spec). */
function LandmarkRow({ r, index }: { r: LandmarkedReadout; index: number }) {
  // R15-a: kit count-up — the weekly-sets numeral resolves with the row rise
  // and glides on live volume refetches (instant under reduced motion).
  const sets = useCountUp(r.weeklySets, 0.7)
  const SCALE = 1.1 // dot position ceiling, as a fraction of MRV
  const mrvPct = (1 / SCALE) * 100 // where MRV sits on the track (~90.9%)
  const mevPct = (r.landmark.mev / r.landmark.mrv / SCALE) * 100
  // position = clamp(weeklySets / mrv, 0, 1.1), mapped onto the extended scale
  const dotPct = (Math.min(Math.max(r.weeklySets / r.landmark.mrv, 0), SCALE) / SCALE) * 100
  return (
    <FlowItem
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: FLOW_EASE }}
      role="listitem"
      aria-label={`${r.muscle}: ${r.weeklySets} hard sets in the last 7 days — ${r.zone} zone. Weekly set landmarks (MEV ${r.landmark.mev}, MAV ${r.landmark.mavLo}-${r.landmark.mavHi}, MRV ${r.landmark.mrv}) are Israetel 2020 guidelines.`}
      className="sys-accent-row py-1.5 pl-2.5"
      style={{ "--row-accent": ZONE_ROW[r.zone].accent, "--row-lift": ZONE_ROW[r.zone].lift } as React.CSSProperties}
    >
      <div className="flex items-baseline justify-between gap-x-3">
        <span className="sys-label text-[10px] text-zinc-300">{r.muscle}</span>
        <span className="flex items-baseline gap-2 font-mono text-[9px] tabular-nums tracking-[0.15em]">
          {/* R55-c second-pass declutter: the per-row "SETS" unit word stood
              down — the panel accent reads "SETS · 7 DAYS" and the row's
              aria-label says "hard sets" (the StrainStat idiom). */}
          <span className="text-zinc-200">{Math.round(sets)}</span>
          <span className={cn("min-w-[78px] text-right", ZONE_STYLE[r.zone])}>
            {r.zone === "OVERREACH" ? "OVERREACH ▲" : r.zone}
          </span>
        </span>
      </div>
      {/* zone bar — zinc track · faint amber past-MRV strip · MEV→MRV band · violet dot */}
      <div className="relative mt-1.5 h-1 w-full rounded-sm bg-zinc-800" aria-hidden>
        <span
          className="absolute inset-y-0 rounded-sm bg-amber-500/[0.14]"
          style={{ left: `${mrvPct.toFixed(2)}%`, right: 0 }}
        />
        <span
          className="absolute inset-y-0 overflow-hidden rounded-sm bg-gradient-to-r from-violet-500/45 to-violet-400/15"
          style={{ left: `${mevPct.toFixed(2)}%`, right: `${(100 - mrvPct).toFixed(2)}%` }}
        >
          {/* R9-b — the productive band reads as discrete set-stops, not a wash */}
          <span className="sys-seg sys-seg-sm" aria-hidden />
        </span>
        <span
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300 shadow-[0_0_6px_rgba(167,139,250,0.75)]"
          style={{ left: `max(4px, ${dotPct.toFixed(2)}%)` }}
        />
      </div>
    </FlowItem>
  )
}

/** Observation-only row (CORE / FULL BODY): sets are shown, but no landmark
 *  exists for these tags — we say so instead of inventing a band. */
function ObservationRow({ r, index }: { r: MuscleVolumeReadout; index: number }) {
  // R15-a: same count-up language as the landmark rows.
  const sets = useCountUp(r.weeklySets, 0.7)
  return (
    <FlowItem
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: FLOW_EASE }}
      role="listitem"
      aria-label={`${r.muscle}: ${r.weeklySets} sets in the last 7 days — observation only; no landmark defined for this muscle.`}
      className="sys-accent-row py-1.5 pl-2.5"
      style={{ "--row-accent": "rgba(113,113,122,.35)", "--row-lift": "rgba(113,113,122,.03)" } as React.CSSProperties}
    >
      <div className="flex items-baseline justify-between gap-x-3">
        <span className="sys-label text-[10px] text-zinc-400">{r.muscle}</span>
        <span className="flex items-baseline gap-2 font-mono text-[9px] tabular-nums tracking-[0.15em]">
          {/* R55-c: same SETS-unit fold as the landmark rows. */}
          <span className="text-zinc-300">{Math.round(sets)}</span>
          <span className="min-w-[78px] text-right text-zinc-400">NO LANDMARK</span>
        </span>
      </div>
    </FlowItem>
  )
}

/** R8-b — VOLUME LANDMARKS panel: hard sets per muscle in the last 7 days vs
 *  Israetel 2020 evidence-informed weekly landmark bands.
 *  R55-c second-pass declutter: (a) the footer caveat rides the table's
 *  title attribute (the R53-a LOAD-console citation idiom — each row's
 *  aria-label already names Israetel, the InfoHint carries the indirect-sets
 *  rule); (b) the rows cap at VOLUME_PREVIEW with a 44px SHOW ALL / SHOW
 *  LESS expander (the R54-c1 DayCard idiom — the tail unmounts while closed
 *  so innerText stays clean); (c) the per-row SETS unit word stood down —
 *  the panel accent reads "SETS · 7 DAYS" (rows stay sorted by weeklySets
 *  desc, so trained muscles can never fall behind the fold). */
const VOLUME_PREVIEW = 4

function VolumeLandmarksPanel() {
  const { data, error, loading } = useApi<VolumeRes>("/api/volume")
  // R55-c: expander state — hooks sit above the silent-skip early returns
  // (Rules of Hooks; the same silent-skip idiom as WeekCompliance keeps the
  // panel mounted only once data lands).
  const [showAll, setShowAll] = useState(false)
  const reduce = useReducedMotion()
  if ((loading || error) && !data) return null
  if (!data) return null

  const landmarkRows = data.readouts.filter((r): r is LandmarkedReadout => r.landmark !== null && r.zone !== null)
  const observationRows = data.readouts.filter((r) => r.landmark === null)

  // one flat row list (landmark rows, divider, observation rows) — the cap
  // slices it; the divider only ever lands between the two row families.
  const rowElements = [
    ...landmarkRows.map((r, i) => <LandmarkRow key={r.muscle} r={r} index={i} />),
    ...(observationRows.length > 0
      ? [<div key="obs-divider" className="mt-2 border-t border-zinc-800/60" aria-hidden />]
      : []),
    ...observationRows.map((r, i) => (
      <ObservationRow key={r.muscle} r={r} index={landmarkRows.length + i} />
    )),
  ]
  const foldable = rowElements.length > VOLUME_PREVIEW

  return (
    <SystemPanel
      label="Volume Landmarks"
      labelAccent={
        <span className="flex items-center gap-1.5 text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
          <FlaskConical className="h-3 w-3 text-teal-400/70" aria-hidden /> SETS · 7 DAYS
          {/* R54-c1 declutter: the panel's how-to-read intro (MEV→MRV bands,
              indirect sets) folded into this one-off hint; R55-c: the Israetel
              caveat moved from the footer into the table's title attr. */}
          <InfoHint
            label="Landmarks"
            body="Hard sets each muscle logged in the last 7 days, read against its MEV→MRV landmark band — the highlighted stretch where volume pays. Indirect sets count: every muscle a lift tags gets the tally."
          />
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        {data.everLogged ? (
          <>
            <div
              role="list"
              aria-label="Weekly hard sets per muscle vs landmark bands"
              title={data.footer}
            >
              {rowElements.slice(0, VOLUME_PREVIEW)}
              <AnimatePresence initial={false}>
                {showAll && foldable && (
                  <motion.div
                    key="volume-rest"
                    initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    {rowElements.slice(VOLUME_PREVIEW)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {foldable && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg font-mono text-[9px] font-bold tracking-[0.18em] text-zinc-400 transition-colors hover:bg-white/[0.03] hover:text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    showAll && "rotate-180"
                  )}
                  aria-hidden
                />
                {showAll ? "SHOW LESS" : `SHOW ALL · ${rowElements.length}`}
              </button>
            )}
          </>
        ) : (
          /* R33-b — never-logged branch: the designed cold-start slot (KAEL has
           * exercise logs, so this branch stays strictly invisible for him).
           * No CTA chip: the raid map that earns the sets is the panel ABOVE
           * on this same tab — the hint points up instead of navigating.
           * R54-c1: the dramatic caps pair compressed to quiet sentence case
           * (the MEV→MRV meaning lives in the panel's InfoHint). */
          <div className="mt-3">
            <EmptySurface
              label="VOLUME LANDMARKS"
              line="Your first logged sets will land here"
              hint="Earn hard sets in the raid map above"
              glyph
            />
          </div>
        )}
      </div>
    </SystemPanel>
  )
}

/** GATES tab — the raid map + active session console. */
export function GatesTab({ hunter }: { hunter: HunterDTO }) {
  const { data, loading, reload } = useApi<SessionsRes>("/api/sessions")
  const { data: mastery } = useApi<MasteryDTO>("/api/mastery")
  const readiness = useApi<ReadinessRes>("/api/readiness")
  const { pushNotice, bumpRefresh } = useSystem()
  const [entering, setEntering] = useState<string | null>(null)

  const active = data?.active ?? null
  // R38: the rift day follows the HUNTER's midnight when a timezone is set —
  // the same day key the server grants by (routes use dayKeyIn(hunter.timezone)).
  const riftDay = dayKeyIn(hunter.timezone)
  const rift = riftOfTheDay(riftDay)
  const masteryByGate = new Map((mastery?.gates ?? []).map((g) => [g.gateId, g]))

  const enterGate = async (gateId: string, programDay?: number) => {
    if (entering || active) return
    setEntering(gateId)
    try {
      await api("/api/sessions", {
        method: "POST",
        body: JSON.stringify(programDay != null ? { gateId, programDay } : { gateId }),
      })
      pushNotice(
        programDay != null
          ? {
              kind: "info",
              title: "Program raid started",
              body: `Day ${programDay} is live — follow the plan checklist, then finish to earn XP.`,
            }
          : { kind: "info", title: "Session started", body: "Log your exercises, then finish to earn XP." }
      )
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Entry refused", body: (e as Error).message })
    } finally {
      setEntering(null)
    }
  }

  // Program-panel wiring (R1-b): start a plan day in the gate whose exercises
  // match the day's dominant block type — first matching gate, else the first gate.
  const onStartDay = (day: number, dominantType: ExerciseType) => {
    const gate = GATES.find((g) => g.exercises.some((e) => e.type === dominantType)) ?? GATES[0]
    void enterGate(gate.id, day)
  }

  // Readiness-driven program props: NEXT UP day + week-complete summary.
  const nextUpDay = readiness.data?.nextDay?.day ?? null
  const weekComplete =
    readiness.data?.nextDay?.allDone && readiness.data.week.planned > 0
      ? {
          daysDone: Math.min(readiness.data.nextDay.daysDone.length, readiness.data.week.planned),
          totalDays: readiness.data.week.planned,
        }
      : null

  // R33-b — cold-start week: readiness loaded with zero planned days AND zero
  // cleared sessions this week = a brand-new hunter with no program yet. The
  // designed empty slot replaces the flat one-liner strip (an active program —
  // KAEL's 3-day plan — always renders the live compliance meter).
  const weekEmpty =
    !!readiness.data && !readiness.loading && readiness.data.week.planned === 0 && readiness.data.week.done === 0

  if (loading && !data) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <SkeletonPanel label="SYNCING TRAINING PROGRAMS" rows={3} className="mx-auto max-w-3xl" />
      </div>
    )
  }

  if (active) {
    return (
      <SessionRaid
        hunter={hunter}
        session={active}
        onUpdated={reload}
        onClosed={reload}
      />
    )
  }

  return (
    <FlowGroup className="space-y-4 sm:space-y-5">
      {/* ── R1-b intelligence: readiness → week compliance → active protocol ── */}
      {/* R55-c second-pass declutter: the banner's advice sentence (the band's
          explanation — real content, but the score + band word already carry
          the verdict) stands down from the surface. readiness-banner.tsx is
          off-limits this round, so the hide is this wrapper's child selector
          (the R54-c1 oracle-badge idiom): the full advice still rides the
          banner's own aria-label for screen readers; if the banner's internal
          DOM ever changes, the line simply reappears — nothing breaks. */}
      <FlowItem className="[&>div>div>p>span:last-child]:hidden">
        <ReadinessBanner />
      </FlowItem>
      <FlowItem>
        {weekEmpty ? (
          <EmptySurface
            label="THIS WEEK"
            line="Your first program week lands here"
            hint="Forge a program in the plan panel below — free sessions count too"
          />
        ) : (
          <WeekCompliance />
        )}
      </FlowItem>
      {/* R2-b oracle tip — after the band stays the hero, before the protocol.
          R54-c1 declutter: the tip line stays; its decorative trailing
          "ORACLE" badge (aria-hidden chrome inside the shared oracle-tip.tsx)
          stands down via this wrapper's child selector — the shared component
          itself is untouched, so the other tabs render unchanged. */}
      <FlowItem className="[&>div>span:last-child]:hidden">
        <OracleTip tab="gates" />
      </FlowItem>

      {/* R54-c1 — the numbered "01 THE PLAN" section mark stood down; the
          ProgramPanel below carries its own single label. */}
      <FlowItem>
        <ProgramPanel onStartDay={onStartDay} nextUpDay={nextUpDay} weekComplete={weekComplete} />
      </FlowItem>

      {/* R54-c1 — the numbered "02 RAID MAP" mark stood down; the Training
          Programs panel self-labels (the shared raids InfoHint carries the
          editorial + science meaning, each card's citation rides its title). */}
      <FlowReveal>
        <SystemPanel
          label="Training Programs"
          labelAccent={
            <span className="flex items-center gap-1.5 text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
              <MapPin className="h-3 w-3" aria-hidden /> {GATES.length} TYPES
              {/* R54-c1 declutter: the panel's editorial paragraph (multipliers,
                  one session at a time, finish what you start) AND the five
                  cards' SCIENCE citation lines folded into this shared hint —
                  each card's own citation rides its title attribute. */}
              <InfoHint term="raids" />
            </span>
          }
        >
        <div className="p-4 sm:p-5">
          <div>
            <RiftBanner
              gateName={rift.gateName}
              bonusMult={rift.bonusMult}
              onEnter={() => enterGate(rift.gateId)}
              timezone={hunter.timezone}
            />
          </div>

          <BossBanner onEnterGate={enterGate} disabled={entering !== null} timezone={hunter.timezone} />

          <GateNetworkDivider />

          {/* R29-b — HRV modulation strip: the readiness band's training dial,
           *  sitting directly above the gate cards it modulates */}
          <div className="mt-4">
            <HrvModulationStrip
              modulation={readiness.data?.hrvModulation ?? null}
              hrvMs={readiness.data?.hrvMs ?? null}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {GATES.map((gate) => {
              const Icon = GATE_ICONS[gate.glyph] ?? Castle
              const riftGate = isRiftGate(gate.id, riftDay)
              const science = GATE_SCIENCE[gate.id] ?? null
              return (
                /* R9-b — cards reveal as they scroll into view: the long raid
                 * map keeps moving as you read (kit FlowReveal + liftMotion) */
                /* R54-c1 declutter: the epithet, description and SCIENCE
                 * citation lines left the card face — the full text rides
                 * this title (meaning: the raids InfoHint on the panel label).
                 * Face keeps name, meta line, rank, mastery, exercise chips
                 * and the 44px START button. */
                <FlowReveal
                  key={gate.id}
                  {...liftMotion}
                  title={`${gate.epithet} — ${gate.desc}${science ? ` · ${science.body} · ${science.source}` : ""}`}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-5 transition-colors",
                    riftGate
                      ? "border-amber-400/40 bg-gradient-to-br from-amber-500/[0.07] via-zinc-950/70 to-zinc-950/60 shadow-[0_0_22px_rgba(245,158,11,0.15)] md:-translate-y-1.5 md:shadow-[0_10px_34px_rgba(245,158,11,0.22)]"
                      : cn("bg-gradient-to-b from-white/[0.045] to-white/[0.015] shadow-[0_8px_24px_rgba(0,0,0,0.25)]", gate.frame)
                  )}
                >
                  {/* aura — intensifies on hover (rift gate glows ember-amber) */}
                  <div
                    className={cn(
                      "pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br to-transparent blur-2xl",
                      "opacity-50 transition-opacity duration-500 group-hover:opacity-100",
                      riftGate ? "from-amber-400/25" : gate.aura
                    )}
                    aria-hidden
                  />
                  {/* rift sigil watermark — concentric rotated squares */}
                  {riftGate && (
                    <div
                      className="rift-sigil pointer-events-none absolute -right-12 top-1/2 h-44 w-44 -translate-y-1/2 border border-amber-400/[0.14] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
                      aria-hidden
                    >
                      <span className="absolute inset-4 border border-amber-400/10" />
                      <span className="absolute inset-9 border border-amber-400/[0.07]" />
                    </div>
                  )}
                  {/* rising rift embers */}
                  {riftGate && (
                    <>
                      <span className="rift-ember" style={{ left: "16%", width: 3, height: 3, "--rift-delay": "0s", "--rift-dur": "6.5s", "--rift-drift": "12px" } as React.CSSProperties} aria-hidden />
                      <span className="rift-ember" style={{ left: "44%", width: 2, height: 2, "--rift-delay": "2.4s", "--rift-dur": "7.8s", "--rift-drift": "-10px" } as React.CSSProperties} aria-hidden />
                      <span className="rift-ember" style={{ left: "71%", width: 3, height: 3, "--rift-delay": "1.2s", "--rift-dur": "7s", "--rift-drift": "14px" } as React.CSSProperties} aria-hidden />
                      <span className="rift-ember" style={{ left: "92%", width: 2, height: 2, "--rift-delay": "3.8s", "--rift-dur": "8.2s", "--rift-drift": "-8px" } as React.CSSProperties} aria-hidden />
                    </>
                  )}
                  <div className="pointer-events-none absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-violet-500/5 blur-xl" aria-hidden />
                  {/* animated scan line — sweeps the card border on hover */}
                  <div
                    className="gate-scan pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    aria-hidden
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "grid h-11 w-11 place-items-center rounded-full border bg-white/[0.04]",
                          riftGate ? "border-amber-400/40" : gate.frame
                        )}
                      >
                        <Icon
                          className={cn("h-5 w-5 gate-drift", riftGate ? "text-amber-300" : gate.accent)}
                          aria-hidden
                        />
                      </div>
                      <div>
                        <h3
                          className={cn(
                            "font-mono text-base font-bold tracking-wider",
                            riftGate ? "text-amber-200" : gate.accent
                          )}
                        >
                          {gate.name}
                        </h3>
                        <p className="mt-0.5 text-[10px] font-mono tabular-nums tracking-widest text-zinc-400">
                          {gate.exercises.length} EXERCISES ·{" "}
                          <span className={riftGate ? "text-amber-300" : undefined}>
                            ×{riftGate ? rift.bonusMult : gate.xpMultiplier} XP
                          </span>
                          {riftGate && (
                            /* R9-b — today's featured gate: the bonus marker glows */
                            <span className="rift-glyph sys-bloom-amber ml-1.5 select-none text-amber-400/90" aria-label="Daily bonus active">
                              ◈ BONUS
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <RankBadge rank={gate.rank} size="sm" />
                  </div>

                  <div className="relative">
                    <MasteryRow m={masteryByGate.get(gate.id)} riftGate={riftGate} />
                  </div>

                  <div className="relative mt-4 flex flex-wrap gap-1.5">
                    {gate.exercises.slice(0, 4).map((e) => (
                      <span key={e.id} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] font-medium tracking-wide text-zinc-400">
                        {e.name}
                      </span>
                    ))}
                    {gate.exercises.length > 4 && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] font-medium tracking-wide text-zinc-400">
                        +{gate.exercises.length - 4} more
                      </span>
                    )}
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => enterGate(gate.id)}
                    disabled={entering !== null}
                    aria-busy={entering === gate.id}
                    className={cn(
                      "pill-action relative mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full border",
                      riftGate
                        ? "border-amber-400/40 bg-amber-500/15 text-[10px] font-bold tracking-[0.12em] text-amber-200 uppercase transition-colors hover:bg-amber-500/30 hover:shadow-[0_0_34px_rgba(245,158,11,0.55)] active:bg-amber-500/45"
                        : "border-violet-400/40 bg-violet-500/15 text-[10px] font-bold tracking-[0.12em] text-violet-200 uppercase transition-colors hover:bg-violet-500/35 hover:shadow-[0_0_34px_rgba(139,92,246,0.6)] active:bg-violet-500/45 active:shadow-[0_0_28px_rgba(139,92,246,0.55)]",
                      "disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                    )}
                  >
                    <Zap className="h-3.5 w-3.5" aria-hidden />
                    {entering === gate.id ? "STARTING…" : riftGate ? "START BONUS SESSION" : "START WORKOUT"}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                  </motion.button>
                </FlowReveal>
              )
            })}
          </div>
        </div>
        </SystemPanel>
      </FlowReveal>

      {/* R54-c1 — the numbered "03 VOLUME" mark stood down; the Volume
          Landmarks panel self-labels. */}
      <FlowReveal>
        <VolumeLandmarksPanel />
      </FlowReveal>
    </FlowGroup>
  )
}
