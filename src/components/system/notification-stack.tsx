"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Sparkles, Info, TriangleAlert, Crown } from "lucide-react"
import { SPRING_SNAPPY } from "@/components/system/motion"
import { useSystem } from "@/store/system-store"
import { cn } from "@/lib/utils"

/** R58-c light register — per-kind accents on white cards. `accent` tints
 *  the left bar, `progress` the auto-dismiss drain line, `text` the title;
 *  `iconClass` tints the glyph (xp carries the hero green #58cc02, the rest
 *  use their readable tone). */
const KIND = {
  xp: {
    icon: Sparkles,
    iconClass: "text-[#58cc02]",
    text: "text-[#46a302]",
    accent: "bg-[#58cc02]",
    progress: "bg-[#58cc02]",
  },
  info: {
    icon: Info,
    iconClass: "text-[#777]",
    text: "text-[#777]",
    accent: "bg-[#afafaf]",
    progress: "bg-[#afafaf]",
  },
  warn: {
    icon: TriangleAlert,
    iconClass: "text-[#b26a00]",
    text: "text-[#b26a00]",
    accent: "bg-[#ff9600]",
    progress: "bg-[#ff9600]",
  },
  title: {
    icon: Crown,
    iconClass: "text-[#9a7500]",
    text: "text-[#9a7500]",
    accent: "bg-[#ffc800]",
    progress: "bg-[#ffc800]",
  },
} as const

/** Floating system notifications, top-right.
 *
 * R16-c motion contract: entrance slides in from the right on SPRING_SNAPPY
 * (kit parity); dismissal exits upward-fade so leaving reads differently from
 * arriving; `layout` reflows the stack when a sibling unmounts. Reduced
 * motion → everything instant: notices mount at their final state, removal
 * is immediate and stack positions snap (structure preserved, zero motion).
 *
 * Width clamp note: w-[min(20rem,calc(100vw-1.5rem))] is arbitrary-value
 * Tailwind and is correct on disk — R16-c byte-verified it (an earlier
 * "w-in(…)" reading was a tooling display artifact, not file content).
 *
 * R58-c light restyle: toasts join the Duolingo-era register — white cards
 * with 2px #e5e5e5 borders and a soft neutral shadow (no sys-notice, no
 * grove chrome, no glow), per-kind accent bar / title / drain line, ink
 * base text, green focus ring. Bonus flow: the glyph pops once on mount
 * (spring keyframes, reduced-motion guarded). Width, position, count
 * behavior and copy are unchanged. */
export function NotificationStack() {
  const { notices, dismissNotice } = useSystem()
  const reduce = useReducedMotion()

  return (
    <div className="fixed right-3 top-3 z-[80] flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {notices.map((n) => {
          const k = KIND[n.kind]
          const Icon = k.icon
          return (
            <motion.button
              key={n.id}
              layout
              initial={reduce ? false : { opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
              transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
              onClick={() => dismissNotice(n.id)}
              className={cn(
                "relative flex items-start gap-3 overflow-hidden rounded-2xl border-2 border-[#e5e5e5] bg-white p-3 pl-4 text-left",
                "text-[#3c3c3c] shadow-[0_2px_12px_rgba(60,60,60,0.08)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]"
              )}
            >
              {/* thin left accent bar, colored per kind */}
              <span className={cn("absolute inset-y-0 left-0 w-[2px]", k.accent)} aria-hidden />
              {/* R58-c — one-shot glyph pop on mount; reduced motion → instant.
                  R58 E2E fix: a THREE-keyframe array with a spring transition
                  throws at runtime in framer-motion 12 ("only two keyframes
                  supported") and killed the whole toast+confetti commit —
                  now a two-value spring whose natural overshoot gives the
                  same pop. */}
              <motion.span
                key={n.id}
                initial={reduce ? false : { scale: 0.6 }}
                animate={{ scale: 1 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 20 }}
                className="mt-0.5 shrink-0"
              >
                <Icon className={cn("h-4 w-4", k.iconClass)} aria-hidden />
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-extrabold leading-tight", k.text)}>{n.title}</p>
                {n.body && <p className="mt-1 text-xs font-semibold leading-snug text-[#777]">{n.body}</p>}
              </div>
              {/* auto-dismiss progress line (visual only — removal stays in the store timer) */}
              <span className={cn("notice-progress absolute bottom-0 left-0 h-[2px] w-full", k.progress)} aria-hidden />
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
