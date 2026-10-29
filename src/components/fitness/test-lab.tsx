"use client"

// ─── FITNESS TESTING LAB (Vitals tab · bottom section) ────────────────────────
// Science-based self-tests with norms + history: 5 protocols (Cooper run,
// Rockport walk, push-up, plank, sit & reach), live VO₂ band preview, commits
// to POST /api/metrics and per-metric history with Δ trends + charts.
// R15-b (FLOW ROUND 2): protocol cards + metric blocks rise per slot on
// scroll-in, selecting a protocol cascades its steps in (genuine mount via
// the panel key), the live-result box rises when it first materializes,
// latest values count up, and a live commit breathes the metric block it
// updated.
// R55-b (DECLUTTER ROUND 2 — the density bar): second pass — picker cards
// lose the per-card metric sublabel (it rides the card title next to the
// summary) and the RUN chip shortens; the history empty state quiets to one
// short line. Merge & hide — every protocol, norm, citation and flow stays.

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion, type MotionProps } from "framer-motion"
import {
  FlaskConical,
  Footprints,
  Gauge,
  Loader2,
  PersonStanding,
  RotateCcw,
  Ruler,
  ShieldAlert,
  StretchHorizontal,
  Timer,
} from "lucide-react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { FLOW_EASE, pulseBreathe, useCountUp } from "@/components/system/motion"
import { Input } from "@/components/ui/input"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { formatDayLabel } from "@/lib/game"
import {
  CRF_CONTEXT,
  TESTS,
  TEST_METRIC_RANGES,
  cooperVo2,
  plankBand,
  pushupBand,
  rockportVo2,
  sitReachBand,
  vo2Band,
  type BandResult,
  type Sex,
  type TestId,
} from "@/lib/tests"
import { cn } from "@/lib/utils"

// ─── types ────────────────────────────────────────────────────────────────────

type MetricsProfile = {
  heightCm: number | null
  weightKg: number | null
  birthYear: number | null
  sex: string | null
  activityLevel: string | null
  goal: string | null
}

type MetricsRes = {
  profile: MetricsProfile
  latest: Record<string, { value: number; day: string; unit: string } | null>
  series: Record<string, { day: string; value: number }[]>
}

type Computed = {
  /** Value to commit to /api/metrics. */
  value: number
  /** Formatted display value, e.g. "51.3". */
  display: string
  band: BandResult
  isVo2: boolean
}

type HistoryMetric = {
  type: string
  name: string
  unit: string
  icon: React.ComponentType<{ className?: string }>
}

const HISTORY_METRICS: readonly HistoryMetric[] = [
  { type: "vo2max", name: "VO₂ Max", unit: "ml/kg/min", icon: Gauge },
  { type: "pushupReps", name: "Push-Ups", unit: "reps", icon: PersonStanding },
  { type: "plankSec", name: "Plank Hold", unit: "s", icon: StretchHorizontal },
  { type: "sitReachCm", name: "Sit & Reach", unit: "cm", icon: Ruler },
]

const TEST_ICONS: Record<TestId, React.ComponentType<{ className?: string }>> = {
  cooper: Timer,
  rockport: Footprints,
  pushup: PersonStanding,
  plank: StretchHorizontal,
  sitreach: Ruler,
}

const METRIC_TYPE_LABEL: Record<string, string> = {
  vo2max: "VO₂ MAX",
  pushupReps: "PUSH-UPS",
  plankSec: "PLANK",
  sitReachCm: "SIT & REACH",
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseNum(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

/** Band label → chip color tone (emerald top, teal good, amber mid, rose low). */
function bandTone(label: string): string {
  switch (label) {
    case "Superior":
    case "Excellent":
      return "border-emerald-400/50 bg-emerald-500/10 text-emerald-300"
    case "Good":
      return "border-teal-400/50 bg-teal-500/10 text-teal-300"
    case "Average":
    case "Fair":
      return "border-amber-400/50 bg-amber-500/10 text-amber-300"
    default:
      return "border-rose-400/50 bg-rose-500/10 text-rose-300"
  }
}

function BandChip({ band, className, title }: { band: BandResult; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
        bandTone(band.label),
        className
      )}
    >
      {band.label.toUpperCase()}
      {band.pct != null && <span className="ml-1 opacity-70">≈P{band.pct}</span>}
    </span>
  )
}

function LabTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  unit: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-3 py-2">
      <p className="sys-label text-[9px] text-zinc-400">{label ? formatDayLabel(label) : ""}</p>
      <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-violet-300">
        {payload[0].value} {unit}
      </p>
    </div>
  )
}

