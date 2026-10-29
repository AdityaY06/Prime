"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Loader2, Plus, Sparkles } from "lucide-react"
import { InfoHint } from "@/components/system/info-hint"
import { SystemPanel } from "@/components/system/system-panel"
import { FlowGroup, FlowItem, MeterFlow, SPRING_BOUNCE, SPRING_SNAPPY, useCountUp } from "@/components/system/motion"
import { api } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { STAT_DEFS, STAT_KEYS, type StatKey } from "@/lib/game"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

/** R43 studio — the shared STAT_DEFS token for VIT still carries the grove's
 *  literal emerald (renders true green); the studio grid renders that stat
 *  neutral ivory instead. Display-only map — the shared lib, its tooltips
 *  and every other consumer are untouched. */
const STUDIO_STAT_TEXT: Partial<Record<StatKey, string>> = {
  vit: "text-zinc-200",
}

/** Stat value that pulses (scale + glow) whenever it increases. */
function StatValue({ value, className }: { value: number; className?: string }) {
  const prev = useRef(value)
  const el = useRef<HTMLSpanElement>(null)
  // R14 — the numeral itself flows in: mounts from zero and glides up to the
  // value on allocation refresh (useCountUp self-gates under reduced motion).
  // Composes with the pulse below — value roll + scale/glow, not a doubling.
  const shown = useCountUp(value)

  useEffect(() => {
    if (value > prev.current && el.current) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (!reduced) {
        // brief scale/glow pulse via the Web Animations API
        el.current.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(1.4)", filter: "drop-shadow(0 0 8px currentColor)" },
            { transform: "scale(1)" },
          ],
          { duration: 550, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        )
      }
    }
    prev.current = value
  }, [value])

  return (
    <span ref={el} className={className}>
      {Math.round(shown)}
    </span>
  )
}

/** Attribute bars + free point allocation. R52 declutter: the default view
 *  is ONE row of five compact chips (STR 24 · VIT 16 · …) + the free-points
 *  badge; tapping any chip (or the header chevron) expands the full panel
 *  with the aurora meters and the point-spending flow — unchanged inside. */
