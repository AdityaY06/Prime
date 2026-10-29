"use client"

import { create } from "zustand"

// ─── PRIME · Rest timer store (R28-c — super exercise helper tools) ───────────
// The persistent countdown behind the floating RestTimerWidget. Timer STATE
// lives here (module-level zustand, follows system-store.ts patterns) so the
// countdown survives every tab switch — the widget derives "remaining" from
// `restEndsAt` (wall-clock epoch ms) on a 250ms interval while IT is mounted,
// which means background tabs stop ticking (battery) and catch up instantly
// on return: the deadline is absolute, not accumulated.
//
// Deliberately NOT persisted to localStorage: a rest countdown is an
// in-session ephemeral — surviving tab switches (this store, mounted at the
// layout level alongside OfflineIndicator) is the whole requirement; a
// reload legitimately starts a clean slate.
//
// Pausing snapshots the remaining seconds into `pausedRemaining` and nulls
// `restEndsAt`; resuming re-arms a fresh deadline. `adjust(±seconds)` works
// running OR paused, and revives a completed timer when nudged forward.

type RestTimerState = {
  /** Epoch-ms deadline of the running countdown; null while idle OR paused. */
  restEndsAt: number | null
  /** Total seconds the current rest was set to (ring denominator, label). */
  restTotal: number
  /** True while the countdown is held. */
  paused: boolean
  /** Seconds banked at pause; null while running or idle. */
  pausedRemaining: number | null
  /** Context label (the exercise that armed the rest); null for bare presets. */
  label: string | null

  /** Arm a fresh countdown (seconds, clamped ≥ 1) with an optional label. */
  start: (seconds: number, label?: string | null) => void
  /** Hold the countdown, banking the remaining seconds. No-op when idle/paused. */
  pause: () => void
  /** Re-arm the countdown from the banked seconds. No-op when not paused. */
  resume: () => void
  /** ±seconds on the live or paused countdown (clamped ≥ 0); +n revives a
   *  completed timer. No-op when fully idle. */
  adjust: (deltaSeconds: number) => void
  /** Clear everything — the ✕ button and the post-completion auto-dismiss. */
  dismiss: () => void
}

export const useRestTimer = create<RestTimerState>((set, get) => ({
  restEndsAt: null,
  restTotal: 0,
  paused: false,
  pausedRemaining: null,
  label: null,

  start: (seconds, label = null) => {
    const s = Math.max(1, Math.round(Number.isFinite(seconds) ? seconds : 0))
    set({ restEndsAt: Date.now() + s * 1000, restTotal: s, paused: false, pausedRemaining: null, label })
  },

  pause: () => {
    const { restEndsAt, paused } = get()
    if (restEndsAt === null || paused) return
    const banked = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000))
    set({ paused: true, pausedRemaining: banked, restEndsAt: null })
  },

  resume: () => {
    const { paused, pausedRemaining } = get()
    if (!paused || pausedRemaining === null) return
    set({ paused: false, pausedRemaining: null, restEndsAt: Date.now() + pausedRemaining * 1000 })
  },

  adjust: (deltaSeconds) => {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return
    const { restEndsAt, paused, pausedRemaining, restTotal } = get()
    // paused: shift the bank
    if (paused && pausedRemaining !== null) {
      set({
        pausedRemaining: Math.max(0, pausedRemaining + deltaSeconds),
        restTotal: Math.max(1, restTotal + deltaSeconds),
      })
      return
    }
    // running (or complete — a nudge forward revives it from now)
    if (restEndsAt === null) return
    const nextEnds = restEndsAt + deltaSeconds * 1000
    set({
      restEndsAt: nextEnds > Date.now() ? nextEnds : Date.now(),
      restTotal: Math.max(1, restTotal + deltaSeconds),
    })
  },

  dismiss: () =>
    set({ restEndsAt: null, restTotal: 0, paused: false, pausedRemaining: null, label: null }),
}))
