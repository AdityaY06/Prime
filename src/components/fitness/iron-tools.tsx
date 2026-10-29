"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Calculator, Flame, Minus, Plus, TrendingUp } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/* ─── plate model ────────────────────────────────────────────────────────── */

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const

type PlateVisual = { h: number; w: number; plate: string; dot: string }

/** Height ∝ weight (25 tallest), widths 10–16px. Never blue. */
const PLATE_VISUALS = new Map<number, PlateVisual>([
  [25, { h: 72, w: 16, plate: "border-rose-300/60 bg-gradient-to-b from-rose-400 to-rose-600 shadow-[0_0_12px_rgba(244,63,94,0.35)]", dot: "bg-rose-500" }],
  [20, { h: 60, w: 14, plate: "border-violet-300/60 bg-gradient-to-b from-violet-400 to-violet-600 shadow-[0_0_12px_rgba(139,92,246,0.35)]", dot: "bg-violet-500" }],
  [15, { h: 48, w: 13, plate: "border-fuchsia-300/60 bg-gradient-to-b from-fuchsia-400 to-fuchsia-600 shadow-[0_0_12px_rgba(217,70,239,0.35)]", dot: "bg-fuchsia-500" }],
  [10, { h: 38, w: 12, plate: "border-teal-300/60 bg-gradient-to-b from-teal-400 to-teal-600 shadow-[0_0_12px_rgba(20,184,166,0.35)]", dot: "bg-teal-500" }],
  [5, { h: 28, w: 11, plate: "border-amber-300/60 bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_0_10px_rgba(245,158,11,0.3)]", dot: "bg-amber-500" }],
  [2.5, { h: 22, w: 10, plate: "border-zinc-300/40 bg-gradient-to-b from-zinc-400 to-zinc-500", dot: "bg-zinc-500" }],
  [1.25, { h: 18, w: 10, plate: "border-zinc-300/30 bg-gradient-to-b from-zinc-500 to-zinc-600", dot: "bg-zinc-600" }],
])

const PLATE_FALLBACK: PlateVisual = PLATE_VISUALS.get(1.25) as PlateVisual

const BARS = [
  { id: "olympic", label: "OLYMPIC", weight: 20 },
  { id: "womens", label: "WOMEN'S", weight: 15 },
  { id: "technique", label: "TECHNIQUE", weight: 10 },
] as const

type SideLoad = {
  status: "ok" | "short" | "below-bar"
  counts: { w: number; n: number }[]
  perSide: number
  remainder: number
}

/** Greedy per-side load from the standard plate set. */
function computeSideLoad(target: number, barKg: number): SideLoad {
  const ideal = Math.round(((target - barKg) / 2) * 100) / 100
  if (ideal < 0) return { status: "below-bar", counts: [], perSide: 0, remainder: 0 }
  let rem = ideal
  const counts: { w: number; n: number }[] = []
  for (const p of PLATES) {
    const n = Math.floor((rem + 1e-9) / p)
    if (n > 0) {
      counts.push({ w: p, n })
      rem = Math.round((rem - n * p) * 100) / 100
    }
  }
  return {
    status: rem > 0.005 ? "short" : "ok",
    counts,
    perSide: ideal - Math.max(0, rem),
    remainder: Math.max(0, rem),
  }
}

const fmtKg = (n: number) => String(Math.round(n * 100) / 100)

/* ─── shared weight stepper ──────────────────────────────────────────────── */

function KgStepper({
  id,
  label,
  value,
  onChange,
  min = 20,
  max = 500,
  step = 2.5,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100))
  const btn =
    "grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-all hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-300 active:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
  return (
    <div>
      <label htmlFor={id} className="sys-label block text-zinc-500">
        {label}
      </label>
      <div className="mt-1.5 flex gap-1.5">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))} className={btn}>
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(clamp(v))
          }}
          className="h-11 min-w-0 flex-1 rounded-sm border border-zinc-700/60 bg-zinc-950/70 px-2 text-center font-mono text-sm font-bold tabular-nums text-violet-100 focus:border-violet-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))} className={btn}>
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