/** Δ vs previous entry — up = improving for all four lab metrics. */
function DeltaBadge({ delta, unit }: { delta: number | null; unit: string }) {
  if (delta == null) {
    return (
      <span className="font-mono text-[10px] tracking-widest text-zinc-400">– NO PRIOR</span>
    )
  }
  const r = round1(delta)
  if (Math.abs(r) < 0.05) {
    return (
      <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
        – FLAT (+0 {unit})
      </span>
    )
  }
  if (r > 0) {
    return (
      <span className="font-mono text-[10px] tabular-nums tracking-widest text-emerald-400">
        ▲ +{r} {unit}
      </span>
    )
  }
  return (
    <span className="font-mono text-[10px] tabular-nums tracking-widest text-rose-400">
      ▼ {r} {unit}
    </span>
  )
}

// ─── R15-b flow helpers ───────────────────────────────────────────────────────

/** Count-up numeral for the history latest values — mounts from 0, glides on
 *  live refresh (a commit reloads metrics on camera); tenths stay honest for
 *  VO₂ / sit-reach, integers render integer. */
function CountNum({ value, decimals }: { value: number; decimals?: number }) {
  const shown = useCountUp(value, 0.9)
  const d = decimals ?? (Number.isInteger(value) ? 0 : 1)
  return <span>{shown.toFixed(d)}</span>
}

/** Scroll-in rise props for below-fold blocks — whileInView (once, ~8% into
 *  the viewport), 0.45s FLOW_EASE, delay min(i,8)·0.05; reduced motion →
 *  duration 0 (renders final state). */
