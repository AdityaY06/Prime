"use client"

// ── PRIME · Oracle tip banner (R2-b, SHARED CONTRACT — R2-a also imports this) ─
// Slim amber per-tab micro-briefing fed by GET /api/oracle/tip?tab=…:
//   <OracleTip tab="status|records|directives|fuel|body|vitals|gates" />
// Renders null while loading and whenever the tip is null (nothing to say).

import { motion, useReducedMotion } from "framer-motion"
import { FLOW_EASE } from "@/components/system/motion"
import { Sparkles } from "lucide-react"
import { useApi } from "@/hooks/use-api"

export type OracleTab = "status" | "records" | "directives" | "fuel" | "body" | "vitals" | "gates"

type OracleTipRes = { tab: string; tip: string | null }

export function OracleTip({ tab }: { tab: OracleTab }) {
  const { data, loading } = useApi<OracleTipRes>(`/api/oracle/tip?tab=${tab}`)
  const reduce = useReducedMotion()
  const tip = data?.tip ?? null
  if (loading || !tip) return null

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: FLOW_EASE }}
      role="status"
      aria-label={`Oracle tip: ${tip}`}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-sm border-l-2 border-amber-500/25 bg-amber-500/[0.04] px-3 py-2"
    >
      <Sparkles className="sys-pulse h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
      <p className="min-w-0 flex-1 font-mono text-[10px] leading-snug tracking-widest text-amber-200/90 uppercase">
        {tip}
      </p>
      <span className="shrink-0 font-mono text-[8px] tracking-[0.25em] text-zinc-600" aria-hidden>
        ORACLE
      </span>
    </motion.div>
  )
}
