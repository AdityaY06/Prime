"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Ban,
  Check,
  CheckCheck,
  Dumbbell,
  Flame,
  FlaskConical,
  HeartPulse,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Zap,
} from "lucide-react"
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useTransform,
} from "framer-motion"
import { FlowGroup, FlowItem, MeterFlow, SPRING_SNAPPY } from "@/components/system/motion"
import { RowHint } from "@/components/system/row-hint"
import { SystemPanel } from "@/components/system/system-panel"
import { RankBadge } from "@/components/system/rank-badge"
import { SwipeRow, type SwipeRowAction } from "@/components/system/swipe-row"
import { ExerciseDialog } from "./exercise-dialog"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { useSensors } from "@/store/sensor-store"
import { DEFAULT_HR_MAX, hrMaxFromBirthYear, zoneFor } from "@/lib/sensors/hr-zones"
import { gateById, type ExerciseTemplate } from "@/lib/gates"
import { dayKey, sessionXp, type ExerciseType } from "@/lib/game"
import { describeRpe, rirForRpe, rpeVerdict, RPE_VERDICT_META, type RpeScale, type RpeVerdict } from "@/lib/rpe"
import { epleyE1rm, parseBumpKg, progressionKey, rirVerdictLine, validE1rmSet, type ProgressionEntryDTO } from "@/lib/progression"
import { isRiftGate, riftEffectiveMult } from "@/lib/rift"
import { scienceFor } from "@/lib/science"
import type { ExerciseLogDTO, HunterDTO, PersonalBestDTO, RewardResult, SessionDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// ── R1-c: program plan shapes (tolerant of /api/program response casing) ──────

type PlanBlock = {
  name: string
  type: string
  sets: number
  reps?: number
  weightKg?: number
  /** Cardio blocks prescribe minutes instead of reps — R7-b carries it through
   *  (the old parser dropped it, which is how "Walking — 1 SETS" happened). */
  durationMin?: number
  restSec?: number
  rpe?: number
  cue?: string
  refs?: string[]
  /** R7-b additive forge field — movement pattern family (legacy plans lack it). */
  pattern?: string
  /** R7-b additive forge field — "sec" means the reps field holds HOLD SECONDS. */
  unit?: "reps" | "sec"
  /** R17-B additive forge field — superset group letter; adjacent blocks
   *  sharing a letter alternate with no rest between members (the group's
   *  LAST member owns the recovery rest). Legacy plans lack it → standalone. */
  superset?: string
}

type PlanDay = { day: number; focus: string; blocks: PlanBlock[] }

/** Session rows may carry the programDay echo added by /api/sessions (R1-c). */
type RaidSession = SessionDTO & { programDay?: number | null }

/** R7-b: log-sheet template with the additive reps-are-seconds flag — timed
 *  holds (plan blocks with unit "sec") keep their hold seconds in the reps
 *  field, and the sheet relabels the field "SECS / SET". ExerciseTemplate
 *  itself stays untouched for every other producer. */
type SheetTemplate = ExerciseTemplate & { repsAreSeconds?: boolean }

/** R19-d — pair-deploy member: the gate template R18-a matched, PLUS the plan
 *  block it came from (with that block's index in dayPlan.blocks). The block
 *  lets deployPair stage blockTemplate() — the same prescription /
 *  progression-aware template a single plan-block row deploys — instead of
 *  the bare prescription-free gate template (R18-a watch-item (a):
 *  prescription parity). `block` is null only in the defensive no-plan case,
 *  where the gate template stages exactly as before. */
type PairMember = {
  template: ExerciseTemplate
  block: PlanBlock | null
  blockIndex: number
}

const EXERCISE_TYPES: readonly string[] = ["strength", "bodyweight", "cardio", "mobility"]

/** Prescription-aware fallback rest durations (seconds) by log class. */
const REST_BY_TYPE: Record<string, number> = { strength: 180, bodyweight: 90, cardio: 45, mobility: 30 }

// ── R30-a → R32-a: RPE/RIR autoregulation — persisted guidance ──────────
// R30-a shipped the stepper as client-only live guidance; R32-a lands it in
// the database (ExerciseLog.rpe): every step commits through the update-log
// leg (captureRpe below), returning to a live session restores prior
// ratings (rpeMarks hydrates from the wire), and history surfaces read the
// stored value. The RPE↔RIR table itself stays pure (src/lib/rpe.ts).

/** Stepper bounds — CR10 6–10 is the practical working-set effort band; the
 *  warm-up/easy range below 6 is never rated from the raid console (the
 *  plan's own targets live in this band too). */
const RPE_MIN = 6
const RPE_MAX = 10

/** Verdict chip tints — in-zone teal / push amber / back-off rose, the app's
 *  existing semantic palette (teal = on-plan, amber = coachable, rose = dial
 *  it down). Kept beside PATTERN_META so the raid's chip language stays in
 *  one place. */
const RPE_VERDICT_CLS: Record<RpeVerdict, string> = {
  "in-zone": "border-teal-400/50 bg-teal-500/10 text-teal-300",
  push: "border-amber-400/50 bg-amber-500/10 text-amber-300",
  "back-off": "border-rose-400/50 bg-rose-500/10 text-rose-300",
}

/** The rpe-rir field-manual entry — rendered once as the log-sheet footnote
 *  (same muted style as the gates-tab science line). Resolved at module level:
 *  scienceFor is pure and stable, no per-render work. */
const RPE_SCIENCE = scienceFor("rpe-rir")

/** Compact kg number (1 decimal max, no trailing-zero noise). */
const fmtKg = (n: number) => String(Math.round(n * 10) / 10)

// ── R7-b: movement-pattern families (additive forge fields — legacy plans
// simply lack `pattern`/`unit` and render exactly as before) ──────────────────

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

/** Tiny pattern tag — unknown pattern families render no chip (defensive).
 *  R50-a studio — joins the rounded-full micro-chip family (program-panel's
 *  converted twin). */
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

function supersetContexts(blocks: PlanBlock[]): Array<SupersetCtx | null> {
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

/** Group chip on a cluster's first row — violet-300 text, sys-label styling
 *  (the round's superset accent). R50-a studio — pill radius + the softened
 *  violet-400/30 border, matching program-panel's converted twin. */
function SupersetChip({ letter }: { letter: string }) {
  return (
    <span className="sys-label shrink-0 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-px text-violet-300">
      SUPERSET {letter}
    </span>
  )
}

/** The rest label between two superset members — the violet rail segment
 *  extends past the box to bridge the list's row gaps, so the cluster reads
 *  as one continuous bracket (mirrors program-panel's grouping language). */
function SupersetBridge({ nextName }: { nextName: string }) {
  return (
    <div className="relative flex items-center py-0.5 pl-3.5">
      <span className="absolute -top-1.5 -bottom-1.5 left-0 w-0.5 bg-violet-500/70" aria-hidden />
      <span className="font-mono text-[8px] font-bold tracking-[0.18em] text-violet-300/80">
        NO REST — PAIR WITH {nextName.toUpperCase()}
      </span>
    </div>
  )
}

/** Positional+type predicates — the single source of truth for which rows are
 *  display-only warm-up/cooldown (no log button). The renderer AND the work
 *  block progress count share them, so the denominator can never drift. */
const isWarmupRow = (b: PlanBlock, i: number) =>
  i === 0 && (b.type === "mobility" || /warm/i.test(b.cue ?? ""))
const isCooldownRow = (b: PlanBlock, i: number, total: number) =>
  i === total - 1 && i > 0 && (b.type === "mobility" || /cool/i.test(b.cue ?? ""))

/** Unit-aware prescription string — cardio minutes (never "1 SETS"), timed
 *  holds in seconds ("3×40S"), legacy reps exactly as before. The log button
 *  face and its aria-label share the same string. */
function blockPrescription(b: PlanBlock): string {
  const dm = b.durationMin
  if (dm != null && dm > 0) {
    return b.sets > 1 ? `${b.sets}×${dm} MIN` : `${dm} MIN`
  }
  if (b.unit === "sec" && b.reps != null) return `${b.sets}×${b.reps}S`
  if (b.reps != null) return `${b.sets}×${b.reps}${b.weightKg ? ` @ ${fmtKg(b.weightKg)} KG` : ""}`
  return `${b.sets} SETS`
}

/** Tolerant plan-day extractor — survives any reasonable /api/program shape. */
function extractPlanDays(data: unknown): PlanDay[] {
  const parsePlan = (plan: unknown): PlanDay[] => {
    if (typeof plan === "string") {
      try {
        plan = JSON.parse(plan)
      } catch {
        return []
      }
    }
    if (!plan || typeof plan !== "object") return []
    const days = (plan as { days?: unknown }).days
    if (!Array.isArray(days)) return []
    const out: PlanDay[] = []
    for (const d of days) {
      if (!d || typeof d !== "object") continue
      const day = (d as { day?: unknown }).day
      const focus = String((d as { focus?: unknown }).focus ?? "")
      const blocksRaw = (d as { blocks?: unknown }).blocks
      if (typeof day !== "number" || !Array.isArray(blocksRaw)) continue
      const blocks: PlanBlock[] = []
      for (const b of blocksRaw) {
        if (!b || typeof b !== "object") continue
        const bo = b as Record<string, unknown>
        const name = typeof bo.name === "string" ? bo.name.trim() : ""
        if (!name) continue
        blocks.push({
          name,
          type: typeof bo.type === "string" && EXERCISE_TYPES.includes(bo.type) ? bo.type : "bodyweight",
          sets: Math.max(1, Math.floor(Number(bo.sets ?? 3)) || 3),
          reps: bo.reps === undefined || bo.reps === null ? undefined : Math.max(0, Math.floor(Number(bo.reps)) || 0),
          durationMin:
            bo.durationMin === undefined || bo.durationMin === null
              ? undefined
              : Math.max(0, Number(bo.durationMin) || 0),
          weightKg:
            bo.weightKg === undefined || bo.weightKg === null ? undefined : Math.max(0, Number(bo.weightKg) || 0),
          restSec:
            bo.restSec === undefined || bo.restSec === null ? undefined : Math.max(0, Math.floor(Number(bo.restSec)) || 0),
          rpe: bo.rpe === undefined || bo.rpe === null ? undefined : Number(bo.rpe),
          cue: typeof bo.cue === "string" ? bo.cue : undefined,
          refs: Array.isArray(bo.refs) ? bo.refs.filter((x): x is string => typeof x === "string") : undefined,
          pattern: typeof bo.pattern === "string" ? bo.pattern : undefined,
          unit: bo.unit === "sec" || bo.unit === "reps" ? bo.unit : undefined,
          superset: typeof bo.superset === "string" ? bo.superset : undefined,
        })
      }
      out.push({ day, focus, blocks })
    }
    return out
  }

  if (!data || typeof data !== "object") return []
  const obj = data as Record<string, unknown>
  for (const holder of [obj.program, obj.active, obj]) {
    if (!holder || typeof holder !== "object") continue
    const ho = holder as Record<string, unknown>
    const found = parsePlan(ho.plan) || parsePlan(ho.parsedPlan) || (ho.days ? parsePlan(ho) : [])
    if (found.length > 0) return found
  }
  return []
}

/** One short WebAudio beep when a rest completes (respects the voice toggle). */
function restBeep(voiceEnabled: boolean) {
  if (typeof window === "undefined" || !voiceEnabled) return
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = "sine"
    osc.frequency.value = 880
    const t0 = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
    osc.start(t0)
    osc.stop(t0 + 0.65)
    osc.onended = () => {
      void ctx.close().catch(() => {})
    }
  } catch {
    /* audio unavailable — stay silent */
  }
}

// ── Rest timer pill (in-file sub-component, R1-c) ─────────────────────────────

function RestTimer({
  exercise,
  durationSec,
  voiceEnabled,
  onDismiss,
  supersetNext = null,
}: {
  exercise: string
  durationSec: number
  voiceEnabled: boolean
  onDismiss: () => void
  /** R17-B — non-null while a NON-LAST superset member's transition counts
   *  down: the pill points at the paired block that awaits instead of rest
   *  semantics. Label/tint context only — the gesture machinery is untouched. */
  supersetNext?: string | null
}) {
  const [remaining, setRemaining] = useState(Math.max(0, durationSec))
  const beepedRef = useRef(false)
  const reduce = !!useReducedMotion()
  // completion is derived, not stored — reaching 0 IS the completed state
  const complete = remaining <= 0

  // R15 — swipe-left-to-skip-30s: the pill rides an elastic x-drag; a ghost
  // "RELEASE · SKIP 30S" label fades in as the pull deepens (useTransform on
  // the shared motion value — no React state, zero re-renders per frame), and
  // releasing past -64px commits the cut. The −15S/SKIP/+15S buttons stay the
  // accessible path; drag stands down entirely under reduced motion.
  // R50-a studio — those three controls take the studio-control chrome
  // (white-alpha hairline frame); h-11/rounded-full/hover/focus contracts stay.
  const x = useMotionValue(0)
  const skipHint = useTransform(x, (v) => (v < -14 ? Math.min(1, (-v - 14) / 36) : 0))

  // 1s countdown — cleaned up on unmount; stops itself once zero is reached
  useEffect(() => {
    if (complete) return
    const t = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1))
    }, 1000)
    return () => clearInterval(t)
  }, [complete])

  // reaching zero → a single WebAudio beep (external side effect, once)
  useEffect(() => {
    if (remaining > 0 || beepedRef.current) return
    beepedRef.current = true
    restBeep(voiceEnabled)
  }, [remaining, voiceEnabled])

  // auto-dismiss a few beats after completion
  useEffect(() => {
    if (remaining > 0) return
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [remaining, onDismiss])

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0")
  const ss = String(remaining % 60).padStart(2, "0")

  const adjust = (delta: number) => {
    setRemaining((r) => Math.max(0, r + delta))
  }

  return (
    <motion.div
      role="timer"
      data-no-swipe=""
      aria-label={`${
        supersetNext
          ? `Superset transition: ${mm}:${ss} — ${supersetNext} awaits`
          : `Rest: ${mm}:${ss} remaining — ${exercise}`
      }${!reduce && !complete ? ". Swipe left to skip 30 seconds." : ""}`}
      initial={reduce ? { opacity: 0 } : { scale: 0.8, opacity: 0 }}
      animate={
        complete
          ? reduce
            ? { scale: 1, opacity: 1 }
            : { scale: [1, 1.03, 1], opacity: [1, 0.8, 1] }
          : { scale: 1, opacity: 1 }
      }
      transition={
        complete && !reduce
          ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
          : reduce
            ? { duration: 0.2 }
            : { type: "spring", stiffness: 300, damping: 20 }
      }
      style={{ x }}
      drag={!reduce && !complete ? "x" : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.22, right: 0.06 }}
      onDragEnd={(_, info) => {
        if (!reduce && !complete && info.offset.x <= -64) adjust(-30)
      }}
      className={cn(
        "relative flex w-full max-w-sm flex-col items-center gap-2.5 rounded-full border px-5 py-3 backdrop-blur",
        complete
          ? "border-amber-400/70 bg-amber-500/15 shadow-[0_0_26px_rgba(245,158,11,0.3)]"
          : supersetNext
            ? "border-violet-400/50 bg-zinc-950/90 shadow-[0_0_24px_rgba(139,92,246,0.28)]"
            : "border-teal-400/50 bg-zinc-950/90 shadow-[0_0_24px_rgba(20,184,166,0.22)]"
      )}
    >
      {!reduce && !complete && (
        <motion.span
          style={{ opacity: skipHint }}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-2 mx-auto w-max rounded-full border border-teal-400/30 bg-zinc-950/90 px-2 py-0.5 font-mono text-[8px] font-bold tracking-[0.22em] text-teal-300"
        >
          RELEASE · SKIP 30S
        </motion.span>
      )}
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.2em]",
          complete ? "text-amber-300" : supersetNext ? "text-violet-300" : "text-teal-300"
        )}
      >
        {complete
          ? supersetNext
            ? "TRANSITION COMPLETE ·"
            : "REST COMPLETE ·"
          : supersetNext
            ? "SUPERSET —"
            : "REST ·"}{" "}
        <span className="truncate">
          {(supersetNext ?? exercise).toUpperCase()}
          {supersetNext && !complete ? " AWAITS" : ""}
        </span>
      </span>
      <span
        className={cn(
          "font-mono text-2xl font-bold tabular-nums",
          complete ? "text-amber-300" : supersetNext ? "text-violet-200" : "text-teal-200"
        )}
      >
        {mm}:{ss}
      </span>
      <span className="flex items-center gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => adjust(-15)}
          aria-label="Decrease rest by 15 seconds"
          className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.03] font-mono text-[10px] font-bold tracking-widest text-zinc-300 transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          −15S
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={onDismiss}
          className="grid h-11 min-w-11 place-items-center rounded-full border border-white/10 bg-white/[0.03] px-4 font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-300 uppercase transition-all hover:border-rose-400/50 hover:text-rose-200 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          SKIP
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => adjust(15)}
          aria-label="Increase rest by 15 seconds"
          className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.03] font-mono text-[10px] font-bold tracking-widest text-zinc-300 transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          +15S
        </motion.button>
      </span>
    </motion.div>
  )
}

