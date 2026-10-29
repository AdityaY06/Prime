"use client"

import { useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { CalendarDays } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { useApi } from "@/hooks/use-api"
import { formatDayLabel } from "@/lib/game"
import type { HeatmapDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FLOW_EASE } from "@/components/system/motion"

/** Weekday rail letters — Monday-first (ISO weeks), sparse like GitHub grids. */
const WEEKDAY_LETTERS = ["M", "", "W", "", "F", "", ""]

type Cell = { day: string; xp: number; future: boolean }

/** Intensity bucket 0–4 for a day's XP against the window's max. */
function levelFor(xp: number, max: number): number {
  if (xp <= 0 || max <= 0) return 0
  const q = xp / max
  if (q <= 0.25) return 1
  if (q <= 0.5) return 2
  if (q <= 0.75) return 3
  return 4
}

const LEVEL_CLASSES = [
  "border-zinc-800/70 bg-zinc-900/80",
  "border-violet-500/30 bg-violet-500/25",
  "border-violet-500/45 bg-violet-500/45",
  "border-violet-400/60 bg-violet-500/70",
  "border-violet-300/70 bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.55)]",
]

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Short month name if this week contains the 1st of a month, else null. */
function monthLabel(weekStart: Date): string | null {
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    if (d.getDate() === 1) {
      return d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
    }
  }
  return null
}

/**
 * LIFETIME LEDGER — a 26-week daily-XP calendar. Every cleared raid and claimed
 * directive burns energy into the grid; the brightest cell is the peak day.
 */
