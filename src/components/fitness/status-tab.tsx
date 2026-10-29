"use client"

import { useSyncExternalStore, useState } from "react"
import { ChevronDown, ChevronRight, Dumbbell, FlaskConical, HeartPulse, Sparkles, Swords, Timer, TrendingUp } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { InfoHint } from "@/components/system/info-hint"
import { HunterCard } from "./hunter-card"
import { CommandDeck } from "./command-deck"
import { DestinationIndex } from "./destination-index"
import { StatGrid } from "./stat-grid"
import { AscensionCard } from "./ascension-card"
import { ShareCardButton } from "./share-card"
import { DataVaultButton } from "./data-vault"
import { DailyBriefing } from "./daily-briefing"
import { RestDayCard } from "./rest-day-card"
import { ActivityRingsPanel } from "./activity-rings"
import { VitalsSnapshot } from "./vitals-tab"
import { DigestShareButton } from "./digest-share-card"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { FLOW_EASE, FlowGroup, FlowItem, FlowReveal, MeterFlow, useCountUp } from "@/components/system/motion"
import { useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { dayKey, formatDayLabel } from "@/lib/game"
import { SCIENCE_ENTRIES } from "@/lib/science"
import type { HunterDTO, QuestDTO, SessionDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// R55-d declutter — the tab's Oracle banner is compressed by the local
// QuietOracleLine below (same endpoint + contract as ./oracle-tip, which
// stays on disk untouched for the tabs that still mount it — the R54-c2
// directives-tab lane-safe precedent).

type QuestsRes = { dailies: QuestDTO[]; main: QuestDTO[] }
type SessionsRes = { active: SessionDTO | null; history: SessionDTO[] }

/** GET /api/monthly-summary — 30-day rolling digest vs the prior 30 days. */
export type MonthlySummaryRes = {
  window: { from: string; to: string }
  sessions: number
  xp: number
  volumeKg: number
  minutes: number
  cardioMin: number
  prsSet: number
  activeDays: number
  avgReadiness: number | null
  /** additive: prior-window mean readiness (null when no vitals days). */
  avgReadinessPrev?: number | null
  bestDay: { day: string; xp: number } | null
  deltas: { sessions: number; xp: number; volumeKg: number; minutes: number; prsSet: number }
}

/** Delta chip vs the prior 30 days — amber up / rose down / zinc flat / violet NEW. */
function DeltaChip({ delta, prefix = "+" }: { delta: number; prefix?: string }) {
  if (delta > 0) {
    return (
      <span className="grove-press rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold tabular-nums tracking-wider text-amber-300">
        {prefix}
        {delta.toLocaleString()}
      </span>
    )
  }
  if (delta < 0) {
    return (
      <span className="grove-press rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold tabular-nums tracking-wider text-rose-300">
        {delta.toLocaleString()}
      </span>
    )
  }
  return (
    <span className="grove-press rounded-full border border-zinc-700/60 bg-zinc-800/40 px-1.5 py-0.5 text-[9px] font-bold tabular-nums tracking-wider text-zinc-400">
      ±0
    </span>
  )
}

/** Specialization of DeltaChip for the NEW case (prior window was zero). */
function NewChip() {
  return (
    <span className="grove-press rounded-full border border-violet-500/50 bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-violet-300">
      NEW
    </span>
  )
}

/** A digest stat tile — value + micro-label + delta chip vs the prior 30 days. */
function DigestTile({
  icon: Icon,
  label,
  value,
  accent,
  delta,
  isNew,
  countTo,
  countFormat,
}: {
  icon: React.ComponentType<{ className?: string }>
  /** Micro-cap label — plain string, or a node carrying an InfoHint. */
  label: React.ReactNode
  value: string
  accent: string
  /** Raw delta number; null renders no chip. */
  delta: number | null
  isNew?: boolean
  /** When set together with `countFormat`, the numeral counts up from zero on mount. */
  countTo?: number
  countFormat?: (n: number) => string
}) {
  const counted = useCountUp(countTo ?? 0)
  const shown = countTo !== undefined && countFormat ? countFormat(counted) : value
  return (
    <div className="grove-lift relative rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-3 py-3 transition-colors hover:border-violet-500/40 hover:bg-violet-500/5">
      <div className="flex items-center justify-between gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", accent)} aria-hidden />
        <span className="shrink-0">{isNew ? <NewChip /> : delta !== null ? <DeltaChip delta={delta} /> : null}</span>
      </div>
      {/* R43 studio — grotesque numerals (Space Grotesk via sys-display):
          the tile values match the hunter-card hero register. */}
      <p className="sys-display mt-1.5 text-xl">{shown}</p>
      <p className="mt-1 text-[8px] font-bold tracking-[0.14em] text-zinc-400">{label}</p>
    </div>
  )
}