// ── The active raid console ───────────────────────────────────────────────────

function useElapsed(fromIso: string) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** The active raid console — timer, exercise quick-add, log list, clear button. */

/** R12-d — plan block rows are gesture-loggable: swipe a work block and the
 *  log sheet opens (violet LOG rail, same addExercise path as the tap, which
 *  stays the accessible path under reduced motion). */
const SWIPE_LOG: SwipeRowAction = { icon: Dumbbell, tone: "violet", label: "LOG" }

/** R13-a — logged exercise rows are gesture-editable: swipe a logged set and
 *  the log sheet opens in EDIT mode (violet EDIT rail → update-log). The trash
 *  button stays the always-available accessible path; the edit is the
 *  gesture. */
const SWIPE_EDIT: SwipeRowAction = { icon: Pencil, tone: "violet", label: "EDIT" }

export function SessionRaid({
  hunter,
  session,
  onUpdated,
  onClosed,
}: {
  hunter: HunterDTO
  session: SessionDTO
  onUpdated: () => void
  onClosed: () => void
}) {
  const { pushNotice, showReward, bumpRefresh, voiceEnabled, setRaidLive } = useSystem()
  // R20-b — live HR chip: reads the sensor store directly (BPM writes are
  // throttled to ≥1/s in the store, so the console re-renders at most once a
  // second while a strap is live). The chip mounts only in the live state —
  // idle/unsupported/error render nothing in the header.
  const hrBpm = useSensors((s) => s.hr.bpm)
  const hrLive = useSensors((s) => s.hr.state === "live")
  const hrMaxOverride = useSensors((s) => s.maxHrOverride)
  // R68 · health-audit B2 — the live chip derives HRmax the same way the
  // sensor hub does: override → birth-year (Tanaka via hrMaxFromBirthYear) →
  // the Fox default. A 36-year-old without an override used to see the same
  // 150 bpm as Z3 here and Z4 in the hub (hardcoded 190).
  const hrZone =
    hrLive && hrBpm !== null
      ? zoneFor(hrBpm, hrMaxOverride ?? hrMaxFromBirthYear(hunter.birthYear ?? null))
      : null
  const reduce = useReducedMotion()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [template, setTemplate] = useState<ExerciseTemplate | null>(null)
  // R13-a: the log being corrected (swipe-to-edit target) — null = add mode
  const [editTarget, setEditTarget] = useState<ExerciseLogDTO | null>(null)
  // R18-a: superset pair quick-deploy — tapping a paired chip stages the
  // trailing members here; the sheet opens on the FIRST member and every
  // successful submit advances to the next, so the pair logs back-to-back
  // from one tap. addExercise itself only stages ONE sheet (template + open)
  // — it has no local log array — so the queue is the "second call", consumed
  // by the dialog's submit-close cycle. Cancel (any close that didn't follow
  // an add) clears the flow: bailing on member A abandons the pair.
  const [deployQueue, setDeployQueue] = useState<ExerciseTemplate[]>([])
  // set in onAdded when queue members remain — read by the close handler in
  // the same tick (submit calls onAdded() then onOpenChange(false) back-to-back)
  const pairAdvanceRef = useRef(false)
  const [busy, setBusy] = useState<string | null>(null)
  // R19-d — RIR quick-capture flight state: an optimistic rir per log id
  // (lands on the row instantly; the refetch's wire row carries the same
  // value, so the handoff is seamless), a per-row inline error message (no
  // toast storm — a capture failure stays a whisper at the row that failed),
  // and the log id currently PATCHing (chips disable while in flight).
  const [rirPatches, setRirPatches] = useState<Record<string, number>>({})
  const [rirErrors, setRirErrors] = useState<Record<string, string>>({})
  const [rirBusy, setRirBusy] = useState<string | null>(null)
  // R30-a → R32-a — per-log RPE marks (CR10 6–10), now PERSISTED: every
  // stepper step commits via captureRpe (update-log with BOTH rir + rpe).
  // rpeMarks is the display overlay: hydrated/synced from log.rpe by the
  // effect below (returning to a live session restores prior ratings) and
  // led optimistically only during the POST→refetch flight — the same
  // overlay↔wire relationship rirPatches holds with l.rir. Plus the R19-d
  // flight-state siblings: per-row inline error message (no toast storm)
  // and the log id currently PATCHing (steppers/chips disable in flight).
  const [rpeMarks, setRpeMarks] = useState<Record<string, RpeScale>>({})
  const [rpeErrors, setRpeErrors] = useState<Record<string, string>>({})
  const [rpeBusy, setRpeBusy] = useState<string | null>(null)
  const elapsed = useElapsed(session.startedAt)

  // R13-d — raid-focus mode: while the console is mounted, the Oracle FAB
  // stands down (its fixed bottom-right zone sits exactly where the FINISH
  // controls scroll to — the VLM R13 audit caught it occluding the button).
  // Mount/unmount scoped: leaving the TRAINING tab mid-raid unmounts this
  // component and the FAB returns, which is correct — the overlap only
  // exists on this screen.
  useEffect(() => {
    setRaidLive(true)
    return () => setRaidLive(false)
  }, [setRaidLive])

  // ── R1-c: program-day plan + progression + PR machinery ────────────────────
  const programDay = (session as RaidSession).programDay ?? null
  const planApi = useApi<unknown>(programDay !== null ? "/api/program" : null)
  const progApi = useApi<{ entries: ProgressionEntryDTO[] }>(programDay !== null ? "/api/progression" : null)

  const planDays = useMemo(() => extractPlanDays(planApi.data), [planApi.data])
  const dayPlan = useMemo(
    () => (programDay === null ? null : (planDays.find((d) => d.day === programDay) ?? null)),
    [planDays, programDay]
  )
  // R17-B: superset group contexts for the day's blocks (legacy plans → all
  // null / empty — grouping rendering and the rest-timer context share them)
  const ssCtxs = useMemo(() => (dayPlan ? supersetContexts(dayPlan.blocks) : []), [dayPlan])
  const planEntries = progApi.data?.entries ?? []
  const entryFor = useCallback(
    (name: string) => {
      const key = progressionKey(name)
      return planEntries.find((e) => e.key === key || progressionKey(e.name) === key) ?? null
    },
    [planEntries]
  )

  // rest timer state (null = hidden); seq forces a remount on re-log. R17-B:
  // supersetNext is set when the logged block was a superset member that is
  // NOT the group's last — the pill then counts the collapsed transition and
  // points at the paired block that awaits.
  const [rest, setRest] = useState<
    { exercise: string; durationSec: number; seq: number; supersetNext: string | null } | null
  >(null)
  const restSeqRef = useRef(0)
  const dismissRest = useCallback(() => setRest(null), [])

  // PR celebration banner — display-only; the engine owns the actual records
  const [prBanner, setPrBanner] = useState<{ name: string; line: string } | null>(null)
  const celebratedRef = useRef<Set<string>>(new Set())
  const prSnapshotRef = useRef<PersonalBestDTO[]>([])
  const seenLogsRef = useRef<Set<string> | null>(null)

  // PR snapshot fetched once at mount — stays stale through the session on
  // purpose, so "beats the record" is judged against the PRE-session marks
  useEffect(() => {
    api<{ records: PersonalBestDTO[] }>("/api/prs")
      .then((r) => {
        prSnapshotRef.current = r.records
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!prBanner) return
    const t = setTimeout(() => setPrBanner(null), 6000)
    return () => clearTimeout(t)
  }, [prBanner])

  // Watch for newly added logs on the add-log refresh path → banner + rest
  useEffect(() => {
    if (seenLogsRef.current === null) {
      seenLogsRef.current = new Set(session.logs.map((l) => l.id))
      return
    }
    const fresh = session.logs.filter((l) => !seenLogsRef.current!.has(l.id))
    if (fresh.length === 0) return
    for (const l of session.logs) seenLogsRef.current!.add(l.id)
    const newest = fresh[fresh.length - 1]

    // PR celebration — once per exercise per session
    const key = progressionKey(newest.name)
    const pb = prSnapshotRef.current.find((p) => p.name === key)
    if (pb && !celebratedRef.current.has(key)) {
      let line: string | null = null
      // R68 — the banner compares e1RMs, so BOTH sides must sit inside
      // Epley's 1-12 rep loaded domain: a 13+ rep set has no honest e1RM and
      // the banner honestly stays down (display-only — the engine owns the
      // actual record writes). The old weightKg>0/reps≥1 gate is subsumed.
      if (pb.unit === "kg" && pb.context && validE1rmSet(pb.context.reps, pb.context.weightKg) && validE1rmSet(newest.reps, newest.weightKg)) {
        const pbE1 = epleyE1rm(pb.context.weightKg, pb.context.reps)
        const e1 = epleyE1rm(newest.weightKg, newest.reps)
        if (e1 > pbE1) line = `${fmtKg(newest.weightKg)} KG · E1RM ${fmtKg(e1)} KG`
      } else if (pb.unit === "reps") {
        const total = newest.sets * newest.reps
        if (total > pb.bestValue) line = `${newest.sets}×${newest.reps} · ${total} REPS`
      }
      if (line) {
        celebratedRef.current.add(key)
        setPrBanner({ name: newest.name, line })
      }
    }

    // Rest timer — prescription-aware duration. R17-B: a log on a superset
    // member that is NOT the group's last fires the collapsed transition beat
    // (the forge already dropped its restSec to ~15s; a member with no
    // prescribed rest falls back to 15s, not the full type rest) and points
    // the pill at the member that awaits instead of rest semantics.
    const blockIdx = dayPlan?.blocks.findIndex((b) => progressionKey(b.name) === key) ?? -1
    const blockRest = blockIdx >= 0 ? dayPlan?.blocks[blockIdx].restSec : undefined
    const ss = blockIdx >= 0 ? (ssCtxs[blockIdx] ?? null) : null
    const supersetNext = ss && !ss.last ? ss.nextName : null
    const durationSec = supersetNext
      ? blockRest && blockRest > 0
        ? blockRest
        : 15
      : blockRest && blockRest > 0
        ? blockRest
        : (REST_BY_TYPE[newest.type] ?? 60)
    restSeqRef.current += 1
    setRest({ exercise: newest.name, durationSec, seq: restSeqRef.current, supersetNext })
  }, [session.logs, dayPlan, ssCtxs])

  const gate = gateById(session.gateId)
  // Rift surge — evaluated on the day the raid was entered (mirrors server logic)
  const enteredDay = dayKey(new Date(session.startedAt))
  const riftActive = isRiftGate(session.gateId, enteredDay)
  const xpPreview = sessionXp(
    session.logs.map((l) => ({
      type: l.type as "strength" | "bodyweight" | "cardio" | "mobility",
      sets: l.sets,
      reps: l.reps,
      weightKg: l.weightKg,
      durationMin: l.durationMin,
      xpValue: l.xpValue,
    })),
    riftEffectiveMult(gate, enteredDay)
  )

  // ── R18-a: superset-aware quick deploy ───────────────────────────────
  // Gate templates whose plan blocks share a superset letter fuse into ONE
  // paired violet chip; every other template keeps its existing single chip.
  // Matching is case-tolerant via progressionKey (the file's name-matching
  // idiom — same key doneKeys/entryFor use). A group only pairs when EVERY
  // member maps to a gate template — otherwise the matched members gracefully
  // fall back to their single chips (a plan-only name like "Incline bench
  // press" can never pair). Walks the ssCtxs runs (supersetContexts — the
  // same model the plan checklist renders); singleton defensive runs (j === i,
  // forge never emits) stay standalone; legacy plans → all singles, byte-
  // identical to the pre-R18-a zone.
  // R19-d: members now carry their plan BLOCK (+ its dayPlan index) alongside
  // the gate template, so deployPair stages blockTemplate() — prescription
  // parity with the plan checklist's own rows (R18-a watch-item (a)).
  const { pairDeploys, singleTemplates } = useMemo(() => {
    const pairs: { letter: string; members: PairMember[] }[] = []
    const pairedIds = new Set<string>()
    const gateExercises = gate?.exercises ?? []
    if (dayPlan && gateExercises.length > 0 && ssCtxs.length === dayPlan.blocks.length) {
      const byKey = new Map(gateExercises.map((t) => [progressionKey(t.name), t]))
      const blocks = dayPlan.blocks
      let i = 0
      while (i < blocks.length) {
        const ss = ssCtxs[i]
        if (ss?.first) {
          // run extent — mirrors supersetContexts' own grouping walk
          let j = i
          while (j + 1 < blocks.length && ssCtxs[j + 1]?.letter === ss.letter) j += 1
          if (j > i) {
            const members = blocks
              .slice(i, j + 1)
              .flatMap((b, k) => {
                const t = byKey.get(progressionKey(b.name))
                return t ? [{ template: t, block: b, blockIndex: i + k }] : []
              })
            if (members.length === j - i + 1) {
              pairs.push({ letter: ss.letter, members })
              for (const m of members) pairedIds.add(m.template.id)
            }
          }
          i = j + 1
        } else {
          i += 1
        }
      }
    }
    return { pairDeploys: pairs, singleTemplates: gateExercises.filter((t) => !pairedIds.has(t.id)) }
  }, [gate, dayPlan, ssCtxs])

  const addExercise = (t: SheetTemplate | null) => {
    setTemplate(t)
    setDialogOpen(true)
    // R18-a: every fresh deploy starts a clean sheet flow — a stale pair
    // queue dies here (deployPair re-arms it AFTER this call, so the batched
    // last write wins). Functional form: no-op re-render when already empty.
    setDeployQueue((q) => (q.length === 0 ? q : []))
    pairAdvanceRef.current = false
  }

  // R18-a — pair chip commit: deploy the whole superset group from one tap.
  // The first member opens through the same addExercise path as a single
  // chip; the trailing members ride the queue and the dialog's submit-close
  // cycle hands the sheet to them back-to-back (superset = no rest between
  // members — the rest timer already speaks the transition beat).
  // R19-d — PRESCRIPTION-AWARE: every member whose plan block resolved (pair
  // members come FROM the plan walk, so in practice all of them) stages
  // blockTemplate() — the same plan sets/reps/weight + progression-suggested
  // load the plan checklist's own row deploys — instead of the bare
  // prescription-free gate template. The gate template stays as the defensive
  // fallback for a member with no block, byte-preserving R18-a's path.
  const deployPair = (members: PairMember[]) => {
    if (members.length === 0) return
    const staged: ExerciseTemplate[] = members.map((m) =>
      m.block ? blockTemplate(m.block, m.blockIndex) : m.template
    )
    addExercise(staged[0])
    setDeployQueue(staged.slice(1))
  }

  // R13-a: swipe-to-edit entry — the committed swipe on a log row routes
  // here. The template is cleared so the dialog's editLog prefill wins, and
  // the sheet opens over the mislogged set for correction (update-log).
  const editLog = (l: ExerciseLogDTO) => {
    if (busy) return
    setTemplate(null)
    setEditTarget(l)
    setDialogOpen(true)
    // R18-a: an edit always starts a clean sheet flow too — a stale queue
    // must never hijack the edit's close (unreachable while the sheet is
    // modal, belt-and-braces alongside addExercise's clear)
    setDeployQueue((q) => (q.length === 0 ? q : []))
    pairAdvanceRef.current = false
  }

  const removeLog = async (logId: string) => {
    if (busy) return
    setBusy(logId)
    try {
      await api(`/api/sessions/${session.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "remove-log", logId }),
      })
      onUpdated()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Removal failed", body: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  // ── R19-d: RIR quick-capture ────────────────────────────────────────
  // Wire caught up: drop optimistic entries whose log now carries its rir on
  // the wire (the update-log refetch lands the same value, so the handoff is
  // seamless). Keeps the overlay strictly a flight-time bridge — a concurrent
  // swipe-edit that clears RIR mid-flight can never be masked by a stale
  // optimistic value.
  useEffect(() => {
    setRirPatches((p) => {
      const stale = Object.keys(p).filter((id) => session.logs.some((l) => l.id === id && l.rir != null))
      if (stale.length === 0) return p
      const next = { ...p }
      for (const id of stale) delete next[id]
      return next
    })
  }, [session.logs])

  // ── R32-a: rpeMarks hydration/sync with the wire ─────────────────────
  // On session (re)load, every log's stored rpe seeds rpeMarks — returning
  // to a live session restores prior ratings (R30-a's marks died with the
  // view; the wire is now their source of truth). On every wire change a
  // stored rpe OVERWRITES its mark, so the overlay can never mask a stale
  // value. This mirrors the rirPatches reconciliation discipline above with
  // one documented divergence: rirPatches DROPS its optimistic entry once the
  // wire carries the value because the log row reads the wire FIRST
  // (l.rir ?? patch); rpeMarks reads mark-first (R30-a's stepper/readout/
  // rpeSummary path, unchanged) so a captured mark must SURVIVE the handoff —
  // the sync form keeps marks == wire whenever the wire knows, and leads it
  // only during the POST→refetch flight. A null wire rpe never deletes a
  // mark: only captureRpe's revert path or a row removal can do that (and
  // removed rows' stale entries are unreachable — never rendered again).
  useEffect(() => {
    setRpeMarks((m) => {
      let changed = false
      const next = { ...m }
      for (const l of session.logs) {
        if (l.rpe != null && next[l.id] !== l.rpe) {
          next[l.id] = l.rpe as RpeScale
          changed = true
        }
      }
      return changed ? next : m
    })
  }, [session.logs])

  // One-tap effort capture on a logged set — PATCHes through the SAME
  // update-log leg the swipe-to-edit sheet uses, echoing the row's own values
  // verbatim (the leg revalidates the full log shape: name/type/sets/reps/
  // weight/duration) and sending only the new rir. `notes` is deliberately
  // omitted from the body: the route's keep-on-omit PATCH semantics preserve
  // any stored note. The optimistic patch lands the rir on the row instantly
  // (RIR chip + verdict line render, chips unmount); failure reverts inline
  // and whispers a rose error under the chips — no toast storm.
  // R32-a: the body now also echoes the row's EFFECTIVE rpe (mark, else the
  // wire value) — the always-send-both half of the wipe invariant. rpe is
  // keep-on-omit server-side so omitting it would ALSO be safe, but echoing
  // keeps the PATCH honest even against a refetch that hasn't landed yet (a
  // just-captured optimistic mark survives a RIR capture fired inside the
  // POST→refetch gap). `notes` stays omitted: same keep-on-omit shield.
  const captureRir = async (log: ExerciseLogDTO, rir: number) => {
    if (busy !== null || rirBusy !== null || rpeBusy !== null) return
    setRirBusy(log.id)
    setRirErrors((prev) => {
      if (prev[log.id] === undefined) return prev
      const next = { ...prev }
      delete next[log.id]
      return next
    })
    setRirPatches((p) => ({ ...p, [log.id]: rir }))
    try {
      await api(`/api/sessions/${session.id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "update-log",
          logId: log.id,
          name: log.name,
          type: log.type,
          sets: log.sets,
          reps: log.reps,
          weightKg: log.weightKg,
          durationMin: log.durationMin,
          rir,
          rpe: rpeMarks[log.id] ?? log.rpe ?? null,
        }),
      })
      onUpdated()
    } catch (e) {
      setRirPatches((p) => {
        const next = { ...p }
        delete next[log.id]
        return next
      })
      setRirErrors((er) => ({ ...er, [log.id]: (e as Error).message }))
    } finally {
      setRirBusy(null)
    }
  }

  // ── R32-a: RPE stepper commit — every step persists ───────────────────
  // Mirrors captureRir exactly: optimistic mark → busy lock → update-log
  // POST echoing the row's full log fields → onUpdated() refetch → on error
  // revert to the pre-attempt value + a rose error line under the stepper.
  // ALWAYS sends BOTH rir and rpe: update-log's rir is null-on-omit, so an
  // RPE-only PATCH would WIPE a captured RIR — the echoed rir carries the
  // row's effective value (wire, else an in-flight optimistic rirPatches
  // bridge, so a RIR captured moments ago survives an RPE step fired inside
  // its POST→refetch gap). rpe itself is keep-on-omit server-side (the notes
  // precedent), and `notes` stays omitted — the same shield captureRir uses.
  // Steps serialize behind the rpeBusy lock (deliberate — one PATCH in
  // flight, taps while busy are no-ops exactly like the RIR chips).
  const captureRpe = async (log: ExerciseLogDTO, rpe: RpeScale) => {
    if (busy !== null || rirBusy !== null || rpeBusy !== null) return
    const prior = rpeMarks[log.id] ?? log.rpe ?? null
    setRpeBusy(log.id)
    setRpeErrors((prev) => {
      if (prev[log.id] === undefined) return prev
      const next = { ...prev }
      delete next[log.id]
      return next
    })
    setRpeMarks((m) => ({ ...m, [log.id]: rpe }))
    try {
      await api(`/api/sessions/${session.id}`, {
        method: "POST",
        body: JSON.stringify({
          action: "update-log",
          logId: log.id,
          name: log.name,
          type: log.type,
          sets: log.sets,
          reps: log.reps,
          weightKg: log.weightKg,
          durationMin: log.durationMin,
          rir: log.rir ?? rirPatches[log.id] ?? null,
          rpe,
        }),
      })
      onUpdated()
    } catch (e) {
      setRpeMarks((m) => {
        const next = { ...m }
        if (prior === null) delete next[log.id]
        else next[log.id] = prior as RpeScale
        return next
      })
      setRpeErrors((er) => ({ ...er, [log.id]: (e as Error).message }))
    } finally {
      setRpeBusy(null)
    }
  }

  const finish = async (action: "complete" | "abandon") => {
    if (busy) return
    if (action === "complete" && session.logs.length === 0) {
      pushNotice({ kind: "warn", title: "Session incomplete", body: "Log at least one exercise before finishing." })
      return
    }
    setBusy(action)
    try {
      const res = await api<{ session: SessionDTO; reward: RewardResult & { volumeKg: number; pushupsInSession: number; durationMin: number; riftBonus?: boolean } }>(
        `/api/sessions/${session.id}`,
        { method: "POST", body: JSON.stringify({ action }) }
      )
      if (action === "complete") {
        showReward({ ...res.reward, source: "gate" })
      } else {
        pushNotice({ kind: "warn", title: "Session discarded", body: "No XP earned — the session was discarded." })
      }
      bumpRefresh()
      onClosed()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Action failed", body: (e as Error).message })
      setBusy(null)
    }
  }

  // ── R1-c: plan block helpers ───────────────────────────────────────────────
  const doneKeys = useMemo(() => new Set(session.logs.map((l) => progressionKey(l.name))), [session.logs])

  // ── R30-a: RPE/RIR autoregulation helpers ─────────────────────────────
  // Target lookup for a logged row: the plan block is the ONLY prescription
  // source that carries rpe (gate ExerciseTemplate has no rpe field — the
  // program plan is where the forge writes targets), matched by
  // progressionKey like every other name-match in this file. A custom log or
  // a plan-less raid resolves to null → the stepper still rates effort, it
  // just shows no TARGET and no verdict (honest, not guessed).
  const targetRpeFor = useCallback(
    (name: string): number | null => {
      const key = progressionKey(name)
      const block = dayPlan?.blocks.find((b) => progressionKey(b.name) === key)
      return block?.rpe ?? null
    },
    [dayPlan]
  )

  // Stepper commit — one integer step inside the 6–10 working band, now a
  // thin wrapper over captureRpe (R32-a: every step persists). From UNSET,
  // + enters at the band floor (conservative first step up from "no rating")
  // and − enters at the ceiling (walk DOWN from the top); once set the value
  // clamps to [RPE_MIN, RPE_MAX] and the buttons disable at the bounds. The
  // effective current value reads mark-first (the hydrated overlay), wire
  // fallback — plain per-render function like captureRir/captureRpe so every
  // tap sees fresh state (the useCallback-with-[] form only worked when the
  // step was pure local setState).
  const stepRpe = (log: ExerciseLogDTO, dir: 1 | -1) => {
    const cur = rpeMarks[log.id] ?? log.rpe ?? null
    const next: number =
      cur === null ? (dir > 0 ? RPE_MIN : RPE_MAX) : Math.min(RPE_MAX, Math.max(RPE_MIN, cur + dir))
    void captureRpe(log, next as RpeScale)
  }

  // Session autograph — at commit time, ≥3 rated sets produce the average
  // RPE and its verdict against the day's DOMINANT target. Dominant = a
  // strict majority among the rated logs whose plan block resolved a target;
  // a split day (or a plan-less raid) has no single prescription to judge
  // against → honest skip (null). The average spans ALL rated sets — that is
  // the session's effort — while the verdict reads it against the dominant
  // target only.
  const rpeSummary = useMemo(() => {
    const rated = session.logs.filter((l) => rpeMarks[l.id] != null)
    if (rated.length < 3) return null
    const targets = rated
      .map((l) => targetRpeFor(l.name))
      .filter((t): t is number => t != null)
    if (targets.length === 0) return null
    const counts = new Map<number, number>()
    for (const t of targets) counts.set(t, (counts.get(t) ?? 0) + 1)
    let dominant: number | null = null
    let dominantCount = 0
    for (const [t, c] of counts) {
      if (c > dominantCount) {
        dominant = t
        dominantCount = c
      }
    }
    if (dominant == null || dominantCount <= targets.length / 2) return null
    const avg = rated.reduce((sum, l) => sum + (rpeMarks[l.id] ?? 0), 0) / rated.length
    return { avg, verdict: rpeVerdict(avg, dominant) }
  }, [session.logs, rpeMarks, targetRpeFor])
  // R7-b: only WORK blocks are loggable — warm-up/cooldown rows have no log
  // button, so the progress denominator must count them out ("0/6 BLOCKS"
  // could never reach 6/6; it is now 0/4 WORK BLOCKS that can hit 4/4).
  // Matching is by progressionKey within loggable only — a custom log of
  // "Child's pose" must not tick the warm-up row.
  const loggableBlocks = useMemo(
    () =>
      dayPlan
        ? dayPlan.blocks.filter(
            (b, i) => !isWarmupRow(b, i) && !isCooldownRow(b, i, dayPlan.blocks.length)
          )
        : [],
    [dayPlan]
  )
  const loggableCount = loggableBlocks.length
  const doneCount = loggableBlocks.filter((b) => doneKeys.has(progressionKey(b.name))).length

  const blockTemplate = (b: PlanBlock, i: number): SheetTemplate => {
    const timeType = b.type === "cardio" || b.type === "mobility"
    const entry = entryFor(b.name)
    const suggested =
      entry && entry.suggestion.action === "BUMP LOAD" && entry.lastLog.weightKg > 0
        ? +(entry.lastLog.weightKg + parseBumpKg(entry.suggestion.detail)).toFixed(1)
        : (b.weightKg ?? (entry?.lastLog.weightKg ?? 0))
    return {
      id: `plan-${programDay ?? 0}-${i}-${progressionKey(b.name).replace(/\s+/g, "-")}`,
      name: b.name,
      type: (EXERCISE_TYPES.includes(b.type) ? b.type : "bodyweight") as ExerciseType,
      unit: timeType ? "time" : "reps",
      defaultSets: b.sets,
      defaultReps: timeType ? (b.reps ?? 0) : (b.reps ?? 10),
      defaultWeight: suggested,
      // R7-b: the sheet honors the prescribed duration (was a flat 10)
      defaultMinutes: timeType && !b.reps ? (b.durationMin ?? 10) : 0,
      // R7-b: timed holds keep their seconds in the reps field — the sheet
      // relabels it "SECS / SET" (cardio/mobility minutes handling untouched)
      ...(b.unit === "sec" && !timeType ? { repsAreSeconds: true } : {}),
    }
  }

  const renderBlockRow = (b: PlanBlock, i: number, total: number) => {
    const key = progressionKey(b.name)
    // R17-B: this block's superset group context (null = standalone / legacy)
    const ss = ssCtxs[i] ?? null
    const logged = doneKeys.has(key)
    const entry = entryFor(b.name)
    // R8-a: the block's latest in-session log (last match wins) — its captured
    // RIR drives the close-to-failure coaching. Only fires when the progression
    // engine already has guidance for this exercise (entry exists).
    let rowLog: (typeof session.logs)[number] | null = null
    for (const l of session.logs) if (progressionKey(l.name) === key) rowLog = l
    // R19-d: the block's coaching line reads the EFFECTIVE rir — the wire
    // value, else an optimistic quick-capture patch in flight — so a
    // just-captured 0/1 lights the hold coaching without waiting for the
    // refetch.
    const rowRir = rowLog ? (rowLog.rir ?? rirPatches[rowLog.id] ?? null) : null
    const rirHoldLine =
      entry && rowLog && rowRir != null && rowRir <= 1 && (rowLog.type === "strength" || rowLog.type === "bodyweight")
        ? rowLog.type === "strength" && rowLog.weightKg > 0
          ? "CLOSE TO FAILURE — HOLD LOAD NEXT"
          : "CLOSE TO FAILURE — REPEAT REPS"
        : null

    const isWarmup = isWarmupRow(b, i)
    const isCooldown = isCooldownRow(b, i, total)

    if (isWarmup || isCooldown) {
      return (
        <div
          key={`${key}-${i}`}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-lg border px-3",
            isWarmup ? "border-teal-500/30 bg-teal-500/5" : "border-zinc-700/50 bg-zinc-900/40"
          )}
        >
          <span
            className={cn("h-1 w-6 shrink-0 rounded-full", isWarmup ? "bg-teal-400/60" : "bg-zinc-600/70")}
            aria-hidden
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-[9px] font-bold tracking-[0.2em]",
              isWarmup ? "text-teal-300/80" : "text-zinc-400"
            )}
          >
            {isWarmup ? "WARM-UP" : "COOLDOWN"} · {b.name.toUpperCase()}
          </span>
          {(b.reps || b.restSec) && (
            <span className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-400">
              {[
                // R7-b: hold rows read as seconds — "1×40S HOLD · REST 30S"
                // (legacy mobility reps were always hold seconds; unit "sec"
                // blocks are explicit). Non-hold rows keep the bare legacy form.
                b.reps
                  ? b.unit === "sec" || b.type === "mobility"
                    ? `${b.sets}×${b.reps}S HOLD`
                    : `${b.sets}×${b.reps}`
                  : null,
                b.restSec ? `REST ${b.restSec}S` : null,
              ]
                .filter((p): p is string => p !== null)
                .join(" · ")}
            </span>
          )}
        </div>
      )
    }

    // load chip — emerald bump on a BUMP verdict, zinc repeat otherwise
    let chip: { text: string; emerald: boolean } | null = null
    if (entry && entry.suggestion.action === "BUMP LOAD" && entry.lastLog.weightKg > 0) {
      const from = entry.lastLog.weightKg
      chip = { text: `${fmtKg(from)}→${fmtKg(+(from + parseBumpKg(entry.suggestion.detail)).toFixed(1))} KG`, emerald: true }
    } else {
      const from = entry && entry.lastLog.weightKg > 0 ? entry.lastLog.weightKg : (b.weightKg ?? 0)
      if (from > 0) chip = { text: `${fmtKg(from)} KG`, emerald: false }
    }

    const prescription = blockPrescription(b)

    const row = (
      // R12-d — swipe-to-log: the work block rides SwipeRow (violet LOG rail
      // beneath an opaque sheet — R10 quest-row recipe); the committed swipe
      // opens the log sheet through the same addExercise path as the tap,
      // which stays the accessible path. Warm-up/cooldown rows stay plain.
      <SwipeRow
        key={`${key}-${i}`}
        action={SWIPE_LOG}
        onCommit={() => addExercise(blockTemplate(b, i))}
        enabled={!reduce}
        // R17-B: the violet cluster rail rides the SwipeRow ROOT — the root
        // never translates (only its sheet does), so the group bracket stays
        // anchored even mid-drag. Superset accent = violet.
        className={cn("relative overflow-hidden rounded-lg", ss && "border-l-2 border-l-violet-500/70")}
      >
        <div
          className="relative rounded-lg"
          style={{
            // opaque surface (panel-composite approximation) so the violet
            // rail sleeps beneath at rest — the button's own translucent
            // emerald/white-alpha layers paint on top unchanged
            // (R50-a studio: idle face zinc → white-alpha hairline)
            backgroundImage: "linear-gradient(160deg, #17171B, #0B0B0E)",
          }}
        >
          {!reduce && (
            <span
              className="sys-row-hint pointer-events-none absolute left-1 top-1/2 z-10 -translate-y-1/2 text-[10px] leading-none text-zinc-600"
              aria-hidden
            >
              «
            </span>
          )}
          <button
            type="button"
            onClick={() => addExercise(blockTemplate(b, i))}
            aria-label={`Log ${b.name} — ${prescription}`}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all",
              "focus-visible:outline focus-visible:outline-violet-400/70",
              logged
                ? "border-emerald-400/50 bg-emerald-500/10"
                : "border-white/[0.07] bg-white/[0.02] hover:border-teal-400/50 hover:bg-teal-500/10 active:bg-teal-500/20"
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-sm border font-mono text-[9px]",
                logged
                  ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300"
                  : "border-zinc-700/70 text-zinc-400"
              )}
              aria-hidden
            >
              {logged ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{i + 1}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="truncate font-display text-[13px] font-medium text-zinc-100">{b.name}</span>
                {ss?.first && <SupersetChip letter={ss.letter} />}
                {b.pattern && <PatternChip pattern={b.pattern} />}
                {b.rpe != null && (
                  <span className="font-mono text-[9px] tracking-widest text-rose-300/70">RPE {b.rpe}</span>
                )}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] tabular-nums text-zinc-400">
                {prescription}
                {/* R17-B: a non-last superset member carries no rest on its face
                    — the NO REST bridge below the row owns the transition; the
                    LAST member's rest IS the group's recovery and stays here */}
                {ss && !ss.last ? "" : b.restSec ? ` · REST ${b.restSec}S` : ""}
              </span>
              {rirHoldLine && (
                <span className="mt-0.5 block truncate font-mono text-[9px] font-bold tracking-[0.15em] text-amber-300/80">
                  {rirHoldLine}
                </span>
              )}
            </span>
            {chip && (
              <span
                className={cn(
                  "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest",
                  chip.emerald
                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
                    : "border-white/[0.08] bg-white/[0.03] text-zinc-400"
                )}
              >
                {chip.text}
              </span>
            )}
          </button>
        </div>
      </SwipeRow>
    )
    // R17-B — a non-last superset member carries the NO REST bridge to the
    // member that follows: a SIBLING of the SwipeRow (never a wrapper — the
    // sheet transform owner stays a direct child of its root).
    return ss && !ss.last ? (
      <Fragment key={`${key}-${i}`}>
        {row}
        <SupersetBridge nextName={ss.nextName ?? b.name} />
      </Fragment>
    ) : row
  }

  return (
    <FlowGroup className="space-y-4">
      {/* R15 — row-gesture teaching chip for the raid's two swipe surfaces
          (work blocks + logged exercise rows); portaled to document.body,
          once per session per surface, gone on any row engage */}
      <RowHint surface="raid" />
      <FlowItem>
        <SystemPanel
          label={`Session in Progress · ${session.gateName}`}
          labelAccent={
            <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 sys-pulse" aria-hidden /> LIVE
            </span>
          }
        >
        <div className="p-4 sm:p-5">
          {/* R1-c: inline PR celebration banner (never fixed — sits above the raid header) */}
          <AnimatePresence>
            {prBanner && (
              <motion.div
                key={`${prBanner.name}-${prBanner.line}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                role="status"
                className="mb-4 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 font-mono text-[10px] font-bold tracking-[0.15em] text-amber-200"
              >
                <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                <span className="min-w-0 truncate">
                  NEW PERSONAL BEST · {prBanner.name.toUpperCase()} · {prBanner.line}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* raid header — R50-a studio: gate name joins the Space Grotesk
              reading voice; the epithet is the surface's one sys-italic
              flourish (boss-banner idiom) */}
          <div className="flex flex-wrap items-center gap-4">
            <RankBadge rank={gate?.rank ?? "F"} size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2.5 font-display text-lg font-medium text-zinc-100">
                {session.gateName.toUpperCase()}
                {riftActive && (
                  <span className="rift-banner rift-chip inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] text-amber-300">
                    <Sparkles className="sys-pulse h-3 w-3 shrink-0" aria-hidden />
                    DAILY BONUS ×1.5
                  </span>
                )}
                {/* R20-b — live HR readout chip: inline with the header metadata
                    chips (same flex-wrap flow as the rift chip — no reserved
                    space, nothing shifts when it appears). aria-live keeps the
                    readout available to screen readers without a tap. */}
                {hrLive && (
                  <span
                    aria-live="polite"
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/10 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] text-rose-300"
                  >
                    <HeartPulse className="sys-pulse h-3 w-3 shrink-0" aria-hidden />
                    <span className="tabular-nums">{hrBpm ?? "—"} BPM</span>
                    {hrZone && <span className={cn("h-1.5 w-1.5 rounded-full", hrZone.barClass)} aria-hidden />}
                  </span>
                )}
              </p>
              <p className="sys-italic mt-0.5 truncate text-[11px] text-zinc-300/90">{gate?.epithet}</p>
            </div>
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 font-mono text-2xl font-bold tabular-nums text-glow-violet">
                <Timer className="h-5 w-5 text-violet-400" aria-hidden />
                {elapsed}
              </p>
              <p className="sys-label text-[8px] text-zinc-400">ELAPSED</p>
            </div>
          </div>

          {/* R1-c: PROGRAM PLAN · DAY n — FOCUS checklist */}
          {dayPlan && dayPlan.blocks.length > 0 && (
            <FlowItem className="mt-5 rounded-xl border border-teal-400/20 bg-teal-500/[0.05] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="sys-label text-teal-300/90">
                  Program plan · Day {dayPlan.day} — {dayPlan.focus}
                </p>
                <p className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
                  {doneCount}/{loggableCount} WORK BLOCKS
                </p>
              </div>
              <div
                className="aurora-track mt-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={loggableCount}
                aria-valuenow={doneCount}
                aria-label={`Program day ${dayPlan.day} — ${loggableCount - doneCount} of ${loggableCount} work blocks remaining`}
              >
                {/* R15 — MeterFlow: mounts from 0 and glides as blocks are
                    logged (each addExercise lands as a flow beat, not a jump).
                    R50-a studio — the track joins the aurora hairline family
                    (teal fill, the live-training semantic; the orchestrator's
                    .aurora-fill-teal token); inline transition:none keeps
                    framer the sole width driver. */}
                <MeterFlow
                  className="aurora-fill aurora-fill-teal"
                  style={{ transition: "none" }}
                  pct={loggableCount > 0 ? (doneCount / loggableCount) * 100 : 0}
                  duration={0.6}
                />
              </div>
              <div className="mt-3 space-y-1.5">
                {dayPlan.blocks.map((b, i) => renderBlockRow(b, i, dayPlan.blocks.length))}
              </div>
            </FlowItem>
          )}

          {/* quick add exercises from gate template — R18-a: superset-aware.
              Plan blocks grouped by a superset letter deploy as ONE paired
              violet chip (the cluster idiom the plan checklist already
              speaks); standalone plan blocks and templates not on today's
              plan keep their existing single chips; Custom stays last. */}
          <FlowItem className="mt-5">
            <p className="sys-label text-zinc-400">Quick deploy</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {pairDeploys.map((p) => {
                // R19-d — prescription sub-line: each member's plan-block
                // prescription (the same blockPrescription the plan checklist
                // rows render) joined " + ", so the chip advertises what the
                // deploy will actually prefill. Members come FROM plan blocks,
                // so every real pair carries one; a member with no block (the
                // defensive fallback) drops the whole sub-line rather than
                // render a half-prescription. zinc-400 = policy floor for the
                // micro-label; truncate grace at 390px.
                const rxLine =
                  p.members.every((m) => m.block != null)
                    ? p.members.map((m) => blockPrescription(m.block as PlanBlock)).join(" + ")
                    : null
                return (
                  <motion.button
                    key={`ss-${p.letter}`}
                    type="button"
                    whileTap={reduce ? undefined : { scale: 0.96, transition: SPRING_SNAPPY }}
                    onClick={() => deployPair(p.members)}
                    aria-label={`Deploy superset ${p.letter}: ${p.members
                      .map((m) => m.template.name)
                      .join(" and ")}${rxLine ? ` — ${rxLine}` : ""} — opens the log sheet on each member back-to-back with its plan prescription prefilled`}
                    title={`Superset ${p.letter} — ${p.members.map((m) => m.template.name).join(" + ")}`}
                    className="flex min-h-11 min-w-0 max-w-full flex-col items-start gap-0.5 rounded-lg border border-violet-500/50 bg-violet-500/10 px-3 py-2 text-left transition-all hover:border-violet-400/70 hover:bg-violet-500/20 active:bg-violet-500/30 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    <span className="flex w-full min-w-0 items-center gap-1.5">
                      <span
                        className="shrink-0 font-mono text-[9px] font-bold tracking-[0.15em] text-violet-300"
                        aria-hidden
                      >
                        {p.letter} ·
                      </span>
                      <span className="min-w-0 truncate text-[11px] text-violet-300">
                        {p.members.map((m) => m.template.name).join(" + ")}
                      </span>
                    </span>
                    {rxLine && (
                      <span className="w-full truncate font-mono text-[9px] tracking-[0.12em] text-zinc-400">
                        {rxLine}
                      </span>
                    )}
                  </motion.button>
                )
              })}
              {singleTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addExercise(t)}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-zinc-300 transition-all hover:border-violet-400/60 hover:bg-violet-500/10 hover:text-violet-200 active:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  + {t.name}
                </button>
              ))}
              <button
                onClick={() => addExercise(null)}
                className="flex items-center gap-1 rounded-full border border-dashed border-violet-500/40 bg-violet-500/5 px-3 py-2 text-[11px] text-violet-300 transition-all hover:bg-violet-500/15 active:bg-violet-500/25 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Plus className="h-3 w-3" aria-hidden /> Custom
              </button>
            </div>
          </FlowItem>

          {/* logs */}
          <FlowItem className="mt-5">
            <div className="flex items-center justify-between">
              <p className="sys-label text-zinc-400">Exercise log ({session.logs.length})</p>
              <p className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
                XP ×{riftEffectiveMult(gate, enteredDay).toFixed(riftActive ? 2 : 1)} ON COMPLETE
              </p>
            </div>
            {/* R30-a — science footnote at the log-sheet header (gates-tab's
                exact muted idiom): the consensus autoregulation position
                behind the RPE stepper. ONE line, zinc-500. */}
            {RPE_SCIENCE && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-500">
                <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span>
                  <span className="font-mono tracking-[0.14em]">SCIENCE · </span>
                  {RPE_SCIENCE.body} <span className="whitespace-nowrap">· {RPE_SCIENCE.source}</span>
                </span>
              </p>
            )}
            <div className="scroll-sys mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {session.logs.length === 0 && (
                  <p className="rounded-xl border border-dashed border-zinc-700/50 py-6 text-center font-mono text-[11px] tracking-widest text-zinc-400">
                    NO EXERCISES LOGGED — DEPLOY ABOVE
                  </p>
                )}
                {session.logs.map((l) => {
                  // R19-d: effective RIR — the wire value, else the optimistic
                  // quick-capture patch (a flight-time bridge; the refetch lands
                  // the same value on the wire and the effect above drops the
                  // overlay entry, so the handoff is seamless).
                  const rowRir = l.rir ?? rirPatches[l.id] ?? null
                  const rirLine = rirVerdictLine(rowRir)
                  // R30-a → R32-a: this row's RPE mark (hydrated from the wire
                  // by the sync effect — persisted ratings survive reloads —
                  // and led optimistically during a captureRpe flight), its
                  // plan-block target and the live verdict — the autoregulation
                  // triple the stepper below renders.
                  const rowRpe = rpeMarks[l.id] ?? null
                  const rowRpeTarget = targetRpeFor(l.name)
                  const rowRpeVerdict =
                    rowRpe != null && rowRpeTarget != null ? rpeVerdict(rowRpe, rowRpeTarget) : null
                  return (
                    // R13-a — swipe-to-edit: the logged set rides SwipeRow (violet
                    // EDIT rail beneath an opaque sheet — R12-a records PR-row
                    // recipe; the row's own translucent zinc layer paints on top
                    // so the reveal stays clean during the drag). The committed
                    // swipe opens the log sheet in edit mode; the trash button
                    // inside stays the always-available accessible delete path
                    // (R50-a studio — 44px studio-control frame, the directives-
                    // tab delete-button precedent; rose hover family kept).
                    <SwipeRow
                      key={l.id}
                      action={SWIPE_EDIT}
                      onCommit={() => editLog(l)}
                      enabled={busy === null}
                      className="relative overflow-hidden rounded-lg"
                    >
                      <div
                        className="relative rounded-lg"
                        style={{
                          // opaque surface (panel-composite approximation) so
                          // the violet rail sleeps beneath at rest — the row's
                          // own translucent white-alpha layer paints on top
                          // unchanged (R50-a studio: zinc → white-alpha hairline)
                          backgroundImage: "linear-gradient(160deg, #17171B, #0B0B0E)",
                        }}
                      >
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.9, y: -6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, x: 12, height: 0 }}
                          transition={{ type: "spring", stiffness: 420, damping: 28 }}
                          className="group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                        >
                          <Dumbbell className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-[13px] font-medium text-zinc-100">{l.name}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[10px] text-zinc-400">
                              <span className="min-w-0 truncate">
                                {l.type === "strength" && `${l.sets}×${l.reps} @ ${l.weightKg}kg`}
                                {l.type === "bodyweight" && `${l.sets}×${l.reps} reps`}
                                {l.type === "cardio" &&
                                  (l.durationMin > 0 ? `${l.sets} set · ${l.durationMin} min` : `${l.sets}×${l.reps} reps`)}
                                {l.type === "mobility" && `${l.durationMin} min`}
                              </span>
                              {rowRir != null && (
                                <span
                                  className="shrink-0 rounded-full border border-violet-400/30 px-1 py-px text-[9px] font-bold tracking-[0.15em] text-violet-300/80"
                                  title={rirLine ?? undefined}
                                >
                                  RIR {rowRir}
                                </span>
                              )}
                              {/* R32-a — stored RPE rides the meta line beside
                                  the RIR chip: mono chip "RPE 8" in the RIR
                                  chip's own violet family when captured; an
                                  HONEST zinc dash for unrated rows (NEVER a
                                  fabricated rating). Strength/bodyweight only —
                                  the rateable classes (cardio/mobility rows
                                  can never carry one). */}
                              {(l.type === "strength" || l.type === "bodyweight") && (
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full border px-1 py-px text-[9px] font-bold tracking-[0.15em]",
                                    rowRpe != null
                                      ? "border-violet-400/30 text-violet-300/80"
                                      : "border-white/[0.08] text-zinc-500"
                                  )}
                                  title={
                                    rowRpe != null
                                      ? `Rated RPE ${rowRpe} — ${describeRpe(rowRpe)}`
                                      : "Not rated yet — use the stepper below"
                                  }
                                >
                                  RPE {rowRpe ?? "—"}
                                </span>
                              )}
                            </p>
                            {rowRir != null && rirLine && (
                              <p className="mt-0.5 truncate font-mono text-[9px] tracking-[0.12em] text-teal-400/80">
                                {rirLine}
                              </p>
                            )}
                            {/* R18-a — per-log NOTES second line (Strong parity).
                                Design: single-line truncate (row heights stay uniform
                                inside the tight max-h-72 scroll list — a 2-line clamp
                                would stagger neighbors), mono 9px zinc-400 with
                                rirLine's exact tracking-[0.12em] so the two secondary
                                lines read as one family; the `NOTE · ` prefix speaks
                                the row's existing `· `-separated meta language. Plain
                                <p> INSIDE the opaque sheet div — zero new wrappers,
                                draggables or pointer handlers, so the SwipeRow EDIT
                                machinery stays byte-untouched. Empty/null notes render
                                nothing (server stores null for whitespace-only). */}
                            {l.notes ? (
                              // title mirrors the RIR chip's hover affordance —
                              // the truncated tail stays one hover away
                              <p
                                title={l.notes}
                                className="mt-0.5 truncate font-mono text-[9px] tracking-[0.12em] text-zinc-400"
                              >
                                NOTE · {l.notes}
                              </p>
                            ) : null}
                            {/* R30-a — RPE AUTOREGULATION STEPPER: rate the
                                logged set's effort on the CR10 6–10 working
                                band (last-set RPE — the same semantics R19-d's
                                RIR capture uses); the readout pairs RPE with
                                its consensus RIR. TARGET comes from the row's
                                plan block (the only rpe prescription source)
                                and stacks directly under the readout — the
                                row's inner column (~190px at 390px) cannot
                                host "RPE 10 · 0 RIR · TARGET 10" beside two
                                44px buttons on one line. 44px round −/+ with
                                bound disables (6 / 10); unset enters at the
                                floor via +, the ceiling via −. Verdict chip
                                under the stepper ONLY when actual + target
                                both exist (teal in-zone / amber push / rose
                                back-off); it WRAPS to ≤2 lines rather than
                                truncate — the 32–43-char hints cannot fit the
                                ~190px row column at 390px and a clipped
                                mid-word coaching line loses the message.
                                Type gate mirrors the RIR capture surfaces
                                EXACTLY: strength + bodyweight — cardio rows
                                here are minutes-based with no per-set rows to
                                rate, mobility carries no meaningful reserve
                                reading. R32-a: every step now PERSISTS via
                                captureRpe (update-log, both rir + rpe); the
                                mark hydrates from the wire on session reload
                                and reverts with a rose error line on failure.
                                Plain elements INSIDE the opaque sheet div
                                (R19-d discipline: the SwipeRow EDIT machinery
                                stays untouched). */}
                            {(l.type === "strength" || l.type === "bodyweight") && (
                              <div
                                className="mt-1.5 min-w-0"
                                role="group"
                                aria-label={`Rate effort for ${l.name} — RPE 6 to 10${
                                  rowRpeTarget != null ? `, target ${rowRpeTarget}` : ""
                                }`}
                              >
                                <p className="truncate font-mono text-[9px] font-bold tracking-[0.12em] text-zinc-400">
                                  RATE EFFORT · RPE 6–10
                                </p>
                                <div className="mt-1 flex items-center gap-2">
                                  <motion.button
                                    type="button"
                                    whileTap={reduce ? undefined : { scale: 0.92, transition: SPRING_SNAPPY }}
                                    onClick={() => stepRpe(l, -1)}
                                    disabled={rowRpe === RPE_MIN || rirBusy !== null || rpeBusy !== null}
                                    aria-label="Decrease RPE"
                                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70 disabled:opacity-40"
                                  >
                                    <Minus className="h-4 w-4" aria-hidden />
                                  </motion.button>
                                  <span
                                    aria-live="polite"
                                    title={
                                      rowRpe != null
                                        ? `RPE ${rowRpe} — ${describeRpe(rowRpe)}`
                                        : "Rate this set's effort, RPE 6 to 10"
                                    }
                                    className="min-w-0 flex-1 text-center"
                                  >
                                    <span
                                      className={cn(
                                        "block truncate font-mono text-[11px] font-bold tabular-nums",
                                        // R32-a: the unrated readout dims to zinc-500 —
                                        // "not captured yet" reads visually
                                        // distinct from a live zinc-200 rating
                                        rowRpe != null ? "text-zinc-200" : "text-zinc-500"
                                      )}
                                    >
                                      RPE {rowRpe ?? "—"}
                                      {rowRpe != null ? ` · ${rirForRpe(rowRpe)} RIR` : ""}
                                    </span>
                                    {rowRpeTarget != null && (
                                      <span className="mt-0.5 block truncate font-mono text-[9px] font-bold tracking-[0.15em] text-rose-300/70">
                                        TARGET {rowRpeTarget}
                                      </span>
                                    )}
                                  </span>
                                  <motion.button
                                    type="button"
                                    whileTap={reduce ? undefined : { scale: 0.92, transition: SPRING_SNAPPY }}
                                    onClick={() => stepRpe(l, 1)}
                                    disabled={rowRpe === RPE_MAX || rirBusy !== null || rpeBusy !== null}
                                    aria-label="Increase RPE"
                                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70 disabled:opacity-40"
                                  >
                                    <Plus className="h-4 w-4" aria-hidden />
                                  </motion.button>
                                </div>
                                {rowRpeVerdict && (
                                  <p
                                    className={cn(
                                      "mt-1 rounded-sm border px-1.5 py-1 font-mono text-[10px] font-bold leading-snug",
                                      RPE_VERDICT_CLS[rowRpeVerdict]
                                    )}
                                    title={RPE_VERDICT_META[rowRpeVerdict].hint}
                                  >
                                    {RPE_VERDICT_META[rowRpeVerdict].hint}
                                  </p>
                                )}
                                {/* R32-a — persisted-rating failure line: the
                                    rirErrors idiom (role=alert rose whisper
                                    under the control that failed — no toast
                                    storm), shown until the next successful
                                    capture clears it. */}
                                {rpeErrors[l.id] != null && (
                                  <p
                                    role="alert"
                                    className="mt-1 truncate font-mono text-[9px] tracking-[0.12em] text-rose-300/80"
                                  >
                                    RATING FAILED — {rpeErrors[l.id]}
                                  </p>
                                )}
                              </div>
                            )}
                            {/* R19-d — RIR QUICK-CAPTURE: a logged strength/
                                bodyweight set with no captured effort renders a
                                one-tap chip row (0–3 = the meaningful effort
                                band; the dialog's full 0–5 stepper stays the
                                deliberate-entry path). Type gate mirrors the
                                dialog's RIR visibility EXACTLY (strength +
                                bodyweight — cardio/mobility rows never render
                                chips). Stacked label + chips so the 390px row
                                column never overflows; chips are plain buttons
                                INSIDE the opaque sheet div, after the NOTE line
                                — zero wrappers/draggables/pointer handlers, so
                                the SwipeRow EDIT machinery stays byte-untouched.
                                Height tradeoff documented: chips are min-h-9
                                (36px), not 44 — the row rhythm is three compact
                                mono lines and 44px chips would balloon the
                                capture state then snap the row shut on tap; the
                                chips stretch flex-1 (~45px wide at 390px),
                                keeping a comfortable one-tap target, and the
                                RIR-weighted load path (lib/load.ts effort
                                10−RIR) activates the moment one lands.
                                R50-a studio: rounded-full + white-alpha chip
                                chrome; the min-h-9 height contract above is
                                preserved. */}
                            {rowRir == null && (l.type === "strength" || l.type === "bodyweight") && (
                              <div
                                className="mt-1.5 min-w-0"
                                role="group"
                                aria-label={`Capture effort for ${l.name} — reps in reserve on the last set`}
                              >
                                <p className="truncate font-mono text-[9px] font-bold tracking-[0.12em] text-zinc-400">
                                  CAPTURE EFFORT · RIR?
                                </p>
                                <div className="mt-1 flex min-w-0 gap-1.5">
                                  {[0, 1, 2, 3].map((v) => (
                                    <motion.button
                                      key={v}
                                      type="button"
                                      whileTap={reduce ? undefined : { scale: 0.96, transition: SPRING_SNAPPY }}
                                      onClick={() => captureRir(l, v)}
                                      disabled={rirBusy !== null || rpeBusy !== null}
                                      aria-label={`Capture ${v} reps in reserve`}
                                      className="min-h-9 flex-1 rounded-full border border-white/10 bg-white/[0.03] font-mono text-[10px] font-bold tabular-nums text-zinc-300 transition-all hover:border-violet-400/60 hover:text-violet-200 focus-visible:outline focus-visible:outline-violet-400/70 disabled:opacity-40"
                                    >
                                      {v}
                                    </motion.button>
                                  ))}
                                </div>
                                {rirErrors[l.id] != null && (
                                  <p
                                    role="alert"
                                    className="mt-1 truncate font-mono text-[9px] tracking-[0.12em] text-rose-300/80"
                                  >
                                    CAPTURE FAILED — {rirErrors[l.id]}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-violet-300">+{l.xpValue}</span>
                          <button
                            onClick={() => removeLog(l.id)}
                            disabled={busy !== null}
                            aria-label={`Remove ${l.name}`}
                            className="grid h-11 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-400 opacity-70 transition-all hover:border-rose-400/50 hover:bg-rose-500/15 hover:text-rose-300 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-violet-400/70 disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </motion.div>
                      </div>
                    </SwipeRow>
                  )
                })}
              </AnimatePresence>
            </div>
          </FlowItem>

          {/* R1-c: rest timer pill — in-flow, bottom-center above the finish
              controls. R15: entrance upgraded to a rise+scale spring
              (reduced motion → fade only) */}
          <AnimatePresence>
            {rest && (
              <motion.div
                key={`rest-${rest.seq}`}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.94 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: reduce ? 0 : 10, transition: { duration: 0.18 } }}
                transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 380, damping: 26 }}
                className="mt-5 flex justify-center"
              >
                <RestTimer
                  key={`rt-${rest.seq}`}
                  exercise={rest.exercise}
                  durationSec={rest.durationSec}
                  voiceEnabled={voiceEnabled}
                  onDismiss={dismissRest}
                  supersetNext={rest.supersetNext}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* totals + actions — R50-a studio: both CTAs join the pill-action
              family (h-11/emerald/rose contracts preserved) */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 items-center gap-4 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3">
              <Zap className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
              <div>
                <p className="sys-label text-[8px] text-zinc-400">PROJECTED SESSION XP</p>
                <p className="font-mono text-xl font-bold tabular-nums text-glow-violet">+{xpPreview} XP</p>
                {/* R30-a — session autograph: the commit panel's compact RPE
                    line. Renders only once ≥3 sets carry a rating AND one
                    target holds a strict majority among rated logs — a split
                    day (or a plan-less raid) honestly skips it; the average
                    itself always spans every rated set. Sits inside the XP box
                    (no restructure of the totals row). */}
                {rpeSummary && (
                  <p
                    className="mt-1 truncate font-mono text-[9px] font-bold tracking-[0.12em] text-zinc-400"
                    title={`Average RPE ${rpeSummary.avg.toFixed(1)} vs the day's dominant target — ${RPE_VERDICT_META[rpeSummary.verdict].hint}`}
                  >
                    AVG RPE {rpeSummary.avg.toFixed(1)} · AUTOREG: {RPE_VERDICT_META[rpeSummary.verdict].label}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => finish("abandon")}
                disabled={busy !== null}
                className={cn(
                  "pill-action flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4",
                  "text-[10px] font-bold tracking-[0.14em] text-zinc-400 uppercase transition-all",
                  "hover:border-rose-500/50 hover:text-rose-300 active:border-rose-500/70 disabled:opacity-40",
                  "focus-visible:outline focus-visible:outline-violet-400/70"
                )}
              >
                <Ban className="h-3.5 w-3.5" aria-hidden /> Abandon
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => finish("complete")}
                disabled={busy !== null || session.logs.length === 0}
                className={cn(
                  "glow-breathe pill-action flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/20 px-5",
                  "text-[10px] font-bold tracking-[0.14em] text-emerald-200 uppercase transition-all",
                  "hover:bg-emerald-500/35 active:bg-emerald-500/45 disabled:opacity-40 disabled:shadow-none",
                  "focus-visible:outline focus-visible:outline-violet-400/70"
                )}
              >
                <CheckCheck className="h-4 w-4" aria-hidden />
                {busy === "complete" ? "COMPLETING…" : "FINISH SESSION"}
              </motion.button>
            </div>
          </div>
        </div>
        </SystemPanel>
      </FlowItem>

      {/* dialog */}
      {gate && (
        <ExerciseDialog
          gate={gate}
          template={template}
          editLog={editTarget}
          hunter={hunter}
          sessionId={session.id}
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v)
            if (!v) {
              // R18-a — pair-deploy advance: a submit-close with queue
              // members left reopens the sheet on the NEXT member instead of
              // closing. The batched setDialogOpen(true) wins over the false
              // above, so the sheet never visually closes — the form hot-swaps
              // via the dialog's template prefill effect (deps [template, open,
              // editLog]: open never dips, the new template refires the prefill
              // + full add-path reset). Cancel (no preceding add) falls
              // through: the user bailed on the pair, the queue dies with them.
              if (pairAdvanceRef.current && deployQueue.length > 0) {
                pairAdvanceRef.current = false
                const [next, ...rest] = deployQueue
                setDeployQueue(rest)
                setTemplate(next)
                setDialogOpen(true)
                return
              }
              pairAdvanceRef.current = false
              // R13-a: drop the edit target when the sheet closes so the next
              // open (add path) can't inherit a stale edit prefill
              setEditTarget(null)
              setDeployQueue((q) => (q.length === 0 ? q : []))
            }
          }}
          onAdded={() => {
            onUpdated()
            // R18-a — mark the imminent close as a pair advance when queue
            // members remain (submit calls onAdded() then onOpenChange(false)
            // back-to-back, so this ref write is visible in the same tick)
            if (deployQueue.length > 0) pairAdvanceRef.current = true
          }}
        />
      )}

      <FlowItem>
        <p className="flex items-center justify-center gap-2 font-mono text-[10px] tracking-widest text-zinc-400">
          <Flame className="h-3 w-3" aria-hidden /> STATS INFLUENCE XP · STR/AGI/FLEX BOOST THEIR DOMAINS
        </p>
      </FlowItem>
    </FlowGroup>
  )
}