export function XpHeatmap() {
  const { data, loading, error } = useApi<HeatmapDTO>("/api/heatmap")
  const reduce = useReducedMotion()

  // chunk the day series into Monday-first weeks; pad the current week's
  // remaining days as inert "future" cells so the grid stays rectangular
  const weeks = useMemo(() => {
    if (!data) return [] as { start: Date; month: string | null; cells: Cell[] }[]
    const cells: Cell[] = data.days.map((d) => ({ ...d, future: false }))
    const last = data.days[data.days.length - 1]
    if (last) {
      const lastDate = parseDay(last.day)
      const pad = (7 - (cells.length % 7)) % 7
      for (let i = 1; i <= pad; i++) {
        const d = new Date(lastDate)
        d.setDate(d.getDate() + i)
        cells.push({
          day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
          xp: 0,
          future: true,
        })
      }
    }
    const out: { start: Date; month: string | null; cells: Cell[] }[] = []
    for (let i = 0; i < cells.length; i += 7) {
      const start = parseDay(cells[i].day)
      out.push({ start, month: monthLabel(start), cells: cells.slice(i, i + 7) })
    }
    return out
  }, [data])

  const maxXp = useMemo(() => Math.max(...(data?.days.map((d) => d.xp) ?? [0])), [data])

  // the month currently being lived — its rail label burns a touch brighter
  const currentMonth = data?.today
    ? parseDay(data.today).toLocaleDateString("en-US", { month: "short" }).toUpperCase()
    : null

  if (loading && !data) {
    return (
      <SkeletonPanel label="LOADING LIFETIME LEDGER" rows={2}>
        <div className="skel-bar h-24 w-full" style={{ animationDelay: "0.2s" }} />
      </SkeletonPanel>
    )
  }
  if (error || !data) {
    return (
      <SystemPanel label="Lifetime Ledger">
        <div className="p-5 text-center">
          <p className="font-mono text-xs tracking-widest text-rose-400/80">THE LEDGER IS SEALED</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">
            {(error ?? "NO DATA").toUpperCase()}
          </p>
        </div>
      </SystemPanel>
    )
  }

  const summary = `26-week training calendar: ${data.activeDays} of ${data.totalDays} days active${
    data.bestDay ? `, peak day ${formatDayLabel(data.bestDay.day)} with ${data.bestDay.xp} XP` : ""
  }, current streak ${data.streakDays} days`

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <SystemPanel
        label="Lifetime Ledger"
        labelAccent={
          /* R55-a — the "· 26 Weeks" scope tail rides this title. */
          <span
            className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400"
            title="26-week daily-XP calendar"
          >
            <CalendarDays className="h-3 w-3 text-violet-400/70" aria-hidden />
            {data.activeDays}/{data.totalDays} ACTIVE DAYS
          </span>
        }
      >
        <div className="p-4 sm:p-5" role="img" aria-label={summary}>
          <div className="flex gap-2">
            {/* weekday rail — M · W · F */}
            <div className="flex flex-col gap-[2px] pt-[15px] sm:gap-[3px]" aria-hidden>
              {WEEKDAY_LETTERS.map((l, i) => (
                <span
                  key={i}
                  className="flex h-[9px] w-3 items-center justify-center font-mono text-[7px] leading-none text-zinc-400 sm:h-2.5"
                >
                  {l}
                </span>
              ))}
            </div>

            {/* the calendar grid — scrolls horizontally only on the narrowest screens */}
            <div className="scroll-sys min-w-0 flex-1 overflow-x-auto pb-1">
              <div className="relative flex w-max gap-[2px] sm:gap-[3px]">
                {/* blueprint field — an empty masked span behind the calendar
                    (chronicle-grid convention; never on the cell container,
                    a mask would clip the cells' rings and dim their colors) */}
                <span className="heatmap-field pointer-events-none absolute inset-0" aria-hidden />
                {weeks.map((w, wi) => (
                  <motion.div
                    key={w.start.toISOString()}
                    /* R15-c — mount WAVE: one motion wrapper per week column
                       (26 nodes — never ~180 per-cell components). Each column
                       pops in as the ledger scrolls into view with a
                       column-progressive delay capped at 0.5s; transform +
                       opacity only, so the scroll-sys container never gains
                       vertical overflow and per-cell hover CSS stays intact. */
                    initial={reduce ? false : { opacity: 0, scale: 0.7 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: "-8% 0px" }}
                    transition={
                      reduce ? { duration: 0 } : { duration: 0.4, ease: FLOW_EASE, delay: Math.min(wi * 0.03, 0.5) }
                    }
                    className="flex flex-col gap-[2px] sm:gap-[3px]"
                  >
                    <span
                      data-current={w.month === currentMonth || undefined}
                      className="heatmap-month flex h-[13px] items-end font-mono text-[7px] font-bold tracking-widest text-zinc-400 sm:h-3.5"
                    >
                      {w.month ?? ""}
                    </span>
                    {w.cells.map((c) => {
                      const level = levelFor(c.xp, maxXp)
                      const isBest = data.bestDay?.day === c.day
                      const isToday = data.today === c.day
                      return (
                        <span
                          key={c.day}
                          title={
                            c.future
                              ? undefined
                              : `${formatDayLabel(c.day)} · ${c.xp > 0 ? `+${c.xp.toLocaleString()} XP` : "NO XP YET"}`
                          }
                          aria-hidden
                          data-level={c.future ? "x" : level}
                          data-best={isBest || undefined}
                          data-today={(isToday && !isBest) || undefined}
                          className={cn(
                            "heatmap-cell h-[9px] w-[9px] shrink-0 rounded-[2px] border transition-all duration-200 sm:h-2.5 sm:w-2.5",
                            c.future
                              ? "pointer-events-none border-transparent bg-transparent"
                              : LEVEL_CLASSES[level],
                            isBest && "ring-1 ring-amber-300/80 shadow-[0_0_6px_rgba(245,158,11,0.45)]",
                            isToday && !isBest && "ring-1 ring-violet-200/70",
                            c.future ? "" : "cursor-default"
                          )}
                        />
                      )
                    })}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* legend + ledger stats — R55-a: the LESS/MORE words ride the
              legend's title, the scale speaks in swatches */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-violet-500/10 pt-3">
            <span className="flex items-center gap-1.5 font-mono text-[8px] tracking-[0.2em] text-zinc-400" title="Less → more XP" aria-hidden>
              {LEVEL_CLASSES.map((cls, i) => (
                <span key={i} className={cn("h-[9px] w-[9px] rounded-[2px] border", cls)} />
              ))}
            </span>
            <span className="font-mono text-[8px] tabular-nums tracking-[0.18em] text-zinc-400">
              {data.windowXp > 0 ? (
                <>
                  {data.windowXp.toLocaleString()} XP
                  {data.bestDay && <> · PEAK +{data.bestDay.xp.toLocaleString()} {formatDayLabel(data.bestDay.day).toUpperCase()}</>}
                  {data.streakDays > 0 && <> · STREAK {data.streakDays}D</>}
                </>
              ) : (
                <>AWAITING YOUR FIRST SESSION</>
              )}
            </span>
          </div>

          {/* blank-ledger whisper */}
          {data.windowXp === 0 && (
            <p className="mt-2 text-center font-mono text-[9px] tracking-[0.25em] text-zinc-400">
              THE LEDGER IS BLANK — EVERY COMPLETED SESSION WILL LIGHT A CELL
            </p>
          )}
        </div>
      </SystemPanel>
    </motion.div>
  )
}
