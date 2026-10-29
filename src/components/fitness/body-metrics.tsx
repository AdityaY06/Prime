"use client"

// ── PRIME · Body metrics (Task 13-c) ──────────────────────────────────────────
// The METRICS view of the Body tab — Google-Fit-style body telemetry over
// /api/metrics: hunter-profile strip, weight trend + logger, semicircular BMI
// gauge, tape-measurement grid and a sleep logger with a 7-day bar chart.
// All writes go through POST /api/metrics (auto-completes the sleep goal at 7h+).
// R19-c — TREND WEIGHT: an exponentially-smoothed line (α 0.15) over the raw
// weigh-ins plus an honest weekly kg/week rate with speed-verdict bands —
// the MacroFactor / Happy Scale / Libra answer to ±1–2 kg daily water noise.

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { FlowGroup, FlowItem, useCountUp } from "@/components/system/motion"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Bone,
  Dumbbell,
  Footprints,
  Loader2,
  Minus,
  Moon,
  PersonStanding,
  Plus,
  Radius,
  Ruler,
  Shirt,
  Target,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { Input } from "@/components/ui/input"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { DEFAULT_PROFILE, METRIC_TYPES, waistToHeight, waistToHeightVerdict } from "@/lib/nutrition"
import { formatDayLabel } from "@/lib/game"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// ── Types (subset of the /api/metrics contract) ──────────────────────────────

type MetricPoint = { day: string; value: number }
type LatestVal = { value: number; day: string; unit: string } | null

type ProfileOut = {
  heightCm: number | null
  weightKg: number | null
  birthYear: number | null
  sex: string | null
  activityLevel: string | null
  goal: string | null
  isDefault: boolean
}

type MetricsRes = {
  profile: ProfileOut
  latest: Record<string, LatestVal>
  bmiCategory: string | null
  series: Record<string, MetricPoint[]>
}

type MetricPostRes = {
  metric: { day: string; type: string; value: number; unit: string }
  questCompleted?: boolean
}

// ── MetricGoal contract (GET/POST/DELETE /api/body/goal — R2-b) ────────────────

type MetricGoalDTO = {
  metric: string
  targetValue: number
  direction: "down" | "up"
  createdAt: string
}

type GoalListRes = { goals: MetricGoalDTO[] }

/** Direction-aware progress toward a goal from the metric's series. */
function goalProgress(goal: MetricGoalDTO, series: MetricPoint[]): { pct: number | null; remaining: number } {
  if (series.length === 0) return { pct: null, remaining: 0 }
  const latest = series[series.length - 1].value
  const target = goal.targetValue
  const remaining = Math.round((goal.direction === "down" ? latest - target : target - latest) * 10) / 10
  // start reference: earliest value logged on/after the goal was set, else the
  // earliest value in the window (honest fallback — never fabricated)
  const createdDay = goal.createdAt.slice(0, 10)
  const start = (series.find((p) => p.day >= createdDay) ?? series[0]).value
  const span = Math.abs(start - target)
  const traveled = goal.direction === "down" ? start - latest : latest - start
  const pct = span > 0 ? Math.round(Math.max(0, Math.min(1, traveled / span)) * 100) : null
  return { pct, remaining }
}

// ── Client-side validation (mirrors the server's per-type ranges) ─────────────

const CLIENT_RANGES: Record<string, { min: number; max: number; message: string }> = {
  weight: { min: 25, max: 300, message: "Weight must be between 25 and 300 kg." },
  chest: { min: 20, max: 250, message: "Chest must be between 20 and 250 cm." },
  waist: { min: 20, max: 250, message: "Waist must be between 20 and 250 cm." },
  hips: { min: 20, max: 250, message: "Hips must be between 20 and 250 cm." },
  // R68 — Navy body-fat tape input (audit 2-a B1): mirrors the server's
  // neck range (csv.ts importer parity) so the row is loggable from the grid.
  neck: { min: 20, max: 80, message: "Neck must be between 20 and 80 cm." },
  arm: { min: 20, max: 250, message: "Arm must be between 20 and 250 cm." },
  thigh: { min: 20, max: 250, message: "Thigh must be between 20 and 250 cm." },
  calf: { min: 20, max: 250, message: "Calf must be between 20 and 250 cm." },
  sleep: { min: 0, max: 16, message: "Sleep must be between 0 and 16 hours." },
}

const MEASUREMENTS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "chest", label: "Chest", icon: Shirt },
  { id: "waist", label: "Waist", icon: Ruler },
  { id: "hips", label: "Hips", icon: PersonStanding },
  // R68 — Navy tape input: without a logged neck the insights Navy body-fat
  // model can never run (missing:neck forever) — girth icon = Radius.
  { id: "neck", label: "Neck", icon: Radius },
  { id: "arm", label: "Arm", icon: Dumbbell },
  { id: "thigh", label: "Thigh", icon: Bone },
  { id: "calf", label: "Calf", icon: Footprints },
]

// ── BMI gauge geometry (arc spans BMI 14–40 across ~180°) ─────────────────────

const BMI_MIN = 14
const BMI_MAX = 40
const BMI_ZONES = [
  { from: 14, to: 18.5, color: "#fb7185" }, // underweight — rose
  { from: 18.5, to: 25, color: "#2dd4bf" }, // normal — teal (healthy register)
  { from: 25, to: 30, color: "#f59e0b" }, // overweight — amber
  { from: 30, to: 40, color: "#f43f5e" }, // obese — rose-red
]

function bmiAngle(bmi: number): number {
  const t = Math.min(1, Math.max(0, (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)))
  return 180 - t * 180
}

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) }
}

function zoneColor(bmi: number): string {
  return BMI_ZONES.find((z) => bmi >= z.from && bmi < z.to)?.color ?? "#f43f5e"
}

// ── Small helpers ─────────────────────────────────────────────────────────────

/** Compact metric value: keeps one decimal only when it is meaningful. */
function fmtMetric(v: number): string {
  return String(Math.round(v * 10) / 10)
}

function seriesOf(data: MetricsRes, type: string): MetricPoint[] {
  return data.series[type] ?? []
}

