"use client"

/**
 * R44 · PHASE C — the PRIME Gate (brief §04, "Reimagine the entry
 * experience").
 *
 * A cinematic full-viewport composition shown ONCE per browser session:
 * the PRIME lockup, the 3D centerpiece (gate-scene, lazy-loaded), an
 * oversized editorial headline, and ONE obvious primary action — ENTER.
 *
 * Product rules honored (brief §04/§11/§14):
 *  • Returning users may enter immediately: ENTER is visible from the
 *    first frame (no timed gate); Esc enters; the whole thing is skipped
 *    entirely for standalone PWA launches with an awakened profile
 *    (app-like behavior — logging a workout never waits on cinema).
 *  • sessionStorage marks the gate seen (once per tab session; resilient
 *    to private-mode throw via try/catch).
 *  • Reduced motion: the WebGL scene never mounts; a static CSS
 *    composition carries the identity; the enter transition is 140ms.
 *  • Progressive enhancement: the CSS composition renders instantly and
 *    stays beneath the scene as its loading placeholder; if WebGL is
 *    unavailable OR the scene module fails to load/throw, the CSS
 *    composition IS the experience (never a blank screen).
 *  • Honesty: the status line and the core's ignition reflect the real
 *    /api/hunter probe only — no fabricated state, no fake boot checks.
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { HunterDTO } from "@/lib/types"

const GateScene = dynamic(() => import("./gate-scene").then((m) => m.default), {
  ssr: false,
  loading: () => null,
})

const GATE_SEEN_KEY = "prime.gate.seen"

type Phase = "pending" | "show" | "entering" | "done"

export type PrimeGateProps = {
  hunter: HunterDTO | null
  loading: boolean
  notAwakened: boolean
}

/** If the WebGL scene throws (context loss, driver), it unmounts silently —
 *  the CSS composition beneath carries the experience. */
class GateSceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function PrimeGate({ hunter, loading, notAwakened }: PrimeGateProps) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>("pending")
  const pointer = useRef({ x: 0, y: 0 })
  const enterBtn = useRef<HTMLButtonElement>(null)

  /* ── WebGL capability — lazy probe (hydration-safe: the gate renders
   *    nothing pre-mount, so this value never affects SSR output) ───── */
  const [webgl] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null
    try {
      const c = document.createElement("canvas")
      return !!(c.getContext("webgl2") ?? c.getContext("webgl"))
    } catch {
      return false
    }
  })

  /* ── decision: show / skip — deferred one tick post-mount so the gate
   *    never SSRs (returning users must not flash it). sessionStorage is
   *    read once; standalone PWA + awakened profile skips straight to work. */
  useEffect(() => {
    if (phase !== "pending") return
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      let seen = false
      try {
        seen = sessionStorage.getItem(GATE_SEEN_KEY) === "1"
      } catch {
        seen = false
      }
      if (seen) {
        setPhase("done")
        return
      }
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false
      if (standalone && loading) return // decide when the probe lands
      if (standalone && hunter) {
        // installed-app launch with an awakened profile → straight to work
        setPhase("done")
        return
      }
      setPhase("show")
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [phase, loading, hunter])

  /* ── pointer parallax feed (window-level; Canvas never captures) ─────── */
  useEffect(() => {
    if (phase !== "show") return
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => window.removeEventListener("pointermove", onMove)
  }, [phase])

  const enter = useCallback(() => {
    if (phase !== "show") return
    setPhase("entering")
    try {
      sessionStorage.setItem(GATE_SEEN_KEY, "1")
    } catch {
      /* private mode — the gate simply may re-show next session */
    }
    window.setTimeout(() => setPhase("done"), reduce ? 140 : 700)
  }, [phase, reduce])

  /* Esc enters; scroll locked while the gate is up */
  useEffect(() => {
    if (phase !== "show") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") enter()
    }
    window.addEventListener("keydown", onKey)
    enterBtn.current?.focus({ preventScroll: true })
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, enter])

  useEffect(() => {
    const visible = phase === "show" || phase === "entering"
    document.body.style.overflow = visible ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [phase])

  const lowPower = useMemo(() => {
    if (typeof window === "undefined") return true
    const cores = navigator.hardwareConcurrency ?? 4
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false
    return cores <= 4 || coarse
  }, [])

  const sceneOn = webgl === true && !reduce
  const entering = phase === "entering"

  /* truthful status line — mirrors the real probe state */
  const status = loading
    ? { text: "ESTABLISHING LINK…", cls: "text-zinc-500" }
    : hunter
      ? {
          text: `HUNTER ${hunter.name.toUpperCase()} · ${hunter.rank}-RANK · LV ${hunter.level}`,
          cls: "text-violet-300",
        }
      : notAwakened
        ? { text: "NO HUNTER PROFILE — AWAKENING ON ENTRY", cls: "text-zinc-400" }
        : { text: "LINK UNSTABLE — ENTER TO RETRY", cls: "text-zinc-500" }

  if (phase === "pending" || phase === "done") return null

  return (
    <AnimatePresence>
      <motion.div
        key="prime-gate"
        role="dialog"
        aria-label="PRIME — entry"
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#060607]"
        style={{
          backgroundImage:
            "radial-gradient(1100px 700px at 82% -12%, rgba(139,92,246,0.08), transparent 60%), radial-gradient(900px 620px at -15% 108%, rgba(240,240,240,0.03), transparent 62%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {/* ── the CSS composition — instant paint, WebGL placeholder, fallback ── */}
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="relative -translate-y-[9%]">
            {/* aura */}
            <div
              className="gate-breathe absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(139,92,246,0.2) 0%, rgba(139,92,246,0.05) 45%, transparent 70%)",
              }}
            />
            {/* orbit rings — violet identity + teal data whisper */}
            <div className="absolute left-1/2 top-1/2 h-24 w-64 -translate-x-1/2 -translate-y-[34%] -rotate-[8deg] rounded-[9999px] border border-violet-300/25" />
            <div className="absolute left-1/2 top-1/2 h-16 w-80 -translate-x-1/2 translate-y-[6%] rotate-[5deg] rounded-[9999px] border border-teal-300/15" />
            {/* the monolith */}
            <div
              className="relative h-60 w-16 rounded-[5px] md:h-72 md:w-20"
              style={{
                background: "linear-gradient(105deg, #0b0b12 0%, #1a1430 46%, #0b0b12 100%)",
                boxShadow:
                  "inset 1.5px 0 0 rgba(196,181,253,0.16), inset -1.5px 0 0 rgba(0,0,0,0.65), 0 34px 90px rgba(0,0,0,0.55)",
              }}
            >
              {/* the seam — the core's pulse line */}
              <div
                className="absolute left-1/2 top-1/2 h-3/5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    "linear-gradient(180deg, transparent, #a78bfa 30%, #c4b5fd 50%, #a78bfa 70%, transparent)",
                  boxShadow: "0 0 12px rgba(167,139,250,0.75), 0 0 28px rgba(139,92,246,0.4)",
                }}
              />
            </div>
          </div>
        </div>

        {/* ── the WebGL scene — fades in over the composition when able ── */}
        {sceneOn && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <GateSceneBoundary>
              <GateScene ready={!!hunter} entered={entering} pointer={pointer} lowPower={lowPower} />
            </GateSceneBoundary>
          </motion.div>
        )}

        {/* ── cinematic chrome — local vignette + film grain over everything ── */}
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ background: "radial-gradient(118% 88% at 50% 42%, transparent 58%, rgba(0,0,0,0.55) 100%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 z-10 opacity-[0.07] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
          aria-hidden
        />

        {/* ── content — lockup above, headline + CTA in the lower third ── */}
        <motion.div
          className="relative z-20 flex h-full flex-col"
          animate={
            entering ? { opacity: 0, y: -20, scale: 1.03 } : { opacity: 1, y: 0, scale: 1 }
          }
          transition={
            reduce
              ? { duration: 0.14, ease: "easeOut" }
              : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
          }
        >
          {/* lockup */}
          <div
            className="gate-rise pt-[calc(env(safe-area-inset-top)+28px)] text-center"
            style={{ "--gate-delay": "0.05s" } as CSSProperties}
          >
            <p className="font-display text-[22px] font-semibold tracking-[0.34em] text-zinc-100">
              PRIME
            </p>
            <p className="mt-2 text-[9px] font-bold tracking-[0.3em] text-zinc-500">
              ADAPTIVE TRAINING SYSTEM
            </p>
          </div>

          {/* the scene owns the middle */}
          <div className="flex-1" aria-hidden />

          {/* headline + CTA */}
          <div className="mx-auto w-full max-w-xl px-6 pb-[calc(env(safe-area-inset-bottom)+30px)] text-center">
            <p
              className={`gate-rise text-[10px] font-bold tracking-[0.24em] ${status.cls}`}
              style={{ "--gate-delay": "0.18s" } as CSSProperties}
              role="status"
            >
              {status.text}
            </p>
            <h1
              className="gate-rise sys-display sys-display-md mt-4 text-zinc-50"
              style={{ "--gate-delay": "0.28s" } as CSSProperties}
            >
              Your next{" "}
              <em className="sys-italic font-normal text-violet-300">evolution</em>
              <br />
              starts here.
            </h1>
            <p
              className="gate-rise mt-4 text-sm leading-relaxed text-zinc-400"
              style={{ "--gate-delay": "0.38s" } as CSSProperties}
            >
              One system. Real training. Measurable progression.
            </p>

            <div
              className="gate-rise mt-8 flex flex-col items-center gap-5"
              style={{ "--gate-delay": "0.5s" } as CSSProperties}
            >
              <motion.button
                ref={enterBtn}
                type="button"
                onClick={enter}
                className="aura-glow aura-glow-violet pill-action group relative isolate rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060607]"
                whileHover={reduce ? undefined : { scale: 1.035 }}
                whileTap={{ scale: 0.955 }}
              >
                {/* rotating border-shine — a comet of light around the rim */}
                <span className="pointer-events-none absolute -inset-[1.5px] overflow-hidden rounded-full" aria-hidden>
                  <motion.span
                    className="absolute left-1/2 top-1/2 block h-[280%] w-[280%] -translate-x-1/2 -translate-y-1/2"
                    style={{
                      background:
                        "conic-gradient(from 0deg, transparent 0deg, rgba(196,181,253,0) 290deg, rgba(196,181,253,0.85) 328deg, rgba(255,255,255,0.95) 340deg, rgba(196,181,253,0) 360deg)",
                    }}
                    animate={reduce ? undefined : { rotate: 360 }}
                    transition={{ duration: 4.6, ease: "linear", repeat: Infinity }}
                  />
                </span>
                {/* the glass face */}
                <span
                  className="pointer-events-none absolute inset-0 rounded-full border border-violet-300/30 bg-gradient-to-b from-violet-400/15 via-[#0a0812]/85 to-violet-900/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-colors duration-300 group-hover:border-violet-300/50"
                  aria-hidden
                />
                <span className="relative z-[2] px-10 py-3.5 text-[13px] font-bold tracking-[0.16em] text-zinc-50">
                  ENTER PRIME
                </span>
              </motion.button>

              <p className="text-[9px] font-bold tracking-[0.26em] text-zinc-600">
                LOCAL-FIRST · YOUR DATA STAYS ON THIS DEVICE
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
