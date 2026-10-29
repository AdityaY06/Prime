"use client"

/**
 * R57 · CLEAN SLATE — the PRIME light kit.
 *
 * The shared design language for the five Duolingo-era facades. One accent
 * green, warm ink, chunky 3D buttons, glossy progress bars, cards with 2px
 * soft borders, tiny gray section labels, and the ShowEverything expander
 * that mounts preserved legacy deep views (merge & hide — never delete).
 *
 * Rules of the kit:
 *  - sentence-case human copy, never lore voice, on facade surfaces
 *  - one primary action (green) per screen; everything else is a TapRow
 *  - honest numbers only — null renders "—", never a fabricated value
 *  - every interactive element ≥44px, focus-visible green ring
 */

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { FLOW_EASE } from "@/components/system/motion"
import { cn } from "@/lib/utils"

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Thousands-separated numeral; null/undefined renders an honest "—". */
export function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("en-US")
}

/** Human time-of-day greeting for the Home hero. */
export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

/* ── BigButton — the chunky 3D press button ──────────────────────────────── */

type ButtonVariant = "green" | "gold" | "orange" | "outline" | "danger"
type ButtonSize = "lg" | "md"

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  green: "bg-[#58cc02] text-white shadow-[0_4px_0_0_#46a302] hover:bg-[#61d905] prime-btn-shine",
  gold: "bg-[#ffc800] text-[#5c4300] shadow-[0_4px_0_0_#e0ac00] hover:bg-[#ffd21f] prime-btn-shine",
  orange: "bg-[#ff9600] text-white shadow-[0_4px_0_0_#e08600] hover:bg-[#ffa11f] prime-btn-shine",
  outline: "bg-white text-[#5c5c5c] shadow-[0_4px_0_0_#e5e5e5] hover:bg-[#f7f7f4]",
  danger: "bg-[#ff4b4b] text-white shadow-[0_4px_0_0_#d33a3a] hover:bg-[#ff5c5c] prime-btn-shine",
}

const BTN_SIZES: Record<ButtonSize, string> = {
  lg: "h-12 px-6 text-base md:h-14 md:text-lg",
  md: "h-11 px-5 text-sm",
}

export function BigButton({
  variant = "green",
  size = "lg",
  full = false,
  loading = false,
  disabled = false,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  full?: boolean
  loading?: boolean
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl font-extrabold tracking-wide",
        "transition-[transform,box-shadow,background-color] duration-75",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
        "active:translate-y-1 active:shadow-none",
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        full && "w-full",
        (disabled || loading) && "cursor-not-allowed opacity-60 active:translate-y-0",
        className,
      )}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

/* ── Card — white, 2px soft border, roomy, ambient depth ─────────────────── */

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn("prime-card rounded-2xl border-2 border-[#e5e5e5] bg-white", className)}
    >
      {children}
    </div>
  )
}

/* ── Flourish — the tri-tone underline beneath a hero heading ─────────────── */

/** R59 — pure decoration (aria-hidden): a 56px green→teal→gold underline
 *  that sweeps wide once on mount. The Duolingo-era equivalent of the
 *  editorial accent rule — flavor, never information. */
export function Flourish({ className }: { className?: string }) {
  return <span className={cn("prime-flourish", className)} aria-hidden />
}

/* ── Reveal — the below-fold scroll entrance ─────────────────────────────── */

/** R60 — closes the R59 motion debt: mount-time prime-rise only animates
 *  what's already on screen; sections further down arrived fully-formed.
 *  <Reveal> owns the entrance of below-fold sections instead: a 16px rise
 *  + fade, triggered once when the section scrolls ~12% into view, on the
 *  signature FLOW_EASE. Reduced motion → a plain div (content simply
 *  there). The holder carries .prime-reveal so the prime-rise CSS cascade
 *  opts it out (its forwards-fill would otherwise pin it visible).
 *
 * Use it directly under the facade root (a .prime-rise child) wrapping one
 * section; above-fold sections keep the mount cascade, below-fold sections
 * wait for the reader — the page keeps flowing as you scroll. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <div className={cn("prime-reveal", className)}>{children}</div>
    )
  }
  return (
    <motion.div
      className={cn("prime-reveal", className)}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.5, ease: FLOW_EASE, delay }}
    >
      {children}
    </motion.div>
  )
}

/* ── SectionLabel — the tiny gray uppercase label ────────────────────────── */