function riseInView(reduce: boolean, i: number): MotionProps {
  return {
    initial: reduce ? false : { opacity: 0, y: 10 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-8% 0px" },
    transition: reduce ? { duration: 0 } : { duration: 0.45, ease: FLOW_EASE, delay: Math.min(i, 8) * 0.05 },
  }
}

// ─── main component ───────────────────────────────────────────────────────────

export function TestLab() {
  const { data, error, loading, reload } = useApi<MetricsRes>("/api/metrics")
  const { pushNotice, bumpRefresh } = useSystem()
  const reduce = !!useReducedMotion()

  const [selected, setSelected] = useState<TestId | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const touchedRef = useRef(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const test = useMemo(() => (selected ? TESTS.find((t) => t.id === selected) : undefined), [selected])

  // Prefill age/sex/weight from the profile (until the user edits anything).
  useEffect(() => {
    if (!data || touchedRef.current) return
    const year = new Date().getFullYear()
    const age = data.profile.birthYear ? year - data.profile.birthYear : 30
    setForm((prev) => ({
      ...prev,
      age: prev.age !== "" && prev.age !== undefined ? prev.age : String(Math.min(90, Math.max(10, age))),
      sex: prev.sex !== "" && prev.sex !== undefined ? prev.sex : data.profile.sex === "female" ? "female" : "male",
      weightKg:
        prev.weightKg !== "" && prev.weightKg !== undefined
          ? prev.weightKg
          : data.profile.weightKg != null
            ? String(data.profile.weightKg)
            : "",
    }))
  }, [data])

  const formSex: Sex = form.sex === "female" ? "female" : "male"
  const formAge = parseNum(form.age) ?? 30

  // Live guard errors while typing (distance / minutes / hr ranges).
  const guardError = useMemo<string | null>(() => {
    switch (selected) {
      case "cooper": {
        const d = parseNum(form.distanceM)
        return d != null && (d < 400 || d > 5000) ? "Distance must be between 400 and 5000 m." : null
      }
      case "rockport": {
        const m = parseNum(form.minutes)
        if (m != null && (m < 8 || m > 40)) return "Walk time must be between 8 and 40 minutes."
        const hr = parseNum(form.hr)
        if (hr != null && (hr < 80 || hr > 200)) return "Post-walk heart rate must be between 80 and 200 bpm."
        return null
      }
      default:
        return null
    }
  }, [selected, form])

  // Live computed result — the number + band that a commit would store.
  const computed = useMemo<Computed | null>(() => {
    if (!selected) return null
    switch (selected) {
      case "cooper": {
        const d = parseNum(form.distanceM)
        if (d == null) return null
        const vo2 = cooperVo2(d)
        if (vo2 == null) return null
        return { value: round1(vo2), display: vo2.toFixed(1), band: vo2Band(vo2, formAge, formSex), isVo2: true }
      }
      case "rockport": {
        const minutes = parseNum(form.minutes)
        const hr = parseNum(form.hr)
        const weightKg = parseNum(form.weightKg)
        if (minutes == null || hr == null || weightKg == null) return null
        const vo2 = rockportVo2({ weightKg, age: formAge, male: formSex === "male", minutes, hr })
        if (vo2 == null) return null
        return { value: round1(vo2), display: vo2.toFixed(1), band: vo2Band(vo2, formAge, formSex), isVo2: true }
      }
      case "pushup": {
        const reps = parseNum(form.reps)
        if (reps == null) return null
        const r = Math.round(reps)
        return { value: r, display: String(r), band: pushupBand(r, formAge, formSex), isVo2: false }
      }
      case "plank": {
        const sec = parseNum(form.seconds)
        if (sec == null) return null
        const s = Math.round(sec)
        return { value: s, display: String(s), band: plankBand(s, formSex), isVo2: false }
      }
      case "sitreach": {
        const cm = parseNum(form.cm)
        if (cm == null) return null
        const c = round1(cm)
        return { value: c, display: String(c), band: sitReachBand(cm, formSex), isVo2: false }
      }
    }
  }, [selected, form, formAge, formSex])

  function selectTest(id: TestId) {
    setSelected(id)
    setCommitError(null)
    // keep the prefilled context fields, clear measurement inputs
    setForm((prev) => {
      const keep: Record<string, string> = {}
      for (const k of ["age", "sex", "weightKg"]) if (prev[k] !== undefined) keep[k] = prev[k]
      return keep
    })
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }

  function setField(key: string, value: string) {
    touchedRef.current = true
    setCommitError(null)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function commit() {
    if (!test || !computed) return
    const range = TEST_METRIC_RANGES[test.metricType]
    if (computed.value < range.min || computed.value > range.max) {
      setCommitError(range.message)
      return
    }
    setCommitting(true)
    setCommitError(null)
    try {
      await api("/api/metrics", {
        method: "POST",
        body: JSON.stringify({ type: test.metricType, value: computed.value }),
      })
      pushNotice({
        kind: "info",
        title: `Test logged · ${test.name} — ${computed.display} ${test.unit}`,
      })
      reload()
      bumpRefresh()
    } catch (e) {
      setCommitError((e as Error).message)
    } finally {
      setCommitting(false)
    }
  }

  // ─── render ─────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return <SkeletonPanel label="CALIBRATING TEST LAB" rows={2} />
  }

  if (error && !data) {
    return (
      <SystemPanel label="Fitness Testing Lab">
        <div className="p-6 text-center">
          <p className="font-mono text-xs tracking-widest text-rose-400">LAB LINK FAILED</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">{error.toUpperCase()}</p>
          <button
            onClick={() => reload()}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/15 px-5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> RETRY
          </button>
        </div>
      </SystemPanel>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1 · test picker ── */}
      <SystemPanel
        label="Test Picker"
        labelAccent={
          <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
            {TESTS.length} PROTOCOLS
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          {TESTS.map((t, i) => {
            const Icon = TEST_ICONS[t.id]
            const active = selected === t.id
            // R15-b — protocol cards rise per slot when scrolled into view
            // (the lab sits at the tab's deep tail, so the stagger waits for
            // the reader); motion rides the existing button, and its CSS
            // transition is scoped to color props so framer's transform
            // isn't CSS-tweened (R14-b stat-grid lesson).
            return (
              <motion.button
                key={t.id}
                type="button"
                onClick={() => selectTest(t.id)}
                aria-pressed={active}
                title={`${t.summary} · logs ${METRIC_TYPE_LABEL[t.metricType]}`}
                {...riseInView(reduce, i)}
                className={cn(
                  "group flex min-h-11 flex-col gap-2.5 rounded-sm border p-4 text-left transition-[color,background-color,border-color,box-shadow,opacity] focus-visible:outline focus-visible:outline-violet-400/70",
                  active
                    ? "border-violet-400/70 bg-violet-500/10 shadow-[0_0_18px_rgba(139,92,246,0.25)]"
                    : "border-zinc-700/60 bg-zinc-950/40 hover:border-violet-500/40 hover:bg-violet-500/5"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-sm border",
                      active
                        ? "border-violet-400/60 bg-violet-500/15 text-violet-300"
                        : "border-zinc-700/60 bg-zinc-950/60 text-zinc-400 group-hover:text-violet-300"
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-xs font-medium", active ? "text-violet-200" : "text-zinc-200")}>
                      {t.name}
                    </p>
                  </div>
                  {active && (
                    <span className="shrink-0 font-mono text-[9px] font-bold tracking-[0.2em] text-violet-300">
                      ◆ ACTIVE
                    </span>
                  )}
                </div>
                {/* R53-b declutter — the per-card summary prose stands down
                    (it rides the card's title attribute); R55-b folds the
                    per-card metric label into that same title. The protocol
                    steps + safety banner still render on demand once
                    selected. */}
                <span
                  className={cn(
                    "mt-auto inline-flex min-h-9 w-fit items-center rounded-sm border px-3 font-mono text-[9px] font-bold tracking-[0.25em] transition-colors",
                    active
                      ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                      : "border-zinc-700/60 bg-zinc-900/50 text-zinc-400 group-hover:border-violet-400/50 group-hover:text-violet-300"
                  )}
                >
                  {active ? "RUNNING…" : "RUN ▸"}
                </span>
              </motion.button>
            )
          })}
        </div>
      </SystemPanel>

      {/* ── 2 · test panel ── */}
      <div ref={panelRef}>
        {!test ? (
          <SystemPanel label="Test Panel">
            <div className="p-6 text-center sm:p-8">
              <FlaskConical className="mx-auto h-6 w-6 text-violet-300/60" aria-hidden />
              {/* R53-b declutter — the two-line empty state became one quiet line. */}
              <p className="mt-3 font-mono text-xs tracking-widest text-zinc-400">Choose a test above to begin.</p>
            </div>
          </SystemPanel>
        ) : (
          // R15-b — keyed by test id so each selection is a genuine mount:
          // the protocol steps cascade in fresh on every protocol switch.
          <SystemPanel
            key={test.id}
            label={test.name}
            labelAccent={
              <span className="font-mono text-[10px] tracking-widest text-zinc-400">
                {METRIC_TYPE_LABEL[test.metricType]} · {test.unit}
              </span>
            }
          >
            <div className="p-4 pt-5 sm:p-5">
              {/* safety banner */}
              <div className="flex gap-2.5 rounded-sm border border-rose-500/30 bg-rose-500/10 p-3">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" aria-hidden />
                <p className="text-[11px] leading-relaxed text-rose-200/80">{test.safety}</p>
              </div>

              {/* protocol steps — R15-b: steps cascade in on every panel mount
                  (fresh per protocol selection via the SystemPanel key) */}
              <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {test.protocol.map((step, i) => (
                  <motion.li
                    key={i}
                    className="flex gap-2.5"
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.45, ease: FLOW_EASE, delay: Math.min(i, 8) * 0.05 }}
                  >
                    <span
                      className="shrink-0 rounded-sm border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-violet-300"
                      aria-hidden
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-[11px] leading-relaxed text-zinc-400">{step}</p>
                  </motion.li>
                ))}
              </ol>

              {/* inputs */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {test.fields.map((field) => {
                  if (field.kind === "sex") {
                    return (
                      <div key={field.key} className="min-w-0">
                        <p className="sys-label text-[8px] text-zinc-400">{field.label.toUpperCase()} · FOR NORMS</p>
                        <div
                          className="mt-1 grid grid-cols-2 gap-1.5"
                          role="radiogroup"
                          aria-label="Sex for norm bands"
                        >
                          {(["male", "female"] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={formSex === s}
                              onClick={() => setField("sex", s)}
                              className={cn(
                                "min-h-11 rounded-sm border font-mono text-[9px] font-bold tracking-[0.2em] transition-all focus-visible:outline focus-visible:outline-violet-400/70",
                                formSex === s
                                  ? "border-violet-400/60 bg-violet-500/20 text-violet-200"
                                  : "border-zinc-700/60 bg-zinc-950/40 text-zinc-400 hover:border-violet-500/40 hover:text-zinc-300"
                              )}
                            >
                              {s.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  }
                  const id = `test-${test.id}-${field.key}`
                  return (
                    <div key={field.key} className="min-w-0">
                      <label htmlFor={id} className="sys-label block truncate text-[8px] text-zinc-400">
                        {field.label.toUpperCase()}
                      </label>
                      <div className="relative mt-1">
                        <Input
                          id={id}
                          type="number"
                          inputMode="decimal"
                          step={field.step ?? 1}
                          value={form[field.key] ?? ""}
                          onChange={(e) => setField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="h-11 rounded-sm border-zinc-600/70 bg-zinc-900/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] pr-12 font-mono text-sm tabular-nums text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
                        />
                        {field.unit && (
                          <span
                            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-widest text-zinc-400"
                            aria-hidden
                          >
                            {field.unit.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {guardError && (
                <p role="alert" className="mt-3 font-mono text-[10px] tracking-widest text-rose-400">
                  ⚠ {guardError.toUpperCase()}
                </p>
              )}

              {/* live computed result — R15-b: the box rises once when a valid
                  live result first materializes (a genuine mount on camera);
                  later keystroke updates keep it settled (no re-animation) */}
              {computed && (
                <motion.div
                  className="mt-4 rounded-sm border border-violet-500/30 bg-violet-500/5 p-4"
                  aria-live="polite"
                  title={
                    /* R53-b declutter — the band source, sex/age context and
                       the ACSM cardio context ride this box's title. */
                    `${computed.band.source}${test.id === "plank" || test.id === "sitreach" ? "" : ` · ${formSex.toUpperCase()} · ${formAge}Y`}${computed.isVo2 ? ` — ${CRF_CONTEXT}` : ""}`
                  }
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.45, ease: FLOW_EASE }}
                >
                  <p className="sys-label text-[8px] text-zinc-400">
                    {computed.isVo2 ? "ESTIMATED VO₂ MAX" : "RESULT"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <p className="font-mono text-2xl font-bold tabular-nums text-violet-200">
                      {computed.isVo2 && "≈"}
                      {computed.display}
                    </p>
                    <span className="font-mono text-[10px] tracking-widest text-zinc-400">
                      {test.unit.toUpperCase()}
                    </span>
                    <BandChip band={computed.band} />
                  </div>
                </motion.div>
              )}

              {/* commit — R53-b: the "stores … · today · latest-wins" note and
                  the SOURCE citation line ride the button's title. */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void commit()}
                  disabled={!computed || committing}
                  title={`Stores ${METRIC_TYPE_LABEL[test.metricType]} · today · latest-wins — ${test.citation}`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/15 px-5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 transition-all hover:bg-violet-500/25 hover:shadow-[0_0_18px_rgba(139,92,246,0.35)] active:bg-violet-500/35 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {committing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                  COMMIT RESULT
                </button>
              </div>
              {commitError && (
                <p role="alert" className="mt-3 font-mono text-[10px] tracking-widest text-rose-400">
                  ⚠ {commitError.toUpperCase()}
                </p>
              )}
            </div>
          </SystemPanel>
        )}
      </div>

      {/* ── 3 · history & trends ── */}
      <HistoryPanel data={data} />
    </div>
  )
}

// ─── history & trends ─────────────────────────────────────────────────────────

function HistoryPanel({ data }: { data: MetricsRes | null }) {
  const reduce = !!useReducedMotion()

  // R15-b live-moment breathe — committing a test reloads metrics on camera;
  // when a metric's LATEST value changes while its block is mounted, that
  // block's surface breathes once (1.02, 0.45s). First data land / fresh
  // blocks never pulse (prev seeds undefined); reduced motion stands down
  // entirely. Refs + imperative animate() — no setState-in-effect.
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevLatestRef = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    if (!data) return
    for (const m of HISTORY_METRICS) {
      const series = data.series?.[m.type] ?? []
      const latest = series.length > 0 ? series[series.length - 1] : null
      if (!latest) continue
      const prev = prevLatestRef.current.get(m.type)
      if (prev !== undefined && prev !== latest.value && !reduce) {
        const el = blockRefs.current.get(m.type)
        if (el) void pulseBreathe(el)
      }
      prevLatestRef.current.set(m.type, latest.value)
    }
  }, [data, reduce])

  const year = new Date().getFullYear()
  const normAge = data?.profile.birthYear ? year - data.profile.birthYear : 30
  const normSex: Sex = data?.profile.sex === "female" ? "female" : "male"

  const blocks = HISTORY_METRICS.map((m) => {
    const series = data?.series?.[m.type] ?? []
    const latest = series.length > 0 ? series[series.length - 1] : null
    const prev = series.length > 1 ? series[series.length - 2] : null
    let band: BandResult | null = null
    if (latest) {
      switch (m.type) {
        case "vo2max":
          band = vo2Band(latest.value, normAge, normSex)
          break
        case "pushupReps":
          band = pushupBand(latest.value, normAge, normSex)
          break
        case "plankSec":
          band = plankBand(latest.value, normSex)
          break
        case "sitReachCm":
          band = sitReachBand(latest.value, normSex)
          break
      }
    }
    const delta = latest && prev ? latest.value - prev.value : null
    return { metric: m, series, latest, band, delta }
  }).filter((b) => b.series.length > 0)

  const totalEntries = blocks.reduce((n, b) => n + b.series.length, 0)

  return (
    <SystemPanel
      label="History & Trends"
      labelAccent={
        <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          {totalEntries} {totalEntries === 1 ? "ENTRY" : "ENTRIES"}
        </span>
      }
    >
      <div className="p-4 pt-5 sm:p-5">
        {blocks.length === 0 ? (
          <div className="py-6 text-center">
            <EmptyGlyph className="mx-auto h-20 w-20" />
            {/* R53-b declutter — the two-line empty state became one quiet line. */}
            <p
              className="mt-3 font-mono text-xs tracking-widest text-zinc-400"
              title="Run a protocol above to begin logging."
            >
              No tests recorded yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {blocks.map(({ metric, series, latest, band, delta }, idx) => (
              // R15-b — metric blocks rise per slot on scroll-in; the ref
              // feeds the live-commit breathe above.
              <motion.div
                key={metric.type}
                ref={(el) => {
                  if (el) blockRefs.current.set(metric.type, el)
                  else blockRefs.current.delete(metric.type)
                }}
                {...riseInView(reduce, idx)}
                className="rounded-sm border border-zinc-700/50 bg-zinc-950/40 p-4 transition-colors hover:border-violet-500/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <metric.icon className="h-4 w-4 shrink-0 text-violet-300/70" aria-hidden />
                  <p className="text-xs font-medium text-zinc-200">{metric.name}</p>
                  <span className="sys-label text-[7px] text-zinc-400">LATEST</span>
                  <p className="ml-auto font-mono text-base font-bold tabular-nums text-violet-200">
                    {latest ? <CountNum value={latest.value} /> : "—"}
                    <span className="ml-1 text-[9px] font-normal tracking-widest text-zinc-400">
                      {metric.unit.toUpperCase()}
                    </span>
                  </p>
                  {band && (
                    /* R53-b — the band source + norms context ride the chip's title. */
                    <BandChip
                      band={band}
                      title={`${band.source}${metric.type === "vo2max" || metric.type === "pushupReps" ? ` · ${normSex} · ${normAge}y` : ""}`}
                    />
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="sys-label text-[7px] text-zinc-400" title="Change vs previous entry">
                    Δ
                  </span>
                  <DeltaBadge delta={delta} unit={metric.unit} />
                  <span className="ml-auto font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
                    {series.length} {series.length === 1 ? "ENTRY" : "ENTRIES"}
                  </span>
                </div>

                {series.length >= 2 && (
                  <div className="mt-3 h-20">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(167,139,250,0.08)" vertical={false} />
                        <XAxis
                          dataKey="day"
                          tickFormatter={(d: string) => formatDayLabel(d)}
                          tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                          axisLine={{ stroke: "rgba(167,139,250,0.15)" }}
                          tickLine={false}
                          interval="preserveStartEnd"
                          /* R56 — tick densification (hover Tooltip keeps
                           * every reading reachable). */
                          minTickGap={32}
                        />
                        <YAxis hide domain={yDomain(series)} width={0} />
                        <Tooltip
                          content={<LabTooltip unit={metric.unit} />}
                          cursor={{ stroke: "rgba(167,139,250,0.3)" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#6ee7b7"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "#a7f3d0", stroke: "#07060c", strokeWidth: 1 }}
                          activeDot={{ r: 4, fill: "#a7f3d0", stroke: "#07060c" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <ul className="scroll-sys mt-3 max-h-40 space-y-0.5 overflow-y-auto border-t border-zinc-800/60 pt-2">
                  {[...series]
                    .slice()
                    .reverse()
                    .map((e) => (
                      <li key={`${e.day}-${e.value}`} className="flex items-center justify-between font-mono text-[10px] tabular-nums">
                        <span className="text-zinc-400">{formatDayLabel(e.day).toUpperCase()}</span>
                        <span className="text-zinc-300">
                          {e.value}
                          <span className="ml-1 text-[8px] tracking-widest text-zinc-400">
                            {metric.unit.toUpperCase()}
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </SystemPanel>
  )
}

/** Padding-aware Y domain so 2-point charts don't degenerate into a flat line. */
function yDomain(series: { value: number }[]): [number, number] {
  const values = series.map((e) => e.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max(Math.abs(hi - lo) * 0.25, 1)
  return [lo - pad, hi + pad]
}
