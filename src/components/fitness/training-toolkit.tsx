"use client"

// ─── PRIME · Training toolkit (R28-c — super exercise helper tools) ───────────
// Two exports:
//   · RestTimerWidget — the floating, tab-persistent rest countdown. Mounted
//     ONCE at the layout level (beside OfflineIndicator) so it survives every
//     client tab switch; the countdown state lives in rest-timer-store and the
//     widget only DERIVES "remaining" from the absolute restEndsAt deadline on
//     a 250ms interval while mounted.
//   · ToolkitPanel — the GATES tab's 04 · TOOLKIT calculators: rest-timer
//     entry, 1RM estimator, warm-up generator, plate calculator and the
//     RPE↔RIR reference. All math comes from lib/lifting-math.ts (pure, cited).
//
// POSITIONING (deliberate deviation from the brief's `bottom-24 md:bottom-6`):
// the right-bottom fixed zone has TWO incumbent owners — the Oracle FAB
// (bottom-20 right-4 / md:bottom-6 right-6, stands down during raids per
// R13-d) and, while a raid is live, the raid console's FINISH controls that
// scroll into that reach (main's pb-28 lets FINISH's top edge rise to ~156px
// on mobile / ~84px on desktop). Nothing may occlude FINISH mid-workout, so
// the pill floats collision-aware: idle → above the FAB (bottom-36/md:20),
// raid live → above the FINISH reach (bottom-40/md:24). Fixed-position →
// zero layout shift either way; the seat glides between them (motion-safe).

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Activity, Calculator, Gauge, Layers, Pause, Play, Timer, TrendingUp, X } from "lucide-react"
import { FLOW_EASE } from "@/components/system/motion"
import { SystemPanel } from "@/components/system/system-panel"
import { Input } from "@/components/ui/input"
import { useSystem } from "@/store/system-store"
import { useRestTimer } from "@/store/rest-timer-store"
import {
  estimate1RM,
  warmupSets,
  plateBreakdown,
  restSeconds,
  rpeToRir,
  loadableKg,
  KG_BAR,
  LB_BAR,
  type PlateMode,
  type RestKind,
} from "@/lib/lifting-math"
import { cn } from "@/lib/utils"

// ── shared micro-helpers ──────────────────────────────────────────────────────

/** "3:00" style clock from seconds. */
function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/** Compact weight label (1 decimal max, no trailing-zero noise). */
function fmtW(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/** Micro section label — the app's sys-label idiom. */
function SysLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("sys-label text-zinc-400", className)}>{children}</p>
}

/** One tool block header — teal title + optional zinc source note. */
function ToolHead({
  icon: Icon,
  title,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  note?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <Icon className="h-3.5 w-3.5 shrink-0 text-teal-400/70" aria-hidden />
      <span className="font-mono text-[10px] font-bold tracking-[0.25em] text-teal-300">{title}</span>
      {note && (
        <span className="ml-auto font-mono text-[9px] tracking-widest text-zinc-400">{note}</span>
      )}
    </div>
  )
}

