"use client"

import { Fragment, useState } from "react"
import { Anvil, BadgeCheck, ChevronDown, Dumbbell, Loader2, Play, Sparkles } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { InfoHint } from "@/components/system/info-hint"
import { FlowGroup, FlowItem, FLOW_EASE, liftMotion, useCountUp } from "@/components/system/motion"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { byEquipment, dominantType, EXERCISES, type ExerciseType, type PlanBlock, type ProgramPlan } from "@/lib/exercises"
import { titleByCode } from "@/lib/titles"
import { cn } from "@/lib/utils"

// ─── DTOs (mirrors /api/program responses) ────────────────────────────────────

type ProgramDTO = {
  id: string
  name: string
  goal: string
  equipment: string
  days: number
  experience: string
  plan: ProgramPlan
  active: boolean
  createdAt: string
  retiredAt: string | null
}

type ProgramRes = { program: ProgramDTO | null }
type ForgeRes = { program: ProgramDTO; titlesUnlocked: string[]; xpGranted?: number }

// ─── Forge wizard choices ─────────────────────────────────────────────────────

const EQUIPMENT_CHOICES: { value: string; label: string; hint: string }[] = [
  { value: "none", label: "NONE", hint: "BODYWEIGHT ONLY" },
  { value: "home", label: "HOME", hint: "BW · BANDS · DB" },
  { value: "full-gym", label: "FULL GYM", hint: "EVERYTHING" },
]
const GOAL_CHOICES: { value: string; label: string; hint: string }[] = [
  { value: "strength", label: "STRENGTH", hint: "HEAVY · 3–6 REPS" },
  { value: "hypertrophy", label: "HYPERTROPHY", hint: "8–12 REP GROWTH" },
  { value: "conditioning", label: "CONDITIONING", hint: "CIRCUITS + ENGINE" },
  { value: "mobility", label: "MOBILITY", hint: "FLOW + RANGE" },
]
const DAY_CHOICES = [2, 3, 4, 5, 6]
const EXPERIENCE_CHOICES: { value: string; label: string; hint: string }[] = [
  { value: "novice", label: "NOVICE", hint: "RPE 6" },
  { value: "intermediate", label: "INTERMEDIATE", hint: "RPE 7" },
  { value: "advanced", label: "ADVANCED", hint: "RPE 8" },
]

function ChoiceGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="sys-label mb-2 text-zinc-400">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  )
}

function ChoiceChip({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint?: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex h-11 min-w-[84px] flex-col items-center justify-center gap-0.5 rounded-xl border px-3 text-[10px] font-bold tracking-[0.12em] transition-all focus-visible:outline focus-visible:outline-violet-400/70",
        selected
          ? "border-violet-400/40 bg-violet-500/15 text-violet-200 shadow-[0_0_18px_rgba(139,92,246,0.3)]"
          : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-zinc-500/60 hover:text-zinc-300"
      )}
    >
      {label}
      {hint && <span className={cn("text-[8px] font-normal tracking-wider", selected ? "text-violet-300/70" : "text-zinc-400")}>{hint}</span>}
    </button>
  )
}

// ─── Block row (warmup / work / cooldown rendering) ───────────────────────────

const TYPE_TAG: Record<ExerciseType, { label: string; cls: string }> = {
  strength: { label: "STR", cls: "text-violet-300/80 border-violet-500/30" },
  bodyweight: { label: "BODY", cls: "text-fuchsia-300/80 border-fuchsia-500/30" },
  cardio: { label: "CARD", cls: "text-amber-300/80 border-amber-500/30" },
  mobility: { label: "MOB", cls: "text-teal-300/80 border-teal-500/30" },
}

// ── R7-b: additive forge fields + movement-pattern chips ─────────────────────

/** PlanBlock + the forge's additive optional fields (R7-a). Structurally
 *  optional so legacy plans — and any PlanBlock type without them — keep
 *  rendering exactly as before. */
type PlanBlockView = PlanBlock & { pattern?: string; unit?: "reps" | "sec" }

