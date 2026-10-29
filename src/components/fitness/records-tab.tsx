"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Activity, ChevronDown, ChevronRight, Crown, Dumbbell, Flame, FolderOpen, Timer, Trophy } from "lucide-react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { SwipeRow, type SwipeRowAction } from "@/components/system/swipe-row"
import { RowHint } from "@/components/system/row-hint"
import { ChroniclePanel } from "./chronicle-panel"
import { XpHeatmap } from "./xp-heatmap"
import { PrDrilldown } from "./pr-drilldown"
import { ExportCenter } from "./export-center"
import { LeaderboardPanel } from "./leaderboard-panel"
import { DeloadAdvisor } from "./deload-advisor"
import { useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { formatDayLabel } from "@/lib/game"
import { gateById } from "@/lib/gates"
import { progressionKey } from "@/lib/progression"
import { describeRpe, rpeVerdict, type RpeVerdict } from "@/lib/rpe"
import { CLASS_SKIN, strengthVerdict } from "@/lib/strength-standards"
import { strainBand, type AcwrVerdict, type LoadView, type StrainBand, type TsbVerdict } from "@/lib/load"
import type { EffortPointDTO, HunterDTO, HistoryDTO, PersonalBestDTO, ProgressionResDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FlowGroup, FlowReveal, flowItemVariants, useCountUp, tapMotion, FLOW_EASE, pulseBreathe, MeterFlow } from "@/components/system/motion"
import { InfoHint } from "@/components/system/info-hint"
import type { GlossaryKey } from "@/lib/glossary"
// R53-a declutter — the six numbered SysSection headers stood down: panels
// carry their own labels (the R52 Status-tab recipe). section-mark.tsx stays
// on disk for the tabs that still use it.

import { OracleTip } from "./oracle-tip"

type PrsRes = { records: PersonalBestDTO[] }
/** R34-a — /api/progression's wire shape (types.ts ProgressionResDTO: the
 *  R1-c entries + the additive effort ledger block). */
type ProgressionRes = ProgressionResDTO
/** One progression entry carrying R34-a's additive effort fields. */
type ProgressionEntry = ProgressionResDTO["entries"][number]

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
      className="rounded-sm border border-dashed border-zinc-700/60 bg-zinc-950/30 px-4 py-6 text-center transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:shadow-[0_0_18px_rgba(139,92,246,0.12)] sm:px-5"
    >
      <p className="sys-label text-[9px] tracking-[0.25em] text-zinc-500">{label}</p>
      {glyph && <EmptyGlyph className="mx-auto mt-2 h-16 w-16 opacity-70" />}
      <p className="mt-2 font-mono text-xs tracking-[0.2em] text-zinc-300">{line}</p>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed tracking-[0.16em] text-zinc-500">{hint}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-sm border border-violet-400/50 bg-violet-500/15 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.4)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {ctaLabel}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </motion.div>
  )
}

/** R17-C — body profile for strength-standard classification. /api/hunter's
 *  DTO carries no body data; /api/metrics is the app's body-profile source
 *  (body-atlas precedent: latest weigh-in first, profile weight as fallback).
 *  useApi refetches on the global refresh key, so verdicts recompute whenever
 *  the hunter refreshes (pure function, no caching). */
type MetricsProfileRes = {
  profile: { weightKg: number | null; sex: string | null }
  latest: { weight?: { value: number } | null }
}

/** Record-board type filters — chip id → PersonalBest.type it matches. */
const PR_FILTERS = ["ALL", "STRENGTH", "BODYWEIGHT", "CARDIO"] as const

/** R53-a — session-archive rows that render flat before the SHOW ALL expander. */
const ARCHIVE_PREVIEW = 4
type PrFilter = (typeof PR_FILTERS)[number]

/** R12-a — swipe-to-open-dossier on PR rows: violet rail; the swipe routes to
 *  the exact same setDrillKey as the tap (FolderOpen = dossier semantic). */
const SWIPE_DOSSIER: SwipeRowAction = { icon: FolderOpen, tone: "violet", label: "DOSSIER" }

/** Tooltip for the per-record e1RM sparkline — day + estimated 1RM. */
function SparkTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { value?: number; payload?: { day?: string } }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const day = p.payload?.day
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-2.5 py-1.5" role="tooltip">
      <p className="sys-label text-[9px] text-zinc-400">{day ? formatDayLabel(day).toUpperCase() : ""}</p>
      <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-violet-300">e1RM {(p.value ?? 0).toFixed(1)} KG</p>
    </div>
  )
}

/** Δ chip — latest trend e1RM vs the record's best e1RM (emerald ▲ / amber ▼). */
function E1rmDeltaChip({ latest, best }: { latest: number; best: number }) {
  const up = latest >= best
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-[9px] font-bold tabular-nums tracking-widest",
        up ? "text-emerald-400" : "text-amber-400"
      )}
      title={`Latest estimated 1RM ${latest.toFixed(1)} kg vs 90-day best ${best.toFixed(1)} kg`}
    >
      e1RM {latest.toFixed(1)} {up ? "▲" : "▼"}
    </span>
  )
}

