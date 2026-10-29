"use client"

/**
 * R57 · CLEAN SLATE — the app chrome.
 *
 * TopBar: white, soft 2px border, the PRIME monogram, and the three quiet
 * stat pills that matter every single day — streak flame, XP, level. The
 * gear keeps the full SettingsDialog (voice, data, PWA) one tap away.
 *
 * TabBar: the six-facade dock — Home / Train / Log / Stats / Science / You —
 * big 56px targets, icon + tiny bold label, green when active. Persistent on
 * mobile AND desktop (the centered app-dock keeps the whole app feeling
 * like one friendly phone app, exactly the Duolingo register).
 *
 * R70-a — Science joins the ring between Stats and You (FlaskConical); the
 * dock grid widens to six equal columns (~57px each at 360px — still ≥44px
 * touch targets, the kit law).
 */

import { useEffect, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  Dumbbell,
  FlaskConical,
  Flame,
  Gem,
  House,
  LineChart,
  NotebookPen,
  Settings,
  UserRound,
  Zap,
} from "lucide-react"
import { useSystem, type Tab } from "@/store/system-store"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SettingsDialog } from "@/components/system/settings-dialog"
import { SPRING_SNAPPY } from "@/components/system/motion"
import { fmt } from "./kit"

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "train", label: "Train", icon: Dumbbell },
  { id: "log", label: "Log", icon: NotebookPen },
  { id: "stats", label: "Stats", icon: LineChart },
  { id: "science", label: "Science", icon: FlaskConical },
  { id: "you", label: "You", icon: UserRound },
]

/* ── TopBar ──────────────────────────────────────────────────────────────── */

export function TopBar({ hunter }: { hunter: HunterDTO }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const reduce = useReducedMotion()
  const streakHot = hunter.streak > 0

  // R59 — the iOS large-title idiom: the sticky header stays flat while the
  // page sits at the top, then earns a soft shadow once it actually floats
  // over scrolled content (passive listener, threshold 8px).
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "prime-topbar sticky top-0 z-50 border-b-2 border-[#e5e5e5] bg-white/90 backdrop-blur-md",
        scrolled && "prime-topbar-scrolled",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-[680px] items-center gap-2 px-4">
        {/* brand — R59: the monogram gains a vertical light gradient and the
            wordmark flows ink→green (the Stripe idiom, @supports-guarded) */}
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#61d905] to-[#4fbe02] shadow-[0_3px_0_0_#46a302]">
          <span className="text-lg font-black leading-none text-white" aria-hidden>
            P
          </span>
        </div>
        <p className="prime-wordmark mr-1 text-lg font-black tracking-tight">prime</p>

        {/* daily pills */}
        <div className="ml-auto flex items-center gap-2">
          <div
            className="flex h-9 items-center gap-1.5 rounded-full border-2 border-[#e5e5e5] bg-white px-3"
            title={`${hunter.streak}-day streak — best ${hunter.bestStreak}`}
          >
            <Flame
              className={cn(
                "h-4 w-4",
                streakHot && "prime-flame",
                streakHot ? "fill-[#ff9600] text-[#ff9600]" : "text-[#8a8a8a]",
              )}
              aria-hidden
            />
            <span className="text-sm font-black tabular-nums text-[#3c3c3c]">{hunter.streak}</span>
          </div>
          <div
            className="hidden h-9 items-center gap-1.5 rounded-full border-2 border-[#e5e5e5] bg-white px-3 sm:flex"
            title={`${fmt(hunter.totalXp)} total XP`}
          >
            <Zap className="h-4 w-4 fill-[#ffc800] text-[#ffc800]" aria-hidden />
            <span className="text-sm font-black tabular-nums text-[#3c3c3c]">
              {fmt(hunter.totalXp)}
            </span>
          </div>
          <div
            className="hidden h-9 items-center gap-1.5 rounded-full border-2 border-[#e5e5e5] bg-white px-3 md:flex"
            title={`${fmt(hunter.essence)} essence — spend it in You → Rewards`}
          >
            <Gem className="h-4 w-4 text-[#0faf9a]" aria-hidden />
            <span className="text-sm font-black tabular-nums text-[#3c3c3c]">
              {fmt(hunter.essence)}
            </span>
          </div>
          <div
            className="grid h-9 place-items-center rounded-full bg-[#58cc02] px-3 shadow-[0_3px_0_0_#46a302]"
            title={`Level ${hunter.level} — ${fmt(hunter.xp)} / ${fmt(hunter.xpNeeded)} XP`}
          >
            {/* R58 — the level numeral pops once per level change (keyed remount
                fires only on a genuine level-up, never during tab swaps) */}
            <motion.span
              key={hunter.level}
              initial={reduce ? false : { scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 480, damping: 22 }}
              className="text-sm font-black tabular-nums text-white"
            >
              LV {hunter.level}
            </motion.span>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="grid h-11 w-11 place-items-center rounded-xl text-[#5c5c5c] transition-colors hover:bg-[#f7f7f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]"
          >
            {/* R68 — gear #777 → #5c5c5c: VLM "ghost-like, easy to miss" on
                every facade's top-right; the icon gains real ink weight. */}
            <Settings className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        hunterName={hunter.name}
      />
    </header>
  )
}

/* ── TabBar — the six-facade dock ───────────────────────────────────────── */

export function TabBar() {
  const { tab, setTab } = useSystem()
  const reduce = useReducedMotion()

  return (
    <nav
      aria-label="Primary"
      className="prime-tabbar fixed inset-x-0 bottom-0 z-50 border-t-2 border-[#e5e5e5]"
    >
      <div className="mx-auto grid max-w-[680px] grid-cols-6 px-2 py-1.5">
        {TABS.map((t) => {
          const active = tab === t.id
          const Icon = t.icon
          return (
            <motion.button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              whileTap={reduce ? undefined : { scale: 0.92 }}
              className={cn(
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl py-1",
                "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                // R68 — active #58a700 → #3f9102: 2.5:1 on the mint pill was
                // the weakest nav state; now 3.6:1 on the pill / 4.0:1 on white
                // (redundantly encoded anyway: pill + weight + icon bounce).
                active ? "text-[#3f9102]" : "text-[#5c5c5c] hover:text-[#3c3c3c]",
              )}
            >
              {/* R58 — the gliding active pill (the legacy bottomnav-indicator
                  idiom, proven with the page crossfade since R14: conditional
                  mount + layoutId handoff, no AnimatePresence, no remounts of
                  keyed spans during the swap commit). */}
              {active && (
                <motion.span
                  layoutId={reduce ? undefined : "prime-tab-pill"}
                  className="absolute inset-1 rounded-xl bg-[#e8f8d8]"
                  transition={SPRING_SNAPPY}
                  aria-hidden
                />
              )}
              {/* the icon: plain span + CSS bounce class on activation — pure
                  CSS animation, outside framer's scheduler entirely, so it can
                  never disturb the page-level AnimatePresence transitions */}
              <span
                className={cn(
                  "relative grid place-items-center",
                  active && "prime-tab-bounce",
                )}
              >
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <span
                className={cn(
                  "relative text-[11px]",
                  active ? "font-black" : "font-bold",
                )}
              >
                {t.label}
              </span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