/* ─── tool 1 · plate calculator ──────────────────────────────────────────── */

function PlateStackSide({ plates, side, reduce }: { plates: number[]; side: "l" | "r"; reduce: boolean }) {
  // left side mirrors the right — outermost (smallest) plates sit at the sleeve end
  const ordered = side === "r" ? plates : [...plates].reverse()
  return (
    <>
      {ordered.map((w, i) => {
        const v = PLATE_VISUALS.get(w) ?? PLATE_FALLBACK
        return (
          <motion.div
            key={`${side}-${i}-${w}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scaleY: 0.5 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ delay: reduce ? 0 : i * 0.03, type: "spring", stiffness: 300, damping: 24 }}
            className={cn("z-10 flex shrink-0 items-center justify-center rounded-[2px] border", v.plate)}
            style={{ height: v.h, width: v.w }}
            title={`${w} KG plate`}
          >
            {v.h >= 34 && <span className="font-mono text-[8px] font-bold tabular-nums text-zinc-950/80">{w}</span>}
          </motion.div>
        )
      })}
    </>
  )
}

function PlateCalculator({
  target,
  onTarget,
  barId,
  onBarId,
}: {
  target: number
  onTarget: (v: number) => void
  barId: (typeof BARS)[number]["id"]
  onBarId: (id: (typeof BARS)[number]["id"]) => void
}) {
  const reduce = useReducedMotion()
  const bar = BARS.find((b) => b.id === barId) ?? BARS[0]
  const load = useMemo(() => computeSideLoad(target, bar.weight), [target, bar.weight])

  const flat = useMemo(() => {
    const out: number[] = []
    for (const c of load.counts) for (let i = 0; i < c.n; i++) out.push(c.w)
    return out
  }, [load.counts])

  const breakdown =
    load.counts.length > 0 ? load.counts.map((c) => `${c.n}×${c.w}`).join(" · ") : "NO PLATES — BAR ONLY"

  return (
    <section
      aria-label="Plate calculator"
      className="relative overflow-hidden rounded-sm border border-violet-500/25 bg-zinc-950/70"
    >
      {/* faint violet aura */}
      <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl" aria-hidden />
      <div className="relative flex items-center gap-2 border-b border-violet-500/10 px-4 py-2.5">
        <Calculator className="h-3.5 w-3.5 text-violet-400/80" aria-hidden />
        <span className="sys-label text-violet-300/80">Plate Calculator</span>
        <span className="ml-auto font-mono text-[9px] tracking-widest text-zinc-600">KG · PER SIDE</span>
      </div>

      <div className="relative p-4">
        <KgStepper id="plate-target" label="Target Weight · KG" value={target} min={20} max={500} step={2.5} onChange={onTarget} />

        {/* bar selector chips */}
        <div className="mt-3">
          <p className="sys-label text-zinc-500">Bar</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {BARS.map((b) => {
              const active = barId === b.id
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onBarId(b.id)}
                  className={cn(
                    "flex h-12 flex-col items-center justify-center rounded-sm border font-mono tracking-wider transition-all focus-visible:outline focus-visible:outline-violet-400/70",
                    active
                      ? "border-violet-400/70 bg-violet-500/20 text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.3)]"
                      : "border-zinc-700/60 bg-zinc-950/50 text-zinc-500 hover:border-violet-500/40 hover:text-violet-300"
                  )}
                >
                  <span className="text-[9px] font-bold">{b.label}</span>
                  <span className="text-[10px] font-bold tabular-nums opacity-70">{b.weight} KG</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* barbell cross-section — plates hang on the sleeve line */}
        <div
          className="scroll-sys mt-4 overflow-x-auto rounded-sm border border-zinc-800 bg-black/30 px-3 py-2"
          role="img"
          aria-label={`Barbell at ${fmtKg(target)} kilograms: ${load.status === "below-bar" ? "target below bar weight" : `${breakdown} per side`}`}
        >
          <div className="relative flex h-[88px] min-w-max items-center justify-center gap-[3px] px-2">
            {/* left sleeve */}
            <div className="h-[5px] w-10 shrink-0 rounded-l-full bg-gradient-to-l from-zinc-600 to-zinc-700" aria-hidden />
            <PlateStackSide plates={flat} side="l" reduce={!!reduce} />
            {/* collar */}
            <div className="h-11 w-[7px] shrink-0 rounded-[2px] border border-zinc-200/20 bg-gradient-to-b from-zinc-300 to-zinc-500" aria-hidden />
            {/* shaft */}
            <div className="h-[5px] w-12 shrink-0 rounded-full bg-gradient-to-r from-zinc-600 via-zinc-400 to-zinc-600" aria-hidden />
            <div className="h-11 w-[7px] shrink-0 rounded-[2px] border border-zinc-200/20 bg-gradient-to-b from-zinc-300 to-zinc-500" aria-hidden />
            <PlateStackSide plates={flat} side="r" reduce={!!reduce} />
            {/* right sleeve + end cap */}
            <div className="h-[5px] w-10 shrink-0 rounded-r-full bg-gradient-to-r from-zinc-600 to-zinc-700" aria-hidden />
            <div className="h-3 w-[6px] shrink-0 rounded-r-[3px] bg-gradient-to-b from-zinc-300 to-zinc-400" aria-hidden />
            {flat.length === 0 && (
              <span className="z-10 px-3 font-mono text-[9px] tracking-[0.25em] text-zinc-600">BARE SLEEVE — BAR ONLY</span>
            )}
          </div>
        </div>

        {/* legend */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          {PLATES.map((p) => (
            <span key={p} className="flex items-center gap-1 font-mono text-[9px] tabular-nums text-zinc-600">
              <i className={cn("h-2 w-2 rounded-[2px]", (PLATE_VISUALS.get(p) ?? PLATE_FALLBACK).dot)} aria-hidden />
              {p}
            </span>
          ))}
        </div>

        {/* breakdown + math */}
        {load.status === "below-bar" ? (
          <p
            role="alert"
            className="mt-3 flex items-center justify-center gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center font-mono text-[10px] font-bold tracking-widest text-amber-300"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            TARGET BELOW BAR — RAISE TARGET OR SELECT LIGHTER BAR
          </p>
        ) : (
          <>
            <p className="mt-3 text-center font-mono text-[11px] tracking-wider text-zinc-400">
              PER SIDE: <span className="font-bold text-zinc-200">{breakdown}</span>
            </p>
            <p className="mt-1.5 text-center font-mono text-[10px] tabular-nums tracking-[0.15em] text-zinc-600">
              {fmtKg(target)} KG = <span className="text-zinc-400">{bar.weight} BAR</span> + 2 ×{" "}
              <span className="text-violet-300">{fmtKg(load.perSide)} PER SIDE</span>
            </p>
            {load.status === "short" && (
              <p
                role="alert"
                className="mt-3 flex items-center justify-center gap-2 rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-center font-mono text-[10px] font-bold tracking-widest text-rose-300"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                NOT LOADABLE WITH STANDARD PLATES — {fmtKg(load.remainder)} KG OVER
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/* ─── tool 2 · warmup ladder ─────────────────────────────────────────────── */

function WarmupLadder({
  work,
  target,
  barWeight,
  onWork,
}: {
  work: number
  target: number
  barWeight: number
  onWork: (v: number) => void
}) {
  const rungs = useMemo(() => {
    const floor25 = (x: number) => Math.round(Math.floor((x + 1e-9) / 2.5) * 2.5 * 100) / 100
    return [
      { key: "bar", chip: "BAR", weight: barWeight, reps: 10 },
      { key: "40", chip: "40%", weight: floor25(work * 0.4), reps: 5 },
      { key: "60", chip: "60%", weight: floor25(work * 0.6), reps: 3 },
      { key: "80", chip: "80%", weight: floor25(work * 0.8), reps: 1 },
      { key: "90", chip: "90%", weight: floor25(work * 0.9), reps: 1 },
    ]
  }, [work, barWeight])

  return (
    <section
      aria-label="Warmup ladder"
      className="relative overflow-hidden rounded-sm border border-amber-500/25 bg-zinc-950/70"
    >
      {/* faint ember aura */}
      <div className="pointer-events-none absolute -left-14 -top-14 h-40 w-40 rounded-full bg-amber-500/10 blur-2xl" aria-hidden />
      <div className="relative flex items-center gap-2 border-b border-amber-500/10 px-4 py-2.5">
        <TrendingUp className="h-3.5 w-3.5 text-amber-400/80" aria-hidden />
        <span className="sys-label text-amber-300/80">Warmup Ladder</span>
        {work !== target && (
          <button
            type="button"
            onClick={() => onWork(target)}
            className="ml-auto rounded-sm border border-dashed border-violet-500/40 bg-violet-500/5 px-2 py-1 font-mono text-[9px] tracking-widest text-violet-300 transition-all hover:bg-violet-500/15 active:bg-violet-500/25 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            PULL {fmtKg(target)} KG
          </button>
        )}
        {work === target && <span className="ml-auto font-mono text-[9px] tracking-widest text-zinc-600">5-STEP RAMP</span>}
      </div>

      <div className="relative p-4">
        <KgStepper id="warmup-work" label="Working Set · KG" value={work} min={20} max={500} step={2.5} onChange={onWork} />

        <div className="mt-3 space-y-1.5">
          {rungs.map((r) => (
            <div
              key={r.key}
              className="flex items-center gap-2.5 rounded-sm border border-zinc-800 bg-black/25 px-3 py-2 transition-colors hover:border-zinc-700"
            >
              <span
                className={cn(
                  "w-10 shrink-0 rounded-sm border px-1 py-0.5 text-center font-mono text-[9px] font-bold tabular-nums tracking-wider",
                  r.key === "bar"
                    ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
                    : "border-zinc-700 bg-zinc-900/70 text-zinc-400"
                )}
              >
                {r.chip}
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-zinc-200">
                {fmtKg(r.weight)}
                <span className="ml-1 text-[9px] font-normal text-zinc-600">KG</span>
              </span>
              <span className="ml-auto font-mono text-[10px] font-bold tabular-nums tracking-widest text-zinc-500">
                × {r.reps}
                {r.key === "bar" && <span className="ml-1.5 font-normal tracking-[0.2em] text-zinc-700">EMPTY BAR</span>}
              </span>
            </div>
          ))}

          {/* the payoff row */}
          <div className="flex items-center gap-2.5 rounded-sm border border-emerald-400/50 bg-emerald-500/10 px-3 py-2.5 shadow-[0_0_18px_rgba(16,185,129,0.15)]">
            <span className="w-10 shrink-0 rounded-sm border border-emerald-400/60 bg-emerald-500/20 px-1 py-0.5 text-center font-mono text-[9px] font-bold tabular-nums tracking-wider text-emerald-200">
              100%
            </span>
            <span className="font-mono text-base font-bold tabular-nums text-emerald-300">
              {fmtKg(work)}
              <span className="ml-1 text-[9px] font-normal text-emerald-500/80">KG</span>
            </span>
            <span className="ml-auto font-mono text-[10px] font-bold tracking-[0.25em] text-emerald-300/90">WORK SET</span>
          </div>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[9px] leading-relaxed tracking-[0.25em] text-amber-400/60">
          <Flame className="h-3 w-3 shrink-0" aria-hidden />
          RAMP TO YOUR WORKING SET — NEVER COLD
        </p>
      </div>
    </section>
  )
}

/* ─── mounted export ─────────────────────────────────────────────────────── */

/** IRON TOOLS — plate math + warmup ramp for the Gates tab. */
export function IronTools() {
  const [target, setTarget] = useState(100)
  const [work, setWork] = useState(100)
  const [barId, setBarId] = useState<(typeof BARS)[number]["id"]>("olympic")
  const bar = BARS.find((b) => b.id === barId) ?? BARS[0]

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PlateCalculator target={target} onTarget={setTarget} barId={barId} onBarId={setBarId} />
      <WarmupLadder work={work} target={target} barWeight={bar.weight} onWork={setWork} />
    </div>
  )
}
