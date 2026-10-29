"use client"

// ─── PRIME · Shared motion kit (R4 — Flow & Motion round) ─────────────────────
// One import for the app's flow language: staggered panel reveals, count-up
// numerals and hover/tap micro-interactions. `useReducedMotion` is honored
// centrally here — every consumer gets instant, static rendering for free.
// R9 additions: DecodeText (signature system-decrypt reveal), FlowReveal
// (scroll-triggered entrance), Magnetic (cursor-attracted controls) and
// shared spring presets.

import { useEffect, useRef, useState } from "react"
import {
  animate,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type MotionProps,
  type Variants,
} from "framer-motion"

/** Signature ease — easeOutQuint-ish, the "buttery" curve used app-wide. */
export const FLOW_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Orchestration container — staggers its FlowItem children on mount. */
export const flowGroupVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.03 } },
}

/** Rising item — fade + 14px rise on the signature ease. */
export const flowItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: FLOW_EASE } },
}

/**
 * Staggered flow container. Replaces a tab's root `space-y-*` div 1:1:
 * `<FlowGroup className="space-y-4 sm:space-y-5">…panels…</FlowGroup>`.
 * Children animate in sequence; late-mounted children join mid-flow.
 * Reduced motion → renders a plain div (no variants, no initial state).
 */
export function FlowGroup({ className, children, ...rest }: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <div className={className} {...(rest as React.ComponentPropsWithoutRef<"div">)}>
        {children as React.ReactNode}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      variants={flowGroupVariants}
      initial="hidden"
      animate="visible"
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * One rising panel inside a FlowGroup (wrap each SystemPanel / major block).
 * Inherits the parent's hidden→visible flow; safe standalone as well
 * (self-animates once on mount). Reduced motion → plain div.
 */
export function FlowItem({ className, children, ...rest }: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <div className={className} {...(rest as React.ComponentPropsWithoutRef<"div">)}>
        {children as React.ReactNode}
      </div>
    )
  }
  return (
    <motion.div className={className} variants={flowItemVariants} initial="hidden" animate="visible" {...rest}>
      {children}
    </motion.div>
  )
}

/** Hover lift + tap press for cards and list rows — spread onto motion.div. */
export const liftMotion: MotionProps = {
  whileHover: { y: -2, transition: { duration: 0.18, ease: FLOW_EASE } },
  whileTap: { scale: 0.985, transition: { duration: 0.1 } },
}

/** Tap press only — for interactive rows that shouldn't lift on hover. */
export const tapMotion: MotionProps = {
  whileTap: { scale: 0.98, transition: { duration: 0.1 } },
}

// ─── R9 · spring presets ─────────────────────────────────────────────────────
/** Snappy spring — nav indicators, chips, small UI settling. */
export const SPRING_SNAPPY = { type: "spring", stiffness: 420, damping: 32 } as const
/** Softer spring — larger surfaces, panel releases, drag springs. */
export const SPRING_SOFT = { type: "spring", stiffness: 260, damping: 26 } as const
// ─── R14 · flow round additions ───────────────────────────────────────────────
/** Overshoot spring — celebratory pops: claim blooms, badge reveals, value
 *  settles. Slight overshoot (~4%) reads as physical, never bouncy. */
export const SPRING_BOUNCE = { type: "spring", stiffness: 480, damping: 24, mass: 0.9 } as const

/**
 * Animated meter fill — mounts from 0% and eases to `pct` on the signature
 * curve; later `pct` changes glide on the same curve. The drop-in replacement
 * for the static `width: pct%` + CSS-transition pattern (XP rail, quest
 * meters, macro bars). Mounts replay on tab re-entry — content flows in on
 * every visit, mirroring the activity-ring arc sweep. Reduced motion → plain
 * div at final width.
 *
 * `inView: true` swaps the mount sweep for a whileInView trigger (fires once,
 * ~8% into the viewport) — for meters that live BELOW the fold inside a
 * FlowReveal, so the sweep waits for the reader instead of firing while the
 * row is still invisible. Inline props (never `variants`) keep it immune to
 * FlowGroup variant propagation in both modes.
 */
export function MeterFlow({
  pct,
  className,
  style,
  duration = 0.8,
  inView = false,
  ...rest
}: React.ComponentPropsWithoutRef<"div"> & {
  pct: number
  duration?: number
  inView?: boolean
}) {
  const reduce = useReducedMotion()
  const clamped = Math.min(100, Math.max(0, pct))
  if (reduce) {
    return <div className={className} style={{ width: `${clamped}%`, ...style }} {...rest} />
  }
  if (inView) {
    return (
      <motion.div
        className={className}
        style={style}
        initial={{ width: "0%" }}
        whileInView={{ width: `${clamped}%` }}
        viewport={{ once: true, margin: "-8% 0px" }}
        transition={{ duration, ease: FLOW_EASE }}
        {...(rest as HTMLMotionProps<"div">)}
      />
    )
  }
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ width: "0%" }}
      animate={{ width: `${clamped}%` }}
      transition={{ duration, ease: FLOW_EASE }}
      {...(rest as HTMLMotionProps<"div">)}
    />
  )
}

