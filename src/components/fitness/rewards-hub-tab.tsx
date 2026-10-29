"use client"

// ── PRIME · Rewards hub (Task 13 · R10-a identity pass) ───────────────────────
// Merges the former standalone Rewards (Forge shop) and Badges (Titles
// collection) tabs into a single hub with an internal SHOP / BADGES switch,
// freeing a nav slot for the Fuel tab.
//
// R10-a — the hub now speaks the R9/R10 identity language: a plain root with
// FlowGroup orchestrating ONLY the above-fold masthead (tab header + the
// 01 / VAULT essence hero + the view switch), while the active view below
// scroll-reveals as a FlowReveal sibling (R9-c gating pattern). The essence
// balance is the tab's ONE hero numeral (sys-display-lg + count-up + teal
// bloom — teal is the app's pre-existing essence identity), with streak and
// session totals as borderless sys-accent-row micro-stats: they are the two
// faucets that pay essence ("SESSION COMPLETE + STREAK").
//
// R15 — flow round 2: the vault micro-stats count up alongside the hero
// numeral (reward-amount numerals, useCountUp), the SHOP / BADGES switch
// buttons rise in a micro-stagger and take a true spring press (tapMotion;
// their transition-all is scoped to the color set so the CSS engine never
// tweens framer's transform writes), and the view swap rides the flow
// language (0.25s FLOW_EASE, reduced-motion gated — it previously animated
// ungated). No claim state lives in this file (claims fire from Goals /
// Records and celebrate via the R14-c row bloom + the reward overlay), so
// the claim-moment treatment lands inside the embedded Forge / Titles tabs.

import { useState } from "react"
import { Award, Dumbbell, Flame, Gem, Gift } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { FlowGroup, FlowItem, FlowReveal, DecodeText, useCountUp, FLOW_EASE, tapMotion } from "@/components/system/motion"
// R54-c4 declutter — the numbered SysSection marks (01 VAULT / 02 FORGE)
// stood down (R53-a recipe); the panels below self-label, so section-mark is
// no longer imported.
import { ForgeTab } from "./forge-tab"
import { TitlesTab } from "./titles-tab"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

type HubView = "shop" | "badges"

// accent-row hues — all pre-existing palette (amber-400 / violet-400)
const ROW_AMBER = {
  "--row-accent": "rgba(251,191,36,0.7)",
  "--row-lift": "rgba(251,191,36,0.07)",
} as React.CSSProperties
const ROW_VIOLET = {
  "--row-accent": "rgba(167,139,250,0.7)",
  "--row-lift": "rgba(167,139,250,0.07)",
} as React.CSSProperties

/** Borderless micro-stat — value outweighs its tiny label (hunter-card idiom).
 *  R15 — the value is a numeral and counts up (useCountUp self-gates on
 *  reduced motion; a live hunter refresh glides it to the new total). */
function VaultStat({
  icon,
  value,
  label,
  accent,
  iconClass,
}: {
  icon: React.ReactNode
  value: number
  label: string
  accent: React.CSSProperties
  iconClass?: string
}) {
  const shown = useCountUp(value)
  return (
    <div className="sys-accent-row rounded-r-sm px-2.5 py-1.5" style={accent}>
      <p className="flex items-center gap-1.5 font-mono text-base font-bold tabular-nums leading-none text-zinc-100">
        {icon}
        {Math.round(shown).toLocaleString()}
      </p>
      <p className="mt-1 font-mono text-[8px] tracking-[0.22em] text-zinc-400">{label}</p>
    </div>
  )
}