/** Delta of the last series point vs the one before it (null when < 2 points). */
function deltaOf(pts: MetricPoint[]): number | null {
  if (pts.length < 2) return null
  return pts[pts.length - 1].value - pts[pts.length - 2].value
}

/** ▲ emerald / ▼ amber / – zinc, mono + tabular. */
function DeltaText({ delta, unit, className }: { delta: number | null; unit?: string; className?: string }) {
  const u = unit ? ` ${unit}` : ""
  if (delta == null) {
    return <span className={cn("font-mono text-[9px] tabular-nums tracking-widest text-zinc-700", className)}>– –</span>
  }
  if (delta > 0) {
    return (
      <span className={cn("font-mono text-[9px] tabular-nums tracking-widest text-amber-400", className)}>
        ▲ +{delta.toFixed(1)}{u}
      </span>
    )
  }
  if (delta < 0) {
    return (
      <span className={cn("font-mono text-[9px] tabular-nums tracking-widest text-amber-400", className)}>
        ▼ −{Math.abs(delta).toFixed(1)}{u}
      </span>
    )
  }
  return <span className={cn("font-mono text-[9px] tabular-nums tracking-widest text-zinc-400", className)}>– 0.0{u}</span>
}

// ── Trend weight math (R19-c — MacroFactor / Happy Scale / Libra parity) ──────

/**
 * EMA smoothing factor, per logged day. Libra's classic "slow and steady"
 * default is α 0.1; Happy Scale's "fast" sits near α 0.25. PRIME pins α 0.15:
 * a noise half-life of ~4.3 days (ln 0.5 ÷ ln 0.85) — slow enough to swallow
 * the ±1–2 kg water/glycogen swings that resolve within 1–3 days, fast enough
 * to reveal a genuine weekly shift inside the 30-point series window.
 */
const TREND_ALPHA = 0.15

/** Verdict band edges, |rate| in kg/week (NICE 2014 / IOM safe convention). */
const TREND_MAINTAINING = 0.1
const TREND_STEADY = 0.5
const TREND_AGGRESSIVE = 1.0

type WeightTrend = {
  /** EMA trend value at each series point — 1:1 with the input series. */
  points: number[]
  /** Current trend — the EMA at the latest weigh-in. */
  current: number
  /**
   * Honest weekly rate (kg/week): (trend_now − trend_≥7d_ago) × 7 ÷ actual
   * days between those two samples. Null until the series spans ≥ 7 days —
   * a shorter window would extrapolate noise into a "rate".
   */
  weeklyRateKg: number | null
}

/** Calendar-day distance between two "YYYY-MM-DD" keys (b later than a). UTC math — DST-proof. */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/**
 * Exponentially-smoothed trend over the weight series. The series is
 * day-granular but SPARSE (only logged days appear), so: seeded at the first
 * weigh-in (Libra convention), one α-step per logged day, and a missing day
 * carries the previous trend forward unchanged — weekly-only weigh-ins still
 * work, they simply update the EMA once per log (Libra's exact semantics).
 */
function computeWeightTrend(series: MetricPoint[]): WeightTrend | null {
  if (series.length === 0) return null
  const points: number[] = [series[0].value]
  let trend = series[0].value
  for (let i = 1; i < series.length; i++) {
    trend += TREND_ALPHA * (series[i].value - trend)
    points.push(trend)
  }
  // anchor = the LATEST point at least 7 days old; with gap-fill its trend
  // IS the trend "7 days ago" (carried forward across any gap), and the rate
  // divides by the ACTUAL elapsed days — a 10-day-old anchor averages over
  // 10 days instead of extrapolating a 7-day fiction
  const lastDay = series[series.length - 1].day
  let weeklyRateKg: number | null = null
  for (let i = series.length - 1; i >= 0; i--) {
    const elapsed = dayDiff(series[i].day, lastDay)
    if (elapsed >= 7) {
      weeklyRateKg = ((trend - points[i]) * 7) / elapsed
      break
    }
  }
  return { points, current: trend, weeklyRateKg }
}

type TrendBand = { key: string; label: string; chipClass: string }

/**
 * Verdict band for a weekly rate — SPEED semantics, direction-agnostic by
 * design (gaining muscle can be the goal, so loss is never "good" on a
 * scale's authority). Color maps speed only: teal = maintaining, violet =
 * slow, zinc = steady, amber = aggressive/fast.
 */
function trendBand(rate: number): TrendBand {
  const a = Math.abs(rate)
  if (a < TREND_MAINTAINING)
    return { key: "maintaining", label: "MAINTAINING", chipClass: "border-teal-400/50 bg-teal-500/15 text-teal-300" }
  if (a < TREND_STEADY)
    return { key: "slow", label: "SLOW", chipClass: "border-violet-400/50 bg-violet-500/15 text-violet-200" }
  if (a < TREND_AGGRESSIVE)
    return { key: "steady", label: "STEADY", chipClass: "border-zinc-400/50 bg-zinc-500/10 text-zinc-200" }
  return { key: "aggressive", label: "AGGRESSIVE", chipClass: "border-amber-400/50 bg-amber-500/15 text-amber-300" }
}

// ── Recharts tooltips (dark, house style) ─────────────────────────────────────

function WeightTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; dataKey?: string | number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const raw = payload.find((p) => p.dataKey === "value")?.value
  const trend = payload.find((p) => p.dataKey === "trend")?.value
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-3 py-2">
      <p className="sys-label text-[9px] text-zinc-400">{label ? formatDayLabel(label) : ""}</p>
      {raw != null && <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-violet-300">{raw} KG</p>}
      {trend != null && (
        <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-fuchsia-300">TREND {trend} KG</p>
      )}
    </div>
  )
}

function SleepTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-3 py-2">
      <p className="sys-label text-[9px] text-zinc-400">{label ? formatDayLabel(label) : ""}</p>
      <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-teal-300">{payload[0].value} H</p>
    </div>
  )
}

// ── Section: profile strip ────────────────────────────────────────────────────

