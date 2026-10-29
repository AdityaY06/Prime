"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Crown, Gem, Infinity as InfinityIcon, Loader2, Lock, RotateCcw, Sparkles } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { SystemPanel } from "@/components/system/system-panel"
import { InfoHint } from "@/components/system/info-hint"
import { api } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import {
  ASCEND_MIN_LEVEL,
  ascensionEssenceReward,
  ascensionMultLabel,
  nextAscensionTitle,
} from "@/lib/ascension"
import { titleByCode } from "@/lib/titles"
import type { HunterDTO, RewardResult } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * THE ASCENSION PROTOCOL — the prestige system. From LV.30 the hunter may shed
 * level, XP and attributes for a permanent +15% XP multiplier per completed
 * cycle, an aether bounty and the rebirth title track. Everything earned —
 * titles, records, mastery, relics, essence — survives.
 */
export function AscensionCard({ hunter }: { hunter: HunterDTO }) {
  const { showReward, pushNotice, speak, bumpRefresh } = useSystem()
  const reduce = useReducedMotion()
  const [ascending, setAscending] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eligible = hunter.level >= ASCEND_MIN_LEVEL
  const nextCount = hunter.ascension + 1
  const essenceGain = ascensionEssenceReward(nextCount)
  const nextTitle = nextAscensionTitle(hunter.ascension)
  const nextTitleDef = nextTitle ? titleByCode(nextTitle.code) : null
  const progressPct = Math.min(100, Math.round((hunter.level / ASCEND_MIN_LEVEL) * 100))

  async function ascend() {
    if (ascending) return
    setAscending(true)
    setError(null)
    try {
      const res = await api<{ hunter: HunterDTO; reward: RewardResult }>("/api/hunter/ascend", {
        method: "POST",
      })
      setOpen(false)
      showReward(res.reward)
      speak("New Cycle complete. Level and attributes reset. All experience gains permanently increased.")
      pushNotice({
        kind: "info",
        title: "NEW CYCLE STARTED",
        body: `Cycle ${res.hunter.ascension} begun — all XP gains ${ascensionMultLabel(res.hunter.ascension)}.`,
      })
      bumpRefresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAscending(false)
    }
  }

  return (
    <SystemPanel
      label="New Cycle"
      labelAccent={
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums tracking-widest",
            hunter.ascension > 0 ? "text-fuchsia-300/90" : eligible ? "text-amber-300/90" : "text-zinc-400"
          )}
        >
          {hunter.ascension > 0 ? `CYCLE ${hunter.ascension} · ${ascensionMultLabel(hunter.ascension)} XP` : eligible ? "RESET AVAILABLE" : `LV.${hunter.level}/${ASCEND_MIN_LEVEL}`}
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          {/* sigil — the ouroboros diamond */}
          <div
            className={cn(
              "relative grid h-11 w-11 shrink-0 place-items-center rounded-sm border transition-all",
              eligible
                ? "border-fuchsia-400/60 bg-fuchsia-500/10 shadow-[0_0_16px_rgba(251,191,36,0.3)]"
                : hunter.ascension > 0
                  ? "ascend-sealed border-fuchsia-400/40 bg-fuchsia-500/[0.06]"
                  : "ascend-sealed border-zinc-700/60 bg-zinc-950/60"
            )}
            aria-hidden
          >
            <InfinityIcon
              className={cn(
                "h-5 w-5",
                eligible ? "ascend-breathe text-fuchsia-300 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]" : hunter.ascension > 0 ? "text-fuchsia-300/70" : "text-zinc-400"
              )}
            />
            {/* cycle diamonds — one filled per completed ascension */}
            {hunter.ascension > 0 && (
              <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-[3px]">
                {Array.from({ length: Math.min(hunter.ascension, 5) }, (_, i) => (
                  <span
                    key={i}
                    className="inline-block h-1 w-1 rotate-45 bg-fuchsia-400 shadow-[0_0_4px_rgba(251,191,36,0.9)]"
                  />
                ))}
                {hunter.ascension > 5 && (
                  <span className="font-mono text-[7px] leading-none text-fuchsia-300/80">+{hunter.ascension - 5}</span>
                )}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {eligible ? (
              <>
                <p className="font-mono text-xs font-bold tracking-[0.18em] text-fuchsia-200">
                  A NEW CYCLE AWAITS
                </p>
                <p className="mt-1 text-[11px] leading-snug text-zinc-400">
                  Reset Level <span className="tabular-nums text-fuchsia-300/90">{hunter.level}</span> and all attribute
                  points. Restart at LV.1 with{" "}
                  <span className="text-fuchsia-300/90">{ascensionMultLabel(nextCount)} XP forever</span> and{" "}
                  <span className="text-teal-300/90">+{essenceGain} credits</span>.
                </p>
                <AlertDialog open={open} onOpenChange={setOpen}>
                  <AlertDialogTrigger asChild>
                    <motion.button
                      whileHover={reduce ? undefined : { scale: 1.02 }}
                      whileTap={reduce ? undefined : { scale: 0.98 }}
                      className="relative mt-3 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-sm border border-fuchsia-400/60 bg-fuchsia-500/15 font-mono text-[10px] font-bold tracking-[0.28em] text-fuchsia-200 uppercase transition-all hover:bg-fuchsia-500/25 hover:shadow-[0_0_22px_rgba(251,191,36,0.4)] active:bg-fuchsia-500/35 focus-visible:outline focus-visible:outline-fuchsia-400/70 sm:w-auto sm:px-6"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restart
                    </motion.button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="sys-panel ascend-dialog rounded-sm border-fuchsia-500/40 sm:max-w-md">
                    <i className="sys-corner sys-corner-tl" aria-hidden />
                    <i className="sys-corner sys-corner-tr" aria-hidden />
                    <i className="sys-corner sys-corner-bl" aria-hidden />
                    <i className="sys-corner sys-corner-br" aria-hidden />
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-mono text-sm font-bold tracking-[0.2em] text-fuchsia-200">
                        BEGIN A NEW CYCLE?
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3 text-[11px] leading-relaxed text-zinc-400">
                          <p>
                            This reset is irreversible. Read the terms of the new cycle.
                          </p>
                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="rounded-sm border border-amber-500/30 bg-amber-500/[0.05] p-2.5">
                              <p className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.2em] text-amber-300">
                                <Crown className="h-3 w-3" aria-hidden /> KEPT
                              </p>
                              <ul className="mt-1.5 space-y-1 font-mono text-[9px] tracking-wide text-zinc-400">
                                <li>· Badges &amp; achievements</li>
                                <li>· Records &amp; training mastery</li>
                                <li>· Credits &amp; perks</li>
                                <li>· Streak &amp; lifetime totals</li>
                              </ul>
                            </div>
                            <div className="rounded-sm border border-rose-500/30 bg-rose-500/[0.05] p-2.5">
                              <p className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.2em] text-rose-300">
                                <Lock className="h-3 w-3" aria-hidden /> RESET
                              </p>
                              <ul className="mt-1.5 space-y-1 font-mono text-[9px] tracking-wide text-zinc-400">
                                <li>· Level → 1</li>
                                <li>· XP → 0</li>
                                <li>· Attributes → starting values</li>
                                <li>· Unspent points</li>
                              </ul>
                            </div>
                          </div>
                          <p className="font-mono text-[9px] tracking-[0.15em] text-fuchsia-300/80">
                            GAIN: {ascensionMultLabel(nextCount)} XP PERMANENT · +{essenceGain} CREDITS
                            {nextTitleDef ? ` · «${nextTitleDef.title}»` : ""}
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="font-mono text-xs tracking-widest">NOT YET</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault()
                          ascend()
                        }}
                        disabled={ascending}
                        className="border border-fuchsia-400/60 bg-fuchsia-500/20 font-mono text-xs font-bold tracking-widest text-fuchsia-200 hover:bg-fuchsia-500/35 hover:text-fuchsia-100 disabled:opacity-60"
                      >
                        {ascending ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden /> RESTARTING…
                          </>
                        ) : (
                          "START NEW CYCLE"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                    {error && (
                      <p className="text-center font-mono text-[9px] tracking-[0.22em] text-rose-400/80">{error}</p>
                    )}
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <>
                {hunter.ascension > 0 && (
                  <p className="font-mono text-xs font-bold tracking-[0.18em] text-zinc-300">
                    THE NEXT CYCLE AWAITS
                  </p>
                )}
                {/* R52 declutter — the full prestige terms (reset vs. endure,
                    ×multiplier, credit bounty) live behind the hint glyph —
                    glossary "cycle"; the meter and gain chips below carry
                    the numbers. The panel label + LV readout already say
                    "New Cycle", so the sealed state carries ONE line. */}
                <p
                  className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-zinc-400"
                  title={`New Cycle unlocks at LV.${ASCEND_MIN_LEVEL}`}
                >
                  Unlocks at LV.{ASCEND_MIN_LEVEL}
                  <InfoHint term="cycle" />
                </p>
                <div className="mt-3.5">
                  <div className="flex items-center justify-between font-mono text-[8px] tracking-[0.22em] text-zinc-600">
                    <span className="text-fuchsia-300/50">SEALED</span>
                    <span className="tabular-nums text-zinc-400">
                      LV.{hunter.level} / LV.{ASCEND_MIN_LEVEL}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "mt-1.5 h-1.5 overflow-hidden rounded-sm bg-zinc-900/80",
                      progressPct >= 75 && "ascend-near"
                    )}
                  >
                    <motion.div
                      initial={reduce ? false : { width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                      className="ascend-fill h-full bg-gradient-to-r from-fuchsia-700 via-fuchsia-500 to-fuchsia-300"
                    />
                  </div>
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[8px] tracking-[0.18em] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5 text-fuchsia-400/60" aria-hidden />
                      {ascensionMultLabel(nextCount)} XP
                    </span>
                    <span className="flex items-center gap-1">
                      <Gem className="h-2.5 w-2.5 text-teal-400/60" aria-hidden />+{essenceGain} CREDITS
                    </span>
                    {nextTitleDef && (
                      <span className="flex items-center gap-1 text-fuchsia-300/60">
                        <Crown className="h-2.5 w-2.5" aria-hidden />«{nextTitleDef.title}»
                      </span>
                    )}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </SystemPanel>
  )
}
