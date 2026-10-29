"use client"

// ── PRIME · Vitals tab (Task 15-b + R1-b readiness intelligence) ────────────
// Health monitoring & maintaining system over /api/metrics + /api/sessions +
// /api/nutrition: daily vitals check-in (with the +5 XP first-check-in hook),
// AHA-zone risk monitor, six-subscore health ring, 30-day trend charts and the
// weekly maintenance protocol — every threshold cited, every gap labelled.
// R1-b adds: DAILY READINESS panel (composite score + speak), RHR trend alert
// + chart zones, mood/energy 7-day trend line, check-in typical-range hints
// with a LOGGED flash, and the sleep input that feeds readiness.
// R9 (FLOW & IDENTITY): the readiness score became the tab's display moment
// (count-up display numeral + band-keyed bloom), risk cards + maintenance
// rows read as accent rows, editorial 01/02/03 section headers, and the
// evidence tail reveals on scroll.
// R15-b (FLOW ROUND 2): the whole tab flows — readiness meter rides MeterFlow
// (lockstep with the dial count-up), the health-score ring arcs in on the
// signature ease when the reader arrives (numeral + subscore fills resolve
// in one 0.9s lockstep beat), zone tiles / maintenance rows / chart blocks
// rise per slot on scroll-in, every primary numeral counts up, and live
// check-in commits breathe the dial they changed.
// R53-b (DECLUTTER — the R52 recipe): the tab header + editorial line + the
// numbered 01–04 section marks stand down (panels carry their own labels);
// check-in helper prose folds into placeholders/titles/InfoHints; risk-card
// verdicts + citations, trend-chart accents and maintenance citations ride
// title attributes. Merge & hide — nothing was removed, every meaning stays
// reachable on hover / assistive tech / the "?" pop-ups.
// R55-b (DECLUTTER ROUND 2 — the density bar): second pass over the same
// surface — maintenance rows compact to noun labels (full protocol sentence
// + note + citation on the row title) and cap at 4 visible + a SHOW ALL
// expander; the readiness band-advice verdict folds to the chip row's title
// (band chip + score + colored meter stay); the RHR trend line, risk-card
// labels and panel accents compress. Still merge & hide — zero features
// removed, every meaning reachable via title / InfoHint / expander.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion, type MotionProps } from "framer-motion"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Gauge,
  HeartPulse,
  Minus,
  Plus,
  Ruler,
  ShieldCheck,
  Volume2,
  Waves,
  Wind,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { InfoHint } from "@/components/system/info-hint"
import { FlowGroup, FlowItem, FlowReveal, FLOW_EASE, MeterFlow, pulseBreathe, useCountUp } from "@/components/system/motion"
import { TestLab } from "./test-lab"
import { SensorHub } from "./sensor-hub"
import { OracleTip } from "./oracle-tip"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { GLOSSARY } from "@/lib/glossary"
import { dayKey, formatDayLabel } from "@/lib/game"
import {
  BP_METHOD_CAVEAT,
  bpZone,
  healthScore,
  hrvNote,
  hrZone,
  maintenanceChecklist,
  READINESS_BAND_META,
  READINESS_CITATION,
  spo2Zone,
  type HealthScore,
  type MaintenanceItem,
  type ReadinessRes,
  type ReadinessView,
  type RhrTrendView,
  type Zone,
  type ZoneTone,
} from "@/lib/health"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// ── API contract types ────────────────────────────────────────────────────────

type LatestMetric = { value: number; day: string; unit: string }

type MetricsRes = {
  profile: {
    heightCm: number | null
    weightKg: number | null
    birthYear: number | null
    sex: string | null
    activityLevel: string | null
    goal: string | null
    isDefault: boolean
  }
  latest: Record<string, LatestMetric | null>
  bmiCategory: string | null
  series: Record<string, { day: string; value: number }[]>
}

type SessionHistoryItem = {
  id: string
  gateName: string
  status: string
  startedAt: string
  durationMin: number
  volumeKg: number
  logs: { name: string; type: string; sets: number; reps: number; weightKg: number; durationMin: number }[]
}

type SessionsRes = { active: unknown; history: SessionHistoryItem[] }

type NutritionDayView = {
  date: string
  targets: { calories: number; protein: number; carbs: number; fat: number; waterMl: number }
  consumed: { calories: number; protein: number; carbs: number; fat: number }
  waterMl: number
  meals: { id: string }[]
  history: { day: string; calories: number; target: number; waterMl: number }[]
}

type MetricPostRes = { metric: { day: string; type: string; value: number; unit: string }; xpGranted?: number }

// ── Pure date helpers (fuel-tab idioms) ───────────────────────────────────────

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  return dayKey(new Date(y, m - 1, d + delta))
}

function dayHeadline(day: string): string {
  const today = dayKey()
  if (day === today) return "TODAY"
  if (day === shiftDay(today, -1)) return "YESTERDAY"
  return formatDayLabel(day).toUpperCase()
}

function weekdayLong(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

/** Monday..Sunday day-keys of the current ISO week. */
function isoWeekDays(): string[] {
  const now = new Date()
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) =>
    dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
  )
}

function lastNDays(n: number): string[] {
  const today = dayKey()
  return Array.from({ length: n }, (_, i) => shiftDay(today, -(n - 1 - i)))
}

/** Average of series points whose day lies inside [from, to] (inclusive). */
function windowAvg(series: { day: string; value: number }[] | undefined, from: number, to: number): number | null {
  if (!series || series.length === 0) return null
  const lo = shiftDay(dayKey(), from)
  const hi = shiftDay(dayKey(), to)
  const pts = series.filter((p) => p.day >= lo && p.day <= hi)
  if (pts.length === 0) return null
  return pts.reduce((acc, p) => acc + p.value, 0) / pts.length
}

/** 7-day average + trend vs the previous 7 days for one metric series. */
function seriesTrend(series: { day: string; value: number }[] | undefined): {
  avg7: number | null
  prev7: number | null
  delta: number | null
} {
  const avg7 = windowAvg(series, -6, 0)
  const prev7 = windowAvg(series, -13, -7)
  const delta = avg7 !== null && prev7 !== null ? Math.round((avg7 - prev7) * 10) / 10 : null
  return { avg7, prev7, delta }
}

/** Cardio minutes + strength sessions logged this ISO week (cleared sessions). */
function weekTraining(history: SessionHistoryItem[]): { cardioMin: number; strengthSessions: number } {
  const week = new Set(isoWeekDays())
  let cardioMin = 0
  let strengthSessions = 0
  for (const s of history) {
    if (s.status !== "cleared") continue
    if (!week.has(s.startedAt.slice(0, 10))) continue
    let hasStrength = false
    for (const log of s.logs) {
      if (log.type === "cardio") cardioMin += log.durationMin
      if (log.type === "strength" || log.type === "bodyweight") hasStrength = true
    }
    if (hasStrength) strengthSessions++
  }
  return { cardioMin, strengthSessions }
}

function parseNumeric(s: string): number | null {
  const t = s.trim()
  if (t === "") return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

// ── Check-in field definitions ────────────────────────────────────────────────

type CheckField = {
  id: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  fallback: number
  optional?: boolean
  /** R53-b declutter — typical range folded into the input's placeholder + title. */
  typical?: string
  /** R53-b declutter — extra meaning folded into the input's title, never on the surface. */
  note?: string
}

const CHECK_FIELDS: readonly CheckField[] = [
  { id: "bpSystolic", label: "BP SYS", unit: "mmHg", min: 70, max: 250, step: 1, fallback: 115, typical: "90–120" },
  { id: "bpDiastolic", label: "BP DIA", unit: "mmHg", min: 40, max: 150, step: 1, fallback: 75, typical: "60–80" },
  { id: "restingHr", label: "RHR", unit: "bpm", min: 30, max: 120, step: 1, fallback: 60, typical: "40–100", note: "Morning resting HR above your 7-day baseline flags incomplete recovery." },
  { id: "spo2", label: "SPO₂", unit: "%", min: 85, max: 100, step: 1, fallback: 97, typical: "95–100" },
  { id: "hrv", label: "HRV", unit: "ms", min: 5, max: 200, step: 1, fallback: 45, optional: true, typical: "20–80", note: "Optional field." },
  { id: "sleep", label: "SLEEP", unit: "h", min: 0, max: 16, step: 0.5, fallback: 7.5, optional: true, typical: "6–10" },
  { id: "stress", label: "STRESS", unit: "/10", min: 0, max: 10, step: 1, fallback: 3, typical: "0–10" },
  { id: "mood", label: "MOOD", unit: "/5", min: 1, max: 5, step: 1, fallback: 4, typical: "1–5" },
  { id: "energy", label: "ENERGY", unit: "/5", min: 1, max: 5, step: 1, fallback: 4, typical: "1–5" },
]

const VITAL_SERIES_IDS = CHECK_FIELDS.map((f) => f.id)

// ── R33-b cold-start guards ──────────────────────────────────────────────────
// The series the 30-day trend charts draw from — every chart needs ≥2 entries
// in at least one of these before TrendsPanel renders (its own per-chart rule).
const TREND_SERIES_IDS = ["restingHr", "stress", "mood", "energy", "bpSystolic", "bpDiastolic"] as const

/** R33-b — cold-start empty surface: the designed "what will live here" slot
 *  for a brand-new hunter (zero data). One zinc-300 line, one zinc-500 action
 *  hint pointing at the flow that creates the data, and where natural a violet
 *  link-chip that navigates via the tab store. Strictly the zero/missing-data
 *  path — a data-rich hunter (KAEL regression) never renders it. */
function EmptySurface({
  label,
  line,
  hint,
  ctaLabel,
  onCta,
  glyph,
}: {
  label: string
  line: string
  hint: string
  ctaLabel?: string
  onCta?: () => void
  glyph?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: FLOW_EASE }}
      role="status"
      aria-label={`${label} — ${line.toLowerCase()} — ${hint.toLowerCase()}`}
      className="rounded-sm border border-dashed border-zinc-700/60 bg-zinc-950/30 px-4 py-6 text-center transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:shadow-[0_0_18px_rgba(228,228,231,0.12)] sm:px-5"
    >
      <p className="sys-label text-[9px] tracking-[0.25em] text-zinc-500">{label}</p>
      {glyph && <EmptyGlyph className="mx-auto mt-2 h-16 w-16 opacity-70" />}
      <p className="mt-2 font-mono text-xs tracking-[0.2em] text-zinc-300">{line}</p>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed tracking-[0.16em] text-zinc-500">{hint}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-sm border border-violet-400/50 bg-violet-500/15 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(228,228,231,0.4)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {ctaLabel}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </motion.div>
  )
}