/** Tiny inline e1RM trend sparkline — violet, no axes/grid/dots. */
function E1rmSparkline({ trend }: { trend: { day: string; e1rm: number }[] }) {
  return (
    <div className="hidden shrink-0 sm:block" title="Estimated 1RM trend (last 90 days)">
      <ResponsiveContainer width={72} height={28}>
        <LineChart data={trend} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
          <Line type="monotone" dataKey="e1rm" stroke="#6ee7b7" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Tooltip content={<SparkTooltip />} cursor={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Human-readable context line for a PR (sets×reps / weight / duration), or null. */
function prContext(r: PersonalBestDTO): string | null {
  const c = r.context
  if (!c) return null
  const parts: string[] = []
  if (c.sets > 0 && c.reps > 0) parts.push(`${c.sets}×${c.reps}`)
  if (c.weightKg > 0) parts.push(`${c.weightKg}kg`)
  if (c.durationMin > 0) parts.push(`${c.durationMin}min`)
  return parts.length > 0 ? parts.join(" · ") : null
}

type SessionsRes = {
  active: unknown
  history: {
    id: string
    gateId: string
    gateName: string
    status: string
    startedAt: string
    xpEarned: number
    durationMin: number
    volumeKg: number
    logs: { id: string; name: string; type: string; sets: number; reps: number; weightKg: number; durationMin: number; xpValue: number }[]
  }[]
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-3 py-2">
      <p className="sys-label text-[9px] text-zinc-400">{label ? formatDayLabel(label) : ""}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-violet-300">+{payload[0].value} XP</p>
    </div>
  )
}

/** RECORDS tab — XP trend, lifetime totals, raid history. */
export function RecordsTab({ hunter }: { hunter: HunterDTO }) {
  const { data: history, loading: historyLoading } = useApi<HistoryDTO>("/api/history")
  const { data: sessions, loading: sessionsLoading } = useApi<SessionsRes>("/api/sessions")
  const { data: prs, loading: prsLoading } = useApi<PrsRes>("/api/prs")
  const { data: progression, loading: progressionLoading, error: progressionError } = useApi<ProgressionRes>("/api/progression")
  const { data: metrics } = useApi<MetricsProfileRes>("/api/metrics")
  const { setTab } = useSystem()
  const [prFilter, setPrFilter] = useState<PrFilter>("ALL")
  /** Normalized name of the PR row whose dossier dialog is open (null = closed). */
  const [drillKey, setDrillKey] = useState<string | null>(null)
  /** R53-a — session-archive expander: preview rows render flat, the rest live
   *  behind SHOW ALL (export-list recipe; the full list stays reachable). */
  const [archiveAll, setArchiveAll] = useState(false)
  const reduce = useReducedMotion()

  // R15-c — live-PR bloom: /api/prs silently refetches on every global
  // refreshKey bump (useApi), so a held record CAN improve while the vault is
  // on camera. When a seen record's bestValue rises, its row surface breathes
  // once (pulseBreathe, gated on reduce). First sight only SEEDS the map —
  // mounts and brand-new rows never pulse (their stagger rise is the entrance).
  const prRowEls = useRef(new Map<string, HTMLDivElement>())
  const prPrevBests = useRef(new Map<string, number>())
  useEffect(() => {
    const list = prs?.records ?? []
    if (list.length === 0) return
    const prev = prPrevBests.current
    for (const r of list) {
      const seen = prev.get(r.id)
      if (seen !== undefined && r.bestValue > seen && !reduce) {
        const el = prRowEls.current.get(r.id)
        if (el) void pulseBreathe(el)
      }
      prev.set(r.id, r.bestValue)
    }
    const ids = new Set(list.map((r) => r.id))
    for (const id of prev.keys()) if (!ids.has(id)) prev.delete(id)
  }, [prs, reduce])

  const daily = history?.daily ?? []
  const recent = sessions?.history ?? []
  const cleared = recent.filter((s) => s.status === "cleared")
  const records = prs?.records ?? []

  // R17-C — hunter bodyweight + sex feed every strength-verdict chip. null
  // bodyweight falls through to the lib's documented 75 kg / male-table
  // defaults; chips stay hidden until the profile resolves so no row ever
  // flashes a class computed against the fallback weight.
  const bodyweightKg = metrics ? (metrics.latest.weight?.value ?? metrics.profile.weightKg) : null
  const hunterSex = metrics?.profile.sex ?? null
  const standardsReady = metrics !== null

  // progression entries keyed by normalized exercise name (PR rows store the same key)
  const progByKey = new Map<string, ProgressionEntry>()
  for (const e of progression?.entries ?? []) progByKey.set(e.key ?? progressionKey(e.name), e)

  // live filter counts — chips stay honest as records are set
  const prCounts: Record<PrFilter, number> = {
    ALL: records.length,
    STRENGTH: records.filter((r) => r.type === "strength").length,
    BODYWEIGHT: records.filter((r) => r.type === "bodyweight").length,
    CARDIO: records.filter((r) => r.type === "cardio").length,
  }
  const visibleRecords =
    prFilter === "ALL" ? records : records.filter((r) => r.type === prFilter.toLowerCase())

  // single dossier instance — resolves the record + progression entry for the open row
  const drillRecord = drillKey ? records.find((r) => progressionKey(r.name) === drillKey) ?? null : null

  // R53-a — archive row renderer, shared by the flat preview + the SHOW ALL
  // tail (the exercise count rides the row's title, R52-3 session-row trim).
  // R55-a — the per-log exercise chips, the start time, duration and volume
  // left the face: all ride the row's title (per-row meta, merge & hide —
  // the export-center row recipe). The face keeps name · XP · date.
  const renderArchiveRow = (s: (typeof cleared)[number], i: number) => {
    const gate = gateById(s.gateId)
    const logs = s.logs ?? []
    const started = new Date(s.startedAt)
    const logSummary = logs
      .map((l) => `${l.name} ${l.type === "strength" ? `${l.sets}×${l.reps}@${l.weightKg}kg` : l.type === "bodyweight" ? `${l.sets}×${l.reps}` : l.durationMin > 0 ? `${l.durationMin}m` : `${l.sets}×${l.reps}`}`)
      .join(" · ")
    return (
      <motion.div
        key={s.id}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: Math.min(i * 0.03, 0.27) }}
        className="rounded-sm px-3 py-3 transition-colors hover:bg-violet-500/5"
        title={`${s.gateName} — ${logs.length} exercise${logs.length === 1 ? "" : "s"} · started ${started.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${s.durationMin > 0 ? ` · ${s.durationMin} MIN` : ""}${s.volumeKg > 0 ? ` · ${s.volumeKg.toLocaleString()} KG` : ""}${logSummary ? ` · ${logSummary}` : ""}`}
      >
        <div className="flex items-center gap-3">
          <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-sm border bg-zinc-950/60", gate?.frame ?? "border-zinc-700/60")}>
            <span className={cn("font-mono text-[10px] font-bold", gate?.accent ?? "text-zinc-400")}>
              {gate?.rank ?? "?"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-xs font-medium text-zinc-200">{s.gateName}</p>
              <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-violet-300">+{s.xpEarned} XP</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums text-zinc-400">
              <span>{started.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <FlowGroup className="space-y-4 sm:space-y-5">
      <OracleTip tab="records" />

      {/* XP over time: trend · chronicle · ledger calendar (R53-a — numbered
          section headers stood down; the panels carry their own labels). */}
      {/* XP trend */}
      <motion.div variants={flowItemVariants}>
      {historyLoading && !history ? (
        <SkeletonPanel label="SYNCING XP FLOW" rows={1}>
          <div className="skel-bar h-40 w-full" style={{ animationDelay: "0.12s" }} />
        </SkeletonPanel>
      ) : hunter.totalXp === 0 ? (
        /* R33-b — cold-start XP flow: lifetime zero XP = the hunter has never
         * earned anything — the designed empty slot replaces the flat all-zero
         * area chart (KAEL's 2,943 lifetime XP always renders the live chart). */
        <EmptySurface
          label="XP FLOW"
          line="YOUR FIRST EARNED XP WILL LAND HERE"
          hint="SESSIONS · VITALS · QUESTS ALL PAY XP — THE GATES PAY BEST"
          ctaLabel="EARN YOUR FIRST XP"
          onCta={() => setTab("gates")}
          glyph
        />
      ) : (
      <SystemPanel
        label="XP FLOW"
        labelAccent={
          /* R53-a — the panel reads ONCE (label + short window); the lifetime
           * total rides the ledger footer + standings rows, not a third read. */
          <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">14 DAYS</span>
        }
      >
        <div className="p-4 pt-5 sm:p-5">
          <div className="h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="xpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0.02} />
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
                  /* R56 — tick densification: ~every 3rd day on the 14-day
                   * window (hover Tooltip keeps every value reachable). */
                  minTickGap={64}
                />
                <YAxis
                  tickCount={3}
                  tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(167,139,250,0.3)" }} />
                <Area
                  type="monotone"
                  dataKey="xp"
                  stroke="#6ee7b7"
                  strokeWidth={2}
                  fill="url(#xpGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#a7f3d0", stroke: "#07060c" }}
                  /* R15-c — the trend's draw-in rides recharts' own animator
                     (recharts owns the SVG path, so motion.path isn't reachable
                     without forking the renderer); 1.1s ease-out matches the
                     FLOW_EASE draw language, reduce renders it complete. */
                  isAnimationActive={!reduce}
                  animationBegin={120}
                  animationDuration={1100}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SystemPanel>
      )}
      </motion.div>

      {/* chronicle — 7-day cycle vs previous cycle */}
      <motion.div variants={flowItemVariants}>
        <ChroniclePanel />
      </motion.div>

      {/* lifetime ledger — 26-week daily-XP calendar (reveals on scroll) */}
      <FlowReveal>
        <XpHeatmap />
      </FlowReveal>

      {/* R52-2 — standings arenas (state / country / world): the honest
          boards ranking the hunter rows registered on THIS device. Sits after
          the XP-flow hero+ledger, before the totals/load deep sections —
          self-contained fetch (XpHeatmap precedent), rides the global
          refreshKey. */}
      <FlowReveal>
        <LeaderboardPanel />
      </FlowReveal>

      {/* lifetime totals (reveals on scroll) */}
      {hunter.totalSessions === 0 ? (
        /* R33-b — cold-start totals: zero lifetime sessions = the ledger has
         * never opened — the designed empty slot replaces four zero tiles
         * (KAEL's 12 sessions always render the live totals). */
        <FlowReveal>
          <EmptySurface
            label="LIFETIME TOTALS"
            line="SESSIONS · VOLUME · TIME UNDER IRON ACCRUE HERE"
            hint="CLEAR YOUR FIRST SESSION TO OPEN THE LEDGER"
            ctaLabel="START A WORKOUT"
            onCta={() => setTab("gates")}
          />
        </FlowReveal>
      ) : (
        <FlowReveal className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {/* R55-a — tile labels tightened to the data word; the full terms
                ride each tile's title (the ledger panel above already says
                "Lifetime"). */}
            <TotalTile icon={Flame} label="SESSIONS" title="Sessions logged — lifetime" value={String(hunter.totalSessions)} countTo={hunter.totalSessions} format={(n) => String(Math.round(n))} accent="text-fuchsia-300" index={0} reduce={!!reduce} hero />
            <TotalTile icon={Dumbbell} label="VOLUME" title="Lifetime volume — total weight moved" hint="volume" value={`${(hunter.totalVolumeKg / 1000).toFixed(1)}t`} countTo={hunter.totalVolumeKg / 1000} format={(n) => `${n.toFixed(1)}t`} accent="text-amber-300" index={1} reduce={!!reduce} />
            <TotalTile icon={Timer} label="TIME" title="Time under iron — lifetime" value={`${Math.floor(hunter.totalMinutes / 60)}h ${hunter.totalMinutes % 60}m`} countTo={hunter.totalMinutes} format={(n) => `${Math.floor(n / 60)}h ${Math.floor(n % 60)}m`} accent="text-emerald-300" index={2} reduce={!!reduce} />
            <TotalTile icon={Activity} label="CARDIO" title="Cardio minutes — lifetime" value={String(hunter.totalCardio)} countTo={hunter.totalCardio} format={(n) => String(Math.round(n))} accent="text-teal-300" index={3} reduce={!!reduce} />
        </FlowReveal>
      )}

      {/* strain & load console (R18-d — Whoop/Garmin/TrainingPeaks parity) */}
      <FlowReveal>
        <LoadConsolePanel />
      </FlowReveal>

      {/* R34-a — the effort ledger: RPE paid at the raid console pays out
          here, adjacent to the load console (objective stress meets
          subjective effort). Progression data arrives prop-passed from THIS
          tab's /api/progression fetch (ExportCenter precedent — zero
          duplicate requests; useApi rides the global refreshKey, so fresh
          ratings land here on the next refresh after a raid). */}
      <FlowReveal>
        <EffortLedgerPanel progression={progression} loading={progressionLoading} error={progressionError} />
      </FlowReveal>

      {/* the record vault (reveals on scroll) — the held-record count rides
          the panel accent, not a section trailing numeral (R53-a) */}

      {/* R13-b — one-time row-gesture hint (PR rows below) */}
      <RowHint surface="records" />

      <FlowReveal>
      {prsLoading && !prs ? (
        <SkeletonPanel label="SYNCING RECORD VAULT" rows={3} />
      ) : (
      <SystemPanel
        label="Personal Records"
        labelAccent={
          <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
            <Trophy className="h-3 w-3 text-amber-400/70" aria-hidden /> {records.length} HELD
            <InfoHint term="pr" />
          </span>
        }
      >
        <div className="scroll-sys max-h-80 overflow-y-auto p-2">
          {records.length === 0 && (
            /* R33-b — cold-start vault: the designed slot replaces the bare
             * two-liner (same CTA text + destination as before, upgraded skin —
             * KAEL's 5 records always render the board). */
            <div className="p-2">
              <EmptySurface
                label="PERSONAL RECORDS"
                line="YOUR FIRST LOG SETS A RECORD HERE"
                hint="EVERY FIRST LOG SETS A RECORD · BREAK IT FOR BONUS XP"
                ctaLabel="SET THE FIRST"
                onCta={() => setTab("gates")}
              />
            </div>
          )}
          {records.length > 0 && (
            <>
              {/* type filter chips — live counts, 44px mono toggles */}
              <div
                className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800/50 pb-2"
                role="group"
                aria-label="Filter personal records by type"
              >
                {PR_FILTERS.map((f) => {
                  const selected = prFilter === f
                  return (
                    <motion.button
                      key={f}
                      type="button"
                      onClick={() => setPrFilter(f)}
                      aria-pressed={selected}
                      whileTap={reduce ? undefined : { scale: 0.93 }}
                      transition={{ duration: 0.1 }}
                      className={cn(
                        "flex h-11 min-w-[72px] items-center justify-center gap-1.5 rounded-sm border px-3 font-mono text-[10px] font-bold tracking-widest tabular-nums transition-all focus-visible:outline focus-visible:outline-violet-400/70",
                        selected
                          ? "border-violet-400/60 bg-violet-500/20 text-violet-200 shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                          : "border-zinc-800 bg-black/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                      )}
                    >
                      {f}
                      <span className={cn("text-[8px] font-normal tracking-wider", selected ? "text-violet-300/70" : "text-zinc-400")}>
                        · {prCounts[f]}
                      </span>
                    </motion.button>
                  )
                })}
              </div>

              {visibleRecords.length === 0 && (
                <p className="py-6 text-center font-mono text-xs tracking-widest text-zinc-400">
                  NO {prFilter} RECORDS YET
                </p>
              )}

              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {visibleRecords.map((r, i) => {
                const top = i === 0
                const ctx = prContext(r)
                // matching /api/progression entry (by normalized name) → e1RM intelligence
                const key = progressionKey(r.name)
                const prog = progByKey.get(key) ?? null
                const trend = prog?.trend ?? []
                const hasE1rm = trend.length >= 2 && trend.some((t) => t.e1rm > 0)
                const latestE1rm = trend.length > 0 ? trend[trend.length - 1].e1rm : 0
                // R17-C — population strength class (null = unranked lift → no chip)
                const verdict = standardsReady
                  ? strengthVerdict(r.displayName, r.type, r.bestValue, bodyweightKg ?? 0, hunterSex)
                  : null
                return (
                  // R12-a — swipe-to-open-dossier: the swipe IS the dossier open
                  // (onCommit → the exact same setDrillKey as the tap; the button
                  // stays the accessible path). The grid cell is now the SwipeRow
                  // root — sm:col-span-2 moved onto it from the button (top row).
                  // Opaque sheet base (panel-composite approximation) rides under
                  // the button's own translucent gradients so the violet rail
                  // sleeps at rest — R10 quest-row / R11 fuel-row recipe.
                  <SwipeRow
                    key={r.id}
                    action={SWIPE_DOSSIER}
                    onCommit={() => setDrillKey(key)}
                    enabled={!reduce}
                    className={cn("relative overflow-hidden rounded-lg", top && "sm:col-span-2")}
                  >
                    <div
                      ref={(el) => {
                        if (el) prRowEls.current.set(r.id, el)
                        else prRowEls.current.delete(r.id)
                      }}
                      className="relative rounded-lg"
                      style={{ backgroundImage: "linear-gradient(160deg, #17171B, #0B0B0E)" }}
                    >
                      <motion.button
                        type="button"
                        onClick={() => setDrillKey(key)}
                        aria-haspopup="dialog"
                        aria-expanded={drillKey === key}
                        aria-label={`Open ${r.displayName} record dossier`}
                        /* R53-a — "TAP FOR HISTORY ▸" stood down: the whole row is
                           the tap target; the affordance rides this title.
                           R55-a — the hover-revealed context line (sets×reps ·
                           weight · duration) folds into the same title: its
                           max-h-0/opacity-0 clipping still fed innerText. */
                        title={`View history${ctx ? ` — ${ctx}` : ""}`}
                        initial={reduce ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={reduce ? { duration: 0 } : { duration: 0.35, ease: FLOW_EASE, delay: Math.min(i * 0.035, 0.3) }}
                        {...tapMotion}
                        className={cn(
                          "group relative flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-violet-400/70",
                          top
                            ? "border-amber-400/50 bg-gradient-to-r from-amber-500/15 via-amber-400/5 to-transparent shadow-[0_0_16px_rgba(245,158,11,0.15)] hover:from-amber-500/25"
                            : "border-zinc-700/50 bg-zinc-950/40 hover:border-amber-500/40 hover:bg-amber-500/5"
                        )}
                      >
                        {/* record bar — shimmering thread across the champion entry */}
                        {top && <span className="pr-shimmer absolute inset-x-0 top-0 h-0.5 rounded-full" aria-hidden />}

                        <span className="relative shrink-0">
                          <Trophy
                            className={cn("h-4 w-4", top ? "pr-trophy text-amber-300" : "text-zinc-600")}
                            aria-hidden
                          />
                          {top && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2" aria-hidden>
                              <Crown className="pr-crown block h-3 w-3 text-amber-300/80" />
                            </span>
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-zinc-200">{r.displayName}</p>
                          <p className="font-mono text-[9px] tracking-widest text-zinc-400">
                            {top && <span className="mr-1.5 font-bold text-amber-400/90">NO.1</span>}
                            {r.type.toUpperCase()} · {new Date(r.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {verdict && (
                              <span
                                className={cn(
                                  "sys-label ml-1.5 inline-flex items-center rounded-sm border px-1.5 align-middle text-[8px] font-bold leading-none tracking-[0.14em]",
                                  CLASS_SKIN[verdict.classId],
                                )}
                                title={`Population strength class — ${verdict.label}`}
                              >
                                {verdict.label}
                              </span>
                            )}
                            {/* R34-a — per-exercise effort chip: the window's
                                avg rated RPE beside the exercise name
                                (ratedCount gate — never fabricated for
                                unrated lifts; amber = the effort accent). */}
                            {prog && prog.ratedCount > 0 && prog.avgRpe != null && (
                              <RpeChip avg={prog.avgRpe} className="ml-1.5" />
                            )}
                          </p>
                        </div>

                        {/* e1RM intelligence — trend sparkline (desktop) + Δ vs best */}
                        {hasE1rm && prog && (
                          <>
                            <E1rmSparkline trend={trend} />
                            <E1rmDeltaChip latest={latestE1rm} best={prog.bestE1rm} />
                          </>
                        )}

                        {/* R55-a — the "BEST" micro-label stood down: the value
                            wears it as its hover title (the board label + the
                            dossier already say what the number is). */}
                        <div className="shrink-0 text-right" title="Best value">
                          <p className="font-mono text-sm font-bold tabular-nums text-amber-300">
                            {r.unit === "kg" ? `${r.bestValue} kg` : r.unit === "min" ? `${r.bestValue} min` : `${r.bestValue} reps`}
                          </p>
                        </div>
                      </motion.button>
                      {/* grip hint — AFTER the (position:relative) button in DOM so
                          it paints above it; sits in the button's px-3 padding
                          strip, inside the overflow-hidden root */}
                      {!reduce && (
                        <span
                          className="sys-row-hint pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[10px] leading-none text-zinc-600"
                          aria-hidden
                        >
                          «
                        </span>
                      )}
                    </div>
                  </SwipeRow>
                )
              })}
              </div>
            </>
          )}
        </div>
      </SystemPanel>
      )}
      </FlowReveal>

      {/* cleared sessions (reveals on scroll) */}
      <FlowReveal>
      {sessionsLoading && !sessions ? (
        <SkeletonPanel label="SYNCING SESSION ARCHIVE" rows={3} />
      ) : (
      <SystemPanel
        label="Session Archive"
        labelAccent={
          <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">{cleared.length} RECORDS</span>
        }
      >
        <div className="scroll-sys max-h-96 overflow-y-auto p-2">
          {cleared.length === 0 && (
            /* R33-b — cold-start archive: aligned with the shared empty-surface
             * idiom (glyph + hint + CTA preserved — KAEL's cleared sessions
             * always render the archive list). */
            <div className="p-2">
              <EmptySurface
                label="SESSION ARCHIVE"
                line="YOUR CLEARED SESSIONS WILL LIVE HERE"
                hint="THE ARCHIVE AWAITS YOUR FIRST SESSION"
                ctaLabel="LOG YOUR FIRST WORKOUT"
                onCta={() => setTab("gates")}
                glyph
              />
            </div>
          )}
          {/* R53-a — declutter: the flat list previews ARCHIVE_PREVIEW rows
              with a SHOW ALL expander (AnimatePresence height fold, reduce-
              safe) and the per-row exercise count rides the row's title —
              every session stays one tap away, nothing removed. */}
          {cleared.slice(0, ARCHIVE_PREVIEW).map((s, i) => renderArchiveRow(s, i))}
          <AnimatePresence initial={false}>
            {archiveAll && cleared.length > ARCHIVE_PREVIEW && (
              <motion.div
                key="archive-rest"
                initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                {cleared.slice(ARCHIVE_PREVIEW).map((s, i) => renderArchiveRow(s, i + ARCHIVE_PREVIEW))}
              </motion.div>
            )}
          </AnimatePresence>
          {cleared.length > ARCHIVE_PREVIEW && (
            <button
              type="button"
              onClick={() => setArchiveAll((v) => !v)}
              aria-expanded={archiveAll}
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-zinc-800/60 bg-zinc-950/40 font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-400 uppercase transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", archiveAll && "rotate-180")} aria-hidden />
              {archiveAll ? "SHOW LESS" : `SHOW ALL · ${cleared.length}`}
            </button>
          )}
        </div>
      </SystemPanel>
      )}
      </FlowReveal>

      {/* fitness-app interchange: Strong/Hevy CSV + Web Share (R20-c).
          Sessions prop-passed from THIS tab's /api/sessions fetch (zero
          duplicate requests); the Export Center widens the narrow local wire
          shape to the canonical DTO at its own boundary. */}
      <FlowReveal>
        <ExportCenter sessions={recent} loading={sessionsLoading && !sessions} />
      </FlowReveal>

      {/* PR dossier drill-down — one instance for whichever row is open.
          R17-C — body profile threads through so the dossier's STRENGTH
          STANDARD section classifies against the same hunter bodyweight/sex
          the row chips used. */}
      <PrDrilldown
        record={drillRecord}
        entry={drillKey ? progByKey.get(drillKey) ?? null : null}
        open={drillKey !== null}
        onOpenChange={(v) => {
          if (!v) setDrillKey(null)
        }}
        bodyweightKg={bodyweightKg}
        hunterSex={hunterSex}
      />
    </FlowGroup>
  )
}

// ─── 03 · LOAD — the Strain & Load console (R18-d) ──────────────────────────
// Whoop/Garmin/TrainingPeaks parity: daily strain 0–21, an ACWR band meter,
// and Banister fitness–fatigue–form, computed server-side by /api/load
// (lib/load.ts carries every formula + citation). Self-contained fetch
// (XpHeatmap precedent) — useApi rides the global refreshKey, so the
// console recomputes whenever the hunter refreshes.

/** Strain band skins — low teal / mid amber / high rose (semantic). */
const STRAIN_HUE: Record<StrainBand, { text: string; border: string }> = {
  LOW: { text: "text-teal-300", border: "border-teal-500/30" },
  MODERATE: { text: "text-amber-300", border: "border-amber-500/30" },
  HIGH: { text: "text-rose-300", border: "border-rose-500/30" },
}

/** ACWR verdict skins — optimal teal, undertrained zinc (honest, not alarming), elevated amber, danger rose. */
const ACWR_HUE: Record<AcwrVerdict, { text: string; chip: string; marker: string }> = {
  UNDERTRAINED: { text: "text-zinc-200", chip: "border-zinc-600/60 bg-zinc-800/50 text-zinc-300", marker: "bg-zinc-300" },
  OPTIMAL: { text: "text-teal-300", chip: "border-teal-400/50 bg-teal-500/15 text-teal-300", marker: "bg-teal-300" },
  ELEVATED: { text: "text-amber-300", chip: "border-amber-400/50 bg-amber-500/15 text-amber-300", marker: "bg-amber-300" },
  DANGER: { text: "text-rose-300", chip: "border-rose-400/50 bg-rose-500/15 text-rose-300", marker: "bg-rose-300" },
  INSUFFICIENT: { text: "text-zinc-400", chip: "border-zinc-700 bg-zinc-800/40 text-zinc-400", marker: "bg-zinc-500" },
}

/** Form (TSB) verdict skins — fresh teal, neutral violet, fatigued amber, watch rose. */
const TSB_HUE: Record<TsbVerdict, { text: string }> = {
  FRESH: { text: "text-teal-300" },
  NEUTRAL: { text: "text-violet-300" },
  FATIGUED: { text: "text-amber-300" },
  WATCH: { text: "text-rose-300" },
  INSUFFICIENT: { text: "text-zinc-400" },
}

/** One-line form verdicts (Allen & Coggan bands). R53-a: verdict word only —
 *  the explanation lives in the fitness InfoHint beside the line. */
const TSB_LINE: Record<TsbVerdict, string> = {
  FRESH: "POSITIVE FORM",
  NEUTRAL: "BALANCED",
  FATIGUED: "NEGATIVE FORM",
  WATCH: "DEEP DEFICIT",
  INSUFFICIENT: "BASELINE FORMING",
}

/** Tooltip for the load curve — day + AU load. */
function LoadTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { value?: number; payload?: { day?: string } }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const day = p.payload?.day
  return (
    <div className="sys-panel rounded-sm border-teal-500/30 px-2.5 py-1.5" role="tooltip">
      <p className="sys-label text-[9px] text-zinc-400">{day ? formatDayLabel(day).toUpperCase() : ""}</p>
      <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-teal-300">{Math.round(p.value ?? 0)} AU LOAD</p>
    </div>
  )
}

/** Strain numeral block — 0–21 scale, hue by band (count-up numeral). R53-a:
 *  `sub` optional — the scale/method lives in the strain InfoHint + aria. */
function StrainStat({ label, value, band, sub }: { label: string; value: number; band: StrainBand; sub?: string }) {
  const n = useCountUp(value, 0.9)
  const hue = STRAIN_HUE[band]
  return (
    <div
      className={cn("rounded-sm border bg-zinc-950/40 p-3 text-center", hue.border)}
      role="img"
      aria-label={`${label}: ${value.toFixed(1)} of 21 — ${band}`}
    >
      <p className={cn("sys-display sys-display-md tabular-nums", hue.text)}>{n.toFixed(1)}</p>
      <p className="mt-1.5 sys-label text-[8px] text-zinc-400">{label}</p>
      <p className="mt-0.5 font-mono text-[8px] tracking-widest text-zinc-400">
        <span className={hue.text}>{band}</span>
        {sub ? ` · ${sub}` : null}
      </p>
    </div>
  )
}

/** Fitness / Fatigue / Form numeral block (CTL / ATL / TSB, count-up numerals).
 *  R55-a — the sub line (window method / verdict word) rides the container's
 *  title + aria; the acronym tail left the label (the fitness InfoHint below
 *  carries CTL/ATL/TSB meanings). */
function FffStat({
  label,
  value,
  accent,
  sub,
  signed,
}: {
  label: string
  value: number
  accent: string
  sub: string
  signed?: boolean
}) {
  const n = useCountUp(value, 0.9)
  const shown = `${signed ? (n >= 0 ? "+" : "−") : ""}${Math.abs(n).toFixed(1)}`
  const finalShown = `${signed ? (value >= 0 ? "+" : "−") : ""}${Math.abs(value).toFixed(1)}`
  return (
    <div
      className="rounded-sm border border-zinc-800/70 bg-zinc-950/40 p-3 text-center"
      role="img"
      aria-label={`${label}: ${finalShown} — ${sub}`}
      title={`${label} — ${sub}`}
    >
      <p className={cn("font-mono text-2xl font-bold tabular-nums", accent)}>{shown}</p>
      <p className="mt-1.5 sys-label text-[8px] text-zinc-400">{label}</p>
    </div>
  )
}

/** The Strain & Load console panel — fetch, honest empty states, the four readouts. */
function LoadConsolePanel() {
  const { data: load, loading, error } = useApi<LoadView>("/api/load")
  const reduce = useReducedMotion()
  const { setTab } = useSystem()

  if (loading && !load) {
    return (
      <SkeletonPanel label="SYNCING STRAIN & LOAD" rows={2}>
        <div className="skel-bar h-40 w-full" style={{ animationDelay: "0.12s" }} />
      </SkeletonPanel>
    )
  }
  if (error || !load) {
    return (
      <SystemPanel label="Strain & Load">
        <div className="p-5 text-center">
          <p className="font-mono text-xs tracking-widest text-rose-400/80">THE CONSOLE IS SEALED</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">
            {(error ?? "NO DATA").toUpperCase()}
          </p>
        </div>
      </SystemPanel>
    )
  }
  if (load.insufficient) {
    // zero-is-data idiom: no cleared sessions → nothing to quantify yet
    return (
      <SystemPanel label="Strain & Load">
        <div className="p-6 py-8 text-center">
          <EmptyGlyph className="mx-auto h-24 w-24" />
          <p className="mt-3 font-mono text-xs tracking-widest text-zinc-400">NO SESSION HISTORY YET</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">
            STRAIN IS EARNED BY CLEARED SESSIONS — LOAD NEEDS A BASELINE
          </p>
          <button
            onClick={() => setTab("gates")}
            className="mt-4 min-h-11 rounded-sm border border-violet-400/50 bg-violet-500/15 px-4 py-2 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.4)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            LOG YOUR FIRST WORKOUT
          </button>
        </div>
      </SystemPanel>
    )
  }

  const todayBand = strainBand(load.todayStrain ?? 0)
  const weekBand = strainBand(load.weekStrain ?? 0)
  const acwr = load.acwr
  const acwrHue = ACWR_HUE[load.acwrVerdict]
  // marker position on the 0–2 scale (clamped; >2 rides the right edge)
  const acwrPct = acwr === null ? 0 : (Math.max(0, Math.min(2, acwr)) / 2) * 100
  const chartDays = load.days.slice(-30)
  const peak = chartDays.reduce((m, d) => (d.load > m.load ? d : m), chartDays[0])
  const chronicWindow = Math.min(28, load.historyDays)
  const tsbHue = TSB_HUE[load.tsbVerdict]

  return (
    <SystemPanel
      label="Strain & Load"
      labelAccent={
        /* R53-a — meaning via the strain InfoHint; the method citations that
           printed as a footnote wall ride this title attribute. */
        <span className="flex items-center gap-1.5">
          <span
            className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400"
            title="Session load = effort × duration (Foster 2001, session-RPE) · strain 0–21 (Whoop scale convention — homage) · ACWR bands (Gabbett 2016, BJSM) · CTL/ATL/TSB (Banister 1991 · Allen & Coggan)"
          >
            {load.historyDays}D HISTORY
          </span>
          <InfoHint term="strain" />
        </span>
      }
    >
      <div className="p-4 pt-5 sm:p-5">
        {/* strain readout — today + 7-day mean, both on the 0–21 scale.
            R55-a — the "· STRAIN" label tails stood down (the panel label
            already says it); aria keeps the full read. */}
        <div className="grid grid-cols-2 gap-3">
          <StrainStat label="TODAY" value={load.todayStrain ?? 0} band={todayBand} />
          <StrainStat label="7-DAY" value={load.weekStrain ?? 0} band={weekBand} sub="7D" />
        </div>

        {/* ACWR — band meter with the 0.8–1.3 sweet spot marked */}
        <div className="mt-4 border-t border-zinc-800/60 pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className="sys-label flex items-center gap-1.5 text-[9px] text-zinc-400"
              title="ACWR — acute:chronic workload ratio"
            >
              ACWR
              <InfoHint term="acwr" />
            </p>
            <p className={cn("font-mono text-lg font-bold tabular-nums", acwrHue.text)}>
              {acwr === null ? "—" : acwr.toFixed(2)}
            </p>
          </div>
          <div
            className="relative mt-3"
            role="img"
            aria-label={`Workload ratio meter, 0 to 2 scale${
              acwr === null ? "" : `, current ${acwr.toFixed(2)}`
            }. Verdict ${load.acwrVerdict}. Optimal band 0.8 to 1.3.`}
          >
            {/* band segments — undertrained zinc, sweet spot teal, elevated amber, danger rose */}
            <div className="relative h-2 rounded-sm bg-zinc-800/80">
              <span className="absolute inset-y-0 left-0 w-[40%] rounded-l-sm bg-zinc-600/25" aria-hidden />
              <span className="absolute inset-y-0 left-[40%] w-[25%] bg-teal-500/40" aria-hidden />
              <span className="absolute inset-y-0 left-[65%] w-[10%] bg-amber-500/40" aria-hidden />
              <span className="absolute inset-y-0 left-[75%] w-[25%] rounded-r-sm bg-rose-500/40" aria-hidden />
            </div>
            {/* marker sweep — MeterFlow drives the width from 0, the marker
                rides its right edge (R16-a lesson: left-positioned pointers
                can't use MeterFlow directly; a right-edge child of the
                sweeping width can) */}
            <div className="pointer-events-none absolute inset-x-0 -top-1 h-4" aria-hidden>
              <MeterFlow pct={acwrPct} duration={0.9} className="relative h-full">
                <span className={cn("absolute right-0 top-0 h-4 w-0.5 translate-x-1/2 rounded-full", acwrHue.marker)} />
              </MeterFlow>
            </div>
            {/* scale labels */}
            <div className="relative mt-1.5 h-3 font-mono text-[8px] tabular-nums text-zinc-400" aria-hidden>
              <span className="absolute left-0">0.0</span>
              <span className="absolute left-[40%] -translate-x-1/2">0.8</span>
              <span className="absolute left-[65%] -translate-x-1/2">1.3</span>
              <span className="absolute right-0">2.0</span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
                acwrHue.chip
              )}
            >
              {load.acwrVerdict}
            </span>
            {load.historyDays < 28 && (
              <span
                className="font-mono text-[8px] tracking-[0.18em] text-zinc-400"
                title={`Chronic window ${chronicWindow}d — baseline still forming`}
              >
                BASELINE FORMING
              </span>
            )}
          </div>
        </div>

        {/* fitness / fatigue / form — CTL, ATL, TSB (R55-a — labels keep the
            plain word; acronyms + windows ride title/aria, meanings in the
            fitness InfoHint below) */}
        <div className="mt-4 border-t border-zinc-800/60 pt-4">
          <div className="grid grid-cols-3 gap-3">
            <FffStat label="FITNESS" value={load.ctl ?? 0} accent="text-teal-300" sub="CTL · 42D EWMA" />
            <FffStat label="FATIGUE" value={load.atl ?? 0} accent="text-amber-300" sub="ATL · 7D EWMA" />
            <FffStat label="FORM" value={load.tsb ?? 0} accent={tsbHue.text} sub={`TSB · ${load.tsbVerdict}`} signed />
          </div>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center font-mono text-[9px] tracking-[0.2em] text-zinc-400">
            {TSB_LINE[load.tsbVerdict]}
            <InfoHint term="fitness" />
          </p>
        </div>

        {/* load curve — daily AU, last 30 days (R55-a — sessionLoad hint on
            the label; the "CURVE" tail rides title) */}
        <div className="mt-4 border-t border-zinc-800/60 pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="sys-label flex items-center gap-1.5 text-[9px] text-zinc-400" title="Daily session load curve, last 30 days">
              LOAD · 30 DAYS
              <InfoHint term="sessionLoad" />
            </p>
            {peak.load > 0 && (
              <p className="font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
                PEAK {Math.round(peak.load)} AU · {formatDayLabel(peak.day).toUpperCase()}
              </p>
            )}
          </div>
          <div className="mt-2 h-40 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartDays} margin={{ top: 4, right: 26, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(45,212,191,0.08)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => formatDayLabel(d)}
                  tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={{ stroke: "rgba(45,212,191,0.15)" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  /* R56 — the 90-day strain curve thins to ~weekly anchors
                   * (minTickGap 48 kept ~17 labels on wide desktop). */
                  minTickGap={96}
                />
                <YAxis
                  tickCount={3}
                  tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip content={<LoadTooltip />} cursor={{ stroke: "rgba(45,212,191,0.3)" }} />
                <Area
                  type="monotone"
                  dataKey="load"
                  stroke="#2dd4bf"
                  strokeWidth={2}
                  fill="url(#loadGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#5eead4", stroke: "#07060c" }}
                  /* R15-c lesson — the curve's draw-in rides recharts' own
                     animator (recharts owns the SVG path); 1.1s ease-out
                     matches the FLOW_EASE draw language, reduce renders it
                     complete. */
                  isAnimationActive={!reduce}
                  animationBegin={120}
                  animationDuration={1100}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* R60 — the deload advisor: the prescription read of this console's
            own week history (lib/deload.ts, the R22-a orphan finally mounted) */}
        <DeloadAdvisor load={load} />

        {/* R53-a — the citation footnote wall stood down: meanings live in the
            strain/acwr/fitness InfoHints, the citations ride the panel
            accent's title attribute (hover "21D HISTORY"). */}
      </div>
    </SystemPanel>
  )
}

