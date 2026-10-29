"use client"

// ── R47 · BODY INSIGHTS — the live /api/insights consumer ─────────────────────
// R46 discovered the gap: GET /api/insights carries two designed side effects
// (① ACWR deload-advised → ensureDeloadQuest injects today's Recovery
// Directive; ② body-fat goal first crossing → achievement + 200 XP + a live
// celebrate flag) — but after the R46 dead-code exorcism NOTHING in the live
// app fetched the route, so both behaviors never fired on any user path.
// This panel is the designed contract made real ("any tab's insights fetch
// (readiness/vitals/body) can render the banner"): BodyAtlasTab mounts a
// useApi("/api/insights") at tab level (side effects fire when the user opens
// BODY), the metrics sub-view renders the verdict surfaces below, and the
// celebrate banner lives at the tab's head. Read-only on the client — every
// number below is exactly what the route computed, nothing is fabricated.

import { motion, useReducedMotion } from "framer-motion"
import {
  Beef,
  Droplets,
  Dumbbell,
  Gauge,
  HeartPulse,
  Moon,
  Scale,
  Trophy,
  Waves,
  Zap,
} from "lucide-react"

import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { FLOW_EASE, FlowReveal } from "@/components/system/motion"
import type { InsightsDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// ── Tone system (matches the tab's hue policy: emerald=good, amber=caution,
// rose=alert, zinc=unknown; science-zone teal rides the emerald family) ──────

type Tone = "good" | "warn" | "alert" | "muted"

const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-300",
  warn: "text-amber-300",
  alert: "text-rose-300",
  muted: "text-zinc-500",
}

const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]",
  warn: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]",
  alert: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.55)]",
  muted: "bg-zinc-600",
}

const TONE_CHIP: Record<Tone, string> = {
  good: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  alert: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  muted: "border-zinc-700 bg-zinc-900/60 text-zinc-500",
}

/** One verdict row — icon + domain label left, mono verdict right, hint under. */
function VerdictRow({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: Tone
  hint?: string | null
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn("mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-sm border", TONE_CHIP[tone])}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-2">
            <i className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} aria-hidden />
            <span className="sys-label text-zinc-400">{label}</span>
          </span>
          <span className={cn("font-mono text-[11px] font-bold tabular-nums", TONE_TEXT[tone])}>{value}</span>
        </div>
        {hint ? (
          <p className="mt-1 font-mono text-[9px] leading-relaxed tracking-[0.08em] text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow:hidden] [word-break:break-word]">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ── Tone mappers (pure, defensive against null fields) ──────────────────────

function ratingTone(rating: string | null): Tone {
  if (rating === null) return "muted"
  const good = ["Excellent", "Very Good", "Good", "Athlete"]
  const warn = ["Fair", "Average", "Above Average", "Beginner", "Novice"]
  if (good.some((g) => rating.startsWith(g))) return "good"
  if (warn.some((w) => rating.startsWith(w))) return "warn"
  return "alert"
}

function statusTone(status: string): Tone {
  if (status === "on-target" || status === "balanced" || status === "sustainable") return "good"
  if (status === "unknown" || status === "insufficient-data") return "muted"
  return "warn"
}

function deloadTone(verdict: string): Tone {
  if (verdict === "sustainable") return "good"
  if (verdict === "insufficient-data") return "muted"
  if (verdict === "deload-advised") return "alert"
  return "warn" // caution
}

const fmt1 = (v: number | null | undefined, unit = ""): string =>
  v === null || v === undefined ? "—" : `${Math.round(v * 10) / 10}${unit}`

// ── ① Celebrate banner (side-effect ②'s designed surface) ───────────────────
// bodyComp.celebrate is true on the FIRST crossing fetch (achievement + 200 XP
// granted server-side inside the same GET) and stays live for 2 minutes after
// unlocking so this banner renders on whichever tab-mounted fetch saw it.

export function BodyCompCelebrateBanner({ data }: { data: InsightsDTO }) {
  const reduce = !!useReducedMotion()
  const bc = data.bodyComp
  if (!bc.celebrate) return null
  return (
    <FlowReveal>
      <motion.div
        role="status"
        aria-live="polite"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.5, ease: FLOW_EASE }}
        className="relative overflow-hidden rounded-sm border border-amber-400/50 bg-gradient-to-r from-amber-500/[0.12] via-amber-400/[0.05] to-transparent px-4 py-3.5"
      >
        {/* breathing glow — reduced-motion safe (opacity only) */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_120%_at_20%_0%,rgba(251,191,36,0.18),transparent)]"
          animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
          transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex items-center gap-3">
          <motion.span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-amber-300/60 bg-amber-400/15"
            animate={reduce ? undefined : { rotate: [-6, 6, -6] }}
            transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Trophy className="h-5 w-5 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
          </motion.span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold tracking-[0.25em] text-amber-200">
              BODY-FAT GOAL REACHED
            </p>
            <p className="mt-0.5 font-mono text-[9px] tracking-[0.12em] text-amber-200/70">
              {fmt1(bc.bodyFatPct, "%")} BODY FAT · {bc.goalZoneLabel ?? "TARGET"} ZONE · +200 XP AWARDED BY THE SYSTEM
            </p>
          </div>
        </div>
      </motion.div>
    </FlowReveal>
  )
}