// ── Zone chip ─────────────────────────────────────────────────────────────────

// R43 studio register — "ok" reads as a professional lab NORMAL: ivory text on
// a quiet zinc chip (no hue); watch amber / warn+danger rose carry the alerts.
const TONE_CHIP: Record<ZoneTone, string> = {
  ok: "border-zinc-400/30 bg-zinc-500/10 text-zinc-200",
  watch: "border-amber-400/40 bg-amber-500/10 text-amber-300",
  warn: "border-rose-400/50 bg-rose-500/10 text-rose-300",
  danger: "border-rose-600/70 bg-rose-600/20 text-rose-100 shadow-[0_0_16px_rgba(225,29,72,0.45)]",
}

function ZoneChip({ zone }: { zone: Zone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em] uppercase",
        TONE_CHIP[zone.tone]
      )}
    >
      {zone.tone === "danger" && <AlertTriangle className="h-3 w-3" aria-hidden />}
      {zone.label}
    </span>
  )
}

// ── R15-b flow helpers ────────────────────────────────────────────────────────

/** Count-up numeral for tile/row primary values — mounts from 0, glides on
 *  live refresh (a check-in commit reloads metrics on camera). `decimals`
 *  keeps the WHtR hundredths honest; default renders integers. */
function CountNum({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const shown = useCountUp(value, 0.9)
  return <span>{shown.toFixed(decimals)}</span>
}

/** Scroll-in rise props for below-fold tiles/rows — whileInView (once, ~8%
 *  into the viewport), 0.45s FLOW_EASE, delay min(i,8)·0.05; reduced motion
 *  → duration 0 (renders final state). */
function riseInView(reduce: boolean, i: number): MotionProps {
  return {
    initial: reduce ? false : { opacity: 0, y: 10 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-8% 0px" },
    transition: reduce ? { duration: 0 } : { duration: 0.45, ease: FLOW_EASE, delay: Math.min(i, 8) * 0.05 },
  }
}

// ── Numeric stepper row (exercise-dialog idiom, copied locally) ───────────────

function NumRow({
  label,
  unit,
  value,
  min,
  max,
  step,
  fallback,
  optional,
  typical,
  note,
  flash,
  onChange,
}: {
  label: string
  unit: string
  value: string
  min: number
  max: number
  step: number
  fallback: number
  optional?: boolean
  /** R53-b declutter — typical range shown as the input's placeholder. */
  typical?: string
  /** R53-b declutter — extra meaning carried in the input's title (off-surface). */
  note?: string
  /** Changed-field feedback: brief amber LOGGED flash after a commit. */
  flash?: boolean
  onChange: (v: string) => void
}) {
  const bump = (delta: number) => {
    const cur = parseNumeric(value)
    const base = cur === null ? fallback : cur
    const next = Math.min(max, Math.max(min, base + delta))
    onChange(String(next))
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 font-mono text-[9px] tracking-[0.2em] text-zinc-400">{label}</span>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => bump(-step)}
          className="grid h-11 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-rose-400/50 hover:text-rose-300 focus-visible:outline focus-visible:outline-violet-400/70"
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
          title={
            typical || note
              ? `${typical ? `Typical ${typical}${note ? ". " : ""}` : ""}${note ?? ""}`
              : undefined
          }
          onChange={(e) => onChange(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-sm border border-zinc-700/60 bg-zinc-950/70 px-1 text-center font-mono text-sm tabular-nums text-rose-100 focus:border-rose-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => bump(step)}
          className="grid h-11 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-rose-400/50 hover:text-rose-300 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="w-8 shrink-0 font-mono text-[9px] tracking-wider text-zinc-400">{unit}</span>
      </div>
      {/* R53-b declutter — the per-field TYPICAL/SCALE hint lines stand down
          (typical ranges ride the placeholder + title); only the transient
          amber LOGGED flash remains on the surface. */}
      {flash && (
        <p
          aria-live="polite"
          className="mt-1 font-mono text-[8px] font-bold tracking-[0.15em] text-amber-300"
        >
          LOGGED ✓
        </p>
      )}
    </div>
  )
}

// ── R53-b — the R9 editorial section marks (01–04) stood down with the
//    tab's own header: every panel carries its own label, so the landing
//    view keeps one quiet headline instead of double-heading prose. The
//    SysSection component itself lives on elsewhere in the app.

// ── Main tab ──────────────────────────────────────────────────────────────────

export function VitalsTab({ hunter: _hunter }: { hunter: HunterDTO }) {
  const { pushNotice, bumpRefresh } = useSystem()
  const [date, setDate] = useState<string>(() => dayKey())
  const metrics = useApi<MetricsRes>("/api/metrics")
  const sessions = useApi<SessionsRes>("/api/sessions")
  const nutrition = useApi<NutritionDayView>("/api/nutrition")
  const readinessApi = useApi<ReadinessRes>("/api/readiness")

  // 7-day protein/kcal averages — history carries calories only, so the
  // per-day detail is fetched once per mount (days with logged meals only).
  const [weekNutrition, setWeekNutrition] = useState<{ proteinAvg: number | null; kcalAvg: number | null } | null>(null)
  const loadWeekNutrition = useCallback(async () => {
    try {
      const days = lastNDays(7)
      const results = await Promise.all(days.map((d) => api<NutritionDayView>(`/api/nutrition?date=${d}`)))
      let proteinSum = 0
      let kcalSum = 0
      let loggedDays = 0
      for (const r of results) {
        if (r.meals.length > 0) {
          loggedDays++
          proteinSum += r.consumed.protein
          kcalSum += r.consumed.calories
        }
      }
      setWeekNutrition({
        proteinAvg: loggedDays > 0 ? proteinSum / loggedDays : null,
        kcalAvg: loggedDays > 0 ? kcalSum / loggedDays : null,
      })
    } catch {
      setWeekNutrition(null)
    }
  }, [])
  useEffect(() => {
    void loadWeekNutrition()
  }, [loadWeekNutrition])

  // ── check-in form state ──
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(CHECK_FIELDS.map((f) => [f.id, ""]))
  )
  const [busy, setBusy] = useState(false)
  // Changed-field feedback — brief amber LOGGED flash on the fields just committed.
  const [loggedFlash, setLoggedFlash] = useState<string[]>([])

  const series = metrics.data?.series
  useEffect(() => {
    if (!series) return
    setForm(
      Object.fromEntries(
        CHECK_FIELDS.map((f) => {
          const v = series[f.id]?.find((p) => p.day === date)?.value
          return [f.id, v === undefined ? "" : String(v)]
        })
      )
    )
  }, [date, series])

  const checkedIn = useMemo(
    () => CHECK_FIELDS.some((f) => (series?.[f.id] ?? []).some((p) => p.day === date)),
    [series, date]
  )

  const today = dayKey()

  const commit = async () => {
    if (busy) return
    const posts: { type: string; value: number }[] = []
    for (const f of CHECK_FIELDS) {
      const v = parseNumeric(form[f.id] ?? "")
      if (v === null) continue
      if (v < f.min || v > f.max) {
        pushNotice({ kind: "warn", title: "CHECK-IN REJECTED", body: `${f.label} must be ${f.min}–${f.max} ${f.unit}.` })
        return
      }
      posts.push({ type: f.id, value: v })
    }
    if (posts.length === 0) {
      pushNotice({ kind: "warn", title: "NOTHING TO COMMIT", body: "Enter at least one vital first." })
      return
    }
    setBusy(true)
    try {
      const responses = await Promise.all(
        posts.map((p) =>
          api<MetricPostRes>("/api/metrics", {
            method: "POST",
            body: JSON.stringify({ day: date, type: p.type, value: p.value }),
          })
        )
      )
      const xp = responses.find((r) => r.xpGranted)?.xpGranted
      metrics.reload()
      readinessApi.reload()
      bumpRefresh()
      setLoggedFlash(posts.map((p) => p.type))
      window.setTimeout(() => setLoggedFlash([]), 1800)
      pushNotice({
        kind: "info",
        title: "VITALS COMMITTED",
        body: `${posts.length} metric${posts.length === 1 ? "" : "s"} · ${dayHeadline(date)}`,
      })
      if (xp) pushNotice({ kind: "xp", title: `+${xp} XP`, body: "Vitals check-in" })
    } catch (e) {
      pushNotice({ kind: "warn", title: "CHECK-IN FAILED", body: (e as Error).message })
      metrics.reload()
    } finally {
      setBusy(false)
    }
  }

  // ── derived analytics ──
  const latest = metrics.data?.latest ?? {}
  const profile = metrics.data?.profile
  const readiness = readinessApi.data?.readiness ?? null
  const rhrTrend = readinessApi.data?.rhrTrend ?? null

  const training = useMemo(() => (sessions.data ? weekTraining(sessions.data.history) : null), [sessions.data])
  const sleep = useMemo(() => seriesTrend(series?.sleep), [series])
  const hrTrend = useMemo(() => seriesTrend(series?.restingHr), [series])

  const hydrationHitDays = useMemo(() => {
    if (!nutrition.data) return null
    const target = nutrition.data.targets.waterMl
    return nutrition.data.history.filter((h) => h.waterMl >= target).length
  }, [nutrition.data])

  // R33-b — cold-start guards (strictly the zero/missing-data path; a
  // data-rich hunter — KAEL — fails every one of them):
  // · riskEmpty — every risk-monitor card's latest reading is null
  // · trendsEmpty — no trend series carries ≥2 entries (all four charts
  //   would render their "NEED ≥2 ENTRIES" placeholder)
  const riskEmpty =
    !!metrics.data &&
    !latest.bpSystolic &&
    !latest.bpDiastolic &&
    !latest.restingHr &&
    !latest.spo2 &&
    !latest.hrv &&
    !latest.waist
  const trendsEmpty = !!metrics.data && TREND_SERIES_IDS.every((k) => (series?.[k] ?? []).length < 2)

  const checkinsThisWeek = useMemo(() => {
    if (!series) return null
    const week = new Set(isoWeekDays())
    const days = new Set<string>()
    for (const id of VITAL_SERIES_IDS) {
      for (const p of series[id] ?? []) {
        if (week.has(p.day)) days.add(p.day)
      }
    }
    return days.size
  }, [series])

  const score: HealthScore = useMemo(() => {
    const l = metrics.data?.latest ?? {}
    return healthScore({
      cardioMinutesThisWeek: training ? training.cardioMin : null,
      strengthSessionsThisWeek: training ? training.strengthSessions : null,
      sleep7dAvg: sleep.avg7,
      protein7dAvgG: weekNutrition?.proteinAvg ?? null,
      proteinTargetG: nutrition.data?.targets.protein ?? null,
      kcal7dAvg: weekNutrition?.kcalAvg ?? null,
      kcalTarget: nutrition.data?.targets.calories ?? null,
      waistCm: l.waist?.value ?? null,
      heightCm: metrics.data?.profile.heightCm ?? null,
      bmi: l.bmi?.value ?? null,
      stress: l.stress?.value ?? null,
      energy: l.energy?.value ?? null,
      sleepTrend: sleep.delta,
    })
  }, [training, sleep, weekNutrition, nutrition.data, metrics.data])

  const maintenance: MaintenanceItem[] = useMemo(() => {
    const l = metrics.data?.latest ?? {}
    return maintenanceChecklist({
      cardioMinutesThisWeek: training ? training.cardioMin : null,
      strengthSessionsThisWeek: training ? training.strengthSessions : null,
      sleep7dAvg: sleep.avg7,
      protein7dAvgG: weekNutrition?.proteinAvg ?? null,
      bodyWeightKg: l.weight?.value ?? null,
      hydrationHitDays,
      waistCm: l.waist?.value ?? null,
      heightCm: metrics.data?.profile.heightCm ?? null,
      vitalsCheckinsThisWeek: checkinsThisWeek,
      restingHrDelta: hrTrend.delta,
    })
  }, [training, sleep, weekNutrition, hydrationHitDays, checkinsThisWeek, hrTrend.delta, metrics.data])

  // ── first-load / error states ──
  if (metrics.loading && !metrics.data) {
    return <SkeletonPanel label="CALIBRATING VITAL SENSORS" rows={4} />
  }
  if (metrics.error && !metrics.data) {
    return (
      <div className="sys-panel rounded-sm p-6 text-center">
        <p className="font-mono text-xs tracking-widest text-rose-300">VITAL SENSORS OFFLINE</p>
        <p className="mt-2 font-mono text-[10px] text-zinc-400">{metrics.error}</p>
        <button
          onClick={() => metrics.reload()}
          className="mt-4 h-11 rounded-sm border border-rose-400/50 bg-rose-500/10 px-6 font-mono text-[10px] font-bold tracking-[0.25em] text-rose-200 transition-colors hover:bg-rose-500/20"
        >
          RETRY
        </button>
      </div>
    )
  }

  return (
    // R9 flow — the top zone (oracle, header, readiness hero, check-in)
    // staggers in; the evidence tail below the fold reveals on scroll
    // (FlowReveal). Plain root (not a variant node) keeps whileInView in
    // charge of the below-fold panels.
    <div className="space-y-4 sm:space-y-5">
      <FlowGroup className="space-y-4 sm:space-y-5">
      <FlowItem>
        <OracleTip tab="vitals" />
      </FlowItem>

      {/* R53-b declutter — the tab's own header stood down (icon block +
          "VITALS" decode headline + the "HEALTH MONITORING · ZONES · SCORE ·
          MAINTENANCE" editorial line): the ring nav already names the tab and
          every panel carries its own label, so the landing view keeps a single
          quiet structure instead of a double headline. */}

      {/* ── readiness hero + daily check-in ─────────────────────────── */}
      <FlowItem>
      <ReadinessPanel
        readiness={readiness}
        rhrTrend={rhrTrend}
        sleepAvg7={sleep.avg7}
        syncing={readinessApi.loading && !readinessApi.data}
        offline={!!readinessApi.error && !readinessApi.data}
      />
      </FlowItem>

      {/* ── 1 · daily check-in ──────────────────────────────────────────── */}
      <FlowItem>
      <SystemPanel
        label="Daily Check-In"
        labelAccent={
          <span className="flex items-center gap-2">
            {/* R53-b — the AHA-method line + "one reading ≠ diagnosis" caveat
                folded off the surface into this pop-up (glossary body + the
                health.ts caveat, one source of truth). */}
            <InfoHint label="Daily Check-In" body={`${GLOSSARY.checkIn.body} ${BP_METHOD_CAVEAT}`} />
            {checkedIn ? (
              <span
                title="Checked in today — update below"
                aria-label="Checked in today"
                className="inline-flex items-center rounded-sm border border-zinc-400/30 bg-zinc-500/10 px-1.5 py-0.5 text-zinc-200"
              >
                <CheckCircle2 className="h-3 w-3" aria-hidden />
              </span>
            ) : (
              <span className="font-mono text-[9px] tracking-[0.18em] text-zinc-400">PENDING</span>
            )}
          </span>
        }
      >
        <div className="p-4 sm:p-5">
          {/* date navigator */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDate(shiftDay(date, -1))}
              className="grid h-10 w-10 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next day"
              disabled={date >= today}
              onClick={() => setDate(shiftDay(date, 1))}
              className="grid h-10 w-10 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 disabled:opacity-30 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="font-mono text-xs font-bold tracking-[0.25em] text-rose-200">{dayHeadline(date)}</p>
              {/* R55-b declutter — long weekday form rides the title; the
                  surface keeps the short date (the day word is derivable). */}
              <p className="mt-0.5 font-mono text-[9px] tracking-wider text-zinc-400" title={weekdayLong(date)}>
                {formatDayLabel(date).toUpperCase()}
              </p>
            </div>
            {date !== today && (
              <button
                type="button"
                onClick={() => setDate(today)}
                className="ml-auto h-8 rounded-sm border border-violet-500/40 bg-violet-500/10 px-3 font-mono text-[9px] font-bold tracking-[0.2em] text-violet-300 transition-colors hover:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                JUMP TO TODAY
              </button>
            )}
          </div>

          {/* BP pair */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CHECK_FIELDS.slice(0, 2).map((f) => (
              <NumRow
                key={f.id}
                label={f.label}
                unit={f.unit}
                value={form[f.id] ?? ""}
                min={f.min}
                max={f.max}
                step={f.step}
                fallback={f.fallback}
                typical={f.typical}
                flash={loggedFlash.includes(f.id)}
                onChange={(v) => setForm((s) => ({ ...s, [f.id]: v }))}
              />
            ))}
          </div>

          {/* remaining vitals */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHECK_FIELDS.slice(2).map((f) => (
              <NumRow
                key={f.id}
                label={f.label}
                unit={f.unit}
                value={form[f.id] ?? ""}
                min={f.min}
                max={f.max}
                step={f.step}
                fallback={f.fallback}
                optional={f.optional}
                typical={f.typical}
                note={f.note}
                flash={loggedFlash.includes(f.id)}
                onChange={(v) => setForm((s) => ({ ...s, [f.id]: v }))}
              />
            ))}
          </div>

          {/* R53-b declutter — the AHA-method line ("MEASURE SEATED · 5 MIN
              RESTED …") and the R6-c RHR-recovery principle line stood down
              from the surface: the method rides the "?" pop-up on the panel
              label, the RHR principle rides the REST HR input's title. */}

          <button
            type="button"
            onClick={commit}
            disabled={busy}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-rose-400/60 bg-rose-500/20 font-mono text-xs font-bold tracking-[0.25em] text-rose-100 uppercase transition-all hover:bg-rose-500/40 hover:shadow-[0_0_22px_rgba(244,63,94,0.35)] active:bg-rose-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <HeartPulse className="h-4 w-4" aria-hidden />
            {busy ? "COMMITTING…" : checkedIn ? "UPDATE CHECK-IN" : "COMMIT CHECK-IN"}
          </button>
        </div>
      </SystemPanel>
      </FlowItem>
      </FlowGroup>

      {/* ── risk monitor + health score (scroll-revealed) ───────────── */}
      <FlowReveal>
        {riskEmpty ? (
          <EmptySurface
            label="RISK MONITOR"
            line="YOUR LATEST VITAL ZONES WILL LIVE HERE"
            hint="BP · REST HR · SPO₂ · HRV · WAIST — THE CHECK-IN ABOVE ACTIVATES EACH CARD"
            glyph
          />
        ) : (
          <RiskMonitor latest={latest} heightCm={profile?.heightCm ?? null} rhrTrend={rhrTrend} />
        )}
      </FlowReveal>

      <FlowReveal>
        <HealthScorePanel score={score} />
      </FlowReveal>

      {/* ── 30-day charts + maintenance + lab ───────────────────────── */}
      <FlowReveal>
        {trendsEmpty ? (
          <EmptySurface
            label="VITAL TRENDS"
            line="30-DAY TREND CHARTS DRAW FROM YOUR CHECK-INS"
            hint="TWO ENTRIES START A LINE — THE CHECK-IN ABOVE FEEDS ALL FOUR CHARTS"
          />
        ) : (
          <TrendsPanel series={series} />
        )}
      </FlowReveal>

      <FlowReveal>
        <MaintenancePanel items={maintenance} />
      </FlowReveal>

      <FlowReveal>
      {/* R55-b declutter — the section's "FITNESS TESTING LAB" header stood
          down (the lab's own panels carry their labels); the R6-c cardio
          science line keeps riding the section's title attribute. */}
      <section
        aria-label="Fitness testing lab"
        title="VO₂ baseline — 150 min/wk moderate cardio supports health (ACSM)"
      >
        <TestLab />
      </section>
      </FlowReveal>

      {/* ── sensor hub (R20-b: BLE chest-strap HR, MAX HR override,
          GPS + device telemetry — honest unsupported states) ── */}
      <FlowReveal>
        {/* birthYear rides the metrics profile this tab already fetched
            (HunterDTO carries no birth year — the /api/metrics profile is
            the honest source; no extra request, no shared-type change) */}
        <SensorHub birthYear={metrics.data?.profile.birthYear ?? null} />
      </FlowReveal>
    </div>
  )
}

// ── Daily readiness (R1-b) ───────────────────────────────────────────────────

const READINESS_BAND_CHIP: Record<string, string> = {
  // R43 studio — PRIMED is the gold CTA moment (matches the health.ts hex).
  PRIMED: "border-amber-400/50 bg-amber-500/15 text-amber-300",
  READY: "border-teal-400/50 bg-teal-500/15 text-teal-200",
  MODERATE: "border-amber-400/50 bg-amber-500/15 text-amber-300",
  "BACK OFF": "border-rose-500/60 bg-rose-500/20 text-rose-200",
}

function ReadinessPanel({
  readiness,
  rhrTrend,
  sleepAvg7,
  syncing,
  offline,
}: {
  readiness: ReadinessView | null
  rhrTrend: RhrTrendView | null
  /** 7-day sleep average (h) from the tab's own series — feeds the evidence line. */
  sleepAvg7: number | null
  syncing: boolean
  offline: boolean
}) {
  const { speak, voiceEnabled } = useSystem()
  // hero numeral (R4-c) — the score counts up when readiness data lands
  const scoreUp = useCountUp(readiness?.score ?? 0, 0.9)

  // R15-b live-moment breathe — committing a check-in reloads readiness on
  // camera; when the composite score actually changes while mounted, the
  // dial breathes once (1.02, 0.45s). First data land / remounts never pulse
  // (prev seeds null); reduced motion stands down entirely. Refs +
  // imperative animate() — no setState-in-effect.
  const reduce = !!useReducedMotion()
  const dialRef = useRef<HTMLDivElement | null>(null)
  const prevScoreRef = useRef<number | null>(null)
  const score = readiness?.score
  useEffect(() => {
    const prev = prevScoreRef.current
    prevScoreRef.current = score ?? null
    if (prev === null || score === undefined || score === prev || reduce) return
    if (dialRef.current) void pulseBreathe(dialRef.current)
  }, [score, reduce])

  // evidence line (R6-c) — exactly ONE line, keyed to the current state:
  // short sleep outranks everything, then the readiness band. No stacking.
  const evidence =
    sleepAvg7 !== null && sleepAvg7 < 7
      ? { text: "7-9H SLEEP IS THE RECOVERY MULTIPLIER", cite: "HIRSHKOWITZ 2015" }
      : readiness && (readiness.band === "MODERATE" || readiness.band === "BACK OFF")
        ? { text: "LOW READINESS — TRAIN AT 3+ RIR OR SWAP INTENSITY FOR VOLUME", cite: "ROBINSON 2024 PRINCIPLE" }
        : readiness
          ? { text: "GREEN LIGHT — PUSH TOP SETS TO 1-2 RIR TODAY", cite: "ROBINSON 2024" }
          : null

  const speakSummary = () => {
    if (!readiness) return
    const meta = READINESS_BAND_META[readiness.band]
    const drivers =
      readiness.drivers.length > 0
        ? ` Drivers: ${readiness.drivers
            .map((d) => `${d.label.replace("−", " minus ").replace("+", " plus ")} ${d.delta > 0 ? "plus" : "minus"} ${Math.abs(d.delta)}`)
            .join(", ")}.`
        : ""
    speak(`Daily readiness: ${readiness.band}, ${readiness.score} of 100. ${meta.advice}${drivers}`)
  }

  const labelAccent = readiness ? (
    <span className="flex items-center gap-2">
      {/* R53-b — the readiness meaning rides the "?" pop-up (R52 glossary). */}
      <InfoHint term="readiness" />
      <button
        type="button"
        onClick={speakSummary}
        aria-label="Speak the daily readiness summary"
        title={voiceEnabled ? "Speak the daily readiness summary" : "Voice muted — enable it in the Status tab"}
        className="flex h-8 items-center gap-1.5 rounded-sm border border-rose-400/40 bg-rose-500/10 px-2.5 font-mono text-[9px] font-bold tracking-[0.2em] text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <Volume2 className="h-3 w-3" aria-hidden />
        <span className="hidden sm:inline">SPEAK</span>
      </button>
    </span>
  ) : (
    <span className="flex items-center gap-2">
      <InfoHint term="readiness" />
      <span className="font-mono text-[9px] tracking-[0.18em] text-zinc-400">{syncing ? "SYNCING…" : offline ? "OFFLINE" : "NO VITALS TODAY"}</span>
    </span>
  )

  return (
    <SystemPanel label="Daily Readiness" labelAccent={labelAccent}>
      <div className="p-4 sm:p-5">
        {readiness ? (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {/* score dial — R9 display moment: the readiness score as a
                  breathing numeral (bloom keyed to the band; BACK OFF stays
                  static — alarm states don't breathe) */}
              <div
                ref={dialRef}
                className="shrink-0"
                role="img"
                aria-label={`Readiness ${readiness.score} of 100, ${readiness.band}`}
              >
                <p
                  className={cn(
                    "sys-display sys-display-lg",
                    readiness.band === "PRIMED" && "sys-bloom-amber",
                    readiness.band === "READY" && "sys-bloom-teal",
                    readiness.band === "MODERATE" && "sys-bloom-amber"
                  )}
                  style={{
                    color: READINESS_BAND_META[readiness.band].hex,
                    textShadow: `0 0 18px ${READINESS_BAND_META[readiness.band].hex}55`,
                  }}
                >
                  {Math.round(scoreUp)}
                </p>
                <p className="mt-1.5 font-mono text-[9px] tracking-[0.25em] text-zinc-400">OF 100</p>
              </div>
              <div className="min-w-0 flex-1">
                {/* R55-b declutter — the band-advice verdict sentence folds to
                    this row's title (the band chip + score + colored meter
                    carry the verdict at a glance); the R6-c evidence line +
                    both citations keep riding the same title for hover/AT. */}
                <div
                  className="flex flex-wrap items-center gap-2"
                  title={
                    [
                      READINESS_BAND_META[readiness.band].advice,
                      evidence ? `${evidence.text}${evidence.cite ? ` (${evidence.cite})` : ""}` : "",
                      READINESS_CITATION,
                    ]
                      .filter(Boolean)
                      .join(" — ")
                  }
                >
                  <span
                    className={cn(
                      "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
                      READINESS_BAND_CHIP[readiness.band]
                    )}
                  >
                    {readiness.band}
                  </span>
                  <span className="font-mono text-[8px] tracking-[0.15em] text-zinc-400">
                    {readiness.drivers.length > 0 ? `${readiness.drivers.length} DRIVER${readiness.drivers.length === 1 ? "" : "S"}` : "NO DRIVERS"}
                  </span>
                </div>
                <div className="relative mt-2 h-1.5 overflow-hidden rounded-sm bg-zinc-900/80">
                  {/* R15-b — MeterFlow fill: mounts from 0 and sweeps to the
                      score (0.9s, lockstep with the dial numeral above — this
                      bar lives above the fold, so a plain mount sweep); live
                      check-in commits glide on the same curve. Band hex rides
                      the style prop; R9 sys-seg skin unchanged. */}
                  <MeterFlow
                    pct={readiness.score}
                    duration={0.9}
                    className="h-full rounded-sm"
                    style={{ background: READINESS_BAND_META[readiness.band].hex }}
                  />
                  {/* R9 segmented-meter skin — hard stops over the fill */}
                  <span className="sys-seg" aria-hidden />
                </div>
                {/* R53-b declutter — ONE verdict line stayed on the surface
                    until R55-b: the band advice now folds to the chip row's
                    title above (band chip + colored meter carry the verdict);
                    evidence + citations ride that same title. */}
              </div>
            </div>

            {readiness.drivers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {readiness.drivers.map((d) => (
                  <span
                    key={d.label}
                    title={`${d.label} ${d.delta > 0 ? "+" : "−"}${Math.abs(d.delta)} points`}
                    className={cn(
                      "inline-flex items-baseline gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] tabular-nums",
                      d.delta > 0
                        ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                        : "border-rose-400/40 bg-rose-500/10 text-rose-300"
                    )}
                  >
                    {d.label}
                    <span aria-hidden>{d.delta > 0 ? `+${d.delta}` : `−${Math.abs(d.delta)}`}</span>
                    <span className="sr-only">{d.delta > 0 ? `plus ${d.delta}` : `minus ${Math.abs(d.delta)}`} points</span>
                  </span>
                ))}
              </div>
            )}

            {rhrTrend && (
              <p
                className="mt-2 font-mono text-[8px] tracking-[0.12em] text-zinc-400"
                title={`RHR trend — latest resting HR vs your 7-day baseline (${rhrTrend.baseline} bpm). ${rhrTrend.title}.`}
              >
                RHR {rhrTrend.deviation > 0 ? "+" : "−"}{Math.abs(rhrTrend.deviation)} VS {rhrTrend.baseline} BPM · {rhrTrend.title.toUpperCase()}
              </p>
            )}
          </>
        ) : (
          <div className="text-center">
            {/* R53-b declutter — the two dramatic caps lines became one quiet
                sentence-case line; what feeds the score rides the "?" pop-up
                on the panel label (readiness glossary). */}
            <p
              className="font-mono text-[10px] tracking-[0.2em] text-zinc-400"
              title="No check-in yet today — log below to unlock readiness"
            >
              {syncing ? "Syncing readiness…" : offline ? "Readiness sensors offline" : "No check-in yet today."}
            </p>
          </div>
        )}
      </div>
    </SystemPanel>
  )
}

// ── Risk monitor ──────────────────────────────────────────────────────────────

/** R9 left-accent hue for a risk card — keyed to its zone tone
 *  (display-only scan aid; the zone chips stay the source of truth). */
function zoneAccent(tone: ZoneTone | undefined): string {
  switch (tone) {
    case "ok":
      return "rgba(45,212,191,.55)"
    case "watch":
      return "rgba(251,191,36,.55)"
    case "warn":
      return "rgba(244,63,94,.55)"
    case "danger":
      return "rgba(244,63,94,.8)"
    default:
      return "rgba(228,228,231,.35)"
  }
}

function RiskCard({
  icon: Icon,
  title,
  accent,
  hover,
  info,
  i = 0,
  children,
}: {
  icon: LucideIcon
  title: string
  /** Left-edge hue (zone-tone keyed) for the borderless row treatment. */
  accent: string
  /** R53-b declutter — the verdict sentence + citation folded off the surface
   *  into the card's title attribute (hover / AT reachable). */
  hover?: string
  /** Optional InfoHint beside the card label (e.g. the HRV meaning). */
  info?: React.ReactNode
  /** Grid slot for the R15-b scroll-in stagger. */
  i?: number
  children: React.ReactNode
}) {
  // R15-b — the zone tiles rise per grid slot when scrolled into view (the
  // ZONES section sits below the fold, so the stagger waits for the reader);
  // reduced motion → final state. Motion rides the existing accent row.
  const reduce = !!useReducedMotion()
  return (
    <motion.div
      className="sys-accent-row rounded-r-sm p-3.5"
      style={{ "--row-accent": accent } as React.CSSProperties}
      title={hover}
      {...riseInView(reduce, i)}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-rose-300/70" aria-hidden />
        <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-400">{title}</p>
        {info}
      </div>
      {children}
    </motion.div>
  )
}

function RiskMonitor({
  latest,
  heightCm,
  rhrTrend,
}: {
  latest: Record<string, LatestMetric | null>
  heightCm: number | null
  rhrTrend: RhrTrendView | null
}) {
  const sys = latest.bpSystolic
  const dia = latest.bpDiastolic
  const bp = sys && dia ? bpZone(sys.value, dia.value) : null
  const hr = latest.restingHr ? hrZone(latest.restingHr.value) : null
  const spo2 = latest.spo2 ? spo2Zone(latest.spo2.value) : null
  const hrv = latest.hrv
  const hrvInfo = hrvNote()
  const waist = latest.waist
  const whtr = waist && heightCm ? waist.value / heightCm : null

  return (
    <SystemPanel
      label="Risk Monitor"
      labelAccent={
        <span className="flex items-center gap-2" title="Latest logged zones — one reading is never a diagnosis">
          <span className="font-mono text-[9px] tabular-nums tracking-[0.18em] text-zinc-400">LATEST</span>
          {/* R53-b — "one reading ≠ diagnosis / averages over time" rides the
              zones pop-up instead of repeating under every card. */}
          <InfoHint term="zones" />
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        {bp?.tone === "danger" && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-sm border border-rose-600/70 bg-rose-600/15 p-4 shadow-[0_0_24px_rgba(225,29,72,0.35)]"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" aria-hidden />
            <div className="min-w-0">
              <p className="font-mono text-xs font-bold tracking-[0.2em] text-rose-100">
                BP CRISIS ZONE — {sys?.value}/{dia?.value} mmHg
              </p>
              <p className="mt-1 text-xs leading-snug text-rose-200">{bp.action}</p>
              <p className="mt-1.5 font-mono text-[8px] tracking-wide text-rose-300/60">{bp.citation}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {/* BP — R53-b: verdict sentence + ACC/AHA citation ride the card title;
              R55-b: label compacts to BP (full name rides the same title) */}
          <div className="col-span-2 lg:col-span-1">
            <RiskCard
              icon={Gauge}
              title="BP"
              accent={zoneAccent(bp?.tone)}
              i={0}
              hover={sys && dia ? `Blood pressure — ${bp!.action} ${bp!.citation}` : undefined}
            >
              {sys && dia ? (
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <p className="font-mono text-2xl font-bold tabular-nums text-rose-100">
                    <CountNum value={sys.value} />
                    <span className="text-rose-300/60">/</span>
                    <CountNum value={dia.value} />
                  </p>
                  <span className="font-mono text-[9px] tracking-wider text-zinc-400">mmHg</span>
                  <ZoneChip zone={bp!} />
                </div>
              ) : (
                <div className="mt-3">
                  <p className="font-mono text-2xl font-bold tabular-nums text-zinc-500">
                    {sys ? `${sys.value}/—` : dia ? `—/${dia.value}` : "—"}
                  </p>
                  <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-wider text-zinc-400">
                    {sys || dia ? "LOG BOTH BP NUMBERS TO ZONE" : "NO DATA · LOG ONCE TO ACTIVATE"}
                  </p>
                </div>
              )}
            </RiskCard>
          </div>

          {/* Resting HR — R53-b: verdict + baseline context + citation ride the
              card title; R55-b: label compacts to RHR + the rhr glossary pop-up */}
          <RiskCard
            icon={Activity}
            title="RHR"
            accent={zoneAccent(hr?.tone)}
            i={1}
            info={<InfoHint term="rhr" />}
            hover={
              latest.restingHr
                ? `Resting heart rate — ${hr!.action} ${hr!.citation}${rhrTrend ? ` · 7-day baseline ${rhrTrend.baseline} bpm — ${rhrTrend.title}` : ""}`
                : undefined
            }
          >
            {latest.restingHr ? (
              <>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <p className="font-mono text-2xl font-bold tabular-nums text-rose-100">
                    <CountNum value={latest.restingHr.value} />
                  </p>
                  <span className="font-mono text-[9px] tracking-wider text-zinc-400">bpm</span>
                  <ZoneChip zone={hr!} />
                  {rhrTrend && rhrTrend.deviation > 6 && (
                    <span
                      role="status"
                      title={rhrTrend.title}
                      className="inline-flex items-center gap-1 rounded-sm border border-rose-400/50 bg-rose-500/15 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] text-rose-300"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden /> RHR +{rhrTrend.deviation} BPM VS BASELINE
                    </span>
                  )}
                  {rhrTrend && rhrTrend.deviation < -6 && (
                    <span
                      role="status"
                      title={rhrTrend.title}
                      className="inline-flex items-center gap-1 rounded-sm border border-teal-400/50 bg-teal-500/15 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em] text-teal-200"
                    >
                      RHR −{Math.abs(rhrTrend.deviation)} BPM VS BASELINE
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-3 font-mono text-[10px] tracking-wider text-zinc-400">NO DATA · LOG ONCE TO ACTIVATE</p>
            )}
          </RiskCard>

          {/* SpO₂ — R53-b: verdict + accuracy caveat ride the card title;
              R55-b: label compacts to SPO₂ (full name rides the same title) */}
          <RiskCard
            icon={Wind}
            title="SPO₂"
            accent={zoneAccent(spo2?.tone)}
            i={2}
            hover={latest.spo2 ? `Blood oxygen saturation — ${spo2!.action} ${spo2!.citation}` : undefined}
          >
            {latest.spo2 ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <p className="font-mono text-2xl font-bold tabular-nums text-rose-100">
                  <CountNum value={latest.spo2.value} />
                </p>
                <span className="font-mono text-[9px] tracking-wider text-zinc-400">%</span>
                <ZoneChip zone={spo2!} />
              </div>
            ) : (
              <p className="mt-3 font-mono text-[10px] tracking-wider text-zinc-400">NO DATA · LOG ONCE TO ACTIVATE</p>
            )}
          </RiskCard>

          {/* HRV — R53-b: the RMSSD guidance + citation ride the card title;
              the plain-language meaning rides the "?" pop-up on the label;
              R55-b: label compacts to HRV, the TREND > VALUE chip folds into
              the same title (hrvInfo.title leads it) */}
          <RiskCard
            icon={Waves}
            title="HRV"
            accent={zoneAccent(undefined)}
            i={3}
            info={<InfoHint term="hrv" />}
            hover={hrv ? `${hrvInfo.title} — ${hrvInfo.body} ${hrvInfo.citation}` : undefined}
          >
            {hrv ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <p className="font-mono text-2xl font-bold tabular-nums text-rose-100">
                  <CountNum value={hrv.value} />
                </p>
                <span className="font-mono text-[9px] tracking-wider text-zinc-400">ms</span>
              </div>
            ) : (
              <p className="mt-3 font-mono text-[10px] tracking-wider text-zinc-400">NO DATA · LOG ONCE TO ACTIVATE</p>
            )}
          </RiskCard>

          {/* Waist / height — R53-b: verdict + Ashwell citation ride the card title */}
          <RiskCard
            icon={Ruler}
            title="WAIST÷HT"
            accent={zoneAccent(whtr !== null ? (whtr < 0.5 ? "ok" : "watch") : undefined)}
            i={4}
            hover={
              whtr !== null
                ? `Waist ÷ height — ${waist?.value} cm waist ÷ ${heightCm} cm height — ${whtr < 0.5 ? "under" : "at or over"} the half-height line. Ashwell et al. 2012 — keep your waist less than half your height`
                : undefined
            }
          >
            {whtr !== null ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <p className="font-mono text-2xl font-bold tabular-nums text-rose-100">
                  <CountNum value={whtr} decimals={2} />
                </p>
                <ZoneChip
                  zone={{
                    label: whtr < 0.5 ? "Keep" : "Over",
                    tone: whtr < 0.5 ? "ok" : "watch",
                    action: "",
                    citation: "",
                  }}
                />
              </div>
            ) : (
              <p
                className="mt-3 font-mono text-[10px] tracking-wider text-zinc-400"
                title={`No waist-to-height ratio yet${!waist ? " — log waist in the Body tab" : ""}${waist && !heightCm ? " — set height in Fuel" : ""}`}
              >
                NO DATA
              </p>
            )}
          </RiskCard>
        </div>
      </div>
    </SystemPanel>
  )
}

// ── Health score ──────────────────────────────────────────────────────────────

function scoreColor(v: number): string {
  // R43 studio ramp — gold ≥80 (prime), ivory 60–79 (solid), amber 40–59
  // (caution), rose below (poor).
  if (v >= 80) return "#fbbf24"
  if (v >= 60) return "#e4e4e7"
  if (v >= 40) return "#f59e0b"
  return "#fb7185"
}

function HealthScorePanel({ score }: { score: HealthScore }) {
  const reduce = !!useReducedMotion()
  const R = 70
  const C = 2 * Math.PI * R
  const total = score.total
  const inputs = score.parts.filter((p) => p.score !== null).length
  // R9 — the ring numeral counts up when the score lands (supporting cast;
  // the readiness dial above stays the tab's bloomed hero). R15-b — the
  // ZONES panel sits below the fold, so the ring arc, its numeral AND the
  // subscore fills now all wait for the reader (useInView once) and resolve
  // in one 0.9s lockstep beat when the panel arrives; live score changes
  // (check-in commit) glide on the same curve.
  const ringWrapRef = useRef<HTMLDivElement | null>(null)
  const ringInView = useInView(ringWrapRef, { once: true, margin: "-8% 0px" })
  const drawn = reduce || ringInView ? (total ?? 0) : 0
  const totalUp = useCountUp(drawn, 0.9)

  return (
    <SystemPanel
      label="Health Score"
      labelAccent={
        <span
          className="font-mono text-[9px] tabular-nums tracking-[0.18em] text-zinc-400"
          title={`${inputs} of 6 inputs live — missing inputs are excluded, never guessed`}
        >
          {inputs}/6 LIVE
        </span>
      }
    >
      <div className="flex flex-col items-center gap-6 p-4 sm:p-6 lg:flex-row lg:items-center">
        {/* radial ring */}
        <div ref={ringWrapRef} className="relative shrink-0" role="img" aria-label={total !== null ? `Health score ${total} of 100` : "Health score unavailable"}>
          <svg viewBox="0 0 170 170" className="h-44 w-44">
            <circle cx="85" cy="85" r={R} fill="none" stroke="#27272a" strokeWidth="12" />
            {/* R15-b — arc sweep on the signature ease (was easeOut), gated on
                the reader's arrival via `drawn` (0 until in view), and reduce →
                duration 0 so live updates stay instant under reduced motion. */}
            {total !== null && (
              <motion.circle
                cx="85"
                cy="85"
                r={R}
                fill="none"
                stroke={scoreColor(total)}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                initial={reduce ? false : { strokeDashoffset: C }}
                animate={{ strokeDashoffset: C * (1 - drawn / 100) }}
                transition={reduce ? { duration: 0 } : { duration: 0.9, ease: FLOW_EASE }}
                transform="rotate(-90 85 85)"
                style={{ filter: `drop-shadow(0 0 9px ${scoreColor(total)}66)` }}
              />
            )}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            {total !== null ? (
              <div>
                <p className="sys-display sys-display-md text-glow-violet" style={{ color: scoreColor(total) }}>
                  {Math.round(totalUp)}
                </p>
                <p className="mt-1 font-mono text-[9px] tracking-[0.25em] text-zinc-400">OF 100</p>
              </div>
            ) : (
              <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-400">NO DATA</p>
            )}
          </div>
        </div>

        {/* subscore bars — R53-b: the "estimates from logged data / never
            guessed" honesty line rides this column's title attribute */}
        <div
          className="w-full min-w-0 space-y-2.5"
          title="Estimates from your logged data — missing inputs are excluded, never guessed"
        >
          {score.parts.map((p) => (
            <div key={p.id} title={p.citation} className="group">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-400">{p.label.toUpperCase()}</p>
                <p
                  className="font-mono text-sm font-bold tabular-nums"
                  style={{ color: p.score === null ? "#52525b" : scoreColor(p.score) }}
                >
                  {p.score === null ? "NO DATA" : <CountNum value={p.score} />}
                </p>
              </div>
              <div className="relative mt-1 h-1.5 overflow-hidden rounded-sm bg-zinc-900/80">
                {/* R15-b — MeterFlow fill with inView: this section sits below
                    the fold, so the sweep waits for the reader (once, ~8% in)
                    instead of firing while the row is invisible; later score
                    changes glide on the same curve. scoreColor rides the style
                    prop; R9 sys-seg skin unchanged. */}
                <MeterFlow
                  pct={p.score ?? 0}
                  inView
                  className="h-full rounded-sm"
                  style={{ background: p.score === null ? "transparent" : scoreColor(p.score) }}
                />
                {/* R9 segmented-meter skin — hard stops over the fill */}
                <span className="sys-seg" aria-hidden />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SystemPanel>
  )
}

// ── Trends ────────────────────────────────────────────────────────────────────

type TooltipEntry = { dataKey?: string | number; name?: string; value?: number | string; stroke?: string }

function TrendTooltip({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  suffix?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-3 py-2">
      <p className="sys-label text-[9px] text-zinc-400">{label ? formatDayLabel(label) : ""}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="mt-0.5 font-mono text-xs tabular-nums" style={{ color: p.stroke ?? "#e4e4e7" }}>
          {p.name}: {p.value}
          {suffix ?? ""}
        </p>
      ))}
    </div>
  )
}

type TrendLineDef = { key: string; name: string; color: string; dashed?: boolean }

type TrendAreaDef = { y1?: number; y2?: number; fill: string }

function TrendChart({
  data,
  lines,
  domain,
  reversed,
  refLines,
  refAreas,
  suffix,
}: {
  data: Record<string, string | number | null>[]
  lines: TrendLineDef[]
  domain?: [number | string, number | string]
  reversed?: boolean
  refLines?: { y: number; color: string }[]
  /** Background zones (Recharts ReferenceArea) — drawn under the lines. */
  refAreas?: TrendAreaDef[]
  suffix?: string
}) {
  if (data.length < 2) {
    return (
      <p className="py-10 text-center font-mono text-[10px] tracking-[0.2em] text-zinc-400">
        NEED ≥2 ENTRIES TO DRAW THIS TREND
      </p>
    )
  }
  return (
    <div className="h-40 sm:h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="rgba(228,228,231,0.08)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDayLabel(d)}
            tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
            axisLine={{ stroke: "rgba(228,228,231,0.15)" }}
            tickLine={false}
            interval="preserveStartEnd"
            /* R56 — tick densification across all four trend mini-charts
             * (hover Tooltip keeps every reading reachable). */
            minTickGap={48}
          />
          <YAxis
            domain={domain}
            reversed={reversed}
            tickCount={3}
            tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<TrendTooltip suffix={suffix} />} cursor={{ stroke: "rgba(228,228,231,0.3)" }} />
          {refAreas?.map((a, i) => (
            <ReferenceArea
              key={`area-${i}`}
              y1={a.y1}
              y2={a.y2}
              fill={a.fill}
              fillOpacity={1}
              stroke=""
              ifOverflow="extendDomain"
            />
          ))}
          {refLines?.map((r) => (
            <ReferenceLine key={r.y} y={r.y} stroke={r.color} strokeDasharray="4 4" strokeOpacity={0.45} />
          ))}
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dashed ? "5 4" : undefined}
              dot={false}
              connectNulls
              activeDot={{ r: 4, fill: l.color, stroke: "#060607" }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function chartTitle(title: string) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-400">{title}</p>
    </div>
  )
}

