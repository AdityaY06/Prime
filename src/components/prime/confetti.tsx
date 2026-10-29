"use client"

/**
 * R58 · FLOW — ConfettiBurst, the celebration workhorse.
 *
 * The Duolingo soul: moments of achievement get a physical burst. Zero new
 * visible characters — every piece is aria-hidden decoration on top of the
 * honest number the app already shows.
 *
 * Contract:
 *  - Parent holds `const [burst, setBurst] = useState(0)` and bumps it on the
 *    achievement (`setBurst((k) => k + 1)`); `<ConfettiBurst fire={burst} />`
 *    seeds a fresh piece-set each time `fire` INCREASES (0 = idle, never fires).
 *  - `origin` is a viewport percentage point — default is center-stage; a
 *    localized burst can pass where the action happened.
 *  - Pure derived render (no effects, no timers): each burst re-seeds via
 *    useMemo; spent pieces simply rest at opacity 0 until the next burst
 *    replaces them. Reduced motion → renders nothing at all (the toast still
 *    announces the reward textually).
 */

import { useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"

/** The PRIME celebration palette — green-led with gold, teal and warm sparks. */
const COLORS = ["#58cc02", "#89e219", "#ffc800", "#0faf9a", "#ff9600", "#ff4b4b"] as const

type Piece = {
  id: number
  color: string
  dx: number
  dy: number
  drop: number
  rot: number
  w: number
  h: number
  round: boolean
  dur: number
  delay: number
}

function seed(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = Math.random() * Math.PI * 2
    const power = 90 + Math.random() * 150
    return {
      id: i,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      dx: Math.cos(angle) * power,
      dy: Math.sin(angle) * power * 0.55 - 60, // bias upward — bursts rise, then fall
      drop: 180 + Math.random() * 220,
      rot: (Math.random() - 0.5) * 900,
      w: 6 + Math.random() * 4,
      h: 8 + Math.random() * 7,
      round: Math.random() < 0.3,
      dur: 0.85 + Math.random() * 0.45,
      delay: Math.random() * 0.08,
    }
  })
}

export function ConfettiBurst({
  fire,
  count = 26,
  origin = { x: 50, y: 42 },
}: {
  fire: number
  count?: number
  origin?: { x: number; y: number }
}) {
  const reduce = useReducedMotion()
  const pieces = useMemo(() => (fire > 0 ? seed(count) : []), [fire, count])

  if (reduce || pieces.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[95]"
      style={{ contain: "strict" }}
      aria-hidden
    >
      {pieces.map((p) => (
        <motion.span
          key={`${fire}-${p.id}`}
          className="absolute block"
          style={{
            left: `${origin.x}%`,
            top: `${origin.y}%`,
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            borderRadius: p.round ? "9999px" : "2px",
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: [0, p.dx * 0.55, p.dx],
            y: [0, p.dy, p.dy + p.drop],
            opacity: [1, 1, 0],
            rotate: p.rot,
          }}
          transition={{
            duration: p.dur,
            delay: p.delay,
            ease: [0.16, 0.84, 0.44, 1],
            times: [0, 0.38, 1],
          }}
        />
      ))}
    </div>
  )
}
