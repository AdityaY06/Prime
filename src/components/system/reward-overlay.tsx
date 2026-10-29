"use client"

/**
 * R58-b · FLOW — the reward celebration, reborn in the light register.
 *
 * The last dark-chrome surface (R57 audit's top R58 candidate) becomes a
 * white celebration card: 2px soft border, Nunito, one huge green numeral,
 * tinted pills, and the chunky 3D Continue button. The celebration soul is
 * motion, not chrome — a ConfettiBurst fires on every mount, the card
 * springs in, every block stagger-pops on its own delay, the level-up
 * overshoots, and the XP numeral settles the moment its count finishes.
 * Reduced motion: no confetti (self-guarded), no springs, final state.
 * Data contract untouched: every field, the spoken lines, Escape/Enter.
 */

import { useEffect, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ChevronsUp,
  Crown,
  Flame,
  Gem,
  Sparkles,
  Timer,
  Dumbbell,
  Swords,
  Trophy,
  ShieldCheck,
  Skull,
  Infinity as InfinityIcon,
} from "lucide-react"
import { useSystem, type RewardView } from "@/store/system-store"
import { titleByCode } from "@/lib/titles"
import { ascensionMultLabel } from "@/lib/ascension"
import { RankBadge } from "./rank-badge"
import { ConfettiBurst } from "@/components/prime/confetti"
import { BigButton } from "@/components/prime/kit"

function useCountUp(target: number, duration = 900) {
  const reduce = useReducedMotion()
  const [val, setVal] = useState(reduce ? target : 0)
  useEffect(() => {
    if (reduce) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduce])
  return val
}

/** Compose the System's spoken line for a reward — measured, inhumanly calm. */
function spokenAnnouncement(reward: RewardView): string[] {
  const parts: string[] = []
  if (reward.ascended) {
    parts.push("New cycle complete. Level and attributes reset.")
    parts.push(`All experience gains permanently increased. Cycle ${reward.ascended.count} begins.`)
  } else if (reward.source === "quest") {
    parts.push(`Goal complete. ${reward.questTitle ?? ""}`.trim())
  } else {
    parts.push(reward.riftBonus ? "Daily bonus cleared." : "Session complete.")
  }
  if (!reward.ascended) {
    parts.push(`${reward.xpGained.toLocaleString()} experience points gained.`)
  }
  if (reward.bossDefeated) {
    parts.push(`Challenge completed. ${reward.bossDefeated.name} is done.`)
    if (reward.bossDefeated.enrageLabel) {
      parts.push(`Completed at ${reward.bossDefeated.enrageLabel.toLowerCase()} difficulty.`)
    }
  }
  if (reward.prCount && reward.prCount > 0) {
    parts.push(`${reward.prCount} new record${reward.prCount === 1 ? "" : "s"} set.`)
  }
  if (reward.streakShielded) parts.push("The streak endures. Your recovery day shielded it.")
  if (reward.levelUps > 0) parts.push(`Level up. You have reached level ${reward.newLevel}.`)
  if (reward.rankUp && reward.newRank) parts.push(`Rank up. Welcome, ${reward.newRank} rank athlete.`)
  reward.unlockedTitles.forEach((code) => {
    const t = titleByCode(code)
    if (t) parts.push(`Badge unlocked. ${t.title}.`)
  })
  return parts
}

/** One staggered celebration block — spring-pops in on its delay. */
function RewardBlock({
  delay,
  scale = 0.94,
  stiffness = 320,
  damping = 24,
  className,
  children,
}: {
  delay: number
  scale?: number
  stiffness?: number
  damping?: number
  className?: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10, scale }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness, damping, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** The tiny gray uppercase eyebrow — the kit's SectionLabel register. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    // R68 — #afafaf → #777: the reward eyebrow must read on the overlay
    <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#777]">{children}</p>
  )
}

