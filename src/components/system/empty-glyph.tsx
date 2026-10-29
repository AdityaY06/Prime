"use client"

import { cn } from "@/lib/utils"

/**
 * Faint decorative system glyphs for empty / locked states.
 * Purely ornamental (aria-hidden) — a slowly rotating rune ring
 * around a diamond sigil.
 */
export function EmptyGlyph({
  variant = "diamond",
  className,
}: {
  variant?: "diamond" | "crown"
  className?: string
}) {
  if (variant === "crown") {
    return (
      <svg viewBox="0 0 120 120" className={cn("h-24 w-24", className)} fill="none" aria-hidden>
        <g className="glyph-spin">
          <circle cx="60" cy="60" r="50" stroke="rgba(232,121,249,0.12)" strokeWidth="1" strokeDasharray="2 7" />
        </g>
        {/* crown rune */}
        <path
          d="M32 74 L32 44 L46 57 L60 36 L74 57 L88 44 L88 74 Z"
          stroke="rgba(232,121,249,0.28)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M32 82 H88" stroke="rgba(232,121,249,0.22)" strokeWidth="1.2" />
        {/* sigil diamond above the crown */}
        <path d="M60 22 L65 27 L60 32 L55 27 Z" fill="rgba(232,121,249,0.3)" />
        <path d="M60 20v-6M36 50l-6-4M84 50l6-4" stroke="rgba(232,121,249,0.25)" strokeWidth="1" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 120 120" className={cn("h-24 w-24", className)} fill="none" aria-hidden>
      <g className="glyph-spin">
        <circle cx="60" cy="60" r="50" stroke="rgba(167,139,250,0.14)" strokeWidth="1" strokeDasharray="2 7" />
      </g>
      {/* outer diamond */}
      <path d="M60 18 L102 60 L60 102 L18 60 Z" stroke="rgba(167,139,250,0.22)" strokeWidth="1" />
      {/* inner diamond */}
      <path d="M60 36 L84 60 L60 84 L36 60 Z" stroke="rgba(167,139,250,0.15)" strokeWidth="1" />
      {/* core */}
      <path d="M60 52 L68 60 L60 68 L52 60 Z" fill="rgba(167,139,250,0.25)" />
      {/* cardinal ticks */}
      <path d="M60 18v-8M60 102v8M18 60h-8M102 60h8" stroke="rgba(167,139,250,0.3)" strokeWidth="1" />
    </svg>
  )
}

/** Small faint rune used in place of a plain lock icon on locked titles. */
export function LockedRune({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5 shrink-0", className)} fill="none" aria-hidden>
      <path d="M12 3 L21 12 L12 21 L3 12 Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 8 L16 12 L12 16 L8 12 Z" stroke="currentColor" strokeWidth="1.1" opacity="0.55" />
      <path d="M12 10.5 L13.5 12 L12 13.5 L10.5 12 Z" fill="currentColor" opacity="0.5" />
    </svg>
  )
}