/** REWARDS tab — perk shop + badge collection hub. */
export function RewardsHubTab({ hunter }: { hunter: HunterDTO }) {
  const [view, setView] = useState<HubView>("shop")
  const reduce = useReducedMotion()
  const essenceUp = useCountUp(hunter.essence)

  return (
    // Plain root (not a variant node) keeps whileInView in charge of the
    // below-fold reveal; FlowGroup orchestrates the masthead only.
    <div className="space-y-4 sm:space-y-5">
      <FlowGroup className="space-y-4 sm:space-y-5">
        {/* tab header */}
        <FlowItem>
          <header className="flex items-center gap-3 sm:gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-amber-400/40 bg-amber-500/10">
              <Gem className="h-6 w-6 text-amber-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.5)]" aria-hidden />
            </div>
            <div className="min-w-0">
              <DecodeText
                text="REWARDS"
                as="h2"
                className="font-mono text-sm font-bold tracking-[0.3em] text-amber-200"
              />
              <p className="sys-label mt-0.5 truncate text-zinc-400">ESSENCE VAULT · PERK FORGE · BADGES</p>
            </div>
          </header>
        </FlowItem>

        {/* VAULT — the tab's hero numeral moment (the 01/ VAULT mark stood
            down in R54-c4; the ESSENCE row below self-labels the zone) */}
        <FlowItem>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-1">
            <div className="min-w-0" title="Balance · earned from sessions, records and goals">
              <div className="flex items-baseline gap-2.5">
                <span className="sys-display sys-display-lg sys-bloom-teal text-glow-teal text-teal-200">
                  {Math.round(essenceUp)}
                </span>
                <span className="sys-label text-zinc-400">ESSENCE</span>
              </div>
              {/* R54-c4 — "BALANCE · EARNED FROM SESSIONS · RECORDS · GOALS"
                  folded into the block's title attribute above. */}
            </div>
            <div className="ml-auto flex flex-col gap-1.5">
              <VaultStat
                icon={<Flame className="h-3.5 w-3.5 shrink-0 sys-bloom-amber text-amber-400" aria-hidden />}
                value={hunter.streak}
                label="DAY STREAK · PAYS OUT"
                accent={ROW_AMBER}
              />
              <VaultStat
                icon={<Dumbbell className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />}
                value={hunter.totalSessions}
                label="TOTAL SESSIONS"
                accent={ROW_VIOLET}
              />
            </div>
          </div>
        </FlowItem>

        {/* internal hub switch — R15: the two 44px rows rise in a
            micro-stagger and press on a spring; transition-all is scoped to
            the color set so framer's whileTap transform isn't CSS-tweened */}
        <FlowItem>
          <div className="flex items-center gap-2" role="tablist" aria-label="Rewards hub views">
            <motion.button
              type="button"
              role="tab"
              aria-selected={view === "shop"}
              onClick={() => setView("shop")}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduce ? { duration: 0 } : { delay: 0.07, duration: 0.45, ease: FLOW_EASE }
              }
              {...tapMotion}
              className={cn(
                "flex min-h-[2.75rem] items-center gap-2 rounded-sm px-4 font-mono text-[10px] font-bold tracking-[0.25em]",
                "transition-[color,background-color,border-color,box-shadow]",
                "focus-visible:outline focus-visible:outline-violet-400/70",
                view === "shop"
                  ? "border border-teal-400/50 bg-teal-500/15 text-teal-200 shadow-[0_0_14px_rgba(20,184,166,0.22)]"
                  : "border border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-teal-500/40 hover:text-teal-300"
              )}
            >
              <Gift className="h-3.5 w-3.5" aria-hidden /> SHOP
            </motion.button>
            <motion.button
              type="button"
              role="tab"
              aria-selected={view === "badges"}
              onClick={() => setView("badges")}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduce ? { duration: 0 } : { delay: 0.13, duration: 0.45, ease: FLOW_EASE }
              }
              {...tapMotion}
              className={cn(
                "flex min-h-[2.75rem] items-center gap-2 rounded-sm px-4 font-mono text-[10px] font-bold tracking-[0.25em]",
                "transition-[color,background-color,border-color,box-shadow]",
                "focus-visible:outline focus-visible:outline-violet-400/70",
                view === "badges"
                  ? "border border-violet-400/50 bg-violet-500/15 text-violet-200 shadow-[0_0_14px_rgba(139,92,246,0.25)]"
                  : "border border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-violet-500/40 hover:text-violet-300"
              )}
            >
              <Award className="h-3.5 w-3.5" aria-hidden /> BADGES
            </motion.button>
          </div>
        </FlowItem>
      </FlowGroup>

      {/* the active hub view, scroll-revealed — the 02/FORGE·TITLES mark
          stood down in R54-c4; each embedded view's panels self-label */}
      <FlowReveal>
        {/* R15 — view swap rides the flow language: 0.25s FLOW_EASE fade-rise
            per switch (keyed remount), reduced-motion gated — it previously
            animated ungated on the default ease. The embedded Forge / Titles
            staggers fire fresh on every swap underneath this quick veil. */}
        <motion.div
          key={view}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.25, ease: FLOW_EASE }}
        >
          {view === "shop" ? <ForgeTab hunter={hunter} /> : <TitlesTab hunter={hunter} />}
        </motion.div>
      </FlowReveal>
    </div>
  )
}
