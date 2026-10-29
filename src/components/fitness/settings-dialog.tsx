"use client"

import { useEffect, useState } from "react"
import { Download, Info, MonitorSmartphone, Settings, TriangleAlert, UserRound, Volume2, VolumeX } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

const NAME_MIN = 2
const NAME_MAX = 24

/** ms until the emerald "identity updated" feedback fades. */
const SAVED_FEEDBACK_MS = 3500

/** The browser's deferred native install prompt (not in standard TS lib.dom). */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: string }>
}

/**
 * SETTINGS — athlete identity, the System Voice and the data escape hatch.
 * Opened from the gear button in the top nav; mirrors the DataVault dialog's
 * structure (sys-panel chrome, sectioned chambers).
 */
export function SettingsDialog({
  open,
  onOpenChange,
  hunter,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  hunter: HunterDTO
}) {
  const { pushNotice, bumpRefresh } = useSystem()
  const voiceEnabled = useSystem((s) => s.voiceEnabled)
  const setVoiceEnabled = useSystem((s) => s.setVoiceEnabled)
  const speak = useSystem((s) => s.speak)

  const [name, setName] = useState(hunter.name)
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── INSTALL PRIME state ── captured native prompt, installed flag, SW control
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [prompting, setPrompting] = useState(false)
  const [swActive, setSwActive] = useState(false)

  // keep the form in sync when the dialog (re)opens or the hunter changes
  useEffect(() => {
    setName(hunter.name)
  }, [hunter.name])
  // reset transient feedback on close
  useEffect(() => {
    if (!open) {
      setSavedName(null)
      setError(null)
    }
  }, [open])
  // auto-dismiss the success feedback
  useEffect(() => {
    if (!savedName) return
    const t = setTimeout(() => setSavedName(null), SAVED_FEEDBACK_MS)
    return () => clearTimeout(t)
  }, [savedName])

  // capture the browser's install offer so the button can trigger it later
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // keep the mini-infobar out of the UI
      setInstallEvent(e as InstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [])

  // already installed? (standalone display-mode, or iOS navigator.standalone)
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(standalone)
    const onAppInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener("appinstalled", onAppInstalled)
    return () => window.removeEventListener("appinstalled", onAppInstalled)
  }, [])

  // OFFLINE READY — true once a service worker controls this page
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const check = () => setSwActive(Boolean(navigator.serviceWorker.controller))
    check()
    navigator.serviceWorker.addEventListener("controllerchange", check)
    return () => navigator.serviceWorker.removeEventListener("controllerchange", check)
  }, [])

  const trimmed = name.trim()
  const nameTooShort = trimmed.length < NAME_MIN
  const nameTooLong = trimmed.length > NAME_MAX
  const nameValid = !nameTooShort && !nameTooLong && trimmed.length > 0
  const unchanged = trimmed === hunter.name

  const toggleVoice = () => {
    const next = !voiceEnabled
    setVoiceEnabled(next)
    if (next) speak("Voice of the System restored.")
  }

  const saveName = async () => {
    if (saving || !nameValid || unchanged) return
    setSaving(true)
    setError(null)
    try {
      const res = await api<{ hunter: HunterDTO }>("/api/hunter", {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      })
      setSavedName(res.hunter.name)
      pushNotice({
        kind: "info",
        title: "IDENTITY UPDATED",
        body: `The System will know you as ${res.hunter.name}.`,
      })
      bumpRefresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const exportVault = () => {
    // Content-Disposition: attachment → downloads without navigating away
    window.location.href = "/api/vault"
    pushNotice({
      kind: "info",
      title: "Vault export started",
      body: "Your full ledger is downloading as JSON.",
    })
  }

  const installApp = async () => {
    if (!installEvent || prompting) return
    setPrompting(true)
    try {
      await installEvent.prompt()
      const choice = await installEvent.userChoice
      if (choice.outcome === "accepted") {
        setInstalled(true)
        pushNotice({
          kind: "info",
          title: "PRIME INSTALLED",
          body: "The System now lives on your home screen.",
        })
      }
    } catch {
      /* the browser ate the prompt (or user closed it) — fall back to the hint */
    } finally {
      setInstallEvent(null) // one-shot per browser decision
      setPrompting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sys-panel max-h-[85vh] max-w-md overflow-y-auto rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl scroll-sys"
      >
        <DialogHeader className="border-b border-violet-500/10 px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5 sys-label text-violet-300/80">
            <Settings className="h-3.5 w-3.5 text-violet-400" aria-hidden />
            SETTINGS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-5">
          {/* ── ATHLETE — rename ───────────────────────────────────────────── */}
          <section aria-label="Athlete identity" className="rounded-sm border border-violet-500/25 bg-violet-500/[0.05] p-4">
            <div className="flex items-center gap-2">
              <UserRound className="h-3.5 w-3.5 text-violet-300" aria-hidden />
              <p className="sys-label text-zinc-400">ATHLETE</p>
            </div>
            <label htmlFor="settings-name" className="mt-3 block font-mono text-[10px] tracking-[0.2em] text-zinc-500">
              DISPLAY NAME
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              maxLength={NAME_MAX + 8}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              aria-invalid={!nameValid || undefined}
              aria-describedby="settings-name-feedback"
              className={cn(
                "mt-1.5 h-11 w-full rounded-sm border bg-black/40 px-3 font-mono text-sm text-zinc-100 outline-none transition-colors",
                "placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70",
                nameValid
                  ? "border-zinc-700/70 focus:border-violet-400/60"
                  : "border-rose-500/50 focus:border-rose-400/60"
              )}
            />
            <div id="settings-name-feedback" className="mt-2 min-h-[18px]" aria-live="polite">
              {savedName ? (
                <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-emerald-300">
                  <Info className="h-3 w-3 shrink-0" aria-hidden /> IDENTITY UPDATED — {savedName.toUpperCase()}
                </p>
              ) : error ? (
                <p role="alert" className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-rose-300">
                  <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden /> {error.toUpperCase()}
                </p>
              ) : nameTooShort ? (
                <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-600">
                  NAME NEEDS {NAME_MIN}–{NAME_MAX} CHARACTERS
                </p>
              ) : nameTooLong ? (
                <p className="font-mono text-[10px] tracking-[0.2em] text-rose-300/80">
                  {trimmed.length - NAME_MAX} CHARACTER{trimmed.length - NAME_MAX === 1 ? "" : "S"} OVER THE LIMIT
                </p>
              ) : (
                <p className="font-mono text-[10px] tabular-nums tracking-[0.2em] text-zinc-600">
                  {trimmed.length}/{NAME_MAX} CHARACTERS{unchanged ? " · UNCHANGED" : ""}
                </p>
              )}
            </div>
            <button
              onClick={() => void saveName()}
              disabled={saving || !nameValid || unchanged}
              aria-busy={saving}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/15 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 uppercase transition-all hover:border-violet-300/70 hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.35)] active:bg-violet-500/45 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              {saving ? "FORGING IDENTITY…" : "SAVE IDENTITY"}
            </button>
          </section>

          {/* ── SYSTEM VOICE — TTS toggle ──────────────────────────────────── */}
          <section aria-label="System voice" className="rounded-sm border border-violet-500/25 bg-violet-500/[0.05] p-4">
            <div className="flex items-center gap-2">
              {voiceEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-violet-300" aria-hidden />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
              )}
              <p className="sys-label text-zinc-400">SYSTEM VOICE</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              The spoken layer — briefings, raid results and notices are read aloud when enabled.
            </p>
            <button
              onClick={toggleVoice}
              role="switch"
              aria-checked={voiceEnabled}
              aria-label="System voice"
              className={cn(
                "mt-3 flex h-11 w-full items-center gap-3 rounded-sm border px-3 transition-all focus-visible:outline focus-visible:outline-violet-400/70",
                voiceEnabled
                  ? "border-violet-400/50 bg-violet-500/15 hover:bg-violet-500/25"
                  : "border-zinc-700/70 bg-zinc-900/40 hover:border-zinc-500/60"
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-sm border",
                  voiceEnabled ? "border-violet-400/50 bg-violet-500/20 text-violet-300" : "border-zinc-700 bg-zinc-900 text-zinc-500"
                )}
                aria-hidden
              >
                {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </span>
              <span
                className={cn(
                  "flex-1 text-left font-mono text-[10px] font-bold tracking-[0.25em]",
                  voiceEnabled ? "text-violet-200" : "text-zinc-400"
                )}
              >
                {voiceEnabled ? "VOICE ONLINE" : "VOICE MUTED"}
              </span>
              {/* the switch track */}
              <span
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                  voiceEnabled ? "border-violet-400/60 bg-violet-500/40" : "border-zinc-700 bg-zinc-800"
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
                    voiceEnabled
                      ? "left-[18px] bg-violet-200 shadow-[0_0_8px_rgba(167,139,250,0.8)]"
                      : "left-0.5 bg-zinc-500"
                  )}
                />
              </span>
            </button>
          </section>

          {/* ── INSTALL PRIME — add-to-home-screen / offline shell ────────── */}
          <section aria-label="Install PRIME" className="rounded-sm border border-violet-500/25 bg-violet-500/[0.05] p-4">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="h-3.5 w-3.5 text-violet-300" aria-hidden />
              <p className="sys-label text-zinc-400">INSTALL PRIME</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Run PRIME as its own app — full screen, its own icon, and an offline shell for when the network drops.
            </p>
            {installed ? (
              <p className="mt-3 flex h-11 items-center justify-center gap-2 rounded-sm border border-emerald-400/40 bg-emerald-500/10 font-mono text-[10px] font-bold tracking-[0.25em] text-emerald-300">
                <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden /> INSTALLED — RUNNING AS APP
              </p>
            ) : installEvent ? (
              <button
                onClick={() => void installApp()}
                disabled={prompting}
                aria-busy={prompting}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/10 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 uppercase transition-all hover:border-violet-300/70 hover:bg-violet-500/25 hover:shadow-[0_0_18px_rgba(139,92,246,0.3)] active:bg-violet-500/35 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Download className="h-4 w-4" aria-hidden />
                {prompting ? "OPENING INSTALL…" : "INSTALL AS APP"}
              </button>
            ) : (
              <p className="mt-3 rounded-sm border border-zinc-700/70 bg-zinc-900/40 px-3 py-3.5 text-center font-mono text-[10px] tracking-[0.2em] text-zinc-400">
                USE YOUR BROWSER&apos;S INSTALL MENU
              </p>
            )}
            <p
              className={cn(
                "mt-2 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em]",
                swActive ? "text-amber-300/90" : "text-zinc-600"
              )}
              aria-live="polite"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  swActive ? "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" : "bg-zinc-700"
                )}
                aria-hidden
              />
              {swActive ? "OFFLINE READY · APP SHELL CACHED" : "OFFLINE SHELL ARMING…"}
            </p>
          </section>

          {/* ── DANGER ZONE — data export ──────────────────────────────────── */}
          <section aria-label="Danger zone" className="rounded-sm border border-rose-500/25 bg-rose-500/[0.04] p-4">
            <div className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5 text-rose-300/80" aria-hidden />
              <p className="sys-label text-zinc-400">DANGER ZONE</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Everything on this device is your data. Take it with you — one dated JSON file with the full ledger.
            </p>
            <button
              onClick={exportVault}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-teal-400/50 bg-teal-500/15 font-mono text-[10px] font-bold tracking-[0.25em] text-teal-200 uppercase transition-all hover:border-teal-300/70 hover:bg-teal-500/30 hover:shadow-[0_0_18px_rgba(20,184,166,0.35)] active:bg-teal-500/45 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Download className="h-4 w-4" aria-hidden />
              EXPORT MY DATA (JSON)
            </button>
            <p className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-700">
              FULL RESET LIVES IN THE DATA VAULT (STATUS TAB) — RESTORE AN OLDER VAULT FILE TO REPLACE THIS PROFILE.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