/** Static-day store for the FIELD MANUAL rotation — the framework-blessed
 *  pattern (the repo's react-hooks/set-state-in-effect lint rule forbids a
 *  plain useEffect-setState rotation). Subscribe is a noop so the store never
 *  pushes; the client snapshot (epoch days) is stable within a day, the
 *  server snapshot stays 0 — useSyncExternalStore reconciles post-hydration
 *  without a mismatch warning. */
const subscribeNoop = () => () => {}

const dayOfYearSnapshot = () => Math.floor(Date.now() / 86400000)

/** R29-b — FIELD MANUAL: four consensus rows a day, rotating through the
 *  14-entry science module (day step ×4 walks the whole manual; the modulo
 *  wraps cleanly at the stable list length). Org-level labels only.
 *  R52 declutter: collapsed to ONE compact row on the landing view —
 *  "FIELD MANUAL" micro-cap + chevron; the exact 4-entry list waits
 *  behind the tap (AnimatePresence height / opacity, reduced-motion
 *  safe). R55-d: the count hint rides the button's title. */
function FieldManualPanel() {
  const dayOfYear = useSyncExternalStore(subscribeNoop, dayOfYearSnapshot, () => 0)
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const start = (dayOfYear * 4) % SCIENCE_ENTRIES.length
  const entries = Array.from(
    { length: 4 },
    (_, i) => SCIENCE_ENTRIES[(start + i) % SCIENCE_ENTRIES.length]!
  )
  return (
    <SystemPanel>
      {/* the collapsed row IS the toggle — micro-cap label + chevron,
          44px hit area, SystemPanel-header styling once expanded.
          R55-d — the "N entries · rotates daily" count hint rides the
          button's title (a11y already covers it via aria-label). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Collapse the field manual" : "Expand the field manual — four daily science entries"}
        title={`${entries.length} entries · rotates daily`}
        className={cn(
          "grove-press flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-violet-500/[0.04] focus-visible:outline focus-visible:outline-violet-400/70 sm:px-5",
          open && "border-b border-violet-500/10"
        )}
      >
        <FlaskConical className="h-3 w-3 shrink-0 text-teal-400/70" aria-hidden />
        <span className="sys-label text-violet-300/80">Field Manual</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-300",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="field-manual-entries"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: FLOW_EASE }}
            className="overflow-hidden"
          >
            <ul
              className="divide-y divide-zinc-800/60"
              aria-label="Field manual — consensus training science"
            >
              {entries.map((e) => (
                <li key={e.id} className="px-4 py-3 first:pt-3.5 last:pb-3.5 sm:px-5">
                  <div className="flex items-baseline justify-between gap-x-3">
                    <p className="text-[10px] font-bold tracking-[0.16em] text-zinc-300">{e.title}</p>
                    <p className="shrink-0 text-[9px] font-semibold tracking-wider text-zinc-400">{e.source}</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{e.body}</p>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </SystemPanel>
  )
}

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
      className="rounded-2xl border border-dashed border-zinc-700/60 bg-zinc-950/30 px-4 py-6 text-center transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:shadow-[0_0_18px_rgba(167,139,250,0.12)] sm:px-5"
    >
      <p className="sys-label text-[9px] text-zinc-400">{label}</p>
      {glyph && <EmptyGlyph className="mx-auto mt-2 h-16 w-16 opacity-70" />}
      <p className="mt-2 text-xs font-semibold tracking-wide text-zinc-300">{line}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-400">{hint}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="grove-press mt-4 inline-flex h-11 items-center gap-1.5 rounded-full border border-violet-400/50 bg-violet-500/15 px-4 text-[10px] font-bold tracking-[0.12em] text-violet-300 transition-colors hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(167,139,250,0.3)] focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {ctaLabel}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </motion.div>
  )
}

/** 30-DAY DIGEST — rolling 30-day window vs the prior 30 days. */
function MonthlyDigest({ hunter }: { hunter: HunterDTO }) {
  const { data, loading, error } = useApi<MonthlySummaryRes>("/api/monthly-summary")
  const { setTab } = useSystem()

  if (loading && !data) {
    return (
      <SkeletonPanel label="Gathering the digest" rows={2}>
        <div className="skel-bar h-12 w-full" style={{ animationDelay: "0.12s" }} />
      </SkeletonPanel>
    )
  }
  if (error || !data) {
    return (
      <FlowItem>
        <SystemPanel label="30-Day Digest">
          <div className="p-5 text-center">
            <p className="text-xs font-semibold tracking-wide text-rose-400/80">Digest unavailable</p>
            <p className="mt-1 text-[10px] font-medium tracking-wider text-zinc-400">
              {error ?? "No data"}
            </p>
          </div>
        </SystemPanel>
      </FlowItem>
    )
  }

  // R33-b — cold-start digest: a window with zero sessions AND zero XP is a
  // brand-new (or never-trained) hunter — the designed empty slot replaces the
  // four zero tiles (no fabricated numbers, no share-card of zeros). KAEL has
  // sessions inside the window, so the data-rich tiles always render.
  if (data.sessions === 0 && data.xp === 0) {
    return (
      <FlowReveal>
        <SystemPanel
          label="30-Day Digest"
          labelAccent={
            <span className="text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
              {formatDayLabel(data.window.from).toUpperCase()} – {formatDayLabel(data.window.to).toUpperCase()}
            </span>
          }
        >
          <div className="p-4 sm:p-5">
            <EmptySurface
              label="30-day digest"
              line="Your first session lands here"
              hint="Sessions, XP, volume and active days accrue as you train"
              ctaLabel="Open the gates"
              onCta={() => setTab("gates")}
            />
          </div>
        </SystemPanel>
      </FlowReveal>
    )
  }

  const readinessDelta =
    data.avgReadiness !== null && data.avgReadinessPrev != null && data.avgReadinessPrev !== undefined
      ? Math.round((data.avgReadiness - data.avgReadinessPrev) * 10) / 10
      : null

  return (
    <FlowReveal>
      <SystemPanel
        label="30-Day Digest"
        labelAccent={
          <span className="text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
            {formatDayLabel(data.window.from).toUpperCase()} – {formatDayLabel(data.window.to).toUpperCase()}
          </span>
        }
      >
        <div className="space-y-3.5 p-4 sm:p-5" role="status" aria-label="30-day training digest">
          <FlowGroup className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <FlowItem>
              <DigestTile
                icon={Swords}
                label="Sessions"
                value={String(data.sessions)}
                accent="text-fuchsia-300"
                delta={data.deltas.sessions}
                isNew={data.sessions > 0 && data.sessions === data.deltas.sessions}
                countTo={data.sessions}
                countFormat={(n) => String(Math.round(n))}
              />
            </FlowItem>
            <FlowItem>
              <DigestTile
                icon={Sparkles}
                label="XP earned"
                value={data.xp.toLocaleString()}
                accent="text-violet-300"
                delta={data.deltas.xp}
                isNew={data.xp > 0 && data.xp === data.deltas.xp}
                countTo={data.xp}
                countFormat={(n) => Math.round(n).toLocaleString()}
              />
            </FlowItem>
            <FlowItem>
              <DigestTile
                icon={Dumbbell}
                label="Volume"
                value={`${(data.volumeKg / 1000).toFixed(1)}t`}
                accent="text-amber-300"
                delta={data.deltas.volumeKg}
                isNew={data.volumeKg > 0 && data.volumeKg === data.deltas.volumeKg}
                countTo={data.volumeKg}
                countFormat={(n) => `${(n / 1000).toFixed(1)}t`}
              />
            </FlowItem>
            <FlowItem>
              <DigestTile
                icon={HeartPulse}
                label={
                  /* R52 declutter — the readiness term's meaning rides the hint */
                  <span className="inline-flex items-center gap-1">
                    Avg readiness
                    <InfoHint term="readiness" />
                  </span>
                }
                value={data.avgReadiness === null ? "—" : data.avgReadiness.toFixed(1)}
                accent="text-teal-300"
                delta={readinessDelta}
                countTo={data.avgReadiness ?? undefined}
                countFormat={(n) => n.toFixed(1)}
              />
            </FlowItem>
          </FlowGroup>

          {/* footer — most profitable day + active-days gauge */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-violet-500/10 pt-3">
            {data.bestDay ? (
              <p
                className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider text-amber-400/70"
                /* R55-d — the best-day date rides the title; the face keeps
                    the day's XP headline */
                title={`Best day · ${formatDayLabel(data.bestDay.day)} · +${data.bestDay.xp.toLocaleString()} XP`}
              >
                <span className="inline-block h-1 w-1 rounded-full bg-amber-400/70 shadow-[0_0_5px_rgba(245,158,11,0.5)]" aria-hidden />
                Best day +{data.bestDay.xp.toLocaleString()} XP
              </p>
            ) : (
              <p className="text-[9px] font-semibold tracking-wider text-zinc-400">No XP earned this window</p>
            )}
            <div className="flex min-w-[7.5rem] flex-1 items-center gap-2.5 sm:flex-none sm:justify-end">
              <span
                className="shrink-0 text-[9px] font-semibold tabular-nums tracking-wider text-zinc-400"
                /* R55-d — the "active days" words ride the title (the gauge's
                    aria-label carries them too); the face keeps the n/30 datum */
                title={`${data.activeDays} of 30 active days`}
              >
                {data.activeDays}/30
              </span>
              {/* R42 studio — the active-days gauge joins the aurora family: a
                  3px luminous hairline whose ends dissolve; MeterFlow's inView
                  mount sweep still pours the fill once the row scrolls in. */}
              <div
                className="aurora-track w-full max-w-[7rem]"
                role="progressbar"
                aria-valuenow={data.activeDays}
                aria-valuemin={0}
                aria-valuemax={30}
                aria-label={`${data.activeDays} of 30 active days`}
              >
                <MeterFlow
                  inView
                  pct={Math.min(100, (data.activeDays / 30) * 100)}
                  className="aurora-fill"
                  style={{ transition: "none" }}
                />
              </div>
            </div>
          </div>

          {/* export — render the digest as a shareable PNG card */}
          <div className="flex justify-end">
            <DigestShareButton hunter={hunter} summary={data} />
          </div>
        </div>
      </SystemPanel>
    </FlowReveal>
  )
}

// ── R55-d — the STATUS Oracle banner, compressed ───────────────────────────
// Same endpoint, same data, same null-while-loading contract as the shared
// OracleTip (./oracle-tip, untouched): known status-tip segments compress to
// essentials and the full oracle sentence rides the line's title; the
// decorative ORACLE badge stands down. Unrecognized tips — e.g. the
// [FIELD MANUAL] science fallback — render whole; never mangle what we
// can't parse (the R54-c2 directives-tab recipe).
const ORACLE_SEGMENT_MAP: { re: RegExp; to: string | null }[] = [
  { re: /^1 GOAL UNCLAIMED$/, to: "1 goal unclaimed" },
  { re: /^(\d+) GOALS UNCLAIMED$/, to: "$1 goals unclaimed" },
  { re: /^\+(\d+) XP ON THE TABLE$/, to: "+$1 XP" },
  { re: /^ALL DAILY GOALS CLAIMED$/, to: "all goals claimed" },
  { re: /^STREAK (\d+)D(?: — .*)?$/, to: "streak $1d" },
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
  const { data, loading } = useApi<{ tip: string | null }>("/api/oracle/tip?tab=status")
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

/** STATUS tab — the hunter dashboard. */
export function StatusTab({ hunter }: { hunter: HunterDTO }) {
  const { setTab } = useSystem()
  const { data: quests, loading: questsLoading } = useApi<QuestsRes>("/api/quests")
  const { data: sessions, loading: sessionsLoading } = useApi<SessionsRes>("/api/sessions")

  const dailies = quests?.dailies ?? []
  const doneCount = dailies.filter((d) => d.completed).length
  const cleared = (sessions?.history ?? []).filter((s) => s.status === "cleared").slice(0, 4)

  // R45 · Phase D — the command deck's "day banked" signal: any session
  // (of any status) already opened today. Same day-string comparison the
  // session log uses (startedAt's date prefix vs the local dayKey).
  const trainedToday = (sessions?.history ?? []).some((s) => s.startedAt.slice(0, 10) === dayKey())

  // R33-b — cold-start telemetry: sessions loaded and history EMPTY means a
  // brand-new hunter (never started a session). The rings slot gets the
  // designed empty state instead of three rings pinned at 0% — water still
  // lives in FUEL, and the hint says so. A hunter with ANY session history
  // (KAEL) always renders the live rings panel.
  const sessionsLoaded = !sessionsLoading && !!sessions
  const noSessionsEver = sessionsLoaded && sessions.history.length === 0

  return (
    <FlowGroup className="space-y-7 sm:space-y-8">
      {/* R55-d — the shared OracleTip mount swaps for the local compressed
          QuietOracleLine (full sentence in title + aria-label) */}
      <QuietOracleLine />

      {/* R45 · Phase D — LAYER A: THE COMMAND DECK. The tab's opening
          moment: time-aware editorial greeting, the five-readout telemetry
          strip, and the single truthful verdict pill (priority: live session
          → goals ready to claim → day banked → begin today's session). The
          R42 heading and the scattered raid/forge CTAs are absorbed here. */}
      <CommandDeck
        hunter={hunter}
        dailies={dailies}
        active={sessions?.active ?? null}
        trainedToday={trainedToday}
      />

      {/* R52 declutter — the numbered SysSection rows stand down on this tab:
          every panel carries its own label, so the landing view loses the
          double-heading prose (the SysSection component lives on elsewhere). */}

      {/* the hunter's identity */}
      <FlowItem>
        <HunterCard hunter={hunter} />
      </FlowItem>

      {/* the day's momentum: rings, vitals, rolling digest */}
      <FlowItem>
        {noSessionsEver ? (
          <EmptySurface
            label="Activity rings"
            line="Today's rings will light up here"
            hint="Move, burn and hydration — log water in Fuel, earn the first ring in the Gates"
            ctaLabel="Start your first workout"
            onCta={() => setTab("gates")}
          />
        ) : (
          <ActivityRingsPanel hunter={hunter} />
        )}
      </FlowItem>

      <FlowItem>
        <VitalsSnapshot />
      </FlowItem>

      {/* 30-day rolling digest vs the prior 30 days (scroll-revealed) */}
      <MonthlyDigest hunter={hunter} />

      {/* data utilities — R52 declutter: two big captioned plates merge into
          ONE slim row of quiet pills (dialogs unchanged behind them) */}
      <FlowGroup className="flex gap-2">
        <FlowReveal className="flex min-w-0 flex-1">
          <ShareCardButton hunter={hunter} />
        </FlowReveal>
        <FlowReveal className="flex min-w-0 flex-1">
          <DataVaultButton />
        </FlowReveal>
      </FlowGroup>

      {/* the path ahead: briefing, manual, goals */}
      <FlowReveal>
        <DailyBriefing />
      </FlowReveal>

      {/* R29-b — field manual: the daily-briefing's evidence base, rotating
       *  consensus rows from the science module (R52: collapsed by default) */}
      <FlowReveal>
        <FieldManualPanel />
      </FlowReveal>

      <FlowGroup className="grid grid-cols-1 gap-6 sm:gap-7 lg:grid-cols-2">
        <FlowGroup className="space-y-6 sm:space-y-7">
          <FlowReveal>
            <StatGrid hunter={hunter} />
          </FlowReveal>
          <FlowReveal>
            <AscensionCard hunter={hunter} />
          </FlowReveal>
        </FlowGroup>

        <FlowGroup className="space-y-6 sm:space-y-7">
          {/* daily directives summary */}
          <FlowReveal>
            {questsLoading && !quests ? (
              <SkeletonPanel label="Gathering today's goals" rows={2} />
            ) : (
              <SystemPanel
                label="Today's Goals"
                  labelAccent={
                    <span
                      className="flex items-center gap-2 text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400"
                      /* R55-d — the "complete" word rides the title */
                      title={`${doneCount} of ${dailies.length} complete`}
                    >
                      {/* R52 declutter — the goals term's meaning rides the hint */}
                      <InfoHint term="goals" />
                      {doneCount}/{dailies.length}
                    </span>
                  }
                >
                  <div className="space-y-3 p-4 sm:p-5">
                    {dailies.length === 0 && (
                      <p className="py-2 text-center text-xs font-medium tracking-wide text-zinc-400">
                        Waiting for today's goals…
                      </p>
                    )}
                    {dailies.map((q) => (
                      <div key={q.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className={cn("truncate text-xs font-medium", q.claimed ? "text-zinc-400 line-through" : "text-zinc-300")}>
                            {q.title}
                          </p>
                          <span className={cn("shrink-0 text-[10px] font-semibold tabular-nums tracking-wider", q.completed ? "text-amber-300" : "text-zinc-400")}>
                            {q.completed ? (q.claimed ? "Claimed" : "Ready") : `${Math.min(q.progress, q.target)}/${q.target}`}
                          </span>
                        </div>
                        {/* R42 studio — quest meters join the aurora family: a
                            luminous 3px hairline (ends dissolved) whose fill is
                            poured by MeterFlow; completed quests gild amber.
                            Inline `transition: none` keeps framer the sole
                            width driver (the class's CSS width-transition
                            would low-pass its per-frame writes). */}
                        <div
                          className="aurora-track mt-2"
                          role="progressbar"
                          aria-valuenow={Math.min(q.progress, q.target)}
                          aria-valuemin={0}
                          aria-valuemax={q.target}
                          aria-label={`${q.title}: ${Math.min(q.progress, q.target)} of ${q.target}`}
                        >
                          <MeterFlow
                            pct={Math.min(100, (q.progress / q.target) * 100)}
                            className={cn("aurora-fill", q.completed && "aurora-fill-amber")}
                            style={{ transition: "none" }}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setTab("directives")}
                      className="pill-action mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/5 px-4 text-[10px] font-bold tracking-[0.12em] text-violet-300 transition-colors hover:bg-violet-500/15 hover:text-violet-200 focus-visible:outline focus-visible:outline-violet-400/70"
                    >
                      Open your goals <ChevronRight className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
              </SystemPanel>
            )}
          </FlowReveal>

          {/* weekly rest decree — streak shield */}
          <FlowReveal>
            <RestDayCard hunter={hunter} />
          </FlowReveal>

          {/* recent raids */}
          <FlowReveal>
            {sessionsLoading && !sessions ? (
              <SkeletonPanel label="Gathering your sessions" rows={2} />
            ) : (
              <SystemPanel label="Session Log">
                  <div className="p-2">
                    {cleared.length === 0 && (
                      <div className="p-2">
                        <EmptySurface
                          label="Session log"
                          line="Your cleared sessions will land here"
                          hint="Every finished workout earns XP — start one in the Gates"
                          ctaLabel="Start a workout"
                          onCta={() => setTab("gates")}
                          glyph
                        />
                      </div>
                    )}
                    {cleared.map((s) => (
                      <div key={s.id} className="grove-lift flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-violet-500/5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-700/60 bg-zinc-950/60">
                          <TrendingUp className="h-4 w-4 text-violet-400" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-zinc-300">{s.gateName}</p>
                          {/* R52 declutter — date · duration only; the exercise
                              count folds into the title (still reachable) */}
                          <p
                            className="mt-0.5 flex items-center gap-2 text-[10px] tabular-nums text-zinc-400"
                            title={`${s.logs.length} exercises`}
                          >
                            <Timer className="h-3 w-3" aria-hidden />
                            {formatDayLabel(s.startedAt.slice(0, 10))} · {s.durationMin}m
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold tabular-nums text-violet-300">+{s.xpEarned}</span>
                      </div>
                    ))}
                  </div>
              </SystemPanel>
            )}
          </FlowReveal>
        </FlowGroup>
      </FlowGroup>

      {/* R45 · Phase D — LAYER C: THE DESTINATION INDEX. The command
          center's depth layer: every surface of the app as one KOTA-style
          editorial row, with live badges wherever this tab already holds
          the data. Absorbs the raid/forge CTA navigation duties. */}
      <FlowReveal>
        <DestinationIndex doneCount={doneCount} totalCount={dailies.length} essence={hunter.essence} />
      </FlowReveal>
    </FlowGroup>
  )
}
