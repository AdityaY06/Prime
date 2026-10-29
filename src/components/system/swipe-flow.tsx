"use client"

// ─── PRIME · SwipeFlow (R9 — Flow & Identity round) ───────────────────────────
// Gesture navigation for the tab ring: drag the main region horizontally to
// travel between tabs (with a finger-following rubber-band, edge glow and a
// directional page transition on release). Arrow keys do the same on desktop.
//
// Interaction contract:
//  · Engage only on clear horizontal dominance (|dx| > 14px and > 1.35×|dy|)
//    — vertical scrolling wins, always.
//  · Gestures starting inside [data-no-swipe] or inside an element that can
//    actually scroll sideways (scrollWidth > clientWidth) are left alone —
//    date strips, heatmaps, drill-down tables keep their own pan.
//  · Commit when |offset| > 84px or velocity > 0.55 px/ms; otherwise spring
//    back. A committed drag suppresses the trailing click so nothing logs by
//    accident.
//  · Reduced motion: navigation still works (it is structure, not decoration)
//    but there is no finger-follow offset — release simply flips the tab.

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { animate, useReducedMotion } from "framer-motion"
import { TAB_ORDER, useSystem, type Tab } from "@/store/system-store"
import { SPRING_SOFT } from "@/components/system/motion"

const HINT_KEY = "prime-swipe-hint"

// ─── R12-b — per-tab ghost silhouettes ────────────────────────────────────────
// The deep-drag wireframe behind the ghost numeral echoes the REAL destination
// tab's top-of-page composition (hero card, chart panel, 2-up tiles, meter
// strip, row list…) rather than an abstract 3-panel stack. Widths in rem,
// heights in px — honest but restrained: this is a faint wireframe ghosting
// through, not a mockup.
type GhostPanel = { w: number; h: number }
type GhostRow = { panels: GhostPanel[] } // 1-2 panels per row

