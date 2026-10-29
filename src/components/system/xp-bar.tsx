"use client"

import { cn } from "@/lib/utils"
import { useCountUp } from "@/components/system/motion"

/** The signature XP progress rail — R42: a luminous aurora hairline.
 *  The extruded segmented rail gave way to a 3px northern-light streak whose
 *  ends dissolve into the dark (`.aurora-track` masks both ends); the fill
 *  pours emerald→amber light and carries its own slow sheen. The wrapper keeps
 *  the original height so callers' layouts never shift, and the % label sits
 *  exactly where it always did. */
export function XPBar({
  value,
  max,
  className,
  height = "h-3",
}: {
  value: number
  max: number
  className?: string
  height?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  // R14 — the numeral resolves in lockstep with the fill below (same 0.8s
  // envelope), so the meter's number and its rail land together.
  const pctShown = useCountUp(pct)
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("relative w-full", height, className)}
    >
      {/* R42 — the aurora hairline rides the wrapper's vertical center; the
          fill's own width transition (0.9s, in globals) glides on refresh,
          and its ::after sheen keeps the light alive at rest. */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2" aria-hidden>
        <div className="aurora-track">
          <div className="aurora-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-end pr-2">
        <span className="font-mono text-[9px] tabular-nums tracking-widest text-zinc-400/90">
          {Math.round(pctShown)}%
        </span>
      </div>
    </div>
  )
}