function TrendsPanel({ series }: { series: Record<string, { day: string; value: number }[]> | undefined }) {
  // R15-b — the four chart blocks rise per slot on scroll-in (below-fold
  // panel, stagger waits for the reader); reduced motion → final state.
  const reduce = !!useReducedMotion()
  const hrData = (series?.restingHr ?? []).map((p) => ({ day: p.day, hr: p.value }))
  const stressData = (series?.stress ?? []).map((p) => ({ day: p.day, stress: p.value }))

  // mood + energy merged on a shared day axis
  const moodEnergyMap = new Map<string, Record<string, string | number | null>>()
  for (const p of series?.mood ?? []) moodEnergyMap.set(p.day, { day: p.day, mood: p.value, energy: null })
  for (const p of series?.energy ?? []) {
    const row = moodEnergyMap.get(p.day) ?? { day: p.day, mood: null }
    row.energy = p.value
    moodEnergyMap.set(p.day, row)
  }
  const moodEnergyData = [...moodEnergyMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)))

  // 7-day trailing moving average of the mood+energy day-mean (R1-b) — needs
  // ≥3 days inside the window before a point is drawn (honest start-up gap).
  const moodAvgByDay = new Map<string, number>()
  for (const row of moodEnergyData) {
    const vals = [row.mood, row.energy].filter((v): v is number => typeof v === "number")
    if (vals.length > 0) moodAvgByDay.set(String(row.day), vals.reduce((a, b) => a + b, 0) / vals.length)
  }
  const moodDaysSorted = [...moodAvgByDay.keys()].sort()
  for (const row of moodEnergyData) {
    const day = String(row.day)
    const lo = shiftDay(day, -6)
    const window = moodDaysSorted.filter((w) => w >= lo && w <= day)
    row.trend =
      window.length >= 3
        ? Math.round((window.reduce((acc, w) => acc + (moodAvgByDay.get(w) ?? 0), 0) / window.length) * 10) / 10
        : null
  }

  // BP merged on a shared day axis
  const bpMap = new Map<string, Record<string, string | number | null>>()
  for (const p of series?.bpSystolic ?? []) bpMap.set(p.day, { day: p.day, sys: p.value, dia: null })
  for (const p of series?.bpDiastolic ?? []) {
    const row = bpMap.get(p.day) ?? { day: p.day, sys: null }
    row.dia = p.value
    bpMap.set(p.day, row)
  }
  const bpData = [...bpMap.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)))

  // RHR zone chart domain — always wide enough to show the 50–60 / 60–80 / 80+ zones
  const hrValues = hrData.map((p) => p.hr)
  const hrDomain: [number, number] = [
    Math.min(50, (hrValues.length > 0 ? Math.floor(Math.min(...hrValues)) : 55) - 5),
    Math.max(95, (hrValues.length > 0 ? Math.ceil(Math.max(...hrValues)) : 65) + 5),
  ]

  return (
    <SystemPanel
      label="Vital Trends"
      labelAccent={
        <span className="font-mono text-[9px] tracking-[0.18em] text-zinc-400" title="Last 30 logged entries per metric">
          LAST 30
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-2">
        {/* R53-b declutter — the chart-zone / axis / reference-line accents
            folded into each block's title (charts + axis labels stay). */}
        <motion.div {...riseInView(reduce, 0)} title="Zones · 50–60 trained · 60–80 normal · 80+ elevated">
          {chartTitle("RESTING HR")}
          <TrendChart
            data={hrData}
            lines={[{ key: "hr", name: "Rest HR", color: "#e4e4e7" }]}
            domain={hrDomain}
            refAreas={[
              { y1: 50, y2: 60, fill: "rgba(45,212,191,0.10)" },
              { y1: 60, y2: 80, fill: "rgba(63,63,70,0.10)" },
              { y1: 80, fill: "rgba(244,63,94,0.12)" },
            ]}
            suffix=" bpm"
          />
        </motion.div>
        <motion.div {...riseInView(reduce, 1)} title="Lower is better — axis inverted">
          {chartTitle("STRESS")}
          <TrendChart
            data={stressData}
            lines={[{ key: "stress", name: "Stress", color: "#fb7185" }]}
            domain={[0, 10]}
            reversed
            suffix=" /10"
          />
        </motion.div>
        <motion.div {...riseInView(reduce, 2)} title="1–5 scale · dashed teal — 7-day trend">
          {chartTitle("MOOD + ENERGY")}
          <TrendChart
            data={moodEnergyData}
            lines={[
              { key: "mood", name: "Mood", color: "#2dd4bf" },
              { key: "energy", name: "Energy", color: "#fbbf24" },
              { key: "trend", name: "7-Day Trend", color: "#14b8a6", dashed: true },
            ]}
            domain={[1, 5]}
            suffix=" /5"
          />
        </motion.div>
        <motion.div {...riseInView(reduce, 3)} title="Dashed — AHA 120/80 normal edge · 130/85 stage-1 edge">
          {chartTitle("BP")}
          <TrendChart
            data={bpData}
            lines={[
              { key: "sys", name: "Systolic", color: "#fbbf24" },
              { key: "dia", name: "Diastolic", color: "#e4e4e7" },
            ]}
            refLines={[
              { y: 120, color: "#e4e4e7" },
              { y: 130, color: "#fbbf24" },
              { y: 80, color: "#e4e4e7" },
              { y: 85, color: "#fbbf24" },
            ]}
            suffix=" mmHg"
          />
        </motion.div>
      </div>
    </SystemPanel>
  )
}

