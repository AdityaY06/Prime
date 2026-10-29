"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CalendarDays, ChevronDown, Eye, RefreshCw, Volume2 } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { useSystem } from "@/store/system-store"
import { cn } from "@/lib/utils"

type BriefingRes = { day: string; briefing: string | null }

/** Split the briefing into its stanzas (LLM is prompted for blank-line separation). */
function stanzas(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * THE DAILY BRIEFING — the Oracle's morning report.
 * Auto-divines on the first STATUS visit of the day (server caches per day),
 * and speaks a condensed version through the System Voice. R52 declutter:
 * the default view carries ONLY the closing Focus stanza (the day's one
 * useful sentence) — the full three-stanza transmission and its voice
 * controls wait behind the quiet "Full briefing" expander.
 */
export function DailyBriefing() {
  const reduce = useReducedMotion()
  const speak = useSystem((s) => s.speak)
  const pushNotice = useSystem((s) => s.pushNotice)
  const voiceSpeaking = useSystem((s) => s.speaking)
  const [briefing, setBriefing] = useState<string | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "divining" | "error">("idle")
  const [expanded, setExpanded] = useState(false)
  const [replaySpeaking, setReplaySpeaking] = useState(false)
  const spokenRef = useRef<string | null>(null)
  const startedRef = useRef(false)
  const replayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const replayVoicedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false
    const run = async () => {
      setState("loading")
      try {
        const res = await fetch("/api/oracle/briefing", { cache: "no-store" })
        if (!res.ok) throw new Error(`briefing ${res.status}`)
        const data = (await res.json()) as BriefingRes
        if (cancelled) return
        if (data.briefing) {
          setBriefing(data.briefing)
          setState("idle")
          speakSpoken(data.briefing)
          return
        }
        // no briefing yet today → divine one (once)
        setState("divining")
        const gen = await fetch("/api/oracle/briefing", { method: "POST" })
        if (!gen.ok) throw new Error(`divine ${gen.status}`)
        const genData = (await gen.json()) as BriefingRes
        if (cancelled) return
        if (!genData.briefing) throw new Error("empty briefing")
        setBriefing(genData.briefing)
        setState("idle")
        speakSpoken(genData.briefing)
      } catch {
        if (!cancelled) setState("error")
      }
    }

    const speakSpoken = (text: string) => {
      if (spokenRef.current === text) return
      spokenRef.current = text
      // Voice the condensed report — first stanza + a nudge, well under the cap.
      speak(condensed(text))
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const redivine = async () => {
    if (state === "divining" || state === "loading") return
    setState("divining")
    try {
      const res = await fetch("/api/oracle/briefing", { method: "POST" })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as BriefingRes
      setBriefing(data.briefing)
      setState("idle")
      spokenRef.current = null
    } catch {
      setState("error")
      pushNotice({ kind: "warn", title: "The coach is unavailable", body: "Briefing could not be regenerated." })
    }
  }

  /** The condensed report the System Voice reads (first stanza + nudge). */
  const condensed = (text: string): string =>
    (stanzas(text)[0] ?? text.slice(0, 220)).replace(/\s+/g, " ").slice(0, 380)

  /** Best-effort visual speaking state — stop the indicator only, never the audio. */
  const stopReplayVisual = () => {
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current)
      replayTimerRef.current = null
    }
    replayVoicedRef.current = false
    setReplaySpeaking(false)
  }

  const replayVoice = () => {
    if (!briefing) return
    if (replaySpeaking) {
      // early return — silence the visual only; the audio keeps playing
      stopReplayVisual()
      return
    }
    const line = condensed(briefing)
    replayVoicedRef.current = false
    speak(line)
    setReplaySpeaking(true)
    // Timed approximation (words / 2.5 per second, clamped 4–20 s) — the
    // fallback when the voice is muted or the TTS channel fails silently.
    const words = line.split(/\s+/).filter(Boolean).length
    const seconds = Math.min(20, Math.max(4, Math.round(words / 2.5)))
    replayTimerRef.current = setTimeout(() => stopReplayVisual(), seconds * 1000)
  }

  // Completion signal: the store's `speaking` flag flips true while the
  // System Voice plays the clip and false when it ends. Once observed, it
  // replaces the timed approximation (timer cleared, flag drives the state).
  useEffect(() => {
    if (!replaySpeaking || !voiceSpeaking) return
    replayVoicedRef.current = true
    if (replayTimerRef.current) {
      clearTimeout(replayTimerRef.current)
      replayTimerRef.current = null
    }
  }, [voiceSpeaking, replaySpeaking])

  useEffect(() => {
    if (!replaySpeaking || voiceSpeaking) return
    if (replayVoicedRef.current && replayTimerRef.current === null) stopReplayVisual()
  }, [voiceSpeaking, replaySpeaking])

  // never leak the timed fallback across unmounts
  useEffect(
    () => () => {
      if (replayTimerRef.current) clearTimeout(replayTimerRef.current)
    },
    []
  )

  if (state === "loading" || state === "divining") {
    return (
      <div className="relative">
        <SkeletonPanel
          label={state === "loading" ? "Gathering the briefing" : "Writing today's briefing"}
          rows={3}
        >
          {state === "divining" && (
            <div
              className="pointer-events-none absolute inset-x-0 top-12 bottom-3 grid place-items-center"
              aria-hidden
            >
              <div className="briefing-watermark relative grid place-items-center">
                <span className="absolute h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(212,212,216,0.18),transparent_70%)]" />
                <Eye className="h-14 w-14 text-violet-300/25" />
              </div>
            </div>
          )}
        </SkeletonPanel>
        {state === "divining" && (
          <p className="pointer-events-none absolute inset-x-0 -bottom-1 flex items-center justify-center gap-2 text-[9px] font-bold tracking-[0.12em] text-violet-400/70">
            <Eye className="sys-pulse h-3 w-3" aria-hidden /> Reading your training…
          </p>
        )}
      </div>
    )
  }

  if (state === "error") {
    return (
      <SystemPanel label="Daily Briefing">
        <div className="flex flex-col items-center gap-3 p-6">
          <div className="relative grid h-10 w-10 place-items-center rounded-full border border-rose-500/30 bg-rose-500/5" aria-hidden>
            <Eye className="h-4 w-4 text-rose-300/70" />
            <span className="oracle-ring absolute -inset-1 rounded-full border border-dashed border-rose-500/20" />
          </div>
          <p className="text-center text-[11px] font-medium tracking-wide text-zinc-400">
            The coach is unavailable — try again soon
          </p>
          <button
            onClick={() => {
              startedRef.current = false
              setState("idle")
              // re-trigger the effect via a manual redivine
              void redivine()
            }}
            className="grove-press group/retry flex h-11 items-center gap-2 rounded-full border border-violet-400/50 bg-violet-500/15 px-4 text-[10px] font-bold tracking-[0.12em] text-violet-200 transition-colors hover:border-violet-300/70 hover:bg-violet-500/30 hover:shadow-[0_0_16px_rgba(167,139,250,0.3)] focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <RefreshCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover/retry:rotate-180" aria-hidden />
            Retry
          </button>
        </div>
      </SystemPanel>
    )
  }

  if (!briefing) return null

  const parts = stanzas(briefing)
  // R42 studio — stanza labels at a whisper (sentence case, no caps shouting)
  const stanzaLabel = (i: number) => (i === 0 ? "Where you stand" : i === 1 ? "The day ahead" : "Focus")
  // R52 declutter — the collapsed line: the closing stanza is the day's most
  // useful sentence (the Focus omen when the LLM honors the 3-stanza shape,
  // else the last transmission block).
  const focusLine = parts[parts.length - 1] ?? briefing

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <SystemPanel
        label="Daily Briefing"
        labelAccent={
          <span className="flex items-center gap-2 sm:gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
            <span
              aria-live="polite"
              className="sr-only"
            >
              {replaySpeaking ? "The System voice is speaking the briefing" : ""}
            </span>
            {/* R52 declutter — the voice controls ride inside the expanded
                view only; the collapsed line pairs with the expander below. */}
            {expanded && (
              <>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={replayVoice}
              aria-label={
                replaySpeaking
                  ? "System voice is speaking the briefing — silence the indicator"
                  : "Replay the briefing through the System voice"
              }
              aria-pressed={replaySpeaking}
              title={replaySpeaking ? "The System is speaking" : "Replay briefing voice"}
              className={cn(
                "grove-press group/replay relative flex h-7 items-center gap-1.5 rounded-full border px-2 text-[9px] font-bold tracking-[0.12em] transition-colors after:absolute after:-inset-2 after:content-[''] focus-visible:outline focus-visible:outline-violet-400/70",
                replaySpeaking
                  ? "border-amber-400/60 bg-amber-500/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                  : "border-violet-500/30 bg-violet-500/10 text-violet-300 hover:border-violet-400/60 hover:bg-violet-500/25 hover:text-violet-100 hover:shadow-[0_0_12px_rgba(167,139,250,0.28)]"
              )}
            >
              {/* amber pulse ring while the voice speaks */}
              {replaySpeaking && (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -inset-1 rounded-full border border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.35)]",
                    !reduce && "motion-safe:animate-pulse"
                  )}
                />
              )}
              {replaySpeaking ? (
                <>
                  {/* voice bars — stilled by the reduced-motion CSS + JS guard */}
                  <span className="voice-eq flex items-end text-amber-300" aria-hidden>
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="hidden sm:inline">Speaking…</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-3 w-3 transition-transform group-hover/replay:scale-110" aria-hidden />
                  <span className="hidden sm:inline">Replay</span>
                </>
              )}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={redivine}
              aria-label="Regenerate today's briefing"
              title="Regenerate briefing"
              className="grove-press group/redivine relative flex h-7 items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/60 px-2 text-[9px] font-bold tracking-[0.12em] text-zinc-400 transition-colors after:absolute after:-inset-2 after:content-[''] hover:border-violet-400/50 hover:bg-violet-500/15 hover:text-violet-200 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <RefreshCw className="h-3 w-3 transition-transform duration-500 group-hover/redivine:rotate-180" aria-hidden />
              <span className="hidden sm:inline">Regenerate</span>
            </motion.button>
              </>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse to the focus line" : "Expand the full briefing"}
              title={expanded ? "Collapse briefing" : "Full briefing"}
              className="grove-press flex h-7 items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/60 px-2 text-[9px] font-bold tracking-[0.12em] text-zinc-400 transition-colors after:absolute after:-inset-2 after:content-[''] hover:border-violet-400/50 hover:bg-violet-500/15 hover:text-violet-200 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              Full briefing
              <ChevronDown
                className={cn("h-3 w-3 transition-transform duration-300", expanded && "rotate-180")}
                aria-hidden
              />
            </motion.button>
          </span>
        }
      >
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="briefing-full"
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  {/* the coach's eye — a breathing iris, glancing pupil, slow orbit */}
                  <div className="grove-breathe relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-violet-500/40 bg-violet-500/10">
                    <span
                      className="briefing-iris absolute h-7 w-7 rounded-full bg-[radial-gradient(circle,rgba(212,212,216,0.35),transparent_70%)]"
                      aria-hidden
                    />
                    <Eye className="relative h-4.5 w-4.5 text-violet-300" aria-hidden />
                    <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
                      <span className="oracle-pupil h-1 w-1 rounded-full bg-violet-100 shadow-[0_0_5px_rgba(244,244,245,0.95)]" />
                    </span>
                    <span className="oracle-ring absolute -inset-1.5 rounded-full border border-dashed border-violet-500/25" aria-hidden />
                  </div>

                  {/* stanza column — a transmission line threads the three readings */}
                  <div className="min-w-0 flex-1">
                    <div className="relative space-y-5 pl-5">
                      <span
                        className="absolute bottom-1.5 left-[3px] top-1.5 w-px bg-gradient-to-b from-violet-500/45 via-violet-500/15 to-amber-500/35"
                        aria-hidden
                      />
                      {parts.map((p, i) => {
                        const isOmen = i >= 2
                        return (
                          <motion.div
                            key={i}
                            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: 0.08 + i * 0.12, ease: "easeOut" }}
                            className="relative"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "absolute -left-5 top-[4px] h-[6px] w-[6px] rounded-full border",
                                isOmen
                                  ? "border-amber-400/80 shadow-[0_0_7px_rgba(245,158,11,0.5)]"
                                  : "border-violet-400/80 shadow-[0_0_7px_rgba(167,139,250,0.4)]"
                              )}
                            />
                            {isOmen ? (
                              /* the OMEN reads like an inscription — dimmed, centered, flanked by amber motes */
                              <>
                                <p className="flex items-center justify-center gap-2.5 text-[8px] font-bold tracking-[0.18em] text-amber-400/80">
                                  <span className="h-1 w-1 rounded-full bg-amber-400/70" aria-hidden />
                                  {stanzaLabel(i)}
                                  <span className="h-1 w-1 rounded-full bg-amber-400/70" aria-hidden />
                                </p>
                                <p className="mt-1.5 text-center text-[12px] italic leading-relaxed text-zinc-400">
                                  {p}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-[8px] font-bold tracking-[0.18em] text-violet-400/60">{stanzaLabel(i)}</p>
                                <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">{p}</p>
                              </>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                {/* R42 studio — the footer's one true-italic flourish (Kota's Times
                    accent); the invisible ::after hit-slop keeps the two compact
                    header controls at a 44px touch target. */}
                <p className="mt-5 flex items-center justify-end gap-2.5 border-t border-violet-500/10 pt-3 text-[8px] font-bold tracking-[0.12em] text-zinc-400">
                  <span className="h-px w-6 bg-violet-500/20" aria-hidden />
                  Written by your coach · read aloud by the <span className="sys-italic text-zinc-200/80">studio</span>
                  <span className="h-1 w-1 rounded-full bg-zinc-700" aria-hidden />
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="briefing-focus"
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: "easeOut" }}
              className="overflow-hidden"
            >
              {/* R52 declutter — the collapsed surface: ONE line (the closing
                  Focus stanza) in the omen's italic register; the full
                  transmission waits behind the header's "Full briefing" toggle. */}
              <p
                className="px-5 py-4 text-[12px] italic leading-relaxed text-zinc-300/90 sm:px-6"
                title="Today's focus — open the full briefing for all three stanzas"
              >
                {focusLine}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </SystemPanel>
    </motion.div>
  )
}
