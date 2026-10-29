"use client"

import { create } from "zustand"
import type { RewardResult } from "@/lib/types"

export type Tab =
  | "home"
  | "train"
  | "log"
  | "stats"
  | "science"
  | "you"
  | "status"
  | "directives"
  | "gates"
  | "records"
  | "titles"
  | "forge"
  | "body"
  | "fuel"
  | "vitals"

/** R57 CLEAN SLATE — the six-facade ring (Home / Train / Log / Stats /
 * Science / You). R70-a adds Science — the research registry + manifesto +
 * personalized digest surface. The eight legacy tabs stay valid Tab values:
 * their components mount behind each facade's ShowEverything expander
 * (merge & hide — never delete). */
export const TAB_ORDER: Tab[] = ["home", "train", "log", "stats", "science", "you"]

export type SystemNotice = {
  id: string
  kind: "xp" | "info" | "warn" | "title"
  title: string
  body?: string
}

export type RewardView = RewardResult & {
  volumeKg?: number
  pushupsInSession?: number
  durationMin?: number
  questTitle?: string
  statGained?: { stat: string; amount: number } | null
  pointReward?: number
  source?: "gate" | "quest"
  prCount?: number
  newRecords?: import("@/lib/types").PrInfo[]
  essenceGained?: number
  riftBonus?: boolean
}

type SystemState = {
  tab: Tab
  setTab: (t: Tab) => void

  /** +1 the last tab move went forward on the ring, -1 back, 0 initial/same —
   *  drives directional page transitions in the shell (R9). */
  tabDirection: 1 | -1 | 0
  /** Move `delta` steps along TAB_ORDER (clamped at the ends; no-op off-ring). */
  goTab: (delta: number) => void

  refreshKey: number
  bumpRefresh: () => void

  /** R13-d — true while the session-raid console is MOUNTED (any tab). The
   *  Oracle FAB hides for its duration: the raid's FINISH/ABANDON controls live
   *  in the same bottom-right zone and a 48px floating button must never sit
   *  on top of the app's most important action mid-workout. */
  raidLive: boolean
  setRaidLive: (v: boolean) => void

  notices: SystemNotice[]
  pushNotice: (n: Omit<SystemNotice, "id">) => void
  dismissNotice: (id: string) => void

  reward: RewardView | null
  showReward: (r: RewardView) => void
  dismissReward: () => void

  /** The System Voice — queued TTS announcements. */
  voiceEnabled: boolean
  setVoiceEnabled: (v: boolean) => void
  speaking: boolean
  setSpeaking: (v: boolean) => void
  voiceQueue: string[]
  speak: (text: string) => void
  shiftVoice: () => void
  clearVoice: () => void
}

let noticeSeq = 0

export const VOICE_STORAGE_KEY = "ascendant-voice"

export const useSystem = create<SystemState>((set, get) => ({
  tab: "status",
  tabDirection: 0,
  setTab: (tab) => {
    if (tab === get().tab) return
    const from = TAB_ORDER.indexOf(get().tab)
    const to = TAB_ORDER.indexOf(tab)
    const tabDirection: 1 | -1 | 0 =
      from === -1 || to === -1 ? 0 : to > from || (from === TAB_ORDER.length - 1 && to === 0) ? 1 : to < from || (from === 0 && to === TAB_ORDER.length - 1) ? -1 : 0
    set({ tab, tabDirection })
  },
  goTab: (delta) => {
    const i = TAB_ORDER.indexOf(get().tab)
    if (i === -1) return
    const next = Math.min(TAB_ORDER.length - 1, Math.max(0, i + Math.sign(delta)))
    if (next === i) return
    set({ tab: TAB_ORDER[next], tabDirection: delta > 0 ? 1 : -1 })
  },

  refreshKey: 0,
  bumpRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),

  raidLive: false,
  setRaidLive: (v) => set({ raidLive: v }),

  notices: [],
  pushNotice: (n) => {
    const id = `n-${Date.now()}-${noticeSeq++}`
    set((s) => ({ notices: [...s.notices.slice(-4), { ...n, id }] }))
    // auto-dismiss after 4.5s
    setTimeout(() => {
      set((s) => ({ notices: s.notices.filter((x) => x.id !== id) }))
    }, 4500)
  },
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((x) => x.id !== id) })),

  reward: null,
  showReward: (reward) => set({ reward }),
  dismissReward: () => set({ reward: null }),

  voiceEnabled: true,
  setVoiceEnabled: (v) => {
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, v ? "1" : "0")
    } catch {
      // storage unavailable — keep in-memory only
    }
    set(v ? { voiceEnabled: v } : { voiceEnabled: v, voiceQueue: [], speaking: false })
  },
  speaking: false,
  setSpeaking: (v) => set({ speaking: v }),
  voiceQueue: [],
  speak: (text) => {
    const clean = text.replace(/\s+/g, " ").trim()
    if (!clean || !get().voiceEnabled) return
    set((s) => ({ voiceQueue: [...s.voiceQueue.slice(-5), clean] }))
  },
  shiftVoice: () => set((s) => ({ voiceQueue: s.voiceQueue.slice(1) })),
  clearVoice: () => set({ voiceQueue: [], speaking: false }),
}))

/** Hydrate the voice preference from localStorage (call once, client-side). */
export function hydrateVoicePref() {
  try {
    const stored = window.localStorage.getItem(VOICE_STORAGE_KEY)
    if (stored === "0") useSystem.setState({ voiceEnabled: false })
  } catch {
    // ignore
  }
}
