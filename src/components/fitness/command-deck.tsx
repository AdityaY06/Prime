"use client"

import { motion } from "framer-motion"
import { ArrowRight, Dumbbell, Flame, Gem, Sparkles, Timer, TrendingUp, Zap } from "lucide-react"
import { MeterFlow, useCountUp } from "@/components/system/motion"
import { InfoHint } from "@/components/system/info-hint"
import { ARCHETYPES, dayKey, formatDayLabel } from "@/lib/game"
import { riftOfTheDay } from "@/lib/rift"
import type { HunterDTO, QuestDTO, SessionDTO } from "@/lib/types"
import { useSystem } from "@/store/system-store"
import { cn } from "@/lib/utils"

/** R45 · Phase D — LAYER A: THE COMMAND DECK.
 *
 * The immersive brief's "Status becomes the main command center": the tab's
 * opening moment composes one cinematic band — a time-aware editorial
 * greeting, a five-readout telemetry strip (XP / LEVEL / STREAK / CREDITS /
 * COMBAT POWER — every numeral flows in from zero via the shared count-up),
 * and a single truthful verdict pill whose priority is derived from live
 * state (active session > goals ready to claim > day banked > begin today's
 * session). No data is fabricated: every readout comes from the hunter DTO
 * the tab already fetched. The detailed HunterCard panel below is unchanged
 * — this band is the glanceable summary, that panel the deep identity.
 */
