"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion"
import { Eye, RefreshCw, Sparkles, Square, Volume2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FLOW_EASE } from "@/components/system/motion"
import { api } from "@/hooks/use-api"
import { cn } from "@/lib/utils"

type ReadingRes = { reading: string; divinedAt: string }
type Section = { heading: string; body: string }

/** Split the Oracle's text into ≤380-char sentence-aligned chunks for TTS. */
function chunkText(text: string, max = 380): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*/g) ?? [text]
  const chunks: string[] = []
  let cur = ""
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      chunks.push(cur.trim())
      cur = ""
    }
    cur += s + " "
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

/** Parse the strict four-part reading format into sections + verdict. */
function parseReading(raw: string): { sections: Section[]; verdict: string | null } {
  const sections: Section[] = []
  let verdict: string | null = null
  let current: Section | null = null
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    const isHeading = /^(I|II|III)\.\s/.test(t)
    const isVerdict = /^SYSTEM VERDICT\s*:/i.test(t)
    if (isHeading || isVerdict) {
      if (current) sections.push(current)
      current = null
    }
    if (isHeading) current = { heading: t, body: "" }
    else if (isVerdict) verdict = t.replace(/^SYSTEM VERDICT\s*:\s*/i, "").trim()
    else if (current && t) current.body += (current.body ? "\n" : "") + t
  }
  if (current) sections.push(current)
  return { sections, verdict }
}

/**
 * One step of the dialog-open cascade (R5-c flow language) — a self-animating
 * block that rises 12px on the signature ease, staggered by section index
 * (0.05s + i × 0.06s). Radix unmounts content on close, so the cascade
 * replays on every open. Reduced motion → renders at rest instantly.
 */
function cascadeStep(reduce: boolean, i: number): HTMLMotionProps<"div"> {
  if (reduce) return { initial: false }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: FLOW_EASE, delay: 0.05 + i * 0.06 },
  }
}

/**
 * Reveal choreography (R5-c): the drawn sigil materializes first (scale +
 * unblur + de-rotate), then the reading cascades beneath it — the whole
 * reveal settles in under 0.9s.
 */
const REVEAL = {
  glyphDuration: 0.38,
  sectionsDelay: 0.18,
  sectionsStagger: 0.1,
  sectionsDuration: 0.4,
} as const

/**
 * WEEKLY DIVINATION — a ceremonial long-form Oracle reading of the cycle just
 * lived and the one arriving. Cast from the Chronicle header; ephemeral.
 */
