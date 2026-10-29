"use client"

// ─── PRIME · InfoHint (R52 — small pop-up meanings) ──────────────────────────
// The declutter primitive: gamification terms stay SHORT on screen ("XP",
// "Credits", "Power score") and their plain-language meaning lives behind a
// tiny "?" glyph — tap/hover opens a whisper-small glass popover with the
// glossary entry. One component, two modes:
//
//   <InfoHint term="xp" />               → glossary lookup (src/lib/glossary)
//   <InfoHint label="Custom" body="…" /> → one-off meaning
//
// Contract:
//  • inline-flex — sits on any label row without breaking baseline rhythm
//  • a real <button> (focusable, aria-expanded, aria-describedby → tooltip)
//  • the popover renders through a portal to document.body with FIXED
//    coordinates measured off the glyph — no parent overflow/rounded corner
//    can ever clip it, on any surface
//  • flips BELOW the glyph when there is not enough room above
//  • Escape + click-outside + re-tap all close; hover does NOT open on
//    touch-first devices (pointer: coarse) so mobile never spawns ghost
//    popovers during scroll
//  • reduced-motion: plain fade, no scale

import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary"
import { cn } from "@/lib/utils"

export function InfoHint({
  term,
  label,
  body,
  className,
}: {
  /** Glossary key — preferred mode (one source of truth for meanings). */
  term?: GlossaryKey
  /** One-off override title (used only when `body` is also given). */
  label?: string
  /** One-off override body. */
  body?: string
  className?: string
}) {
  const entry = term ? GLOSSARY[term] : { title: label ?? "", body: body ?? "" }
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)
  const reduce = useReducedMotion()
  const rootRef = useRef<HTMLSpanElement>(null)
  const tipId = useId()

  // measure the glyph → fixed popover coords (flip below when clipped).
  const place = () => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const POPOVER_W = 224 // w-56
    const POPOVER_H_EST = 96 // title + two lines + padding, generous
    let left = r.left
    // keep inside the viewport horizontally
    if (left + POPOVER_W > window.innerWidth - 8) left = window.innerWidth - POPOVER_W - 8
    if (left < 8) left = 8
    // prefer above; flip below when the top would clip
    const top = r.top > POPOVER_H_EST + 12 ? r.top - 8 - POPOVER_H_EST : r.bottom + 8
    setCoords({ left, top })
  }

  const openTip = () => {
    place()
    setOpen(true)
  }

  // Escape + click-outside close. One document listener while open only.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointer)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointer)
    }
  }, [open])

  // re-measure while open (scroll / resize keeps it glued to the glyph)
  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    window.addEventListener("scroll", onMove, true)
    window.addEventListener("resize", onMove)
    return () => {
      window.removeEventListener("scroll", onMove, true)
      window.removeEventListener("resize", onMove)
    }
  }, [open])

  // Hover-open only where a fine pointer exists (desktop).
  const finePointer =
    typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches

  if (!entry.title || !entry.body) return null

  return (
    <span ref={rootRef} className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`What is ${entry.title}?`}
        aria-describedby={open ? tipId : undefined}
        onClick={() => (open ? setOpen(false) : openTip())}
        onMouseEnter={finePointer ? openTip : undefined}
        onMouseLeave={finePointer ? () => setOpen(false) : undefined}
        onFocus={finePointer ? openTip : undefined}
        onBlur={() => setOpen(false)}
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold leading-none transition-colors",
          "border-zinc-700/70 bg-zinc-900/60 text-zinc-500",
          "hover:border-violet-400/60 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70",
          open && "border-violet-400/60 text-violet-300"
        )}
      >
        ?
      </button>
      {open &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.span
                id={tipId}
                role="tooltip"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.16 }}
                style={{ left: coords.left, top: coords.top }}
                className="fixed z-[70] block w-56 rounded-xl border border-violet-500/20 bg-zinc-950/95 p-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md"
              >
                <span className="block text-[10px] font-bold tracking-[0.12em] text-violet-300">
                  {entry.title.toUpperCase()}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-zinc-300">
                  {entry.body}
                </span>
              </motion.span>
            )}
          </AnimatePresence>,
          document.body
        )}
    </span>
  )
}
