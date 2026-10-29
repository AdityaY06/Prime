"use client"

import { useEffect, useRef } from "react"

// ─── PRIME · Scroll-reveal flow system ──────────────────────────────────────
// The "whole app flows in as you scroll" layer. Deliberately NOT framer-motion:
// ~70 live panels reporting to ONE shared IntersectionObserver plus a pure CSS
// transition runs on the compositor (opacity/transform only) with zero
// main-thread animation cost, where 70 whileInView subscribers would each own
// measurement + rAF machinery. FlowReveal stays for its own surfaces — this
// module is the cheap system-wide default that needed no tab edits.
//
// HYDRATION SAFETY (the load-bearing trick): the module-scope gate below runs
// at client-bundle EVAL time — before React's first client render — so hidden
// states are in place with zero flash, and because the server never executes
// it (typeof document guard) the SSR HTML ships fully visible markup. No-JS
// users and crawlers always see content, and React never diffs the classes it
// didn't render (same reasoning as next-themes' theme class on <html>, which
// layout.tsx already suppresses hydration warnings for).

/**
 * Module-scope JS gate — flips the entire reveal system on the instant the
 * client bundle evaluates, i.e. before first render/hydration. Runs once per
 * browser tab; the matching CSS lives in globals.css under `html.js-reveal`.
 */
if (typeof document !== "undefined") {
  document.documentElement.classList.add("js-reveal")
}

/** The shared observer — exactly one for the whole app, lazily created. */
let revealObserver: IntersectionObserver | null = null

function getRevealObserver(): IntersectionObserver {
  if (revealObserver) return revealObserver
  revealObserver = new IntersectionObserver(
    (entries, io) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        // once-only: drop the element the moment it flows in — scroll-up can
        // never re-hide it, and the observer stays O(visible churn) not O(panels)
        io.unobserve(el)
        el.classList.add("is-visible")
        // React-proof twin: React re-assigns `element.className` whenever its
        // rendered className string changes, wiping manually-added classes.
        // An attribute React never manages survives any such re-assignment, so
        // globals.css can keep a revealed element visible even if `.is-visible`
        // is wiped (see the `[data-revealed]` self-heal rule there).
        el.setAttribute("data-revealed", "")
      }
    },
    // 15% of the element inside a viewport whose bottom edge is shaved by 6%:
    // reveals land just ahead of the reader instead of at the last pixel, and
    // the bottom margin keeps panels from "arriving" from under the fold edge.
    { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
  )
  return revealObserver
}

/**
 * Observe any element for its one-time scroll reveal. Returns a ref to attach;
 * the effect re-runs on remount, which is exactly what makes tab re-entries
 * re-flow (region keys remount the whole tab tree on navigation). The observer
 * only ever calls HTMLElement APIs, so the generic is free.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // already flowed (StrictMode double-effect / DOM-preserving remount):
    // reveal stays — nothing in this system ever re-hides
    if (el.hasAttribute("data-revealed")) return
    const io = getRevealObserver()
    io.observe(el)
    return () => io.unobserve(el)
  }, [])
  return ref
}

/**
 * Scroll-reveal wrapper for arbitrary blocks:
 * `<Reveal as="li" delay={0.08} className="…">{children}</Reveal>`.
 *
 * `delay` (seconds) staggers siblings apart via the inline `--reveal-delay`
 * custom property + a `data-reveal-delay` marker attribute; zero-delay
 * elements carry neither (no delay machinery at all). Keep staggers small
 * (0.05–0.15s) — past ~0.3s the flow reads as lag.
 */
export function Reveal({
  as = "div",
  delay = 0,
  className,
  style,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<"div"> & {
  /** Element to render — the observer only needs a HTMLElement, so any tag works. */
  as?: "div" | "section" | "article" | "li" | "ul" | "span"
  /** Seconds to hold this element back — stagger siblings 0.05–0.15 apart. */
  delay?: number
}) {
  // div-typed ref is safe for every supported tag (HTMLElement-only observer);
  // the single cast keeps the polymorphic `as` ergonomic instead of per-tag
  // ref generics. Attributes are static across renders — hydration-safe.
  const ref = useReveal<HTMLDivElement>()
  const Tag = as as "div"
  const delaySeconds = Math.max(0, delay || 0)
  return (
    <Tag
      ref={ref}
      data-reveal=""
      data-reveal-delay={delaySeconds > 0 ? String(delaySeconds) : undefined}
      className={className}
      style={
        delaySeconds > 0
          ? ({ ...style, "--reveal-delay": `${delaySeconds}s` } as React.CSSProperties)
          : style
      }
      {...rest}
    >
      {children}
    </Tag>
  )
}

/**
 * Renders nothing. Mounted once in page.tsx next to the ambient layers so this
 * module — and its document-level `js-reveal` gate — is guaranteed to be in the
 * client bundle's import graph even before the first SystemPanel mounts.
 */
export function RevealGate() {
  return null
}