// ── Maintenance protocol ──────────────────────────────────────────────────────

const STATUS_META: Record<MaintenanceItem["status"], { icon: LucideIcon; cls: string; label: string }> = {
  met: { icon: CheckCircle2, cls: "text-zinc-200", label: "ACTIVE" },
  behind: { icon: Circle, cls: "text-amber-400", label: "BEHIND" },
  nodata: { icon: Minus, cls: "text-zinc-600", label: "NO DATA" },
}

/** R9 left-accent hue per maintenance status — teal active · amber behind · zinc none. */
const STATUS_ACCENT: Record<MaintenanceItem["status"], string> = {
  met: "rgba(45,212,191,.6)",
  behind: "rgba(251,191,36,.55)",
  nodata: "rgba(113,113,122,.4)",
}

/** R55-b declutter — maintenance rows keep a compact noun on the surface; the
 *  full protocol sentence from health.ts rides the row's title together with
 *  its note and citation. Unknown ids fall back to the full label. */
const MAINT_SHORT: Record<string, string> = {
  "cardio-minutes": "CARDIO",
  "strength-sessions": "STRENGTH",
  "sleep-window": "SLEEP AVG",
  "protein-floor": "PROTEIN",
  "hydration-days": "HYDRATION",
  "waist-height": "WAIST÷HT",
  "vitals-checkin": "CHECK-INS",
  "resting-hr-trend": "RHR TREND",
}

