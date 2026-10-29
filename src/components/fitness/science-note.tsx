"use client"

// ── PRIME · Science notes (R28-b evidence layer) ──────────────────────────────
// Two shared presentational surfaces over the exercise-science fact library:
//
// · ResearchBriefCard — the daily "RESEARCH BRIEF" panel (STATUS): claim as
//   headline, detail, real citation, and a tap-to-expand "HOW PRIME USES IT"
//   line. Entrance rides FlowReveal; the expand is height-animated and
//   reduced-motion safe.
// · ScienceChip — the inline contextual variant (GATES / FUEL / VITALS): a
//   tiny SCI-labelled chip that opens a Popover carrying the citation.
//
// Pure presentation — every number and citation lives in
// src/lib/exercise-science.ts, never here.

import { useId, useState } from "react"
import { ChevronDown, FlaskConical } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SystemPanel } from "@/components/system/system-panel"
import { FlowReveal, FLOW_EASE } from "@/components/system/motion"
import { getFact, type ScienceFact } from "@/lib/exercise-science"
import { cn } from "@/lib/utils"

/** The SCI badge — the mark of a sourced claim. Shared by both surfaces. */
function SciBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border border-violet-400/40 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.2em] text-violet-300",
        className
      )}
    >
      SCI
    </span>
  )
}

/** The full citation line — zinc-500, mono, tiny. */
function CitationLine({ fact }: { fact: ScienceFact }) {
  return <p className="font-mono text-[10px] tracking-wide text-zinc-500">{fact.citation}</p>
}

/** The practical line ("HOW PRIME USES IT") — sentence-case body + teal » marker. */
function PracticalLine({ fact }: { fact: ScienceFact }) {
  return (
    <p className="border-t border-violet-500/10 pt-3 text-[11px] leading-relaxed text-zinc-300">
      <span className="sys-label mr-1.5 text-[8px] text-teal-300/90" aria-hidden>
        »
      </span>
      {fact.practical}
    </p>
  )
}

/** RESEARCH BRIEF card — the daily fact, fully cited. */
export function ResearchBriefCard({ fact, className }: { fact: ScienceFact; className?: string }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const detailId = useId()

  return (
    <FlowReveal className={className}>
      <SystemPanel
        label="Research Brief"
        labelAccent={
          <span className="ml-auto flex items-center gap-1.5">
            <span className="font-mono text-[9px] tracking-[0.22em] text-zinc-500">{fact.domain.toUpperCase()}</span>
            <SciBadge />
          </span>
        }
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-teal-500/40 bg-teal-500/10">
              <FlaskConical className="h-4 w-4 text-teal-300" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              {/* the claim — the headline */}
              <p className="text-sm font-semibold leading-snug text-zinc-100">{fact.claim}</p>
              {/* the detail — the actual numbers */}
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{fact.detail}</p>
              <div className="mt-2.5">
                <CitationLine fact={fact} />
              </div>
            </div>
          </div>

          {fact.practical && (
            <div className="mt-3.5">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={detailId}
                className="flex w-full items-center justify-between gap-2 rounded-sm border border-violet-500/25 bg-violet-500/5 px-3 py-2.5 font-mono text-[9px] font-bold tracking-[0.22em] text-violet-300 transition-colors hover:border-violet-400/40 hover:bg-violet-500/15 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
              >
                HOW PRIME USES IT
                <ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
                  aria-hidden
                />
              </button>
              {reduce ? (
                open && (
                  <div id={detailId} className="mt-3">
                    <PracticalLine fact={fact} />
                  </div>
                )
              ) : (
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      id={detailId}
                      key="practical"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: FLOW_EASE }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3">
                        <PracticalLine fact={fact} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          )}
        </div>
      </SystemPanel>
    </FlowReveal>
  )
}

/** Inline science chip — tiny SCI label + claim, Popover carries the citation. */
export function ScienceChip({
  factId,
  label,
  className,
}: {
  /** Fact id from the library — unknown ids render nothing. */
  factId: string
  /** Optional override for the chip's text (defaults to the claim). */
  label?: string
  className?: string
}) {
  const fact = getFact(factId)
  if (!fact) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Research: ${fact.claim}`}
          className={cn(
            "inline-flex min-h-[36px] w-full max-w-full items-center gap-1.5 rounded-sm border border-teal-500/30 bg-teal-500/5 px-2.5 py-1.5 text-left transition-colors",
            "hover:border-teal-400/50 hover:bg-teal-500/10 focus-visible:outline focus-visible:outline-violet-400/70",
            className
          )}
        >
          <SciBadge className="border-teal-400/40 bg-teal-500/10 text-teal-300" />
          <span className="min-w-0 truncate text-[10px] leading-tight text-zinc-300">{label ?? fact.claim}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 rounded-sm border border-violet-500/20 bg-zinc-950/95 p-3.5 shadow-[0_0_28px_rgba(0,0,0,0.7)] outline-none"
      >
        <p className="text-xs font-semibold leading-snug text-zinc-100">{fact.claim}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{fact.detail}</p>
        <div className="mt-2.5">
          <CitationLine fact={fact} />
        </div>
        {fact.practical && (
          <div className="mt-3 border-t border-violet-500/10 pt-3">
            <p className="sys-label text-[8px] text-violet-300/80">HOW PRIME USES IT</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">{fact.practical}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
