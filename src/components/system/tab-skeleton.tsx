"use client"

/**
 * Lazy-tab loading shell — the `next/dynamic` `loading` state for the 8 tab
 * components (first-paint JS reduction, R29-a). Shapes mimic a tab's opening:
 * label bar, a couple of text lines, then panel blocks. R41: rounded
 * geometry (pill text ghosts, soft panel blocks) + a grove-sprout entrance.
 * R43: the ghosts breathe a neutral zinc gradient — studio-grey shimmer,
 * no accent — through the shared motion-safe pulse (staggered
 * animation-delays were tried and dropped: the animate-pulse shorthand
 * resets delay, so the blocks breathe as one calm surface instead). Pulses
 * ONLY under motion-safe (reduced-motion users get a static frame).
 */
export function TabSkeleton({ label }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ? `${label} view loading` : "View loading"}
      className="grove-sprout space-y-4 px-1 py-6"
    >
      <span className="sr-only">{label ? `Loading ${label} view…` : "Loading view…"}</span>
      {/* label bar — where the tab's first header sits */}
      <div className="h-3 w-28 rounded-full bg-gradient-to-r from-zinc-800/50 via-zinc-700/30 to-zinc-800/50 motion-safe:animate-pulse" aria-hidden />
      {/* text lines — a lead paragraph's ghost */}
      <div className="space-y-2" aria-hidden>
        <div className="h-4 w-3/4 rounded-full bg-gradient-to-r from-zinc-800/50 via-zinc-700/30 to-zinc-800/50 motion-safe:animate-pulse" />
        <div className="h-4 w-1/2 rounded-full bg-gradient-to-r from-zinc-800/50 via-zinc-700/30 to-zinc-800/50 motion-safe:animate-pulse" />
      </div>
      {/* panel blocks — the first SystemPanels of the tab */}
      <div className="space-y-4" aria-hidden>
        <div className="h-28 w-full rounded-xl bg-gradient-to-r from-zinc-800/50 via-zinc-700/25 to-zinc-800/50 motion-safe:animate-pulse" />
        <div className="h-28 w-full rounded-xl bg-gradient-to-r from-zinc-800/50 via-zinc-700/25 to-zinc-800/50 motion-safe:animate-pulse" />
        <div className="h-28 w-full rounded-xl bg-gradient-to-r from-zinc-800/50 via-zinc-700/25 to-zinc-800/50 motion-safe:animate-pulse" />
      </div>
    </div>
  )
}
