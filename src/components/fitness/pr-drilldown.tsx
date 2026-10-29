"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion"
import { Sparkles, XIcon } from "lucide-react"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InfoHint } from "@/components/system/info-hint"
import { FLOW_EASE, MeterFlow, PopIn, SPRING_SOFT, tapMotion, useCountUp } from "@/components/system/motion"
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { api } from "@/hooks/use-api"
import { formatDayLabel } from "@/lib/game"
import type { ProgressionEntryDTO, SuggestionAction } from "@/lib/progression"
import {
  CLASS_SKIN,
  STRENGTH_CLASSES,
  strengthVerdict,
  xbwLabel,
  type StrengthClassId,
  type StrengthVerdict,
} from "@/lib/strength-standards"
import type { AttackPlanDTO, PersonalBestDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useSystem } from "@/store/system-store"

/** Compact kg number (1 decimal max, no trailing-zero noise) — exercise-dialog convention. */
const fmtKg = (n: number) => String(Math.round(n * 10) / 10)

/** Δ value formatting: e1RM keeps one decimal, rep counts stay integral. */
const fmtDelta = (n: number, kind: MetricKind) => (kind === "e1rm" ? (Math.round(n * 10) / 10).toFixed(1) : String(Math.round(n)))

/** Primary metric a record type is judged on (cardio honestly falls back to reps). */
type MetricKind = "e1rm" | "reps"

function metricKindFor(type: string): MetricKind {
  return type === "strength" ? "e1rm" : "reps"
}

const METRIC_LABEL: Record<MetricKind, string> = {
  e1rm: "e1RM PER SESSION",
  reps: "TOP-SET REPS PER SESSION",
}

// ─── R16-c · swipe-to-close tuning ──────────────────────────────────────────
/** Pointer-px (PanInfo.offset) past which a released drag closes the dossier.
 *  84 = the tab engine's own commit distance — both full-surface drag
 *  commitments share one muscle-memory number (the rest pill keeps its 64 as
 *  the micro-action). */
const CLOSE_COMMIT_PX = 84

/** Type tag styling — mirrors exercise-dialog TYPE_CHIP. */
const TYPE_CHIP: Record<string, string> = {
  strength: "border-violet-400/50 bg-violet-500/15 text-violet-200",
  bodyweight: "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200",
  cardio: "border-teal-400/40 bg-teal-500/10 text-teal-200",
  mobility: "border-amber-400/40 bg-amber-500/10 text-amber-200",
}

/** Progression verdict chip color — BUMP emerald / ADD REPS amber / else zinc. */
const VERDICT_CHIP: Record<SuggestionAction, string> = {
  "BUMP LOAD": "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  "ADD REPS": "border-amber-500/50 bg-amber-500/10 text-amber-300",
  HOLD: "border-zinc-600/60 bg-zinc-800/40 text-zinc-300",
  "LOG MORE": "border-zinc-600/60 bg-zinc-800/40 text-zinc-500",
}

/** One session row of the dossier table (chronological). */
type SessionRow = {
  day: string
  sets: number
  reps: number
  weightKg: number
  e1rm: number
  metric: number
}

/** Dossier chart tooltip — sys-panel chrome, matches the records-tab SparkTooltip. */
function DossierTooltip({
  active,
  payload,
  kind,
}: {
  active?: boolean
  payload?: { value?: number; payload?: { day?: string } }[]
  kind: MetricKind
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const day = p.payload?.day
  const v = p.value ?? 0
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-2.5 py-1.5" role="tooltip">
      <p className="sys-label text-[9px] text-zinc-400">{day ? formatDayLabel(day).toUpperCase() : ""}</p>
      <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-violet-300">
        {kind === "e1rm" ? `e1RM ${v.toFixed(1)} KG` : `${Math.round(v)} REPS`}
      </p>
    </div>
  )
}

/** Δ chip vs the chronologically previous session — emerald ▲ / rose ▼ / zinc ±0. */
function DeltaChip({ delta, kind }: { delta: number | null; kind: MetricKind }) {
  if (delta === null) {
    return (
      <span className="font-mono text-[9px] tabular-nums text-zinc-700" title="No earlier session to compare">
        —
      </span>
    )
  }
  if (delta > 0) {
    return (
      <span className="font-mono text-[9px] font-bold tabular-nums tracking-wider text-emerald-400" title={`+${fmtDelta(delta, kind)} vs previous session`}>
        ▲ {fmtDelta(delta, kind)}
      </span>
    )
  }
  if (delta < 0) {
    return (
      <span className="font-mono text-[9px] font-bold tabular-nums tracking-wider text-rose-400" title={`${fmtDelta(delta, kind)} vs previous session`}>
        ▼ {fmtDelta(Math.abs(delta), kind)}
      </span>
    )
  }
  return (
    <span className="font-mono text-[9px] font-bold tabular-nums tracking-wider text-zinc-400" title="Unchanged vs previous session">
      ±0
    </span>
  )
}

