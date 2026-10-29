"use client"

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import { useReveal } from "@/components/system/reveal"

/** A translucent system window with glowing corner brackets. */
export function SystemPanel({
  label,
  labelAccent,
  className,
  children,
  corners = true,
  reveal = true,
}: {
  label?: string
  labelAccent?: ReactNode
  className?: string
  children: ReactNode
  corners?: boolean
  /** Scroll-reveal — default ON. Opt OUT (reveal={false}) only for panels inside fixed overlays/dialogs that must never gate on scroll. */
  reveal?: boolean
}) {
  const ref = useReveal<HTMLDivElement>()
  return (
    <div
      ref={reveal ? ref : undefined}
      data-reveal={reveal ? "" : undefined}
      className={cn("sys-panel rounded-sm", className)}
    >
      {corners && (
        <>
          <i className="sys-corner sys-corner-tl" aria-hidden />
          <i className="sys-corner sys-corner-tr" aria-hidden />
          <i className="sys-corner sys-corner-bl" aria-hidden />
          <i className="sys-corner sys-corner-br" aria-hidden />
        </>
      )}
      {label && (
        <div className="flex items-center gap-2 border-b border-violet-500/10 px-4 py-2.5">
          {/* R43 studio mark — a small ivory squircle, the TopNav monogram
              badge's echo. Static: a mark doesn't move. */}
          <span className="block h-2.5 w-2.5 rounded-[4px] bg-zinc-100/90" aria-hidden />
          <span className="sys-label text-violet-300/80">{label}</span>
          {labelAccent && <span className="ml-auto">{labelAccent}</span>}
        </div>
      )}
      <div className="relative">{children}</div>
    </div>
  )
}
