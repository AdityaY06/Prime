"use client"

import { useEffect, useRef, useState } from "react"
import { Eye, Send, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { api } from "@/hooks/use-api"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { DecodeText, FLOW_EASE, Magnetic } from "@/components/system/motion"
import { useSystem } from "@/store/system-store"

type ChatMessage = { role: "user" | "assistant"; content: string }

/** Oracle view ids (the store's "titles" shares the Rewards hub → maps to "forge"). */
type OracleTab = "status" | "directives" | "gates" | "body" | "fuel" | "vitals" | "records" | "forge"

const VIEW_NAME: Record<OracleTab, string> = {
  status: "STATUS OVERVIEW",
  directives: "DIRECTIVES CONSOLE",
  gates: "TRAINING GATES",
  body: "BODY ATLAS",
  fuel: "FUEL CONSOLE",
  vitals: "VITALS MONITOR",
  records: "RECORDS VAULT",
  forge: "REWARDS FORGE",
}

/** Tab-aware quick prompts — 2-3 per view; generic set when no view is known. */
const TAB_CHIPS: Record<OracleTab, string[]> = {
  status: ["Assess my progress.", "Where am I vs last month?", "What should I focus on this week?"],
  directives: ["What should I prioritize today?", "Which goals are closest to done?", "How much XP is on the table?"],
  gates: ["Should I train today?", "Which gate suits me right now?", "How do I warm up for a heavy session?"],
  body: ["Am I on track with my goals?", "Is my weight trend healthy?", "What measurements should I track?"],
  fuel: ["How close am I to my macros?", "What should I eat after training?", "Am I drinking enough water?"],
  vitals: ["How recovered am I?", "Is my resting heart rate healthy?", "How can I sleep better?"],
  records: ["Which PR should I attack next?", "How do I break my bench plateau?", "Which record is closest to falling?"],
  forge: ["What should I spend essence on?", "Which title should I chase next?", "What is worth saving up for?"],
}

const QUICK_PROMPTS = [
  "What should I train today?",
  "How do I raise my weakest stat?",
  "Review my recent progress",
]

/** The store's tab ids → Oracle view id ("titles" renders the same Rewards hub as "forge"). */
function oracleTab(raw: string | undefined): OracleTab | undefined {
  if (!raw) return undefined
  if (raw === "titles") return "forge"
  return (Object.keys(VIEW_NAME) as OracleTab[]).includes(raw as OracleTab) ? (raw as OracleTab) : undefined
}

/** The local welcome line — subtly names the console the athlete is staring at. */
function welcomeFor(view: OracleTab | undefined): ChatMessage {
  if (!view) return { role: "assistant", content: "Your coach is ready. Ask anything about your training." }
  return {
    role: "assistant",
    content: `Your coach is ready.\n◈ THE EYE RESTS ON THE ${VIEW_NAME[view]} ◈`,
  }
}

/** Left-rail bloom — the freshest oracle line ignites its border, then rests. */
const BLOOM_FROM = "inset 3px 0 14px rgba(167,139,250,0.32), 0 0 16px rgba(139,92,246,0.22)"
const BLOOM_TO = "inset 3px 0 14px rgba(167,139,250,0), 0 0 16px rgba(139,92,246,0)"

/** THE ORACLE — a floating AI advisor console. Read-only: consults, never mutates. */
export function OracleConsole({ hunter, tab: rawTab }: { hunter: HunterDTO; tab?: string }) {
  const view = oracleTab(rawTab)
  // R13-d — raid-focus: the FAB stands down while a session console is mounted
  const raidLive = useSystem((s) => s.raidLive)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const threadViewRef = useRef<OracleTab | undefined>(undefined)
  const reduce = useReducedMotion()

  // Each console owns its consultation thread: on first open — or when the
  // athlete moves to a different view — the thread re-seats on a fresh
  // welcome line, so the view-aware chips stay reachable. An in-flight reply
  // is allowed to land first (the reset follows it).
  useEffect(() => {
    if (!open || pending) return
    if (messages.length === 0 || threadViewRef.current !== view) {
      setMessages([welcomeFor(view)])
      threadViewRef.current = view
    }
  }, [open, pending, messages, view])

  // Escape key closes the console
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // Focus the input when the console opens
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Keep the latest message in view
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending, error])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || pending) return
    setError(null)
    const next: ChatMessage[] = [...messages, { role: "user", content }]
    setMessages(next)
    setInput("")
    setPending(true)
    try {
      const res = await api<{ reply: string }>("/api/oracle", {
        method: "POST",
        body: JSON.stringify({ messages: next.slice(-10), ...(view ? { tab: view } : {}) }),
      })
      setMessages((m) => [...m, { role: "assistant", content: res.reply }])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPending(false)
      inputRef.current?.focus()
    }
  }

  const showChips = !pending && messages.length <= 1
  const chips = view ? TAB_CHIPS[view] : QUICK_PROMPTS

  return (
    <>
      {/* Floating action button — the Oracle's eye, wrapped in a slow orbit ring.
          Magnetic: the FAB is the app's one cursor-attracted control.
          R13-d — the FAB stands down while a session raid is live: its fixed
          bottom-right zone sits exactly where the raid console's FINISH
          controls scroll to, and nothing may occlude the app's most important
          action mid-workout. Fades out through the same exit as the console. */}
      <AnimatePresence>
        {!raidLive && (
        <Magnetic className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: FLOW_EASE }}
          >
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setOpen(true)}
            aria-label="Consult your coach"
            aria-expanded={open}
            aria-haspopup="dialog"
            title={hunter.statPoints > 0 ? "Free points unspent — ask your coach" : undefined}
            className={cn(
              "glow-breathe group",
              "flex h-12 w-12 items-center justify-center rounded-full",
              "border border-violet-400/60 bg-violet-500/20 text-violet-200 backdrop-blur-md",
              "transition-colors hover:border-violet-300/80 hover:bg-violet-500/35 hover:text-violet-100 active:bg-violet-500/45",
              "focus-visible:outline focus-visible:outline-violet-400/70"
            )}
          >
            {/* outer dashed orbit ring — rotates slowly, pauses on hover */}
            <svg
              viewBox="0 0 100 100"
              className="oracle-ring pointer-events-none absolute -inset-2 origin-center group-hover:[animation-play-state:paused]"
              fill="none"
              aria-hidden
            >
              <circle cx="50" cy="50" r="48" stroke="rgba(167,139,250,0.4)" strokeWidth="2" strokeDasharray="4 9" />
            </svg>
            {hunter.statPoints > 0 && (
              <span aria-hidden className="sys-pulse absolute inset-0 rounded-full border-2 border-violet-400/50" />
            )}
            <Eye className="h-5 w-5" aria-hidden />
          </motion.button>
          </motion.div>
        </Magnetic>
        )}
      </AnimatePresence>

      {/* Consultation console */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Coach console"
            aria-modal="true"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
            transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 380, damping: 32 }}
            className={cn(
              "fixed bottom-36 left-3 right-3 z-40 md:bottom-20 md:left-auto md:right-6 md:w-[26rem]",
              "rounded-sm border border-violet-500/30 bg-zinc-950/95 shadow-[0_0_36px_rgba(139,92,246,0.18)] backdrop-blur-xl"
            )}
          >
            <i className="sys-corner sys-corner-tl" aria-hidden />
            <i className="sys-corner sys-corner-tr" aria-hidden />
            <i className="sys-corner sys-corner-bl" aria-hidden />
            <i className="sys-corner sys-corner-br" aria-hidden />

            {/* header — the eye glances about as it divines */}
            <div className="flex items-center gap-2.5 border-b border-violet-500/15 px-4 py-2.5">
              <div className="relative shrink-0">
                <Eye className="h-3.5 w-3.5 text-violet-400" aria-hidden />
                <span className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
                  <span className="oracle-pupil h-1 w-1 rounded-full bg-violet-200 shadow-[0_0_4px_rgba(167,139,250,0.9)]" />
                </span>
              </div>
              <div className="min-w-0">
                <DecodeText text="YOUR COACH" className="sys-label text-violet-300/90" delay={0.1} as="p" />
                <p className="mt-0.5 font-mono text-[8px] tracking-[0.3em] text-zinc-400">CONSULTATION</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close coach console"
                className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-sm text-zinc-500 transition-all hover:bg-rose-500/15 hover:text-rose-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* message stream — the scrying runs over a faint blueprint field */}
            <div className="relative">
              <div className="card-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden />
              <div
                ref={scrollRef}
                aria-live="polite"
                aria-label="Coach conversation"
                className="scroll-sys relative max-h-80 space-y-2.5 overflow-y-auto px-4 py-3"
              >
                {messages.map((m, i) => {
                  // the welcome transmission decodes into existence; replies slide in
                  const isWelcome = i === 0 && m.role === "assistant"
                  // the freshest oracle line ignites its left rail — once
                  const blooms = !reduce && m.role === "assistant" && i === messages.length - 1
                  return (
                    <motion.div
                      key={i}
                      initial={
                        reduce
                          ? { opacity: 0 }
                          : m.role === "user"
                            ? { opacity: 0, y: 8, x: 10 }
                            : { opacity: 0, y: 6, x: -6 }
                      }
                      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, x: 0 }}
                      transition={
                        m.role === "assistant"
                          ? { duration: 0.32, ease: FLOW_EASE }
                          : { duration: 0.24, ease: "easeOut" }
                      }
                      className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                    >
                      {m.role === "assistant" && (
                        <span
                          className="mt-1 mr-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-violet-500/30 bg-violet-500/10"
                          aria-hidden
                        >
                          <Eye className="h-3 w-3 text-violet-400/80" />
                        </span>
                      )}
                      <motion.div
                        className={cn(
                          "max-w-[85%] whitespace-pre-wrap rounded-sm px-3 py-2 text-xs leading-relaxed",
                          m.role === "user"
                            ? "border border-violet-400/40 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 text-violet-100 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                            : "border border-zinc-700/50 border-l-violet-400/60 bg-zinc-900/70 text-zinc-300"
                        )}
                        initial={blooms ? { boxShadow: BLOOM_FROM } : undefined}
                        animate={blooms ? { boxShadow: BLOOM_TO } : undefined}
                        transition={blooms ? { duration: 0.5, delay: 0.2 } : undefined}
                      >
                        {isWelcome
                          ? m.content.split("\n").map((line, li) => (
                              <DecodeText key={li} text={line} className="block" delay={0.18 + li * 0.14} />
                            ))
                          : m.content}
                      </motion.div>
                    </motion.div>
                  )
                })}

                {pending && (
                  <div className="flex justify-start">
                    <span
                      className="mt-1 mr-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-violet-500/30 bg-violet-500/10"
                      aria-hidden
                    >
                      <Eye className="sys-pulse h-3 w-3 text-violet-400/80" />
                    </span>
                    <div className="rounded-sm border border-zinc-700/50 border-l-violet-400/60 bg-zinc-900/70 px-3 py-2">
                      <span className="flex items-center gap-2.5">
                        <span className="flex items-end gap-1" aria-hidden>
                          {[0, 1, 2].map((d) => (
                            <span
                              key={d}
                              className="oracle-dot h-1 w-1 rounded-full bg-violet-400"
                              style={{ animationDelay: `${d * 0.18}s` }}
                            />
                          ))}
                        </span>
                        <span className="font-mono text-[10px] tracking-[0.25em] text-zinc-400">
                          THINKING<span className="sys-blink ml-1 text-violet-400" aria-hidden>▊</span>
                        </span>
                      </span>
                      <span className="sr-only">The coach is reviewing your records</span>
                    </div>
                  </div>
                )}

                {error && (
                  <p
                    role="alert"
                    className="border-l-2 border-rose-500/70 pl-2 font-mono text-[10px] tracking-widest text-amber-400/90"
                  >
                    ▲ {error}
                  </p>
                )}

                {showChips && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <p className="sys-label text-[8px] text-zinc-400">SUGGESTED QUERIES</p>
                    {chips.map((p, idx) => (
                      <motion.button
                        key={p}
                        onClick={() => send(p)}
                        whileTap={{ scale: 0.98 }}
                        className="flex min-h-11 items-center gap-2.5 rounded-sm border border-zinc-700/60 bg-zinc-950/50 px-3 py-2.5 text-left text-[11px] text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-violet-400/70 hover:bg-violet-500/10 hover:text-violet-200 hover:shadow-[0_0_14px_rgba(139,92,246,0.25)] active:translate-y-0 active:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
                      >
                        <span
                          className="sys-display-hollow shrink-0 font-mono text-[15px] font-black leading-none tabular-nums"
                          aria-hidden
                        >
                          {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">{p}</span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* input row */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
              className="flex items-center gap-2 border-t border-violet-500/15 px-3 py-2.5"
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={pending}
                maxLength={500}
                placeholder="Ask your coach…"
                aria-label="Message your coach"
                className="h-11 min-w-0 flex-1 rounded-sm border border-zinc-700/60 bg-zinc-950/60 px-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={pending || input.trim().length === 0}
                aria-label="Send message to your coach"
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-sm",
                  "border border-violet-500/40 bg-violet-500/15 text-violet-300 transition-all",
                  "hover:border-violet-400/70 hover:bg-violet-500/30 active:bg-violet-500/40",
                  "disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                )}
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