// ─── R34-a · EFFORT LEDGER — the RPE payout surface ──────────────────────────
// The raid console captures a Borg CR10 rating on every working set (R32-a,
// ExerciseLog.rpe) but RECORDS never read it back — friction in, nothing out.
// This panel is the dividend: the global effort temperature (per-session avg
// RPE, amber — the effort/heat accent on zinc), an honest last-3 vs prior-3
// drift verdict (±0.5 RPE tolerance — rpe.ts's rpeVerdict bands re-labeled
// for trend reading), and the per-exercise ledger with mini RPE trends.

/** Drift verdict skins — harder = amber (heat), steady = zinc (the honest
 *  neutral, ACWR's UNDERTRAINED idiom), easing = teal (the app's recovery
 *  language). Keys are rpeVerdict's bands: back-off (effort ABOVE the prior
 *  baseline) reads as drifting harder, push (below it) as easing, in-zone as
 *  steady. */
const DRIFT_META: Record<RpeVerdict, { label: string; text: string; border: string }> = {
  "back-off": { label: "DRIFTING HARDER", text: "text-amber-300", border: "border-amber-500/30" },
  "in-zone": { label: "STEADY", text: "text-zinc-300", border: "border-zinc-600/60" },
  push: { label: "EASING", text: "text-teal-300", border: "border-teal-500/30" },
}