export function DivinationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [res, setRes] = useState<ReadingRes | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopRef = useRef(false)
  const reduce = useReducedMotion() ?? false

  const divine = useCallback(async () => {
    setPending(true)
    setError(null)
    setRes(null)
    try {
      const r = await api<ReadingRes>("/api/oracle/reading", { method: "POST" })
      setRes(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
    }
  }, [])

  // cast once when the ritual opens (divine is a stable callback)
  useEffect(() => {
    if (open && !res && !pending && !error) divine()
  }, [open, res, pending, error, divine])

  // silence the Oracle when the dialog closes
  useEffect(() => {
    if (!open && speaking) {
      stopRef.current = true
      audioRef.current?.pause()
      setSpeaking(false)
    }
  }, [open, speaking])
  useEffect(() => {
    return () => {
      stopRef.current = true
      audioRef.current?.pause()
    }
  }, [])

  const parsed = res ? parseReading(res.reading) : null
  const fullText = parsed
    ? [...parsed.sections.map((s) => `${s.heading}. ${s.body}`), parsed.verdict ? `System verdict: ${parsed.verdict}` : ""]
        .filter(Boolean)
        .join(" ")
    : ""

  const speak = async () => {
    if (!fullText || speaking) return
    setSpeaking(true)
    stopRef.current = false
    for (const chunk of chunkText(fullText)) {
      if (stopRef.current) break
      try {
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk }),
        })
        if (!resp.ok) break
        const buf = await resp.arrayBuffer()
        await new Promise<void>((resolve) => {
          const a = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })))
          audioRef.current = a
          a.onended = () => {
            URL.revokeObjectURL(a.src)
            resolve()
          }
          a.onerror = () => resolve()
          a.play().catch(() => resolve())
        })
      } catch {
        break
      }
    }
    setSpeaking(false)
  }

  const stopSpeak = () => {
    stopRef.current = true
    audioRef.current?.pause()
    setSpeaking(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="divine-veil sys-panel max-h-[88vh] max-w-lg rounded-sm border-violet-500/25 bg-zinc-950/95 p-0 backdrop-blur-xl"
      >
        <i className="sys-corner sys-corner-tl" aria-hidden />
        <i className="sys-corner sys-corner-tr" aria-hidden />
        <i className="sys-corner sys-corner-bl" aria-hidden />
        <i className="sys-corner sys-corner-br" aria-hidden />
        {/* R5-c — open cascade: header first, footer settles after the reveal */}
        <motion.div {...cascadeStep(reduce, 0)}>
          <DialogHeader className="border-b border-violet-500/10 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 sys-label text-violet-300/80">
              <span className="relative grid place-items-center">
                <Eye className="h-3.5 w-3.5 text-violet-400" aria-hidden />
                <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
                  <span className="oracle-pupil h-1 w-1 rounded-full bg-violet-200 shadow-[0_0_4px_rgba(167,139,250,0.9)]" />
                </span>
              </span>
              THE COACH&rsquo;S REVIEW — WEEKLY REPORT
            </DialogTitle>
          </DialogHeader>
        </motion.div>

        <div className="scroll-sys max-h-[62vh] overflow-y-auto px-5 py-4">
          {/* divining state */}
          {pending && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE }}
            >
            <div className="py-10 text-center" aria-live="polite">
              <div className="relative mx-auto grid h-14 w-14 place-items-center">
                <span className="divine-halo absolute inset-0 rounded-full border border-dashed border-violet-400/40" aria-hidden />
                <Eye className="sys-pulse h-6 w-6 text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.8)]" aria-hidden />
              </div>
              <p className="mt-4 font-mono text-[10px] tracking-[0.3em] text-violet-300/80">
                PREPARING YOUR REVIEW<span className="sys-blink ml-1 text-violet-400" aria-hidden>▊</span>
              </p>
              <p className="mt-1.5 font-mono text-[8px] tracking-[0.25em] text-zinc-600">
                YOUR WEEK IS BEING REVIEWED IN FULL
              </p>
            </div>
            </motion.div>
          )}

          {/* error state */}
          {!pending && error && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE }}
            >
            <div className="py-8 text-center">
              <p className="font-mono text-xs tracking-widest text-rose-400/80">THE REVIEW COULD NOT BE COMPLETED</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-600">{error.toUpperCase()}</p>
              <button
                onClick={() => divine()}
                className="mt-4 rounded-sm border border-violet-400/50 bg-violet-500/15 px-4 py-2 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.4)] focus-visible:outline focus-visible:outline-violet-400/70"
              >
                REFRESH
              </button>
            </div>
            </motion.div>
          )}

          {/* the reading */}
          {!pending && !error && parsed && (
            <div className="space-y-5">
              {/* R5-c — the drawn sigil materializes before the reading cascades */}
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.85, rotate: -2, filter: "blur(6px)" }}
                animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
                transition={reduce ? { duration: 0 } : { duration: REVEAL.glyphDuration, ease: FLOW_EASE }}
                className="flex justify-center"
                aria-hidden
              >
                <span className="relative grid h-14 w-14 place-items-center">
                  <span className="absolute inset-0 rotate-45 rounded-sm border border-violet-400/40 bg-violet-500/5 shadow-[0_0_18px_rgba(139,92,246,0.25)]" />
                  <Eye className="sys-pulse h-5 w-5 text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
                </span>
              </motion.div>
              {parsed.sections.map((s, i) => (
                <motion.section
                  key={s.heading}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { duration: REVEAL.sectionsDuration, delay: REVEAL.sectionsDelay + i * REVEAL.sectionsStagger, ease: FLOW_EASE }
                  }
                >
                  <h3 className="divine-heading sys-label text-[9px] text-violet-300/80">{s.heading}</h3>
                  <div className="divine-quote mt-2 border-l border-violet-400/30 pl-3">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">{s.body}</p>
                  </div>
                </motion.section>
              ))}

              {parsed.verdict && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { duration: REVEAL.sectionsDuration, delay: REVEAL.sectionsDelay + parsed.sections.length * REVEAL.sectionsStagger, ease: FLOW_EASE }
                  }
                  className="divine-verdict rounded-sm border border-amber-400/40 bg-gradient-to-b from-amber-500/10 to-transparent px-4 py-3"
                >
                  <p className="flex items-center gap-2 sys-label text-[8px] text-amber-400/90">
                    <span className="chronicle-led" aria-hidden />
                    SYSTEM VERDICT
                  </p>
                  <p className="mt-1.5 font-mono text-[11px] font-bold tracking-[0.14em] text-amber-200">
                    {parsed.verdict}
                  </p>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* footer — recast + the Oracle speaks (mounts once the review lands) */}
        {!pending && (
          <motion.div {...cascadeStep(reduce, 2)}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-violet-500/10 px-5 py-3">
            <span className="font-mono text-[8px] tracking-[0.22em] text-zinc-600">
              {res
                ? `REVIEWED ${new Date(res.divinedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : "EPHEMERAL — NOT ARCHIVED"}
            </span>
            <div className="flex items-center gap-2">
              {res && (
                <button
                  onClick={speaking ? stopSpeak : speak}
                  aria-label={speaking ? "Stop the voice" : "Have the coach read the review"}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-sm border px-3 font-mono text-[9px] font-bold tracking-[0.2em] transition-all focus-visible:outline focus-visible:outline-violet-400/70",
                    speaking
                      ? "border-amber-400/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                      : "border-violet-400/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/30 hover:shadow-[0_0_14px_rgba(139,92,246,0.35)]"
                  )}
                >
                  {speaking ? (
                    <>
                      <Square className="h-3 w-3" aria-hidden /> SILENCE
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3 w-3" aria-hidden /> SPEAK
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => divine()}
                disabled={pending}
                aria-label="Refresh the review"
                className="flex h-8 items-center gap-1.5 rounded-sm border border-zinc-700/60 bg-zinc-900/60 px-3 font-mono text-[9px] font-bold tracking-[0.2em] text-zinc-400 transition-all hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-violet-300 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} aria-hidden /> REFRESH
              </button>
            </div>
          </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}