/** R55-b declutter — rows that render flat before the SHOW ALL expander
 *  (the R54 milestones / export-center idiom). */
const MAINT_PREVIEW = 4

function MaintenancePanel({ items }: { items: MaintenanceItem[] }) {
  // R15-b — the protocol rows rise per slot when scrolled into view (below-
  // fold panel, so the stagger waits for the reader); reduced motion → final
  // state. Motion rides the existing accent row; its CSS transition is
  // colors-only, so nothing fights framer's transform.
  const reduce = !!useReducedMotion()
  // R55-b — the row tail folds behind SHOW ALL (content unmounts while
  // closed; aria-expanded carries the state).
  const [showAll, setShowAll] = useState(false)
  const met = items.filter((i) => i.status === "met").length
  const evaluated = items.filter((i) => i.status !== "nodata").length
  const awaiting = items.length - evaluated

  const renderRow = (item: MaintenanceItem, idx: number) => {
    const meta = STATUS_META[item.status]
    const Icon = meta.icon
    return (
      <motion.div
        key={item.id}
        className="sys-accent-row flex items-start gap-3 rounded-r-sm px-3 py-2.5 transition-colors hover:bg-rose-500/5"
        style={{ "--row-accent": STATUS_ACCENT[item.status] } as React.CSSProperties}
        title={[item.label, item.note, item.citation].filter(Boolean).join(" — ")}
        {...riseInView(reduce, idx)}
      >
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.cls)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-300">{MAINT_SHORT[item.id] ?? item.label}</p>
          {/* R53-b declutter — the per-row citation line stands down; the
              R55-b pass also folds the full protocol sentence + note here —
              all three ride the row's title attribute above. */}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-xs font-bold tabular-nums text-zinc-200">{item.value ?? "—"}</p>
          <p className="font-mono text-[9px] tabular-nums tracking-wider text-zinc-400">{item.targetLabel}</p>
        </div>
      </motion.div>
    )
  }

  return (
    <SystemPanel
      label="Maintenance Protocol"
      labelAccent={
        <span
          className="flex items-center gap-1.5 font-mono text-[9px] tabular-nums tracking-[0.18em] text-zinc-400"
          title={`${met} of ${evaluated} shields active${awaiting > 0 ? ` · ${awaiting} awaiting data` : ""}`}
        >
          <ShieldCheck className="h-3 w-3 text-zinc-200/80" aria-hidden />
          {evaluated > 0 ? `${met}/${evaluated} ACTIVE` : "AWAITING DATA"}
        </span>
      }
    >
      <div className="p-2">
        {items.slice(0, MAINT_PREVIEW).map((item, idx) => renderRow(item, idx))}
        <AnimatePresence initial={false}>
          {showAll && items.length > MAINT_PREVIEW && (
            <motion.div
              key="maint-rest"
              initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div>{items.slice(MAINT_PREVIEW).map((item, idx) => renderRow(item, idx + MAINT_PREVIEW))}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {items.length > MAINT_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-zinc-800/60 bg-zinc-950/40 font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-400 uppercase transition-colors hover:border-amber-400/40 hover:text-amber-300 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showAll && "rotate-180")} aria-hidden />
            {showAll ? "SHOW LESS" : `SHOW ALL · ${items.length}`}
          </button>
        )}
        {/* R53-b declutter — the shields footer stood down: the header's
            "X OF Y SHIELDS ACTIVE" accent already says it; the awaiting count
            rides that accent's title. */}
      </div>
    </SystemPanel>
  )
}