function ProfileStrip({ profile }: { profile: ProfileOut }) {
  const height = profile.heightCm ?? DEFAULT_PROFILE.heightCm
  const weight = profile.weightKg ?? DEFAULT_PROFILE.weightKg
  const age = new Date().getFullYear() - (profile.birthYear ?? DEFAULT_PROFILE.birthYear)
  const chips: { label: string; value: string }[] = [
    { label: "HEIGHT", value: `${fmtMetric(height)} CM` },
    { label: "WEIGHT", value: `${fmtMetric(weight)} KG` },
    { label: "AGE", value: `${age} YR` },
    { label: "SEX", value: (profile.sex ?? DEFAULT_PROFILE.sex).toUpperCase() },
    { label: "ACTIVITY", value: (profile.activityLevel ?? DEFAULT_PROFILE.activityLevel).toUpperCase() },
    { label: "GOAL", value: (profile.goal ?? DEFAULT_PROFILE.goal).toUpperCase() },
  ]
  return (
    <SystemPanel>
      <div className="flex flex-wrap items-center gap-2 p-3.5 sm:p-4">
        {chips.map((c) => (
          <span
            key={c.label}
            className="inline-flex items-baseline gap-1.5 rounded-sm border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5"
          >
            <span className="font-mono text-[8px] tracking-[0.22em] text-zinc-400">{c.label}</span>
            <span className="font-mono text-[11px] font-bold tabular-nums tracking-wider text-zinc-200">{c.value}</span>
          </span>
        ))}
        {profile.isDefault && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/50 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[9px] font-bold tracking-[0.15em] text-amber-300">
            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
            DEFAULT PROFILE — CALIBRATE IN FUEL TAB
          </span>
        )}
      </div>
    </SystemPanel>
  )
}

// ── Section: metric goal control (R2-b — set/remove target, progress chip) ────

/** Sensible default direction per metric — waist/hips/weight cut, girths grow. */
function defaultDirection(metric: string): "down" | "up" {
  return metric === "chest" || metric === "arm" || metric === "thigh" || metric === "calf" ? "up" : "down"
}

