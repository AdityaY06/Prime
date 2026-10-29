"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Download, Plus, Share, SquarePlus, X } from "lucide-react"
import { FLOW_EASE } from "@/components/system/motion"
import { cn } from "@/lib/utils"

/**
 * InstallPrompt — the dismissible install banner (R20-a).
 *
 * Chrome / Edge / Android: `beforeinstallprompt` is captured (preventDefault,
 * stashed) so Chrome's own mini-infobar never competes with ours; INSTALL
 * PRIME replays the stashed event. An "accepted" outcome is confirmed by the
 * `appinstalled` event — that path persists the dismissal (never re-offer an
 * installed profile); a native-dialog dismissal only soft-hides for the
 * current visit (Chrome may legitimately re-offer later).
 *
 * iOS / iPadOS Safari never fires beforeinstallprompt — there the banner's
 * INSTALL action opens a small instruction sheet instead (SHARE → ADD TO HOME
 * SCREEN), the only install path Apple allows.
 *
 * Suppression: `display-mode: standalone` (or iOS navigator.standalone) →
 * renders nothing; a NOT NOW dismissal persists via localStorage
 * (`prime-install-dismissed-v1`) and is respected forever — Chrome re-firing
 * beforeinstallprompt on later visits never resurrects the banner.
 *
 * Placement: fixed above the mobile BottomNav (z-[60] > nav's z-50), always
 * under the NotificationStack (z-[80]) and RewardOverlay (z-[90]).
 *
 * R21-b politeness (discovered live: the full card occludes flow CTAs like
 * CONFIRM IMPORT on 390px): the offer is DEFERRED ~6s after mount so the
 * first paint is the app, never a wall of install card; once shown, the card
 * AUTO-COLLAPSES to a slim h-11 pill when the user scrolls ≥120px (they are
 * working — get out of the way) or after a 15s grace. The pill re-expands on
 * tap and carries its own ✕; NOT NOW semantics are unchanged.
 *
 * R36-a awakening suppression (re-landed R37 after the platform rollback;
 * discovered live: the banner matured mid-ritual and physically covered the
 * awakening flow's CONTINUE/AWAKEN CTAs — the centered ritual screen never
 * scrolls, so the scroll-collapse never fired and onboarding could not
 * proceed): the maturity watcher polls for the #awakening-ritual marker;
 * while the ritual is mounted the offer stays suppressed and the 6s grace
 * re-arms from the moment the real app mounts.
 *
 * R58-c light restyle: banner, slim pill and iOS sheet join the Duolingo-era
 * register — white cards with 2px #e5e5e5 borders, chunky 3D green/outline
 * buttons, springy slide-up entrances (stiffness 320 / damping 26; exit
 * reverses; reduced motion → instant). Every behavior documented above is
 * untouched — only the skin and the entrance motion changed.
 */

const DISMISS_KEY = "prime-install-dismissed-v1"

/** First-paint grace — the app renders alone before any install offer. */
const OFFER_MATURITY_MS = 6_000
/** How long the expanded card may occlude before self-collapsing to the pill. */
const EXPANDED_GRACE_MS = 15_000
/** Scroll distance (px) that means "user is working" → collapse to the pill. */
const SCROLL_COLLAPSE_PX = 120

/** R58-c — the springy slide-up + fade shared by the pill, banner and sheet
 *  (the exit plays it in reverse). Reduced motion swaps it for an instant cut. */
const BANNER_SPRING = { type: "spring", stiffness: 320, damping: 26 } as const

/** Chrome's deferred install event — not part of lib.dom; minimal local shape. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/**
 * iOS-like platform sniff (Safari never fires beforeinstallprompt there).
 * iPadOS 13+ masquerades as desktop Safari — maxTouchPoints separates it.
 */
function isIOSLike(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return (
    /iphone|ipod/i.test(ua) ||
    /ipad/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  )
}

