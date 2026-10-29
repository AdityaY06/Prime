"use client"

import { useEffect, useState } from "react"
import { Dumbbell, Flame, Gem, Gift, HeartPulse, LineChart, ListChecks, PersonStanding, Settings, Sparkles, UserRound, Volume2, VolumeX } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { hydrateVoicePref, useSystem, type Tab } from "@/store/system-store"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "@/components/system/settings-dialog"
import { FLOW_EASE, SPRING_SNAPPY, useCountUp } from "@/components/system/motion"
// R52 declutter — marquee stands down; component retained

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "status", label: "Status", icon: UserRound },
  { id: "directives", label: "Goals", icon: ListChecks },
  { id: "gates", label: "Training", icon: Dumbbell },
  { id: "body", label: "Body", icon: PersonStanding },
  { id: "fuel", label: "Fuel", icon: Flame },
  { id: "vitals", label: "Vitals", icon: HeartPulse },
  { id: "records", label: "Progress", icon: LineChart },
  { id: "forge", label: "Rewards", icon: Gift },
]

export function TopNav({ hunter }: { hunter: HunterDTO }) {
  const { tab, setTab } = useSystem()
  const voiceEnabled = useSystem((s) => s.voiceEnabled)
  const speaking = useSystem((s) => s.speaking)
  const setVoiceEnabled = useSystem((s) => s.setVoiceEnabled)
  const speak = useSystem((s) => s.speak)
  const reduce = useReducedMotion()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // R14-a — the mini status numerals count up from zero on mount and glide to
  // new values on refresh; tabular-nums keeps digits from jittering. The
  // LV / RANK numeral and the streak glyph stay static (level is celebrated
  // elsewhere); useCountUp is reduce-aware for free (instant final value).
  const xpShown = useCountUp(hunter.xp)
  const xpNeededShown = useCountUp(hunter.xpNeeded)
  const essenceShown = useCountUp(hunter.essence)

  // hydrate the persisted voice preference once, client-side
  useEffect(() => {
    hydrateVoicePref()
  }, [])

  const toggleVoice = () => {
    const next = !voiceEnabled
    setVoiceEnabled(next)
    if (next) speak("Voice of the System restored.")
  }

  return (
    <>
    {/* R20-a — notch safe area: with viewport-fit=cover the header owns the
        status-bar strip on notched phones; padding pushes the content row
        down while the header bg extends under the status bar. Desktop env()
        resolves to 0 — byte-identical there. */}
    <header
      className="sticky top-0 z-50 border-b border-violet-500/10 bg-[#09090a]/85 backdrop-blur-xl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* R42 — breathing room: the chrome row pads ~1.5× taller so the
          header keeps Mirage-scale whitespace. */}
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4.5 md:px-6">
        {/* R14-a boot choreography — header contents + desktop tab buttons rise
            in one stagger wave on FIRST MOUNT only (initial=, never re-run:
            these components persist across tab changes). Transforms only →
            zero layout shift. Reduced motion → no stagger at all. */}
        {/* brand — wave head (delay 0.05, level with the first tab button) */}
        <motion.div
          className="flex items-center gap-2.5"
          initial={reduce ? undefined : { opacity: 0, y: -6 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={reduce ? undefined : { duration: 0.4, ease: FLOW_EASE, delay: 0.05 }}
        >
          {/* R43 — the brand mark is a solid-ivory monogram badge: a bold
              grotesque "P" on the void canvas (the Mirage register — white
              mark, black studio). Static — a mark doesn't sway. */}
          <div className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 shadow-[0_0_16px_rgba(255,255,255,0.16)]">
            <span className="font-sans text-sm font-bold leading-none tracking-tight text-zinc-950" aria-hidden>
              P
            </span>
          </div>
          <div className="hidden sm:block">
            {/* R43 — the wordmark sets in the grotesque (Space Grotesk, the
                PPPangramSans register); the sub-label is pure studio. */}
            <p className="font-sans text-sm font-semibold tracking-[0.12em] text-violet-100">PRIME</p>
            <p className="sys-label text-[7px] text-zinc-400">TRAINING STUDIO</p>
          </div>
        </motion.div>

        {/* desktop tabs — the active pill glides between tabs */}
        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Primary">
          {TABS.map((t, i) => {
            const active = tab === t.id
            return (
              <motion.button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                initial={reduce ? undefined : { opacity: 0, y: -6 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={reduce ? undefined : { duration: 0.4, ease: FLOW_EASE, delay: 0.05 + i * 0.03 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                className={cn(
                  "grove-press relative rounded-full px-3.5 py-2 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors",
                  "focus-visible:outline focus-visible:outline-violet-400/70",
                  active ? "text-violet-200" : "text-zinc-400 hover:bg-violet-500/5 hover:text-violet-300"
                )}
              >
                {active && (
                  <motion.span
                    layoutId={reduce ? undefined : "topnav-indicator"}
                    className="absolute inset-0 rounded-full border border-violet-400/50 bg-violet-500/15 shadow-[0_0_14px_rgba(255,255,255,0.14)]"
                    transition={SPRING_SNAPPY}
                    aria-hidden
                  />
                )}
                <span className="relative">{t.label}</span>
              </motion.button>
            )
          })}
        </nav>

        {/* mini status (all sizes) — wave tail, after the 8 tab buttons */}
        <motion.div
          className="ml-auto flex items-center gap-3 md:ml-3"
          initial={reduce ? undefined : { opacity: 0, y: -6 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={reduce ? undefined : { duration: 0.4, ease: FLOW_EASE, delay: 0.05 + TABS.length * 0.03 }}
        >
          <div className="text-right">
            <p className="text-xs font-bold tabular-nums tracking-wider text-violet-100">
              LV.{hunter.level}
              <span className="ml-1.5 text-violet-400">{hunter.rank}-RANK</span>
            </p>
            <p className="text-[9px] tabular-nums text-zinc-400">
              {Math.round(xpShown)}/{Math.round(xpNeededShown)} XP
            </p>
          </div>
          <div className="hidden h-8 w-px bg-violet-500/15 sm:block" aria-hidden />
          <p className="hidden items-center gap-1.5 text-[10px] font-bold tabular-nums tracking-widest text-amber-400/90 sm:block">
            <span className="h-1 w-1 rounded-full bg-amber-400/90" aria-hidden />
            {hunter.streak}D
          </p>
          <div className="hidden h-8 w-px bg-violet-500/15 sm:block" aria-hidden />
          <span
            className="flex items-center gap-1.5 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-1"
            title="Credits — spend them in the Rewards shop"
          >
            <Gem
              className="h-3 w-3 text-zinc-300"
              aria-hidden
            />
            <span className="text-[10px] font-bold tabular-nums text-zinc-200">
              {Math.round(essenceShown).toLocaleString()}
            </span>
          </span>
          {/* System Voice toggle */}
          {speaking && (
            <span
              className="pointer-events-none hidden items-center gap-1.5 text-[8px] font-bold tracking-[0.12em] text-violet-300/80 lg:flex"
              aria-hidden
            >
              <span className="sys-pulse h-1 w-1 rounded-full bg-violet-400" aria-hidden /> SPEAKING
            </span>
          )}
          <button
            onClick={toggleVoice}
            aria-label={speaking ? "System voice speaking" : voiceEnabled ? "Mute the System voice" : "Unmute the System voice"}
            aria-pressed={voiceEnabled}
            title={speaking ? "The System is speaking" : voiceEnabled ? "System voice: ON" : "System voice: MUTED"}
            className={cn(
              "grove-press relative grid h-9 w-9 place-items-center rounded-full border transition-all",
              "after:absolute after:-inset-[5px] after:content-['']",
              "focus-visible:opacity-100 focus-visible:outline focus-visible:outline-violet-400/70",
              "opacity-60 hover:opacity-100",
              voiceEnabled
                ? "border-violet-400/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                : "border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:text-violet-300",
              speaking && "voice-live"
            )}
          >
            {voiceEnabled ? (
              speaking ? (
                <span className="voice-eq flex items-end text-violet-300" aria-label="System speaking">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <Volume2 className="h-3.5 w-3.5" aria-hidden />
              )
            ) : (
              <VolumeX className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          {/* System settings — same secondary-chrome fade as the voice toggle */}
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Open system settings"
            title="System settings"
            className={cn(
              "grove-press relative grid h-9 w-9 place-items-center rounded-full border transition-all",
              "after:absolute after:-inset-[5px] after:content-['']",
              "focus-visible:opacity-100 focus-visible:outline focus-visible:outline-violet-400/70",
              "opacity-60 hover:opacity-100",
              "border-zinc-700/60 bg-zinc-900/60 text-zinc-400 hover:border-violet-400/40 hover:text-violet-300"
            )}
          >
            <Settings className="h-3.5 w-3.5" aria-hidden />
          </button>
        </motion.div>
      </div>
      {/* R52 declutter — marquee stands down; component retained (grove-marquee.tsx). */}
    </header>
    <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} hunterName={hunter.name} />
    </>
  )
}

export function BottomNav() {
  const { tab, setTab } = useSystem()
  const reduce = useReducedMotion()

  return (
    <nav
      className="glass-pill fixed inset-x-2.5 z-50 backdrop-blur-md md:hidden"
      aria-label="Primary mobile"
      style={{
        /* R42 floating capsule — same safe-area contract as before, inverted:
          the env() inset still guarantees the bar never sits under the home
          indicator; instead of padding the bar from inside, it floats a
          knuckle's width (0.625rem) above the safe-area line. Desktop env()
          resolves to 0 — and the bar is md:hidden there anyway. */
        bottom: "calc(env(safe-area-inset-bottom) + 0.625rem)",
      }}
    >
      {/* soft ivory-to-transparent hairline along the capsule's top edge —
          light catching the lip of the glass */}
      <div
        className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-zinc-300/40 to-transparent"
        aria-hidden
      />
      {/* R14-a — the 8 mobile buttons rise from y:8 in the same mount-only
          stagger family as the TopNav (0.08 + i*0.03); reduce → no stagger.
          R42: the bar is a floating glass capsule; the active tile carries a
          breathing aura-glow halo behind its icon (rounded-full so the halo
          inherits a circular lip) plus the gliding underline. */}
      <div className="grid grid-cols-8 py-1">
        {TABS.map((t, i) => {
          const active = tab === t.id
          const Icon = t.icon
          return (
            <motion.button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              initial={reduce ? undefined : { opacity: 0, y: 8 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={reduce ? undefined : { duration: 0.4, ease: FLOW_EASE, delay: 0.08 + i * 0.03 }}
              whileTap={reduce ? undefined : { scale: 0.92 }}
              className={cn(
                "grove-press relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-full px-1 py-2 transition-colors",
                "focus-visible:outline focus-visible:outline-violet-400/70",
                active && "aura-glow",
                active ? "text-violet-300" : "text-zinc-400"
              )}
            >
              <motion.span
                animate={
                  reduce
                    ? undefined
                    : active
                      ? { scale: 1.12, y: -1 }
                      : { scale: 1, y: 0 }
                }
                transition={{ type: "spring", stiffness: 400, damping: 18 }}
                className="flex"
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_rgba(255,255,255,0.5)]")} aria-hidden />
              </motion.span>
              <span className={cn("text-[8px] font-bold tracking-[0.05em]", active && "text-violet-300")}>
                {t.label.toUpperCase()}
              </span>
              {active && (
                <motion.span
                  layoutId={reduce ? undefined : "bottomnav-indicator"}
                  className="absolute bottom-1 h-0.5 w-8 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                  transition={SPRING_SNAPPY}
                  aria-hidden
                />
              )}
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