export function SectionLabel({
  right,
  className,
  children,
}: {
  right?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between px-1", className)}>
      {/* R67 — #8a8a8a (from #a3a3a3): the VLM/user "invisible text" verdict —
          section anchors earn one more darkness step (3.0:1 → 3.5:1) while
          staying quiet label-register; tint-only, zero copy change */}
      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a8a8a]">
        {children}
      </p>
      {right}
    </div>
  )
}

/* ── StatTile — big number hero with tiny label ──────────────────────────── */

export type Tone = "ink" | "green" | "gold" | "orange" | "teal" | "red"

const TONE_TEXT: Record<Tone, string> = {
  ink: "text-[#3c3c3c]",
  green: "text-[#58a700]",
  gold: "text-[#9a7500]",
  orange: "text-[#e08600]",
  teal: "text-[#0d9488]",
  red: "text-[#e64545]",
}

/** R67 — the tile backdrop: a very light tone-matched tint so snapshot
 *  rows read as soft color cards instead of colored numerals floating on
 *  white (the VLM "stat tiles with zero color" note). One way only: this
 *  Tailwind map — no CSS twin. Value colors (TONE_TEXT) stay as-is. */
const TONE_BG: Record<Tone, string> = {
  ink: "bg-[#f7f7f4]",
  green: "bg-[#f0f9e3]",
  gold: "bg-[#fff6d9]",
  orange: "bg-[#fff0dd]",
  teal: "bg-[#e6f7f4]",
  red: "bg-[#ffecec]",
}

/** R58 — the numeral that counts up to its target on mount, then glides on
 *  change. Facades remount per tab switch, so numbers flow in fresh each
 *  visit. R59 — a value change now GLIDES from the previous reading (a
 *  level-up or a fresh log slides the number, never a jarring reset).
 *  Reduced motion → the final formatted value immediately. */
function CountUpNum({ to }: { to: number }) {
  const reduce = useReducedMotion()
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    if (reduce) return
    const from = fromRef.current
    let raf = 0
    const t0 = performance.now()
    const DURATION = 700
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DURATION)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, reduce])

  if (reduce) return <>{fmt(to)}</>
  return <>{fmt(Math.round(val * 100) / 100)}</>
}

export function StatTile({
  value,
  countTo,
  label,
  tone = "ink",
  className,
  title,
}: {
  value: ReactNode
  /** R58 — pass the raw number to animate it counting up on mount. */
  countTo?: number | null
  label: string
  tone?: Tone
  className?: string
  title?: string
}) {
  const reduce = useReducedMotion()
  return (
    <div
      className={cn("min-w-0 rounded-xl px-3 py-2.5", TONE_BG[tone], className)}
      title={title}
    >
      <p
        className={cn(
          "truncate text-xl font-extrabold tabular-nums leading-tight md:text-2xl",
          TONE_TEXT[tone],
        )}
      >
        {countTo != null && !reduce ? <CountUpNum to={countTo} /> : value}
      </p>
      {/* R68 — #8f8f8f → #757575: the VLM flagged the 4-up tile labels
          (KCAL IN / READINESS) as high-severity invisible on tinted backdrops
          (#fff0dd etc.); one more darkness step buys ~4.3:1 while the label
          register stays quiet. Tint-only, zero copy change. */}
      <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wide text-[#757575]">
        {label}
      </p>
    </div>
  )
}

/* ── ProgressBar — thick, glossy, satisfying ─────────────────────────────── */

const TONE_FILL: Record<Tone, string> = {
  ink: "bg-[#afafaf]",
  // R67 — green earns the Apple-Rings gradient (lime→deep green); every
  // other tone stays solid. The ::before/::after pseudos ride the same
  // element — gloss + shine still work over a gradient fill.
  green: "bg-gradient-to-r from-[#61d905] to-[#3f9102]",
  gold: "bg-[#ffc800]",
  orange: "bg-[#ff9600]",
  teal: "bg-[#0faf9a]",
  red: "bg-[#ff4b4b]",
}

export function ProgressBar({
  value,
  target,
  tone = "green",
  className,
  label,
}: {
  value: number
  target: number
  tone?: Tone
  className?: string
  /** Visible "n / m" label on the right — omit for aria-only. */
  label?: boolean
}) {
  const reduce = useReducedMotion()
  const pct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0
  // R59 — the Apple Fitness "you're close" tell: a green bar at ≥90%
  // breathes a soft aura until it lands (pure box-shadow, reduce-guarded).
  const hot = tone === "green" && pct >= 90
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(value, target)}
        aria-label={label ? undefined : `${value} of ${target}`}
        className={cn(
          "h-3.5 flex-1 overflow-hidden rounded-full bg-[#d5d5cf]",
          hot && !reduce && "prime-bar-hot",
        )}
      >
        {/* R58 — the fill sweeps in from zero on mount (facades remount per
            tab switch, so bars fill fresh on every visit) and glides to new
            widths on change. The ::before shine (globals.css) rides once. */}
        <motion.div
          className={cn("prime-progress-fill h-full rounded-full", TONE_FILL[tone])}
          initial={reduce ? false : { width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.7, ease: FLOW_EASE }}
          style={{ width: `${pct}%` }}
        />
      </div>
      {label && (
        <p className="shrink-0 text-xs font-extrabold tabular-nums text-[#777]">
          {fmt(value)} / {fmt(target)}
        </p>
      )}
    </div>
  )
}

