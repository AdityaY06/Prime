"use client"

// ─── PRIME · DeloadAdvisor (R60 — the R22-a orphan lib finally mounted) ───────
// The Strain & Load console (records-tab, R18-d) measures everything and
// prescribes nothing. This panel is the prescription read: lib/deload.ts folds
// the console's own week history into an explicit DELOAD call — the planned
// step-back week of classic periodization. Nothing new is measured; every
// number is a re-read of the same LoadView DTO, derived client-side (pure
// functions, no new API surface). Status rules live in the lib's header;
// skins live here.
//
// VISUAL REGISTER — the console's own idiom: mono uppercase micro-labels,
// zinc-800/60 section dividers, band-chips (rose DELOAD NOW / amber WATCH /
// teal CRUISE / zinc forming), vertical strain bars on the 0–21 lattice with
// the dashed 14 HIGH bar reference, evidence driver lines, and the citation
// footer riding the label's title attribute (the R53-a declutter discipline —
// meaning in the "deload" InfoHint, sources on hover).

import { useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { deloadView, DELOAD_FOOTER, DELOAD_HIGH_BAR, type DeloadStatus } from "@/lib/deload"
import type { AcwrVerdict, LoadView } from "@/lib/load"
import { dayKey, formatDayLabel } from "@/lib/game"
import { FlowReveal, PopIn, FLOW_EASE } from "@/components/system/motion"
import { InfoHint } from "@/components/system/info-hint"
import { cn } from "@/lib/utils"

/** Status → chip skin (the ACWR_HUE idiom). */
const DELOAD_SKIN: Record<DeloadStatus, { chip: string; text: string; bar: string }> = {
  "DELOAD NOW": {
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    text: "text-rose-300",
    bar: "from-rose-500/80 to-rose-400",
  },
  WATCH: {
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    text: "text-amber-300",
    bar: "from-amber-500/80 to-amber-400",
  },
  CRUISE: {
    chip: "border-teal-500/40 bg-teal-500/10 text-teal-300",
    text: "text-teal-300",
    bar: "from-teal-500/80 to-teal-400",
  },
  "BUILDING PICTURE": {
    chip: "border-zinc-600/60 bg-zinc-500/10 text-zinc-300",
    text: "text-zinc-300",
    bar: "from-zinc-500/80 to-zinc-400",
  },
  "NO HISTORY": {
    chip: "border-zinc-600/60 bg-zinc-500/10 text-zinc-400",
    text: "text-zinc-400",
    bar: "from-zinc-500/80 to-zinc-400",
  },
}

/** One week bar of the advisor lattice — mean strain, 0–21 scale. */
function WeekBar({
  pct,
  fill,
  delay,
  animate,
}: {
  pct: number
  fill: string
  delay: number
  animate: boolean
}) {
  const cls = cn("w-full origin-bottom rounded-t-sm bg-gradient-to-t", fill)
  if (!animate) {
    return <div className={cls} style={{ height: `${pct}%` }} aria-hidden />
  }
  return (
    <motion.div
      className={cls}
      style={{ height: `${pct}%` }}
      initial={{ scaleY: 0 }}
      whileInView={{ scaleY: 1 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.6, ease: FLOW_EASE, delay }}
      aria-hidden
    />
  )
}

/**
 * The deload advisor — renders inside the Strain & Load console panel,
 * after the 30-day load curve. `load` is the console's own DTO.
 */
export function DeloadAdvisor({ load }: { load: LoadView }) {
  const reduce = useReducedMotion()

  // Pure derivation, memoized on the DTO identity; today anchors the buckets.
  const view = useMemo(
    () => deloadView(load.days, dayKey(), load.acwr, load.acwrVerdict),
    [load.days, load.acwr, load.acwrVerdict],
  )

  const skin = DELOAD_SKIN[view.status]
  // lib returns newest-first; the lattice reads oldest → newest, left → right
  const ordered = useMemo(() => [...view.weeks].reverse(), [view.weeks])
  const highPct = (DELOAD_HIGH_BAR / 21) * 100

  return (
    <FlowReveal className="mt-4 border-t border-zinc-800/60 pt-4">
      {/* label + status chip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="sys-label flex items-center gap-1.5 text-[9px] text-zinc-400"
          title={DELOAD_FOOTER}
        >
          DELOAD ADVISOR
          <InfoHint term="deload" />
        </p>
        <PopIn delay={0.1}>
          <span
            className={cn(
              "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
              skin.chip,
            )}
          >
            {view.status}
          </span>
        </PopIn>
      </div>

      {/* headline + prescription */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={cn("font-mono text-sm font-bold tracking-[0.14em]", skin.text)}>
          {view.headline}
        </p>
        {view.cutPct !== null && (
          <span
            className={cn(
              "inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
              skin.chip,
            )}
            title={`Recommended next-week volume reduction — ${view.cutPct}% (session load and/or set count)`}
          >
            NEXT WEEK −{view.cutPct}%
          </span>
        )}
      </div>
      <p className="mt-1 font-mono text-[10px] tracking-[0.2em] text-zinc-400">{view.sub}</p>

      {/* week lattice — mean strain per full week, 0–21, HIGH bar dashed */}
      {ordered.length > 0 && (
        <div
          className="mt-4"
          role="img"
          aria-label={`Weekly strain lattice: ${ordered
            .map(
              (w) =>
                `${formatDayLabel(w.startDay)} to ${formatDayLabel(w.endDay)} mean ${w.meanStrain.toFixed(1)} of 21${
                  w.meanStrain >= DELOAD_HIGH_BAR ? " (high)" : ""
                }`,
            )
            .join("; ")}. High bar ${DELOAD_HIGH_BAR} of 21.`}
        >
          <div className="relative h-28 pl-6 sm:h-32">
            {/* Y ticks — 0 / 7 / 14 / 21 on the 0–21 lattice */}
            <div className="absolute inset-y-0 left-0 w-5 font-mono text-[8px] tabular-nums leading-none text-zinc-500" aria-hidden>
              {[21, 14, 7, 0].map((t) => (
                <span key={t} className="absolute left-0 -translate-y-1/2" style={{ top: `${(t / 21) * 100}%` }}>
                  {t}
                </span>
              ))}
            </div>
            {/* the HIGH bar reference — dashed at 14/21 */}
            <div
              className="absolute inset-x-0 border-t border-dashed border-amber-400/35"
              style={{ bottom: `${highPct}%` }}
              aria-hidden
            >
              <span className="absolute -top-2 right-0 font-mono text-[7px] tracking-[0.2em] text-amber-400/60">
                HIGH {DELOAD_HIGH_BAR}
              </span>
            </div>
            {/* baseline */}
            <div className="absolute inset-x-0 bottom-0 border-t border-zinc-700/60" aria-hidden />
            {/* bars */}
            <div className="absolute inset-x-0 inset-y-0 flex items-end gap-1.5 sm:gap-2">
              {ordered.map((w, i) => {
                const pct = Math.min(100, (w.meanStrain / 21) * 100)
                const band =
                  w.meanStrain >= DELOAD_HIGH_BAR
                    ? skin.bar // streak weeks wear the status accent
                    : w.meanStrain <= 2
                      ? "from-zinc-700/80 to-zinc-600" // rest week — zero is data
                      : "from-teal-500/70 to-teal-400/90" // mid lane
                return (
                  <div
                    key={w.startDay}
                    className="flex h-full flex-1 items-end"
                    title={`${formatDayLabel(w.startDay).toUpperCase()} – ${formatDayLabel(w.endDay).toUpperCase()} · MEAN STRAIN ${w.meanStrain.toFixed(1)}/21 · LOAD ${Math.round(w.totalLoad)} AU · ${w.trainingDays} TRAINING DAYS${
                      w.meanStrain >= DELOAD_HIGH_BAR
                        ? " · HIGH WEEK"
                        : w.meanStrain <= 2
                          ? " · REST WEEK"
                          : ""
                    }`}
                  >
                    <WeekBar pct={pct} fill={band} delay={0.06 * i} animate={!reduce} />
                  </div>
                )
              })}
            </div>
          </div>
          {/* X labels — each bucket's closing day */}
          <div className="mt-1.5 flex gap-1.5 pl-6 sm:gap-2" aria-hidden>
            {ordered.map((w) => (
              <span
                key={w.startDay}
                className="flex-1 text-center font-mono text-[8px] tabular-nums tracking-wide text-zinc-500"
              >
                {formatDayLabel(w.endDay).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* evidence — deterministic driver lines from the lib */}
      <ul className="mt-3 space-y-1">
        {view.drivers.map((d) => (
          <li
            key={d}
            className="flex items-start gap-1.5 font-mono text-[9px] leading-relaxed tracking-[0.16em] text-zinc-400"
          >
            <span className="mt-px text-zinc-600" aria-hidden>
              ▸
            </span>
            {d}
          </li>
        ))}
      </ul>
    </FlowReveal>
  )
}