function MetricGoalSection({
  metric,
  unit,
  label,
  latest,
  series,
  goal,
  onGoalChanged,
  trendNote,
}: {
  metric: string
  unit: string
  label: string
  latest: number | null
  series: MetricPoint[]
  goal: MetricGoalDTO | null
  onGoalChanged: () => void
  /** Weight-only (R19-c): trend-aware line rendered under an active goal chip. */
  trendNote?: string | null
}) {
  const { pushNotice, bumpRefresh } = useSystem()
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<"down" | "up">(defaultDirection(metric))
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)

  // bounds mirror /api/body/goal — weight 20–400 kg, girths 10–250 cm
  const bounds = metric === "weight" ? { min: 20, max: 400 } : { min: 10, max: 250 }

  const openEditor = () => {
    setDirection(goal?.direction ?? defaultDirection(metric))
    setValue(latest !== null ? String(latest) : "")
    setOpen(true)
  }

  const save = async () => {
    if (busy) return
    const v = Number(value)
    if (!value.trim() || !Number.isFinite(v) || v < bounds.min || v > bounds.max) {
      pushNotice({
        kind: "warn",
        title: "TARGET REJECTED",
        body: `${label} target must be ${bounds.min}–${bounds.max} ${unit}.`,
      })
      return
    }
    setBusy(true)
    try {
      await api<{ goal: MetricGoalDTO }>("/api/body/goal", {
        method: "POST",
        body: JSON.stringify({ metric, targetValue: v, direction }),
      })
      setOpen(false)
      onGoalChanged()
      bumpRefresh()
      pushNotice({
        kind: "info",
        title: "TARGET SET",
        body: `${label} target ${fmtMetric(v)} ${unit} — the Oracle will track the march.`,
      })
    } catch (e) {
      pushNotice({ kind: "warn", title: "TARGET FAILED", body: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy(true)
    try {
      await api<{ ok: boolean }>(`/api/body/goal?metric=${metric}`, { method: "DELETE" })
      setOpen(false)
      onGoalChanged()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "REMOVE FAILED", body: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  // ── goal active: progress chip + remove affordance ──
  if (goal && !open) {
    const { pct, remaining } = goalProgress(goal, series)
    const target = fmtMetric(goal.targetValue)
    const latestTxt = latest !== null ? fmtMetric(latest) : "—"
    const chip =
      remaining <= 0
        ? `TARGET REACHED · ${latestTxt} ${unit} VS ${target}`
        : pct !== null && pct > 0
          ? `${latestTxt} → ${target} ${unit} · ${pct}% → TARGET`
          : `${latestTxt} → ${target} ${unit} · ${fmtMetric(remaining)} ${unit} TO TARGET`
    return (
      <div className="flex flex-wrap items-center gap-2" role="status" aria-label={`${label} goal: ${chip}`}>
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[9px] font-bold tracking-[0.12em] text-amber-300">
          <Target className="h-3 w-3 shrink-0" aria-hidden />
          <span className="tabular-nums">{chip}</span>
        </span>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          aria-label={`Remove ${label.toLowerCase()} target`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm border border-zinc-700/70 bg-zinc-950/60 px-3 font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-400 transition-all hover:border-rose-500/50 hover:text-rose-300 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
          REMOVE TARGET
        </button>
        {trendNote && (
          <p className="w-full sys-label text-[9px] leading-relaxed text-zinc-400">
            <span className="mr-1 text-teal-400" aria-hidden>
              »
            </span>
            {trendNote}
          </p>
        )}
      </div>
    )
  }

  // ── editor open: direction segmented control + numeric input + save ──
  if (open) {
    return (
      <div className="rounded-sm border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sys-label text-[8px] text-zinc-400">DIRECTION</span>
          <div className="flex items-center gap-1.5" role="group" aria-label="Target direction">
            <button
              type="button"
              aria-pressed={direction === "down"}
              onClick={() => setDirection("down")}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-sm border px-3 font-mono text-[9px] font-bold tracking-[0.18em] transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70",
                direction === "down"
                  ? "border-teal-400/60 bg-teal-500/15 text-teal-200"
                  : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
              )}
            >
              LOSE ▼
            </button>
            <button
              type="button"
              aria-pressed={direction === "up"}
              onClick={() => setDirection("up")}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-sm border px-3 font-mono text-[9px] font-bold tracking-[0.18em] transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70",
                direction === "up"
                  ? "border-amber-400/60 bg-amber-500/15 text-amber-200"
                  : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
              )}
            >
              GAIN ▲
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="sys-label text-[8px] text-zinc-400">TARGET</span>
          <div className="relative min-w-0 flex-1 sm:max-w-[140px]">
            <Input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={bounds.min}
              max={bounds.max}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={latest !== null ? String(latest) : "—"}
              aria-label={`${label} target in ${unit}`}
              className="h-11 rounded-sm border-zinc-600/70 bg-zinc-900/50 pr-9 font-mono text-sm tabular-nums text-zinc-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] focus-visible:outline focus-visible:outline-violet-400/70"
            />
            <span
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-widest text-zinc-400"
              aria-hidden
            >
              {unit}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm border border-amber-400/50 bg-amber-500/15 px-4 font-mono text-[9px] font-bold tracking-[0.2em] text-amber-200 transition-all hover:bg-amber-500/25 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Target className="h-3.5 w-3.5" aria-hidden />}
            SAVE TARGET
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cancel setting target"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/50 text-zinc-500 transition-all hover:border-zinc-600 hover:text-zinc-300 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    )
  }

  // ── no goal: the SET TARGET affordance ──
  return (
    <motion.button
      type="button"
      onClick={openEditor}
      aria-label={`Set ${label.toLowerCase()} target`}
      whileTap={{ scale: 0.95, transition: { duration: 0.1 } }}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-zinc-700 bg-zinc-950/30 font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-400 transition-all hover:border-amber-400/60 hover:bg-amber-500/5 hover:text-amber-300 focus-visible:outline focus-visible:outline-violet-400/70"
    >
      <Target className="h-3.5 w-3.5" aria-hidden /> SET TARGET
    </motion.button>
  )
}

// ── Section: trend weight readout (R19-c) ─────────────────────────────────────

const TREND_CALIBRATING_CHIP = "border-zinc-700/60 bg-zinc-900/60 text-zinc-400"

/**
 * TREND stat block under the weight chart — EMA numeral (count-up, motion
 * kit) + speed-verdict rate chip + the house footnote. <2 weigh-ins never
 * reaches this component (the caller renders the honest locked line instead).
 */
function TrendReadout({ current, weeklyRateKg }: { current: number; weeklyRateKg: number | null }) {
  // hero numeral (motion kit) — counts up to the trend; reduced-motion safe
  const trendUp = useCountUp(current, 0.9)
  const band = weeklyRateKg == null ? null : trendBand(weeklyRateKg)

  // maintaining renders "±x.x" (noise-band marker); anything faster carries an
  // honest sign and names its direction — loss vs gain, never good vs bad
  const rateTxt =
    weeklyRateKg == null
      ? null
      : Math.abs(weeklyRateKg) < TREND_MAINTAINING
        ? `±${Math.abs(weeklyRateKg).toFixed(1)} KG/WK · MAINTAINING`
        : `${weeklyRateKg < 0 ? "−" : "+"}${Math.abs(weeklyRateKg).toFixed(1)} KG/WK · ${band?.label} ${
            weeklyRateKg < 0 ? "LOSS" : "GAIN"
          }`

  const ariaRate =
    weeklyRateKg == null
      ? "weekly rate calibrating, needs a 7-day window"
      : band?.key === "maintaining"
        ? `maintaining, ${Math.abs(weeklyRateKg).toFixed(1)} kilograms per week`
        : `${band?.label.toLowerCase()} ${weeklyRateKg < 0 ? "loss" : "gain"} at ${Math.abs(
            weeklyRateKg
          ).toFixed(1)} kilograms per week`

  return (
    <div className="mt-3.5 border-t border-zinc-800/60 pt-3.5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <div className="shrink-0" role="img" aria-label={`Weight trend ${fmtMetric(current)} kilograms — ${ariaRate}`}>
          <p className="font-mono text-2xl font-bold leading-none tabular-nums text-fuchsia-300">{trendUp.toFixed(1)}</p>
          <p className="mt-1 sys-label text-[8px] text-zinc-400">TREND KG · SMOOTHED</p>
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
              band ? band.chipClass : TREND_CALIBRATING_CHIP
            )}
          >
            {rateTxt ?? "RATE CALIBRATING"}
          </span>
          {weeklyRateKg == null && (
            <p className="mt-1.5 font-mono text-[8px] tracking-[0.18em] text-zinc-400">
              A 7-DAY WEIGH-IN WINDOW UNLOCKS AN HONEST KG/WK READ
            </p>
          )}
        </div>
      </div>
      <p className="mt-2.5 font-mono text-[10px] leading-relaxed tracking-[0.1em] text-zinc-400">
        TREND = EXPONENTIAL SMOOTHING (α {TREND_ALPHA}) — DAILY NOISE FILTERED, DIRECTION REVEALED · SAFE CHANGE ZONE 0.5–1
        KG/WK <span className="text-zinc-600">(NICE 2014 · IOM)</span>
      </p>
    </div>
  )
}

// ── Section: weight trend + logger ────────────────────────────────────────────