/** KG | LB chip pair — 44px targets, single choice, teal when active. */
function UnitToggle({
  value,
  onChange,
  ariaLabel,
}: {
  value: PlateMode
  onChange: (m: PlateMode) => void
  ariaLabel: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex shrink-0 gap-1.5">
      {(["kg", "lb"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={value === m}
          className={cn(
            "grid min-h-11 min-w-14 place-items-center rounded-sm border px-3 font-mono text-[10px] font-bold tracking-[0.2em] transition-all focus-visible:outline focus-visible:outline-violet-400/70",
            value === m
              ? "border-teal-400/60 bg-teal-500/15 text-teal-200"
              : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-teal-400/40 hover:text-teal-300/90",
          )}
        >
          {m.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

// ── RestTimerWidget ───────────────────────────────────────────────────────────

/** SVG countdown ring — progress via stroke-dashoffset; static under reduced
 *  motion (the parent gates the CSS transition). */
function Ring({
  frac,
  size,
  stroke,
  className,
  reduce,
}: {
  frac: number
  size: number
  stroke: number
  className: string
  reduce: boolean
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.min(1, Math.max(0, frac))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(63,63,70,0.6)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={className}
        style={{ transition: reduce ? undefined : "stroke-dashoffset 250ms linear" }}
      />
    </svg>
  )
}

export function RestTimerWidget() {
  const reduce = useReducedMotion()
  // collision-aware seat: the Oracle FAB owns the idle right-bottom zone and
  // the raid console's FINISH reach owns it mid-workout (see file header)
  const raidLive = useSystem((s) => s.raidLive)

  const restEndsAt = useRestTimer((s) => s.restEndsAt)
  const restTotal = useRestTimer((s) => s.restTotal)
  const paused = useRestTimer((s) => s.paused)
  const pausedRemaining = useRestTimer((s) => s.pausedRemaining)
  const label = useRestTimer((s) => s.label)
  const start = useRestTimer((s) => s.start)
  const pauseRest = useRestTimer((s) => s.pause)
  const resumeRest = useRestTimer((s) => s.resume)
  const adjust = useRestTimer((s) => s.adjust)
  const dismiss = useRestTimer((s) => s.dismiss)

  // hydration-safe mount gate (mirrors OfflineIndicator)
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState(0)

  const active = restEndsAt !== null || (paused && pausedRemaining !== null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // the ONLY place "remaining" is derived — absolute deadline, 250ms cadence;
  // a background/unmounted tab rejoins accurately because nothing accumulates
  useEffect(() => {
    if (!active || paused) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [active, paused])

  // every fresh rest starts collapsed — the pill is the running face
  const prevActiveRef = useRef(false)
  useEffect(() => {
    if (active && !prevActiveRef.current) setExpanded(false)
    prevActiveRef.current = active
  }, [active])

  const remainingSec = paused
    ? (pausedRemaining ?? 0)
    : restEndsAt !== null
      ? Math.max(0, (restEndsAt - (now || Date.now())) / 1000)
      : 0
  const complete = active && !paused && remainingSec <= 0
  const shown = Math.ceil(remainingSec)
  const clock = fmtClock(shown)
  const frac = restTotal > 0 ? Math.min(1, Math.max(0, remainingSec / restTotal)) : 0

  // completion, once per completion: guarded vibration + the 8s auto-dismiss
  // (any revive/adjust cancels the pending dismissal via effect cleanup)
  const doneRef = useRef(false)
  useEffect(() => {
    if (!complete) {
      doneRef.current = false
      return
    }
    if (doneRef.current) return
    doneRef.current = true
    try {
      navigator.vibrate?.([200, 100, 200])
    } catch {
      // unsupported platform — silent
    }
    const t = setTimeout(() => dismiss(), 8000)
    return () => clearTimeout(t)
  }, [complete, dismiss])

  if (!mounted) return null

  const seat = raidLive ? "bottom-40 md:bottom-24" : "bottom-36 md:bottom-20"
  const skin = complete
    ? "border-amber-400/70 bg-amber-500/15 shadow-[0_0_26px_rgba(245,158,11,0.3)]"
    : paused
      ? "border-zinc-600/60 bg-zinc-950/90"
      : "border-teal-400/50 bg-zinc-950/90 shadow-[0_0_24px_rgba(20,184,166,0.22)]"

  return (
    <div className={cn("fixed right-3 z-40 motion-safe:transition-[bottom]", seat)}>
      <AnimatePresence>
        {active && (
          <motion.div
            key="rest-timer"
            role="timer"
            data-no-swipe=""
            aria-label={
              complete
                ? `Rest complete${label ? ` — ${label}` : ""}`
                : `Rest ${clock} remaining${label ? ` — ${label}` : ""}${paused ? " — paused" : ""}`
            }
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={
              complete
                ? reduce
                  ? { opacity: 1, x: 0 }
                  : { opacity: [1, 0.85, 1], scale: [1, 1.03, 1], x: 0 }
                : reduce
                  ? { opacity: 1, x: 0 }
                  : { opacity: 1, x: 0 }
            }
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            transition={
              complete && !reduce
                ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" }
                : reduce
                  ? { duration: 0.2 }
                  : { duration: 0.35, ease: FLOW_EASE }
            }
            className="flex flex-col items-end"
          >
            {expanded ? (
              // ── expanded control panel ──
              <div
                className={cn(
                  "relative w-72 max-w-[calc(100vw-1.5rem)] rounded-sm border p-3.5 backdrop-blur-xl",
                  skin,
                )}
              >
                <i className="sys-corner sys-corner-tl" aria-hidden />
                <i className="sys-corner sys-corner-tr" aria-hidden />
                <i className="sys-corner sys-corner-bl" aria-hidden />
                <i className="sys-corner sys-corner-br" aria-hidden />

                {/* header — context + dismiss */}
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-mono text-[9px] font-bold tracking-[0.25em]",
                      complete ? "text-amber-300" : "text-teal-300",
                    )}
                  >
                    {complete ? "REST COMPLETE" : paused ? "REST · PAUSED" : "REST"}
                  </span>
                  {label && (
                    <span className="min-w-0 flex-1 truncate text-right font-mono text-[9px] tracking-widest text-zinc-400">
                      {label.toUpperCase()}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss rest timer"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-zinc-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                {/* countdown — ring + big tabular numerals */}
                <div className="mt-2.5 flex items-center gap-3.5">
                  <div className="relative grid h-16 w-16 shrink-0 place-items-center">
                    <Ring
                      frac={frac}
                      size={64}
                      stroke={3.5}
                      className={complete ? "stroke-amber-300" : paused ? "stroke-zinc-400" : "stroke-teal-300"}
                      reduce={!!reduce}
                    />
                    <span
                      className={cn(
                        "absolute font-mono text-lg font-bold tabular-nums",
                        complete ? "text-amber-300" : paused ? "text-zinc-200" : "text-teal-200",
                      )}
                    >
                      {clock}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "font-mono text-xs font-bold tabular-nums tracking-widest",
                        complete ? "text-amber-200" : "text-zinc-200",
                      )}
                    >
                      {complete ? "GO — NEXT SET" : `${clock} LEFT`}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
                      OF {fmtClock(restTotal)} TOTAL
                    </p>
                    <p className="mt-1 font-mono text-[8px] tracking-[0.18em] text-zinc-400">
                      KEEPS COUNTING ON EVERY TAB
                    </p>
                  </div>
                </div>

                {/* controls — ±15s + pause/resume (44px targets) */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(-15)}
                    aria-label="Decrease rest by 15 seconds"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-700/60 bg-zinc-900/60 font-mono text-[10px] font-bold tracking-widest text-zinc-300 transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    −15S
                  </button>
                  <button
                    type="button"
                    onClick={paused ? resumeRest : pauseRest}
                    disabled={complete}
                    aria-label={paused ? "Resume rest countdown" : "Pause rest countdown"}
                    className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/60 font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-200 uppercase transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70 disabled:opacity-40"
                  >
                    {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
                    {paused ? "RESUME" : "PAUSE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => adjust(15)}
                    aria-label="Increase rest by 15 seconds"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-700/60 bg-zinc-900/60 font-mono text-[10px] font-bold tracking-widest text-zinc-300 transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    +15S
                  </button>
                </div>

                {/* preset chips — re-arm at a fresh duration (44px targets) */}
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  {[
                    { s: 90, t: "90S" },
                    { s: 120, t: "2 MIN" },
                    { s: 180, t: "3 MIN" },
                  ].map((p) => (
                    <button
                      key={p.s}
                      type="button"
                      onClick={() => start(p.s, label)}
                      aria-label={`Restart rest timer at ${p.t}`}
                      className="grid min-h-11 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-900/60 font-mono text-[10px] font-bold tracking-[0.15em] text-zinc-300 transition-all hover:border-teal-400/50 hover:text-teal-200 focus-visible:outline focus-visible:outline-violet-400/70"
                    >
                      {p.t}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              // ── collapsed pill (~h-11) — mini ring + clock; tap to expand ──
              <motion.button
                type="button"
                onClick={() => setExpanded(true)}
                aria-expanded={false}
                aria-label={`Rest ${clock} remaining${label ? ` — ${label}` : ""}${paused ? " — paused" : ""}. Tap to open rest controls.`}
                className={cn(
                  "flex h-11 items-center gap-2.5 rounded-full border px-3.5 backdrop-blur-sm focus-visible:outline focus-visible:outline-violet-400/70",
                  skin,
                )}
              >
                <Ring
                  frac={frac}
                  size={20}
                  stroke={2.5}
                  className={complete ? "stroke-amber-300" : paused ? "stroke-zinc-400" : "stroke-teal-300"}
                  reduce={!!reduce}
                />
                <span
                  className={cn(
                    "font-mono text-sm font-bold tabular-nums",
                    complete ? "text-amber-300" : paused ? "text-zinc-200" : "text-teal-200",
                  )}
                >
                  {clock}
                </span>
                {paused ? (
                  <Pause className="h-3 w-3 shrink-0 text-zinc-400" aria-hidden />
                ) : (
                  <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-400">
                    {complete ? "GO" : "REST"}
                  </span>
                )}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── ToolkitPanel ──────────────────────────────────────────────────────────────

/** Rest-interval presets rendered from the lib's science defaults. */
const REST_KINDS: { kind: RestKind; title: string }[] = [
  { kind: "compound", title: "COMPOUND" },
  { kind: "isolation", title: "ISOLATION" },
  { kind: "default", title: "STANDARD" },
]

/** Percentage chips under the 1RM readout. */
const RM_PCTS = [70, 75, 80, 85, 90, 95]

/** RPE rows for the compact reference table (RIR derived via rpeToRir). */
const RPE_ROWS = [10, 9, 8, 7, 6] as const
const RPE_NOTES: Record<number, string> = {
  10: "NOTHING LEFT — MAX",
  9: "1 IN THE TANK",
  8: "2 LEFT — GROWTH ZONE",
  7: "3 LEFT — SPEED",
  6: "4 LEFT — TECHNICAL",
}

/**
 * Plate colors — task spec ramp applied BY MAGNITUDE RANK so kg and lb share
 * one sequence: kg 25/20/15/10/5/2.5/1.25 → teal/violet/fuchsia/amber/emerald/
 * rose/zinc-500; the lb denominations (45/35/25/10/5/2.5) reuse the same ramp
 * from its head. Every tone stays inside the app palette.
 */
const PLATE_TONE_KG: Record<number, string> = {
  25: "bg-teal-500/80",
  20: "bg-violet-500/80",
  15: "bg-fuchsia-500/80",
  10: "bg-amber-500/80",
  5: "bg-emerald-500/80",
  2.5: "bg-rose-500/80",
  1.25: "bg-zinc-500/80",
}
const PLATE_TONE_LB: Record<number, string> = {
  45: "bg-teal-500/80",
  35: "bg-violet-500/80",
  25: "bg-fuchsia-500/80",
  10: "bg-amber-500/80",
  5: "bg-emerald-500/80",
  2.5: "bg-rose-500/80",
}

export function ToolkitPanel() {
  const startRest = useRestTimer((s) => s.start)

  // ── 1RM estimator ──
  const [rmWeight, setRmWeight] = useState(100)
  const [rmReps, setRmReps] = useState(5)
  const oneRm = useMemo(() => estimate1RM(rmWeight, rmReps), [rmWeight, rmReps])
  const pctRows = useMemo(() => {
    if (oneRm === null) return []
    return RM_PCTS.map((pct) => ({ pct, weight: loadableKg((oneRm * pct) / 100) }))
  }, [oneRm])

  // ── warm-up generator (unit-aware ramp) ──
  const [wuUnit, setWuUnit] = useState<PlateMode>("kg")
  const [wuWeight, setWuWeight] = useState(100)
  const wuSets = useMemo(
    () => warmupSets(wuWeight, wuUnit === "lb" ? { bar: LB_BAR, step: 5 } : undefined),
    [wuWeight, wuUnit],
  )

  // ── plate calculator ──
  const [plUnit, setPlUnit] = useState<PlateMode>("kg")
  const [plTarget, setPlTarget] = useState(100)
  const plates = useMemo(() => plateBreakdown(plTarget, { mode: plUnit }), [plTarget, plUnit])
  // nearest loadable total when the exact target can't be built (kg steps in
  // 2.5 — the smallest pair; lb steps in 5 — the 2.5-per-side pair)
  const nearest = useMemo(() => {
    if (plates !== null) return null
    const bar = plUnit === "lb" ? LB_BAR : KG_BAR
    if (!Number.isFinite(plTarget) || plTarget < bar) return bar
    const step = plUnit === "lb" ? 5 : 2.5
    const lo = bar + Math.floor((plTarget - bar) / step) * step
    const hi = bar + Math.ceil((plTarget - bar) / step) * step
    return plTarget - lo <= hi - plTarget ? lo : hi
  }, [plates, plTarget, plUnit])
  const shownPlates = useMemo(() => {
    if (plates !== null) return plates
    if (nearest === null) return []
    return plateBreakdown(nearest, { mode: plUnit }) ?? []
  }, [plates, nearest, plUnit])

  const bar = plUnit === "lb" ? LB_BAR : KG_BAR
  const maxPlate = plUnit === "lb" ? 45 : 25
  const toneMap = plUnit === "lb" ? PLATE_TONE_LB : PLATE_TONE_KG
  const exact = plates !== null
  const shownTarget = exact ? plTarget : (nearest ?? bar)

  const inputCls =
    "mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm tabular-nums text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"

  return (
    <SystemPanel
      label="Training Toolkit"
      labelAccent={
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-zinc-400">
          <Calculator className="h-3 w-3 text-teal-400/70" aria-hidden /> LIFTING MATH
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          The coaching math behind every raid — estimate your max, ramp to the working set, load the
          bar exactly and read your effort. Everything computes on-device;{" "}
          <span className="text-violet-300">nothing leaves the phone.</span>
        </p>

        {/* ── rest timer entry ── */}
        <div className="mt-4">
          <ToolHead icon={Timer} title="REST TIMER" note="SCHOENFELD 2016" />
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {REST_KINDS.map(({ kind, title }) => {
              const secs = restSeconds(kind)
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => startRest(secs)}
                  aria-label={`Start ${title.toLowerCase()} rest timer — ${fmtClock(secs)}`}
                  className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-sm border border-teal-500/40 bg-teal-500/10 px-2 py-1.5 transition-all hover:border-teal-400/70 hover:bg-teal-500/20 active:bg-teal-500/30 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <span className="font-mono text-[9px] font-bold tracking-[0.15em] text-teal-300">
                    {title}
                  </span>
                  <span className="font-mono text-[11px] font-bold tabular-nums text-teal-200">
                    {fmtClock(secs)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
            Arms the floating rest clock — it follows you across tabs, even mid-raid. Compounds want
            3 min, isolation 90 s.
          </p>
        </div>

        {/* ── 1RM estimator ── */}
        <div className="mt-5 border-t border-zinc-800/60 pt-4">
          <ToolHead icon={Gauge} title="1RM ESTIMATOR" note="EPLEY 1985" />
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <SysLabel>WEIGHT (KG)</SysLabel>
              <Input
                type="number"
                min={0}
                step={2.5}
                inputMode="decimal"
                value={rmWeight}
                onChange={(e) => setRmWeight(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </label>
            <label className="block min-w-0">
              <SysLabel>REPS (1–12)</SysLabel>
              <Input
                type="number"
                min={1}
                max={12}
                step={1}
                inputMode="numeric"
                value={rmReps}
                onChange={(e) => setRmReps(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </label>
          </div>

          {oneRm === null ? (
            <div className="mt-3 rounded-sm border border-dashed border-zinc-700/60 py-5 text-center">
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-400">
                ENTER A SET OF 1–12 REPS
              </p>
              <p className="mt-1 font-mono text-[9px] tracking-[0.15em] text-zinc-400">
                THE FORMULA&apos;S ACCURACY DECAYS PAST A DOZEN
              </p>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-baseline justify-between gap-2 rounded-sm border border-violet-500/20 bg-violet-500/5 px-4 py-3">
                <span className="font-mono text-3xl font-bold tabular-nums text-glow-violet text-violet-200">
                  {fmtW(oneRm)}
                </span>
                <span className="shrink-0 font-mono text-[9px] tracking-[0.2em] text-zinc-400">
                  KG · EPLEY 1RM
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                {pctRows.map((r) => (
                  <div
                    key={r.pct}
                    title={`${r.pct}% of ${fmtW(oneRm)} kg, snapped to the nearest loadable 2.5 kg`}
                    className="flex items-baseline justify-between gap-2 rounded-sm border border-zinc-800/60 bg-zinc-950/40 px-2.5 py-1.5"
                  >
                    <span className="font-mono text-[10px] tabular-nums text-zinc-400">{r.pct}%</span>
                    <span className="font-mono text-xs font-bold tabular-nums text-zinc-200">
                      {fmtW(r.weight)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── warm-up generator ── */}
        <div className="mt-5 border-t border-zinc-800/60 pt-4">
          <ToolHead icon={TrendingUp} title="WARM-UP GENERATOR" note="MCGOWAN 2015" />
          <div className="mt-2 flex items-end gap-3">
            <label className="block min-w-0 flex-1">
              <SysLabel>WORKING WEIGHT ({wuUnit.toUpperCase()})</SysLabel>
              <Input
                type="number"
                min={0}
                step={wuUnit === "lb" ? 5 : 2.5}
                inputMode="decimal"
                value={wuWeight}
                onChange={(e) => setWuWeight(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </label>
            <UnitToggle
              value={wuUnit}
              onChange={setWuUnit}
              ariaLabel="Warm-up generator unit — kilograms or pounds"
            />
          </div>

          {wuSets.length === 0 ? (
            <div className="mt-3 rounded-sm border border-dashed border-zinc-700/60 py-5 text-center">
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-400">
                {wuUnit === "lb" ? "AT OR BELOW THE 45 LB BAR" : "AT OR BELOW THE 20 KG BAR"}
              </p>
              <p className="mt-1 font-mono text-[9px] tracking-[0.15em] text-zinc-400">
                NO BARBELL RAMP TO GENERATE
              </p>
            </div>
          ) : (
            <div className="mt-2.5" role="list" aria-label="Warm-up ramp to the working weight">
              {wuSets.map((s, i) => (
                <div
                  key={`${s.label}-${i}`}
                  role="listitem"
                  aria-label={`${s.label} set — ${fmtW(s.weight)} ${wuUnit} for ${s.reps} reps`}
                  className="flex items-baseline gap-x-3 border-b border-zinc-800/40 py-1.5 last:border-b-0"
                >
                  <span
                    className={cn(
                      "w-11 shrink-0 font-mono text-[10px] font-bold tracking-[0.15em]",
                      s.pct === null ? "text-teal-300" : "text-zinc-400",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums text-zinc-200">
                    {fmtW(s.weight)} {wuUnit.toUpperCase()}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-violet-300">
                    × {s.reps} REPS
                  </span>
                </div>
              ))}
              <p className="mt-2 font-mono text-[9px] tracking-[0.15em] text-zinc-400">
                RAMP RUNGS SNAPPED TO THE NEAREST LOADABLE{" "}
                {wuUnit === "lb" ? "5 LB (2.5/SIDE)" : "2.5 KG (1.25/SIDE)"}
              </p>
            </div>
          )}
        </div>

        {/* ── plate calculator ── */}
        <div className="mt-5 border-t border-zinc-800/60 pt-4">
          <ToolHead icon={Layers} title="PLATE CALCULATOR" note={exact ? "EXACT" : "NEAREST"} />
          <div className="mt-2 flex items-end gap-3">
            <label className="block min-w-0 flex-1">
              <SysLabel>TARGET ({plUnit.toUpperCase()})</SysLabel>
              <Input
                type="number"
                min={0}
                step={plUnit === "lb" ? 5 : 2.5}
                inputMode="decimal"
                value={plTarget}
                onChange={(e) => setPlTarget(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </label>
            <UnitToggle
              value={plUnit}
              onChange={setPlUnit}
              ariaLabel="Plate calculator unit — kilograms or pounds"
            />
          </div>

          {!exact && (
            <div className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2.5" role="alert">
              <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-amber-300">
                CANNOT LOAD EXACTLY
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                Nearest loadable is{" "}
                <span className="font-mono font-bold text-amber-200">
                  {fmtW(nearest ?? bar)} {plUnit}
                </span>{" "}
                — shown below.
              </p>
            </div>
          )}

          <div className="mt-3">
            <SysLabel>
              PER SIDE — {fmtW(shownTarget)} {plUnit.toUpperCase()}
              {!exact && " (NEAREST)"}
            </SysLabel>
            {/* visual sleeve: colored plate rectangles, width ∝ plate weight */}
            <div
              className="scroll-sys mt-2 flex items-center gap-1.5 overflow-x-auto pb-1.5"
              aria-label="Per-side plate stack, widest plate first"
            >
              <div
                className="h-1.5 w-12 shrink-0 rounded-sm bg-gradient-to-r from-zinc-700 to-zinc-600"
                aria-hidden
              />
              {shownPlates.map((p, i) => (
                <div
                  key={`${p}-${i}`}
                  className={cn("h-11 shrink-0 rounded-sm", toneMap[p] ?? "bg-zinc-600")}
                  style={{ width: `${Math.max(12, Math.round((p / maxPlate) * 56))}px` }}
                  title={`${fmtW(p)} ${plUnit} plate`}
                  aria-hidden
                />
              ))}
              <div className="h-1.5 w-4 shrink-0 rounded-sm bg-zinc-700" aria-hidden />
            </div>
            <p className="mt-1.5 font-mono text-[10px] tracking-[0.15em] text-zinc-400">
              PER SIDE:{" "}
              <span className="text-zinc-300">
                {shownPlates.length === 0
                  ? "NO PLATES — BARE BAR"
                  : shownPlates.map((p) => fmtW(p)).join(" · ")}
              </span>
              <span className="text-zinc-400">
                {" "}
                · {fmtW(Math.max(0, (shownTarget - bar) / 2))} {plUnit.toUpperCase()}/SIDE
              </span>
            </p>
          </div>
        </div>

        {/* ── RPE ↔ RIR reference ── */}
        <div className="mt-5 border-t border-zinc-800/60 pt-4">
          <ToolHead icon={Activity} title="RPE ↔ RIR" note="ZOURDOS 2016" />
          <div className="mt-2" role="list" aria-label="RPE to reps-in-reserve reference">
            {RPE_ROWS.map((rpe) => {
              const rir = rpeToRir(rpe)
              return (
                <div
                  key={rpe}
                  role="listitem"
                  className="flex items-baseline gap-x-2.5 border-b border-zinc-800/40 py-1.5 last:border-b-0"
                >
                  <span className="w-14 shrink-0 font-mono text-[10px] font-bold tabular-nums text-violet-300">
                    RPE {rpe}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400" aria-hidden>
                    →
                  </span>
                  <span className="w-16 shrink-0 font-mono text-[10px] font-bold tabular-nums text-teal-300">
                    RIR {rir}
                  </span>
                  <span className="ml-auto min-w-0 truncate text-right font-mono text-[9px] tracking-[0.12em] text-zinc-400">
                    {RPE_NOTES[rpe]}
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
            RIR = reps in reserve. Most working sets belong at{" "}
            <span className="text-violet-300">RPE 7–10 (3–0 reps left)</span> — heavy enough to
            count, honest enough to repeat.
          </p>
        </div>

        {/* citations footer — the evidence-footer idiom */}
        <p className="sys-label mt-4 border-t border-zinc-800/60 pt-3 text-[9px] leading-relaxed text-zinc-400">
          <span className="mr-1 text-teal-400/80" aria-hidden>
            »
          </span>
          Epley 1985 (1RM) · Schoenfeld et al. 2016 JSCR (rest) · McGowan et al. 2015 Sports Med
          (warm-ups) · Zourdos et al. 2016 JSCR (RPE↔RIR). Estimates, not edicts — leave a rep in
          reserve and let the bar vote.
        </p>
      </div>
    </SystemPanel>
  )
}