export function CommandDeck({
  hunter,
  dailies,
  active,
  trainedToday,
}: {
  hunter: HunterDTO
  dailies: QuestDTO[]
  active: SessionDTO | null
  trainedToday: boolean
}) {
  const { setTab } = useSystem()

  // flow numerals — mount from zero, glide between values on refresh
  const xp = useCountUp(hunter.xp)
  const level = useCountUp(hunter.level)
  const streak = useCountUp(hunter.streak)
  const essence = useCountUp(hunter.essence)
  const power = useCountUp(hunter.power)

  const arch = ARCHETYPES.find((a) => a.id === hunter.archetype)

  // time-aware greeting — the tab renders client-only (ssr:false dynamic
  // import), so a render-time hour read is hydration-safe
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening"

  const rift = riftOfTheDay()
  const readyToClaim = dailies.filter((d) => d.completed && !d.claimed).length

  // the verdict — the command center's single primary action, derived from
  // live state in strict priority order. `hot` marks actionable-now moments
  // (violet identity chrome); the settled "day banked" state reads neutral.
  const verdict = active
    ? {
        key: "SESSION LIVE",
        detail: `${active.gateName} — resume in Training`,
        tab: "gates" as const,
        icon: Timer,
        hot: true,
        hint: null,
      }
    : readyToClaim > 0
      ? {
          key: `${readyToClaim} GOAL${readyToClaim === 1 ? "" : "S"} READY`,
          detail: "Claim the harvest in Goals",
          tab: "directives" as const,
          icon: Sparkles,
          hot: true,
          hint: null,
        }
      : trainedToday
        ? {
            key: "DAY BANKED",
            detail: `${rift.gateName} still burns at ×${rift.bonusMult} — go again?`,
            tab: "gates" as const,
            icon: TrendingUp,
            hot: false,
            hint: null,
          }
        : {
            key: "BEGIN TODAY'S SESSION",
            detail: `Today's rift: ${rift.gateName} · ×${rift.bonusMult} XP`,
            tab: "gates" as const,
            icon: Dumbbell,
            hot: true,
            hint: "rift" as const,
          }
  const VerdictIcon = verdict.icon

  const xpPct = Math.min(100, (hunter.xp / hunter.xpNeeded) * 100)

  return (
    <div className="px-1 pt-2">
      {/* the greeting moment — line-reveal mask + one true-italic flourish
          (the tab's R42 heading language, now personal) */}
      <h2 className="line-reveal font-display text-[2.35rem] font-medium leading-[1.04] text-zinc-50">
        <span className="block" style={{ "--line-delay": "0.12s" } as React.CSSProperties}>
          {greeting}, <span className="sys-italic text-amber-100">{hunter.name}</span>.
        </span>
      </h2>
      <p className="mt-2.5 text-[11px] font-medium tracking-wide text-zinc-400">
        {formatDayLabel(dayKey())} · {hunter.rank}-RANK
        {arch ? ` · ${arch.name}` : ""} · {hunter.totalSessions} SESSION
        {hunter.totalSessions === 1 ? "" : "S"} LOGGED
      </p>

      {/* the telemetry strip — five command readouts over one hairline.
          Mobile: the XP story owns a full row, then 2×2; sm: XP spans two
          tracks beside LEVEL, then a 3-row; lg: one composed line of five. */}
      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-zinc-800/60 pt-5 sm:grid-cols-3 lg:grid-cols-5">
        {/* XP — the progress story, in the identity's violet aurora */}
        <div className="col-span-2 sm:col-span-2 lg:col-span-1">
          <p className="sys-label flex items-center gap-1 text-[8px] text-zinc-500">
            XP · TO LEVEL {hunter.level + 1}
            <InfoHint term="xp" />
          </p>
          <p className="sys-display mt-1.5 text-2xl tabular-nums text-zinc-100">
            {Math.round(xp).toLocaleString()}
            <span className="text-sm text-zinc-500"> / {hunter.xpNeeded.toLocaleString()}</span>
          </p>
          <div
            className="aurora-track mt-3"
            role="progressbar"
            aria-valuenow={hunter.xp}
            aria-valuemin={0}
            aria-valuemax={hunter.xpNeeded}
            aria-label={`XP progress to level ${hunter.level + 1}: ${hunter.xp} of ${hunter.xpNeeded}`}
          >
            <MeterFlow inView pct={xpPct} className="aurora-fill aurora-fill-violet" style={{ transition: "none" }} />
          </div>
        </div>

        {/* LEVEL — the anchor numeral, carrying the identity's glow */}
        <div>
          <p className="sys-label text-[8px] text-zinc-500">LEVEL</p>
          <p className="sys-display mt-1.5 text-3xl tabular-nums text-violet-100 drop-shadow-[0_0_16px_rgba(167,139,250,0.4)]">
            {Math.round(level)}
          </p>
        </div>

        {/* DAY STREAK — the fire */}
        <div>
          <p className="sys-label flex items-center gap-1 text-[8px] text-zinc-500">
            DAY STREAK
            <InfoHint term="streak" />
          </p>
          <p className="sys-display mt-1.5 flex items-center gap-1.5 text-2xl tabular-nums text-amber-100">
            <Flame
              className="h-4 w-4 shrink-0 text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.55)]"
              aria-hidden
            />
            {Math.round(streak)}
          </p>
        </div>

        {/* CREDITS — the forge currency, teal by domain law */}
        <div>
          <p className="sys-label flex items-center gap-1 text-[8px] text-zinc-500">
            CREDITS
            <InfoHint term="credits" />
          </p>
          <p className="sys-display mt-1.5 flex items-center gap-1.5 text-2xl tabular-nums text-zinc-100">
            <Gem className="h-4 w-4 shrink-0 text-teal-400/90 drop-shadow-[0_0_5px_rgba(45,212,191,0.45)]" aria-hidden />
            {Math.round(essence).toLocaleString()}
          </p>
        </div>

        {/* COMBAT POWER */}
        <div>
          <p className="sys-label flex items-center gap-1 text-[8px] text-zinc-500">
            COMBAT POWER
            <InfoHint term="power" />
          </p>
          <p className="sys-display mt-1.5 flex items-center gap-1.5 text-2xl tabular-nums text-zinc-100">
            <Zap className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
            {Math.round(power).toLocaleString()}
          </p>
        </div>
      </div>

      {/* the verdict — the hero's single primary action. Inherits the raid
          CTA's glass-capsule language (now in the R44 violet identity chrome)
          and its priority logic; the scattered CTAs it replaces live on as
          the destination index's live badges. R52 declutter: it renders as a
          role="button" DIV (keyboard-wired) so the rift InfoHint glyph can
          sit inside the detail line without nesting interactive elements. */}
      <motion.div
        role="button"
        tabIndex={0}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setTab(verdict.tab)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setTab(verdict.tab)
          }
        }}
        className="aura-glow aura-glow-violet glass-pill glass-pill-violet pill-action group mt-6 flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <div
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-full border",
            verdict.hot
              ? "border-violet-400/40 bg-violet-500/15"
              : "border-zinc-600/50 bg-zinc-700/20"
          )}
        >
          <VerdictIcon
            className={cn("h-6 w-6", verdict.hot ? "text-violet-300" : "text-zinc-300")}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-bold tracking-wide", verdict.hot ? "text-violet-100" : "text-zinc-100")}>
            {verdict.key}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-zinc-400">
            {verdict.detail}
            {verdict.hint && <InfoHint term={verdict.hint} />}
          </p>
        </div>
        <ArrowRight
          className="h-5 w-5 shrink-0 text-violet-400 transition-transform group-hover:translate-x-1"
          aria-hidden
        />
      </motion.div>
    </div>
  )
}
