"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Themed loading placeholder — a system window with shimmering data bars.
 * Shown while a tab's first fetch resolves (`loading && !data`).
 */
export function SkeletonPanel({
  label = "SYNCING",
  rows = 2,
  className,
  children,
}: {
  label?: string
  rows?: number
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn("sys-panel rounded-sm", className)} aria-busy="true" role="status" aria-label={`${label} DATA`}>
      <i className="sys-corner sys-corner-tl" aria-hidden />
      <i className="sys-corner sys-corner-tr" aria-hidden />
      <i className="sys-corner sys-corner-bl" aria-hidden />
      <i className="sys-corner sys-corner-br" aria-hidden />
      <div className="flex items-center gap-2 border-b border-violet-500/10 px-4 py-2.5">
        <span className="sys-pulse text-[10px] text-violet-400/80" aria-hidden>◆</span>
        <span className="sys-label sys-pulse text-violet-300/70">{label}…</span>
        <span className="ml-auto font-mono text-[9px] tracking-[0.3em] text-zinc-700" aria-hidden>
          <span className="sys-blink">▊</span>
        </span>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="skel-bar h-2.5 w-2/5" style={{ animationDelay: `${i * 0.18}s` }} />
            <div className="skel-bar h-2.5 w-full" style={{ animationDelay: `${i * 0.18 + 0.09}s` }} />
          </div>
        ))}
        {children}
      </div>
    </div>
  )
}
