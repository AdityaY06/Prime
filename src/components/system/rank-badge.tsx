"use client"

import { cn } from "@/lib/utils"
import { RANKS } from "@/lib/game"

/** Rank insignia — R41: a rounded stone medallion (was a rotated diamond). */
export function RankBadge({
  rank,
  size = "md",
  className,
}: {
  rank: string
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
}) {
  const rankDef = RANKS.find((r) => r.rank === rank) ?? RANKS[0]
  const d = {
    xs: { box: "h-6 w-6", text: "text-[9px]", border: "border" },
    sm: { box: "h-9 w-9", text: "text-xs", border: "border-2" },
    md: { box: "h-14 w-14", text: "text-lg", border: "border-2" },
    lg: { box: "h-20 w-20", text: "text-3xl", border: "border-[3px]" },
  }[size]

  return (
    <div
      className={cn(
        "rank-diamond grid place-items-center shrink-0",
        d.box,
        d.border,
        d.text,
        rankDef.color,
        rankDef.glow,
        className
      )}
      aria-label={`Rank ${rank}`}
      role="img"
    >
      <span className={cn("font-display font-semibold tracking-tight", size === "lg" && "text-glow-violet")}>{rank}</span>
    </div>
  )
}
