"use client"

// ─── PRIME · GroveMarquee (R42-b · the Kota-style gentle ticker) ──────────────
// A whisper-thin drift of the hunter's own story along the TopNav's bottom
// edge: streak, lifetime xp, essence, the equipped title on the board.
// The strip is pure ambience — pointer-events-none + aria-hidden so it can
// never intercept taps or pollute the a11y tree — and it stands down entirely
// under prefers-reduced-motion (the CSS already freezes the drift; not
// rendering it at all keeps the strip from sitting as a static line of noise).
//
// Mechanics: .grove-marquee masks both edges; .grove-marquee-track renders the
// fragment list TWICE and drifts translateX(0 → -50%) over 36s — the track's
// gap (2.75rem) equals its padding-right, so one copy is exactly half the
// track width and the -50% loop is seamless. Each fragment is whitespace-nowrap
// (the strip never wraps on 390px); the plain middot after each fragment is the
// separator beat, riding inside the fragment span.

import { useReducedMotion } from "framer-motion"
import type { HunterDTO } from "@/lib/types"
import { ARCHETYPES, RANKS } from "@/lib/game"
import { titleByCode } from "@/lib/titles"

export function GroveMarquee({ hunter }: { hunter: HunterDTO }) {
  const reduce = useReducedMotion()

  // Fragments are derived exclusively from the hunter DTO TopNav already
  // receives — zero new fetches. Gentle sentence case, never all-caps.
  const equipped = hunter.equippedTitle
    ? titleByCode(hunter.equippedTitle)?.title
    : undefined
  const archName =
    ARCHETYPES.find((a) => a.id === hunter.archetype)?.name ?? hunter.archetype
  const rankTag = RANKS.find((r) => r.rank === hunter.rank)?.tag

  const fragments: string[] = [
    `streak ${hunter.streak} ${hunter.streak === 1 ? "day" : "days"}`,
    `${hunter.totalXp.toLocaleString()} xp earned`,
    `essence ${hunter.essence.toLocaleString()}`,
    equipped
      ? `“${equipped}” on the board`
      : `the ${archName} on the board`,
    `level ${hunter.level} — ${rankTag ?? `${hunter.rank}-rank`}`,
    `${hunter.totalSessions} sessions logged`,
  ]

  if (reduce) return null

  // Two copies → the seamless -50% loop (see header comment).
  const doubled = [...fragments, ...fragments]

  return (
    <div className="grove-marquee pointer-events-none w-full py-1.5" aria-hidden>
      <div className="grove-marquee-track">
        {doubled.map((f, i) => (
          <span
            key={i}
            className="flex shrink-0 items-center whitespace-nowrap text-[9px] text-zinc-500"
          >
            {f}
            <span className="ml-3 text-[8px] text-zinc-600">·</span>
          </span>
        ))}
      </div>
    </div>
  )
}
