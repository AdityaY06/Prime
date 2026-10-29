"use client"

/**
 * R57 · CLEAN SLATE — HOME, the exemplar facade.
 *
 * The Duolingo home register: a warm greeting, the streak, a fat glossy XP
 * bar, today's quests as simple checkable rows, one honest snapshot strip,
 * and exactly ONE green action ("Start today's workout"). Everything deep
 * (the full 56-round Status console) rides behind ShowEverything.
 *
 * Data: /api/quests (today's dailies) + /api/destinations (honest snapshot
 * numbers). Claims POST the real endpoint and celebrate with a toast +
 * refresh — no fabricated state anywhere.
 */

import { useState } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, Dumbbell, Flame, Sparkles, Utensils, Zap } from "lucide-react"
import { api, useApi } from "@/hooks/use-api"
import { useSystem, type Tab } from "@/store/system-store"
import type { DestinationsDTO, HunterDTO, QuestDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ConfettiBurst } from "./confetti"
import {
  BigButton,
  Card,
  Chip,
  EmptyNote,
  Flourish,
  ProgressBar,
  Reveal,
  SectionLabel,
  ShowEverything,
  Skeleton,
  StatTile,
  fmt,
  greeting,
} from "./kit"

const StatusTab = dynamic(
  () => import("@/components/fitness/status-tab").then((m) => m.StatusTab),
  { ssr: false },
)

type QuestsResponse = { dailies: QuestDTO[]; main: QuestDTO[]; failed: QuestDTO[] }

/** Where a tap should send you to work on this quest's metric. */
function questTab(metric: string): Tab {
  const m = metric.toLowerCase()
  if (
    m.includes("water") ||
    m.includes("kcal") ||
    m.includes("protein") ||
    m.includes("meal") ||
    m.includes("food") ||
    m.includes("weight") ||
    m.includes("sleep") ||
    m.includes("rhr") ||
    m.includes("vital")
  ) {
    return "log"
  }
  return "train"
}