/** Tiny pattern tag chip metadata: label + tinted 1px border, kept inside the
 *  violet/fuchsia/teal/amber system palette. */
const PATTERN_META: Record<string, { label: string; cls: string }> = {
  "push-h": { label: "PUSH·H", cls: "border-violet-400/30 text-violet-300/80" },
  "push-v": { label: "PUSH·V", cls: "border-violet-400/30 text-violet-300/80" },
  "pull-h": { label: "PULL·H", cls: "border-fuchsia-400/30 text-fuchsia-300/80" },
  "pull-v": { label: "PULL·V", cls: "border-fuchsia-400/30 text-fuchsia-300/80" },
  squat: { label: "SQUAT", cls: "border-amber-400/30 text-amber-300/80" },
  hinge: { label: "HINGE", cls: "border-amber-400/30 text-amber-300/80" },
  lunge: { label: "LUNGE", cls: "border-amber-400/30 text-amber-300/80" },
  core: { label: "CORE", cls: "border-teal-400/30 text-teal-300/80" },
  calves: { label: "CALF", cls: "border-teal-400/30 text-teal-300/80" },
  carry: { label: "CARRY", cls: "border-teal-400/30 text-teal-300/80" },
  cardio: { label: "CARDIO", cls: "border-teal-400/30 text-teal-300/80" },
  mobility: { label: "MOB", cls: "border-zinc-600/40 text-zinc-400" },
}

/** Tiny pattern tag — unknown pattern families render no chip (defensive). */
function PatternChip({ pattern }: { pattern: string }) {
  const meta = PATTERN_META[pattern]
  if (!meta) return null
  return (
    <span
      className={cn("shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.15em]", meta.cls)}
    >
      {meta.label}
    </span>
  )
}

// ── R17-B: superset grouping (Strong/Hevy parity) ─────────────────────────────

/** Per-block superset context — groups are maximal runs of ADJACENT blocks
 *  sharing a letter (the forge emits adjacent pairs; longer runs are future
 *  proofing). The group's LAST member owns the recovery rest; earlier members
 *  transition into the next member with no rest between. Legacy plans carry
 *  no `superset` field → every slot is null → rendering stays byte-identical. */
type SupersetCtx = {
  letter: string
  first: boolean
  last: boolean
  nextName: string | null
}

function supersetContexts(blocks: PlanBlockView[]): Array<SupersetCtx | null> {
  const out: Array<SupersetCtx | null> = new Array(blocks.length).fill(null)
  let i = 0
  while (i < blocks.length) {
    const letter = blocks[i].superset
    if (!letter) {
      i += 1
      continue
    }
    let j = i
    while (j + 1 < blocks.length && blocks[j + 1].superset === letter) j += 1
    for (let k = i; k <= j; k += 1) {
      out[k] = { letter, first: k === i, last: k === j, nextName: k < j ? blocks[k + 1].name : null }
    }
    i = j + 1
  }
  return out
}

/** Group chip on a cluster's first row — violet-500/50 border, violet-300
 *  text, sys-label styling (the round's superset accent). */
function SupersetChip({ letter }: { letter: string }) {
  return (
    <span className="sys-label shrink-0 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-px text-violet-300">
      SUPERSET {letter}
    </span>
  )
}

/** The rest label between two superset members — rides the cluster's left
 *  rail (the segment extends past the box to bridge the list's row gaps, so
 *  the violet rail reads as one continuous bracket). Rises with the row it
 *  follows (R15 BlockRow stagger precedent); static under reduced motion. */
function SupersetBridge({ nextName, index }: { nextName: string; index: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={
        reduce
          ? { duration: 0 }
          : { delay: Math.min(index + 1, 9) * 0.05, duration: 0.45, ease: FLOW_EASE }
      }
      className="relative flex items-center py-0.5 pl-3.5"
    >
      <span className="absolute -top-1.5 -bottom-1.5 left-0 w-0.5 bg-violet-500/70" aria-hidden />
      <span className="font-mono text-[8px] font-bold tracking-[0.18em] text-violet-300/80">
        NO REST — PAIR WITH {nextName.toUpperCase()}
      </span>
    </motion.div>
  )
}