/** TOP SET cell — `4×10 @ 40 KG` (strength) / `3×12` (bodyweight) / reps or — (cardio). */
function topSetText(row: SessionRow, type: string): string {
  if (type === "strength") {
    if (row.weightKg > 0 && row.reps > 0) return `${row.sets}×${row.reps} @ ${fmtKg(row.weightKg)} KG`
    if (row.reps > 0) return `${row.sets}×${row.reps}`
    return "—"
  }
  if (type === "bodyweight") {
    return row.reps > 0 ? `${row.sets}×${row.reps}` : "—"
  }
  return row.reps > 0 ? `${row.reps} REPS` : "—"
}

// ─── Oracle attack plan (R5-b) ──────────────────────────────────────────────

/** Extract the leading numeral of a target line ("42.5 KG" → 42.5 + " KG"). */
function splitTargetNumeral(line: string): { numeral: number; suffix: string } | null {
  const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(line)
  if (!m) return null
  const numeral = Number(m[1])
  return Number.isFinite(numeral) && numeral > 0 ? { numeral, suffix: m[2] } : null
}

/** The Oracle's next-session prescription — target, top set, scheme, notes. */
function AttackPlanSection({ plan, reduce }: { plan: AttackPlanDTO; reduce: boolean }) {
  const split = splitTargetNumeral(plan.targetLine)
  const counted = useCountUp(split?.numeral ?? 0, 0.7)
  const shownNumeral = split ? (Number.isInteger(split.numeral) ? String(Math.round(counted)) : (Math.round(counted * 10) / 10).toFixed(1)) : ""

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: FLOW_EASE }}
      className="space-y-3 rounded-sm border border-violet-500/25 bg-violet-500/5 px-3 py-3"
      aria-label="Oracle attack plan"
    >
      {/* header + stall warning */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="sys-label text-violet-300/80">Oracle Attack Plan</p>
        {plan.stallRisk && (
          <motion.span
            initial={reduce ? false : { scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 30, delay: 0.15 }}
            className="shrink-0 rounded-sm border border-amber-400/50 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-widest text-amber-300"
          >
            STALL RISK — DELOAD
          </motion.span>
        )}
      </div>

      {/* verdict context — one compact line */}
      <p className="font-mono text-[9px] tracking-wider text-zinc-400">
        {plan.verdict.action} — {plan.verdict.detail.toUpperCase()}
      </p>

      {/* target — the big numeral */}
      <div>
        <p className="sys-label text-zinc-400">Target · Next Session</p>
        {split ? (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono">
            <span className="text-2xl font-bold tabular-nums leading-none text-violet-300 drop-shadow-[0_0_8px_rgba(139,92,246,0.35)]">
              {shownNumeral}
            </span>
            <span className="font-mono text-[10px] font-bold tracking-widest text-zinc-400">{split.suffix.toUpperCase()}</span>
          </p>
        ) : (
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-violet-300">{plan.targetLine}</p>
        )}
      </div>

      {/* top set */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-t border-violet-500/10 pt-2.5">
        <p className="sys-label shrink-0 text-zinc-400">Top Set</p>
        <p className="min-w-0 text-right font-mono text-[10px] font-bold tabular-nums tracking-wider text-fuchsia-200">{plan.topSet}</p>
      </div>

      {/* scheme — numbered session steps */}
      <div>
        <p className="sys-label text-zinc-400">Scheme</p>
        <ol className="mt-1 space-y-1">
          {plan.scheme.map((step, i) => (
            <motion.li
              key={`${i}-${step}`}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: 0.12 + i * 0.08 }}
              className="flex gap-2 font-mono text-[9px] tracking-wider text-zinc-300"
            >
              <span className="shrink-0 font-bold tabular-nums text-violet-400/80">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0 break-words">{step}</span>
            </motion.li>
          ))}
        </ol>
      </div>

      {/* notes — tactical strings */}
      <div>
        <p className="sys-label text-zinc-400">Notes</p>
        <ul className="mt-1 space-y-1">
          {plan.notes.map((n, i) => (
            <li key={`${i}-${n}`} className="flex gap-1.5 font-mono text-[9px] tracking-wider text-zinc-400">
              <span className="shrink-0 text-violet-400/70" aria-hidden>
                »
              </span>
              <span className="min-w-0 break-words">{n}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* evidence — R6-b science lines grounding the plan (teal = science accent) */}
      {plan.science && plan.science.length > 0 && (
        <div className="border-t border-teal-400/20 pt-2.5">
          <p className="sys-label inline-flex rounded-sm border border-teal-400/40 bg-teal-500/10 px-1.5 py-0.5 text-teal-300">
            Evidence
          </p>
          <ul className="mt-1.5 space-y-1">
            {plan.science.map((s, i) => (
              <motion.li
                key={`${i}-${s}`}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: 0.12 + i * 0.08 }}
                className="flex gap-1.5 font-mono text-[9px] tracking-wider text-teal-200/80"
              >
                <span className="shrink-0 text-teal-400/70" aria-hidden>
                  »
                </span>
                <span className="min-w-0 break-words">{s}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-right font-mono text-[8px] tabular-nums tracking-widest text-zinc-600">
        {plan.sessionsAnalyzed} SESSION{plan.sessionsAnalyzed === 1 ? "" : "S"} ANALYZED · RECORD {fmtKg(plan.best.value)}
        {plan.unit.toUpperCase()} · {formatDayLabel(plan.best.day).toUpperCase()}
      </p>
    </motion.section>
  )
}

// ─── R17-C · strength standard (Strength Level / Symmetric Strength) ────────

/** Ladder-rung fill per class — the CLASS_SKIN hue at bar opacity. */
const SEGMENT_FILL: Record<StrengthClassId, string> = {
  untrained: "bg-zinc-400/80",
  novice: "bg-teal-400/80",
  intermediate: "bg-violet-400/80",
  advanced: "bg-amber-400/80",
  elite: "bg-fuchsia-400/80",
}

/** Axis-label tint per class — the achieved rung's label wears its hue. */
const SEGMENT_TEXT: Record<StrengthClassId, string> = {
  untrained: "text-zinc-300",
  novice: "text-teal-300",
  intermediate: "text-violet-300",
  advanced: "text-amber-300",
  elite: "text-fuchsia-300",
}

/** English ordinal suffix — 1ST/2ND/3RD/11TH/21ST…; percentiles run 1–99. */
function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}TH`
  return `${n}${["TH", "ST", "ND", "RD"][n % 10] ?? "TH"}`
}

/**
 * STRENGTH STANDARD — the population class of this best (R17-C). Class chip +
 * note, the 5-rung class ladder with the achieved rung in its skin color, a
 * MeterFlow bar toward the next threshold ("+X KG TO ADVANCED", or CEILING
 * CLASS at Elite), and the training-age percentile (count-up). kg lifts add
 * the ×BW multiple + bodyweight source; absolute (bodyweight-movement)
 * ladders are rep-based with no ×BW chip. Motion is kit-gated (PopIn /
 * MeterFlow / useCountUp all self-honor reduced motion).
 *
 * R18-c — when bodyweightKg is null the verdicts above silently ran on the
 * lib's 75 kg male defaults; a BodyweightNudge (below) offers the one-tap
 * fix in that case. With a real bodyweight the section renders byte-identical
 * to R17-C (the nudge is strictly additive to the default-weight path).
 */
function StrengthStandardSection({
  verdict,
  bestValue,
  unit,
  bodyweightKg,
}: {
  verdict: StrengthVerdict
  bestValue: number
  unit: string
  /** Real hunter bodyweight — null means the lib's 75 kg fallback applied
   *  silently, in which case no ×BW chip, no bodyweight line, and (R18-c,
   *  kg lifts only) the SET BODYWEIGHT nudge renders below the ladder. */
  bodyweightKg: number | null
}) {
  const idx = STRENGTH_CLASSES.findIndex((c) => c.id === verdict.classId)
  const elite = idx === STRENGTH_CLASSES.length - 1
  const next = elite ? null : STRENGTH_CLASSES[idx + 1]
  const floor = verdict.steps[idx]
  const nextStep = elite ? null : verdict.steps[idx + 1]
  const span = nextStep !== null ? nextStep - floor : 0
  const toNext = nextStep !== null && span > 0 ? Math.min(1, Math.max(0, (bestValue - floor) / span)) : 1
  const unitWord = unit === "kg" ? "KG" : "REPS"
  const delta = nextStep !== null ? Math.max(0, nextStep - bestValue) : 0
  const xbw = xbwLabel(verdict.xbw)
  const percentile = useCountUp(verdict.percentile, 0.9)

  return (
    <div>
      <p className="sys-label text-zinc-400">Strength Standard</p>
      <div className="mt-1.5 space-y-2.5">
        {/* class chip (large) + ×BW secondary chip (kg lifts only) */}
        <div className="flex flex-wrap items-center gap-2">
          <PopIn
            className={cn(
              "shrink-0 rounded-sm border px-2.5 py-1 font-mono text-[11px] font-bold tracking-widest uppercase",
              CLASS_SKIN[verdict.classId],
            )}
          >
            {verdict.label}
          </PopIn>
          {xbw && (
            <span className="shrink-0 rounded-sm border border-zinc-700/60 bg-zinc-900/50 px-1.5 py-1 font-mono text-[9px] font-bold tabular-nums tracking-wider text-zinc-300">
              {xbw}
            </span>
          )}
        </div>

        {/* the note line */}
        <p className="sys-label text-zinc-400">{verdict.note}</p>

        {/* class ladder — 5 population rungs; the achieved rung wears its skin */}
        <div>
          <div className="grid grid-cols-5 gap-1" role="img" aria-label={`Class ladder — achieved: ${verdict.label}`}>
            {STRENGTH_CLASSES.map((c) => (
              <div
                key={c.id}
                className={cn("h-1.5 rounded-sm", c.id === verdict.classId ? SEGMENT_FILL[c.id] : "bg-zinc-800")}
              />
            ))}
          </div>
          <div className="mt-1 grid grid-cols-5 gap-1">
            {STRENGTH_CLASSES.map((c) => (
              <p
                key={c.id}
                className={cn(
                  "min-w-0 truncate text-center font-mono text-[8px] leading-none",
                  c.id === verdict.classId ? cn("font-bold", SEGMENT_TEXT[c.id]) : "text-zinc-400",
                )}
              >
                {c.label}
              </p>
            ))}
          </div>
        </div>

        {/* progress toward the next class threshold — MeterFlow sweep */}
        <div>
          <p className="font-mono text-[9px] font-bold tracking-wider">
            {next && nextStep !== null ? (
              <>
                <span className={cn("tabular-nums", SEGMENT_TEXT[next.id])}>
                  +{unit === "kg" ? fmtKg(delta) : String(Math.round(delta))} {unitWord}
                </span>{" "}
                <span className="text-zinc-400">TO {next.label.toUpperCase()}</span>
              </>
            ) : (
              <span className="text-zinc-300">CEILING CLASS</span>
            )}
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-sm bg-zinc-800/70">
            <MeterFlow
              pct={toNext * 100}
              duration={0.8}
              className={cn("h-full rounded-sm", SEGMENT_FILL[next?.id ?? "elite"])}
            />
          </div>
        </div>

        {/* training-age percentile · bodyweight source */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="sys-label text-zinc-400">
            TRAINING-AGE PERCENTILE ·{" "}
            <span className="font-bold tabular-nums text-zinc-200">{ordinal(Math.round(percentile))}</span>
          </p>
          {verdict.xbw !== null && bodyweightKg != null && (
            <p className="sys-label text-zinc-400">AT {fmtKg(bodyweightKg)} KG BODYWEIGHT</p>
          )}
        </div>

        {/* R18-c — the verdict above ran on the lib's silent 75 kg default (no
            weigh-in, no profile weight): the amber nudge offers the one-tap
            fix in place of the missing bodyweight line. Absolute rep ladders
            skip it — bodyweight never entered their math. */}
        {bodyweightKg == null && unit === "kg" && <BodyweightNudge />}
      </div>
    </div>
  )
}

/**
 * R18-c — SET BODYWEIGHT nudge (rendered by StrengthStandardSection only in
 * the default-bodyweight case). One inline kg field + SET: POSTs
 * /api/metrics {type:"weight", value} exactly like the BODY tab's weigh-in
 * row (day omitted → the route stamps today), then bumps the global refresh
 * key — body-metrics' own post-write pattern — so every useApi refetches
 * silently: records-tab's /api/metrics re-reads, the real bodyweight flows
 * back into this dossier as a prop, the verdict reclassifies live and this
 * block unmounts on its own (no reload). Status stays INLINE (rose error /
 * emerald logged line, no toast storm — the BODY tab never toasts a plain
 * successful write either). Plain form/input/button only: zero new
 * draggables or pointer handlers — the swipe-to-close surface simply yields
 * to the focused text field, vertical travel belongs to the dialog's
 * scroll-sys, and the PopIn entrance rides the section's own idiom
 * (self-gated for reduced motion). DESIGN CALL: the field wears the violet
 * input skin (dialog field idiom) while SET wears amber like the BODY tab's
 * save-body-data buttons — the action reads as resolving the amber warning.
 */
function BodyweightNudge() {
  const { bumpRefresh } = useSystem()
  const [raw, setRaw] = useState("")
  const [saving, setSaving] = useState(false)
  const [doneKg, setDoneKg] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setBodyweight = useCallback(async () => {
    if (saving) return
    // mirrors the BODY tab's logMetric validation shape (Number + range gate)
    const value = Number(raw)
    if (!raw.trim() || !Number.isFinite(value)) {
      setError("ENTER A NUMBER FIRST")
      return
    }
    if (value < 25 || value > 300) {
      setError("WEIGHT MUST BE 25–300 KG")
      return
    }
    setError(null)
    setSaving(true)
    try {
      await api<{ metric: { value: number } }>("/api/metrics", {
        method: "POST",
        body: JSON.stringify({ type: "weight", value }),
      })
      setDoneKg(value)
      // the app's post-metric-write refresh: bumpRefresh → useApi refetch →
      // the real bodyweight re-enters as a prop → verdicts reclassify → this
      // nudge unmounts. doneKg only outlives the swap while the refetch is
      // still in flight (or the write was queued offline).
      bumpRefresh()
    } catch (e) {
      setError(`LOG FAILED — ${(e as Error).message.toUpperCase()}`)
    } finally {
      setSaving(false)
    }
  }, [raw, saving, bumpRefresh])

  return (
    <PopIn className="space-y-2 rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
      <p className="sys-label text-amber-200/90">DEFAULT 75 KG IN EFFECT — CLASSIFY AT YOUR REAL BODYWEIGHT</p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void setBodyweight()
        }}
      >
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            if (error) setError(null)
          }}
          placeholder="82.5"
          aria-label="Bodyweight in kilograms"
          className="h-11 w-20 rounded-sm border border-violet-500/25 bg-zinc-950/70 px-2 font-mono text-sm tabular-nums text-violet-100 placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
        />
        <span className="sys-label text-zinc-400" aria-hidden="true">
          KG
        </span>
        <button
          type="submit"
          disabled={saving}
          className="ml-auto inline-flex min-h-11 items-center justify-center rounded-sm border border-amber-400/50 bg-amber-500/15 px-4 font-mono text-[9px] font-bold tracking-[0.2em] text-amber-200 transition-all hover:bg-amber-500/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-amber-400/70"
        >
          {saving ? "SETTING…" : "SET"}
        </button>
      </form>
      {doneKg !== null && !error && (
        <p aria-live="polite" className="font-mono text-[9px] tracking-widest text-emerald-300">
          LOGGED — {fmtKg(doneKg)} KG IN EFFECT · RECLASSIFYING
        </p>
      )}
      {error && (
        <p role="alert" className="font-mono text-[9px] tracking-widest text-rose-400/90">
          {error}
        </p>
      )}
    </PopIn>
  )
}

/**
 * PR DOSSIER — full session-by-session history drill-down for one personal record.
 * Rendered once by records-tab; receives the PR row + its /api/progression entry.
 * R16-c — the whole surface is a swipe-to-close instrument: an elastic
 * horizontal drag (either direction) with a ghost RELEASE · CLOSE hint; the X
 * button, Escape and the overlay click remain the guaranteed close paths.
 */
export function PrDrilldown({
  record,
  entry,
  open,
  onOpenChange,
  bodyweightKg,
  hunterSex,
}: {
  record: PersonalBestDTO | null
  entry: ProgressionEntryDTO | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** R17-C — hunter bodyweight + sex (records-tab's /api/metrics read); null
   *  bodyweight → the lib's documented 75 kg / male-table fallbacks. */
  bodyweightKg?: number | null
  hunterSex?: string | null
}) {
  const reduceMotion = useReducedMotion()

  // ── R16-c — swipe-to-close on the dossier surface ──────────────────────────
  // Elastic x-drag, either direction. The ghost hint's opacity rides
  // useTransform on the shared motion value — zero re-renders per frame. The
  // ramp (visual x 12→44px ≈ 50→183px of finger travel at 0.24 elastic) teases
  // before the 84px commit and reads solidly past it. Reduced motion KEEPS the
  // drag — dismissal is structure, the same call SwipeFlow makes for tab
  // navigation — but the rubber band drops to 0.12, the release bounce goes
  // overdamped near-instant and the ghost hint is hidden.
  const x = useMotionValue(0)
  const closeHint = useTransform(x, (v) => {
    const a = Math.abs(v)
    return a > 12 ? Math.min(1, (a - 12) / 32) : 0
  })

  // ── Oracle attack plan — devised on demand, reset per dossier opening ─────
  const [plan, setPlan] = useState<AttackPlanDTO | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const planRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPlan(null)
    setPlanError(null)
    setPlanLoading(false)
  }, [record?.id, open])

  // once devised, bring the plan into the dialog's scroll view
  useEffect(() => {
    if (plan && !planLoading) {
      planRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" })
    }
  }, [plan, planLoading, reduceMotion])

  const devisePlan = useCallback(async () => {
    if (!record) return
    setPlanLoading(true)
    setPlanError(null)
    try {
      const p = await api<AttackPlanDTO>(
        `/api/oracle/attack-plan?name=${encodeURIComponent(record.name)}&type=${encodeURIComponent(record.type)}`
      )
      setPlan(p)
    } catch (e) {
      setPlanError((e as Error).message)
    } finally {
      setPlanLoading(false)
    }
  }, [record])

  // R16-c — the session-log table keeps its own sideways pan when it actually
  // overflows: a native capture-phase stand-down (checked per press — parity
  // with SwipeFlow's guardedByScroller honesty) stops the surface drag from
  // stealing horizontal presses that belong to the table. React 19 ref-callback
  // cleanup detaches the listener when the table unmounts.
  const tableGuardRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return () => {}
    const standDown = (e: PointerEvent) => {
      if (el.scrollWidth > el.clientWidth + 1) e.stopPropagation()
    }
    el.addEventListener("pointerdown", standDown, { capture: true })
    return () => el.removeEventListener("pointerdown", standDown, { capture: true })
  }, [])

  if (!record) return null

  const kind = metricKindFor(record.type)
  const prValue =
    record.unit === "kg" ? `${fmtKg(record.bestValue)} KG` : record.unit === "min" ? `${record.bestValue} MIN` : `${record.bestValue} REPS`

  // R17-C — population class of this best; null (unranked lifts) hides the
  // whole STRENGTH STANDARD section. Pure per-render call: reclassifies
  // whenever the hunter's body profile refreshes.
  const verdict = strengthVerdict(record.displayName, record.type, record.bestValue, bodyweightKg ?? 0, hunterSex)

  // Session rows (chronological) from the progression trend; honest fallbacks to the record dates.
  const rows: SessionRow[] = (entry?.trend ?? []).map((t) => ({
    day: t.day,
    sets: t.sets ?? 0,
    reps: t.reps ?? 0,
    weightKg: t.weightKg ?? 0,
    e1rm: t.e1rm,
    metric: kind === "e1rm" ? t.e1rm : (t.reps ?? 0),
  }))
  const hasHistory = rows.length > 0

  const sessionCount = entry?.sessions ?? (hasHistory ? rows.length : 1)
  const firstDay = entry?.firstDay ?? (hasHistory ? rows[0].day : record.achievedAt.slice(0, 10))
  const lastDay = entry?.lastDay ?? (hasHistory ? rows[rows.length - 1].day : record.updatedAt.slice(0, 10))
  const rangeLabel =
    firstDay && lastDay
      ? firstDay === lastDay
        ? formatDayLabel(firstDay).toUpperCase()
        : `${formatDayLabel(firstDay).toUpperCase()} → ${formatDayLabel(lastDay).toUpperCase()}`
      : ""
  const subLine = `${sessionCount} SESSION${sessionCount === 1 ? "" : "S"}${rangeLabel ? ` · ${rangeLabel}` : ""}`

  // Chart series — per-session primary metric; hidden when fewer than 2 usable points.
  const chartData = rows.map((r, i) => ({ x: `${r.day}#${i}`, day: r.day, metric: r.metric }))
  const usablePoints = rows.filter((r) => r.metric > 0).length
  const showChart = usablePoints >= 2
  const bestRow = rows.length > 0 ? rows.reduce((b, r) => (r.metric >= b.metric ? r : b), rows[0]) : null
  const bestChartX = bestRow ? `${bestRow.day}#${rows.indexOf(bestRow)}` : ""

  // Table rows newest-first; Δ compares against the chronologically previous session.
  const newestFirst = [...rows].reverse()
  const deltaForDisplayIndex = (i: number): number | null => {
    const prevChronological = rows.length - 2 - i
    if (prevChronological < 0) return null
    return newestFirst[i].metric - rows[prevChronological].metric
  }

  const showVerdict = !!entry && sessionCount >= 2
  const showUnlockHint = sessionCount < 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* R16-c — the shell is a transparent positioning frame now: the dossier
          chrome moved onto the draggable surface below, so a drag moves the
          whole panel. data-no-swipe is MANDATORY on this element — the portal
          still bubbles pointer events through the REACT tree into SwipeFlow's
          sheet pan (the R15 lesson: the tab engine engages at |dx|>14), and its
          guardedByScroller DOM walk stands down on this attribute. */}
      <DialogContent
        aria-describedby={undefined}
        aria-label={`PR dossier — ${record.displayName}`}
        className="gap-0 border-none bg-transparent p-0 shadow-none"
        showCloseButton={false}
        data-no-swipe=""
      >
        {/* R16-c — the dossier surface: SPRING_SOFT entrance rise + elastic
            swipe-to-close (tuning documented at the x/closeHint block). */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : SPRING_SOFT}
          style={{ x }}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={reduceMotion ? 0.12 : 0.24}
          dragMomentum={false}
          dragTransition={
            reduceMotion ? { bounceStiffness: 1000, bounceDamping: 100 } : { bounceStiffness: 260, bounceDamping: 26 }
          }
          onDragEnd={(_, info) => {
            if (Math.abs(info.offset.x) < CLOSE_COMMIT_PX) return // sub-threshold → dragTransition springs it back
            // a committed drag is not a tap — kill the trailing click so a
            // release over DEVISE ATTACK PLAN can never trigger it (the
            // SwipeFlow release pattern, verbatim)
            const kill = (e: Event) => {
              e.stopPropagation()
              e.preventDefault()
            }
            document.addEventListener("click", kill, { capture: true, once: true })
            window.setTimeout(() => document.removeEventListener("click", kill, { capture: true }), 320)
            onOpenChange(false)
          }}
          className="sys-panel w-full rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl"
        >
          <DialogHeader className="flex-row items-center justify-between gap-2 border-b border-violet-500/10 px-5 py-2.5">
            <DialogTitle className="sys-label text-violet-300/80">PR Dossier</DialogTitle>
            <DialogClose
              aria-label="Close PR dossier"
              className="-my-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800/40 hover:text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <XIcon className="size-4" aria-hidden />
            </DialogClose>
          </DialogHeader>

          <div className="scroll-sys max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
            {/* header — name, type tag, PR badge, window sub-line */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{record.displayName}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase",
                    TYPE_CHIP[record.type] ?? TYPE_CHIP.mobility
                  )}
                >
                  {record.type.toUpperCase()}
                </span>
                <span className="ml-auto shrink-0 rounded-sm border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums tracking-widest text-amber-300">
                  {prValue}
                </span>
              </div>
              <p className="mt-1 font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">{subLine}</p>
            </div>

            {/* R17-C — strength standard: the population class of this best
                (class chip, ladder, progress-to-next, percentile); entirely
                hidden for lifts with no standard. Sits between the header and
                the chart — the class is the record's headline judgment. */}
            {verdict && (
              <StrengthStandardSection
                verdict={verdict}
                bestValue={record.bestValue}
                unit={record.unit}
                bodyweightKg={bodyweightKg ?? null}
              />
            )}

            {/* primary metric chart — R53-a: the e1RM meaning rides a pop-up
                hint on the chart label (the row-face chip explains itself via
                its title attr — a hint glyph can't nest inside the row button) */}
            {showChart && (
              <div>
                <p className="sys-label flex items-center gap-1.5 text-zinc-400">
                  {METRIC_LABEL[kind]}
                  {kind === "e1rm" && <InfoHint term="e1rm" />}
                </p>
                <div className="mt-2 h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(167,139,250,0.08)" vertical={false} />
                      <XAxis
                        dataKey="x"
                        tickFormatter={(v: string, index: number) => {
                          const day = v.split("#")[0]
                          // collapse repeated same-day ticks (multi-session days) — tooltip keeps full days
                          if (index > 0 && chartData[index - 1] && chartData[index - 1].day === day) return ""
                          return formatDayLabel(day)
                        }}
                        tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                        axisLine={{ stroke: "rgba(167,139,250,0.15)" }}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={18}
                      />
                      <YAxis
                        tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                        tickCount={4}
                      />
                      <Tooltip content={<DossierTooltip kind={kind} />} cursor={{ stroke: "rgba(167,139,250,0.3)" }} />
                      <Line
                        type="monotone"
                        dataKey="metric"
                        stroke="#6ee7b7"
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: "#6ee7b7", strokeWidth: 0 }}
                        activeDot={{ r: 4, fill: "#a7f3d0", stroke: "#07060c" }}
                      />
                      {bestRow && bestRow.metric > 0 && (
                        <ReferenceDot x={bestChartX} y={bestRow.metric} r={4.5} fill="#fbbf24" stroke="#07060c" strokeWidth={1.5} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* progression verdict (unlocks at 2+ sessions) */}
            {showVerdict && entry && (
              <div>
                <p className="sys-label text-zinc-400">Progression Verdict</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <motion.span
                    initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 30 }}
                    className={cn(
                      "shrink-0 rounded-sm border px-2 py-1 font-mono text-[9px] font-bold tracking-widest",
                      VERDICT_CHIP[entry.suggestion.action] ?? VERDICT_CHIP["LOG MORE"]
                    )}
                  >
                    {entry.suggestion.action}
                  </motion.span>
                  <span className="min-w-0 font-mono text-[9px] tracking-wider text-zinc-400">{entry.suggestion.detail}</span>
                </div>
              </div>
            )}

            {/* session log table — newest first */}
            {hasHistory && (
              <div>
                <p className="sys-label text-zinc-400">Session Log · Newest First</p>
                <div ref={tableGuardRef} className="scroll-sys mt-2 max-h-64 overflow-x-auto overflow-y-auto rounded-sm border border-zinc-800/60">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-[1]">
                      <tr className="border-b border-zinc-800/60 bg-zinc-950/95 backdrop-blur-sm">
                        <th scope="col" className="px-2 py-2 text-left font-mono text-[8px] font-bold tracking-widest text-zinc-600">
                          DAY
                        </th>
                        <th scope="col" className="px-2 py-2 text-left font-mono text-[8px] font-bold tracking-widest text-zinc-600">
                          TOP SET
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-mono text-[8px] font-bold tracking-widest text-zinc-600">
                          METRIC
                        </th>
                        <th scope="col" className="px-2 py-2 text-right font-mono text-[8px] font-bold tracking-widest text-zinc-600">
                          Δ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {newestFirst.map((row, i) => {
                        const isNewest = i === 0
                        const metricText =
                          kind === "e1rm"
                            ? `e1RM ${row.e1rm.toFixed(1)}`
                            : row.metric > 0
                              ? `${row.metric} REPS`
                              : "—"
                        return (
                          <motion.tr
                            key={`${row.day}-${i}`}
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: i * 0.03 }}
                            className={cn(
                              "border-b border-zinc-800/40 last:border-b-0",
                              isNewest && "border-l-2 border-l-violet-400/70 bg-violet-500/5"
                            )}
                          >
                            <td className="h-11 align-middle px-2 font-mono text-[9px] tabular-nums tracking-wider text-zinc-400">
                              {formatDayLabel(row.day).toUpperCase()}
                            </td>
                            <td className="h-11 align-middle px-2 font-mono text-[9px] tabular-nums tracking-wider text-zinc-300">
                              {topSetText(row, record.type)}
                            </td>
                            <td className="h-11 align-middle px-2 text-right font-mono text-[9px] font-bold tabular-nums tracking-wider text-violet-300">
                              {metricText}
                            </td>
                            <td className="h-11 align-middle px-2 text-right">
                              <DeltaChip delta={deltaForDisplayIndex(i)} kind={kind} />
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* no progression match in the 90-day window */}
            {!hasHistory && (
              <p className="rounded-sm border border-zinc-700/50 bg-zinc-900/40 px-3 py-3 text-center font-mono text-[9px] tracking-[0.25em] text-zinc-400">
                NO SESSION HISTORY RECORDED IN THE LAST 90 DAYS
              </p>
            )}

            {/* single-session history — guidance still sealed */}
            {showUnlockHint && hasHistory && (
              <p className="rounded-sm border border-zinc-700/50 bg-zinc-900/40 px-3 py-2.5 text-center font-mono text-[9px] tracking-[0.25em] text-zinc-400">
                LOG 2-3 MORE SESSIONS TO UNLOCK PROGRESSION GUIDANCE
              </p>
            )}

            {/* Oracle attack plan — devised on demand (R5-b) */}
            <div ref={planRef} className="space-y-3 pt-1">
              <motion.button
                type="button"
                onClick={devisePlan}
                disabled={planLoading}
                {...tapMotion}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/10 px-3 font-mono text-[9px] font-bold tracking-[0.22em] text-violet-200 transition-all hover:border-violet-300/70 hover:bg-violet-500/20 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline focus-visible:outline-violet-400/70"
                aria-label={`Ask the Oracle for the next-session attack plan for ${record.displayName}`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {planLoading ? "DIVINING…" : plan ? "RE-DEVISE" : "DEVISE ATTACK PLAN"}
              </motion.button>

              {/* divining shimmer */}
              {planLoading && (
                <div className="space-y-2 rounded-sm border border-violet-500/20 bg-violet-500/5 px-3 py-3" aria-live="polite" aria-busy="true">
                  <p className="sys-label text-[8px] text-violet-300/70">ORACLE ATTACK PLAN — DIVINING…</p>
                  <div className="skel-bar h-3 w-3/4" />
                  <div className="skel-bar h-3 w-2/3" style={{ animationDelay: "0.15s" }} />
                  <div className="skel-bar h-3 w-1/2" style={{ animationDelay: "0.3s" }} />
                </div>
              )}

              {/* divination failure — rose line + retry */}
              {planError && !planLoading && (
                <div className="space-y-2 rounded-sm border border-rose-500/30 bg-rose-500/5 px-3 py-2.5">
                  <p className="font-mono text-[9px] tracking-widest text-rose-400/90">
                    DIVINATION FAILED — {planError.toUpperCase()}
                  </p>
                  <button
                    type="button"
                    onClick={devisePlan}
                    className="flex min-h-11 w-full items-center justify-center rounded-sm border border-rose-400/50 bg-rose-500/10 px-3 font-mono text-[9px] font-bold tracking-[0.22em] text-rose-200 transition-all hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-rose-400/70"
                  >
                    RETRY DIVINATION
                  </button>
                </div>
              )}

              {/* the plan itself */}
              {plan && !planLoading && <AttackPlanSection plan={plan} reduce={!!reduceMotion} />}
            </div>
          </div>

          {/* R16-c — ghost release hint: opacity rides useTransform on the shared
              x motion value — no React state, zero re-renders per frame. Hidden
              under reduced motion (the drag itself stays; X / Escape / overlay
              click remain the accessible close paths). */}
          {!reduceMotion && (
            <motion.span
              style={{ opacity: closeHint }}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -bottom-2.5 mx-auto w-max rounded-sm border border-violet-400/40 bg-zinc-950/90 px-2 py-0.5 font-mono text-[8px] font-bold tracking-[0.22em] text-violet-300 shadow-[0_0_14px_rgba(139,92,246,0.25)]"
            >
              RELEASE · CLOSE
            </motion.span>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