export function InstallPrompt() {
  const reduce = useReducedMotion()

  // SSR + first client paint render nothing (hydration-safe, OfflineIndicator
  // idiom); the banner then enters with its rise-in, so nothing is lost.
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [ios, setIos] = useState(false)
  // a beforeinstallprompt has arrived at least once (or iOS fallback path) —
  // stays true after the event is spent so an accepted-but-unconfirmed install
  // keeps the banner up until appinstalled / NOT NOW resolves it
  const [offered, setOffered] = useState(false)
  // the live stashed event (single-use; null once prompted)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  // native dialog answered "dismissed" — gone for this visit only
  const [hideForSession, setHideForSession] = useState(false)
  const [prompting, setPrompting] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // R21-b politeness: offer deferred until maturity; expanded card can
  // self-collapse to the slim pill (scroll / grace expiry)
  const [matured, setMatured] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const promptingRef = useRef(false)

  const persistDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // storage unavailable — session-only dismissal
    }
    setDismissed(true)
  }, [])

  // ── mount: adopt state, wire the install lifecycle ──────────────────────────
  useEffect(() => {
    setMounted(true)
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true)
    } catch {
      // storage unavailable — treat as not-dismissed
    }
    setIos(isIOSLike())

    const mq = window.matchMedia("(display-mode: standalone)")
    const nav = navigator as Navigator & { standalone?: boolean }
    const syncStandalone = () => setStandalone(mq.matches || nav.standalone === true)
    syncStandalone()

    // Chrome offers the install — swallow the native infobar, stash the event
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setDeferred(e as BeforeInstallPromptEvent)
      setOffered(true)
    }
    // installed for real — never offer this profile again
    const onAppInstalled = () => {
      deferredRef.current = null
      setDeferred(null)
      persistDismiss()
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)
    mq.addEventListener("change", syncStandalone)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
      mq.removeEventListener("change", syncStandalone)
    }
  }, [persistDismiss])

  // ── R36-a: awakening-aware maturity (re-landed R37) ───────────────────────
  // REPLACES the naive one-shot 6s timer. The install banner is fixed-position
  // at the exact height of the awakening flow's CONTINUE/AWAKEN CTAs — when it
  // matured 6s into onboarding it physically covered the buttons (verified live
  // at 390px: the tap lands on the banner, onboarding cannot proceed; the
  // ritual screen never scrolls, so the scroll-collapse never rescued it).
  // The watcher polls for the #awakening-ritual marker: while the ritual is
  // mounted the offer stays suppressed AND the maturity clock keeps re-arming,
  // so the 6s first-paint grace restarts from the moment the real app mounts.
  // Cost: one getElementById per second — negligible.
  useEffect(() => {
    const mountTs = Date.now()
    let blockedUntilTs = 0
    const iv = window.setInterval(() => {
      if (document.getElementById("awakening-ritual")) {
        blockedUntilTs = Date.now()
        setMatured(false)
        return
      }
      const origin = blockedUntilTs || mountTs
      if (Date.now() - origin >= OFFER_MATURITY_MS) setMatured(true)
    }, 1_000)
    return () => window.clearInterval(iv)
  }, [])

  // ── R21-b: auto-collapse machinery (runs only while expanded+visible) ────
  // Two triggers, whichever first: a 15s grace expiry, or the user scrolling
  // >=120px from the moment this expansion started ("working" signal). The
  // scroll baseline re-arms on every expansion, so collapse -> expand -> keep
  // reading is never fought over.
  const expandedLive = matured && offered && !dismissed && !standalone && !hideForSession && !collapsed
  useEffect(() => {
    if (!expandedLive) return
    const baseline = window.scrollY
    const onScroll = () => {
      if (Math.abs(window.scrollY - baseline) >= SCROLL_COLLAPSE_PX) setCollapsed(true)
    }
    const t = window.setTimeout(() => setCollapsed(true), EXPANDED_GRACE_MS)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("scroll", onScroll)
    }
  }, [expandedLive])

  // ── iOS instruction sheet: Escape closes ────────────────────────────────────
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sheetOpen])

  // ── actions ─────────────────────────────────────────────────────────────────
  const onInstall = useCallback(async () => {
    // iOS Safari has no native prompt — the button opens the how-to sheet
    if (ios) {
      setSheetOpen(true)
      return
    }
    const ev = deferredRef.current
    if (!ev || promptingRef.current) return
    promptingRef.current = true
    setPrompting(true)
    try {
      await ev.prompt()
      const { outcome } = await ev.userChoice
      // single-use event — spent either way
      deferredRef.current = null
      setDeferred(null)
      if (outcome === "dismissed") {
        // user turned the native dialog down: hide for THIS visit; Chrome may
        // legitimately re-offer on a later visit, so nothing is persisted
        setHideForSession(true)
      }
      // "accepted" → the appinstalled event confirms next (real Chrome) and
      // takes the banner down + persists. Deliberately no synthetic fallback:
      // with a mocked event the banner simply waits for NOT NOW.
    } catch {
      // a spent/expired event throws — drop it quietly
      deferredRef.current = null
      setDeferred(null)
    } finally {
      promptingRef.current = false
      setPrompting(false)
    }
  }, [ios])

  // ── render gates ──────────────────────────────────────────────────────────
  // SSR + first client paint render nothing (hydration-safe); every later
  // gate (dismissed / standalone / unoffered) routes through bannerVisible so
  // AnimatePresence can play the exit instead of hard-cutting.
  if (!mounted) return null

  const bannerVisible = matured && !dismissed && !standalone && !hideForSession && offered

  return (
    <>
      {/* ── banner — above the mobile TabBar dock, under the notice stack ── */}
      <div
        className={
          "fixed inset-x-3 z-[60] bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] " +
          "md:inset-x-auto md:left-[calc(50%-13rem)] md:bottom-6 md:w-[26rem]"
        }
      >
        <AnimatePresence>
          {/* R21-b slim pill — never walls off flow CTAs (h-11 only).
              R58-c: light capsule — white card chrome, green download glyph,
              ink whisper. */}
          {bannerVisible && collapsed && (
            <motion.div
              key="install-pill"
              role="group"
              aria-label="PRIME install offer, collapsed"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
              transition={reduce ? { duration: 0 } : BANNER_SPRING}
              className="flex h-11 items-stretch gap-1 overflow-hidden rounded-full border-2 border-[#e5e5e5] bg-white shadow-[0_2px_12px_rgba(60,60,60,0.08)]"
            >
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                aria-label="Expand the PRIME install offer"
                className="flex min-w-0 flex-1 items-center gap-2 pl-3.5 pr-1 text-left transition-colors hover:bg-[#f7f7f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]"
              >
                <Download className="h-4 w-4 shrink-0 text-[#58cc02]" aria-hidden />
                <span className="truncate text-xs font-bold text-[#3c3c3c]">
                  Install PRIME on your home screen
                </span>
              </button>
              <button
                type="button"
                onClick={persistDismiss}
                aria-label="Dismiss the install offer — do not show it again"
                className="grid w-11 shrink-0 place-items-center text-[#777] transition-colors hover:bg-[#f7f7f4] hover:text-[#3c3c3c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </motion.div>
          )}
          {bannerVisible && !collapsed && (
          <motion.aside
            key="install-banner"
            aria-label="Install PRIME on this device"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={reduce ? { duration: 0 } : BANNER_SPRING}
          >
            {/* R58-c: the expanded offer is a light card with chunky 3D
                buttons — an invitation, not an ad unit. All logic (maturity
                watcher, collapse, dismiss persistence, iOS sheet) untouched. */}
            <div className="rounded-2xl border-2 border-[#e5e5e5] bg-white p-4 shadow-[0_2px_12px_rgba(60,60,60,0.08)]">
              <p className="text-sm font-extrabold text-[#3c3c3c]">
                Install PRIME on your home screen
              </p>
              <p className="mt-1.5 text-[13px] font-semibold leading-snug text-[#777]">
                Full-screen, offline-ready, and it opens like a native app from your home screen.
              </p>
              <div className="mt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => void onInstall()}
                  disabled={!ios && !deferred}
                  aria-label="Install PRIME on this device"
                  className={cn(
                    "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold",
                    "bg-[#58cc02] text-white shadow-[0_4px_0_0_#46a302]",
                    "transition-[transform,box-shadow,background-color] duration-75",
                    "hover:bg-[#61d905] active:translate-y-1 active:shadow-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                    (!ios && !deferred) && "cursor-not-allowed opacity-60 active:translate-y-0",
                    prompting && "cursor-wait",
                  )}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  {prompting ? "Installing…" : "Install PRIME"}
                </button>
                <button
                  type="button"
                  onClick={persistDismiss}
                  aria-label="Dismiss the install offer — do not show it again"
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-2xl px-4 text-sm font-extrabold",
                    "bg-white text-[#777] shadow-[0_4px_0_0_#e5e5e5]",
                    "transition-[transform,box-shadow,background-color] duration-75",
                    "hover:bg-[#f7f7f4] active:translate-y-1 active:shadow-none",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                  )}
                >
                  Not now
                </button>
              </div>
            </div>
          </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── iOS Safari fallback sheet — SHARE → ADD TO HOME SCREEN ── */}
      <AnimatePresence>
        {sheetOpen && bannerVisible && (
          <>
            <motion.button
              key="install-sheet-scrim"
              type="button"
              aria-label="Dismiss the install instructions"
              onClick={() => setSheetOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.25, ease: FLOW_EASE }}
              className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
            />
            <div className="fixed left-[max(1rem,calc(50%-12rem))] top-1/2 z-[75] w-[min(24rem,calc(100vw-2rem))] -translate-y-1/2">
              <motion.div
                key="install-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="How to add PRIME to your home screen"
                tabIndex={-1}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
                transition={reduce ? { duration: 0 } : BANNER_SPRING}
                className="overflow-hidden rounded-2xl border-2 border-[#e5e5e5] bg-white p-5 shadow-[0_2px_12px_rgba(60,60,60,0.08)]"
              >
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {/* R68 — #afafaf → #777: sheet eyebrow reads on white */}
                      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#777]">
                        Install PRIME · 3 steps
                      </p>
                      <p className="mt-1.5 text-base font-extrabold text-[#3c3c3c]">
                        Add PRIME to your home screen
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      aria-label="Close the add-to-home-screen instructions"
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[#e5e5e5] bg-white text-[#777] transition-colors",
                        "hover:bg-[#f7f7f4] hover:text-[#3c3c3c]",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                      )}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <ol className="mt-4 space-y-3">
                    {[
                      {
                        icon: Share,
                        text: "Tap the Share button in Safari's bottom toolbar",
                      },
                      {
                        icon: SquarePlus,
                        text: "Scroll down and tap Add to Home Screen",
                      },
                      {
                        icon: Plus,
                        text: "Tap Add — PRIME launches full-screen from your home screen",
                      },
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8f8d8] text-[#46a302]"
                        >
                          <step.icon className="h-4 w-4" />
                        </span>
                        <p className="pt-1 text-xs font-semibold leading-snug text-[#777]">
                          <span className="mr-1.5 text-[10px] font-extrabold tabular-nums text-[#46a302]">
                            {i + 1}.
                          </span>
                          {step.text}
                        </p>
                      </li>
                    ))}
                  </ol>

                  <button
                    type="button"
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "mt-4 flex min-h-11 w-full items-center justify-center rounded-2xl text-sm font-extrabold",
                      "bg-[#58cc02] text-white shadow-[0_4px_0_0_#46a302]",
                      "transition-[transform,box-shadow,background-color] duration-75",
                      "hover:bg-[#61d905] active:translate-y-1 active:shadow-none",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                    )}
                  >
                    Got it
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