// ── ② BODY COMPOSITION panel (US-Navy tape verdicts + goal trajectory) ──────

function ZoneRail({ data }: { data: InsightsDTO["bodyComp"] }) {
  const current = data.category
  return (
    <div className="flex flex-wrap gap-1.5" role="img" aria-label="Body-fat zone rail">
      {data.zones.map((z) => {
        const active = current === z.label
        return (
          <span
            key={z.label}
            className={cn(
              "rounded-sm border px-2 py-1 font-mono text-[9px] font-bold tracking-[0.12em]",
              active
                ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
                : "border-zinc-800 bg-zinc-950/60 text-zinc-500",
            )}
          >
            {active ? "◆ " : ""}
            {z.label.toUpperCase()} {z.min}–{z.max}%
          </span>
        )
      })}
    </div>
  )
}

function BodyCompPanel({ bc }: { bc: InsightsDTO["bodyComp"] }) {
  if (!bc.available) {
    return (
      <SystemPanel label="BODY COMPOSITION · LOCKED">
        <div className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {bc.missing.map((m) => (
              <span
                key={m}
                className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-[9px] font-bold tracking-[0.12em] text-amber-300"
              >
                {m.toUpperCase()} MISSING
              </span>
            ))}
          </div>
          <p className="font-mono text-[9px] leading-relaxed tracking-[0.1em] text-zinc-500">
            LOG TAPE MEASURES IN TELEMETRY (ABOVE) TO UNLOCK US-NAVY BODY-COMPOSITION ANALYSIS — BODY-FAT
            %, LEAN MASS SPLIT AND GOAL TRAJECTORY COMPUTE FROM THEM.
          </p>
        </div>
      </SystemPanel>
    )
  }

  return (
    <SystemPanel label="BODY COMPOSITION · US-NAVY TAPE">
      <div className="flex flex-col gap-4 px-4 py-4">
        {/* headline numeral + category */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="sys-label text-zinc-500">BODY FAT</p>
            <p className="font-mono text-3xl font-bold tabular-nums leading-none text-emerald-300">
              {fmt1(bc.bodyFatPct, "")}
              <span className="ml-1 text-base text-emerald-400/70">%</span>
            </p>
          </div>
          <span
            className={cn(
              "rounded-sm border px-2.5 py-1.5 font-mono text-[9px] font-bold tracking-[0.15em]",
              bc.goalReached
                ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                : "border-zinc-700 bg-zinc-950/60 text-zinc-400",
            )}
          >
            {bc.category?.toUpperCase() ?? "—"}
          </span>
        </div>

        <ZoneRail data={bc} />

        {/* lean/fat/weight split */}
        <div className="grid grid-cols-3 gap-2 border-t border-zinc-800/60 pt-3">
          {[
            { k: "LEAN", v: `${fmt1(bc.leanMassKg)}KG` },
            { k: "FAT", v: `${fmt1(bc.fatMassKg)}KG` },
            { k: "WEIGHT", v: `${fmt1(bc.weightKg)}KG` },
          ].map((s) => (
            <div key={s.k} className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-center">
              <p className="sys-label text-[8px] text-zinc-600">{s.k}</p>
              <p className="font-mono text-[11px] font-bold tabular-nums text-zinc-300">{s.v}</p>
            </div>
          ))}
        </div>

        {/* goal trajectory */}
        {bc.goalPct !== null ? (
          <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="sys-label text-[8px] text-zinc-600">GOAL TRAJECTORY</span>
              <span className="font-mono text-[10px] font-bold tabular-nums text-violet-300">
                {bc.goalPct}% · {bc.goalZoneLabel?.toUpperCase() ?? "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 font-mono text-[9px] tracking-[0.1em] text-zinc-500">
              {bc.goalReached ? (
                <span className="text-emerald-300">◆ GOAL REACHED — HOLD THE ZONE</span>
              ) : (
                <span>{bc.deltaToGoal !== null ? `${Math.abs(bc.deltaToGoal).toFixed(1)} PTS ${bc.deltaToGoal > 0 ? "TO SHED" : "TO GAIN"} → ${bc.goalPct}%` : "—"}</span>
              )}
              {bc.fatTrendPctPerWeek !== null ? (
                <span className={cn("ml-auto tabular-nums", bc.fatTrendPctPerWeek <= 0 ? "text-emerald-400/80" : "text-amber-400/80")}>
                  {bc.fatTrendPctPerWeek > 0 ? "+" : ""}
                  {bc.fatTrendPctPerWeek.toFixed(2)}%/WK
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </SystemPanel>
  )
}

// ── ③ SYSTEM VERDICTS panel — the seven remaining domains as status rows ────

function VerdictsPanel({ data }: { data: InsightsDTO }) {
  const { heart, sleep, protein, hydration, balance, energy, strength, deload } = data

  const heartValue =
    heart.restingHr !== null
      ? `${Math.round(heart.restingHr)} BPM · ${heart.restingHrRating ?? "—"}`
      : "NO RHR DATA"
  const heartHint =
    heart.vo2max !== null
      ? `VO₂MAX ${Math.round(heart.vo2max)} · ${heart.vo2maxRating ?? "—"} · ${heart.method}`
      : `NO VO₂MAX DATA · ${heart.method}`

  const sleepValue =
    sleep.avg7 !== null ? `${fmt1(sleep.avg7, "H")} AVG / ${sleep.target}H` : "NO SLEEP LOGS"
  const sleepHint =
    sleep.debtHours !== null && sleep.debtHours > 0
      ? `${fmt1(sleep.debtHours, "H")} DEBT THIS WEEK${sleep.consistencyLabel ? ` · ${sleep.consistencyLabel.toUpperCase()}` : ""}`
      : sleep.consistencyLabel
        ? `${sleep.consistencyLabel.toUpperCase()} · ${sleep.rating ?? "—"}`
        : null

  const proteinValue =
    protein.status === "unknown"
      ? "NOT LOGGED TODAY"
      : `${Math.round(protein.todayPct)}% · ${Math.round(protein.todayG)}G / ${Math.round(protein.targetG)}G`
  const proteinHint =
    protein.avg7G !== null
      ? `7-DAY AVG ${Math.round(protein.avg7G)}G · TARGET ${protein.gPerKg.toFixed(1)}G/KG BODYWEIGHT`
      : `TARGET ${protein.gPerKg.toFixed(1)}G/KG BODYWEIGHT`

  const hydrationValue =
    hydration.status === "unknown"
      ? "NOT LOGGED TODAY"
      : `${Math.round(hydration.pct)}% · ${(hydration.todayMl / 1000).toFixed(1)}L / ${(hydration.targetMl / 1000).toFixed(1)}L`
  const hydrationHint =
    hydration.avg7Ml !== null
      ? `7-DAY AVG ${(hydration.avg7Ml / 1000).toFixed(1)}L · ${hydration.daysOnTarget7}/7 DAYS ON TARGET`
      : null

  const balanceValue =
    balance.pushPullStatus === "unknown" && balance.upperLowerStatus === "unknown"
      ? "NO SET DATA THIS WEEK"
      : `P/P ${balance.pushPullStatus === "unknown" ? "—" : `${balance.pushSets}:${balance.pullSets}`} · U/L ${balance.upperLowerStatus === "unknown" ? "—" : `${balance.pushSets + balance.pullSets}:${balance.lowerSets}`}`
  const balanceHint =
    balance.pushPullStatus !== "unknown" ? balance.pushPullHint : balance.upperLowerStatus !== "unknown" ? balance.upperLowerHint : null

  const energyValue =
    energy.status === "unknown"
      ? "NO INTAKE LOGS"
      : `${energy.avg7Intake !== null ? Math.round(energy.avg7Intake) : "—"} / ${energy.targetCalories} KCAL AVG`
  const energyHint =
    energy.weeklyBalance !== null
      ? `${energy.weeklyBalance >= 0 ? "+" : ""}${Math.round(energy.weeklyBalance)} KCAL/WK VS ${energy.targetWeeklyBalance >= 0 ? "+" : ""}${energy.targetWeeklyBalance} TARGET${energy.weightTrendKgPerWeek !== null ? ` · WEIGHT ${energy.weightTrendKgPerWeek >= 0 ? "+" : ""}${energy.weightTrendKgPerWeek.toFixed(2)}KG/WK` : ""}`
      : null

  const strengthValue =
    strength.matchedCount > 0
      ? `${strength.matchedCount} LIFTS · ${strength.overallLevel ?? "—"}`
      : "NO LIFTS MATCHED"
  const strengthHint =
    strength.overallScore !== null
      ? `OVERALL ${Math.round(strength.overallScore)}/100 · BW ${fmt1(strength.bodyweightKg)}KG${strength.isDefaultBw ? " (DEFAULT)" : ""}`
      : null

  const deloadValueMap: Record<string, string> = {
    "deload-advised": "DELOAD ADVISED",
    caution: "CAUTION",
    sustainable: "SUSTAINABLE",
    "insufficient-data": "CALIBRATING",
  }
  const deloadValue = deloadValueMap[deload.verdict] ?? deload.verdict.toUpperCase()
  const deloadHint =
    deload.verdict === "deload-advised"
      ? `${deload.hint} · RECOVERY DIRECTIVE ISSUED — SEE DIRECTIVES`
      : deload.hint

  const rows: Array<{ icon: React.ReactNode; label: string; value: string; tone: Tone; hint: string | null }> = [
    {
      icon: <HeartPulse className="h-3.5 w-3.5" />,
      label: "HEART",
      value: heartValue,
      tone: ratingTone(heart.restingHrRating),
      hint: heartHint,
    },
    {
      icon: <Moon className="h-3.5 w-3.5" />,
      label: "SLEEP",
      value: sleepValue,
      tone: sleep.debtHours !== null && sleep.debtHours > 3 ? "alert" : sleep.avg7 !== null ? (sleep.avg7 >= sleep.target - 0.5 ? "good" : "warn") : "muted",
      hint: sleepHint,
    },
    {
      icon: <Beef className="h-3.5 w-3.5" />,
      label: "PROTEIN",
      value: proteinValue,
      tone: statusTone(protein.status),
      hint: proteinHint,
    },
    {
      icon: <Droplets className="h-3.5 w-3.5" />,
      label: "HYDRATION",
      value: hydrationValue,
      tone: statusTone(hydration.status),
      hint: hydrationHint,
    },
    {
      icon: <Scale className="h-3.5 w-3.5" />,
      label: "BALANCE",
      value: balanceValue,
      tone: statusTone(balance.pushPullStatus !== "unknown" ? balance.pushPullStatus : balance.upperLowerStatus),
      hint: balanceHint,
    },
    {
      icon: <Zap className="h-3.5 w-3.5" />,
      label: "ENERGY",
      value: energyValue,
      tone: statusTone(energy.status),
      hint: energyHint,
    },
    {
      icon: <Dumbbell className="h-3.5 w-3.5" />,
      label: "STRENGTH",
      value: strengthValue,
      tone: strength.matchedCount > 0 ? ratingTone(strength.overallLevel) : "muted",
      hint: strengthHint,
    },
    {
      icon: deload.verdict === "deload-advised" ? <Waves className="h-3.5 w-3.5" /> : <Gauge className="h-3.5 w-3.5" />,
      label: "TRAINING LOAD",
      value:
        deload.verdict === "insufficient-data"
          ? deloadValue
          : `${deloadValue}${deload.spikeRatio !== null ? ` · ×${deload.spikeRatio.toFixed(2)}` : ""}`,
      tone: deloadTone(deload.verdict),
      hint: deloadHint,
    },
  ]

  return (
    <SystemPanel label="SYSTEM VERDICTS · 7-DAY WINDOW">
      <div className="divide-y divide-zinc-800/50">
        {rows.map((r) => (
          <VerdictRow key={r.label} {...r} />
        ))}
      </div>
    </SystemPanel>
  )
}

// ── ④ The ANALYSIS section body — what the metrics sub-view mounts ─────────

export function BodyInsights({ data, loading }: { data: InsightsDTO | null; loading: boolean }) {
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <SkeletonPanel label="ANALYZING" rows={4} />
        <SkeletonPanel label="VERDICTS" rows={3} />
      </div>
    )
  }
  if (!data) return null
  return (
    <div className="space-y-4">
      <BodyCompPanel bc={data.bodyComp} />
      <VerdictsPanel data={data} />
    </div>
  )
}
