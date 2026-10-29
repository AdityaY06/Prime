"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowDownRight, ArrowUpRight, CalendarDays, Check, ChevronDown, Minus, Plus, Radar as RadarIcon, Sparkle, Sparkles, TrendingUp } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { FlowGroup, flowItemVariants, FLOW_EASE, tapMotion, MeterFlow, PopIn } from "@/components/system/motion"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { InfoHint } from "@/components/system/info-hint"
import { DivinationDialog } from "./divination-dialog"
import { useApi } from "@/hooks/use-api"
import { dayKey, formatDayLabel } from "@/lib/game"
import { GATES, GATE_SHORT } from "@/lib/gates"
import type { ChronicleDTO, ChronicleDaySession } from "@/lib/types"
import { cn } from "@/lib/utils"

/** "MON 23"-style label for the day-by-day grid (weekday + day number). */
function weekdayDayNum(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  const wd = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
  return `${wd} ${d}`
}

/** Single-letter weekday axis mark ("M", "T", "W"…). */
function weekdayLetter(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" }).charAt(0)
}

/** Delta between two window values → sign, percent and display string. */
function delta(cur: number, prev: number): { dir: "up" | "down" | "flat"; pct: number | null; label: string } {
  if (prev === 0 && cur === 0) return { dir: "flat", pct: null, label: "—" }
  if (prev === 0 && cur > 0) return { dir: "up", pct: null, label: "NEW" }
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct === 0) return { dir: "flat", pct: 0, label: "±0%" }
  return pct > 0
    ? { dir: "up", pct, label: `+${pct}%` }
    : { dir: "down", pct, label: `${pct}%` }
}

/** Count a tile value from last cycle's number to this cycle's (reward-overlay convention). */
function useCountUp(from: number, to: number, duration: number, disabled: boolean): number {
  const [val, setVal] = useState(disabled ? to : from)
  useEffect(() => {
    if (disabled) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [from, to, duration, disabled])
  return val
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { sessions: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="sys-panel rounded-sm border-violet-500/30 px-3 py-2">
      <p className="sys-label text-[9px] text-zinc-400">{label ? formatDayLabel(label) : ""}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-violet-300">+{p.value} XP</p>
      <p className="font-mono text-[9px] tracking-widest text-zinc-400">{p.payload?.sessions ?? 0} SESSION{(p.payload?.sessions ?? 0) === 1 ? "" : "S"}</p>
    </div>
  )
}

type MetricKey = "xp" | "sessions" | "volumeKg" | "minutes"

function CycleTile({
  icon: Icon,
  label,
  hint,
  cur,
  prev,
  format,
  accent,
  index,
  reduce,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** R55-a — the folded full label ("XP earned this cycle") rides the tile's title. */
  hint: string
  cur: number
  prev: number
  format: (n: number) => string
  accent: string
  index: number
  reduce: boolean
}) {
  const d = delta(cur, prev)
  // R53-a — empty placeholder: when neither cycle carries a value the "—"
  // delta glyph stands down (plain 0 tiles); last-cycle figures ride titles.
  const showDelta = !(cur === 0 && prev === 0)
  const shown = useCountUp(prev, cur, 800, reduce)
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.07 * index, ease: FLOW_EASE }}
      title={hint}
      className="chronicle-tile group relative overflow-hidden rounded-sm border border-zinc-700/50 bg-zinc-950/40 px-3 py-3 transition-all hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-[0_0_16px_rgba(139,92,246,0.1)]"
    >
      {/* direction-tinted left edge — the tile's tell on where the cycle is heading */}
      <span
        className="chronicle-edge"
        style={
          {
            "--chronicle-edge":
              d.dir === "up" ? "rgba(52,211,153,0.8)" : d.dir === "down" ? "rgba(251,113,133,0.8)" : "rgba(113,113,122,0.55)",
          } as React.CSSProperties
        }
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <Icon className={cn("h-4 w-4", accent)} aria-hidden />
        {showDelta && (
          <span
            className={cn(
              "flex items-center gap-0.5 font-mono text-[10px] font-bold tabular-nums tracking-widest transition-colors",
              d.dir === "up" && "text-amber-400 group-hover:text-amber-300",
              d.dir === "down" && "text-rose-400 group-hover:text-rose-300",
              d.dir === "flat" && "text-zinc-400"
            )}
            title={`Last cycle: ${prev.toLocaleString()}`}
          >
            {d.dir === "up" ? (
              <ArrowUpRight className="h-3 w-3 transition-all group-hover:drop-shadow-[0_0_4px_currentColor]" aria-hidden />
            ) : d.dir === "down" ? (
              <ArrowDownRight className="h-3 w-3 transition-all group-hover:drop-shadow-[0_0_4px_currentColor]" aria-hidden />
            ) : (
              <Minus className="h-3 w-3" aria-hidden />
            )}
            {d.label}
          </span>
        )}
      </div>
      <p className="mt-1.5 font-mono text-lg font-bold tabular-nums leading-none">{format(shown)}</p>
      <p className="mt-1 sys-label text-[8px] text-zinc-400">{label}</p>
    </motion.div>
  )
}