const TAB_GHOST: Record<Tab, GhostRow[]> = {
  // R57 facades — clean-era silhouettes: greeting, level card, quest list,
  // snapshot tiles; the deep-drag wireframe stays honest to the new register.
  home: [
    { panels: [{ w: 8, h: 44 }] },
    { panels: [{ w: 9, h: 76 }] },
    { panels: [{ w: 9, h: 168 }] },
    { panels: [{ w: 4.25, h: 96 }, { w: 4.25, h: 96 }] },
  ],
  train: [
    { panels: [{ w: 9, h: 108 }] },
    { panels: [{ w: 9, h: 56 }] },
    { panels: [{ w: 9, h: 132 }] },
  ],
  log: [
    { panels: [{ w: 9, h: 88 }] },
    { panels: [{ w: 9, h: 88 }] },
    { panels: [{ w: 9, h: 88 }] },
  ],
  stats: [
    { panels: [{ w: 9, h: 76 }] },
    { panels: [{ w: 9, h: 104 }] },
    { panels: [{ w: 9, h: 132 }] },
  ],
  // R70-a science facade — hero + standfirst → 2-up digest tiles → registry rows
  science: [
    { panels: [{ w: 8, h: 44 }] },
    { panels: [{ w: 4.25, h: 56 }, { w: 4.25, h: 56 }] },
    { panels: [{ w: 9, h: 96 }] },
  ],
  you: [
    { panels: [{ w: 9, h: 116 }] },
    { panels: [{ w: 4.25, h: 56 }, { w: 4.25, h: 56 }] },
  ],
  // 01 OPERATOR hunter hero card → activity rings panel → 2-up stat tiles → meter strip
  status: [
    { panels: [{ w: 9, h: 56 }] },
    { panels: [{ w: 7.75, h: 34 }] },
    { panels: [{ w: 3.9, h: 34 }, { w: 3.9, h: 34 }] },
    { panels: [{ w: 6.5, h: 12 }] },
  ],
  // full-width swipeable quest rows → progress line
  directives: [
    { panels: [{ w: 7.5, h: 40 }] },
    { panels: [{ w: 6.75, h: 40 }] },
    { panels: [{ w: 5.5, h: 9 }] },
  ],
  // the plan / boss banner → twin gate cards → gate progress strip
  gates: [
    { panels: [{ w: 8, h: 46 }] },
    { panels: [{ w: 7.25, h: 46 }] },
    { panels: [{ w: 5.75, h: 10 }] },
  ],
  // biomass hero (numeral + micro-stats) → atlas chart panel → metric rows
  body: [
    { panels: [{ w: 5.5, h: 40 }] },
    { panels: [{ w: 8, h: 60 }] },
    { panels: [{ w: 6.5, h: 22 }] },
    { panels: [{ w: 5.25, h: 22 }] },
  ],
  // calorie ring block → macro bars → water row
  fuel: [
    { panels: [{ w: 3.25, h: 52 }] },
    { panels: [{ w: 5.75, h: 10 }] },
    { panels: [{ w: 4.75, h: 10 }] },
    { panels: [{ w: 6.5, h: 14 }] },
  ],
  // readiness banner → signal tiles → zone row
  vitals: [
    { panels: [{ w: 7.5, h: 44 }] },
    { panels: [{ w: 3.9, h: 30 }, { w: 3.9, h: 30 }] },
    { panels: [{ w: 6.25, h: 26 }] },
  ],
  // XP-flow chart (wide, tall) → totals tiles → archive rows
  records: [
    { panels: [{ w: 8.25, h: 60 }] },
    { panels: [{ w: 3.9, h: 30 }, { w: 3.9, h: 30 }] },
    { panels: [{ w: 7, h: 24 }] },
    { panels: [{ w: 5.75, h: 24 }] },
  ],
  // rewards-shop header → perk cards
  forge: [
    { panels: [{ w: 8.25, h: 44 }] },
    { panels: [{ w: 7.5, h: 40 }] },
    { panels: [{ w: 6.25, h: 40 }] },
  ],
  // off-ring sub-view — never a drag destination; entry exists only so the
  // Record<Tab, …> lookup stays total (type completeness, not design)
  titles: [
    { panels: [{ w: 3.9, h: 30 }, { w: 3.9, h: 30 }] },
    { panels: [{ w: 3.9, h: 30 }, { w: 3.9, h: 30 }] },
    { panels: [{ w: 5.5, h: 12 }] },
  ],
}

/** Descending wireframe edge alpha per row index (0.18 / 0.13 / 0.09) — a
 *  hand-rolled stand-in for the CSS nth-child border fade, which no longer
 *  matches reliably once rows wrap sets. Inline borderColor beats the class. */
const GHOST_EDGE = ["rgba(110, 231, 183, 0.18)", "rgba(110, 231, 183, 0.13)", "rgba(110, 231, 183, 0.09)"] as const

/** R13-b — hero-zone edge: panel 0 of row 0 in every silhouette set is the
 *  destination tab's identity panel (hunter card, plan banner, XP chart…) —
 *  held brighter than the descending fade so the tab reads at a glance mid-
 *  drag. Same violet family, higher alpha, plus a whisper-faint fill and a
 *  2px leading-edge notch (inset shadow — paint-only, echoing the app's
 *  left-spine row language). All other rows keep the 0.18/0.13/0.09 fade. */
const GHOST_HERO_EDGE = "rgba(110, 231, 183, 0.32)"
const GHOST_HERO_FILL = "rgba(110, 231, 183, 0.05)"
const GHOST_HERO_NOTCH = "inset 2px 0 0 rgba(110, 231, 183, 0.4)"

/** Can the drag target's ancestor chain consume a horizontal pan itself? */
function guardedByScroller(el: HTMLElement | null, root: HTMLElement | null): boolean {
  let n: HTMLElement | null = el
  while (n && n !== root) {
    if (n.dataset.noSwipe !== undefined) return true
    const o = getComputedStyle(n).overflowX
    if ((o === "auto" || o === "scroll") && n.scrollWidth > n.clientWidth + 1) return true
    n = n.parentElement
  }
  return false
}

