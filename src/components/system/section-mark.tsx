"use client"

// ─── PRIME · SysSection (R10 — Tactile Flow round) ────────────────────────────
// The ONE editorial section marker, extracted from the five per-tab helpers
// R9 agents built (they had converged on the same idiom anyway): a hollow
// display-scale index numeral, a decode-reveal label and a fading rule.
//
// `flow` (default true) mounts inside the tab's FlowGroup orchestration as a
// rising FlowItem — the status/gates/directives/records flavor. `flow={false}`
// renders the plain static marker the FUEL/VITALS tabs use above their hero
// zones (they orchestrate their own entrances).
//
// Hue policy (unchanged from R9): violet = default/operator zones,
// amber = trophy/warning zones, teal = science zones. `trailing` seats
// content at the rule's end (display numerals, counters).

import { cn } from "@/lib/utils"
import { DecodeText, FlowItem } from "@/components/system/motion"

export type SysSectionHue = "violet" | "amber" | "teal"

export function SysSection({
  index,
  label,
  hue = "violet",
  trailing,
  flow = true,
  className,
}: {
  index: string
  label: string
  hue?: SysSectionHue
  trailing?: React.ReactNode
  /** Mount as a rising FlowItem (inside a FlowGroup) — false for static hero-zone markers. */
  flow?: boolean
  className?: string
}) {
  const hollow =
    hue === "amber" ? "sys-display-hollow-amber" : hue === "teal" ? "sys-display-hollow-teal" : "sys-display-hollow"
  const marker = (
    <>
      <span className={cn("sys-section-index", hollow)} aria-hidden>
        {index}
      </span>
      <DecodeText text={label} className="sys-label text-zinc-400" delay={0.08} />
      <span className="sys-section-rule" aria-hidden />
      {trailing}
    </>
  )
  if (!flow) {
    return (
      <div className={cn("sys-section mb-3", className)} role="presentation">
        {marker}
      </div>
    )
  }
  return (
    <FlowItem className={cn("sys-section px-1 pt-1", className)}>
      {marker}
    </FlowItem>
  )
}