export function StatGrid({ hunter }: { hunter: HunterDTO }) {
  const { bumpRefresh, pushNotice } = useSystem()
  const [busy, setBusy] = useState<StatKey | null>(null)
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()

  // R14 — the FREE badge pops (SPRING_BOUNCE, one shot — never loops) whenever
  // unspent points are GRANTED (level-up refresh); spending them just updates
  // the numeral. The key-remount replays the mount animation on each grant.
  const prevPoints = useRef(hunter.statPoints)
  const [popKey, setPopKey] = useState(0)
  useEffect(() => {
    if (hunter.statPoints > prevPoints.current) setPopKey((k) => k + 1)
    prevPoints.current = hunter.statPoints
  }, [hunter.statPoints])

  const allocate = async (stat: StatKey, amount: number) => {
    if (busy || hunter.statPoints < amount) return
    setBusy(stat)
    try {
      await api("/api/hunter/stats", {
        method: "POST",
        body: JSON.stringify({ stat, amount }),
      })
      pushNotice({
        kind: "info",
        title: "Attribute reinforced",
        body: `${STAT_DEFS[stat].short} +${amount}`,
      })
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Allocation failed", body: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const maxStat = Math.max(...STAT_KEYS.map((k) => hunter.stats[k]), 20)

  return (
    <TooltipProvider delayDuration={150}>
      <SystemPanel
        label="Attributes"
        labelAccent={
          <span className="flex items-center gap-2">
            {/* R52 declutter — the term's meaning rides the hint glyph; the
                free-points badge (the actionable CTA) stays visible always. */}
            <InfoHint term="attributes" />
            {hunter.statPoints > 0 ? (
              <motion.span
                key={popKey}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING_BOUNCE}
                className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold tabular-nums tracking-wider text-amber-300"
              >
                <Sparkles className="h-3 w-3 sys-pulse" aria-hidden />
                {hunter.statPoints} free
              </motion.span>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Collapse the attribute panel" : "Open the attribute allocation panel"}
              title={open ? "Collapse" : "Allocation"}
              className="grove-press relative grid h-7 w-7 place-items-center rounded-full border border-zinc-700/60 bg-zinc-900/60 text-zinc-400 transition-colors after:absolute after:-inset-2 after:content-[''] hover:border-violet-400/50 hover:bg-violet-500/15 hover:text-violet-200 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")}
                aria-hidden
              />
            </button>
          </span>
        }
      >
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="stat-alloc"
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {/* the full panel — aurora meters + spend flow, exactly as before */}
              <FlowGroup className="space-y-4 p-5 sm:p-6">
          {STAT_KEYS.map((key) => {
            const def = STAT_DEFS[key]
            const val = hunter.stats[key]
            const pct = Math.min(100, (val / maxStat) * 100)
            return (
              <FlowItem key={key} className="group">
                <div className="flex items-center justify-between gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex cursor-help items-center gap-2">
                        <span className={cn("text-xs font-bold tracking-[0.12em]", STUDIO_STAT_TEXT[key] ?? def.color)}>
                          {def.short}
                        </span>
                        <span className="text-[11px] text-zinc-400">{def.label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="border-violet-500/30 bg-zinc-950/95 text-xs">
                      <p className="text-zinc-300">{def.desc}</p>
                    </TooltipContent>
                  </Tooltip>

                  <div className="flex items-center gap-2">
                    <StatValue value={val} className={cn("text-sm font-bold tabular-nums", STUDIO_STAT_TEXT[key] ?? def.color)} />
                    {hunter.statPoints > 0 && (
                      /* R14 — spring press (SPRING_SNAPPY, gated on reduced
                         motion like nav/ascension-card) + an invisible ::after
                         hit-slop (24px glyph + 10px per side = 44px target)
                         with zero visual/layout change. The transition is
                         scoped to colors/shadow/opacity — `transition-all`
                         would also CSS-tween framer's per-frame transform and
                         mute the spring. */
                      <motion.button
                        whileTap={reduce ? undefined : { scale: 0.96, transition: SPRING_SNAPPY }}
                        onClick={() => allocate(key, 1)}
                        disabled={busy !== null}
                        aria-label={`Increase ${def.label}`}
                        aria-busy={busy === key}
                        className={cn(
                          "grove-press relative grid h-6 w-6 place-items-center rounded-full border",
                          "transition-[color,background-color,border-color,box-shadow,opacity]",
                          "after:absolute after:-inset-[10px] after:content-['']",
                          "border-violet-400/50 bg-violet-500/15 text-violet-300",
                          "hover:bg-violet-500/35 hover:shadow-[0_0_14px_rgba(228,228,231,0.4)]",
                          "active:bg-violet-500/45",
                          "disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                        )}
                      >
                        {busy === key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </motion.button>
                    )}
                  </div>
                </div>
                {/* R42 studio — the attribute meters join the aurora family:
                    a luminous 3px hairline whose ends dissolve, poured by
                    MeterFlow (mount sweep + allocation glide). Inline
                    `transition: none` keeps framer the sole width driver —
                    the class's CSS width-transition would low-pass its
                    per-frame writes. The segmented skin retired with the
                    chunky bar; the stat's own color lives in the value above. */}
                <div className="aurora-track mt-1.5">
                  <MeterFlow pct={pct} className="aurora-fill" style={{ transition: "none" }} />
                </div>
              </FlowItem>
            )
          })}
              </FlowGroup>
            </motion.div>
          ) : (
            <motion.div
              key="stat-chips"
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {/* R52 declutter — one slim chip row; each chip opens the
                  allocation panel (44px targets, stat-color micro-caps). */}
              <div className="flex flex-wrap items-center gap-2 p-4 sm:p-5">
                {STAT_KEYS.map((key) => {
                  const def = STAT_DEFS[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setOpen(true)}
                      aria-label={`${def.label} ${hunter.stats[key]} — open allocation`}
                      className="grove-press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 focus-visible:outline focus-visible:outline-violet-400/70"
                    >
                      <span className={cn("text-[9px] font-bold tracking-[0.14em]", STUDIO_STAT_TEXT[key] ?? def.color)}>
                        {def.short}
                      </span>
                      <span className="text-xs font-bold tabular-nums leading-none text-zinc-100">
                        {hunter.stats[key]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SystemPanel>
    </TooltipProvider>
  )
}
