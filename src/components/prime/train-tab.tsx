"use client"

/**
 * R57 · CLEAN SLATE — TRAIN, the workout facade.
 *
 * The Duolingo register: what today's workout is (from the real program),
 * ONE green "Start workout" action, the week as seven little day dots, the
 * last three sessions, and the top personal records. Honest numbers only —
 * null renders "—", loading renders "…", nothing is ever fabricated.
 *
 * The REAL console: "Start workout" POSTs the exact /api/sessions payload
 * the legacy Gates console sends ({ gateId, programDay? } — the gate picked
 * by gates-tab's own dominant-block-type rule for plan days), then mounts
 * the SAME <SessionRaid> component with equivalent props (hunter / session /
 * onUpdated / onClosed). SessionRaid owns raidLive itself (mount → true,
 * unmount → false), so the Oracle FAB stands down and the finish/abandon
 * flow works exactly as on the legacy tab. While the console is up it
 * replaces this facade (gates-tab's own early-return shape) inside a
 * .legacy-surface adapter so the dark-era console reads clean on white.
 * When a session is already active the action reads "Resume session".
 *
 * The full 56-round training console (raid map, program forge, rifts, boss,
 * mastery) rides below, mounted untouched behind ShowEverything.
 *
 * R58 · FLOW — motion pass, zero new visible characters: the hero numerals
 * count up, the week's filled checks pop, and the recent-session / record
 * rows flow in and out (AnimatePresence) as real data lands after actions.
 *
 * R70-b · DELOAD BANNER — the R60-loop carried item lands: the deload
 * verdict rides above "This week". One model, two surfaces (the R69-b
 * doctrine): the SAME client-side derivation the records-tab console runs
 * (deloadView over GET /api/load's LoadView DTO, anchored on the hunter-tz
 * day key — never a bare dayKey()), skinned in the facade's own light
 * register (red = the call, amber = early warning, teal = in the lane,
 * neutral = forming). Nothing new is measured; the citations + footer ride
 * hover (the R53-a declutter discipline). Fresh hunters see nothing —
 * NO HISTORY / fetch error render null by design.
 */

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Activity,
  CalendarDays,
  Check,
  ChevronDown,
  Dumbbell,
  Gauge,
  Hourglass,
  Play,
  Sparkles,
  TrendingDown,
  Trophy,
  type LucideIcon,
} from "lucide-react"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { GATES, gateById, type GateDef } from "@/lib/gates"
import { dayKeyIn, formatDayLabel, weekStartKeyIn } from "@/lib/game"
import {
  deloadView,
  DELOAD_CITATIONS,
  DELOAD_FOOTER,
  type DeloadStatus,
  type DeloadView,
} from "@/lib/deload"
import type { LoadView } from "@/lib/load"
import { dominantType, type PlanBlock, type ProgramPlan } from "@/lib/exercises"
import type { ReadinessRes } from "@/lib/health"
import type { HunterDTO, PersonalBestDTO, SessionDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FLOW_EASE } from "@/components/system/motion"
import { InfoHint } from "@/components/system/info-hint"
import { SessionRaid } from "@/components/fitness/session-raid"
import {
  BigButton,
  Card,
  Chip,
  EmptyNote,
  Flourish,
  Reveal,
  SectionLabel,
  ShowEverything,
  Skeleton,
  StatTile,
  fmt,
  type Tone,
} from "./kit"

const GatesTab = dynamic(
  () => import("@/components/fitness/gates-tab").then((m) => m.GatesTab),
  { ssr: false },
)

/** R71-b — the training-studio console (ranked exercise picker + session
 *  builder + library + tools), mounted one tap away like GatesTab. Client
 *  only: the studio keeps its own localStorage-backed fitness store. */
const TrainingStudio = dynamic(
  () => import("@/components/fitness/TrainingView").then((m) => m.TrainingView),
  { ssr: false },
)

// ── local contract types (subsets of the real routes) ────────────────────────

/** GET /api/sessions — programDay rides every row (additive R1-c echo). */
type RaidSession = SessionDTO & { programDay?: number | null }
type SessionsRes = { active: RaidSession | null; history: RaidSession[] }

/** GET /api/program — the active plan (null when none is forged). */
type ProgramRes = { program: { name: string; days: number; plan: ProgramPlan } | null }

/** GET /api/prs — all records, the route's own updatedAt-desc order. */
type PrsRes = { records: PersonalBestDTO[] }

// ── pure helpers ─────────────────────────────────────────────────────────────