/** Mean RPE of a non-empty point slice (caller guarantees length ≥ 1). */
function meanRpe(pts: EffortPointDTO[]): number {
  return pts.reduce((a, p) => a + p.avgRpe, 0) / pts.length
}

/** Tooltip for the per-exercise RPE sparkline — day + session-mean RPE. */
function RpeSparkTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { value?: number; payload?: { day?: string } }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const day = p.payload?.day
  return (
    <div className="sys-panel rounded-sm border-amber-500/30 px-2.5 py-1.5" role="tooltip">
      <p className="sys-label text-[9px] text-zinc-400">{day ? formatDayLabel(day).toUpperCase() : ""}</p>
      <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-amber-300">RPE {(p.value ?? 0).toFixed(1)}</p>
    </div>
  )
}

/** Tiny inline per-session RPE sparkline — amber, no axes/grid/dots (the
 *  E1rmSparkline recipe in the effort/heat accent). */
function RpeSparkline({ trend }: { trend: EffortPointDTO[] }) {
  return (
    <div
      className="hidden shrink-0 sm:block"
      title="Average RPE per rated session (last 90 days)"
      role="img"
      aria-label={`Rated-effort trend, ${trend[0].avgRpe.toFixed(1)} to ${trend[trend.length - 1].avgRpe.toFixed(1)} RPE across ${trend.length} sessions`}
    >
      <ResponsiveContainer width={72} height={28}>
        <LineChart data={trend} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
          <Line type="monotone" dataKey="avgRpe" stroke="#fcd34d" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Tooltip content={<RpeSparkTooltip />} cursor={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Tooltip for the effort temperature chart — day + session-mean RPE + rated sets. */
function EffortTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { value?: number; payload?: { day?: string; ratedSets?: number } }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const day = p.payload?.day
  return (
    <div className="sys-panel rounded-sm border-amber-500/30 px-2.5 py-1.5" role="tooltip">
      <p className="sys-label text-[9px] text-zinc-400">{day ? formatDayLabel(day).toUpperCase() : ""}</p>
      <p className="mt-0.5 font-mono text-xs font-bold tabular-nums text-amber-300">RPE {(p.value ?? 0).toFixed(1)} AVG</p>
      {p.payload?.ratedSets != null && (
        <p className="mt-0.5 font-mono text-[9px] tabular-nums text-zinc-400">{p.payload.ratedSets} RATED SETS</p>
      )}
    </div>
  )
}

/** Compact per-exercise effort chip — "RPE x.x" in the effort/heat accent,
 *  tabular numerals (the strength-class chip's exact chrome in amber).
 *  Rendered only where ratedCount > 0 — never fabricated. */
function RpeChip({ avg, className }: { avg: number; className?: string }) {
  return (
    <span
      className={cn(
        "sys-label inline-flex items-center rounded-sm border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 align-middle text-[8px] font-bold leading-none tracking-[0.14em] text-amber-300/80 tabular-nums",
        className
      )}
      title={`Average rated effort ${avg.toFixed(1)} of 10 — Borg CR10`}
    >
      RPE {avg.toFixed(1)}
    </span>
  )
}

/** Last-3 vs prior-3 drift readout. The verdict unlocks at 6 rated sessions
 *  (two FULL windows — a partial prior window would pass noise off as drift;
 *  LOG MORE's unlock-at-3 discipline). ±0.5 tolerance = rpeVerdict's in-zone
 *  band, fed UNROUNDED means so the band edge can't flip on the series' 0.1
 *  wire rounding (display alone rounds). */
function EffortDriftStat({ series }: { series: EffortPointDTO[] }) {
  const last3 = series.slice(-3)
  const prior3 = series.length >= 6 ? series.slice(-6, -3) : []
  const lastAvg = meanRpe(last3)
  const priorAvg = prior3.length > 0 ? meanRpe(prior3) : null
  const verdict: RpeVerdict | null = priorAvg != null ? rpeVerdict(lastAvg, priorAvg) : null
  const hue = verdict ? DRIFT_META[verdict] : null
  const delta = priorAvg != null ? lastAvg - priorAvg : 0
  // FffStat discipline — the magnitude counts up, the sign rides the final value
  const n = useCountUp(priorAvg != null ? Math.abs(delta) : lastAvg, 0.9)
  const shown = priorAvg != null ? `${delta >= 0 ? "+" : "−"}${n.toFixed(1)}` : n.toFixed(1)
  return (
    <div
      className={cn("rounded-sm border bg-zinc-950/40 p-3 text-center", hue?.border ?? "border-zinc-800/70")}
      role="img"
      aria-label={
        priorAvg != null
          ? `Effort drift — last 3 sessions average ${lastAvg.toFixed(1)} RPE versus prior 3 average ${priorAvg.toFixed(1)}: ${hue!.label.toLowerCase()}`
          : `Effort baseline forming — ${series.length} rated sessions, recent average ${lastAvg.toFixed(1)} RPE`
      }
    >
      <p className={cn("font-mono text-2xl font-bold tabular-nums", hue?.text ?? "text-amber-300")}>{shown}</p>
      <p className="mt-1.5 sys-label text-[8px] text-zinc-400">DRIFT · LAST 3 VS PRIOR 3</p>
      <p className={cn("mt-0.5 font-mono text-[8px] tracking-widest", hue?.text ?? "text-zinc-400")}>
        {verdict ? hue!.label : "BASELINE FORMING"}
      </p>
      <p className="mt-0.5 font-mono text-[8px] tracking-widest text-zinc-500">
        {verdict ? `LAST ${lastAvg.toFixed(1)} · PRIOR ${priorAvg!.toFixed(1)}` : "UNLOCKS AT 6 RATED SESSIONS"}
      </p>
    </div>
  )
}

/** The Effort Ledger panel — designed empty state when nothing in the window
 *  carries a rating (every pre-R32-a legacy row — KAEL's view), the sealed
 *  state on fetch failure (an error never masquerades as "no ratings yet"),
 *  and the live ledger otherwise. */
function EffortLedgerPanel({
  progression,
  loading,
  error,
}: {
  progression: ProgressionRes | null
  loading: boolean
  error: string | null
}) {
  const reduce = useReducedMotion()
  const { setTab } = useSystem()
  const effort = progression?.effort ?? null
  const series = effort?.series ?? []
  const windowAvg = effort?.windowAvg ?? null
  const ratedSetsTotal = series.reduce((a, p) => a + p.ratedSets, 0)
  // count-up hooks ride fallback zeros so hook order stays stable across the
  // early-return states below (they never mount in those branches)
  const avgCount = useCountUp(windowAvg ?? 0, 0.9)
  const ratedEntries = (progression?.entries ?? []).filter(
    (e): e is ProgressionEntry & { avgRpe: number } => e.ratedCount > 0 && e.avgRpe != null
  )

  if (loading && !progression) {
    return (
      <SkeletonPanel label="SYNCING EFFORT LEDGER" rows={2}>
        <div className="skel-bar h-36 w-full" style={{ animationDelay: "0.12s" }} />
      </SkeletonPanel>
    )
  }

  if (error && !progression) {
    // honest failure state — an error must not masquerade as "no ratings yet"
    return (
      <SystemPanel label="Effort Ledger">
        <div className="p-5 text-center">
          <p className="font-mono text-xs tracking-widest text-rose-400/80">THE LEDGER IS SEALED</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">
            {(error ?? "NO DATA").toUpperCase()}
          </p>
        </div>
      </SystemPanel>
    )
  }

  if (series.length === 0 || windowAvg == null) {
    // designed empty state — zero rated logs in the window (KAEL's 11 legacy
    // logs are all rpe=null; a brand-new hunter has no logs at all). R53-a:
    // the EmptySurface trio (label/glyph/hint) compressed to ONE quiet
    // sentence-case line + the CTA — the meaning rides the rpe InfoHint.
    // R55-a — the line kept only its head; the tail rides the container's
    // aria-label below (merge & hide).
    return (
      <SystemPanel label="Effort Ledger" labelAccent={<InfoHint term="rpe" />}>
        <div className="p-2">
          <div
            role="status"
            aria-label="Effort ledger — no effort ratings yet. Rate working sets in a session to light it up."
            className="rounded-sm border border-dashed border-zinc-700/60 bg-zinc-950/30 px-4 py-5 text-center transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 sm:px-5"
          >
            <p className="font-mono text-[10px] tracking-[0.12em] text-zinc-400" title="Rate working sets in a session to light it up">
              No effort ratings yet
            </p>
            <button
              type="button"
              onClick={() => setTab("gates")}
              className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-sm border border-violet-400/50 bg-violet-500/15 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.4)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              RATE A WORKING SET
              <ChevronRight className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>
      </SystemPanel>
    )
  }

  return (
    <SystemPanel
      label="Effort Ledger"
      labelAccent={
        <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          <Flame className="h-3 w-3 text-amber-400/70" aria-hidden /> {ratedSetsTotal} RATED SETS
          <InfoHint term="rpe" />
        </span>
      }
    >
      <div className="p-4 pt-5 sm:p-5">
        {/* global effort temperature — per-session avg RPE, amber on zinc.
            R53-a — the "BORG CR10 · 1–10" scale legend + the method footnote
            folded into this label's title (the rpe InfoHint carries the
            meaning; the chart's own axis carries the scale). */}
        <p
          className="sys-label text-[9px] text-zinc-400"
          title="Borg CR10 · 1–10 scale · effort = mean rated RPE per session, rated in the raid console · drift = last 3 vs prior 3 sessions, ±0.5 tolerance"
        >
          EFFORT TEMPERATURE · PER-SESSION AVG
        </p>
        <div
          className="mt-2 h-36 sm:h-40"
          role="img"
          aria-label={`Effort temperature chart — average RPE per rated session, ${series.length} sessions from ${formatDayLabel(series[0].day)} to ${formatDayLabel(series[series.length - 1].day)}, 90-day average ${windowAvg.toFixed(1)} of 10.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="rpeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(251,191,36,0.08)" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(d: string) => formatDayLabel(d)}
                tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                axisLine={{ stroke: "rgba(251,191,36,0.15)" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={64}
              />
              <YAxis
                domain={[1, 10]}
                ticks={[1, 5, 10]}
                tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip content={<EffortTooltip />} cursor={{ stroke: "rgba(251,191,36,0.3)" }} />
              <Area
                type="monotone"
                dataKey="avgRpe"
                stroke="#fbbf24"
                strokeWidth={2}
                fill="url(#rpeGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#fcd34d", stroke: "#07060c" }}
                /* R15-c lesson — the curve's draw-in rides recharts' own
                   animator (recharts owns the SVG path); 1.1s ease-out
                   matches the FLOW_EASE draw language, reduce renders it
                   complete. */
                isAnimationActive={!reduce}
                animationBegin={120}
                animationDuration={1100}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* readouts — 90-day mean + the drift verdict */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div
            className="rounded-sm border border-amber-500/30 bg-zinc-950/40 p-3 text-center"
            role="img"
            aria-label={`90-day average effort ${windowAvg.toFixed(1)} of 10 — ${describeRpe(windowAvg)}`}
          >
            <p className="font-mono text-2xl font-bold tabular-nums text-amber-300">{avgCount.toFixed(1)}</p>
            <p className="mt-1.5 sys-label text-[8px] text-zinc-400">90-DAY EFFORT</p>
            <p className="mt-0.5 font-mono text-[8px] leading-relaxed tracking-widest text-zinc-400">
              {describeRpe(windowAvg)}
            </p>
          </div>
          <EffortDriftStat series={series} />
        </div>

        {/* per-exercise ledger — avg RPE + mini trend per rated exercise
            (entries arrive lastDay-desc; every row keeps a 44px min height) */}
        <div className="mt-4 border-t border-zinc-800/60 pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="sys-label text-[9px] text-zinc-400">BY EXERCISE · AVG RATED RPE</p>
            <p className="font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
              {ratedEntries.length} RATED
            </p>
          </div>
          <div className="scroll-sys mt-2 max-h-72 space-y-1.5 overflow-y-auto" aria-label="Per-exercise average effort ledger">
            {ratedEntries.map((e) => (
              <div
                key={e.key ?? e.name}
                className="flex min-h-11 items-center gap-3 rounded-sm border border-zinc-800/70 bg-zinc-950/40 px-3"
              >
                <p className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">{e.name}</p>
                <RpeSparkline trend={e.rpeTrend} />
                <RpeChip avg={e.avgRpe} />
                <span
                  className="shrink-0 font-mono text-[8px] tracking-widest text-zinc-500"
                  title={`${e.ratedCount} rated log${e.ratedCount === 1 ? "" : "s"} in the window`}
                >
                  {e.ratedCount} RATED
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* R53-a — the method footnote stood down (folded into the temperature
            label's title above; meaning via the rpe InfoHint). */}
      </div>
    </SystemPanel>
  )
}

function TotalTile({
  icon: Icon,
  label,
  value,
  countTo,
  format,
  accent,
  index,
  reduce,
  hero,
  hint,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  /** animated numeral target — rolled up through `format` (final render matches `value`) */
  countTo?: number
  format?: (n: number) => string
  accent: string
  index: number
  reduce: boolean
  /** R9-b — display-scale moment (.sys-display-md); reserved for the 1-2 hero tiles */
  hero?: boolean
  /** R53-a — optional pop-up meaning on the tile's micro-cap label. */
  hint?: GlossaryKey
  /** R55-a — hover title carrying the folded full term ("Sessions logged — lifetime"). */
  title?: string
}) {
  const n = useCountUp(countTo ?? 0, 0.9)
  const shown = countTo !== undefined && format ? format(n) : value
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.4, ease: FLOW_EASE, delay: index * 0.06 }}
      className="sys-panel rounded-sm p-4 text-center"
      title={title}
    >
      <Icon className={cn("mx-auto h-5 w-5", accent)} aria-hidden />
      <p className={cn(hero ? "sys-display sys-display-md mt-1" : "mt-2 font-mono text-xl font-bold", "tabular-nums")}>
        {shown}
      </p>
      <p className="mt-1 sys-label inline-flex items-center justify-center gap-1 text-[8px] text-zinc-400">
        {label}
        {hint && <InfoHint term={hint} />}
      </p>
    </motion.div>
  )
}