function WeightPanel({
  series,
  latest,
  saving,
  onLog,
  goal,
  onGoalChanged,
}: {
  series: MetricPoint[]
  latest: LatestVal
  saving: boolean
  onLog: (type: string, raw: string) => Promise<boolean>
  goal: MetricGoalDTO | null
  onGoalChanged: () => void
}) {
  const [value, setValue] = useState("")
  const delta = deltaOf(series)

  // when a goal is live, widen the y-domain so the target line + gap shading
  // stay visible even when the target sits outside the raw data range
  const yDomain = useMemo<[number, number] | ["dataMin - 2", "dataMax + 2"]>(() => {
    if (!goal || series.length === 0) return ["dataMin - 2", "dataMax + 2"]
    const values = series.map((p) => p.value)
    const dataMin = Math.min(...values)
    const dataMax = Math.max(...values)
    return [Math.min(dataMin, goal.targetValue) - 2, Math.max(dataMax, goal.targetValue) + 2]
  }, [goal, series])

  // gap shading between the latest value and the target (amber, faint)
  const gapArea = useMemo(() => {
    if (!goal || series.length === 0) return null
    const latestValue = series[series.length - 1].value
    return {
      y1: Math.min(latestValue, goal.targetValue),
      y2: Math.max(latestValue, goal.targetValue),
    }
  }, [goal, series])

  // R19-c — exponentially-smoothed trend over the raw weigh-ins; the EMA is
  // bounded by the series min/max so the y-domain above stays valid
  const trend = useMemo(() => computeWeightTrend(series), [series])

  // chart payload = raw point + its trend sample (the fuchsia Line plots the
  // EMA value AT each weigh-in; gap days carry it forward invisibly)
  const chartData = useMemo(() => {
    if (!trend) return series
    return series.map((p, i) => ({ ...p, trend: trend.points[i] }))
  }, [series, trend])

  // trend-aware goal note (R19-c): surfaces the smoothed line in the goal
  // readout's own language — only when a weight goal is live AND the rate is
  // meaningful (calibrating stays silent — never narrate a rate we don't
  // have). Plain compute — string math, cheaper than a memo (R6-c precedent)
  let trendNote: string | null = null
  if (goal && trend && trend.weeklyRateKg != null) {
    const rate = trend.weeklyRateKg
    const now = fmtMetric(trend.current)
    const target = fmtMetric(goal.targetValue)
    trendNote =
      Math.abs(rate) < TREND_MAINTAINING
        ? `TREND HOLDS AT ${now} KG — TARGET ${target} KG WAITS`
        : (goal.direction === "down" ? rate < 0 : rate > 0)
          ? `TREND ${now} KG MARCHES TOWARD ${target} KG`
          : `TREND ${now} KG MOVES AWAY FROM ${target} KG`
  }

  async function submit() {
    const ok = await onLog("weight", value)
    if (ok) setValue("")
  }

  return (
    <SystemPanel
      label="Weight Trend"
      labelAccent={
        <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          {latest ? `${fmtMetric(latest.value)} KG · ${formatDayLabel(latest.day).toUpperCase()}` : "NO DATA"}
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        {series.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center gap-2 sm:h-48">
            <EmptyGlyph className="h-20 w-20 opacity-70" />
            <p className="font-mono text-xs tracking-widest text-zinc-400">NO WEIGHT LOGS YET</p>
            <p className="font-mono text-[9px] tracking-[0.25em] text-zinc-400">
              DAILY WEIGH-INS UNLOCK THE BMI GAUGE
            </p>
          </div>
        ) : (
          <div className="relative h-44 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4d4d8" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#d4d4d8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(167,139,250,0.08)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => formatDayLabel(d)}
                  tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={{ stroke: "rgba(167,139,250,0.15)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  /* R56 — tick densification (hover Tooltip keeps every
                   * reading reachable). */
                  minTickGap={48}
                />
                <YAxis
                  tickCount={3}
                  tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  domain={yDomain}
                />
                {gapArea && (
                  <ReferenceArea y1={gapArea.y1} y2={gapArea.y2} fill="#f59e0b" fillOpacity={0.06} strokeOpacity={0} />
                )}
                {goal && (
                  <ReferenceLine
                    y={goal.targetValue}
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    label={{
                      value: `TARGET ${fmtMetric(goal.targetValue)}`,
                      position: "insideTopRight",
                      fill: "#f59e0b",
                      fontSize: 9,
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  />
                )}
                <Tooltip content={<WeightTooltip />} cursor={{ stroke: "rgba(167,139,250,0.3)" }} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#e4e4e7"
                  strokeWidth={2}
                  fill="url(#weightGrad)"
                  dot={series.length === 1 ? { r: 4, fill: "#e4e4e7", stroke: "#fafafa", strokeWidth: 2 } : { r: 2.5, fill: "#e4e4e7", strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: "#fafafa", stroke: "#060607" }}
                />
                {/* R19-c — the smoothed trend line over the raw area (fuchsia
                    vs the violet fill; vitals-tab dual-series precedent) */}
                {trend && series.length >= 2 && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#fde68a", stroke: "#07060c" }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
            {series.length === 1 && (
              <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center font-mono text-[8px] tracking-[0.25em] text-zinc-400">
                1 ENTRY — A SECOND WEIGH-IN UNLOCKS THE TREND
              </p>
            )}
          </div>
        )}

        {/* R19-c — chart color key + trend stat block (hidden below 2
            weigh-ins: one entry keeps the honest in-chart note above) */}
        {trend && series.length >= 2 && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8px] tracking-[0.22em] text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 rounded-full bg-[#e4e4e7]" aria-hidden />
              RAW
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-4 rounded-full bg-[#fbbf24]" aria-hidden />
              TREND
            </span>
          </p>
        )}
        {trend && series.length >= 2 && <TrendReadout current={trend.current} weeklyRateKg={trend.weeklyRateKg} />}

        {/* goal target control (R2-b): SET TARGET / progress chip + remove */}
        <div className="mt-4">
          <MetricGoalSection
            metric="weight"
            unit="KG"
            label="Weight"
            latest={latest?.value ?? null}
            series={series}
            goal={goal}
            onGoalChanged={onGoalChanged}
            trendNote={trendNote}
          />
        </div>

        {/* inline logger + last-entry delta */}
        <form
          className="mt-4 flex flex-wrap items-center gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="min-w-[86px]">
            <p className="sys-label text-[8px] text-zinc-400">LAST Δ</p>
            <DeltaText delta={delta} unit="KG" className="mt-0.5 block text-[10px]" />
          </div>
          <div className="relative min-w-0 flex-1 sm:max-w-[180px]">
            <Input
              type="number"
              inputMode="decimal"
              step={0.1}
              min={25}
              max={300}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="70.0"
              aria-label="Weight in kilograms"
              className="h-11 rounded-sm border-zinc-600/70 bg-zinc-900/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] pr-10 font-mono text-sm tabular-nums text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
            />
            <span
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-widest text-zinc-400"
              aria-hidden
            >
              KG
            </span>
          </div>
          <button
            type="submit"
            disabled={saving || !value.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/15 px-5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 transition-all hover:bg-violet-500/25 hover:shadow-[0_0_18px_rgba(139,92,246,0.35)] active:bg-violet-500/35 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            LOG
          </button>
        </form>
      </div>
    </SystemPanel>
  )
}

// ── Section: BMI gauge ────────────────────────────────────────────────────────

function BmiPanel({
  latest,
  bmiCategory,
  weightKg,
  heightCm,
}: {
  latest: LatestVal
  bmiCategory: string | null
  weightKg: number | null
  heightCm: number | null
}) {
  const bmi = latest?.value ?? null
  const height = heightCm ?? DEFAULT_PROFILE.heightCm
  const zoneCol = bmi != null ? zoneColor(bmi) : "#52525b"

  return (
    <SystemPanel label="Body Mass Index">
      <div className="flex flex-col items-center p-4 pt-5 sm:p-5">
        <svg
          viewBox="0 0 240 140"
          className="w-full max-w-[280px]"
          role="img"
          aria-label={
            bmi != null
              ? `Body mass index ${bmi.toFixed(1)}, ${bmiCategory ?? "unclassified"}, based on ${fmtMetric(weightKg ?? 0)} kilograms and ${fmtMetric(height)} centimeters.`
              : "Body mass index gauge — log a weight entry to unlock BMI."
          }
        >
          {BMI_ZONES.map((z) => {
            const p1 = polar(120, 122, 92, bmiAngle(z.from) - 0.9)
            const p2 = polar(120, 122, 92, bmiAngle(z.to) + 0.9)
            return (
              <path
                key={z.from}
                d={`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A 92 92 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`}
                fill="none"
                stroke={z.color}
                strokeWidth={13}
                opacity={bmi == null ? 0.35 : 1}
              />
            )
          })}
          {/* scale ends */}
          <text x={28} y={138} textAnchor="middle" className="fill-zinc-600 font-mono text-[9px] tabular-nums">
            {BMI_MIN}
          </text>
          <text x={212} y={138} textAnchor="middle" className="fill-zinc-600 font-mono text-[9px] tabular-nums">
            {BMI_MAX}
          </text>
          {bmi != null ? (
            <>
              {/* marker dot on the arc */}
              <circle
                cx={polar(120, 122, 92, bmiAngle(bmi)).x}
                cy={polar(120, 122, 92, bmiAngle(bmi)).y}
                r={6}
                fill={zoneCol}
                stroke="#09090b"
                strokeWidth={2}
                style={{ filter: `drop-shadow(0 0 6px ${zoneCol}B3)` }}
              />
              <text
                x={120}
                y={94}
                textAnchor="middle"
                className="fill-zinc-50 font-mono text-[30px] font-bold tabular-nums"
              >
                {bmi.toFixed(1)}
              </text>
              <text
                x={120}
                y={112}
                textAnchor="middle"
                fill={zoneCol}
                className="font-mono text-[9px] font-bold tracking-[0.22em]"
              >
                {(bmiCategory ?? "—").toUpperCase()}
              </text>
            </>
          ) : (
            <text
              x={120}
              y={96}
              textAnchor="middle"
              className="fill-zinc-500 font-mono text-[9px] font-bold tracking-[0.2em]"
            >
              LOG WEIGHT TO UNLOCK BMI
            </text>
          )}
        </svg>
        {bmi != null ? (
          <p className="mt-1 text-center font-mono text-[9px] tabular-nums tracking-[0.18em] text-zinc-400">
            BASED ON {fmtMetric(weightKg ?? 0)} KG · {fmtMetric(height)} CM
          </p>
        ) : (
          <p className="mt-1 text-center font-mono text-[9px] tracking-[0.18em] text-zinc-400">
            kg/m² · DERIVED FROM YOUR LATEST WEIGH-IN
          </p>
        )}
      </div>
    </SystemPanel>
  )
}

// ── Section: tape measurements grid ───────────────────────────────────────────

function MeasurementCard({
  id,
  label,
  icon: Icon,
  series,
  saving,
  onLog,
  goal,
  onGoalChanged,
}: {
  id: string
  label: string
  icon: LucideIcon
  series: MetricPoint[]
  saving: boolean
  onLog: (type: string, raw: string) => Promise<boolean>
  goal: MetricGoalDTO | null
  onGoalChanged: () => void
}) {
  const [value, setValue] = useState("")
  const step = METRIC_TYPES.find((m) => m.id === id)?.step ?? 0.5
  const last = series[series.length - 1]
  const delta = deltaOf(series)

  async function submit() {
    const ok = await onLog(id, value)
    if (ok) setValue("")
  }

  return (
    <div className="sys-panel rounded-sm p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-400">{label.toUpperCase()}</p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
      </div>
      <p className="mt-2 font-mono text-2xl font-bold leading-none tabular-nums text-zinc-100">
        {last ? fmtMetric(last.value) : <span className="text-zinc-700">—</span>}
        {last && <span className="ml-1 text-[9px] font-normal tracking-widest text-zinc-400">CM</span>}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
        <span>{last ? formatDayLabel(last.day).toUpperCase() : "NO DATA"}</span>
        {last && <DeltaText delta={delta} />}
      </p>

      {/* goal target control (R2-b): SET TARGET / progress chip + remove */}
      <div className="mt-2.5">
        <MetricGoalSection
          metric={id}
          unit="CM"
          label={label}
          latest={last?.value ?? null}
          series={series}
          goal={goal}
          onGoalChanged={onGoalChanged}
        />
      </div>

      <form
        className="mt-3 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input
          type="number"
          inputMode="decimal"
          step={step}
          min={20}
          max={250}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="CM"
          aria-label={`New ${label.toLowerCase()} measurement in centimeters`}
          className="h-11 min-w-0 flex-1 rounded-sm border-zinc-600/70 bg-zinc-900/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] px-2.5 font-mono text-xs tabular-nums text-zinc-200 placeholder:text-zinc-700 focus-visible:outline focus-visible:outline-violet-400/70"
        />
        <button
          type="submit"
          disabled={saving || !value.trim()}
          aria-label={`Log ${label.toLowerCase()}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-violet-400/40 bg-violet-500/10 text-violet-300 transition-all hover:border-violet-400/60 hover:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
        </button>
      </form>
    </div>
  )
}

// ── Section: waist-to-height science readout (R6-c) ─────────────────────────

const WHTR_CHIP: Record<string, string> = {
  KEEP: "border-teal-400/50 bg-teal-500/15 text-teal-300",
  WATCH: "border-amber-400/50 bg-amber-500/15 text-amber-300",
  ACT: "border-rose-400/50 bg-rose-500/15 text-rose-300",
}

/**
 * Compact WAIST-TO-HEIGHT readout — big count-up ratio, verdict chip
 * (KEEP / WATCH / ACT) and the Ashwell line. Only mounted when BOTH a
 * latest waist value and the profile height exist (guarded by the caller).
 */
function WhtrReadout({ waistCm, heightCm, ratio }: { waistCm: number; heightCm: number; ratio: number }) {
  const verdict = waistToHeightVerdict(ratio)
  // hero numeral (motion kit) — counts up to the ratio; reduced-motion safe
  const ratioUp = useCountUp(ratio, 0.9)

  // split the trailing "(CITE)" off the note so the citation dims like app-wide
  const noteMatch = verdict.note.match(/^(.*)\s*\(([^)]*)\)$/)
  const noteText = noteMatch ? noteMatch[1] : verdict.note
  const noteCite = noteMatch ? noteMatch[2] : null

  // protocol upgrade: surface the untouched METRIC_TYPES waist hint here
  const protocol = METRIC_TYPES.find((t) => t.id === "waist")?.hint

  return (
    <SystemPanel
      label="Waist-To-Height"
      labelAccent={
        <span className="font-mono text-[8px] tabular-nums tracking-[0.15em] text-zinc-400">
          &lt;0.5 KEEP · 0.5–0.6 WATCH · &gt;0.6 ACT
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 p-4 sm:p-5">
        <div className="shrink-0" role="img" aria-label={`Waist-to-height ratio ${ratio.toFixed(2)} — verdict ${verdict.label}`}>
          <p className="font-mono text-4xl font-bold leading-none tabular-nums text-teal-200">{ratioUp.toFixed(2)}</p>
          <p className="mt-1 sys-label text-[8px] text-zinc-400">WAIST ÷ HEIGHT</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
                WHTR_CHIP[verdict.label] ?? "border-zinc-700/60 bg-zinc-900/60 text-zinc-400"
              )}
            >
              {verdict.label}
            </span>
            <span className="font-mono text-[9px] tabular-nums tracking-[0.15em] text-zinc-400">
              {fmtMetric(waistCm)} CM ÷ {fmtMetric(heightCm)} CM
            </span>
          </div>
          <p className="mt-1.5 sys-label text-[9px] leading-relaxed text-zinc-400">
            <span className="mr-1 text-teal-400" aria-hidden>
              »
            </span>
            {noteText}
            {noteCite && <span className="text-zinc-400"> ({noteCite})</span>}
          </p>
          {protocol && (
            <p className="mt-1 font-mono text-[8px] tracking-[0.15em] text-zinc-400">
              PROTOCOL — {protocol.toUpperCase()} · SAME CONDITIONS EACH LOG
            </p>
          )}
        </div>
      </div>
    </SystemPanel>
  )
}

// ── Section: sleep logger + 7-day chart ───────────────────────────────────────

function SleepPanel({
  series,
  lastNight,
  saving,
  onLog,
}: {
  series: MetricPoint[]
  lastNight: MetricPoint | null
  saving: boolean
  onLog: (type: string, raw: string) => Promise<boolean>
}) {
  const [value, setValue] = useState("7.5")
  const avg = series.length > 0 ? series.reduce((acc, p) => acc + p.value, 0) / series.length : null

  /** Stepper ± 0.5 h, clamped to the 0–16 h logging range. */
  function step(dir: 1 | -1) {
    const cur = Number(value)
    const base = Number.isFinite(cur) ? cur : 7.5
    const next = Math.min(16, Math.max(0, Math.round((base + dir * 0.5) * 2) / 2))
    setValue(next % 1 === 0 ? String(next) : next.toFixed(1))
  }

  async function submit() {
    const ok = await onLog("sleep", value)
    if (ok) setValue("")
  }

  return (
    <SystemPanel
      label="Sleep · Recovery"
      labelAccent={
        <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          {lastNight ? `${fmtMetric(lastNight.value)} H LAST NIGHT` : "NO LOGS"}
        </span>
      }
    >
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        {/* left: stats + last-7-nights bar chart */}
        <div className="min-w-0">
          <div className="flex items-center gap-6">
            <div>
              <p className="sys-label text-[8px] text-zinc-400">LAST NIGHT</p>
              <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-teal-300">
                {lastNight ? `${fmtMetric(lastNight.value)} H` : "—"}
              </p>
            </div>
            <div>
              <p className="sys-label text-[8px] text-zinc-400">7-DAY AVG</p>
              <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-zinc-200">
                {avg != null ? `${avg.toFixed(1)} H` : "—"}
              </p>
            </div>
          </div>
          {series.length === 0 ? (
            <div className="mt-3 grid h-32 place-items-center rounded-sm border border-zinc-800/60 bg-zinc-950/40">
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-400">NO SLEEP LOGS YET</p>
            </div>
          ) : (
            <div className="mt-3 h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => formatDayLabel(d)}
                    tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                    axisLine={{ stroke: "rgba(167,139,250,0.15)" }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis hide domain={[0, 16]} />
                  <Tooltip content={<SleepTooltip />} cursor={{ fill: "rgba(20,184,166,0.07)" }} />
                  <ReferenceLine y={7} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />
                  <Bar dataKey="value" fill="#14b8a6" radius={[2, 2, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* right: stepper + log + hint */}
        <div className="min-w-0">
          <p className="sys-label text-[8px] text-zinc-400">HOURS SLEPT LAST NIGHT</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Decrease sleep by half an hour"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-800 bg-zinc-950/60 text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <div className="relative min-w-0 flex-1">
              <Input
                type="number"
                inputMode="decimal"
                step={0.5}
                min={0}
                max={16}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label="Hours of sleep last night"
                className="h-11 rounded-sm border-zinc-600/70 bg-zinc-900/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] pr-9 text-center font-mono text-sm tabular-nums text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
              />
              <span
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] tracking-widest text-zinc-400"
                aria-hidden
              >
                H
              </span>
            </div>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Increase sleep by half an hour"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-800 bg-zinc-950/60 text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !value.trim()}
            className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-teal-500/50 bg-teal-500/10 px-5 font-mono text-[10px] font-bold tracking-[0.25em] text-teal-200 transition-all hover:bg-teal-500/20 hover:shadow-[0_0_18px_rgba(20,184,166,0.3)] active:bg-teal-500/30 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Moon className="h-3.5 w-3.5" aria-hidden />
            )}
            LOG SLEEP
          </button>
          <p className="mt-2.5 text-center font-mono text-[9px] tracking-[0.18em] text-zinc-400">
            <span className="text-amber-400/80">7+ H</span> AUTO-COMPLETES THE SLEEP GOAL
          </p>
        </div>
      </div>
    </SystemPanel>
  )
}

// ── Top-level: the METRICS view ───────────────────────────────────────────────

export function BodyMetrics({ hunter: _hunter }: { hunter: HunterDTO }) {
  const { data, loading, error, reload } = useApi<MetricsRes>("/api/metrics")
  const goalsApi = useApi<GoalListRes>("/api/body/goal")
  const { pushNotice, bumpRefresh } = useSystem()
  const [saving, setSaving] = useState<string | null>(null)

  // metric → active goal (one per metric per hunter, per the unique index)
  const goalByMetric = useMemo(() => {
    const m = new Map<string, MetricGoalDTO>()
    for (const g of goalsApi.data?.goals ?? []) m.set(g.metric, g)
    return m
  }, [goalsApi.data])
  const reloadGoals = goalsApi.reload

  /** Validates client-side, POSTs, notifies, and silently refreshes. */
  async function logMetric(type: string, raw: string): Promise<boolean> {
    const value = Number(raw)
    if (!raw.trim() || !Number.isFinite(value)) {
      pushNotice({ kind: "warn", title: "LOG FAILED", body: "Enter a number first." })
      return false
    }
    const range = CLIENT_RANGES[type]
    if (!range || value < range.min || value > range.max) {
      pushNotice({ kind: "warn", title: "LOG FAILED", body: range ? range.message : "Unknown metric type." })
      return false
    }
    setSaving(type)
    try {
      const res = await api<MetricPostRes>("/api/metrics", {
        method: "POST",
        body: JSON.stringify({ type, value }),
      })
      if (res.questCompleted) {
        pushNotice({ kind: "info", title: "SLEEP GOAL COMPLETE", body: "Claim it in the Goals tab." })
      }
      reload()
      bumpRefresh()
      return true
    } catch (e) {
      pushNotice({ kind: "warn", title: "LOG FAILED", body: (e as Error).message })
      return false
    } finally {
      setSaving(null)
    }
  }

  if (loading && !data) {
    return <SkeletonPanel label="SYNCING BODY METRICS" rows={3} />
  }

  if (error || !data) {
    return (
      <SystemPanel label="Body Metrics">
        <div className="p-5 text-center">
          <p className="font-mono text-xs tracking-widest text-rose-400/80">METRICS LINK FAILED</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">
            {(error ?? "NO DATA").toUpperCase()}
          </p>
          <button
            onClick={() => reload()}
            className="mt-4 rounded-sm border border-violet-400/50 bg-violet-500/15 px-4 py-2 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            RETRY
          </button>
        </div>
      </SystemPanel>
    )
  }

  const wSeries = seriesOf(data, "weight")
  const sleepSeries = seriesOf(data, "sleep")
  const sleep7 = sleepSeries.slice(-7)

  // waist-to-height science view (R6-c) — only when BOTH a latest waist value
  // and the profile height exist; never fabricated from absence. Plain compute
  // (post early-returns — no hook, so render-order stays legal).
  const waistLatest = data.latest.waist
  const profileHeight = data.profile.heightCm
  const whtrRatio = waistLatest && profileHeight ? waistToHeight(waistLatest.value, profileHeight) : null
  const whtrView =
    waistLatest && profileHeight && whtrRatio !== null
      ? { waistCm: waistLatest.value, heightCm: profileHeight, ratio: whtrRatio }
      : null

  return (
    <FlowGroup className="space-y-4 sm:space-y-5">
      {/* 1 — profile strip */}
      <FlowItem>
        <ProfileStrip profile={data.profile} />
      </FlowItem>

      {/* 2+3 — weight trend + BMI gauge, side-by-side on lg */}
      <FlowItem>
        <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[1.4fr_1fr]">
          <WeightPanel
            series={wSeries}
            latest={data.latest.weight ?? null}
            saving={saving === "weight"}
            onLog={logMetric}
            goal={goalByMetric.get("weight") ?? null}
            onGoalChanged={reloadGoals}
          />
          <BmiPanel
            latest={data.latest.bmi ?? null}
            bmiCategory={data.bmiCategory}
            weightKg={data.latest.weight?.value ?? null}
            heightCm={data.profile.heightCm}
          />
        </div>
      </FlowItem>

      {/* 4 — tape measurements */}
      <FlowItem>
      <div>
        <p className="px-1 pb-1.5 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400">
          TAPE MEASUREMENTS
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {MEASUREMENTS.map((m) => (
            <FlowItem key={m.id}>
              <MeasurementCard
                id={m.id}
                label={m.label}
                icon={m.icon}
                series={seriesOf(data, m.id)}
                saving={saving === m.id}
                onLog={logMetric}
                goal={goalByMetric.get(m.id) ?? null}
                onGoalChanged={reloadGoals}
              />
            </FlowItem>
          ))}
        </div>
      </div>
      </FlowItem>

      {/* 4.5 — waist-to-height science readout (R6-c) */}
      {whtrView && (
        <FlowItem>
          <WhtrReadout waistCm={whtrView.waistCm} heightCm={whtrView.heightCm} ratio={whtrView.ratio} />
        </FlowItem>
      )}

      {/* 5 — sleep + recovery */}
      <FlowItem>
        <SleepPanel
          series={sleep7}
          lastNight={sleepSeries[sleepSeries.length - 1] ?? null}
          saving={saving === "sleep"}
          onLog={logMetric}
        />
      </FlowItem>
    </FlowGroup>
  )
}