// ─── Day-by-day compliance drill-down (R3-b) ──────────────────────────────────

/** Column widths shared by the grid header and every day row (390px-safe). */
const DAY_COL = "w-[3.9rem] shrink-0"
const XP_COL = "w-[4.3rem] shrink-0 text-right"
const RAID_COL = "w-[2.3rem] shrink-0 text-center"
const VOL_COL = "w-[3.7rem] shrink-0 text-right"
const PR_COL = "w-[2.1rem] shrink-0 text-right"

/** One cleared raid inside a day's expansion — gate chip + tactical numbers. */
function SessionRow({ session, index, reduce }: { session: ChronicleDaySession; index: number; reduce: boolean }) {
  const startLabel = new Date(session.startedAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.28, ease: FLOW_EASE, delay: index * 0.05 }}
      className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-zinc-800/60 bg-zinc-950/40 px-2 py-1.5"
      aria-label={`${session.gateName}: ${session.xpEarned} XP, ${session.volumeKg} kg volume, ${session.durationMin} minutes, ${session.prCount} personal records`}
    >
      <span className="max-w-[9.5rem] truncate rounded-sm border border-violet-400/30 bg-violet-500/10 px-1.5 py-px font-mono text-[8px] font-bold tracking-[0.14em] text-violet-200">
        {session.gateName.toUpperCase()}
      </span>
      <span className="font-mono text-[10px] font-bold tabular-nums tracking-wide text-violet-300">+{session.xpEarned.toLocaleString()} XP</span>
      <span className={cn("font-mono text-[9px] tabular-nums tracking-wider", session.volumeKg > 0 ? "text-zinc-400" : "text-zinc-400")}>
        {session.volumeKg > 0 ? session.volumeKg.toLocaleString() : "0"} KG
      </span>
      <span className="font-mono text-[9px] tabular-nums tracking-wider text-zinc-400">{session.durationMin} MIN</span>
      {session.prCount > 0 ? (
        <span className="rounded-sm border border-amber-400/40 bg-amber-500/10 px-1 py-px font-mono text-[8px] font-bold tabular-nums tracking-[0.14em] text-amber-300">
          {session.prCount} PR
        </span>
      ) : (
        <span className="font-mono text-[8px] tracking-[0.14em] text-zinc-400">0 PR</span>
      )}
      <span className="ml-auto font-mono text-[8px] tabular-nums tracking-widest text-zinc-400" title="Raid start">
        {startLabel}
      </span>
    </motion.li>
  )
}

/** One row per day of the current cycle: XP, raids, volume, PRs + gate chips.
 *  The row is a button — expanding reveals that day's cleared sessions. */