const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const

/** Monday-based weekday index (0 = Monday … 6 = Sunday) of a YYYY-MM-DD key. */
function weekdayIdx(dayKey: string): number {
  return (new Date(`${dayKey}T00:00:00`).getDay() + 6) % 7
}

/* ── R71-b — the training-studio expander ────────────────────────────────────
 *
 * Same quiet-expander contract as kit's ShowEverything (closed by default,
 * content unmounts while closed, identical button chrome, ≥44px target), but
 * the content panel is the studio's OWN dark zinc register instead of the
 * .legacy-surface light remap: TrainingView's chrome is raw zinc Tailwind
 * (bg-zinc-900/40 cards, zinc-800 borders), so the light remap would leave
 * translucent mid-gray cards under dark-remapped text — the round's contrast
 * rule is "TrainingView's zinc/dark-emerald register governs", and the dark
 * panel keeps that contract byte-for-byte. The ranked picker sheet portals
 * to the document root and carries the same dark register wherever it opens.
 *
 * Honest scope note: the studio's session drafts are in-memory (React state)
 * and its "Save session" writes the studio's own localStorage fitness store
 * — it is a scratchpad/planning surface, NOT the DB-backed logging path. The
 * guided raid console above stays the real hunter-DB surface; nothing here
 * touches /api/sessions. */
