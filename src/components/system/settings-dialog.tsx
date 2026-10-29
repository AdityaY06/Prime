"use client"

// ─── SYSTEM SETTINGS dialog ────────────────────────────────────────────────────
// Identity rename · System Voice · offline/offline-shell status · PWA install ·
// vault export · DANGER ZONE erase (R34-b — the honest exit: type-the-name
// interlock, DELETE /api/hunter, reload → awakening). Opened from the TopNav
// gear. Deliberately self-contained: it owns its own beforeinstallprompt /
// online / service-worker listeners and stays decoupled from SWRegister.

import { useEffect, useRef, useState } from "react"
import { Download, ShieldAlert, TriangleAlert, Trash2, Volume2 } from "lucide-react"
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FLOW_EASE } from "@/components/system/motion"
import { ONBOARDING_GOAL_KEY } from "@/components/fitness/guided-steps"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { useSystem } from "@/store/system-store"
import { api } from "@/hooks/use-api"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Minimal BeforeInstallPromptEvent shape (not part of the TS DOM lib). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const NAME_MIN = 2
const NAME_MAX = 24
const VOICE_PREVIEW_LINE = "System voice calibrated. The Oracle is listening."

// shared 44px system button chrome
const SYS_BTN =
  "flex h-11 w-full items-center justify-center gap-2 rounded-sm border px-4 font-mono text-[10px] font-bold tracking-[0.25em] uppercase transition-all focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50"

function SectionLabel({ children }: { children: string }) {
  return <p className="sys-label text-[9px] text-zinc-400">{children}</p>
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        "sys-pulse h-1.5 w-1.5 rounded-full",
        online
          ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
          : "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.9)]"
      )}
      aria-hidden
    />
  )
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

