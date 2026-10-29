"use client"

// ─── PRIME · SwipeRow (R10 Tactile Flow · R11-a rose tone · R49-a studio) ────
// Row-level swipe-to-act: the content-level extension of the R9 tab ring.
// Drag a row sideways and its action reveals underneath — a tone rail grows
// from the leading edge and the action label resolves as the commit point
// draws near. Release past the threshold (or with velocity) and `onCommit`
// fires; otherwise the row springs home.
//
// R49-a studio pass (chrome-only): the R10 HUD reveal — hard-edged
// saturated rail over a bare surface — now speaks the R43-R45 aurora
// language: a vertical tone filament with dissolved ends, a low-alpha tone
// wash across the reveal area, a two-layer commit bloom, studio radius. The
// gesture engine (refs · paint · release · pointer handlers · thresholds)
// is byte-identical to R10.
//
// Interaction contract (mirrors SwipeFlow's, so the two compose):
//  · The root carries `data-no-swipe` — the tab-level engine stands down the
//    moment a drag starts inside a row (its ancestor walk finds the marker),
//    so row swipes never navigate tabs and tab swipes never drag rows.
//  · `touch-action: pan-y` — vertical scrolling stays native (pointercancel
//    bails cleanly); horizontal drags arrive as pointermove.
//  · Engage on horizontal dominance (|dx| > 12px and > 1.3×|dy|) — vertical
//    intent bails first, always.
//  · Finger-follow 1:1 up to ±96px, rubber-banded (35%) beyond, capped ±160.
//  · Commit at |offset| > 64px or velocity > 0.5 px/ms; a committed swipe
//    suppresses the trailing click so the row's own buttons never fire.
//  · data-swipe-live rides the root for exactly the duration of the gesture
//    (set at engage, cleared on release/pointercancel) — the CSS hook that
//    lets the row's own identity classes react while the finger holds it
//    (.sys-accent-row[data-swipe-live] + the milestone blade pulses, R12-c).
//  · Reduced motion / `enabled={false}` — no gesture at all; the visible
//    action button inside the row remains the accessible path (44px+).