/**
 * Spring pop-in — one-shot scale reveal for celebratory mounts (reward rows,
 * badge cards, unlocked panels). Overshoots ~4% on SPRING_BOUNCE so reveals
 * land physically. Keys stay stable across refreshes → pops replay only on
 * genuine mounts. Reduced motion → plain div.
 */
export function PopIn({
  className,
  children,
  delay = 0,
  ...rest
}: HTMLMotionProps<"div"> & { delay?: number }) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <div className={className} {...(rest as React.ComponentPropsWithoutRef<"div">)}>
        {children as React.ReactNode}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...SPRING_BOUNCE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * One-shot celebration breathe — imperative scale pulse for LIVE completion
 * moments (a ring crossing 100%, a gate breaking through, a meter filling on
 * camera). Fire-and-forget: `pulseBreathe(el)` on the surface element; it
 * scales up `scale` and settles back on the signature ease. The caller MUST
 * gate on `useReducedMotion()` — imperative code cannot read the hook.
 */
export function pulseBreathe(
  el: HTMLElement,
  scale = 1.02,
  duration = 0.45,
): Promise<void> {
  return animate(el, { scale: [1, scale, 1] }, { duration, ease: FLOW_EASE })
    .then(() => undefined)
    .catch(() => undefined)
}

// ─── R9 · DecodeText — the signature editorial flipboard reveal ───────────
// R43 studio register: headers settle through a LETTER pool (flipboard/
// typesetting feel) instead of the retired glitch-glyph pool — same motion
// contract, zero sci-fi.
const DECODE_POOL = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/**
 * Text that settles into existence — random letters resolve left-to-right
 * over ~0.7s, like a studio flipboard. The app's signature entrance for
 * section headers and hero labels. Reduced motion (or `instant`) → static
 * text. Screen readers get the real string via sr-only; the animated glyphs
 * are aria-hidden.
 */
export function DecodeText({
  text,
  className,
  delay = 0,
  as: Tag = "span",
}: {
  text: string
  className?: string
  delay?: number
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div"
}) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? text : "")

  useEffect(() => {
    if (reduce) return
    let raf = 0
    const t0 = performance.now() + delay * 1000
    const DURATION = 700
    const tick = (t: number) => {
      const elapsed = t - t0
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick)
        return
      }
      const p = Math.min(1, elapsed / DURATION)
      // resolve front portion; tail is still scrambled noise
      const solved = Math.floor(p * text.length)
      let out = text.slice(0, solved)
      for (let i = solved; i < text.length; i++) {
        const ch = text[i]
        out += ch === " " ? " " : DECODE_POOL[Math.floor(Math.random() * DECODE_POOL.length)]
      }
      setShown(out)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, delay, reduce])

  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{reduce ? text : shown}</span>
    </Tag>
  )
}

// ─── R9 · FlowReveal — scroll-triggered entrance for deep panels ──────────────
// NOTE: deliberately uses NO `variants` prop — a variant child inside a
// FlowGroup (animate="visible") inherits the label via framer-motion variant
// propagation and would self-reveal on mount, silently defeating whileInView.
// Inline initial/whileInView props keep it self-controlled everywhere.

/**
 * Reveals its children once when scrolled ~12% into the viewport. For panels
 * below the fold — the page keeps moving as you read. Reduced motion → the
 * children render instantly (plain div, no initial state).
 */
export function FlowReveal({ className, children, ...rest }: HTMLMotionProps<"div">) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <div className={className} {...(rest as React.ComponentPropsWithoutRef<"div">)}>
        {children as React.ReactNode}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0, transition: { duration: 0.55, ease: FLOW_EASE } }}
      viewport={{ once: true, margin: "-12% 0px" }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

// ─── R9 · Magnetic — cursor-attracted control wrapper ─────────────────────────
/**
 * Wraps a control and gently pulls it toward the cursor while hovered
 * (max ~6px, spring-settled). For primary buttons and the FAB only —
 * everywhere else it would be noise. Reduced motion → passthrough div.
 */
export function Magnetic({
  className,
  children,
  strength = 0.28,
  ...rest
}: HTMLMotionProps<"div"> & { strength?: number }) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <div className={className} {...(rest as React.ComponentPropsWithoutRef<"div">)}>
        {children as React.ReactNode}
      </div>
    )
  }
  return (
    <motion.div
      className={className}
      onPointerMove={(e) => {
        const el = e.currentTarget as HTMLElement
        const r = el.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`
      }}
      onPointerLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = ""
      }}
      style={{ transition: "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)" }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/**
 * Animated numeral — mounts from 0 (or the previous value on update) and
 * eases to `to`. Returns the live value; render it with tabular-nums.
 * Reduced motion → returns `to` immediately.
 */
export function useCountUp(to: number, duration = 0.8): number {
  const reduce = useReducedMotion()
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    if (reduce) return
    const from = fromRef.current
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / (duration * 1000))
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, duration, reduce])

  return reduce ? to : val
}