function RewardBody({ reward }: { reward: RewardView }) {
  const reduce = useReducedMotion()
  const xp = useCountUp(reward.xpGained)
  const countDone = xp >= reward.xpGained

  return (
    <div className="relative w-[min(26rem,calc(100vw-2rem))] rounded-2xl border-2 border-[#e5e5e5] bg-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
      <div className="px-6 py-8 text-center">
        <RewardBlock delay={0} scale={1}>
          <Eyebrow>
            {reward.ascended
              ? "New cycle"
              : reward.source === "quest"
                ? "Goal complete"
                : "Session complete"}
          </Eyebrow>
        </RewardBlock>

        <RewardBlock delay={0.08} scale={1} stiffness={340} damping={22}>
          <h2 className="mt-3 text-2xl font-black leading-tight text-[#3c3c3c]">
            {reward.ascended
              ? "New cycle"
              : reward.source === "quest" && reward.questTitle
                ? reward.questTitle
                : "Session complete"}
          </h2>
        </RewardBlock>

        {/* XP counter — or the rebirth cycle */}
        {reward.ascended ? (
          <RewardBlock delay={0.16} scale={0.8} stiffness={340} damping={18} className="mt-6">
            <div className="flex items-center justify-center gap-2.5">
              <InfinityIcon className="h-6 w-6 text-[#58a700]" aria-hidden />
              <span className="text-4xl font-black tabular-nums text-[#58a700]">
                Cycle {reward.ascended.count}
              </span>
            </div>
            <p className="mt-2.5 text-sm font-extrabold text-[#46a302]">
              All future XP {ascensionMultLabel(reward.ascended.count)}
            </p>
            <p className="mt-1.5 text-xs font-bold text-[#777]">Level &amp; stats reset</p>
          </RewardBlock>
        ) : (
          <RewardBlock delay={0.16} scale={1} className="mt-6">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-6 w-6 text-[#58cc02]" aria-hidden />
              {/* the numeral counts up, then settles with a spring pop */}
              <motion.span
                className="text-5xl font-black leading-none tabular-nums text-[#58a700]"
                initial={false}
                animate={reduce ? undefined : { scale: countDone ? 1 : 0.94 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 18 }}
              >
                +{xp.toLocaleString()}
              </motion.span>
              <span className="text-sm font-extrabold uppercase tracking-[0.08em] text-[#777]">XP</span>
            </div>
          </RewardBlock>
        )}

        {/* essence */}
        {reward.essenceGained ? (
          <RewardBlock
            delay={0.35}
            className="mt-4 flex items-center justify-center gap-2 rounded-full border-2 border-[#aee8e1] bg-[#d6f5f1] px-4 py-2"
          >
            <Gem className="h-4 w-4 text-[#0d7d74]" aria-hidden />
            <span className="text-lg font-black tabular-nums text-[#0d7d74]">
              +{reward.essenceGained}
            </span>
            <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#0d7d74]/70">
              essence
            </span>
          </RewardBlock>
        ) : null}

        {/* rift of the day */}
        {reward.riftBonus ? (
          <RewardBlock
            delay={0.5}
            className="mt-4 flex items-center justify-center gap-2 rounded-full border-2 border-[#ffe58f] bg-[#fff4cc] px-4 py-2"
          >
            <Flame className="prime-flame h-4 w-4 text-[#b26a00]" aria-hidden />
            <span className="text-sm font-extrabold text-[#6b5200]">Daily bonus cleared</span>
          </RewardBlock>
        ) : null}

        {/* weekly boss slain */}
        {reward.bossDefeated ? (
          <RewardBlock
            delay={0.55}
            scale={0.9}
            className="mt-4 rounded-2xl border-2 border-[#ffcccc] bg-[#ffe5e5] px-4 py-2.5"
          >
            <p className="flex flex-wrap items-center justify-center gap-2 text-sm font-extrabold text-[#c63636]">
              <Skull className="h-4 w-4" aria-hidden />
              Challenge complete — {reward.bossDefeated.name}
              {reward.bossDefeated.enrageLabel ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#b26a00]">
                  {reward.bossDefeated.enrageLabel}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-[11px] font-bold tabular-nums text-[#c63636]/75">
              Best session {reward.bossDefeated.damage.toLocaleString()} /{" "}
              {reward.bossDefeated.hp.toLocaleString()} HP · +{reward.bossDefeated.xpReward.toLocaleString()} XP · +
              {reward.bossDefeated.essenceReward} essence
            </p>
          </RewardBlock>
        ) : null}

        {/* new records */}
        {reward.prCount && reward.prCount > 0 ? (
          <RewardBlock
            delay={0.6}
            className="mt-4 flex items-center justify-center gap-2 rounded-full border-2 border-[#ffe58f] bg-[#fff4cc] px-4 py-2"
          >
            <Trophy className="h-4 w-4 text-[#b26a00]" aria-hidden />
            <span className="text-sm font-extrabold tabular-nums text-[#6b5200]">
              {reward.prCount} new record{reward.prCount === 1 ? "" : "s"} set
            </span>
          </RewardBlock>
        ) : null}

        {/* raid detail chips */}
        {reward.source === "gate" && (
          <RewardBlock
            delay={0.65}
            className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-extrabold tabular-nums text-[#777]"
          >
            {reward.durationMin ? (
              <span className="flex items-center gap-1 rounded-full border-2 border-[#e5e5e5] bg-[#f7f7f4] px-2.5 py-1">
                <Timer className="h-3 w-3" aria-hidden /> {reward.durationMin} min
              </span>
            ) : null}
            {reward.volumeKg ? (
              <span className="flex items-center gap-1 rounded-full border-2 border-[#e5e5e5] bg-[#f7f7f4] px-2.5 py-1">
                <Dumbbell className="h-3 w-3" aria-hidden /> {reward.volumeKg.toLocaleString()} kg
              </span>
            ) : null}
            {reward.pushupsInSession ? (
              <span className="flex items-center gap-1 rounded-full border-2 border-[#e5e5e5] bg-[#f7f7f4] px-2.5 py-1">
                <Swords className="h-3 w-3" aria-hidden /> {reward.pushupsInSession} push-ups
              </span>
            ) : null}
          </RewardBlock>
        )}

        {/* streak shielded by rest */}
        {reward.streakShielded ? (
          <RewardBlock
            delay={0.7}
            className="mt-4 flex items-center justify-center gap-2 rounded-full border-2 border-[#c9edb0] bg-[#e8f8d8] px-4 py-2"
          >
            <ShieldCheck className="h-4 w-4 text-[#46a302]" aria-hidden />
            <span className="text-sm font-extrabold text-[#46a302]">Streak saved — rest day shielded</span>
          </RewardBlock>
        ) : null}

        {/* level up — extra pop + rising chevrons */}
        {reward.levelUps > 0 && (
          <RewardBlock
            delay={0.8}
            scale={0.7}
            stiffness={360}
            damping={16}
            className="mt-6 rounded-2xl border-2 border-[#c9edb0] bg-[#e8f8d8] px-4 py-3"
          >
            <p className="flex items-center justify-center gap-1.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#46a302]">
              <motion.span
                className="inline-flex"
                initial={reduce ? false : { y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 18, delay: 0.95 }
                }
              >
                <ChevronsUp className="h-4 w-4" aria-hidden />
              </motion.span>
              Level up
            </p>
            <p className="mt-1 text-2xl font-black tabular-nums text-[#46a302]">Lv. {reward.newLevel}</p>
            <p className="mt-1 text-xs font-bold text-[#58a700]">
              +{reward.statPointsGained} stat point{reward.statPointsGained === 1 ? "" : "s"}
            </p>
          </RewardBlock>
        )}

        {/* rank up */}
        {reward.rankUp && reward.newRank && (
          <RewardBlock
            delay={0.95}
            scale={0.85}
            stiffness={300}
            damping={20}
            className="mt-6 flex flex-col items-center rounded-2xl border-2 border-[#ffe58f] bg-[#fff4cc] px-4 py-4"
          >
            <p className="text-sm font-extrabold uppercase tracking-[0.08em] text-[#b26a00]">Rank up</p>
            <div className="mt-3 flex items-center gap-4">
              <RankBadge rank={reward.newRank} size="lg" />
              <div className="text-left">
                <Eyebrow>New rank</Eyebrow>
                <p className="mt-1 text-xl font-black text-[#6b5200]">{reward.newRank}-RANK</p>
                <p className="mt-1 text-[11px] font-bold text-[#9a7500]">+5 bonus stat points</p>
              </div>
            </div>
          </RewardBlock>
        )}

        {/* stat gained (quest rewards) */}
        {reward.statGained && (
          <RewardBlock delay={1} scale={1} className="mt-4">
            <p className="text-sm font-extrabold text-[#46a302]">
              +{reward.statGained.amount} {reward.statGained.stat.toString().toUpperCase()}
            </p>
          </RewardBlock>
        )}

        {/* new titles */}
        {reward.unlockedTitles.length > 0 && (
          <div className="mt-6 space-y-2">
            <RewardBlock delay={1.1} scale={1}>
              <Eyebrow>New badge unlocked</Eyebrow>
            </RewardBlock>
            {reward.unlockedTitles.map((code, i) => {
              const t = titleByCode(code)
              if (!t) return null
              return (
                <RewardBlock
                  key={code}
                  delay={1.15 + i * 0.07}
                  className="flex items-center justify-center gap-2 rounded-full border-2 border-[#ffe58f] bg-[#fff4cc] px-3 py-2"
                >
                  <Crown className="h-4 w-4 text-[#b26a00]" aria-hidden />
                  <span className="text-sm font-extrabold text-[#6b5200]">{t.title}</span>
                </RewardBlock>
              )
            })}
          </div>
        )}

        <RewardBlock delay={0.9} scale={0.96} className="mt-7">
          <BigButton
            variant="green"
            size="lg"
            full
            className="md:h-12 md:text-base"
            onClick={() => useSystem.getState().dismissReward()}
          >
            Continue
          </BigButton>
        </RewardBlock>
      </div>
    </div>
  )
}

/** Full-screen celebration card shown after workouts / quests. */
export function RewardOverlay() {
  const { reward, dismissReward } = useSystem()
  const reduce = useReducedMotion()

  // The System speaks when a reward is presented.
  useEffect(() => {
    if (!reward) return
    const { speak } = useSystem.getState()
    spokenAnnouncement(reward).forEach((line) => speak(line))
  }, [reward])

  useEffect(() => {
    if (!reward) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") dismissReward()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [reward, dismissReward])

  return (
    <AnimatePresence>
      {reward && (
        <motion.div
          key="reward"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Reward window"
        >
          {/* the confetti is the ambient now — just a faint green halo behind */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 1.2, ease: "easeOut" }}
              className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#58cc02]/15 blur-3xl"
            />
          </div>
          <ConfettiBurst fire={1} count={34} />
          <motion.div
            initial={reduce ? false : { y: 26, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 18, scale: 0.97, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24 }}
          >
            <RewardBody reward={reward} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