function DayRow({
  row,
  sessions,
  isToday,
  index,
  open,
  expanded,
  onToggle,
  reduce,
}: {
  row: ChronicleDTO["perDay"][number]
  sessions: ChronicleDaySession[]
  isToday: boolean
  index: number
  open: boolean
  expanded: boolean
  onToggle: () => void
  reduce: boolean
}) {
  const active = row.xp > 0 || row.sessions > 0
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
      transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: open ? index * 0.045 : 0 }}
    >
      <motion.button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`chronicle-day-${row.day}`}
        aria-label={`${weekdayDayNum(row.day)}: ${row.xp} XP, ${row.sessions} session${row.sessions === 1 ? "" : "s"}, ${row.volumeKg} kg volume, ${row.minutes} minutes, ${row.prs} personal record${row.prs === 1 ? "" : "s"}${row.gateShorts.length ? `, gates ${row.gateShorts.join(" ")}` : ""} — ${expanded ? "hide" : "show"} cleared sessions`}
        {...tapMotion}
        className={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border-l-2 px-2 py-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-violet-400/70",
          isToday
            ? "border-violet-400 bg-violet-500/10"
            : active
              ? "border-zinc-700/60 bg-zinc-950/40"
              : "border-transparent bg-zinc-950/20",
          expanded && "border-l-violet-400/70 bg-violet-500/10"
        )}
      >
        <span className={cn(DAY_COL, "flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.14em]", active ? "text-zinc-300" : "text-zinc-400")}>
          {weekdayDayNum(row.day)}
          {isToday && (
            <span className="rounded-sm border border-violet-400/50 bg-violet-500/20 px-1 py-px font-mono text-[7px] font-bold tracking-[0.18em] text-violet-200">
              TODAY
            </span>
          )}
        </span>

        <span className={cn(XP_COL, "font-mono text-[11px] font-bold tabular-nums tracking-wide", row.xp > 0 ? "text-violet-300" : "text-zinc-600")}>
          {row.xp > 0 ? `+${row.xp.toLocaleString()}` : "—"}
        </span>

        <span className={cn(RAID_COL)}>
          {row.sessions > 0 ? (
            <span className="inline-flex items-center gap-0.5 rounded-sm border border-teal-500/25 bg-teal-500/10 px-1 py-px font-mono text-[9px] font-bold tabular-nums text-teal-300">
              <Check className="h-2.5 w-2.5" aria-hidden />
              {row.sessions}
            </span>
          ) : (
            <span className="font-mono text-[9px] tabular-nums text-zinc-700">—</span>
          )}
        </span>

        <span className={cn(VOL_COL, "font-mono text-[9px] tabular-nums", row.volumeKg > 0 ? "text-zinc-400" : "text-zinc-700")}>
          {row.volumeKg > 0 ? row.volumeKg.toLocaleString() : "—"}
        </span>

        <span className={cn(PR_COL, "font-mono text-[9px] font-bold tabular-nums", row.prs > 0 ? "text-amber-300" : "text-zinc-700")}>
          {row.prs > 0 ? row.prs : "—"}
        </span>

        <span className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 sm:justify-start">
          {row.gateShorts.map((short) => (
            <span
              key={short}
              className="rounded-sm border border-zinc-700/70 bg-zinc-900/60 px-1 py-px font-mono text-[8px] font-bold tracking-[0.14em] text-zinc-400"
            >
              {short}
            </span>
          ))}
        </span>

        {/* expand indicator — rotates 90° into a close cross */}
        <span className="flex w-4 shrink-0 items-center justify-center" aria-hidden>
          <Plus
            className={cn(
              "h-3 w-3 transition-transform duration-200",
              expanded ? "rotate-90 text-violet-300" : active ? "text-zinc-500" : "text-zinc-700"
            )}
          />
        </span>
      </motion.button>

      {/* drill-through — that day's cleared raids */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={`chronicle-day-${row.day}`}
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.28, ease: FLOW_EASE }}
            className="overflow-hidden"
          >
            <div className="mt-1 pl-2 pr-1">
              {sessions.length === 0 ? (
                <p className="rounded-sm border border-zinc-800/50 bg-zinc-950/30 px-2 py-2 text-center font-mono text-[9px] tracking-[0.25em] text-zinc-400">
                  NO RAIDS — REST
                </p>
              ) : (
                <ul className="space-y-1" role="list" aria-label={`Sessions cleared ${weekdayDayNum(row.day)}`}>
                  {sessions.map((s, i) => (
                    <SessionRow key={s.id} session={s} index={i} reduce={reduce} />
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

/** This-cycle XP vs the same weekday one cycle back — 7 paired plain-div bars. */
function WeekdayCompare({ data, open, reduce }: { data: ChronicleDTO; open: boolean; reduce: boolean }) {
  const pairs = data.perDay.map((d, i) => ({
    day: d.day,
    cur: d.xp,
    prev: data.prevDaily[i]?.xp ?? 0,
  }))
  const max = Math.max(0, ...pairs.flatMap((p) => [p.cur, p.prev]))
  const TRACK = 60 // px bar track height

  if (max === 0) {
    return (
      <p className="border-t border-violet-500/10 pt-3 text-center font-mono text-[9px] tracking-[0.25em] text-zinc-400">
        NO XP THIS CYCLE OR LAST — NOTHING TO COMPARE
      </p>
    )
  }

  return (
    <div className="border-t border-violet-500/10 pt-3">
      <div className="flex items-baseline justify-between">
        <span className="sys-label text-[8px] text-zinc-400">WEEKDAY COMPARE — XP</span>
        <span className="flex items-center gap-2.5 font-mono text-[8px] tracking-[0.18em] text-zinc-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-violet-500" aria-hidden />
            THIS CYCLE
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 bg-zinc-500" aria-hidden />
            LAST
          </span>
        </span>
      </div>

      <div className="mt-2 flex items-end justify-between gap-1.5 sm:gap-2.5" role="img" aria-label={`Weekday XP compare, this cycle versus previous cycle: ${pairs.map((p) => `${weekdayDayNum(p.day)} ${p.cur} versus ${p.prev} XP`).join("; ")}`}>
        {pairs.map((p, i) => {
          const bothZero = p.cur === 0 && p.prev === 0
          const curH = p.cur > 0 ? Math.max(3, Math.round((p.cur / max) * TRACK)) : 0
          const prevH = p.prev > 0 ? Math.max(3, Math.round((p.prev / max) * TRACK)) : 0
          return (
            <div
              key={p.day}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${weekdayDayNum(p.day)} · THIS ${p.cur.toLocaleString()} XP · LAST ${p.prev.toLocaleString()} XP`}
            >
              <div className="flex h-[60px] w-full items-end justify-center gap-[3px]" aria-hidden>
                {bothZero ? (
                  <span className="font-mono text-[9px] leading-[60px] text-zinc-700">—</span>
                ) : (
                  <>
                    <motion.div
                      className="w-[5px] rounded-t-sm bg-gradient-to-t from-violet-700 to-violet-400 shadow-[0_0_5px_rgba(139,92,246,0.35)]"
                      style={{ height: `${curH}px`, transformOrigin: "bottom" }}
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: open ? 1 : 0 }}
                      transition={reduce ? { duration: 0 } : { duration: 0.5, ease: FLOW_EASE, delay: open ? i * 0.05 : 0 }}
                    />
                    <motion.div
                      className="w-[5px] rounded-t-sm bg-zinc-500/80"
                      style={{ height: `${prevH}px`, transformOrigin: "bottom" }}
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: open ? 1 : 0 }}
                      transition={reduce ? { duration: 0 } : { duration: 0.5, ease: FLOW_EASE, delay: open ? i * 0.05 + 0.05 : 0 }}
                    />
                  </>
                )}
              </div>
              <span className="font-mono text-[9px] text-zinc-400">{weekdayLetter(p.day)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Toggle + animated drill-down: 7-day compliance grid + weekday compare.
 *  R55-a — the folded body UNMOUNTS while closed (the export-center SHOW ALL
 *  idiom): framer's height:0/opacity:0 kept the clipped rows in the box tree,
 *  so the collapsed week grid still fed innerText (~280 chars of dash chrome).
 *  One tap restores the full grid byte-identical. */
function DayByDaySection({ data, reduce }: { data: ChronicleDTO; reduce: boolean }) {
  const [open, setOpen] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const today = dayKey()

  return (
    <div>
      {/* R55-a — the double label ("DAY-BY-DAY COMPLIANCE" + "DAY-BY-DAY"
          button) merged into one 44px expander row; the full name rides
          aria-label + title. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="chronicle-daybyday"
        aria-label="Day-by-day compliance"
        title="7-day compliance grid + weekday XP compare"
        className="flex h-11 w-full items-center justify-between gap-2 rounded-sm border border-zinc-700/70 bg-zinc-950/60 px-3 font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-400 transition-all hover:border-violet-400/60 hover:text-violet-300 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <span className="flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3 text-violet-400/70" aria-hidden />
          DAY-BY-DAY
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="chronicle-daybyday"
            key="chronicle-daybyday"
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3">
              {/* 7-day grid — one compliance row per day of the current cycle */}
              <div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-800/60 px-2 pb-1.5" aria-hidden>
                  <span className={cn(DAY_COL, "sys-label text-[8px] text-zinc-400")}>DAY</span>
                  <span className={cn(XP_COL, "sys-label text-[8px] text-zinc-400")}>XP</span>
                  <span className={cn(RAID_COL, "sys-label text-[8px] text-zinc-400")}>RAIDS</span>
                  <span className={cn(VOL_COL, "sys-label text-[8px] text-zinc-400")}>VOL KG</span>
                  <span className={cn(PR_COL, "sys-label text-[8px] text-zinc-400")}>PR</span>
                  <span className="min-w-0 flex-1" />
                </div>
                <ul className="mt-1 space-y-1" role="list" aria-label="Day-by-day training compliance, current cycle">
                  {data.perDay.map((row, i) => (
                    <DayRow
                      key={row.day}
                      row={row}
                      sessions={data.sessionsByDay?.[row.day] ?? []}
                      isToday={row.day === today}
                      index={i}
                      open={open}
                      expanded={expandedDay === row.day}
                      onToggle={() => setExpandedDay((d) => (d === row.day ? null : row.day))}
                      reduce={reduce}
                    />
                  ))}
                </ul>
              </div>

              <WeekdayCompare data={data} open={open} reduce={reduce} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** CHRONICLE — 7-day cycle vs previous cycle, with daily XP bars. */
export function ChroniclePanel() {
  const { data, loading, error } = useApi<ChronicleDTO>("/api/chronicle")
  const reduce = useReducedMotion()
  const [divOpen, setDivOpen] = useState(false)

  // R53-a — both cycles empty: ONE quiet line replaces the three dramatic
  // all-caps empties, the all-dash day-by-day grid and the sleeping pentagon
  // (a 7×5 field of "—" is noise, not data). Any data in either cycle
  // renders the full console, unchanged.
  const bothEmpty = !!data && data.thisWeek.sessions === 0 && data.prevWeek.sessions === 0

  const verdict = useMemo(() => {
    if (!data) return null
    const { thisWeek: cur, prevWeek: prev, activeDays } = data
    if (cur.xp === 0 && prev.xp === 0)
      // R55-a — `short` is the data read; the drama rides the rendered title
      return { tone: "flat" as const, text: "THE LEDGER HOLDS ONLY SILENCE — NO CYCLES TO COMPARE", short: "NO CYCLES TO COMPARE" }
    const d = delta(cur.xp, prev.xp)
    if (d.dir === "up")
      return {
        tone: "up" as const,
        text: `MOMENTUM RISING — OUTPACING LAST CYCLE BY ${Math.abs(d.pct ?? 100)}% ACROSS ${activeDays} ACTIVE DAY${activeDays === 1 ? "" : "S"}`,
        short: d.label === "NEW" ? "FIRST XP THIS CYCLE" : `${d.label} VS LAST CYCLE`,
      }
    if (d.dir === "down")
      return {
        tone: "down" as const,
        text: `MOMENTUM FADING — ${Math.abs(d.pct ?? 0)}% BEHIND LAST CYCLE. THE SYSTEM IS WATCHING.`,
        short: `${d.label} VS LAST CYCLE`,
      }
    return { tone: "flat" as const, text: "MOMENTUM EVEN — LAST CYCLE'S ECHO MATCHES THIS ONE EXACTLY", short: "EVEN WITH LAST CYCLE" }
  }, [data])

  return (
    <>
      {loading && !data ? (
        <SkeletonPanel label="LOADING TRAINING LOG" rows={2}>
          <div className="skel-bar h-28 w-full" style={{ animationDelay: "0.2s" }} />
        </SkeletonPanel>
      ) : error ? (
        <SystemPanel label="Training Log">
          <div className="p-5 text-center">
            <p className="font-mono text-xs tracking-widest text-rose-400/80">NO LOG DATA AVAILABLE</p>
            <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">{error.toUpperCase()}</p>
          </div>
        </SystemPanel>
      ) : data ? (
        <SystemPanel
          label="Training Log"
          labelAccent={
            /* R55-a — "· 7-Day Cycle" tail + the accent's "THIS CYCLE" tail
               stand down (the chronicle InfoHint carries the window meaning);
               the panel reads once: label · numeral. */
            <span className="flex items-center gap-3">
              <span
                className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400"
                title="XP earned this cycle"
              >
                <TrendingUp className="h-3 w-3 text-violet-400/70" aria-hidden />
                {data.thisWeek.xp.toLocaleString()} XP
              </span>
              <InfoHint term="chronicle" />
              {/* R15-c — the divine trigger settles in with a spring pop once
                  the panel lands (PopIn self-gates reduced motion); the button
                  inside stays byte-identical, interactions untouched. */}
              <PopIn delay={0.35} className="shrink-0">
                <button
                  onClick={() => setDivOpen(true)}
                  aria-label="Run the weekly coach review"
                  title="Ask your coach for the full week review"
                  className="divine-trigger flex h-6 items-center gap-1.5 rounded-sm border border-violet-400/40 bg-violet-500/10 px-2 font-mono text-[8px] font-bold tracking-[0.22em] text-violet-300 transition-all hover:border-violet-300/70 hover:bg-violet-500/25 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)] active:bg-violet-500/35 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <Sparkles className="h-3 w-3" aria-hidden /> RUN REVIEW
                </button>
              </PopIn>
            </span>
          }
        >
          <FlowGroup className="space-y-4 p-4 sm:p-5">
            {/* delta tiles — R55-a: short labels, full terms on title */}
            <motion.div variants={flowItemVariants}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <CycleTile
                  index={0}
                  reduce={!!reduce}
                  icon={Sparkle}
                  label="XP"
                  hint="XP earned this cycle"
                  cur={data.thisWeek.xp}
                  prev={data.prevWeek.xp}
                  format={(n) => n.toLocaleString()}
                  accent="text-violet-300"
                />
                <CycleTile
                  index={1}
                  reduce={!!reduce}
                  icon={TrendingUp}
                  label="SESSIONS"
                  hint="Sessions logged this cycle"
                  cur={data.thisWeek.sessions}
                  prev={data.prevWeek.sessions}
                  format={(n) => String(n)}
                  accent="text-fuchsia-300"
                />
                <CycleTile
                  index={2}
                  reduce={!!reduce}
                  icon={TrendingUp}
                  label="VOLUME"
                  hint="Volume moved this cycle"
                  cur={data.thisWeek.volumeKg}
                  prev={data.prevWeek.volumeKg}
                  format={(n) => `${(n / 1000).toFixed(1)}t`}
                  accent="text-amber-300"
                />
                <CycleTile
                  index={3}
                  reduce={!!reduce}
                  icon={TrendingUp}
                  label="TIME"
                  hint="Time trained this cycle"
                  cur={data.thisWeek.minutes}
                  prev={data.prevWeek.minutes}
                  format={(n) => `${n}m`}
                  accent="text-amber-300"
                />
              </div>
            </motion.div>

            {/* day-by-day compliance drill-down (R3-b) — suppressed entirely
                when both cycles are empty (R53-a; the dash grid is noise) */}
            {!bothEmpty && (
              <motion.div variants={flowItemVariants}>
                <DayByDaySection data={data} reduce={!!reduce} />
              </motion.div>
            )}

            {/* daily bars over a faint blueprint field */}
            <motion.div variants={flowItemVariants}>
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.18, ease: FLOW_EASE }}
                className="relative h-28 sm:h-32"
              >
              <span className="chronicle-grid pointer-events-none absolute inset-0" aria-hidden />
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
                  <CartesianGrid horizontal vertical={false} stroke="rgba(167,139,250,0.08)" strokeDasharray="2 6" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => formatDayLabel(d)}
                    tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                    axisLine={{ stroke: "rgba(167,139,250,0.15)" }}
                    tickLine={false}
                    interval={0}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(167,139,250,0.08)" }} />
                  <Bar
                    dataKey="xp"
                    radius={[2, 2, 0, 0]}
                    minPointSize={2}
                    isAnimationActive={!reduce}
                    animationBegin={120}
                    animationDuration={700}
                    animationEasing="ease-out"
                  >
                    {data.daily.map((d) => {
                      const best = data.bestDay?.day === d.day
                      return (
                        <Cell
                          key={d.day}
                          fill={best ? "#fbbf24" : d.xp > 0 ? "#fbbf24" : "#27272a"}
                          stroke={best ? "rgba(251,191,36,0.5)" : "none"}
                          filter={best ? "drop-shadow(0 0 4px rgba(251,191,36,0.65)) drop-shadow(0 0 11px rgba(245,158,11,0.3))" : undefined}
                        />
                      )
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
            </motion.div>

            {/* domain distribution — per-gate XP radar for this cycle
                (stands down with the quiet empty when both cycles are empty) */}
            {!bothEmpty && (
              <motion.div variants={flowItemVariants}>
                {(() => {
              // full pentagon even for untouched gates
              const byGate = new Map(data.perGate.map((g) => [g.gateId, g]))
              const radarData = GATES.map((g) => ({
                short: GATE_SHORT[g.id] ?? g.id.slice(0, 6).toUpperCase(),
                gateId: g.id,
                gateName: g.name,
                xp: byGate.get(g.id)?.xp ?? 0,
                sessions: byGate.get(g.id)?.sessions ?? 0,
              }))
              const touched = radarData.filter((g) => g.xp > 0)
              if (touched.length === 0) {
                return (
                  <p className="border-t border-violet-500/10 pt-3 text-center font-mono text-[9px] tracking-[0.25em] text-zinc-400">
                    NO SESSIONS THIS CYCLE — THE PENTAGON SLEEPS
                  </p>
                )
              }
              const maxXp = Math.max(...radarData.map((g) => g.xp), 1)
              const leader = radarData.reduce((a, b) => (b.xp > a.xp ? b : a))
              return (
                <motion.div
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.24, ease: FLOW_EASE }}
                  className="relative border-t border-violet-500/10 pt-4"
                >
                  {/* R55-a — label tightened + the touched/types count folded
                      into the row's title (merge & hide) */}
                  <div
                    className="flex items-center justify-between gap-2"
                    title={`Domain distribution — XP by gate this cycle · ${touched.length} of ${GATES.length} types touched`}
                  >
                    <span className="sys-label flex items-center gap-1.5 text-[8px] text-zinc-400">
                      <RadarIcon className="h-3 w-3 text-violet-400/70" aria-hidden />
                      DOMAINS
                    </span>
                  </div>

                  <div className="mt-2 grid items-center gap-4 sm:grid-cols-[minmax(0,13.5rem)_1fr]">
                    {/* the radar pentagon — a faint halo breathes behind it */}
                    <div className="chronicle-grid relative mx-auto h-52 w-full max-w-[14rem]">
                      <span className="radar-halo" aria-hidden />
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} margin={{ top: 12, right: 14, bottom: 14, left: 14 }} outerRadius="70%">
                          <PolarGrid stroke="rgba(167,139,250,0.22)" strokeDasharray="2 4" />
                          <PolarAngleAxis
                            dataKey="short"
                            tick={{ fill: "#d4d4d8", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
                            axisLine={{ stroke: "rgba(167,139,250,0.12)" }}
                          />
                          <PolarRadiusAxis domain={[0, maxXp]} tick={false} axisLine={false} />
                          <Radar
                            dataKey="xp"
                            stroke="#fafafa"
                            strokeWidth={2}
                            fill="#fbbf24"
                            fillOpacity={0.42}
                            isAnimationActive={!reduce}
                            animationBegin={200}
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* per-gate ledger rows */}
                    <ul className="space-y-1.5">
                      {radarData.map((g, i) => {
                        const share = Math.round((g.xp / maxXp) * 100)
                        const isLeader = g.gateId === leader.gateId
                        return (
                          <motion.li
                            key={g.gateId}
                            initial={reduce ? false : { opacity: 0, y: 6 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-8% 0px" }}
                            transition={
                              reduce
                                ? { duration: 0 }
                                : { duration: 0.35, ease: FLOW_EASE, delay: Math.min(i * 0.06, 0.3) }
                            }
                            className="flex items-center gap-2.5"
                            aria-label={`${g.gateName}: ${g.xp} XP across ${g.sessions} sessions`}
                          >
                            <span
                              className={cn(
                                "inline-block h-1.5 w-1.5 shrink-0 rotate-45 border",
                                g.xp > 0
                                  ? isLeader
                                    ? "border-amber-300/80 bg-amber-400/70 shadow-[0_0_5px_rgba(245,158,11,0.6)]"
                                    : "border-violet-300/70 bg-violet-400/50"
                                  : "border-zinc-700 bg-transparent"
                              )}
                              aria-hidden
                            />
                            <span
                              className={cn(
                                "w-[4.5rem] shrink-0 font-mono text-[9px] tracking-widest",
                                g.xp > 0 ? (isLeader ? "text-zinc-200" : "text-zinc-300") : "text-zinc-400"
                              )}
                            >
                              {g.short}
                            </span>
                            <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-sm bg-zinc-900/90">
                              {/* R15-c — divine share bar: MeterFlow sweeps it from
                                  0 when the ledger scrolls into view (this panel
                                  lives below the fold in RECORDS); the old CSS
                                  width-transition could pre-play while invisible. */}
                              <MeterFlow
                                pct={share}
                                inView
                                duration={0.7}
                                className={cn(
                                  "h-full",
                                  isLeader
                                    ? "bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300"
                                    : "bg-gradient-to-r from-violet-700 via-violet-500 to-fuchsia-400"
                                )}
                              />
                            </div>
                            <span
                              className={cn(
                                "w-[4.2rem] shrink-0 text-right font-mono text-[9px] tabular-nums tracking-wider",
                                g.xp > 0 ? (isLeader ? "text-amber-200 drop-shadow-[0_0_4px_rgba(245,158,11,0.35)]" : "text-zinc-400") : "text-zinc-400"
                              )}
                            >
                              {g.xp > 0 ? `${g.xp.toLocaleString()} XP` : "0 XP"}
                            </span>
                          </motion.li>
                        )
                      })}
                    </ul>
                  </div>
                </motion.div>
              )
            })()}
              </motion.div>
            )}

            {/* verdict — a status LED carries the tone. R53-a: the both-empty
                silence stanza renders as ONE quiet sentence-case line. */}
            {bothEmpty ? (
              <p className="border-t border-violet-500/10 pt-3 text-center font-mono text-[10px] text-zinc-400">
                No sessions this cycle or last
              </p>
            ) : (
              verdict && (
                <motion.p
                  initial={reduce ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.4, ease: FLOW_EASE }}
                  title={verdict.text}
                  className={cn(
                    "flex items-center justify-center gap-2 border-t border-violet-500/10 pt-3 text-center font-mono text-[10px] tracking-[0.22em]",
                    verdict.tone === "up" && "text-amber-400/90",
                    verdict.tone === "down" && "text-rose-400/90",
                    verdict.tone === "flat" && "text-zinc-400"
                  )}
                >
                  <span className="chronicle-led" aria-hidden />
                  {/* R55-a — the data verdict renders; the dramatic full line
                      rides the title (hover) — merge & hide. */}
                  <span className="min-w-0 break-words">{verdict.short}</span>
                </motion.p>
              )
            )}

            {/* best day footnote — amber motes with the wax-seal glow */}
            {data.bestDay && (
              <p className="flex items-center justify-center gap-1.5 font-mono text-[9px] tracking-[0.25em] text-amber-400/60">
                <span className="inline-block h-1 w-1 rotate-45 bg-amber-400/70 shadow-[0_0_5px_rgba(245,158,11,0.5)]" aria-hidden />
                PEAK DAY: {formatDayLabel(data.bestDay.day).toUpperCase()} · {data.bestDay.xp} XP
                <span className="inline-block h-1 w-1 rotate-45 bg-amber-400/70 shadow-[0_0_5px_rgba(245,158,11,0.5)]" aria-hidden />
              </p>
            )}
          </FlowGroup>
        </SystemPanel>
      ) : null}

      {/* the weekly Oracle reading — cast from this panel's header */}
      <DivinationDialog open={divOpen} onOpenChange={setDivOpen} />
    </>
  )
}