/* ── Chip — small tinted pill ────────────────────────────────────────────── */

const CHIP_TONES: Record<Tone, string> = {
  ink: "bg-[#f2f2ee] text-[#5c5c5c]",
  // R68 — green #46a302 → #2f7a00: measured 2.9:1 on the mint tint (VLM
  // flagged the awakening STEP chip); 4.8:1 now — the deepest green that
  // still reads as prime green.
  green: "bg-[#e8f8d8] text-[#2f7a00]",
  // R67 — #6b5200→#5c4300: the pale gold XP badges were VLM-flagged as
  // low contrast on their tint; same family, one step deeper.
  gold: "bg-[#fff4cc] text-[#5c4300]",
  orange: "bg-[#ffefdd] text-[#b26a00]",
  teal: "bg-[#d6f5f1] text-[#0d7d74]",
  red: "bg-[#ffe5e5] text-[#c63636]",
}

export function Chip({
  tone = "ink",
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold tabular-nums",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ── EmptyNote — friendly quiet empty state ──────────────────────────────── */

export function EmptyNote({ children }: { children: ReactNode }) {
  /* R68 — #afafaf (2.3:1) → #777 (4.7:1): empty states must read as copy,
      not ghost text (VLM "looks disabled" verdict on the Save row class). */
  return (
    <p className="rounded-xl bg-[#f7f7f4] px-4 py-3 text-sm font-semibold text-[#777]">
      {children}
    </p>
  )
}

/* ── TapRow — a full-width tappable row with a chevron ───────────────────── */

export function TapRow({
  icon,
  title,
  sub,
  right,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
}) {
  return (
    <button
      {...rest}
      className={cn(
        "group flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left",
        "transition-[background-color,transform] duration-150 hover:bg-[#f7f7f4] active:scale-[0.99]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
        className,
      )}
    >
      {icon && (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f7f7f4] transition-transform duration-200 ease-out group-hover:scale-105">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-[#3c3c3c]">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-xs font-semibold text-[#777]">{sub}</span>}
      </span>
      {right}
      {/* R68 — #a3a3a3 → #8a8a8a: affordance chevrons earn the section-anchor
          darkness floor; tint-only. */}
      <ChevronRight className="h-5 w-5 shrink-0 text-[#8a8a8a]" aria-hidden />
    </button>
  )
}

/* ── ShowEverything — the legacy deep-view expander ──────────────────────── */

/**
 * Merge & hide, materialized: the preserved legacy tab (built across 56
 * rounds) mounts behind this quiet expander — closed by default so the
 * facade stays super clean, one tap away when the full detail is wanted.
 * Content unmounts while closed (the R55 doctrine: clipped ≠ removed).
 */
export function ShowEverything({
  label = "Show everything",
  defaultOpen = false,
  children,
}: {
  label?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
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
        {label}
        <ChevronDown
          className={cn("h-5 w-5 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="legacy"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="legacy-surface mt-3 p-3 md:p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Skeleton — quiet loading sweep ──────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("prime-shimmer rounded-xl", className)} aria-hidden />
}