function StudioExpander() {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#e5e5e5] bg-white",
          "text-sm font-extrabold text-[#777] transition-colors hover:bg-[#f7f7f4]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
        )}
      >
        Show full training studio
        <ChevronDown
          className={cn("h-5 w-5 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="studio"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl bg-zinc-950 p-3 md:p-4">
              <TrainingStudio />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** gates-tab's own day-start rule, verbatim: the first gate whose exercise
 *  list covers the day's dominant block type, else the first gate. */
function gateForDay(blocks: PlanBlock[]): GateDef {
  return GATES.find((g) => g.exercises.some((e) => e.type === dominantType(blocks))) ?? GATES[0]
}

/** Free sessions start in the Full Body program — it mixes weighted,
 *  bodyweight and cardio work, the honest reading of a plain "workout". */
const FREE_GATE: GateDef = gateById("colossus-gate") ?? GATES[0]

/** This week's seven day dots — green with a check for days with a cleared
 *  session, light gray otherwise; today carries a soft ring. */
function WeekStrip({ done, today }: { done: boolean[]; today: number }) {
  const count = done.filter(Boolean).length
  return (
    <Card
      className="flex items-start justify-between gap-1 p-4 transition-transform hover:-translate-y-0.5"
      role="img"
      aria-label={`This week — ${count} of 7 days with a workout`}
    >
      {WEEK_LETTERS.map((letter, i) => {
        const filled = done[i]
        const isToday = i === today
        return (
          <div key={`${letter}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full",
                // R68 — inactive dot #e5e5e5 → #ecebe5 + a hairline border:
                // VLM "ghost-like, nearly invisible" verdict — the empty days
                // now read as printed slots, not missing UI.
                filled ? "bg-[#58cc02]" : "border border-[#dcdcd6] bg-[#ecebe5]",
                isToday && "ring-2 ring-[#9fe25e] ring-offset-2",
              )}
              aria-hidden
            >
              {filled && <Check className="prime-pop h-4 w-4 text-white" />}
            </span>
            <span
              className={cn(
                "text-[11px] font-extrabold",
                // R68 — #afafaf → #8a8a8a: week letters must survive sunlight
                isToday ? "text-[#3c3c3c]" : "text-[#8a8a8a]",
              )}
            >
              {letter}
            </span>
          </div>
        )
      })}
    </Card>
  )
}

// ── the deload banner (R70-b — the advisor's call, surfaced on TRAIN) ──────

/** Status → banner skin: the verdict register the app runs everywhere
 * (records-tab's strain/ACWR hues + the deload-advisor console — red = the
 * call, amber = early warning, teal = in the lane, neutral = forming),
 * translated to this facade's light palette. DELOAD NOW borrows the danger
 * button red, WATCH the rest-day card's amber, CRUISE the stat-tile teal. */
const DELOAD_BANNER_SKIN: Record<
  DeloadStatus,
  { card: string; iconTile: string; iconCls: string; headline: string; icon: LucideIcon; chip: Tone }
> = {
  "DELOAD NOW": {
    card: "border-[#ffd2d2] bg-[#ffecec]",
    iconTile: "bg-[#ff4b4b]",
    iconCls: "text-white",
    headline: "text-[#c63636]",
    icon: TrendingDown,
    chip: "red",
  },
  WATCH: {
    card: "border-[#f2d9ab] bg-[#fff6e9]",
    iconTile: "bg-[#ff9600]",
    iconCls: "text-white",
    headline: "text-[#b26a00]",
    icon: Gauge,
    chip: "orange",
  },
  CRUISE: {
    card: "border-[#c9ece7] bg-[#e6f7f4]",
    iconTile: "bg-[#0faf9a]",
    iconCls: "text-white",
    headline: "text-[#0d7d74]",
    icon: Activity,
    chip: "teal",
  },
  "BUILDING PICTURE": {
    card: "border-[#e5e5e5] bg-[#f7f7f4]",
    iconTile: "border border-[#dcdcd6] bg-[#ecebe5]",
    iconCls: "text-[#5c5c5c]",
    headline: "text-[#3c3c3c]",
    icon: Hourglass,
    chip: "ink",
  },
  // never rendered (NO HISTORY → null by design); kept for the total map
  "NO HISTORY": {
    card: "border-[#e5e5e5] bg-white",
    iconTile: "bg-[#ecebe5]",
    iconCls: "text-[#5c5c5c]",
    headline: "text-[#3c3c3c]",
    icon: Hourglass,
    chip: "ink",
  },
}

/** The deload verdict banner — status chip + the lib's own headline/sub +
 * evidence drivers + the prescribed cut when one exists. Sources ride the
 * card's title attribute + the deload InfoHint (house declutter register). */
function DeloadBanner({ view }: { view: DeloadView }) {
  const skin = DELOAD_BANNER_SKIN[view.status]
  const Icon = skin.icon
  return (
    <Card
      className={cn("p-4", skin.card)}
      aria-label="Deload advisory"
      title={[...DELOAD_CITATIONS, DELOAD_FOOTER].join("\n\n")}
    >
      <div className="flex items-center gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", skin.iconTile)} aria-hidden>
          <Icon className={cn("h-5 w-5", skin.iconCls)} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn("text-base font-extrabold", skin.headline)}>{view.headline}</h2>
          <p className="text-xs font-semibold text-[#777]">{view.sub}</p>
        </div>
        <Chip tone={skin.chip} className="shrink-0 bg-white/80">
          {view.status}
        </Chip>
      </div>
      <ul className="mt-3 space-y-1">
        {view.drivers.map((d) => (
          <li key={d} className="flex items-start gap-1.5 text-[11px] font-semibold text-[#757575]">
            <span className="mt-px shrink-0" aria-hidden>
              ▸
            </span>
            <span className="min-w-0">{d}</span>
          </li>
        ))}
      </ul>
      {view.cutPct !== null && (
        <p className={cn("mt-3 text-sm font-extrabold", skin.headline)}>
          Cut volume {view.cutPct}% next week
        </p>
      )}
      <p
        className="mt-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#757575]"
        title={DELOAD_FOOTER}
      >
        Deload advisor
        <InfoHint term="deload" />
      </p>
    </Card>
  )
}

// ── the facade ───────────────────────────────────────────────────────────────

export function TrainTab({ hunter }: { hunter: HunterDTO }) {
  const pushNotice = useSystem((s) => s.pushNotice)
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  // R58 — guards every framer-motion usage this file adds directly
  const reduce = useReducedMotion()

  const sessions = useApi<SessionsRes>("/api/sessions")
  const program = useApi<ProgramRes>("/api/program")
  const readiness = useApi<ReadinessRes>("/api/readiness")
  const prs = useApi<PrsRes>("/api/prs")
  // R70-b — the load console's DTO, for the deload verdict banner
  const load = useApi<LoadView>("/api/load")

  // ── the real-console bridge ──
  // `live` holds the session a Start just created (the POST response) until
  // the refetch lands; `resumeOpen` is the Resume tap. Either one wants the
  // console mounted, and the freshest session object (active, post-reload)
  // always wins over the bridge copy. onClosed clears the intent flags BEFORE
  // the refetch lands, so a finished session can never remount its console.
  const [live, setLive] = useState<RaidSession | null>(null)
  const [resumeOpen, setResumeOpen] = useState(false)
  const [starting, setStarting] = useState(false)

  const active = sessions.data?.active ?? null
  const history = sessions.data?.history ?? []
  const tz = hunter.timezone

  // ── today's plan (readiness owns the next-day rule, single source) ──
  const prg = program.data?.program ?? null
  const next = readiness.data?.nextDay ?? null
  const planDay =
    prg && next?.day != null ? (prg.plan.days.find((d) => d.day === next.day) ?? null) : null
  const restWeek = next?.allDone === true

  const heroLoading =
    (readiness.loading && !readiness.data) || (program.loading && !program.data)
  const noPlan = program.data != null && prg === null

  const blocks = planDay?.blocks ?? []
  const focus = planDay?.focus || "Training"
  const totalSets = blocks.reduce((sum, b) => sum + b.sets, 0)
  const estVolumeKg = blocks.reduce((sum, b) => sum + b.sets * (b.reps ?? 0) * (b.weightKg ?? 0), 0)
  const cardioMin = blocks.reduce((sum, b) => sum + b.sets * (b.durationMin ?? 0), 0)
  const startGate = planDay ? gateForDay(planDay.blocks) : FREE_GATE

  // ── this week's dots (cleared sessions, hunter-timezone days) ──
  const weekStart = weekStartKeyIn(tz)
  const todayIdx = weekdayIdx(dayKeyIn(tz))
  const doneDays = new Set(
    history
      .filter((s) => s.status === "cleared")
      .map((s) => dayKeyIn(tz, new Date(s.startedAt)))
      .filter((k) => k >= weekStart)
      .map((k) => weekdayIdx(k)),
  )
  const weekDone = WEEK_LETTERS.map((_, i) => doneDays.has(i))

  const recent = history.slice(0, 3)
  const records = prs.data?.records ?? []
  const topRecords = records.slice(0, 3)

  // ── deload verdict (R70-b) — the records-tab console's own client-side
  // derivation, verbatim doctrine: deloadView over the LoadView DTO, anchored
  // on the hunter-tz TODAY key (dayKeyIn(tz) — never a bare dayKey()). Memoized
  // on the DTO identity, exactly like DeloadAdvisor. ──
  const deload = useMemo(
    () =>
      load.data
        ? deloadView(load.data.days, dayKeyIn(tz, new Date()), load.data.acwr, load.data.acwrVerdict)
        : null,
    [load.data, tz],
  )

  // ── actions ──

  const closeConsole = () => {
    setLive(null)
    setResumeOpen(false)
    sessions.reload()
  }

  /** The exact enter a legacy gate card performs: POST /api/sessions with
   *  { gateId } (free) or { gateId, programDay } (plan day), then reload. */
  const startWorkout = async () => {
    if (starting || active) return
    setStarting(true)
    try {
      const res = await api<{ session: RaidSession }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify(
          planDay
            ? { gateId: startGate.id, programDay: planDay.day }
            : { gateId: FREE_GATE.id },
        ),
      })
      setLive(res.session)
      pushNotice({
        kind: "info",
        title: planDay ? `Day ${planDay.day} started` : "Session started",
        body: "Log your exercises, then finish to earn XP.",
      })
      sessions.reload()
      bumpRefresh()
    } catch (e) {
      // 409 (already in progress) lands here too — the reload below flips
      // the action to "Resume session" so the tap still gets you there.
      pushNotice({ kind: "warn", title: "Couldn't start", body: (e as Error).message })
      sessions.reload()
    } finally {
      setStarting(false)
    }
  }

  // ── the real console, mounted exactly as gates-tab mounts it ──
  const consoleWanted = live !== null || resumeOpen
  const raidSession = consoleWanted ? (active ?? live) : null
  if (raidSession) {
    return (
      <div className="legacy-surface p-3 md:p-4">
        <SessionRaid
          hunter={hunter}
          session={raidSession}
          onUpdated={sessions.reload}
          onClosed={closeConsole}
        />
      </div>
    )
  }

  // ── header + hero copy (mirrors the hero card honestly) ──
  const headerLine = heroLoading
    ? "…"
    : planDay
      ? `${focus} day — ${blocks.length} exercises`
      : restWeek
        ? "Rest day — recovery counts."
        : noPlan
          ? "No plan yet — free sessions count."
          : "Next workout — start below."

  const heroFold =
    planDay
      ? `Day ${planDay.day} · ${focus} — ${blocks.length} exercises · ${totalSets} sets · ` +
        (estVolumeKg > 0 ? `≈${fmt(estVolumeKg)} kg weighted volume` : "no weighted lifts") +
        (cardioMin > 0 ? ` · ${cardioMin} min cardio` : "") +
        (prg ? ` · ${prg.name.toLowerCase()} (${prg.days}-day plan)` : "") +
        ` · starts a ${startGate.name} session`
      : readiness.error ?? program.error ?? undefined

  const booting =
    (sessions.loading && !sessions.data) ||
    (readiness.loading && !readiness.data) ||
    (program.loading && !program.data)

  return (
    <div className="prime-rise space-y-4">
      {/* hero — what today asks of you */}
      <section aria-label="Today's workout">
        <h1 className="text-2xl font-black tracking-tight text-[#46a302] md:text-3xl">
          Today's workout
        </h1>
        <Flourish />
        <p className="mt-2 text-sm font-semibold text-[#777]">{headerLine}</p>
      </section>

      {/* the next workout card */}
      {heroLoading ? (
        <Card className="p-4" aria-label="Next workout">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </Card>
      ) : planDay ? (
        <Card
          className="p-4 transition-transform hover:-translate-y-0.5"
          aria-label="Next workout"
          title={heroFold}
        >
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e8f8d8]" aria-hidden>
              <Dumbbell className="h-5 w-5 text-[#58cc02]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold text-[#3c3c3c]">
                Day {planDay.day} · {focus}
              </h2>
              <p className="truncate text-xs font-semibold text-[#777]">
                {prg ? `${prg.name.toLowerCase()} · ${prg.days}-day plan` : `${blocks.length} exercises`}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatTile value={fmt(blocks.length)} countTo={blocks.length} label="Exercises" tone="ink" />
            <StatTile value={fmt(totalSets)} countTo={totalSets} label="Sets" tone="teal" />
            <StatTile
              value={estVolumeKg > 0 ? `≈${fmt(estVolumeKg)}` : "—"}
              label="Volume kg"
              tone="orange"
              title={
                estVolumeKg > 0
                  ? "Estimated working volume from the plan's weighted sets"
                  : "Bodyweight and cardio blocks — no weighted volume to estimate"
              }
            />
          </div>
        </Card>
      ) : restWeek ? (
        <Card className="border-[#f2d9ab] bg-[#fff6e9] p-4" aria-label="Rest day">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ff9600]" aria-hidden>
              <CalendarDays className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold text-[#3c3c3c]">Rest day</h2>
              <p className="text-xs font-semibold text-[#777]">
                Every plan day is done this week — recovery is training too.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          className="p-4 transition-transform hover:-translate-y-0.5"
          aria-label="Next workout"
          title={heroFold}
        >
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f7f7f4]" aria-hidden>
              <Sparkles className="h-5 w-5 text-[#777]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold text-[#3c3c3c]">
                {noPlan ? "No training plan yet" : "Next workout"}
              </h2>
              <p className="text-xs font-semibold text-[#777]">
                {noPlan
                  ? "A free session still counts — build a program in the full library below."
                  : "Pick any training type in the full library below."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* the one green action — starts or resumes the REAL console */}
      <section aria-label="Start or resume a workout">
        <BigButton
          full
          size="lg"
          loading={starting}
          disabled={booting}
          onClick={() => {
            if (active) setResumeOpen(true)
            else void startWorkout()
          }}
        >
          <Play className="h-5 w-5" aria-hidden />
          {active ? "Resume session" : "Start workout"}
        </BigButton>
      </section>

      {/* deload verdict — the advisor's call above the week strip (R70-b).
          Graceful by design: loading → a compact skeleton, fetch error or
          NO HISTORY → nothing (a fresh hunter's TRAIN stays clean),
          BUILDING PICTURE → the subtle neutral skin. */}
      <section aria-label="Deload advisory">
        {load.loading && !load.data ? (
          <Card className="p-4" aria-label="Deload advisory loading">
            <Skeleton className="h-9 w-2/3" />
          </Card>
        ) : deload && deload.status !== "NO HISTORY" ? (
          <DeloadBanner view={deload} />
        ) : null}
      </section>

      {/* this week — seven little day dots */}
      <section aria-label="This week">
        <SectionLabel>This week</SectionLabel>
        {sessions.data ? (
          <WeekStrip done={weekDone} today={todayIdx} />
        ) : (
          <Card className="p-4">
            <Skeleton className="h-12 w-full" />
          </Card>
        )}
      </section>

      {/* recent workouts — the last three sessions */}
      <Reveal>
        <section aria-label="Recent workouts">
          <SectionLabel>Recent workouts</SectionLabel>
          <Card className="p-1.5">
          {sessions.loading && !sessions.data ? (
            <div className="space-y-3 p-3">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : sessions.error ? (
            <div className="p-3" title={sessions.error}>
              <EmptyNote>Couldn't load sessions right now.</EmptyNote>
            </div>
          ) : recent.length === 0 ? (
            <div className="p-3">
              <EmptyNote>No workouts yet — start one above.</EmptyNote>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {recent.map((s) => {
                const day = formatDayLabel(dayKeyIn(tz, new Date(s.startedAt)))
                const cleared = s.status === "cleared"
                return (
                  <motion.div
                    key={s.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, x: 56, scale: 0.96 }}
                    transition={{
                      layout: { type: "spring", stiffness: 360, damping: 30 },
                      duration: 0.28,
                      ease: FLOW_EASE,
                    }}
                    className="flex items-center gap-3 border-b-2 border-[#f2f2ee] px-4 py-3 last:border-b-0"
                    title={
                      cleared
                        ? `${s.gateName} · ${day} — ${fmt(s.xpEarned)} XP · ${s.durationMin} min · ${fmt(s.volumeKg)} kg` +
                          (s.programDay != null ? ` · plan day ${s.programDay}` : "")
                        : `${s.gateName} · ${day} — abandoned, no XP earned`
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-[#3c3c3c]">{s.gateName}</p>
                      {/* R68 — #afafaf → #777: session day subs ride white cards */}
                      <p className="text-xs font-semibold text-[#777]">
                        {day}
                        {s.programDay != null && ` · Day ${s.programDay}`}
                        {!cleared && " · abandoned"}
                      </p>
                    </div>
                    {cleared && s.xpEarned > 0 ? (
                      <Chip tone="green" className="shrink-0">
                        +{fmt(s.xpEarned)} XP
                      </Chip>
                    ) : (
                      <Chip tone="ink" className="shrink-0">
                        —
                      </Chip>
                    )}
                    <p className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-[#777]">
                      {s.durationMin > 0 ? `${s.durationMin} min` : "—"}
                    </p>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </Card>
        </section>
      </Reveal>

      {/* personal records — the top three, gold */}
      <Reveal>
        <section aria-label="Personal records">
          <SectionLabel
            right={
              records.length > 3 ? (
                <Chip tone="gold">+{records.length - 3} more</Chip>
              ) : undefined
            }
          >
            Personal records
          </SectionLabel>
          <Card className="p-1.5">
          {prs.loading && !prs.data ? (
            <div className="space-y-3 p-3">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : prs.error ? (
            <div className="p-3" title={prs.error}>
              <EmptyNote>Couldn't load records right now.</EmptyNote>
            </div>
          ) : topRecords.length === 0 ? (
            <div className="p-3">
              <EmptyNote>No records yet — finish a session to set your first.</EmptyNote>
            </div>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {topRecords.map((r) => {
                  const ctx = r.context
                  return (
                    <motion.li
                      key={r.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, x: 56, scale: 0.96 }}
                      transition={{
                        layout: { type: "spring", stiffness: 360, damping: 30 },
                        duration: 0.28,
                        ease: FLOW_EASE,
                      }}
                      className="flex items-center gap-3 border-b-2 border-[#f2f2ee] px-4 py-3 last:border-b-0"
                      title={
                        `${r.displayName} — best ${fmt(r.bestValue)} ${r.unit}` +
                        (ctx
                          ? ` · ${ctx.sets}×${ctx.reps}${ctx.weightKg > 0 ? ` @ ${fmt(ctx.weightKg)} kg` : ""}` +
                            (ctx.durationMin > 0 ? ` · ${ctx.durationMin} min` : "")
                          : "") +
                        ` · set ${formatDayLabel(dayKeyIn(tz, new Date(r.achievedAt)))}`
                      }
                    >
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff4cc]"
                        aria-hidden
                      >
                        <Trophy className="h-5 w-5 text-[#c98f00]" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-[#3c3c3c]">
                        {r.displayName}
                      </span>
                      <span className="shrink-0 text-sm font-extrabold tabular-nums text-[#c98f00]">
                        {fmt(r.bestValue)} {r.unit}
                      </span>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}
        </Card>
        </section>
      </Reveal>

      {/* the full 56-round training console, one tap away — lore untouched */}
      <Reveal>
        <ShowEverything label="Show full training library">
          <GatesTab hunter={hunter} />
        </ShowEverything>
      </Reveal>

      {/* R71-b — the training studio (ranked exercise picker + session-builder
          scratchpad), one tap away in its own dark register */}
      <Reveal>
        <StudioExpander />
      </Reveal>
    </div>
  )
}
