"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useSystem } from "@/store/system-store"
import { FLOW_EASE } from "@/components/system/motion"
import { flushQueue, getQueue, subscribe } from "@/lib/offline-queue"
import { cn } from "@/lib/utils"

/**
 * OfflineIndicator — the floating offline-queue badge (R5).
 *
 * HIDDEN   online + empty queue (and no flash) — renders nothing
 * OFFLINE  amber · "OFFLINE · N QUEUED" while the link is down
 * QUEUED   violet · "N QUEUED — TAP TO SYNC" — online with items still parked
 *          (e.g. a 5xx kept them for retry); the whole badge is the button
 * SYNCING  teal · "SYNCING N OPS…" with a pulsing dot while a round replays
 * SYNCED   emerald flash · "QUEUE SYNCED ✓" (+ rose "N REJECTED" line) ~2.4s
 *
 * Auto-flushes on mount and on the window "online" event; after a flush the
 * global refresh key bumps so every panel reloads fresh data. Other tabs get
 * the same treatment through the queue's storage-event sync (their badge sees
 * the count drop and they bump + flash too). Sits above the mobile bottom nav.
 */

const FLASH_MS = 2400

type Mode = "offline" | "syncing" | "synced" | "queued" | "hidden"

type Flash = { synced: number; rejected: number }

const SKIN: Record<Exclude<Mode, "hidden">, { border: string; text: string; tint: string }> = {
  offline: { border: "border-amber-500/50", text: "text-amber-200", tint: "bg-amber-500/10" },
  syncing: { border: "border-teal-400/50", text: "text-teal-200", tint: "bg-teal-500/10" },
  synced: { border: "border-emerald-500/50", text: "text-emerald-300", tint: "bg-emerald-500/10" },
  queued: { border: "border-violet-400/50", text: "text-violet-200", tint: "bg-violet-400/10" },
}

export function OfflineIndicator() {
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  const pushNotice = useSystem((s) => s.pushNotice)
  const reduce = useReducedMotion()

  // mounted gate: SSR + first client render produce nothing (hydration-safe);
  // the badge then enters with its slide-in, so nothing visible is lost
  const [mounted, setMounted] = useState(false)
  const [online, setOnline] = useState(true)
  const [count, setCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncTotal, setSyncTotal] = useState(0)
  const [flash, setFlash] = useState<Flash | null>(null)

  const countRef = useRef(0)
  const inFlightRef = useRef(false)

  // ── flush runner (re-entrancy-guarded; always safe to spam) ────────────────
  const runFlush = useCallback(async () => {
    if (inFlightRef.current) return
    if (typeof navigator !== "undefined" && !navigator.onLine) return
    const queued = getQueue()
    if (queued.length === 0) return
    inFlightRef.current = true
    setSyncTotal(queued.length)
    setSyncing(true)
    try {
      const res = await flushQueue()
      if (res.synced > 0 || res.rejected.length > 0) {
        setFlash({ synced: res.synced, rejected: res.rejected.length })
        if (res.rejected.length > 0) {
          pushNotice({
            kind: "warn",
            title: `OFFLINE QUEUE — ${res.rejected.length} REJECTED`,
            body: res.rejected[0],
          })
        }
      }
      // queued mutations just landed — reload every panel's data
      if (res.synced > 0) bumpRefresh()
    } catch {
      // flushQueue guards its own failures — this is just a stuck-badge hedge
    } finally {
      inFlightRef.current = false
      setSyncing(false)
      const c = getQueue().length
      countRef.current = c
      setCount(c)
    }
  }, [bumpRefresh, pushNotice])

  // ── mount: adopt real state, subscribe, auto-flush leftovers ───────────────
  useEffect(() => {
    setMounted(true)
    setOnline(navigator.onLine)
    const initial = getQueue().length
    countRef.current = initial
    setCount(initial)

    // queue-count listener — fires for same-tab writes AND cross-tab storage
    const handleCount = (c: number) => {
      const prev = countRef.current
      countRef.current = c
      setCount(c)
      // another tab flushed while we were idle: mirror the flash + reload here
      if (c < prev && !inFlightRef.current && navigator.onLine) {
        bumpRefresh()
        setFlash({ synced: prev - c, rejected: 0 })
      }
    }
    const unsub = subscribe(handleCount)

    const onOnline = () => {
      setOnline(true)
      void runFlush() // self-guards: offline / empty / already-flushing
    }
    const onOffline = () => setOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    if (navigator.onLine && initial > 0) void runFlush()

    return () => {
      unsub()
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [runFlush, bumpRefresh])

  // ── synced flash: show ~2.4s, then vanish (if queue empty + online) ────────
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(t)
  }, [flash])

  if (!mounted) return null

  const mode: Mode = syncing
    ? "syncing"
    : !online
      ? "offline"
      : flash
        ? "synced"
        : count > 0
          ? "queued"
          : "hidden"

  const skin = mode === "hidden" ? null : SKIN[mode]
  const flashRejected = flash?.rejected ?? 0

  const label = syncing
    ? `Syncing ${syncTotal} queued operations`
    : !online
      ? count > 0
        ? `Offline — ${count} operations queued, will auto-sync when the link returns`
        : "Offline"
      : flash
        ? flashRejected > 0
          ? `Queue synced — ${flash.synced} replayed, ${flashRejected} rejected`
          : `Queue synced — ${flash.synced} operations replayed`
        : count > 0
          ? `${count} operations queued — tap to sync now`
          : ""

  return (
    <div role="status" aria-live="polite" className="fixed bottom-24 left-4 z-50 md:bottom-6">
      <AnimatePresence>
        {skin && (
          <motion.button
            key="offline-indicator"
            type="button"
            onClick={() => void runFlush()}
            disabled={mode !== "queued"}
            aria-label={label}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -16 }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: FLOW_EASE }}
            className={cn(
              "grove-press relative flex min-h-11 min-w-11 max-w-[calc(100vw-2rem)] items-center overflow-hidden rounded-full border bg-black/70 px-3.5 py-2 text-left backdrop-blur-sm",
              "sys-label text-[10px] leading-tight transition-colors",
              "focus-visible:outline focus-visible:outline-violet-400/70",
              skin.border,
              skin.text,
              mode === "queued" && "cursor-pointer hover:border-violet-400/80",
            )}
          >
            {/* mode tint washed over the black/70 base */}
            <span aria-hidden className={cn("absolute inset-0 rounded-full transition-colors", skin.tint)} />
            <span className="relative flex items-center gap-2">
              {mode === "syncing" && (
                <motion.span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300"
                  animate={reduce ? undefined : { opacity: [1, 0.35, 1], scale: [1, 0.8, 1] }}
                  transition={reduce ? undefined : { duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              {mode === "offline" && (
                <span className="tabular-nums">Offline{count > 0 ? ` · ${count} queued` : ""}</span>
              )}
              {mode === "syncing" && <span className="tabular-nums">Syncing {syncTotal} ops…</span>}
              {mode === "synced" && (
                <span className="flex flex-col gap-0.5">
                  <span>Queue synced ✓</span>
                  {flashRejected > 0 && (
                    <span className="tabular-nums text-rose-300">{flashRejected} rejected</span>
                  )}
                </span>
              )}
              {mode === "queued" && <span className="tabular-nums">{count} queued — tap to sync</span>}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