export function SettingsDialog({
  open,
  onOpenChange,
  hunterName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  hunterName: string
}) {
  const voiceEnabled = useSystem((s) => s.voiceEnabled)
  const setVoiceEnabled = useSystem((s) => s.setVoiceEnabled)
  const speak = useSystem((s) => s.speak)
  const pushNotice = useSystem((s) => s.pushNotice)
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  const reduce = useReducedMotion() ?? false

  // ── IDENTITY ────────────────────────────────────────────────────────────────
  const [name, setName] = useState(hunterName)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // resync the field from the live hunter prop while it isn't being edited
  // (bumpRefresh() after a save flows the fresh name back in through TopNav)
  useEffect(() => {
    if (!dirty) setName(hunterName)
  }, [hunterName, dirty])

  const trimmed = name.trim()
  const nameError =
    trimmed.length < NAME_MIN
      ? `TOO SHORT — ${NAME_MIN}–${NAME_MAX} CHARACTERS REQUIRED`
      : trimmed.length > NAME_MAX
        ? `TOO LONG — ${NAME_MIN}–${NAME_MAX} CHARACTERS ALLOWED`
        : null

  const saveIdentity = async () => {
    setServerError(null)
    if (nameError) return // inline validation blocks the fetch
    if (trimmed === hunterName) {
      setDirty(false) // no-op edit — just clean the dirty state
      return
    }
    setSaving(true)
    try {
      await api<{ hunter: HunterDTO }>("/api/hunter", {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      })
      setDirty(false)
      pushNotice({
        kind: "info",
        title: "IDENTITY UPDATED",
        body: `${hunterName} → ${trimmed}`,
      })
      bumpRefresh()
    } catch (e) {
      setServerError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── OFFLINE LINK + OFFLINE SHELL ─────────────────────────────────────────────
  const [online, setOnline] = useState(true)
  const [swReady, setSwReady] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener("online", goOnline)
    window.addEventListener("offline", goOffline)
    return () => {
      window.removeEventListener("online", goOnline)
      window.removeEventListener("offline", goOffline)
    }
  }, [])

  // the shell row goes READY once this page is actually controlled by /sw.js
  // (controllerchange + focus + a short poll while the dialog is open)
  useEffect(() => {
    if (!open) return
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined
    const check = () => setSwReady(!!sw?.controller)
    check()
    const onControllerChange = () => setSwReady(true)
    const onFocus = () => check()
    window.addEventListener("focus", onFocus)
    sw?.addEventListener("controllerchange", onControllerChange)
    const poll = setInterval(check, 1500)
    return () => {
      window.removeEventListener("focus", onFocus)
      sw?.removeEventListener("controllerchange", onControllerChange)
      clearInterval(poll)
    }
  }, [open])

  // ── INSTALL ──────────────────────────────────────────────────────────────────
  const [canInstall, setCanInstall] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const installEvtRef = useRef<InstallPromptEvent | null>(null)

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault() // stop the mini-infobar; PRIME owns the moment
      installEvtRef.current = e as InstallPromptEvent
      setCanInstall(true)
    }
    const onAppInstalled = () => {
      installEvtRef.current = null
      setCanInstall(false)
      setStandalone(true)
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)
    setStandalone(window.matchMedia("(display-mode: standalone)").matches)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
    }
  }, [])

  const installPrime = async () => {
    const evt = installEvtRef.current
    if (!evt) return
    try {
      await evt.prompt()
      await evt.userChoice
    } catch {
      /* prompt unavailable — fall back to the browser menu hint */
    }
    installEvtRef.current = null
    setCanInstall(false)
  }

  // ── DATA: vault export ───────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)

  // ── DANGER ZONE: erase (R34-b) ── the honest exit, mirroring the DataVault
  // restore's two-step arm discipline + a type-the-name interlock: the ERASE
  // button stays dead until the typed text EXACTLY equals this profile's name
  // (case-sensitive, trimmed). The name is the key, never a body parameter —
  // the server erases whoever the device cookie resolves to.
  const [eraseArmed, setEraseArmed] = useState(false)
  const [eraseTyped, setEraseTyped] = useState("")
  const [erasing, setErasing] = useState(false)
  const [eraseError, setEraseError] = useState<string | null>(null)

  // the chamber relocks whenever the dialog closes (Radix unmounts content,
  // but this state lives on the persistent component)
  useEffect(() => {
    if (!open) {
      setEraseArmed(false)
      setEraseTyped("")
      setEraseError(null)
    }
  }, [open])

  const eraseUnlocked = eraseTyped.trim() === hunterName

  const eraseProfile = async () => {
    if (erasing || !eraseUnlocked) return
    setErasing(true)
    setEraseError(null)
    try {
      await api("/api/hunter", { method: "DELETE" })
      // the local-only onboarding preference must not outlive its profile
      try {
        window.localStorage.removeItem(ONBOARDING_GOAL_KEY)
      } catch {
        /* storage unavailable — nothing to clear */
      }
      // the server already cleared the identity cookie → reload →
      // GET /api/hunter 404 → AwakeningScreen renders. The awakening IS
      // the confirmation — a toast would die in the reload anyway.
      window.location.reload()
    } catch (e) {
      setEraseError((e as Error).message)
      setErasing(false)
    }
  }

  const exportVault = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/vault")
      if (!res.ok) throw new Error(`Vault fetch failed (${res.status})`)
      const blob = await res.blob()
      const day = new Date().toISOString().slice(0, 10)
      const filename = `prime-export-${day}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      pushNotice({ kind: "info", title: "SAVE FILE EXPORTED", body: filename })
    } catch (e) {
      pushNotice({
        kind: "warn",
        title: "EXPORT FAILED",
        body: (e as Error).message,
      })
    } finally {
      setExporting(false)
    }
  }

  // ── SYSTEM VOICE preview (no-ops while muted — speak() gates on voiceEnabled)
  const previewVoice = () => speak(VOICE_PREVIEW_LINE)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sys-panel max-w-md rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl"
      >
        {/* R5-c — open cascade: header → identity → voice → offline → install → data */}
        <motion.div {...cascadeStep(reduce, 0)}>
          <DialogHeader className="border-b border-violet-500/10 px-5 py-4">
            <DialogTitle className="sys-label text-violet-300/80">
              System Settings
            </DialogTitle>
          </DialogHeader>
        </motion.div>

        <div className="scroll-sys max-h-[80vh] overflow-y-auto p-5">
          {/* ── IDENTITY ── */}
          <motion.section {...cascadeStep(reduce, 1)} className="space-y-3" aria-label="Identity">
            <SectionLabel>IDENTITY</SectionLabel>
            <div className="flex items-center justify-between rounded-sm border border-violet-500/15 bg-violet-500/5 px-3 py-2">
              <span className="sys-label text-[8px] text-zinc-400">CURRENT</span>
              <span
                className="font-mono text-sm font-bold tracking-widest text-violet-100"
                data-testid="settings-current-name"
              >
                {hunterName}
              </span>
            </div>
            <div>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setDirty(true)
                  setServerError(null)
                }}
                aria-label="New identity name"
                aria-invalid={dirty && !!nameError}
                placeholder={`${NAME_MIN}–${NAME_MAX} characters`}
                autoComplete="off"
                spellCheck={false}
                className="h-11 rounded-sm border-violet-500/20 bg-zinc-900/60 font-mono text-sm tracking-widest text-violet-100 placeholder:text-zinc-700"
              />
              <div className="mt-1.5 flex min-h-4 items-center justify-between gap-2">
                <p className="font-mono text-[9px] tracking-widest text-zinc-400 tabular-nums">
                  {trimmed.length}/{NAME_MAX}
                </p>
                {(dirty && nameError) || serverError ? (
                  <p
                    role="alert"
                    className="font-mono text-[9px] tracking-widest text-rose-300"
                  >
                    {(dirty && nameError) || serverError}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={saveIdentity}
              disabled={saving || (dirty && !!nameError)}
              className={cn(
                SYS_BTN,
                "border-violet-400/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
              )}
            >
              {saving ? "SAVING…" : "SAVE IDENTITY"}
            </button>
          </motion.section>

          {/* ── SYSTEM VOICE ── */}
          <motion.section
            {...cascadeStep(reduce, 2)}
            className="mt-5 space-y-3 border-t border-violet-500/10 pt-5"
            aria-label="System voice"
          >
            <SectionLabel>SYSTEM VOICE</SectionLabel>
            {/* R5-c — the whole 44px row gets a spring pop when the voice is flipped */}
            <motion.div
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3"
              whileTap={
                reduce
                  ? undefined
                  : { scale: 0.96, transition: { type: "spring", stiffness: 500, damping: 28 } }
              }
              onClick={(e) => {
                // the whole row is the 44px touch target; direct clicks on the
                // switch itself are left to the switch to avoid double-toggling
                if ((e.target as HTMLElement).closest("[data-slot='switch']")) return
                setVoiceEnabled(!voiceEnabled)
              }}
            >
              <div>
                <p className="font-mono text-xs font-bold tracking-widest text-zinc-300">
                  VOICE {voiceEnabled ? "ON" : "MUTED"}
                </p>
                <p className="mt-1 font-mono text-[9px] leading-relaxed text-zinc-400">
                  TTS ANNOUNCEMENTS — REWARDS · READINESS · ORACLE
                </p>
              </div>
              <Switch
                checked={voiceEnabled}
                onCheckedChange={setVoiceEnabled}
                aria-label="System voice"
              />
            </motion.div>
            <button
              type="button"
              onClick={previewVoice}
              className={cn(
                SYS_BTN,
                "border-zinc-700/60 bg-zinc-900/60 text-zinc-300 hover:border-violet-400/40 hover:text-violet-200"
              )}
            >
              <Volume2 className="h-3.5 w-3.5" aria-hidden />
              PREVIEW VOICE
            </button>
          </motion.section>

          {/* ── OFFLINE ── */}
          <motion.section
            {...cascadeStep(reduce, 3)}
            className="mt-5 space-y-2 border-t border-violet-500/10 pt-5"
            aria-label="Offline status"
          >
            <SectionLabel>OFFLINE</SectionLabel>
            <div className="flex items-center justify-between rounded-sm border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5">
              <span className="sys-label text-[8px] text-zinc-400">LINK</span>
              <span className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-widest">
                <StatusDot online={online} />
                <span className={online ? "text-emerald-300" : "text-rose-300"}>
                  {online ? "ONLINE" : "OFFLINE"}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between rounded-sm border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5">
              <span className="sys-label text-[8px] text-zinc-400">OFFLINE SHELL</span>
              <span
                className={cn(
                  "font-mono text-[10px] font-bold tracking-widest",
                  swReady ? "text-emerald-300" : "text-amber-300/90"
                )}
              >
                {swReady ? "READY ✓" : "ARMING…"}
              </span>
            </div>
          </motion.section>

          {/* ── INSTALL ── */}
          <motion.section
            {...cascadeStep(reduce, 4)}
            className="mt-5 space-y-3 border-t border-violet-500/10 pt-5"
            aria-label="Install"
          >
            <SectionLabel>INSTALL</SectionLabel>
            {standalone ? (
              <p className="rounded-sm border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-center font-mono text-[10px] font-bold tracking-widest text-emerald-300">
                INSTALLED ✓ — RUNNING AS AN APP
              </p>
            ) : canInstall ? (
              <button
                type="button"
                onClick={installPrime}
                className={cn(
                  SYS_BTN,
                  "border-violet-400/50 bg-violet-500/20 text-violet-100 shadow-[0_0_14px_rgba(139,92,246,0.25)] hover:bg-violet-500/30"
                )}
              >
                INSTALL PRIME
              </button>
            ) : (
              <p className="font-mono text-[9px] leading-relaxed tracking-widest text-zinc-400">
                ADD PRIME FROM YOUR BROWSER&rsquo;S INSTALL/SHARE MENU
              </p>
            )}
          </motion.section>

          {/* ── DATA ── */}
          <motion.section
            {...cascadeStep(reduce, 5)}
            className="mt-5 space-y-3 border-t border-violet-500/10 pt-5"
            aria-label="Data"
          >
            <SectionLabel>DATA</SectionLabel>
            <p className="font-mono text-[9px] leading-relaxed tracking-widest text-zinc-400">
              FULL BACKUP — HUNTER · SESSIONS · QUESTS · RECORDS · FUEL · VITALS
            </p>
            <button
              type="button"
              onClick={exportVault}
              disabled={exporting}
              className={cn(
                SYS_BTN,
                "border-teal-500/35 bg-teal-500/10 text-teal-200 hover:bg-teal-500/20"
              )}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {exporting ? "EXPORTING…" : "EXPORT SAVE FILE"}
            </button>
          </motion.section>

          {/* ── DANGER ZONE — erase (R34-b) ── the honest exit: two-step arm +
              type-the-name interlock; DELETE /api/hunter wipes the server-side
              ledger and clears the device token → reload → awakening. */}
          <motion.section
            {...cascadeStep(reduce, 6)}
            className="mt-5 space-y-3 border-t border-rose-500/20 pt-5"
            aria-label="Danger zone"
          >
            <SectionLabel>DANGER ZONE</SectionLabel>
            <div className="rounded-sm border border-rose-500/25 bg-rose-500/[0.04] p-3.5" aria-busy={erasing}>
              <p className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.25em] text-rose-300/90 uppercase">
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> ERASE THIS DEVICE&apos;S PROFILE
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Leaving for good? This wipes workouts, PRs, body metrics, XP, titles, fuel logs — everything bound to
                this device&apos;s profile — from the server. There is no undo.
              </p>
              <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-teal-300">
                <Download className="h-3 w-3 shrink-0" aria-hidden /> EXPORT FIRST — THE JSON ABOVE IS THE ONLY COPY ONCE THIS IS GONE.
              </p>

              {!eraseArmed ? (
                <button
                  type="button"
                  onClick={() => setEraseArmed(true)}
                  className={cn(
                    SYS_BTN,
                    "mt-3 border-rose-500/50 bg-transparent text-rose-300 hover:border-rose-400/70 hover:bg-rose-500/10"
                  )}
                >
                  <ShieldAlert className="h-4 w-4" aria-hidden /> ARM ERASE
                </button>
              ) : (
                <div className="mt-3">
                  <p
                    role="alert"
                    className="flex items-center gap-2 rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] leading-snug text-rose-300"
                  >
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Final confirmation — type your name to unlock the erase.
                  </p>
                  <label
                    htmlFor="settings-erase-confirm"
                    className="mt-3 block font-mono text-[10px] tracking-[0.2em] text-zinc-500"
                  >
                    TYPE <span className="text-zinc-300">{hunterName}</span> TO CONFIRM
                  </label>
                  <input
                    id="settings-erase-confirm"
                    type="text"
                    value={eraseTyped}
                    maxLength={NAME_MAX + 8}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={erasing}
                    onChange={(e) => {
                      setEraseTyped(e.target.value)
                      setEraseError(null)
                    }}
                    aria-invalid={!eraseUnlocked || undefined}
                    aria-describedby="settings-erase-feedback"
                    className={cn(
                      "h-11 w-full rounded-sm border bg-zinc-900/60 px-3 font-mono text-sm tracking-widest outline-none transition-colors",
                      "focus-visible:outline focus-visible:outline-rose-400/70 disabled:cursor-not-allowed disabled:opacity-50",
                      eraseUnlocked
                        ? "border-rose-500/60 text-rose-200"
                        : "border-zinc-700/70 text-zinc-100"
                    )}
                  />
                  <div id="settings-erase-feedback" className="mt-2 min-h-4" aria-live="polite">
                    {eraseError ? (
                      <p role="alert" className="font-mono text-[9px] tracking-widest text-rose-300">
                        {eraseError}
                      </p>
                    ) : eraseTyped.trim().length > 0 ? (
                      eraseUnlocked ? (
                        <p className="font-mono text-[9px] tracking-widest text-rose-300">
                          NAME VERIFIED — ERASE UNLOCKED
                        </p>
                      ) : (
                        <p className="font-mono text-[9px] tracking-widest text-zinc-600">
                          NAME DOES NOT MATCH — ERASE LOCKED
                        </p>
                      )
                    ) : (
                      <p className="font-mono text-[9px] tracking-widest text-zinc-600">
                        ERASE LOCKED — EXACT NAME REQUIRED
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={eraseProfile}
                    disabled={!eraseUnlocked || erasing}
                    aria-busy={erasing}
                    className={cn(
                      SYS_BTN,
                      "border-rose-400/60 bg-rose-500/25 text-rose-100 hover:bg-rose-500/40"
                    )}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {erasing ? "ERASING…" : "ERASE PROFILE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEraseArmed(false)
                      setEraseTyped("")
                      setEraseError(null)
                    }}
                    disabled={erasing}
                    className="mt-1 w-full rounded-sm py-2 font-mono text-[9px] tracking-[0.25em] text-zinc-400 uppercase transition-colors hover:text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Stand down
                  </button>
                </div>
              )}
            </div>
          </motion.section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