export function SwipeFlow({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion()
  const tab = useSystem((s) => s.tab)
  const goTab = useSystem((s) => s.goTab)
  const rootRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const glowLRef = useRef<HTMLDivElement>(null)
  const glowRRef = useRef<HTMLDivElement>(null)
  // R10 — peek ghost: the destination tab's identity, lit at the leading edge
  const ghostRef = useRef<HTMLDivElement>(null)
  const ghostNumRef = useRef<HTMLSpanElement>(null)
  const ghostNameRef = useRef<HTMLSpanElement>(null)
  // R11 — ghost depth: a faint wireframe of the destination tab's panels,
  // surfacing behind the numeral once the drag runs deep (>~55px).
  // R12-b — the wireframe is per-tab: one silhouette set per ring tab,
  // echoing that tab's real top-of-page composition; paint() shows exactly
  // one set at a time (tracked here, swapped only on target change).
  const ghostPanelsRef = useRef<HTMLDivElement>(null)
  const shownSetRef = useRef<Tab | null>(null)

  // gesture bookkeeping (refs — no re-render per pointermove)
  const ptr = useRef<{ id: number; x0: number; y0: number; lx: number; lt: number } | null>(null)
  const engaged = useRef(false)
  const applied = useRef(0)
  const velocity = useRef(0)

  const [hintVisible, setHintVisible] = useState(false)
  const [dragging, setDragging] = useState(false)

  const tabIndex = TAB_ORDER.indexOf(tab)
  const hasPrev = tabIndex > 0
  const hasNext = tabIndex !== -1 && tabIndex < TAB_ORDER.length - 1

  // one-time onboarding chip (mobile; appears briefly after mount, dismissed
  // on first swipe or auto-hides — deferred so hydration never sees it)
  useEffect(() => {
    let seen = false
    try {
      seen = window.sessionStorage.getItem(HINT_KEY) === "1"
    } catch {
      // storage unavailable — don't nag
      seen = true
    }
    if (seen) return
    const show = setTimeout(() => setHintVisible(true), 450)
    const hide = setTimeout(() => setHintVisible(false), 5600)
    return () => {
      clearTimeout(show)
      clearTimeout(hide)
    }
  }, [])

  const dismissHint = () => {
    setHintVisible(false)
    try {
      window.sessionStorage.setItem(HINT_KEY, "1")
    } catch {
      // ignore
    }
  }

  const paint = (offset: number, glow: number) => {
    applied.current = offset
    if (sheetRef.current && !reduce) sheetRef.current.style.transform = `translate3d(${offset}px, 0, 0)`
    if (glowLRef.current) glowLRef.current.style.opacity = String(glow)
    if (glowRRef.current) glowRRef.current.style.opacity = String(glow)
    // R10 — peek ghost: dragging toward a neighbor lights that tab's identity
    // at the leading edge (drag left → NEXT ghost on the right, and vice
    // versa). Hidden entirely at the ring's ends — there is no neighbor there.
    if (ghostRef.current) {
      const dir = offset < -6 ? 1 : offset > 6 ? -1 : 0
      const target = dir === 1 ? (hasNext ? TAB_ORDER[tabIndex + 1] : null) : dir === -1 ? (hasPrev ? TAB_ORDER[tabIndex - 1] : null) : null
      if (target && !reduce) {
        const gi = TAB_ORDER.indexOf(target)
        if (ghostNumRef.current) ghostNumRef.current.textContent = String(gi + 1).padStart(2, "0")
        if (ghostNameRef.current) ghostNameRef.current.textContent = target.toUpperCase()
        ghostRef.current.dataset.side = dir === 1 ? "r" : "l"
        ghostRef.current.style.opacity = String(Math.min(0.9, Math.abs(offset) / 105))
        // R12-b — swap in the destination's silhouette set. shownSetRef guards
        // the swap so per-pointermove work is O(1) and only fires on change.
        if (shownSetRef.current !== target && ghostPanelsRef.current) {
          const panels = ghostPanelsRef.current
          if (shownSetRef.current) {
            const prev = panels.querySelector<HTMLElement>(`[data-ghost-set="${shownSetRef.current}"]`)
            if (prev) prev.style.display = "none"
          }
          const next = panels.querySelector<HTMLElement>(`[data-ghost-set="${target}"]`)
          if (next) next.style.display = "flex"
          shownSetRef.current = target
        }
      } else {
        ghostRef.current.style.opacity = "0"
        // no destination under the finger (ring end / sub-threshold) — retire
        // the shown silhouette set so the next drag starts from a clean slate
        if (shownSetRef.current && ghostPanelsRef.current) {
          const el = ghostPanelsRef.current.querySelector<HTMLElement>(`[data-ghost-set="${shownSetRef.current}"]`)
          if (el) el.style.display = "none"
          shownSetRef.current = null
        }
      }
    }
    // R11 — panel silhouette: ramps in from 55px of applied offset, settling
    // at half-opacity by ~105px — deeper than the numeral, so the wireframe
    // reads as the destination's content ghosting through, not a decoration
    if (ghostPanelsRef.current) {
      const deep = Math.max(0, Math.min(1, (Math.abs(offset) - 55) / 50))
      ghostPanelsRef.current.style.opacity = String(deep * 0.55)
    }
  }

  const release = (commitDir: 0 | 1 | -1) => {
    if (!engaged.current) return
    engaged.current = false
    setDragging(false)
    document.body.classList.remove("swiping")
    // suppress the trailing click so a committed swipe never taps a button
    const kill = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
    }
    document.addEventListener("click", kill, { capture: true, once: true })
    setTimeout(() => document.removeEventListener("click", kill, { capture: true }), 320)

    paint(0, 0)
    if (sheetRef.current && !reduce) {
      animate(sheetRef.current, { x: 0 }, { ...SPRING_SOFT, duration: 0.42 })
    }
    if (commitDir !== 0) {
      dismissHint()
      goTab(commitDir)
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (ptr.current) return
    ptr.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, lt: performance.now() }
    velocity.current = 0
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ptr.current
    if (!p || p.id !== e.pointerId) return
    const dx = e.clientX - p.x0
    const dy = e.clientY - p.y0

    if (!engaged.current) {
      // vertical dominance → this is a scroll, not a swipe
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        ptr.current = null
        return
      }
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        if (guardedByScroller(e.target as HTMLElement | null, rootRef.current)) {
          ptr.current = null
          return
        }
        engaged.current = true
        setDragging(true)
        document.body.classList.add("swiping")
      } else {
        return
      }
    }

    const now = performance.now()
    const dt = now - p.lt
    if (dt > 0) velocity.current = (e.clientX - p.lx) / dt
    p.lx = e.clientX
    p.lt = now

    // rubber band — the sheet follows at 45% resistance, capped ±150px
    const raw = Math.max(-150, Math.min(150, dx * 0.45))
    const glow = Math.min(0.85, Math.abs(raw) / 88)
    paint(raw, glow)
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = ptr.current
    if (!p || p.id !== e.pointerId) return
    ptr.current = null
    if (!engaged.current) return
    const dx = applied.current / 0.45 // reconstructed raw drag distance
    const commit =
      Math.abs(dx) > 84 || Math.abs(velocity.current) > 0.55
        ? dx < 0
          ? hasNext
            ? 1
            : 0
          : hasPrev
            ? -1
            : 0
        : 0
    release(commit)
  }

  const onPointerCancel = () => {
    ptr.current = null
    release(0)
  }

  // desktop: ←/→ walk the ring (never while typing or inside a dialog)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return
      if (document.querySelector('[role="dialog"]')) return
      const delta = e.key === "ArrowRight" ? 1 : -1
      const i = TAB_ORDER.indexOf(useSystem.getState().tab)
      if (i === -1) return
      if ((delta === -1 && i === 0) || (delta === 1 && i === TAB_ORDER.length - 1)) return
      goTab(delta)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goTab])

  const edgeBtn = (dir: -1 | 1, Icon: typeof ChevronLeft, label: string) => {
    const enabled = dir === -1 ? hasPrev : hasNext
    if (!enabled) return null
    return (
      <button
        type="button"
        onClick={() => {
          dismissHint()
          goTab(dir)
        }}
        aria-label={label}
        title={label}
        className={`swipe-edge ${dir === -1 ? "swipe-edge-l" : "swipe-edge-r"} ${dragging ? "opacity-0" : ""} transition-opacity duration-200 focus-visible:outline focus-visible:outline-violet-400/70`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    )
  }

  return (
    <>
      <div
        ref={rootRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onDragStart={(e) => e.preventDefault()}
        className="relative"
      >
        <div ref={sheetRef} className="will-change-transform">
          {children}
        </div>
      </div>

      {/* edge glows — lit by drag distance (painted imperatively) */}
      <div ref={glowLRef} className="swipe-glow swipe-glow-l" aria-hidden />
      <div ref={glowRRef} className="swipe-glow swipe-glow-r" aria-hidden />

      {/* R10 — peek ghost: the destination tab's hollow numeral + name,
          lit at the leading edge while dragging (painted imperatively).
          R11 — beneath the numeral, a faint wireframe of the destination's
          panel stack surfaces once the drag runs deep (ghostPanelsRef).
          R12-b — the wireframe echoes the REAL destination tab: each ring tab
          renders its own silhouette set (TAB_GHOST) and paint() shows exactly
          one at a time via an inline display swap — the HTML hidden attribute
          would lose to the inline display:flex the column layout needs (UA
          [hidden] rule < inline style). Side alignment chains down through
          alignItems: "inherit" from .swipe-ghost-panels, so rows lean the
          same way as the numeral; rows are flex wrappers at fit-content so
          1-up and 2-up rows both seat at the leading edge. R13-b — each set's
          row 0 / panel 0 carries the brighter hero-zone edge (GHOST_HERO_*),
          the tab-identity-at-a-glance accent. */}
      <div ref={ghostRef} className="swipe-ghost" data-side="r" aria-hidden>
        <div ref={ghostPanelsRef} className="swipe-ghost-panels">
          {TAB_ORDER.map((t) => (
            <div
              key={t}
              data-ghost-set={t}
              style={{ display: "none", flexDirection: "column", gap: "10px", width: "100%", alignItems: "inherit" }}
            >
              {TAB_GHOST[t].map((row, ri) => (
                <div key={ri} style={{ display: "flex", gap: "6px", width: "fit-content" }}>
                  {row.panels.map((p, pi) => {
                    // R13-b — the hero panel (row 0 / panel 0): brighter edge,
                    // whisper fill + leading-edge notch; undefined values are
                    // omitted by React so the class defaults stand for the rest
                    const hero = ri === 0 && pi === 0
                    return (
                      <span
                        key={pi}
                        className="swipe-ghost-panel"
                        style={{
                          width: `${p.w}rem`,
                          height: `${p.h}px`,
                          borderColor: hero ? GHOST_HERO_EDGE : GHOST_EDGE[Math.min(ri, 2)],
                          background: hero ? GHOST_HERO_FILL : undefined,
                          boxShadow: hero ? GHOST_HERO_NOTCH : undefined,
                        }}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
        <span ref={ghostNumRef} className="swipe-ghost-num sys-display-hollow" />
        <span ref={ghostNameRef} className="sys-label text-[9px] text-violet-200/80" />
      </div>

      {/* tappable edge hints (mobile only) */}
      {edgeBtn(-1, ChevronLeft, "Previous tab")}
      {edgeBtn(1, ChevronRight, "Next tab")}

      {/* one-time swipe onboarding — R42 studio: a whisper, not a billboard.
          zinc-500 sentence case, chevrons faint; same one-shot visibility. */}
      {hintVisible && (
        <div className="swipe-hint" role="status">
          <ChevronLeft className="h-3 w-3 text-zinc-500" aria-hidden />
          <span className="text-[9px] font-semibold tracking-wide text-zinc-500">swipe to navigate</span>
          <ChevronRight className="h-3 w-3 text-zinc-500" aria-hidden />
        </div>
      )}
    </>
  )
}
