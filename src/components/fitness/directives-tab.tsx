"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { CheckCircle2, ChevronDown, ChevronsUp, Circle, Crosshair, Flame, FlaskConical, Gift, Infinity as InfinityIcon, Lock, Minus, Plus, RotateCcw, Skull, Sparkles, Swords, Timer } from "lucide-react"
import { AnimatePresence, animate, motion, useReducedMotion } from "framer-motion"
import { FlowGroup, FlowItem, FlowReveal, FLOW_EASE, MeterFlow, SPRING_BOUNCE } from "@/components/system/motion"
import { SwipeRow, type SwipeRowAction } from "@/components/system/swipe-row"
import { RowHint } from "@/components/system/row-hint"
// R54-c2 declutter — SysSection stands down on this tab (panels self-label);
// section-mark.tsx stays on disk for the tabs that still mount it.
import { InfoHint } from "@/components/system/info-hint"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { dayKey, msUntilNextTzMidnight, STAT_DEFS, type StatKey } from "@/lib/game"
import { epleyE1rm, validE1rmSet } from "@/lib/strength-science"
import { scienceFor } from "@/lib/science"
import {
  assess5kTime,
  assessFirstPullUp,
  assessVerticalJump,
  equivalent5kSec,
  fmtRunClock,
  jumpDataChips,
  pullUpDataChips,
  run5kDataChips,
  type HabitItem,
  type JumpAssessment,
  type JumpEquipment,
  type JumpExperience,
  type JumpInput,
  type MusclePriority,
  type Priority,
  type PullUpAssessment,
  type PullUpInput,
  type Run5kAssessment,
  type Run5kInput,
  type RunEquipment,
} from "@/lib/advisor"
import { CALIBRATED_DAILIES, DAILY_POOL } from "@/lib/quests"
import type { HunterDTO, QuestDTO, RewardResult } from "@/lib/types"
import { cn } from "@/lib/utils"

// R54-c2 declutter — the tab's Oracle banner is compressed by the local
// QuietOracleLine below (same endpoint + contract as ./oracle-tip, which
// stays on disk for the tabs that still mount it).

type QuestsRes = { dailies: QuestDTO[]; main: QuestDTO[]; failed?: QuestDTO[] }
type ClaimRes = {
  quest: QuestDTO
  reward: RewardResult & {
    statGained?: { stat: string; amount: number } | null
    pointReward?: number
  }
}

/** Template default targets — used to detect roll-time PR calibration. */
const DEFAULT_TARGETS = new Map(DAILY_POOL.map((t) => [t.code, t.target]))

/** R54-c2 — milestone rows that render flat before the SHOW ALL expander. */
const MILESTONE_PREVIEW = 6

/** True when this daily's target was scaled from the hunter's own record. */
function isCalibrated(q: QuestDTO): boolean {
  if (!CALIBRATED_DAILIES[q.code]) return false
  return q.target !== DEFAULT_TARGETS.get(q.code)
}

/** R54-c2 — declutter: row faces keep the short imperative; the explanatory
 *  tail after the em dash (calibration math, editorial asides) rides the
 *  row's title attribute instead of the surface. Descriptions without an
 *  em dash are already pure imperative and pass through whole. */
function shortImperative(description: string): string {
  const head = description.split(" — ")[0]
  return head === "" ? description : head
}

/** R10-b — swipeflow actions for daily quest rows. Rail + label hues come
 *  straight from SwipeRowAction's tone map (emerald = claim/reward, violet =
 *  verify) — no new colors. Rows without a gesture still need the required
 *  `action` prop, so they carry a nominal idle action whose rail sleeps at
 *  its resting opacity and never lights (the gesture is disabled). */
const SWIPE_CLAIM: SwipeRowAction = { icon: Gift, tone: "emerald", label: "CLAIM" }
const SWIPE_VERIFY: SwipeRowAction = { icon: CheckCircle2, tone: "violet", label: "VERIFY" }
const SWIPE_IDLE: SwipeRowAction = { icon: Circle, tone: "violet", label: "STANDBY" }

/** ◈ CALIBRATED chip shown on record-scaled directives — R54-c2: the chip's
 *  container also carries the calibrated InfoHint (pop-up meaning); the
 *  per-row calibration math rides the row title's full description. */
function CalibratedChip() {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="calibrated-chip inline-flex items-center gap-1 rounded-full border border-teal-400/40 bg-teal-500/[0.07] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] text-teal-300"
        title="Target scaled from your personal record at roll time — floors and caps keep it humane"
      >
        <Crosshair className="calibrated-lock h-2.5 w-2.5" aria-hidden /> CALIBRATED
      </span>
      <InfoHint term="calibrated" />
    </span>
  )
}

// ── R54-c2 — the Oracle banner, compressed ───────────────────────────────────
// Same endpoint, same data, same null-while-loading contract as the shared
// OracleTip: known directives-tip segments compress to essentials, the reset
// cadence stands down (the Daily Goals panel header already carries the live
// RESETS-IN countdown), and the full oracle sentence rides the line's title.
// Unrecognized tips — e.g. the [FIELD MANUAL] science fallback — render whole;
// never mangle what we can't parse.
const ORACLE_SEGMENT_MAP: { re: RegExp; to: string | null }[] = [
  { re: /^1 DAILY QUEST AWAIT$/, to: "1 quest" },
  { re: /^(\d+) DAILY QUESTS AWAIT$/, to: "$1 quests" },
  { re: /^\+(\d+) XP CLAIMABLE$/, to: "+$1 XP claimable" },
  { re: /^RESETS (AT YOUR MIDNIGHT|00:00 UTC)$/, to: null },
  { re: /^STREAK (\d+)D$/, to: "streak $1d" },
  { re: /^DAILY QUESTS CLEARED$/, to: "quests cleared" },
  { re: /^RETURN TOMORROW FOR NEW ORDERS$/, to: null },
]

function compressOracleTip(tip: string): string {
  const out: string[] = []
  for (const seg of tip.split(" · ")) {
    const hit = ORACLE_SEGMENT_MAP.find((m) => m.re.test(seg))
    if (!hit) {
      out.push(seg)
    } else if (hit.to != null) {
      out.push(seg.replace(hit.re, hit.to))
    }
  }
  return out.join(" · ")
}

function QuietOracleLine() {
  const { data, loading } = useApi<{ tip: string | null }>("/api/oracle/tip?tab=directives")
  const reduce = useReducedMotion()
  const tip = data?.tip ?? null
  if (loading || !tip) return null
  const short = compressOracleTip(tip)
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: FLOW_EASE }}
      role="status"
      aria-label={`Oracle tip: ${tip}`}
      title={tip}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-sm border-l-2 border-amber-500/25 bg-amber-500/[0.04] px-3 py-2"
    >
      <Sparkles className="sys-pulse h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
      <p className="min-w-0 flex-1 font-mono text-[10px] leading-snug tracking-wide text-amber-200/80">{short}</p>
    </motion.div>
  )
}

/** Milestone category — purely presentational (render-time detection). */
type MilestoneKind = "hunt" | "rite"

/** boss_kills / ascensions milestones carry a category identity: the rose
 *  danger language of the BossBanner or the fuchsia rite language of the
 *  AscensionCard. No data, store or API involvement. */
function milestoneKind(q: QuestDTO): MilestoneKind | null {
  if (q.metric === "boss_kills") return "hunt"
  if (q.metric === "ascensions") return "rite"
  return null
}

/** Tiny category chip — HUNT (rose, crossed swords) / RITE (fuchsia, diamond). */
function MilestoneChip({ kind }: { kind: MilestoneKind }) {
  if (kind === "hunt") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/[0.07] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] text-rose-300"
        title="Challenge milestone — beat the weekly challenge"
      >
        <Swords className="h-2 w-2" aria-hidden /> CHALLENGE
      </span>
    )
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/[0.07] px-1.5 py-0.5 text-[9px] font-bold tracking-[0.14em] text-fuchsia-300"
      title="New Cycle milestone — prestige resets"
    >
      <span className="inline-block h-1.5 w-1.5 rotate-45 bg-fuchsia-400" aria-hidden /> CYCLE
    </span>
  )
}

/** R14-c — one reward chip: a barely-there SPRING_BOUNCE pop on mount
 *  (scale 0.8 → 1 — chips are 9-10px text, the slight overshoot reads as
 *  physical settling, never bouncy). The chips are flex items, so the scale
 *  transform applies cleanly. Reduced motion → the same static span. */
function RewardChip({ className, children }: { className?: string; children: ReactNode }) {
  const reduce = !!useReducedMotion()
  if (reduce) {
    return <span className={className}>{children}</span>
  }
  return (
    <motion.span className={className} initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={SPRING_BOUNCE}>
      {children}
    </motion.span>
  )
}

function rewardChips(q: QuestDTO, bloom = false) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
      <RewardChip
        className={cn(
          "rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 text-violet-300",
          // R9-b — ready-to-claim: the XP chip carries an amber state light
          bloom && "sys-bloom-amber"
        )}
      >
        +{q.xpReward} XP
      </RewardChip>
      {q.statReward && (
        <RewardChip className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
          +{q.statReward.amount} {STAT_DEFS[q.statReward.stat as StatKey]?.short ?? q.statReward.stat.toUpperCase()}
        </RewardChip>
      )}
      {q.pointReward > 0 && (
        <RewardChip className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
          +{q.pointReward} PT
        </RewardChip>
      )}
    </div>
  )
}

function progressLabel(q: QuestDTO) {
  if (q.metric === "hydrate" || q.metric === "sleep") return null
  if (q.metric === "volume") return `${q.progress.toLocaleString()} / ${q.target.toLocaleString()} kg`
  return `${q.progress} / ${q.target}`
}

/** Live countdown to when today's dailies reset — R38: the backend now rolls
 *  the hunter's day at THEIR midnight (Hunter.timezone; null = legacy 00:00
 *  UTC), so the countdown targets that same boundary via the shared tz math.
 *  Ticks every 30s; the target is recomputed from `now` on every tick, so a
 *  rollover naturally re-aims at the following night. R37-a's UTC honesty is
 *  preserved for null-timezone hunters (byte-compatible fallback). */