/** Positional+type phase classifier — BlockRow rendering and the day pattern
 *  summary share it so they can never disagree about warm-up/cooldown. */
function blockPhase(blocks: PlanBlockView[], i: number): "warmup" | "work" | "cooldown" {
  const b = blocks[i]
  if (i === 0 && b.type === "mobility") return "warmup"
  if (i === blocks.length - 1 && b.type === "mobility") return "cooldown"
  return "work"
}

/** Day-level pattern summary for the card header — work blocks only, deduped
 *  in first-seen order; null when no block carries a pattern (legacy plans). */
function dayPatternLine(blocks: PlanBlockView[]): string | null {
  const labels: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (blockPhase(blocks, i) !== "work" || !b.pattern) continue
    const label = PATTERN_META[b.pattern]?.label
    if (label && !labels.includes(label)) labels.push(label)
  }
  return labels.length > 0 ? labels.join(" ") : null
}

function BlockRow({
  block,
  phase,
  index,
  ss = null,
}: {
  block: PlanBlockView
  phase: "warmup" | "work" | "cooldown"
  index: number
  /** R17-B superset group context — null on standalone blocks (legacy plans
   *  render exactly as before). */
  ss?: SupersetCtx | null
}) {
  const reduce = useReducedMotion()
  // R7-b: unit-aware prescription — cardio minutes (a 1-set block reads
  // "13 MIN", never "1 SETS"), timed holds in seconds ("3×40S"), legacy reps
  // (with the mobility "S HOLD" idiom) exactly as before.
  const dm = block.durationMin
  const prescription =
    dm != null && dm > 0
      ? block.sets > 1
        ? `${block.sets}×${dm} MIN`
        : `${dm} MIN`
      : block.unit === "sec" && block.reps != null
        ? `${block.sets}×${block.reps}S`
        : block.reps != null
          ? `${block.sets}×${block.reps}${block.type === "mobility" ? "S HOLD" : ""}`
          : `${block.sets} SETS`
  const parts = [
    prescription,
    block.weightKg !== undefined ? `@ ${block.weightKg} KG` : null,
    // R17-B: a non-last superset member has no rest of its own — the NO REST
    // bridge under the row owns the transition; the group's LAST member keeps
    // its prescribed rest (the group's recovery).
    ss && !ss.last ? null : `${block.restSec}S`,
    block.rpe !== undefined ? `RPE ${block.rpe}` : null,
  ].filter((p): p is string => p !== null)

  const tag = TYPE_TAG[block.type]
  return (
    <motion.div
      // R15-a: rows rise after their DayCard (R14-c meal-row precedent) —
      // motion rides the existing row element, delay capped so long blocks
      // queue ≤0.4s; reduce → final state instantly.
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { delay: Math.min(index, 8) * 0.05, duration: 0.45, ease: FLOW_EASE }
      }
      // R54-c1 declutter: the per-exercise form-cue prose left the tab
      // surface — the full cue rides this title attribute (the live session
      // console still prints it; this is the plan view only).
      title={block.cue ?? undefined}
      className={cn(
        "rounded-lg border-l-2 bg-white/[0.03] py-2 pl-3 pr-2",
        phase === "warmup" ? "border-teal-400/50" : phase === "cooldown" ? "border-zinc-600/60" : "border-white/[0.08]",
        // R17-B: the violet cluster rail — the app's left-notch idiom
        // (pr-drilldown newest-row precedent), superset accent
        ss && "border-violet-500/70"
      )}
    >
      <div className="flex items-center gap-2">
        {/* R48-b studio — exercise names join the Space Grotesk reading voice */}
        <span className="truncate font-display text-[13px] font-medium text-zinc-100">{block.name}</span>
        {ss?.first && <SupersetChip letter={ss.letter} />}
        {block.pattern && <PatternChip pattern={block.pattern} />}
        <span className={cn("ml-auto shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[8px] tracking-wider", tag.cls)}>
          {tag.label}
        </span>
        {phase !== "work" && (
          <span
            className={cn(
              "shrink-0 font-mono text-[8px] font-bold tracking-[0.2em]",
              phase === "warmup" ? "text-teal-300/80" : "text-zinc-400"
            )}
          >
            {phase === "warmup" ? "WARMUP" : "COOLDOWN"}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[10px] tabular-nums tracking-wider text-zinc-400">{parts.join(" · ")}</span>
      </div>
    </motion.div>
  )
}

// ─── Day card ─────────────────────────────────────────────────────────────────

function DayCard({
  day,
  focus,
  blocks,
  isNext,
  onStart,
  index,
}: {
  day: number
  focus: string
  blocks: PlanBlockView[]
  isNext: boolean
  onStart?: (day: number, dominant: ExerciseType) => void
  index: number
}) {
  // R54-c1: reduce gates the day-body fold (plain show/hide under reduced
  // motion, height fold otherwise — the export-center expander idiom).
  const reduce = useReducedMotion()
  const dominant = dominantType(blocks)
  // R7-b: one compact summary line of the day's work-block pattern families
  // (legacy plans carry no patterns → no line at all)
  const patternLine = dayPatternLine(blocks)
  // R17-B: per-block superset contexts (legacy plans → all null)
  const ssCtxs = supersetContexts(blocks)
  // R54-c1 declutter: only the NEXT-UP day renders expanded on load; every
  // other day stands down to a single 44px header row (the export-center
  // SHOW ALL idiom — the body unmounts while closed and folds open on tap,
  // so the full list AND the START DAY button stay one tap away).
  // nextUpDay arrives async from the readiness feed, so `expanded` derives
  // from isNext || opened — never a seeded state that could go stale when
  // the feed lands and flips this day to next-up.
  const [opened, setOpened] = useState(false)
  const expanded = isNext || opened
  // R4-b: kit flow item — per-index cascade on mount + hover lift; the kit
  // renders a plain div under reduced motion (instant, no lift).
  return (
    <FlowItem
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45, ease: FLOW_EASE }}
      {...liftMotion}
      className={cn(
        "relative overflow-hidden rounded-xl border p-4",
        isNext
          ? "border-violet-400/30 bg-violet-500/[0.06] shadow-[0_0_22px_rgba(139,92,246,0.22)]"
          : "border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.015] shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
      )}
    >
      {isNext ? (
        <div
          className="flex flex-wrap items-center gap-2"
          /* R55-c second-pass declutter: the expanded day's PATTERNS summary
             line stood down — it duplicated the PatternChips on every block
             row below; the summary rides this title (the collapsed-day
             expander already carries the same title, so both states match). */
          title={patternLine ? `Patterns · ${patternLine}` : undefined}
        >
          {/* R48-b studio — the day title joins the Space Grotesk reading voice */}
          <h4 className="font-display shrink-0 text-sm font-medium text-zinc-100">
            DAY {day} · {focus.toUpperCase()}
          </h4>
          <span className="glass-pill glass-pill-violet ml-auto flex shrink-0 items-center gap-1 px-2.5 py-1 text-[9px] font-bold tracking-[0.15em] text-violet-200">
            <Sparkles className="h-3 w-3" aria-hidden /> NEXT UP
          </span>
        </div>
      ) : (
        /* R54-c1 — the stood-down day: one 44px expander row (title + exercise
           count + chevron, aria-expanded wired). The day's pattern summary
           rides the title; the span (not h4) keeps the button's content model
           valid phrasing content. */
        <button
          type="button"
          onClick={() => setOpened((v) => !v)}
          aria-expanded={expanded}
          aria-label={`Day ${day} — ${focus}, ${blocks.length} exercises. ${expanded ? "Hide" : "Show"} the plan.`}
          title={patternLine ? `Patterns · ${patternLine}` : `${focus} day — ${blocks.length} exercises`}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left transition-colors hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <span className="font-display shrink-0 text-sm font-medium text-zinc-100">
            DAY {day} · {focus.toUpperCase()}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums tracking-[0.15em] text-zinc-400">
            {blocks.length} EXERCISES
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200",
              expanded && "rotate-180"
            )}
            aria-hidden
          />
        </button>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="day-body"
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className={isNext ? "" : "pt-3"}>
              <div className="mt-3 space-y-1.5">
                {blocks.map((b, i) => {
                  // R17-B: superset members render as a grouped cluster — violet rail on
                  // every member row, chip on the first, NO REST bridge between
                  // members; standalone blocks (legacy plans) render exactly as before.
                  const ss = ssCtxs[i] ?? null
                  if (ss && !ss.last) {
                    return (
                      <Fragment key={`${b.name}-${i}`}>
                        <BlockRow block={b} phase={blockPhase(blocks, i)} index={i} ss={ss} />
                        <SupersetBridge nextName={ss.nextName ?? b.name} index={i} />
                      </Fragment>
                    )
                  }
                  return <BlockRow key={`${b.name}-${i}`} block={b} phase={blockPhase(blocks, i)} index={i} ss={ss} />
                })}
              </div>

              {onStart && (
                <button
                  type="button"
                  onClick={() => onStart(day, dominant)}
                  className="pill-action relative mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/15 text-[10px] font-bold tracking-[0.12em] text-violet-200 uppercase transition-colors hover:bg-violet-500/35 hover:shadow-[0_0_24px_rgba(139,92,246,0.5)] active:bg-violet-500/45 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden /> START DAY
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </FlowItem>
  )
}

// ─── The panel ────────────────────────────────────────────────────────────────

export function ProgramPanel({
  onStartDay,
  nextUpDay = null,
  weekComplete = null,
}: {
  /** Wired by gates-tab: starts a session pre-picked to the day's dominant gate. */
  onStartDay?: (day: number, dominantType: ExerciseType) => void
  /** Readiness feed (R1-b): violet NEXT UP chip + card glow on this day. */
  nextUpDay?: number | null
  /** Readiness feed (R1-b): emerald week-complete strip. */
  weekComplete?: { daysDone: number; totalDays: number } | null
}) {
  const { data, error, loading, reload } = useApi<ProgramRes>("/api/program")
  const { pushNotice, bumpRefresh } = useSystem()
  const reduce = useReducedMotion()

  const [equipment, setEquipment] = useState<string | null>(null)
  const [goal, setGoal] = useState<string | null>(null)
  const [days, setDays] = useState<number | null>(null)
  const [experience, setExperience] = useState<string | null>(null)
  const [forging, setForging] = useState(false)
  const [confirmRetire, setConfirmRetire] = useState(false)
  const [retiring, setRetiring] = useState(false)

  const program = data?.program ?? null
  // R15-a: key numeral count-up — "N DAYS / WEEK" resolves as the protocol
  // view mounts (0→N over 0.7s; glides on re-forge; instant under reduce).
  // Runs before the early returns; idles at 0 while data is absent.
  const daysShown = useCountUp(program?.days ?? 0, 0.7)

  const forge = async () => {
    if (forging || !equipment || !goal || days === null || !experience) return
    setForging(true)
    try {
      const res = await api<ForgeRes>("/api/program", {
        method: "POST",
        body: JSON.stringify({ equipment, goal, days, experience }),
      })
      reload()
      bumpRefresh()
      pushNotice({
        kind: "info",
        title: "Protocol forged",
        body: `${res.program.name} — ${res.program.days}-day ${res.program.goal.toUpperCase()} split is now active.`,
      })
      if (res.xpGranted) {
        pushNotice({ kind: "xp", title: `+${res.xpGranted} XP`, body: "First program forged today" })
      }
      for (const code of res.titlesUnlocked) {
        const t = titleByCode(code)
        pushNotice({ kind: "title", title: "Title unlocked", body: t ? `${t.title} — ${t.desc}` : code })
      }
    } catch (e) {
      pushNotice({ kind: "warn", title: "Forge refused", body: (e as Error).message })
    } finally {
      setForging(false)
    }
  }

  const retire = async () => {
    if (retiring) return
    setRetiring(true)
    try {
      await api("/api/program", { method: "DELETE" })
      setConfirmRetire(false)
      reload()
      bumpRefresh()
      pushNotice({ kind: "info", title: "Protocol retired", body: "The forge stands ready for the next build." })
    } catch (e) {
      pushNotice({ kind: "warn", title: "Retire failed", body: (e as Error).message })
    } finally {
      setRetiring(false)
    }
  }

  if (loading && !data) {
    return <SkeletonPanel label="SYNCING PROGRAM FORGE" rows={3} />
  }

  // ── No active protocol → the FORGE wizard ──────────────────────────────────
  if (!program) {
    const ready = equipment !== null && goal !== null && days !== null && experience !== null
    return (
      <FlowGroup>
        <SystemPanel
          label="Program Forge"
          labelAccent={
            <span className="flex items-center gap-1.5 text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
              <Dumbbell className="h-3 w-3" aria-hidden /> {EXERCISES.length} EXERCISES · {byEquipment("none").length} NO EQUIPMENT
              {/* R54-c1 declutter: the forge's four-question editorial folded
                  into this one-off hint (periodized split, one active protocol
                  at a time, re-forging retires, first forge of the day +10 XP). */}
              <InfoHint
                label="Forge"
                body="Four questions — the forge strikes a periodized split from the exercise library, warmup to cooldown. One active protocol at a time; re-forging retires the old one. First forge of the day pays +10 XP."
              />
            </span>
          }
        >
        <div className="space-y-4 p-4 sm:p-5">
          {error && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 font-mono text-[10px] tracking-wider text-rose-300" role="alert">
              SYNC ERROR — {error}
            </p>
          )}

            <FlowItem>
              <ChoiceGroup label="Equipment">
                {EQUIPMENT_CHOICES.map((c) => (
                  <ChoiceChip key={c.value} label={c.label} hint={c.hint} selected={equipment === c.value} onSelect={() => setEquipment(c.value)} />
                ))}
              </ChoiceGroup>
            </FlowItem>

            <FlowItem>
              <ChoiceGroup label="Goal">
                {GOAL_CHOICES.map((c) => (
                  <ChoiceChip key={c.value} label={c.label} hint={c.hint} selected={goal === c.value} onSelect={() => setGoal(c.value)} />
                ))}
              </ChoiceGroup>
            </FlowItem>

            <FlowItem>
              <ChoiceGroup label="Days / Week">
                {DAY_CHOICES.map((d) => (
                  <ChoiceChip key={d} label={`${d}`} selected={days === d} onSelect={() => setDays(d)} />
                ))}
              </ChoiceGroup>
            </FlowItem>

            <FlowItem>
              <ChoiceGroup label="Experience">
                {EXPERIENCE_CHOICES.map((c) => (
                  <ChoiceChip key={c.value} label={c.label} hint={c.hint} selected={experience === c.value} onSelect={() => setExperience(c.value)} />
                ))}
              </ChoiceGroup>
            </FlowItem>

            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={forge}
              disabled={!ready || forging}
              aria-busy={forging}
              className="pill-action flex h-11 w-full items-center justify-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/15 text-[10px] font-bold tracking-[0.12em] text-violet-200 uppercase transition-colors hover:bg-violet-500/35 hover:shadow-[0_0_28px_rgba(139,92,246,0.55)] active:bg-violet-500/45 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              {forging ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> FORGING…
                </>
              ) : (
                <>
                  <Anvil className="h-3.5 w-3.5" aria-hidden /> FORGE PROGRAM
                </>
              )}
            </motion.button>
          </div>
        </SystemPanel>
      </FlowGroup>
    )
  }

  // ── Active protocol view ───────────────────────────────────────────────────
  const forgedLabel = new Date(program.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()
  return (
    <FlowGroup>
      <SystemPanel
        label="Program Protocol"
        labelAccent={
          <span className="text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">{Math.round(daysShown)} DAYS / WEEK</span>
        }
      >
        <div className="space-y-4 p-4 sm:p-5">
          {weekComplete && (
            <motion.div
              initial={reduce ? undefined : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: FLOW_EASE }}
              className="relative flex flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3"
              role="status"
              aria-label="Protocol week complete"
              /* R54-c1 declutter: the regenerate guidance (amber chip + tail
                 sentence) folded out of the surface into this title. */
              title="Regenerate for a new split or take the earned rest. Consider regenerating with higher experience or one more training day."
            >
              {/* R4-b: one-shot emerald shimmer sweep across the cleared-week strip */}
              {!reduce && (
                <motion.span
                  aria-hidden
                  initial={{ x: "-130%" }}
                  animate={{ x: "400%" }}
                  transition={{ duration: 0.9, ease: FLOW_EASE, delay: 0.3 }}
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-emerald-300/25 to-transparent"
                />
              )}
              <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
              <p className="min-w-0 flex-1 font-mono text-[10px] font-bold leading-relaxed tracking-widest text-emerald-200">
                PROTOCOL WEEK COMPLETE — {weekComplete.daysDone}/{weekComplete.totalDays} DAYS CLEARED
              </p>
            </motion.div>
          )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Anvil className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
          {/* R48-b studio — the protocol name joins the Space Grotesk reading
              voice (the forge's human-readable title, not a terminal readout) */}
          <h3 className="min-w-0 shrink-0 truncate font-display text-lg font-medium text-zinc-100">
            {program.name}
          </h3>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {confirmRetire ? (
              <>
                <button
                  type="button"
                  onClick={retire}
                  disabled={retiring}
                  className="flex h-11 items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-3.5 text-[9px] font-bold tracking-[0.12em] text-rose-200 uppercase transition-colors hover:bg-rose-500/30 focus-visible:outline focus-visible:outline-rose-400/70 disabled:opacity-40"
                >
                  {retiring ? "RETIRING…" : "CONFIRM RETIRE"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRetire(false)}
                  className="flex h-11 items-center rounded-full border border-zinc-700/60 bg-white/[0.03] px-3.5 text-[9px] font-bold tracking-[0.12em] text-zinc-400 uppercase transition-colors hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  CANCEL
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRetire(true)}
                className="flex h-11 items-center rounded-full border border-zinc-700/60 bg-white/[0.03] px-3.5 text-[9px] font-bold tracking-[0.12em] text-zinc-400 uppercase transition-colors hover:border-rose-400/40 hover:text-rose-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                RETIRE
              </button>
            )}
          </div>
        </div>

        {/* R54 orchestrator polish (VLM mobile audit): the four labeled meta
            chips (GOAL · / EQUIPMENT · / EXPERIENCE · / FORGED) merge into ONE
            quiet value line — the labeled forms ride the title + sr-only list
            (merge & hide; the data is unchanged). */}
        <p
          className="font-mono text-[9px] tracking-wider text-zinc-500"
          title={`Goal ${program.goal} · Equipment ${program.equipment} · Experience ${program.experience} · Forged ${forgedLabel.toLowerCase()}`}
        >
          {program.goal.toUpperCase()}
          {" · "}
          {program.equipment.toUpperCase()}
          {" · "}
          {program.experience.toUpperCase()}
          {" · FORGED "}
          {forgedLabel}
        </p>
        <ul className="sr-only" aria-label="Program protocol details">
          <li>Goal: {program.goal}</li>
          <li>Equipment: {program.equipment}</li>
          <li>Experience: {program.experience}</li>
          <li>Forged {forgedLabel.toLowerCase()}</li>
        </ul>

        <div className="grid gap-4 md:grid-cols-2">
          {program.plan.days.map((d, i) => (
            <DayCard
              key={d.day}
              day={d.day}
              focus={d.focus}
              blocks={d.blocks}
              isNext={nextUpDay === d.day}
              onStart={onStartDay}
              index={i}
            />
          ))}
        </div>
      </div>
      </SystemPanel>
    </FlowGroup>
  )
}
