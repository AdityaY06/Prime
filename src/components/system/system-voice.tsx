"use client"

import { useEffect, useRef } from "react"
import { useSystem } from "@/store/system-store"

/**
 * THE VOICE OF THE SYSTEM — headless TTS engine.
 *
 * Consumes the store's voice queue sequentially: each entry is POSTed to
 * /api/tts (server-side z-ai-web-dev-sdk, "jam" voice), cached as an object
 * URL, and played through a fresh <audio> element. Failures are silent —
 * the voice is a bonus channel, never a blocker.
 */
export function SystemVoice() {
  const voiceQueue = useSystem((s) => s.voiceQueue)
  const voiceEnabled = useSystem((s) => s.voiceEnabled)
  const shiftVoice = useSystem((s) => s.shiftVoice)
  const setSpeaking = useSystem((s) => s.setSpeaking)

  const cacheRef = useRef<Map<string, string>>(new Map()) // text → objectURL
  const playingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Stop the current announcement the moment the user mutes the System.
  useEffect(() => {
    if (!voiceEnabled && audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      playingRef.current = false
    }
  }, [voiceEnabled])

  useEffect(() => {
    if (playingRef.current || voiceQueue.length === 0 || !voiceEnabled) return
    const text = voiceQueue[0]
    playingRef.current = true
    setSpeaking(true)

    const run = async () => {
      try {
        let url = cacheRef.current.get(text)
        if (!url) {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          })
          if (!res.ok) throw new Error(`tts ${res.status}`)
          const blob = await res.blob()
          if (blob.size < 100) throw new Error("empty audio")
          url = URL.createObjectURL(blob)
          cacheRef.current.set(text, url)
          // evict oldest (keep ~30 clips)
          if (cacheRef.current.size > 30) {
            const oldest = cacheRef.current.keys().next().value
            if (oldest !== undefined) {
              const stale = cacheRef.current.get(oldest)
              if (stale) URL.revokeObjectURL(stale)
              cacheRef.current.delete(oldest)
            }
          }
        }

        const audio = new Audio(url)
        audioRef.current = audio
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve()
          audio.onerror = () => resolve()
          audio.play().catch(() => resolve())
        })
      } catch {
        // silent — voice channel only
      } finally {
        audioRef.current = null
        playingRef.current = false
        // Always advance the queue — a missed shift would deadlock it.
        // (Zustand state lives outside React, so post-cleanup sets are safe.)
        setSpeaking(false)
        shiftVoice()
      }
    }

    void run()
  }, [voiceQueue, voiceEnabled, shiftVoice, setSpeaking])

  return null
}