function ResetCountdown({ timezone }: { timezone: string | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const ms = msUntilNextTzMidnight(timezone, new Date(now))
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const resetTitle = timezone
    ? "Today's goals reset at your midnight"
    : "Today's goals reset at 00:00 UTC"

  return (
    <span
      role="timer"
      aria-label={`Daily quests reset in ${hours} hours ${minutes} minutes`}
      title={resetTitle}
      className="hidden shrink-0 items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400 sm:flex"
    >
      <Timer className="h-3 w-3 shrink-0" aria-hidden />
      RESETS IN {String(hours).padStart(2, "0")}H {String(minutes).padStart(2, "0")}M
    </span>
  )
}

/** DIRECTIVES tab — dailies + main milestones. */
export function DirectivesTab({ hunter }: { hunter: HunterDTO }) {
  const { data, loading, reload } = useApi<QuestsRes>("/api/quests")
  const { bumpRefresh, pushNotice, showReward } = useSystem()
  const [busyId, setBusyId] = useState<string | null>(null)
  // R54-c2 — long-game expander: MILESTONE_PREVIEW rows render flat, the
  // tail folds behind SHOW ALL (the export-center recipe)
  const [showAllMilestones, setShowAllMilestones] = useState(false)
  // R10-b — the swipe affordance stays honest under reduced motion: no
  // gesture, no grip hint (SwipeRow would disable itself anyway)
  const reduceMotion = !!useReducedMotion()

  // R14-c — claim-moment bloom bookkeeping: one surface ref + one previous-
  // completed flag per daily row (a usePrevious-style comparison, keyed by
  // quest id so the rows can stay inline). After every data refresh the
  // effect diffs completions and fires a one-shot scale breathe [1 → 1.015 →
  // 1] on the live incomplete→complete flip (an auto-tracked daily finishing
  // after a workout, or manual verification right here). A row that mounts
  // already-complete (prev === undefined) never pulses; un-completion and
  // reduced motion stand it down. Rows that leave the set (reroll / midnight
  // reset) are pruned so the maps never go stale.
  const rowSurfaces = useRef(new Map<string, HTMLDivElement>())
  const prevCompleted = useRef(new Map<string, boolean>())
  useEffect(() => {
    if (!data) return
    for (const q of data.dailies) {
      const prev = prevCompleted.current.get(q.id)
      prevCompleted.current.set(q.id, q.completed)
      if (prev === undefined || prev === q.completed || !q.completed || reduceMotion) continue
      const el = rowSurfaces.current.get(q.id)
      if (el) {
        // quick pulse on the row surface — layered INSIDE SwipeRow's sheet,
        // so the gesture's transform owner (the sheet) is never touched
        animate(el, { scale: [1, 1.015, 1] }, { duration: 0.45, ease: FLOW_EASE })
      }
    }
    const live = new Set(data.dailies.map((q) => q.id))
    for (const id of prevCompleted.current.keys()) {
      if (!live.has(id)) {
        prevCompleted.current.delete(id)
        rowSurfaces.current.delete(id)
      }
    }
  }, [data, reduceMotion])

  const forgeAct = async (action: "reroll" | "revive", questId?: string) => {
    if (busyId) return
    setBusyId(action + (questId ?? ""))
    try {
      await api("/api/forge", {
        method: "POST",
        body: JSON.stringify({ action, ...(questId ? { questId } : {}) }),
      })
      if (action === "reroll") {
        pushNotice({ kind: "info", title: "GOALS REDRAWN", body: "Smart Swap drew a fresh set of goals." })
      } else {
        pushNotice({ kind: "info", title: "GOAL REVIVED", body: "The goal is active again — finish it today." })
      }
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Perk failed", body: (e as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  const act = async (q: QuestDTO, action: "claim" | "check") => {
    if (busyId) return
    setBusyId(q.id)
    try {
      const res = await api<ClaimRes>("/api/quests", {
        method: "POST",
        body: JSON.stringify({ questId: q.id, action }),
      })
      if (action === "check") {
        pushNotice({ kind: "info", title: "Goal verified", body: q.title })
      } else {
        showReward({
          ...res.reward,
          questTitle: q.title,
          statGained: res.reward.statGained ?? null,
          pointReward: res.reward.pointReward,
          source: "quest",
        })
      }
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "System rejected action", body: (e as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  const dailies = data?.dailies ?? []
  const main = data?.main ?? []
  const failed = data?.failed ?? []
  const mainOpen = main.filter((q) => !q.claimed)
  const mainDone = main.filter((q) => q.claimed)

  // R54-c2 declutter — the long-game list: rows beyond MILESTONE_PREVIEW fold
  // behind SHOW ALL (export-center recipe), with completed-open rows promoted
  // ahead of the cap so a ready CLAIM never buries behind the fold (no
  // claimable rows → the original order is preserved exactly).
  const milestoneList = (() => {
    const all = [...mainOpen, ...mainDone]
    const claimable = all.filter((q) => q.completed && !q.claimed)
    if (claimable.length === 0) return all
    const ids = new Set(claimable.map((q) => q.id))
    return [...claimable, ...all.filter((q) => !ids.has(q.id))]
  })()

  /** R54-c2 — one milestone row (the R11-a swipeflow body, moved verbatim
   *  under the preview cap + SHOW ALL expander; the description sentence
   *  rides the row's title attr — name + progress + reward chips stay on
   *  the face, CLAIM state untouched). */
  const renderMilestone = (q: QuestDTO, i: number) => {
    const pct = Math.min(100, (q.progress / q.target) * 100)
    const kind = milestoneKind(q)
    // R11-a — milestone swipeflow: a completed open milestone's claim
    // becomes a gesture — the swipe IS the claim (emerald CLAIM rail
    // under the finger, routing through the same act() as the CLAIM
    // button, which stays the accessible path). In-progress rows
    // carry the nominal idle action (gesture off — SWIPE_IDLE standby
    // pattern from the daily rows); claimed rows skip the wrapper
    // entirely: today's DOM, today's pixels, lightest tree.
    const swipeClaim = q.completed && !q.claimed
    const swipeEnabled = swipeClaim && busyId !== q.id && !reduceMotion
    const rowClass = cn(
      // R9-b — de-boxed: kind-colored spine + gradient lift; the
      // border turns transparent and only surfaces on hover
      "sys-accent-row relative rounded-lg border border-transparent p-3.5 transition-colors",
      q.claimed
        ? "opacity-50"
        : kind === "hunt"
          ? "milestone-hunt hover:border-rose-400/40"
          : kind === "rite"
            ? "milestone-rite hover:border-fuchsia-400/40"
            : "hover:border-zinc-600/60"
    )
    const rowVars = {
      "--row-accent": q.claimed
        ? "rgba(113,113,122,.3)"
        : q.completed
          ? "rgba(16,185,129,.65)"
          : kind === "hunt"
            ? "rgba(251,113,133,.6)"
            : kind === "rite"
              ? "rgba(232,121,249,.6)"
              : "rgba(167,139,250,.55)",
      "--row-lift": q.claimed
        ? "rgba(113,113,122,.03)"
        : q.completed
          ? "rgba(16,185,129,.05)"
          : kind === "hunt"
            ? "rgba(251,113,133,.05)"
            : kind === "rite"
              ? "rgba(232,121,249,.05)"
              : "rgba(167,139,250,.04)",
    } as React.CSSProperties
    const body = (
      <>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {q.claimed ? (
              <Lock className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
            ) : q.completed ? (
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            ) : kind === "hunt" ? (
              <Skull className="milestone-hunt-icon h-4 w-4 shrink-0 text-rose-300" aria-hidden />
            ) : kind === "rite" ? (
              <InfinityIcon className="milestone-rite-icon h-4 w-4 shrink-0 text-fuchsia-300" aria-hidden />
            ) : (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden />
            )}
            {/* R54-c2 — the description sentence rides the row's title attr
                (name + progress + reward chips stay on the face) */}
            <div className="min-w-0" title={q.description}>
              <div className="flex min-w-0 items-center gap-1.5">
                <p className={cn("min-w-0 flex-1 truncate text-xs font-medium", q.claimed ? "text-zinc-600" : "text-zinc-200")}>
                  {q.title}
                </p>
                {kind && <MilestoneChip kind={kind} />}
              </div>
            </div>
          </div>
          {q.claimed ? (
            <span className="shrink-0 text-[10px] font-semibold tracking-[0.12em] text-zinc-600">CLEARED</span>
          ) : q.completed ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => act(q, "claim")}
              disabled={busyId === q.id}
              className={cn(
                "pill-action min-h-11 shrink-0 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1.5",
                "text-[10px] font-bold tracking-[0.12em] text-emerald-300",
                "transition-colors hover:bg-emerald-500/25 hover:text-emerald-200 disabled:opacity-40",
                "focus-visible:outline focus-visible:outline-violet-400/70"
              )}
            >
              CLAIM
            </motion.button>
          ) : (
            <span
              className={cn(
                "shrink-0 font-mono text-[10px] tabular-nums tracking-widest",
                kind === "hunt" ? "text-rose-300/80" : kind === "rite" ? "text-fuchsia-300/80" : "text-zinc-400"
              )}
            >
              {progressLabel(q) ?? `${q.progress}/${q.target}`}
            </span>
          )}
        </div>

        {!q.claimed && (
          <div className="mt-2.5 flex items-center gap-3">
            <div className="aurora-track flex-1">
              {/* R15 — milestone meters ride the MeterFlow language
                  (R14-c covered the dailies). inView:true because
                  this section reveals on scroll — the sweep waits
                  for the reader instead of firing while the row is
                  still invisible. R48-a studio — the track joins the
                  aurora hairline family: default milestones pour the
                  violet aurora, completed ones gild amber; R49-b —
                  hunt/rite category blades pour the rose/fuchsia
                  auroras (the orchestrator's aurora-fill-rose/
                  -fuchsia tokens completed the family).
                  Inline transition:none keeps framer the sole width
                  driver. */}
              <MeterFlow
                pct={pct}
                inView
                duration={0.7}
                className={cn(
                  q.completed
                    ? "aurora-fill aurora-fill-amber"
                    : kind === "hunt"
                      ? "aurora-fill aurora-fill-rose"
                      : kind === "rite"
                        ? "aurora-fill aurora-fill-fuchsia"
                        : "aurora-fill aurora-fill-violet"
                )}
                style={{ transition: "none" }}
              />
            </div>
            <div className="shrink-0">{rewardChips(q, q.completed && !q.claimed)}</div>
          </div>
        )}
      </>
    )
    return (
      <FlowItem
        key={q.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(i, 12) * 0.045, duration: 0.45, ease: FLOW_EASE }}
        // R11-a — press-depth mirrors the daily rows: actionable
        // (swipe-claimable) rows only; idle/claimed rows stay inert
        whileTap={swipeClaim ? { scale: 0.985 } : undefined}
      >
        {q.claimed ? (
          <div className={rowClass} style={rowVars}>
            {body}
          </div>
        ) : (
          <SwipeRow
            action={swipeClaim ? SWIPE_CLAIM : SWIPE_IDLE}
            onCommit={() => {
              if (swipeClaim) act(q, "claim")
            }}
            enabled={swipeEnabled}
            // overflow-hidden clips the opaque sheet to the row frame
            // (R10 quest-row recipe — the resting visual is unchanged)
            className={cn(rowClass, "overflow-hidden")}
            style={{ touchAction: "pan-y", ...rowVars }}
          >
            {/* the row surface — opaque (panel-composite approximation
                + the row's own lift wash) so the reveal layer sleeps
                beneath at rest; this is what the finger drags off the
                rail */}
            <div
              className="relative"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--row-lift), transparent 68%), linear-gradient(160deg, #17171B, #0B0B0E)",
              }}
            >
              {swipeEnabled && (
                <span
                  className="sys-row-hint pointer-events-none absolute -left-3 top-1/2 -translate-y-1/2 text-[10px] leading-none text-zinc-600"
                  aria-hidden
                >
                  «
                </span>
              )}
              {body}
            </div>
          </SwipeRow>
        )}
      </FlowItem>
    )
  }

  if (loading && !data) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <SkeletonPanel label="SYNCING DAILY GOALS" rows={3} />
        <SkeletonPanel label="SYNCING MILESTONES" rows={2} />
      </div>
    )
  }

  return (
    <FlowGroup className="space-y-4 sm:space-y-5">
      {/* R54-c2 declutter — the three numbered SysSection rows (01 DAILY
          ORDERS · 02 ASCENT · 03 LONG GAME) stand down: every panel below
          carries its own label, so the landing view loses the double-heading
          prose (the SysSection component lives on elsewhere in the app). */}
      <FlowItem>
        <QuietOracleLine />
      </FlowItem>

      {/* 01 — today's calibrated orders (+ revivable failures) */}

      {/* R13-b — one-time row-gesture hint (daily quest rows below) */}
      <RowHint surface="quests" />

      {/* dailies */}
      <FlowItem>
        <SystemPanel
        label="Daily Goals"
        labelAccent={
          <span className="flex items-center gap-3">
            <InfoHint term="goals" />
            <button
              onClick={() => forgeAct("reroll")}
              disabled={busyId === "reroll"}
              className="group flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1.5 text-[9px] font-bold tracking-[0.14em] text-violet-300 transition-colors hover:bg-violet-500/20 hover:text-violet-200 active:bg-violet-500/25 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              title="Smart Swap — redraw today's unclaimed goals"
            >
              <RotateCcw
                className="h-3 w-3 transition-transform duration-700 ease-out group-hover:rotate-180"
                aria-hidden
              />{" "}
              REROLL
            </button>
            <ResetCountdown timezone={hunter.timezone} />
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2">
          {dailies.map((q, i) => {
            const manual = q.metric === "hydrate" || q.metric === "sleep"
            // R10-b — swipeflow: the row's primary action as a gesture. A right
            // drag slides the row surface off its rail — emerald CLAIM for
            // ready rewards, violet VERIFY for manual-awaiting goals. Auto-
            // tracked active rows, claimed rows and busy rows carry no gesture
            // (their visible button remains the accessible path).
            const swipeKind: "claim" | "check" | null =
              q.completed && !q.claimed ? "claim" : manual && !q.completed ? "check" : null
            const swipeEnabled = swipeKind !== null && busyId !== q.id && !reduceMotion
            return (
              <FlowItem
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.45, ease: FLOW_EASE }}
                // R10-b — press-depth: actionable rows read as physically
                // depressed while tapped (claimed/disabled rows stay inert)
                whileTap={swipeKind ? { scale: 0.985 } : undefined}
              >
                <SwipeRow
                  action={swipeKind === "claim" ? SWIPE_CLAIM : swipeKind === "check" ? SWIPE_VERIFY : SWIPE_IDLE}
                  onCommit={() => {
                    if (swipeKind) act(q, swipeKind)
                  }}
                  enabled={swipeEnabled}
                  className={cn(
                    "sys-accent-row relative overflow-hidden rounded-lg p-4 transition-colors",
                    q.claimed ? "opacity-60" : q.completed ? "shadow-[0_0_18px_rgba(16,185,129,0.12)]" : undefined
                  )}
                  style={
                    {
                      // SwipeRow spreads forwarded props last, which would
                      // replace its internal touch-action style — re-assert
                      // pan-y so vertical scrolling stays native.
                      touchAction: "pan-y",
                      // R9-b — de-boxed quest rows: state speaks through the spine
                      // (violet active · emerald ready-to-claim · zinc claimed)
                      "--row-accent": q.claimed
                        ? "rgba(113,113,122,.35)"
                        : q.completed
                          ? "rgba(16,185,129,.7)"
                          : "rgba(167,139,250,.6)",
                      "--row-lift": q.claimed
                        ? "rgba(113,113,122,.03)"
                        : q.completed
                          ? "rgba(16,185,129,.06)"
                          : "rgba(167,139,250,.05)",
                    } as React.CSSProperties
                  }
                >
                  {/* R10-b — the row surface: opaque so SwipeRow's reveal layer
                      sleeps beneath it at rest (translucency is forbidden on
                      swipe sheets — the gesture's mechanical contract).
                      R49-b — the base pours the studio void-neutral charcoal
                      (#17171B → #0B0B0E, the R43 void-black family) so the
                      resting row reads continuous with its panel; the lift wash
                      rides on top — this is what the finger drags off the rail.
                      R14-c — the surface ref feeds the claim-moment bloom
                      (scale pulse on the live incomplete→complete flip). */}
                  <div
                    ref={(el) => {
                      if (el) rowSurfaces.current.set(q.id, el)
                      else rowSurfaces.current.delete(q.id)
                    }}
                    className="relative"
                    style={{
                      // two layers: the row-lift wash rides ON TOP of the
                      // opaque base (first layer paints above the second)
                      backgroundImage:
                        "linear-gradient(90deg, var(--row-lift), transparent 68%), linear-gradient(160deg, #17171B, #0B0B0E)",
                    }}
                  >
                    {swipeEnabled && (
                      <span
                        className="sys-row-hint pointer-events-none absolute -left-3 top-1/2 -translate-y-1/2 text-[10px] leading-none text-zinc-600"
                        aria-hidden
                      >
                        «
                      </span>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className={cn("text-sm font-medium", q.claimed ? "text-zinc-500 line-through" : "text-zinc-200")}>
                            {q.title}
                          </p>
                          {isCalibrated(q) && <CalibratedChip />}
                        </div>
                        {/* R54-c2 — the face keeps the short imperative; the
                            calibration tail rides the title */}
                        <p className="mt-1 sys-italic text-[11px] leading-snug text-amber-100/80" title={q.description}>
                          {shortImperative(q.description)}
                        </p>
                      </div>
                      {q.claimed ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500/70" aria-hidden />
                      ) : q.completed ? (
                        <Circle className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                      ) : (
                        <Circle className="h-5 w-5 shrink-0 text-zinc-700" aria-hidden />
                      )}
                    </div>

                    <div className="mt-3">{rewardChips(q, q.completed && !q.claimed)}</div>

                    {!q.claimed && (
                      <>
                        {/* R13-d — progress status line reads zinc-400 (≈7.5:1 on the
                            row sheet) after the VLM audit flagged the old zinc-500
                            (≈4.0:1) as near-unreadable at 10px mono */}
                        <div className="mt-3 flex items-center justify-between font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
                          <span>{manual ? (q.completed ? "VERIFIED" : "AWAITING VERIFICATION") : progressLabel(q)}</span>
                          <span>{Math.round(Math.min(100, (q.progress / q.target) * 100))}%</span>
                        </div>
                        <div className="aurora-track mt-1">
                          {/* R14-c — MeterFlow fill: mounts from 0 and sweeps to
                              pct (0.8s default) so every Goals visit reads the
                              meters flowing in; later progress glides on the
                              same curve. R48-a studio — the quest meter joins
                              the aurora family: a luminous 3px hairline, violet
                              while active, gilded amber once complete. Inline
                              transition:none keeps framer the sole width driver
                              (the class's CSS width-transition would low-pass
                              its per-frame writes). */}
                          <MeterFlow
                            pct={Math.min(100, (q.progress / q.target) * 100)}
                            className={cn(
                              "aurora-fill",
                              q.completed ? "aurora-fill-amber" : "aurora-fill-violet"
                            )}
                            style={{ transition: "none" }}
                          />
                        </div>

                        <div className="mt-3 flex justify-end">
                          {manual && !q.completed ? (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => act(q, "check")}
                              disabled={busyId === q.id}
                              className="min-h-11 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-zinc-300 transition-colors hover:border-violet-400/40 hover:bg-white/[0.06] hover:text-violet-200 active:border-violet-400/70 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                            >
                              MARK VERIFIED
                            </motion.button>
                          ) : q.completed ? (
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => act(q, "claim")}
                              disabled={busyId === q.id}
                              className={cn(
                                "pill-action flex min-h-11 items-center gap-1.5 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3.5 py-1.5",
                                "text-[10px] font-bold tracking-[0.12em] text-emerald-300",
                                "transition-colors hover:bg-emerald-500/25 hover:text-emerald-200 disabled:opacity-40",
                                "focus-visible:outline focus-visible:outline-violet-400/70"
                              )}
                            >
                              <Gift className="h-3 w-3" aria-hidden />
                              {busyId === q.id ? "CLAIMING…" : "CLAIM REWARD"}
                            </motion.button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </SwipeRow>
              </FlowItem>
            )
          })}
        </div>
      </SystemPanel>
      </FlowItem>

      {/* failed directives (revivable) */}
      {failed.length > 0 && (
        <FlowItem>
          <SystemPanel
          label="Failed Goals"
          labelAccent={
            <span
              className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.12em] text-rose-400/80"
              title="Revivable with Streak Revival"
            >
              <Flame className="h-3 w-3" aria-hidden /> REVIVABLE
            </span>
          }
        >
          <div className="space-y-2.5 p-4 sm:p-5">
            {failed.map((q, i) => (
              // R14-c — failed rows get the standard per-row rise (the panel
              // already rides a FlowItem; this is the row-level pass), same
              // delay recipe as the daily quest rows above
              <motion.div
                key={q.id}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { delay: Math.min(i, 8) * 0.05, duration: 0.45, ease: FLOW_EASE }
                }
                className="relative rounded-xl bg-gradient-to-r from-rose-500/50 via-orange-400/25 to-transparent p-px"
              >
                {/* burnt ember edge — flickers along the top */}
                <span
                  className="sys-pulse pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-rose-400/60 to-transparent"
                  aria-hidden
                />
                <div className="relative flex items-center justify-between gap-3 rounded-[11px] bg-zinc-950/85 px-3.5 py-3">
                  {/* R55-d — the per-row FAILED meta (day · progress/target)
                      rides the container's title (recipe #2); the visible row
                      keeps the name + REVIVE path untouched. */}
                  <div className="min-w-0" title={`Failed ${q.day} · ${q.progress}/${q.target}`}>
                    <p className="truncate text-xs font-medium text-zinc-400 line-through">{q.title}</p>
                  </div>
                  <button
                    onClick={() => forgeAct("revive", q.id)}
                    disabled={busyId === "revive" + q.id}
                    className="group/revive flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-orange-500/50 bg-orange-500/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-orange-300 transition-colors hover:bg-orange-500/25 active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    <Flame
                      className="h-3 w-3 transition-transform duration-500 group-hover/revive:scale-125"
                      aria-hidden
                    />
                    {busyId === "revive" + q.id ? "BURNING…" : "REVIVE"}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </SystemPanel>
        </FlowItem>
      )}

      {/* 02 — ASCENT: the deterministic vertical jump advisor (R31-a) */}
      <FlowReveal>
        <AscentPanel />
      </FlowReveal>

      {/* 03 — the long game: milestone hunts (reveals on scroll) */}
      <FlowReveal>
        <SystemPanel
          label="Milestones"
          labelAccent={
            <span className="flex items-center gap-2 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
              <InfoHint term="milestones" />
              {mainOpen.length} ACTIVE · {mainDone.length} CLEARED
            </span>
          }
        >
        <div className="max-h-96 overflow-y-auto scroll-sys p-4 sm:p-5">
          <div className="space-y-2.5">
            {/* R54-c2 — milestone preview: MILESTONE_PREVIEW rows render flat,
                the tail folds behind SHOW ALL (the export-center recipe —
                AnimatePresence height fold, reduce-safe; every row stays one
                tap away, claim logic untouched). */}
            {milestoneList.slice(0, MILESTONE_PREVIEW).map((q, i) => renderMilestone(q, i))}
            <AnimatePresence initial={false}>
              {showAllMilestones && milestoneList.length > MILESTONE_PREVIEW && (
                <motion.div
                  key="milestone-rest"
                  initial={reduceMotion ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduceMotion ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2.5">
                    {milestoneList.slice(MILESTONE_PREVIEW).map((q, i) => renderMilestone(q, i + MILESTONE_PREVIEW))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {milestoneList.length > MILESTONE_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllMilestones((v) => !v)}
                aria-expanded={showAllMilestones}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-zinc-800/60 bg-zinc-950/40 font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-400 uppercase transition-colors hover:border-amber-400/40 hover:text-amber-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showAllMilestones && "rotate-180")} aria-hidden />
                {showAllMilestones ? "SHOW LESS" : `SHOW ALL · ${milestoneList.length}`}
              </button>
            )}
          </div>
        </div>
        </SystemPanel>
      </FlowReveal>

      {/* R54-c2 — the all-caps banner quiets to one sentence-case line.
          R55-d — the quiet line stands down from the VISIBLE surface (the
          streak already reads in the compressed oracle banner at the tab's
          head); the sentence rides sr-only for assistive tech. */}
      <p className="sr-only">Goals sync with training · streak {hunter.streak}d</p>
    </FlowGroup>
  )
}

// ─── R31-a + R32-b · ASCENT — the three-goal advisor panel ─────────────────────
// Deterministic calculators (lib/advisor.ts — zero LLM by design): pick a goal
// (vertical jump · first pull-up · 5K time), stage 1 inventories HAVE/MISSING
// data for THAT goal, stage 2 asks ONLY for what is missing (plus local-only
// experience / equipment / injury answers), stage 3 renders the verdict, the
// muscle (or training-focus) priorities, prescriptions and habit stack. SAVE
// BASELINE is the only write path (one POST per missing server reading);
// everything else reads.

type AscentMetricsRes = {
  profile: { heightCm: number | null; weightKg: number | null; birthYear: number | null; sex: string | null }
  latest: Record<string, { value: number; day: string; unit: string } | null>
  series: Record<string, { day: string; value: number }[]>
}
type AscentPrRecord = {
  id: string
  name: string
  type: string
  context: { sets: number; reps: number; weightKg: number; durationMin: number } | null
}
type AscentPrsRes = { records: AscentPrRecord[] }
type AscentProgramRes = { program: { equipment: string; days: number; experience: string } | null }
type MetricSaveRes = { metric: { day: string; type: string; value: number; unit: string } }

/** The three ASCENT goals (R32-b) — jump shipped in R31-a. */
type AscentGoal = "jump" | "pullup" | "run5k"

const ASCENT_GOALS: readonly { id: AscentGoal; label: string }[] = [
  { id: "jump", label: "VERTICAL JUMP" },
  { id: "pullup", label: "FIRST PULL-UP" },
  { id: "run5k", label: "5K TIME" },
]

const ASCENT_EQUIPMENTS: readonly JumpEquipment[] = ["none", "home", "full-gym"]
const ASCENT_EXPERIENCES: readonly JumpExperience[] = ["novice", "intermediate", "advanced"]
const ASCENT_TRACKS: readonly RunEquipment[] = ["none", "track"]

/** Injury-flag vocabulary per goal (R32-b): pulling flags read shoulder/elbow,
 *  running flags read knee/ankle/back — switching goals clears the selection. */
const GOAL_FLAGS: Record<AscentGoal, readonly string[]> = {
  jump: ["knee", "ankle", "back"],
  pullup: ["shoulder", "elbow"],
  run5k: ["knee", "ankle", "back"],
}

/** Optional-driver chip ids that surface in the honest RAN-WITH-GAPS line. */
const ASCENT_GAP_IDS: Record<AscentGoal, readonly string[]> = {
  jump: ["jump", "squat", "sleep", "experience", "days", "equipment"],
  pullup: ["deadhang", "rows", "negatives", "sleep", "experience", "days", "equipment"],
  run5k: ["best5k", "best1k", "volume", "restinghr", "experience", "days", "sleep", "track"],
}

/** Per-goal explainer, folded off the surface (R54-c2): the intro
 *  paragraph + the SCIENCE footnote ride the READY accent's title attribute;
 *  the panel-label InfoHint (term="ascent") carries the short pop-up meaning. */
const GOAL_META: Record<
  AscentGoal,
  { scienceId: string; note: string }
> = {
  jump: {
    scienceId: "plyo-training",
    note: "Deterministic jump calculator — reads your profile, records and program, asks for what is missing, then prescribes muscle priorities, exercises and habits. No AI — just thresholds, honestly labeled.",
  },
  pullup: {
    scienceId: "pullup-progress",
    note: "Deterministic first pull-up calculator — reads your profile, records and program, asks for what is missing, then places you on a 5-rung progression ladder with muscle priorities, exercises and habits. No AI — just thresholds, honestly labeled.",
  },
  run5k: {
    scienceId: "polarized",
    note: "Deterministic 5K calculator — reads your profile, records and program, asks for what is missing, then prescribes training-focus priorities, sessions and habits (a 1K time converts to an honest 5K equivalent). No AI — just thresholds, honestly labeled.",
  },
}

// R55-d — the CORE_DATA_MISSING helper's field phrases compressed (recipe #4:
// the quiet sentence case rides the surface; the long-form article phrasing
// was pure chrome around the datum).
const CORE_FIELD_LABELS: Record<string, string> = {
  weight: "WEIGHT",
  height: "HEIGHT",
  "jump-or-reach": "JUMP OR REACH READING",
  capability: "DEAD-HANG, ROW OR NEGATIVE READING",
  time: "5K OR 1K TIME",
}

function isAscentEquipment(v: string | undefined): v is JumpEquipment {
  return v === "none" || v === "home" || v === "full-gym"
}
function isAscentExperience(v: string | undefined): v is JumpExperience {
  return v === "novice" || v === "intermediate" || v === "advanced"
}

function parseAscentNum(s: string): number | null {
  const t = s.trim()
  if (t === "") return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** 7-day sleep average from the metrics series — STRICT window (today minus 6,
 *  inclusive): stale points never fake a "recovery is fine" reading. */
function ascentSleepAvg(series: { day: string; value: number }[] | undefined): number | null {
  if (!series || series.length === 0) return null
  const now = new Date()
  const floor = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
  const pts = series.filter((p) => p.day >= floor)
  if (pts.length === 0) return null
  return pts.reduce((s, p) => s + p.value, 0) / pts.length
}

/** Panel-header science footnotes per goal (module-level, stable). */
const GOAL_SCIENCE: Record<AscentGoal, ReturnType<typeof scienceFor>> = {
  jump: scienceFor("plyo-training"),
  pullup: scienceFor("pullup-progress"),
  run5k: scienceFor("polarized"),
}

const PRIORITY_META: Record<Priority, { label: string; cls: string }> = {
  high: { label: "HIGH", cls: "border-rose-400/50 bg-rose-500/10 text-rose-300" },
  moderate: { label: "MODERATE", cls: "border-amber-400/40 bg-amber-500/10 text-amber-300" },
  low: { label: "LOW", cls: "border-teal-400/40 bg-teal-500/10 text-teal-300" },
  unknown: { label: "UNKNOWN", cls: "border-zinc-600/60 bg-zinc-800/40 text-zinc-400" },
}

/** Band chip skin — the ladder reads zinc → teal → violet → fuchsia. */
const BAND_META: Record<string, string> = {
  developing: "border-zinc-600/60 bg-zinc-800/40 text-zinc-300",
  average: "border-teal-400/40 bg-teal-500/10 text-teal-300",
  good: "border-teal-400/50 bg-teal-500/15 text-teal-200",
  "very-good": "border-violet-400/50 bg-violet-500/15 text-violet-200",
  exceptional: "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200",
}

/** Pull-up capability-band chip skin — same family, ladder order. */
const PULLUP_BAND_META: Record<string, string> = {
  "foundation-missing": "border-zinc-600/60 bg-zinc-800/40 text-zinc-300",
  "grip-established": "border-teal-400/30 bg-teal-500/[0.08] text-teal-300",
  "early-pull": "border-teal-400/40 bg-teal-500/10 text-teal-300",
  "pulling-base": "border-violet-400/50 bg-violet-500/15 text-violet-200",
  threshold: "border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200",
}

const EQUIP_TAG_META: Record<JumpEquipment, { label: string; cls: string }> = {
  none: { label: "NONE", cls: "border-zinc-600/60 bg-zinc-900/60 text-zinc-400" },
  home: { label: "HOME", cls: "border-teal-500/30 bg-teal-500/10 text-teal-300" },
  "full-gym": { label: "GYM", cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
}

/** Run-axis equipment tags (R32-b) — roads vs track. */
const RUN_EQUIP_TAG_META: Record<RunEquipment, { label: string; cls: string }> = {
  none: { label: "ROADS", cls: "border-zinc-600/60 bg-zinc-900/60 text-zinc-400" },
  track: { label: "TRACK", cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
}

/** Equipment-tag resolver — every goal's report rows share the muscle-row
 *  renderer; only the tag vocabulary differs (gym tiers vs run surfaces). */
function jumpTagFor(e: string): { label: string; cls: string } {
  return EQUIP_TAG_META[e as JumpEquipment] ?? EQUIP_TAG_META.none
}
function runTagFor(e: string): { label: string; cls: string } {
  return RUN_EQUIP_TAG_META[e as RunEquipment] ?? RUN_EQUIP_TAG_META.none
}

/** Numeric stepper (vitals-tab NumRow idiom, teal ASCENT accent) — 44px ±
 *  buttons, mono readout, bound-clamped bumps off the fallback. R54-c2
 *  declutter: the method helper line stands down — a SHORT typical range
 *  rides the input's placeholder, the full method rides the input's title.
 *  `preview` is the optional live formatted read-back under time-style
 *  inputs (R32-b: a seconds entry for a 5K clock needs its mm:ss echo). */
function AscentStepper({
  label,
  unit,
  value,
  min,
  max,
  step,
  fallback,
  typical,
  note,
  preview,
  onChange,
}: {
  label: string
  unit: string
  value: string
  min: number
  max: number
  step: number
  fallback: number
  /** R54-c2 — short typical range, shown as the input's placeholder. */
  typical?: string
  /** R54-c2 — the full method line, carried in the input's title (off-surface). */
  note?: string
  preview?: string | null
  onChange: (v: string) => void
}) {
  const bump = (delta: number) => {
    const cur = parseAscentNum(value)
    const base = cur === null ? fallback : cur
    const next = Math.min(max, Math.max(min, Math.round((base + delta) * 10) / 10))
    onChange(String(next))
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-[9px] font-bold tracking-[0.14em] text-zinc-400">{label}</span>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => bump(-step)}
          className="grid h-11 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 transition-colors hover:border-rose-400/50 hover:text-rose-300 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-label={`${label} in ${unit}${typical ? `, typical ${typical}` : ""}`}
          placeholder={typical ?? "—"}
          title={note}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950/70 px-1 text-center font-mono text-sm tabular-nums text-teal-100 focus:border-teal-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => bump(step)}
          className="grid h-11 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 transition-colors hover:border-teal-400/50 hover:text-teal-300 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="w-8 shrink-0 text-[9px] font-bold tracking-[0.12em] text-zinc-400">{unit}</span>
      </div>
      {preview != null && (
        <p className="mt-0.5 font-mono text-[9px] tracking-[0.1em] text-teal-300/80">≈ {preview}</p>
      )}
    </div>
  )
}

/** SAVE BASELINE — the only write path's button (emerald, 44px). */
function AscentSaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      type="button"
      onClick={onClick}
      disabled={saving}
      className={cn(
        "pill-action flex h-11 w-full items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500/15",
        "text-[10px] font-bold tracking-[0.12em] text-emerald-300",
        "transition-colors hover:bg-emerald-500/25 hover:text-emerald-200 disabled:opacity-40",
        "focus-visible:outline focus-visible:outline-violet-400/70"
      )}
    >
      {saving ? "SAVING…" : "SAVE BASELINE"}
    </motion.button>
  )
}

/** The everything-logged state of the FILL THE GAPS block — R54-c2: the
 *  tail folds into the title. */
function AscentAllLogged() {
  return (
    <p className="mt-1.5 sys-label text-teal-300/80" title="Nothing to ask">
      ALL READINGS LOGGED
    </p>
  )
}

/** Any prescription row shape — ExercisePick and RunPick both satisfy it
 *  (the equipment string is resolved through a per-goal tag vocabulary). */
type AscentPick = { name: string; scheme: string; rest: string; why: string; equipment: string }

/** One muscle/focus row: name + priority chip + why, with its exercise picks
 *  under it. Shared by all three goals (R32-b: `tagFor` is the only
 *  per-goal difference — gym tiers vs roads/track). */
function AscentMuscleRow({ m, picks, tagFor }: { m: MusclePriority; picks: readonly AscentPick[]; tagFor: (e: string) => { label: string; cls: string } }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-2.5">
        <p className="min-w-0 text-xs font-medium text-zinc-200">{m.name}</p>
        <span
          title={`${m.role === "major" ? "Prime mover" : "Support cast"} — priority ${m.priority}`}
          className={cn(
            "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em]",
            PRIORITY_META[m.priority].cls
          )}
        >
          {PRIORITY_META[m.priority].label}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-zinc-400">{m.why}</p>
      {picks.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {picks.map((ex) => {
            const tag = tagFor(ex.equipment)
            return (
              <div key={ex.name} className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 text-[11px] font-medium text-zinc-200">{ex.name}</p>
                  <span
                    title={`Needs the ${tag.label.toLowerCase()} tier or richer`}
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[8px] font-bold tracking-[0.12em]",
                      tag.cls
                    )}
                  >
                    {tag.label}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[9px] tracking-[0.14em] text-zinc-400">
                  {ex.scheme} · REST {ex.rest}
                </p>
                <p className="mt-1 text-[10px] leading-snug text-zinc-400">{ex.why}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 text-[9px] font-semibold tracking-[0.12em] text-zinc-400">NO PICKS AT YOUR EQUIPMENT TIER</p>
      )}
    </div>
  )
}

/** The numbered habit stack with its FlaskConical science footnotes — the
 *  gates-tab idiom, extracted so all three goals share it (R32-b). */
function AscentHabitStack({ habits }: { habits: readonly HabitItem[] }) {
  return (
    <ol className="mt-2 space-y-2.5">
      {habits.map((h, i) => {
        const sci = h.scienceId !== "" ? scienceFor(h.scienceId) : null
        return (
          <li key={h.title} className="flex items-start gap-2.5">
            <span className="mt-0.5 font-mono text-[10px] font-bold tabular-nums text-violet-300/70">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[11px] font-medium text-zinc-100">{h.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">{h.detail}</p>
              {sci && (
                <p className="mt-1 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
                  <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>
                    <span className="font-mono tracking-[0.14em]">SCIENCE · </span>
                    {sci.body} <span className="whitespace-nowrap">· {sci.source}</span>
                  </span>
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Cautions & honest-unknowns box — shared by all three goals (R32-b). */
function AscentNotesBox({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null
  return (
    <div className="rounded-xl border border-amber-400/30 bg-gradient-to-b from-amber-500/[0.05] to-white/[0.01] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <p className="sys-label text-zinc-400">CAUTIONS & HONEST UNKNOWNS</p>
      <ul className="mt-1.5 space-y-1">
        {notes.map((n) => (
          <li key={n} className={cn("text-[10px] leading-relaxed", /FLAG/.test(n) ? "text-amber-200/80" : "text-zinc-400")}>
            {n}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The honest RAN-WITH-GAPS trailer — shared by all three goals (R32-b). */
function AscentGapsLine({ hasGaps, gapLabels }: { hasGaps: boolean; gapLabels: readonly string[] }) {
  if (!hasGaps || gapLabels.length === 0) return null
  return (
    <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-zinc-400">
      RAN WITH GAPS — {gapLabels.join(" · ")} STAY HONESTLY UNKNOWN UNTIL LOGGED
    </p>
  )
}

function AscentPanel() {
  const { pushNotice, bumpRefresh } = useSystem()
  const metrics = useApi<AscentMetricsRes>("/api/metrics")
  const prs = useApi<AscentPrsRes>("/api/prs")
  const program = useApi<AscentProgramRes>("/api/program")
  const reduceMotion = !!useReducedMotion()

  // Local-only questionnaire state. Honest scoping: experience / equipment /
  // injury flags are this-device answers — forging a program is what persists
  // experience & equipment; the steppers persist via SAVE BASELINE only.
  // R32-b: the goal selector adds per-goal reading locals; switching goals
  // clears the report + the injury flags (each goal speaks a different flag
  // vocabulary) but KEEPS typed readings — coming back restores your entries.
  const [goal, setGoal] = useState<AscentGoal>("jump")
  const [reachLocal, setReachLocal] = useState("")
  const [jumpLocal, setJumpLocal] = useState("")
  const [deadHangLocal, setDeadHangLocal] = useState("")
  const [invRowsLocal, setInvRowsLocal] = useState("")
  const [negsLocal, setNegsLocal] = useState("")
  const [best5kLocal, setBest5kLocal] = useState("")
  const [best1kLocal, setBest1kLocal] = useState("")
  const [weeklyKmLocal, setWeeklyKmLocal] = useState("")
  const [restingHrLocal, setRestingHrLocal] = useState("")
  const [expLocal, setExpLocal] = useState<JumpExperience | null>(null)
  const [equipLocal, setEquipLocal] = useState<JumpEquipment | null>(null)
  const [trackLocal, setTrackLocal] = useState<RunEquipment | null>(null)
  const [flags, setFlags] = useState<string[]>([])
  const [analyzed, setAnalyzed] = useState(false)
  const [saving, setSaving] = useState(false)
  const verdictRef = useRef<HTMLDivElement>(null)

  const profile = metrics.data?.profile
  const latest = metrics.data?.latest
  const jumpServer = latest?.verticalJumpCm?.value ?? null
  const reachServer = latest?.standingReachCm?.value ?? null
  const deadHangServer = latest?.deadHangSec?.value ?? null
  const best5kServer = latest?.best5kSec?.value ?? null
  const best1kServer = latest?.best1kSec?.value ?? null
  const restingHrServer = latest?.restingHr?.value ?? null

  // Squat-pattern e1RM (R69 — the one Epley core from lib/strength-science:
  // r=1 identity pin + 1-12 validity domain, out-of-domain records skipped
  // rather than inflated; /jump/i excluded so jump squats never masquerade
  // as barbell squats), maxed across strength-type squat records.
  const squatE1rmKg = useMemo(() => {
    const records = prs.data?.records
    if (!records) return null
    let best: number | null = null
    for (const r of records) {
      if (r.type !== "strength") continue
      if (!/squat/i.test(r.name) || /jump/i.test(r.name)) continue
      const c = r.context
      if (!c) continue
      const w = Number(c.weightKg)
      const reps = Number(c.reps)
      if (!validE1rmSet(reps, w)) continue
      const e1 = epleyE1rm(w, reps)
      if (best === null || e1 > best) best = e1
    }
    return best
  }, [prs.data])

  // Plyo exposure: any jump/hop/plyo/skip record OR a logged vertical jump.
  const plyoExposure = useMemo(() => {
    const records = prs.data?.records ?? []
    return records.some((r) => /jump|hop|plyo|skip/i.test(r.name)) || latest?.verticalJumpCm != null
  }, [prs.data, latest])

  // Best inverted-row set from records (the pull-up goal's RECORDS source —
  // mirrors the squat-e1RM idiom: a performed session speaks, a gap asks).
  const invRowsServer = useMemo(() => {
    const records = prs.data?.records
    if (!records) return null
    let best: number | null = null
    for (const r of records) {
      if (!/inverted row|australian row|bodyweight row/i.test(r.name)) continue
      const c = r.context
      if (!c) continue
      const reps = Number(c.reps)
      if (!Number.isFinite(reps) || reps < 1) continue
      if (best === null || reps > best) best = reps
    }
    return best
  }, [prs.data])

  // Controlled slow negatives owned, from records (same idiom).
  const negsServer = useMemo(() => {
    const records = prs.data?.records
    if (!records) return null
    let best: number | null = null
    for (const r of records) {
      if (!/negative/i.test(r.name) || !/pull|chin/i.test(r.name)) continue
      const c = r.context
      if (!c) continue
      const reps = Number(c.reps)
      if (!Number.isFinite(reps) || reps < 1) continue
      if (best === null || reps > best) best = reps
    }
    return best
  }, [prs.data])

  // Run exposure (the 5K goal's RECORDS source): any run/jog/sprint record —
  // the plyo-chip idiom, always computable, "none logged" is a finding.
  const runExposure = useMemo(() => {
    const records = prs.data?.records ?? []
    return records.some((r) => /run|jog|sprint/i.test(r.name))
  }, [prs.data])

  const sleepAvg7d = useMemo(() => ascentSleepAvg(metrics.data?.series?.sleep), [metrics.data])

  const programEquip = isAscentEquipment(program.data?.program?.equipment) ? program.data?.program?.equipment : null
  const programExp = isAscentExperience(program.data?.program?.experience) ? program.data?.program?.experience : null
  const programDays = typeof program.data?.program?.days === "number" ? program.data.program.days : null

  // Effective input: server values, overlaid by local questionnaire answers.
  // This is why ANALYZE works BEFORE saving — local readings power the preview,
  // SAVE BASELINE merely persists them for future visits.
  const jumpInput = useMemo<JumpInput>(() => ({
    heightCm: profile?.heightCm ?? null,
    weightKg: profile?.weightKg ?? latest?.weight?.value ?? null,
    standingReachCm: parseAscentNum(reachLocal) ?? reachServer,
    verticalJumpCm: parseAscentNum(jumpLocal) ?? jumpServer,
    ageYears: profile?.birthYear != null ? new Date().getFullYear() - profile.birthYear : null,
    sex: profile?.sex ?? null,
    squatE1rmKg,
    plyoExposure,
    trainingDaysPerWeek: programDays,
    equipment: equipLocal ?? programEquip,
    experience: expLocal ?? programExp,
    sleepAvg7d,
    injuryFlags: flags,
  }), [profile, latest, reachLocal, reachServer, jumpLocal, jumpServer, squatE1rmKg, plyoExposure, programDays, programEquip, equipLocal, programExp, expLocal, sleepAvg7d, flags])

  // Pull-up input (R32-b): dead hang from the metrics series (or the local
  // stepper), rows/negatives from records (or local steppers — they have no
  // metric type, so their persistence path is logging a pull session).
  const pullupInput = useMemo<PullUpInput>(() => ({
    weightKg: profile?.weightKg ?? latest?.weight?.value ?? null,
    heightCm: profile?.heightCm ?? null,
    deadHangSec: parseAscentNum(deadHangLocal) ?? deadHangServer,
    invertedRowsReps: parseAscentNum(invRowsLocal) ?? invRowsServer,
    negativePullUpReps: parseAscentNum(negsLocal) ?? negsServer,
    trainingDaysPerWeek: programDays,
    equipment: equipLocal ?? programEquip,
    experience: expLocal ?? programExp,
    sleepAvg7d,
    injuryFlags: flags,
  }), [profile, latest, deadHangLocal, deadHangServer, invRowsLocal, invRowsServer, negsLocal, negsServer, programDays, programEquip, equipLocal, programExp, expLocal, sleepAvg7d, flags])

  // 5K input (R32-b): times from the metrics series (or local steppers);
  // weekly km + track access are honest LOCAL-ONLY answers (no server home).
  const run5kInput = useMemo<Run5kInput>(() => ({
    weightKg: profile?.weightKg ?? latest?.weight?.value ?? null,
    heightCm: profile?.heightCm ?? null,
    best5kSec: parseAscentNum(best5kLocal) ?? best5kServer,
    best1kSec: parseAscentNum(best1kLocal) ?? best1kServer,
    weeklyRunKm: parseAscentNum(weeklyKmLocal),
    restingHr: parseAscentNum(restingHrLocal) ?? restingHrServer,
    trainingDaysPerWeek: programDays,
    experience: expLocal ?? programExp,
    sleepAvg7d,
    runExposure,
    equipment: trackLocal,
    injuryFlags: flags,
  }), [profile, latest, best5kLocal, best5kServer, best1kLocal, best1kServer, weeklyKmLocal, restingHrLocal, restingHrServer, programDays, programExp, expLocal, sleepAvg7d, runExposure, trackLocal, flags])

  // All three calculators are pure + cheap — compute every goal's assessment
  // once and switch at render (the report reads the SELECTED goal only).
  const jumpAssessment = useMemo(() => assessVerticalJump(jumpInput), [jumpInput])
  const pullupAssessment = useMemo(() => assessFirstPullUp(pullupInput), [pullupInput])
  const runAssessment = useMemo(() => assess5kTime(run5kInput), [run5kInput])
  const assessment =
    goal === "jump" ? jumpAssessment : goal === "pullup" ? pullupAssessment : runAssessment

  const jumpChips = useMemo(() => jumpDataChips(jumpInput), [jumpInput])
  const pullupChips = useMemo(() => pullUpDataChips(pullupInput), [pullupInput])
  const runChips = useMemo(() => run5kDataChips(run5kInput), [run5kInput])
  const chips = goal === "jump" ? jumpChips : goal === "pullup" ? pullupChips : runChips
  const haveCount = chips.filter((c) => c.have).length
  const gapLabels = chips.filter((c) => !c.have && ASCENT_GAP_IDS[goal].includes(c.id)).map((c) => c.label)
  const reachFallback = profile?.heightCm != null ? Math.round(profile.heightCm * 1.25) : 230

  // Live mm:ss read-backs under the seconds entry — a raw seconds field for a
  // 5K clock needs its formatted echo (and the 1K entry previews its own
  // honest 5K equivalent, the conversion the verdict will use).
  const best5kNum = parseAscentNum(best5kLocal)
  const best5kPreview =
    best5kNum != null ? `${fmtRunClock(best5kNum) ?? "—"} FOR 5 K · ${fmtRunClock(best5kNum / 5) ?? "—"} /KM` : null
  const best1kNum = parseAscentNum(best1kLocal)
  const best1kPreview =
    best1kNum != null
      ? `${fmtRunClock(best1kNum) ?? "—"} FOR 1 K → ≈ ${fmtRunClock(equivalent5kSec(best1kNum)) ?? "—"} FOR 5 K`
      : null

  const switchGoal = (g: AscentGoal) => {
    if (g === goal) return
    setGoal(g)
    setAnalyzed(false)
    setFlags([]) // flag vocabularies differ per goal — no cross-goal carry-over
  }

  // SAVE BASELINE — the ONLY write path: one POST per missing server reading
  // of the CURRENT goal, then reload + global refetch + notice.
  const saveBaseline = async () => {
    if (saving) return
    const posts: { type: string; value: number }[] = []
    if (goal === "jump") {
      const j = parseAscentNum(jumpLocal)
      const r = parseAscentNum(reachLocal)
      if (jumpServer == null && j != null) posts.push({ type: "verticalJumpCm", value: j })
      if (reachServer == null && r != null) posts.push({ type: "standingReachCm", value: r })
    } else if (goal === "pullup") {
      const d = parseAscentNum(deadHangLocal)
      if (deadHangServer == null && d != null) posts.push({ type: "deadHangSec", value: d })
    } else {
      const f = parseAscentNum(best5kLocal)
      const k = parseAscentNum(best1kLocal)
      const h = parseAscentNum(restingHrLocal)
      if (best5kServer == null && f != null) posts.push({ type: "best5kSec", value: f })
      if (best1kServer == null && k != null) posts.push({ type: "best1kSec", value: k })
      if (restingHrServer == null && h != null) posts.push({ type: "restingHr", value: h })
    }
    if (posts.length === 0) {
      pushNotice({ kind: "info", title: "Nothing to save", body: "Enter a missing reading first." })
      return
    }
    setSaving(true)
    try {
      for (const p of posts) {
        await api<MetricSaveRes>("/api/metrics", {
          method: "POST",
          body: JSON.stringify({ type: p.type, value: p.value }),
        })
      }
      const body =
        goal === "jump"
          ? "Jump readings stored to body metrics."
          : goal === "pullup"
            ? "Dead-hang reading stored to body metrics."
            : "Time readings stored to body metrics."
      pushNotice({ kind: "info", title: "BASELINE SAVED", body })
      metrics.reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Save rejected", body: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  const runAnalysis = () => {
    setAnalyzed(true)
    requestAnimationFrame(() => {
      verdictRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
    })
  }

  const toggleFlag = (f: string) => {
    if (f === "none") {
      setFlags([])
      return
    }
    setFlags((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev.filter((x) => x !== "none"), f]))
  }

  if (metrics.loading && !metrics.data) {
    return <SkeletonPanel label="SYNCING ASCENT DATA" rows={3} />
  }
  if (metrics.error) {
    return (
      <SystemPanel label="Ascent Advisor">
        <div className="p-4 sm:p-5">
          <p className="font-mono text-[10px] tracking-[0.1em] text-rose-300/80">ASCENT SYNC FAILED — {metrics.error}</p>
        </div>
      </SystemPanel>
    )
  }

  return (
    <SystemPanel
      label="Ascent Advisor"
      labelAccent={
        // R54-c2 — the intro paragraph + SCIENCE citation fold into this
        // accent's title; the short pop-up meaning rides the ascent InfoHint
        <span
          className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400"
          title={`${GOAL_META[goal].note}\nSCIENCE · ${GOAL_SCIENCE[goal]!.body} · ${GOAL_SCIENCE[goal]!.source}`}
        >
          <FlaskConical className="h-3 w-3 text-teal-400/70" aria-hidden /> {haveCount}/{chips.length} READY
          <InfoHint term="ascent" />
        </span>
      }
    >
      <div className="space-y-4 p-4 sm:p-5">

        {/* GOAL SELECTOR (R32-b) — three chips, violet selected / zinc idle,
            44px targets, aria-pressed. Switching swaps the questionnaire and
            the report; each goal asks only for ITS missing inputs. */}
        <section aria-label="Ascent goal selector">
          <p className="sys-label text-zinc-400">GOAL</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Ascent goal">
            {ASCENT_GOALS.map((g) => {
              const active = goal === g.id
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchGoal(g.id)}
                  className={cn(
                    "h-11 rounded-full border px-3.5 text-[10px] font-bold tracking-[0.12em] transition-colors",
                    "focus-visible:outline focus-visible:outline-violet-400/70",
                    active
                      ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-violet-400/40 hover:text-zinc-200 hover:bg-white/[0.06]"
                  )}
                >
                  {g.label}
                </button>
              )
            })}
          </div>
        </section>

        {/* STAGE 1 — DATA READINESS: the HAVE/MISSING inventory for the SELECTED goal. */}
        <section aria-label="Ascent data readiness">
          <div className="grid grid-cols-2 gap-1.5" role="list" aria-label="Ascent data inventory">
            {/* R54-c2 — the per-row HAVE/MISSING word stands down (teal vs
                amber IS the state; the word + full reading ride the title).
                R55-d — the per-chip SOURCE line stands down too (it rides the
                same title verbatim); label + value stay on the face. */}
            {chips.map((c) => (
              <div
                key={c.id}
                role="listitem"
                title={`${c.label} — ${c.have ? "have" : "missing"}${c.valueLabel ? ` · ${c.valueLabel}` : ""} · ${c.source}`}
                className={cn(
                  "rounded-xl border px-2 py-1.5",
                  c.have ? "border-teal-500/25 bg-teal-500/[0.06]" : "border-amber-500/25 bg-amber-500/[0.05]"
                )}
              >
                <p className="text-[9px] font-bold tracking-[0.14em] text-zinc-300">{c.label}</p>
                <p className={cn("mt-0.5 truncate font-mono text-[10px] tabular-nums", c.have ? "text-teal-200" : "text-zinc-400")}>
                  {c.valueLabel ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* STAGE 2 — QUESTIONNAIRE: only what is missing for the SELECTED goal
            + local-only answers. Steppers bound to a server metric carry SAVE
            BASELINE; capability answers without a metric type (rows/negatives,
            weekly km) are honest local-only entries. */}
        <section aria-label="Ascent questionnaire">
          <p className="sys-label text-zinc-400">FILL THE GAPS</p>
          {goal === "jump" &&
            (reachServer == null || jumpServer == null ? (
              <div className="mt-2 space-y-3">
                {reachServer == null && (
                  <AscentStepper
                    label="STAND REACH"
                    unit="CM"
                    value={reachLocal}
                    min={100}
                    max={300}
                    step={0.5}
                    fallback={reachFallback}
                    typical="≈ 1.25 × HEIGHT"
                    note="FLAT FEET · DOMINANT ARM ON WALL · TYPICAL ≈ 1.25 × HEIGHT"
                    onChange={setReachLocal}
                  />
                )}
                {jumpServer == null && (
                  <AscentStepper
                    label="VERT JUMP"
                    unit="CM"
                    value={jumpLocal}
                    min={10}
                    max={120}
                    step={0.5}
                    fallback={40}
                    typical="10–120 CM"
                    note="CHALK/WALL TEST · BEST OF 3 · 10–120 CM"
                    onChange={setJumpLocal}
                  />
                )}
                <AscentSaveButton saving={saving} onClick={saveBaseline} />
              </div>
            ) : (
              <AscentAllLogged />
            ))}
          {goal === "pullup" &&
            (deadHangServer == null || invRowsServer == null || negsServer == null ? (
              <div className="mt-2 space-y-3">
                {deadHangServer == null && (
                  <AscentStepper
                    label="DEAD HANG"
                    unit="S"
                    value={deadHangLocal}
                    min={0}
                    max={600}
                    step={1}
                    fallback={20}
                    typical="0–600 S"
                    note="MAX PASSIVE BAR HANG · BOTH FEET OFF THE FLOOR · 0–600 S"
                    onChange={setDeadHangLocal}
                  />
                )}
                {invRowsServer == null && (
                  <AscentStepper
                    label="ROW REPS"
                    unit="REPS"
                    value={invRowsLocal}
                    min={0}
                    max={100}
                    step={1}
                    fallback={8}
                    typical="BEST SET"
                    note="BEST SET OF INVERTED ROWS · LOCAL ANSWER — LOG A PULL SESSION TO PERSIST IT"
                    onChange={setInvRowsLocal}
                  />
                )}
                {negsServer == null && (
                  <AscentStepper
                    label="NEGATIVES"
                    unit="REPS"
                    value={negsLocal}
                    min={0}
                    max={50}
                    step={1}
                    fallback={3}
                    typical="REPS OWNED"
                    note="SLOW NEGATIVES YOU OWN · LOCAL ANSWER — LOG A PULL SESSION TO PERSIST IT"
                    onChange={setNegsLocal}
                  />
                )}
                {deadHangServer == null && <AscentSaveButton saving={saving} onClick={saveBaseline} />}
              </div>
            ) : (
              <AscentAllLogged />
            ))}
          {goal === "run5k" &&
            (best5kServer == null || best1kServer == null || restingHrServer == null ? (
              <div className="mt-2 space-y-3">
                {best5kServer == null && (
                  <AscentStepper
                    label="BEST 5K"
                    unit="S"
                    value={best5kLocal}
                    min={600}
                    max={3600}
                    step={10}
                    fallback={1500}
                    typical="600–3600 S"
                    note="RACE OR TIME-TRIAL CLOCK · 600–3600 S (10–60 MIN)"
                    preview={best5kPreview}
                    onChange={setBest5kLocal}
                  />
                )}
                {best1kServer == null && (
                  <AscentStepper
                    label="BEST 1K"
                    unit="S"
                    value={best1kLocal}
                    min={120}
                    max={900}
                    step={1}
                    fallback={300}
                    typical="120–900 S"
                    note="ALL-OUT 1 K · 120–900 S (2–15 MIN)"
                    preview={best1kPreview}
                    onChange={setBest1kLocal}
                  />
                )}
                {restingHrServer == null && (
                  <AscentStepper
                    label="REST HR"
                    unit="BPM"
                    value={restingHrLocal}
                    min={30}
                    max={120}
                    step={1}
                    fallback={60}
                    typical="30–120 BPM"
                    note="MEASURE RIGHT AFTER WAKING · 30–120 BPM"
                    onChange={setRestingHrLocal}
                  />
                )}
                <AscentSaveButton saving={saving} onClick={saveBaseline} />
              </div>
            ) : (
              <AscentAllLogged />
            ))}

          {/* Local-only selects (this-device answers). */}
          <div className="mt-3 space-y-3">
            {goal === "run5k" && (
              <div>
                <p className="sys-label text-zinc-400">WEEKLY RUN VOLUME</p>
                <div className="mt-2">
                  <AscentStepper
                    label="WEEKLY KM"
                    unit="KM"
                    value={weeklyKmLocal}
                    min={0}
                    max={300}
                    step={1}
                    fallback={15}
                    typical="0–300 KM"
                    note="KM RUN PER WEEK · LOCAL ANSWER, NEVER PERSISTED · 0–300"
                    onChange={setWeeklyKmLocal}
                  />
                </div>
              </div>
            )}
            <div>
              {/* R54-c2 — the program-default + override-scope footnote rides
                  the label's title (the active chip shows the value) */}
              <p
                className="sys-label text-zinc-400"
                title={programExp != null ? `${programExp.toUpperCase()} from program · override stays on this device` : undefined}
              >
                EXPERIENCE
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Training experience">
                {ASCENT_EXPERIENCES.map((x) => {
                  const active = (expLocal ?? programExp) === x
                  return (
                    <button
                      key={x}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setExpLocal(x)}
                      className={cn(
                        "h-11 rounded-full border px-3.5 text-[10px] font-bold tracking-[0.12em] transition-colors",
                        "focus-visible:outline focus-visible:outline-violet-400/70",
                        active
                          ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-violet-400/40 hover:text-zinc-200 hover:bg-white/[0.06]"
                      )}
                    >
                      {x.toUpperCase()}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="sys-label text-zinc-400">{goal === "run5k" ? "TRACK ACCESS" : "EQUIPMENT"}</p>
              {goal === "run5k" ? (
                <>
                  {/* R54-c2 — the local-scope footnote rides the group's title */}
                  <div
                    className="mt-1.5 flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Track access"
                    title="Roads prescriptions work everywhere · local answer, never persisted"
                  >
                    {ASCENT_TRACKS.map((x) => {
                      const active = trackLocal === x
                      return (
                        <button
                          key={x}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setTrackLocal(x)}
                          className={cn(
                            "h-11 rounded-full border px-3.5 text-[10px] font-bold tracking-[0.12em] transition-colors",
                            "focus-visible:outline focus-visible:outline-violet-400/70",
                            active
                              ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-violet-400/40 hover:text-zinc-200 hover:bg-white/[0.06]"
                          )}
                        >
                          {x === "track" ? "TRACK" : "ROADS ONLY"}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : programEquip != null ? (
                // R54-c2 — the tier value stays visible; the how-to-change
                // note rides the title
                <p
                  className="mt-1.5 font-mono text-[10px] tracking-[0.1em] text-zinc-400"
                  title="From program — forge a program to change"
                >
                  {programEquip.toUpperCase()} · FROM PROGRAM
                </p>
              ) : (
                <>
                  {/* R54-c2 — the persistence-scope footnote rides the group's title */}
                  <div
                    className="mt-1.5 flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Equipment tier"
                    title="Local answer — forge a program to persist it"
                  >
                    {ASCENT_EQUIPMENTS.map((x) => {
                      const active = (equipLocal ?? programEquip) === x
                      return (
                        <button
                          key={x}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setEquipLocal(x)}
                          className={cn(
                            "h-11 rounded-full border px-3.5 text-[10px] font-bold tracking-[0.12em] transition-colors",
                            "focus-visible:outline focus-visible:outline-violet-400/70",
                            active
                              ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-violet-400/40 hover:text-zinc-200 hover:bg-white/[0.06]"
                          )}
                        >
                          {x === "full-gym" ? "FULL GYM" : x.toUpperCase()}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            <div>
              {/* R54-c2 — the flag-scope footnote rides the label's title */}
              <p
                className="sys-label text-zinc-400"
                title="Flags tune cautions & exercise swaps — local answer, never persisted"
              >
                INJURY FLAGS
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Injury flags">
                <button
                  type="button"
                  aria-pressed={flags.length === 0}
                  onClick={() => toggleFlag("none")}
                  className={cn(
                    "h-11 rounded-full border px-3.5 text-[10px] font-bold tracking-[0.12em] transition-colors",
                    "focus-visible:outline focus-visible:outline-violet-400/70",
                    flags.length === 0
                      ? "border-teal-400/50 bg-teal-500/15 text-teal-200"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-teal-400/40 hover:text-zinc-200 hover:bg-white/[0.06]"
                  )}
                >
                  NONE
                </button>
                {GOAL_FLAGS[goal].map((f) => {
                  const active = flags.includes(f)
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleFlag(f)}
                      className={cn(
                        "h-11 rounded-full border px-3.5 text-[10px] font-bold tracking-[0.12em] transition-colors",
                        "focus-visible:outline focus-visible:outline-violet-400/70",
                        active
                          ? "border-rose-400/60 bg-rose-500/15 text-rose-200"
                          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-rose-400/40 hover:text-zinc-200 hover:bg-white/[0.06]"
                      )}
                    >
                      {f.toUpperCase()}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* STAGE 3 — ANALYZE (violet, 44px, gated on the selected goal's core). */}
        <section aria-label="Ascent analysis trigger">
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={runAnalysis}
            disabled={!assessment.canAnalyze}
            className={cn(
              "pill-action flex h-11 w-full items-center justify-center gap-2 rounded-full border text-[11px] font-bold tracking-[0.14em]",
              "transition-colors focus-visible:outline focus-visible:outline-violet-400/70",
              assessment.canAnalyze
                ? "border-violet-400/60 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 hover:text-violet-100"
                : "cursor-not-allowed border-white/10 bg-white/[0.03] text-zinc-400"
            )}
          >
            <ChevronsUp className="h-3.5 w-3.5" aria-hidden />
            {analyzed ? "RE-ANALYZE" : "ANALYZE ASCENT"}
          </motion.button>
          {!assessment.canAnalyze && (
            <p className="mt-1.5 font-mono text-[9px] leading-relaxed tracking-[0.1em] text-amber-300/80">
              CORE DATA MISSING · {assessment.missingCore.map((id) => CORE_FIELD_LABELS[id] ?? id.toUpperCase()).join(" + ")}
            </p>
          )}
        </section>

        {/* The prescription — live-recomputed from the effective input of the
            SELECTED goal (reports swap with the goal selector). */}
        {analyzed && (
          <div ref={verdictRef} className="space-y-4 scroll-mt-24">
            {goal === "jump" && <AscentJumpReport a={jumpAssessment} gapLabels={gapLabels} />}
            {goal === "pullup" && <AscentPullupReport a={pullupAssessment} gapLabels={gapLabels} />}
            {goal === "run5k" && <Ascent5kReport a={runAssessment} gapLabels={gapLabels} />}
          </div>
        )}
      </div>
    </SystemPanel>
  )
}

// ── The three goal reports (R32-b split; the jump report is the R31-a block) ──

/** VERTICAL JUMP report — verdict + muscle matrix + habits + notes (R31-a,
 *  extracted verbatim from the old inline block; only tagFor is new). */
function AscentJumpReport({ a, gapLabels }: { a: JumpAssessment; gapLabels: readonly string[] }) {
  return (
    <>
      {/* Verdict */}
      <div className="rounded-xl border border-violet-400/30 bg-gradient-to-b from-violet-500/[0.08] to-white/[0.015] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-medium text-zinc-100">VERTICAL JUMP</p>
            <p className="mt-0.5 font-mono text-4xl font-bold leading-none tabular-nums text-zinc-100">
              {a.verticalJumpCm != null ? (
                <>
                  {Number.isInteger(a.verticalJumpCm) ? a.verticalJumpCm : a.verticalJumpCm.toFixed(1)}
                  <span className="ml-1 text-base font-medium text-zinc-400">CM</span>
                </>
              ) : (
                <span className="text-zinc-400">UNKNOWN</span>
              )}
            </p>
          </div>
          {a.jumpBand && (
            <span
              title={`General band ${a.jumpBand.range} — not a normative percentile`}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[9px] font-bold tracking-[0.14em]",
                BAND_META[a.jumpBand.id]
              )}
            >
              {a.jumpBand.label}
            </span>
          )}
        </div>
        <p className="mt-2.5 font-mono text-[9px] leading-relaxed tracking-[0.1em] text-zinc-400">
          JUMP:HEIGHT · {a.jumpRatioPct != null ? `${a.jumpRatioPct.toFixed(1)}%` : "—"}
          {a.maxTouchCm != null ? ` · MAX TOUCH ≈ ${Math.round(a.maxTouchCm)} CM` : ""} · GENERAL
          BANDS · NOT NORMATIVE PERCENTILES
        </p>
        <p className="mt-1 font-mono text-[9px] leading-relaxed tracking-[0.1em] text-zinc-400">
          RELATIVE STRENGTH ·{" "}
          {a.relStrength != null ? `${a.relStrength.toFixed(2)}× BW · ${a.relStrClass.label}` : "UNKNOWN · NO SQUAT RECORD"}{" "}
          — {a.relStrClass.verdict}
        </p>
      </div>

      {/* Muscle matrix */}
      <div>
        <p className="sys-label text-zinc-400">MAJOR MUSCLES — PRIME MOVERS</p>
        <div className="mt-2 space-y-2.5">
          {a.majorMuscles.map((m) => (
            <AscentMuscleRow key={m.id} m={m} picks={a.exercises[m.id] ?? []} tagFor={jumpTagFor} />
          ))}
        </div>
      </div>
      <div>
        <p className="sys-label text-zinc-400">MINOR MUSCLES — SUPPORT CAST</p>
        <div className="mt-2 space-y-2.5">
          {a.minorMuscles.map((m) => (
            <AscentMuscleRow key={m.id} m={m} picks={a.exercises[m.id] ?? []} tagFor={jumpTagFor} />
          ))}
        </div>
      </div>

      {/* Habit stack */}
      <div>
        <p className="sys-label text-zinc-400">HABIT STACK — COMPOUND THE WORK</p>
        <AscentHabitStack habits={a.habits} />
      </div>

      <AscentNotesBox notes={a.notes} />
      <AscentGapsLine hasGaps={a.hasGaps} gapLabels={gapLabels} />
    </>
  )
}

/** FIRST PULL-UP report (R32-b) — readiness verdict, the 5-rung ladder with
 *  the current rung highlighted, muscle matrix, habits, notes. */
function AscentPullupReport({ a, gapLabels }: { a: PullUpAssessment; gapLabels: readonly string[] }) {
  return (
    <>
      {/* Verdict */}
      <div className="rounded-xl border border-violet-400/30 bg-gradient-to-b from-violet-500/[0.08] to-white/[0.015] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-medium text-zinc-100">READINESS · FIRST PULL-UP</p>
            <p className="mt-0.5 font-mono text-4xl font-bold leading-none tabular-nums text-zinc-100">
              {a.deadHangSec != null ? (
                <>
                  {Math.round(a.deadHangSec)}
                  <span className="ml-1 text-base font-medium text-zinc-400">S HANG</span>
                </>
              ) : (
                <span className="text-zinc-400">NO HANG READING</span>
              )}
            </p>
          </div>
          {a.band && (
            <span
              title={`Capability band ${a.band.range} — ladder anchor, not a percentile`}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[9px] font-bold tracking-[0.14em]",
                PULLUP_BAND_META[a.band.id]
              )}
            >
              {a.band.label}
            </span>
          )}
        </div>
        <p className="mt-2.5 font-mono text-[9px] leading-relaxed tracking-[0.1em] text-zinc-400">
          ROWS {a.invertedRowsReps ?? "—"} · NEGATIVES {a.negativePullUpReps ?? "—"} · BODYWEIGHT PULL{" "}
          {a.bodyweightPullKg != null ? `${Math.round(a.bodyweightPullKg)} KG` : "—"} · CAPABILITY BANDS · NOT NORMATIVE
        </p>
      </div>

      {/* The progression ladder */}
      <div>
        <p className="sys-label text-zinc-400">
          THE LADDER — RUNG {Math.min(a.currentRung + 1, a.ladder.length)} OF {a.ladder.length}
        </p>
        <div className="mt-2 space-y-1.5">
          {a.ladder.map((r, i) => {
            const isGoal = i === a.ladder.length - 1
            const isCurrent = !isGoal && i === a.currentRung
            const isCleared = i < a.currentRung
            return (
              <div
                key={r.name}
                className={cn(
                  "rounded-xl border p-2.5",
                  isGoal
                    ? "border-fuchsia-400/40 bg-fuchsia-500/[0.05]"
                    : isCurrent
                      ? "border-violet-400/50 bg-violet-500/[0.08]"
                      : isCleared
                        ? "border-teal-500/25 bg-teal-500/[0.04] opacity-70"
                        : "border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "min-w-0 font-display text-[11px] font-medium",
                      isGoal ? "text-fuchsia-200" : isCurrent ? "text-violet-200" : "text-zinc-300"
                    )}
                  >
                    {String(i + 1).padStart(2, "0")} · {r.name}
                  </p>
                  {isGoal ? (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em] text-fuchsia-200">
                      THE GOAL
                    </span>
                  ) : isCurrent ? (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-violet-400/60 bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em] text-violet-200">
                      YOU ARE HERE
                    </span>
                  ) : isCleared ? (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-teal-400/40 bg-teal-500/10 px-1.5 py-0.5 text-[8px] font-bold tracking-[0.14em] text-teal-300">
                      CLEARED
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 font-mono text-[9px] tracking-[0.14em] text-zinc-400">{r.focus}</p>
                <p className="mt-0.5 font-mono text-[9px] tracking-[0.14em] text-zinc-500">EXIT · {r.exit}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Muscle matrix */}
      <div>
        <p className="sys-label text-zinc-400">MAJOR MUSCLES — PRIME MOVERS</p>
        <div className="mt-2 space-y-2.5">
          {a.majorMuscles.map((m) => (
            <AscentMuscleRow key={m.id} m={m} picks={a.exercises[m.id] ?? []} tagFor={jumpTagFor} />
          ))}
        </div>
      </div>
      <div>
        <p className="sys-label text-zinc-400">MINOR MUSCLES — SUPPORT CAST</p>
        <div className="mt-2 space-y-2.5">
          {a.minorMuscles.map((m) => (
            <AscentMuscleRow key={m.id} m={m} picks={a.exercises[m.id] ?? []} tagFor={jumpTagFor} />
          ))}
        </div>
      </div>

      {/* Habit stack */}
      <div>
        <p className="sys-label text-zinc-400">HABIT STACK — COMPOUND THE WORK</p>
        <AscentHabitStack habits={a.habits} />
      </div>

      <AscentNotesBox notes={a.notes} />
      <AscentGapsLine hasGaps={a.hasGaps} gapLabels={gapLabels} />
    </>
  )
}

/** 5K TIME report (R32-b) — the clock (real or honest ≈ equivalent) + band +
 *  pace readout, the training-focus matrix, prescriptions, habits, notes. */
function Ascent5kReport({ a, gapLabels }: { a: Run5kAssessment; gapLabels: readonly string[] }) {
  return (
    <>
      {/* Verdict */}
      <div className="rounded-xl border border-violet-400/30 bg-gradient-to-b from-violet-500/[0.08] to-white/[0.015] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-xs font-medium text-zinc-100">
              5K TIME{a.usedEquivalent ? " · ≈ FROM 1K" : ""}
            </p>
            <p className="mt-0.5 font-mono text-4xl font-bold leading-none tabular-nums text-zinc-100">
              {a.effective5kSec != null ? (
                <>
                  {a.usedEquivalent ? <span className="mr-1 text-xl font-medium text-teal-300">≈</span> : null}
                  {fmtRunClock(a.effective5kSec)}
                </>
              ) : (
                <span className="text-zinc-400">UNKNOWN</span>
              )}
            </p>
          </div>
          {a.band && (
            <span
              title={`General band ${a.band.range} — not a normative percentile`}
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[9px] font-bold tracking-[0.14em]",
                BAND_META[a.band.id]
              )}
            >
              {a.band.label}
            </span>
          )}
        </div>
        <p className="mt-2.5 font-mono text-[9px] leading-relaxed tracking-[0.1em] text-zinc-400">
          PACE {fmtRunClock(a.paceSecPerKm) ?? "—"} /KM ·{" "}
          {a.usedEquivalent
            ? `CONVERTED FROM A ${fmtRunClock(a.best1kSec)} 1K · EQUIVALENT, NOT A GUARANTEE`
            : "LOGGED 5K CLOCK"}{" "}
          · GENERAL BANDS · NOT NORMATIVE
        </p>
      </div>

      {/* Training-focus matrix */}
      <div>
        <p className="sys-label text-zinc-400">MAJOR FOCUS — THE ENGINE WORK</p>
        <div className="mt-2 space-y-2.5">
          {a.majorFocus.map((m) => (
            <AscentMuscleRow key={m.id} m={m} picks={a.exercises[m.id] ?? []} tagFor={runTagFor} />
          ))}
        </div>
      </div>
      <div>
        <p className="sys-label text-zinc-400">MINOR FOCUS — SUPPORT CAST</p>
        <div className="mt-2 space-y-2.5">
          {a.minorFocus.map((m) => (
            <AscentMuscleRow key={m.id} m={m} picks={a.exercises[m.id] ?? []} tagFor={runTagFor} />
          ))}
        </div>
      </div>

      {/* Habit stack */}
      <div>
        <p className="sys-label text-zinc-400">HABIT STACK — COMPOUND THE WORK</p>
        <AscentHabitStack habits={a.habits} />
      </div>

      <AscentNotesBox notes={a.notes} />
      <AscentGapsLine hasGaps={a.hasGaps} gapLabels={gapLabels} />
    </>
  )
}