export function HomeTab({ hunter }: { hunter: HunterDTO }) {
  const setTab = useSystem((s) => s.setTab)
  const pushNotice = useSystem((s) => s.pushNotice)
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  const quests = useApi<QuestsResponse>("/api/quests")
  const dest = useApi<DestinationsDTO>("/api/destinations")
  const [claiming, setClaiming] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)
  // R67-c — guards the hero settle spring (the only motion this file adds)
  const reduce = useReducedMotion()

  const dailies = quests.data?.dailies ?? []
  const open = dailies.filter((q) => !q.claimed).slice(0, 4)
  const allDone = dailies.length > 0 && dailies.every((q) => q.claimed)
  // R67-c — the "done" chip's tone rides the real count (gold at zero, green
  // once anything is claimed); pure render derivation, zero logic change
  const doneCount = dailies.filter((q) => q.claimed).length

  const claim = async (q: QuestDTO) => {
    setClaiming(q.id)
    try {
      await api("/api/quests", {
        method: "POST",
        body: JSON.stringify({ questId: q.id, action: "claim" }),
      })
      pushNotice({ kind: "xp", title: `+${q.xpReward} XP`, body: q.title })
      setBurst((k) => k + 1) // R58 — the claim celebrates
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Not yet", body: (e as Error).message })
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div className="prime-rise space-y-4">
      {/* hero — the daily hello. R67-c: the name wears the green ink, the
          streak subline carries the amber flame tell, and the whole block
          settles in on a two-value spring (prime-reveal opts it out of the
          CSS mount cascade so this entrance owns the hero alone) — zero new
          visible characters, strings byte-identical */}
      <motion.section
        aria-label="Daily greeting"
        className="prime-reveal"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
      >
        <h1 className="text-2xl font-black tracking-tight text-[#3c3c3c] md:text-3xl">
          {greeting()}, <span className="text-[#46a302]">{hunter.name}</span>
        </h1>
        <Flourish />
        <p className="mt-2 text-sm font-semibold text-[#777]">
          {hunter.streak > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 shrink-0 text-[#ff9600]" aria-hidden />
              {/* one flex item carries the whole sentence — the space before
                  the em dash stays inline text, so the rendered string is
                  byte-identical to the original template literal */}
              <span>
                <span className="font-extrabold text-[#b26a00]">{hunter.streak}-day streak</span>
                {" — keep it going."}
              </span>
            </span>
          ) : (
            "No streak yet — one session starts it."
          )}
        </p>
      </motion.section>

      {/* level — the celebration card. R67-c: the green monogram badge (the
          TopBar idiom), big green "Level n", and the 2px hover lift — the
          screen's primary gamification moment finally reads as one */}
      <Card
        className="p-4 transition-transform hover:-translate-y-0.5"
        aria-label="Level progress"
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#61d905] to-[#4fbe02] shadow-[0_3px_0_0_#46a302]"
            aria-hidden
          >
            <Zap className="h-5 w-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black text-[#46a302]">Level {hunter.level}</p>
            <p className="text-xs font-bold tabular-nums text-[#777]">
              {fmt(hunter.xp)} / {fmt(hunter.xpNeeded)} XP
            </p>
          </div>
        </div>
        <ProgressBar value={hunter.xp} target={hunter.xpNeeded} className="mt-3" />
      </Card>

      {/* today's quests — simple checkable rows */}
      <section aria-label="Today's quests">
        <SectionLabel
          right={
            <Chip tone={doneCount > 0 ? "green" : "gold"}>
              +{doneCount}/{dailies.length || 0} done
            </Chip>
          }
        >
          Today's quests
        </SectionLabel>
        <Card className="p-1.5 transition-transform hover:-translate-y-0.5">
          {quests.loading ? (
            <div className="space-y-3 p-3">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : allDone ? (
            <div className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e8f8d8]">
                <Check className="h-5 w-5 text-[#46a302]" aria-hidden />
              </span>
              <p className="text-sm font-extrabold text-[#3c3c3c]">
                All quests done — nice work.
              </p>
            </div>
          ) : open.length === 0 ? (
            <div className="p-3">
              <EmptyNote>No quests yet — they appear when the day rolls.</EmptyNote>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {open.map((q) => {
                const complete = q.progress >= q.target
                const busy = claiming === q.id
                return (
                  <motion.button
                    key={q.id}
                    layout
                    onClick={() => (complete ? claim(q) : setTab(questTab(q.metric)))}
                    disabled={busy}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 56, scale: 0.96 }}
                    transition={{
                      layout: { type: "spring", stiffness: 360, damping: 30 },
                      duration: 0.28,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left",
                      "transition-[background-color,transform] duration-150 hover:bg-[#f7f7f4] active:scale-[0.99]",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                      busy && "opacity-60",
                    )}
                    aria-label={`${q.title} — ${q.progress} of ${q.target}`}
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2",
                        complete
                          ? "border-[#58cc02] bg-[#e8f8d8]"
                          : "border-[#ffe58f] bg-[#fff6d9]",
                      )}
                      aria-hidden
                    >
                      {complete ? (
                        <Check className="prime-pop h-4 w-4 text-[#46a302]" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-[#b26a00]" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-extrabold text-[#3c3c3c]">
                          {q.title}
                        </span>
                        <Chip tone={complete ? "green" : "gold"} className="shrink-0">
                          +{q.xpReward} XP
                        </Chip>
                      </span>
                      <ProgressBar
                        value={q.progress}
                        target={q.target}
                        tone={complete ? "green" : "ink"}
                        label
                        className="mt-1.5"
                      />
                    </span>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          )}
        </Card>
      </section>

      {/* the one honest snapshot strip */}
      <Reveal>
        <section aria-label="Today's numbers">
          <SectionLabel>Today's numbers</SectionLabel>
          <Card className="grid grid-cols-4 gap-2 p-4 transition-transform hover:-translate-y-0.5">
            <StatTile
              value={dest.data ? (dest.data.body.latestMassKg != null ? fmt(dest.data.body.latestMassKg) : "—") : "…"}
              countTo={dest.data?.body.latestMassKg ?? null}
              label="Weight kg"
              tone="teal"
              title={
                dest.data?.body.latestMassDay
                  ? `Last reading ${dest.data.body.latestMassDay}`
                  : "Log a weight in Log → Body"
              }
            />
            <StatTile
              value={
                dest.data
                  ? dest.data.fuel.todayKcal != null
                    ? fmt(dest.data.fuel.todayKcal)
                    : "—"
                  : "…"
              }
              countTo={dest.data?.fuel.todayKcal ?? null}
              label="Kcal in"
              tone="orange"
              title={
                dest.data?.fuel.todayProteinG != null
                  ? `${dest.data.fuel.todayProteinG} g protein today`
                  : "Log food in Log → Food"
              }
            />
            <StatTile
              value={
                dest.data
                  ? dest.data.vitals.readiness
                    ? `${dest.data.vitals.readiness.score}`
                    : "—"
                  : "…"
              }
              countTo={dest.data?.vitals.readiness ? dest.data.vitals.readiness.score : null}
              label={dest.data?.vitals.readiness ? dest.data.vitals.readiness.band.toLowerCase() : "Readiness"}
              tone={
                dest.data?.vitals.readiness?.band === "PRIMED"
                  ? "green"
                  : dest.data?.vitals.readiness?.band === "READY"
                    ? "teal"
                    : "ink"
              }
              title="Sleep + heart-rate check-in — Log → Vitals"
            />
            <StatTile
              value={dest.data ? fmt(dest.data.records.prCount) : "…"}
              countTo={dest.data?.records.prCount ?? null}
              label="PRs"
              tone="gold"
              title="Personal records, lifetime"
            />
          </Card>
        </section>
      </Reveal>

      {/* the single green action + quiet quick-logs */}
      <Reveal>
        <section aria-label="Quick actions">
          <BigButton full size="lg" onClick={() => setTab("train")}>
            <Dumbbell className="h-5 w-5" aria-hidden />
            Start today's workout
          </BigButton>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <BigButton variant="outline" size="md" onClick={() => setTab("log")}>
              <Utensils className="h-4 w-4" aria-hidden />
              Log a meal
            </BigButton>
            <BigButton variant="outline" size="md" onClick={() => setTab("log")}>
              Log weight
            </BigButton>
          </div>
        </section>
      </Reveal>

      {/* the full 56-round Status console, one tap away */}
      <Reveal>
        <ShowEverything label="Show full status console">
          <StatusTab hunter={hunter} />
        </ShowEverything>
      </Reveal>

      {/* R58 — the claim celebration (pure decoration, aria-hidden) */}
      <ConfettiBurst fire={burst} />
    </div>
  )
}