// ── Vitals snapshot (Status-tab insert) ───────────────────────────────────────

function SnapshotTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  /** R15-b — value widened to ReactNode so the primary numerals can ride
   *  CountNum (mount count-up, glide on live refresh). */
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: ZoneTone
}) {
  return (
    <div className="min-w-0 rounded-sm border border-zinc-800/70 bg-zinc-950/40 p-3">
      <p className="font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-400">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-mono text-xl font-bold tabular-nums",
          tone === "ok" ? "text-zinc-200" : tone === "watch" ? "text-amber-300" : tone === "warn" || tone === "danger" ? "text-rose-300" : "text-zinc-300"
        )}
      >
        {value}
      </p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  )
}

/** Compact Vitals summary for the Status dashboard — self-contained fetches. */
export function VitalsSnapshot() {
  const { setTab } = useSystem()
  const metrics = useApi<MetricsRes>("/api/metrics")
  const sessions = useApi<SessionsRes>("/api/sessions")

  const latest = metrics.data?.latest ?? {}
  const sys = latest.bpSystolic
  const dia = latest.bpDiastolic
  const bp = sys && dia ? bpZone(sys.value, dia.value) : null
  const hr = latest.restingHr ? hrZone(latest.restingHr.value) : null
  const spo2 = latest.spo2 ? spo2Zone(latest.spo2.value) : null

  const score = useMemo(() => {
    const l = metrics.data?.latest ?? {}
    const sleepStats = seriesTrend(metrics.data?.series?.sleep)
    const week = sessions.data ? weekTraining(sessions.data.history) : null
    return healthScore({
      cardioMinutesThisWeek: week ? week.cardioMin : null,
      strengthSessionsThisWeek: week ? week.strengthSessions : null,
      sleep7dAvg: sleepStats.avg7,
      waistCm: l.waist?.value ?? null,
      heightCm: metrics.data?.profile.heightCm ?? null,
      bmi: l.bmi?.value ?? null,
      stress: l.stress?.value ?? null,
      energy: l.energy?.value ?? null,
      sleepTrend: sleepStats.delta,
    })
  }, [sessions.data, metrics.data])

  // R33-b — cold-start snapshot: every vital tile's reading is null AND the
  // hunter has never logged a session → the designed empty slot replaces the
  // four "— / NO DATA" tiles. A hunter with vitals (KAEL) always renders the
  // tile grid.
  const vitalsEmpty =
    !!metrics.data &&
    !!sessions.data &&
    !sys &&
    !dia &&
    !latest.restingHr &&
    !latest.spo2 &&
    sessions.data.history.length === 0

  return (
    <SystemPanel
      label="Vitals Snapshot"
      labelAccent={
        <button
          type="button"
          onClick={() => setTab("vitals")}
          className="flex h-8 items-center gap-1 rounded-sm border border-rose-400/40 bg-rose-500/10 px-2.5 font-mono text-[9px] font-bold tracking-[0.2em] text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          OPEN VITALS <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      }
    >
      {vitalsEmpty ? (
        <div className="p-3 sm:p-4">
          {/* no CTA chip here — the panel header's OPEN VITALS button (the
              rose link-chip above) already navigates; the hint carries the
              message instead of a duplicate button (VLM audit finding) */}
          <EmptySurface
            label="VITALS SNAPSHOT"
            line="YOUR FIRST CHECK-IN WILL LAND HERE"
            hint="OPEN VITALS · LOG TODAY'S SLEEP, REST HR AND BP"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-3 sm:p-4 md:grid-cols-4">
        <SnapshotTile
          label="BLOOD PRESSURE"
          value={
            sys && dia ? (
              <>
                <CountNum value={sys.value} />/<CountNum value={dia.value} />
              </>
            ) : (
              "—"
            )
          }
          sub={bp ? <ZoneChip zone={bp} /> : <p className="font-mono text-[8px] tracking-wider text-zinc-400">NO DATA</p>}
        />
        <SnapshotTile
          label="RESTING HR"
          value={latest.restingHr ? <CountNum value={latest.restingHr.value} /> : "—"}
          sub={
            hr ? (
              /* R52 declutter — bare zone word; the range/citation folds into
                 the title so the info stays reachable on hover/AT. */
              <p
                title={hr.citation.split(":")[0]}
                className="font-mono text-[8px] tracking-wider text-zinc-200/80"
              >
                {hr.label.toUpperCase()}
              </p>
            ) : (
              <p className="font-mono text-[8px] tracking-wider text-zinc-400">NO DATA</p>
            )
          }
        />
        <SnapshotTile
          label="BLOOD O₂"
          value={
            latest.spo2 ? (
              <>
                <CountNum value={latest.spo2.value} />%
              </>
            ) : (
              "—"
            )
          }
          sub={
            spo2 ? (
              <p className="font-mono text-[8px] tracking-wider text-zinc-200/80">{spo2.label.toUpperCase()}</p>
            ) : (
              <p className="font-mono text-[8px] tracking-wider text-zinc-400">NO DATA</p>
            )
          }
        />
        <SnapshotTile
          label="HEALTH SCORE"
          value={score.total !== null ? <CountNum value={score.total} /> : "—"}
          sub={
            <p
              className="font-mono text-[8px] tracking-wider text-zinc-400"
              title={score.total !== null ? "Estimate computed from your logged data" : "Log vitals to compute the health score"}
            >
              {score.total !== null ? "ESTIMATE" : "LOG VITALS TO COMPUTE"}
            </p>
          }
        />
        </div>
      )}
    </SystemPanel>
  )
}