import { useEffect, useRef } from "react"
import { animate, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { SPRING_SOFT } from "@/components/system/motion"

export type SwipeRowAction = {
  /** Glyph shown in the rail — lucide icon component. */
  icon: React.ComponentType<{ className?: string }>
  /** Mono label that resolves as the commit point nears — "CLAIM", "VERIFY", "DELETE". */
  label: string
  /** Rail + label tone. emerald = claim/reward, violet = verify/neutral,
   *  rose = destructive/delete (the app-wide danger semantic — X-button
   *  hovers and error borders already speak rose). */
  tone: "emerald" | "violet" | "rose"
}

// R49-a — the rail is a vertical aurora filament (see .aurora-fill-* in
// globals.css for the horizontal siblings): luminous light-tone core
// flowing into the deep base tone, both ends dissolved — the studio
// hairline voice, rotated 90°.
const TONE_RAIL: Record<SwipeRowAction["tone"], string> = {
  emerald: "linear-gradient(180deg, rgba(52,211,153,0) 0%, rgba(52,211,153,.95) 26%, rgba(16,185,129,.72) 74%, rgba(16,185,129,0) 100%)",
  violet: "linear-gradient(180deg, rgba(167,139,250,0) 0%, rgba(167,139,250,.95) 26%, rgba(139,92,246,.72) 74%, rgba(139,92,246,0) 100%)",
  rose: "linear-gradient(180deg, rgba(251,113,133,0) 0%, rgba(251,113,133,.95) 26%, rgba(244,63,94,.72) 74%, rgba(244,63,94,0) 100%)",
}
// Same hues as R10, plus the soft glyph halo that helps the 9px label
// resolve against the wash as the commit point nears.
const TONE_TEXT: Record<SwipeRowAction["tone"], string> = {
  emerald: "text-emerald-300 drop-shadow-[0_0_7px_rgba(52,211,153,.45)]",
  violet: "text-violet-300 drop-shadow-[0_0_7px_rgba(167,139,250,.45)]",
  rose: "text-rose-300 drop-shadow-[0_0_7px_rgba(251,113,133,.45)]",
}
// Commit bloom — the aurora glow construction (wide tone breath + tight
// light core) scaled up a notch for the threshold moment.
const TONE_GLOW: Record<SwipeRowAction["tone"], string> = {
  emerald: "0 0 18px rgba(52,211,153,.42), 0 0 5px rgba(110,231,183,.55)",
  violet: "0 0 18px rgba(167,139,250,.42), 0 0 5px rgba(196,181,253,.55)",
  rose: "0 0 18px rgba(251,113,133,.42), 0 0 5px rgba(253,164,175,.55)",
}
// R49-a reveal wash — the tone's ambient field across the reveal area:
// strongest at the leading edge, dissolving into the surface. Static chrome
// (never painted — the opaque sheet covers it at rest, so its unveiling IS
// the reveal), zero cost per frame.
const TONE_WASH: Record<SwipeRowAction["tone"], string> = {
  emerald: "linear-gradient(90deg, rgba(16,185,129,.15) 0%, rgba(16,185,129,.05) 36%, transparent 64%)",
  violet: "linear-gradient(90deg, rgba(139,92,246,.15) 0%, rgba(139,92,246,.05) 36%, transparent 64%)",
  rose: "linear-gradient(90deg, rgba(244,63,94,.15) 0%, rgba(244,63,94,.05) 36%, transparent 64%)",
}

const FOLLOW_LIMIT = 96 // 1:1 follow up to here…
const RESIST = 0.35 // …then rubber-band
const CAP = 160 // absolute clamp
const COMMIT_OFFSET = 64 // release past this → commit
const COMMIT_VELOCITY = 0.5 // …or flick faster than this (px/ms)

export function SwipeRow({
  action,
  onCommit,
  enabled = true,
  className,
  style,
  children,
  ...rest
}: Omit<React.ComponentPropsWithoutRef<"div">, "children" | "style"> & {
  action: SwipeRowAction
  onCommit: () => void
  /** Gesture off (claimed rows, busy rows, reduced motion). */
  enabled?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const reduce = !!useReducedMotion()
  const live = enabled && !reduce

  const rootRef = useRef<HTMLDivElement>(null)

  // R49 orchestrator fix — unmount safety. Discovered LIVE during the R49
  // gesture E2E: a Fast Refresh remount mid-drag orphaned the gesture
  // (pointerup can never reach a detached node) and body.swiping — an
  // app-wide drag lock — stayed stuck. Production can hit the same path via
  // any tree swap that replaces the row mid-gesture. Cheap belt-and-braces:
  // if this instance unmounts while engaged, the lock dies with it.
  useEffect(
    () => () => {
      document.body.classList.remove("swiping")
    },
    []
  )
  const sheetRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const iconRef = useRef<HTMLSpanElement>(null)

  // gesture bookkeeping (refs — zero re-render per pointermove)
  const ptr = useRef<{ id: number; x0: number; y0: number; lx: number; lt: number } | null>(null)
  const engaged = useRef(false)
  const offset = useRef(0)
  const velocity = useRef(0)

  const paint = (off: number) => {
    offset.current = off
    const sheet = sheetRef.current
    if (sheet) sheet.style.transform = `translate3d(${off}px, 0, 0)`
    // reveal layer: rail grows + brightens with drag; label resolves past
    // the halfway mark of the commit point and blooms at the threshold
    const p = Math.min(1, Math.abs(off) / COMMIT_OFFSET)
    if (railRef.current) {
      railRef.current.style.opacity = String(0.25 + p * 0.75)
      railRef.current.style.boxShadow = p > 0.92 ? TONE_GLOW[action.tone] : "none"
    }
    if (labelRef.current) labelRef.current.style.opacity = String(Math.max(0, (p - 0.25) / 0.6))
    if (iconRef.current) iconRef.current.style.transform = `scale(${0.9 + p * 0.25})`
  }

  const release = (commit: boolean) => {
    if (!engaged.current) return
    engaged.current = false
    document.body.classList.remove("swiping")
    // the engage hook dies with the gesture — commit, spring-home and
    // pointercancel all funnel through here
    delete rootRef.current?.dataset.swipeLive
    if (commit) {
      // suppress the trailing click — the swipe was the interaction
      const kill = (e: Event) => {
        e.stopPropagation()
        e.preventDefault()
      }
      document.addEventListener("click", kill, { capture: true, once: true })
      setTimeout(() => document.removeEventListener("click", kill, { capture: true }), 320)
    }
    paint(0)
    if (sheetRef.current) {
      animate(sheetRef.current, { x: 0 }, { ...SPRING_SOFT, duration: 0.38 })
    }
    if (commit) onCommit()
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!live || ptr.current) return
    if (e.button !== 0 && e.pointerType === "mouse") return
    ptr.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, lt: performance.now() }
    velocity.current = 0
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ptr.current
    if (!p || p.id !== e.pointerId) return
    const dx = e.clientX - p.x0
    const dy = e.clientY - p.y0

    if (!engaged.current) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        ptr.current = null // vertical intent — let the page scroll
        return
      }
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        engaged.current = true
        document.body.classList.add("swiping")
        // swipe-engage identity hook — the row's own classes light up while
        // held (see the header note)
        if (rootRef.current) rootRef.current.dataset.swipeLive = "1"
        try {
          rootRef.current?.setPointerCapture(e.pointerId)
        } catch {
          // capture is best-effort — the root may have unmounted mid-gesture
        }
      } else {
        return
      }
    }

    const now = performance.now()
    const dt = now - p.lt
    if (dt > 0) velocity.current = (e.clientX - p.lx) / dt
    p.lx = e.clientX
    p.lt = now

    // 1:1 finger-follow to ±96px, rubber-banded beyond, clamped ±160
    const sign = Math.sign(dx)
    const mag = Math.abs(dx)
    const off =
      mag <= FOLLOW_LIMIT
        ? dx
        : sign * Math.min(CAP, FOLLOW_LIMIT + (mag - FOLLOW_LIMIT) * RESIST)
    paint(off)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ptr.current
    if (!p || p.id !== e.pointerId) return
    ptr.current = null
    if (!engaged.current) return
    const commit =
      Math.abs(offset.current) > COMMIT_OFFSET || Math.abs(velocity.current) > COMMIT_VELOCITY
    release(commit)
  }

  const onPointerCancel = () => {
    ptr.current = null
    release(false)
  }

  const Icon = action.icon

  return (
    <div
      ref={rootRef}
      data-no-swipe
      className={cn("relative", className)}
      // pan-y is re-asserted after the consumer's style so vertical scrolling
      // stays native even when a caller spreads its own style object
      style={{ touchAction: "pan-y", ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDragStart={(e) => e.preventDefault()}
      {...rest}
    >
      {/* reveal layer — the action underneath, lit by drag distance. A RIGHT
          swipe slides the sheet away to reveal this at the LEFT edge.
          R49-a studio skin: a low-alpha tone wash gives the reveal area depth
          behind the aurora filament rail; every dynamic bit stays
          paint()-owned (rail opacity + commit bloom, label resolve, icon
          scale) — the wash is static chrome, never painted. */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-start overflow-hidden rounded-xl"
        aria-hidden
      >
        {/* tone wash — the reveal's ambient field, strongest at the leading
            edge and dissolving into the surface; the opaque sheet covers it
            at rest, so its unveiling IS the reveal */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: TONE_WASH[action.tone] }}
        />
        <div className="flex h-full items-center gap-3 pl-7 pr-5">
          <span ref={iconRef} className={cn("inline-flex", TONE_TEXT[action.tone])}>
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span
            ref={labelRef}
            className={cn("sys-label text-[9px] opacity-0 transition-none", TONE_TEXT[action.tone])}
          >
            {action.label}
          </span>
          {/* the tone filament — a vertical aurora hairline at the leading
              edge; paint() ramps its opacity with drag distance and blooms
              the two-layer glow at the commit threshold */}
          <div
            ref={railRef}
            className="absolute inset-y-0 left-0 w-1 rounded-full opacity-25"
            style={{ background: TONE_RAIL[action.tone] }}
          />
        </div>
      </div>

      {/* the row itself — imperatively translated */}
      <div ref={sheetRef} className="relative will-change-transform">
        {children}
      </div>
    </div>
  )
}
