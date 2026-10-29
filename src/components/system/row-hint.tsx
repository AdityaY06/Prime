"use client"

// ─── PRIME · RowHint (R13-b · row-gesture discoverability — R42 whisper) ─────
// The row-level parallel of SwipeFlow's tab-level "swipe to navigate" chip:
// six-plus surfaces now speak SwipeRow (daily quests, fuel entries,
// milestones, PR rows, badge cards, raid plan blocks) but the row gesture
// had no discoverability layer. This chip teaches it once per session, per
// surface — then gets out of the way.
//
// Contract:
//  · Session-scoped: sessionStorage `prime-row-hint:{surface}` — stamped the
//    moment the chip renders, so one appearance per surface per session even
//    if the tab is left immediately or the session dies mid-hint.
//  · Client-only: null on the server and first paint; the effect flips
//    visibility post-hydration (zero hydration mismatch), and the chip is
//    position:fixed — its appearance can never shift layout. It renders via a
//    document.body portal: the tab content lives inside SwipeFlow's sheet,
//    whose permanent will-change-transform makes it the CONTAINING BLOCK for
//    fixed descendants — in-sheet, `bottom` would resolve against the full
//    content height (and ride the sheet during tab drags). Portaled out, the
//    chip anchors to the viewport exactly like .swipe-hint does from its
//    outside-the-sheet perch (same recipe, opposite direction).
//  · Auto-dismiss ~6s; tap/click dismiss with a ≥44px hit area (the visual
//    stays family-small; an invisible ::after pad grows the touch target).
//  · Dismiss the instant ANY row swipe engages on the page: a MutationObserver
//    on document.body — subtree + attributeFilter ["data-swipe-live"] — the
//    exact beat SwipeRow stamps on its root at engage. Chosen over watching
//    body.swiping because the TAB engine (SwipeFlow) raises that class too,
//    which would mis-dismiss this row-flavored hint; data-swipe-live is
//    written exclusively by SwipeRow (never a React-rendered attribute), so
//    the filtered observer only ever fires on genuine row engage/release
//    beats — effectively free, and it lives only while this surface mounts.
//    It also catches a row swipe during the pre-show delay: the user has
//    demonstrated the gesture, so the chip never appears.
//  · Reduced motion: never shows at all — SwipeRow stands down under
//    prefers-reduced-motion, so the gesture this chip teaches doesn't exist
//    there (the visible action buttons remain the path). The breathing
//    animation below therefore needs no separate guard — the node is never
//    mounted in that mode.
//  · R42 whisper pass: the old bordered glass block (border + 0.92 bg +
//    22px glow + float) is retired for a faint breath of text — 8px zinc-600
//    copy between two quiet chevrons, breathing its opacity on the shared
//    aura-breathe curve, over a barely-there dark pill so it stays legible
//    over busy lists. Mobile-only (md:hidden), same discreet perch above the
//    floating bottom capsule, same session/dismiss/observer machinery.

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"

const hintKey = (surface: string) => `prime-row-hint:${surface}`

export function RowHint({ surface }: { surface: string }) {
  const [visible, setVisible] = useState(false)
  const reduce = !!useReducedMotion()

  // one-time gate — stamp the key on show; the observer rides along for the
  // surface's lifetime so an early row swipe suppresses the chip pre-show
  useEffect(() => {
    if (reduce) return
    let seen = true
    try {
      seen = window.sessionStorage.getItem(hintKey(surface)) === "1"
    } catch {
      // storage unavailable — don't nag
    }
    if (seen) return
    try {
      window.sessionStorage.setItem(hintKey(surface), "1")
    } catch {
      // ignore
    }
    const show = window.setTimeout(() => setVisible(true), 600)
    const obs = new MutationObserver(() => {
      // any row swipe engaged — dismiss (idempotent pre-show: kills the timer)
      setVisible(false)
    })
    obs.observe(document.body, { subtree: true, attributeFilter: ["data-swipe-live"] })
    return () => {
      clearTimeout(show)
      obs.disconnect()
    }
  }, [surface, reduce])

  // while on screen: ~6s auto-hide (tap dismissal is the button's onClick)
  useEffect(() => {
    if (!visible) return
    const hide = window.setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(hide)
  }, [visible])

  if (!visible || reduce) return null
  // portal target is guaranteed here — `visible` only flips inside an effect,
  // long after document.body exists (never during SSR)
  return createPortal(
    <button
      type="button"
      className="fixed left-1/2 z-40 flex -translate-x-1/2 touch-manipulation items-center gap-1.5 rounded-full bg-[#0b0b0c]/60 px-3.5 py-2.5 backdrop-blur-sm md:hidden after:absolute after:-inset-x-3 after:-inset-y-2 after:content-[''] [animation:aura-breathe_5.2s_ease-in-out_infinite]"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 7.5rem)" }}
      onClick={() => setVisible(false)}
      aria-label="Dismiss hint — swipe list rows sideways to act on them"
    >
      <ChevronLeft className="h-3 w-3 text-zinc-500" aria-hidden />
      <span className="text-[8px] font-semibold tracking-wide text-zinc-500">swipe rows to act</span>
      <ChevronRight className="h-3 w-3 text-zinc-500" aria-hidden />
    </button>,
    document.body,
  )
}
