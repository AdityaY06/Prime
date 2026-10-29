"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, ChevronLeft, Sparkles, TriangleAlert } from "lucide-react"
import { BigButton, Card, Chip } from "@/components/prime/kit"
import { FLOW_EASE } from "@/components/system/motion"
import { api } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { ARCHETYPES } from "@/lib/game"
import { OfflineQueuedError, enqueueMutation } from "@/lib/offline-queue"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  EMPTY_BODY_DRAFT,
  STEP_COUNT,
  buildProfilePayload,
  bodyFieldError,
  nameError,
  writeOnboardingGoal,
  BodyBaselineStep,
  DirectiveStep,
  type BodyDraft,
} from "@/components/fitness/guided-steps"

const STEP_LABELS = ["IDENTITY", "BODY", "DIRECTIVE"] as const

/**
 * R39 — the honest cookie-blocked message. In a cross-site embedded preview the
 * browser can refuse the identity cookie outright (SameSite=None helps Chrome
 * via CHIPS and Firefox via auto-partitioning, but Safari and
 * strict-third-party-blocking Chrome require explicit storage access). Both
 * the calibration leg and the post-awaken verify probe surface NOT_AWAKENED
 * when the cookie never landed — this message replaces the cryptic loop with
 * the two real escapes: retry (the empty-shell adoption server-side makes each
 * retry safe; Safari re-prompts for storage access on the tap) or open the
 * preview first-party in a separate tab, where cookies always work.
 */
const COOKIE_BLOCKED_MSG =
  "Sign-in cookie blocked in this embedded view. Tap AWAKEN to retry — allow cookies if your browser asks — or open this preview in a separate browser tab (Open in New Tab above the preview) and awaken there with the same name. Your profile is saved."

/**
 * Best-effort storage access for cross-site iframe contexts (R39). The AWAKEN
 * tap is a user gesture — exactly what requestStorageAccess() needs in Safari
 * (it shows its allow-cookies prompt) and strict Chrome. First-party contexts
 * resolve instantly; unavailable/denied rejects are swallowed — the
 * SameSite=None; Secure; Partitioned cookie may still land without it.
 */
async function requestStorageAccessSafe(): Promise<void> {
  const doc = document as Document & { requestStorageAccess?: () => Promise<void> }
  if (typeof doc.requestStorageAccess !== "function") return
  try {
    await doc.requestStorageAccess()
  } catch {
    // denied or unavailable — proceed; the verify probe below tells the truth
  }
}

/**
 * The guided first run (R33-a) — a skippable 3-step calibration inside the
 * one-time awakening ritual: identity (name + archetype, the classic screen),
 * body baseline (weight/height/birth-year/sex against set-profile's exact
 * bounds — reject-don't-clamp) and directive (goal enum + a local-only
 * primary-focus chip). One AWAKEN at the end commits the sequence:
 * POST /api/hunter (device identity + cookie) → POST /api/nutrition
 * set-profile with the filled fields → localStorage preference → notice +
 * speak + bumpRefresh (the app mounts). Offline, both POSTs park in the
 * queue (awaken first — FIFO guarantees the cookie exists before the
 * calibration leg replays) and an amber notice explains the auto-sync.
 */
export function AwakeningScreen() {
  const { bumpRefresh, pushNotice, speak } = useSystem()
  const reduce = useReducedMotion()

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [name, setName] = useState("")
  const [archetype, setArchetype] = useState("vanguard")
  const [body, setBody] = useState<BodyDraft>(EMPTY_BODY_DRAFT)
  const [goal, setGoal] = useState("")
  const [primary, setPrimary] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bodyErr = bodyFieldError(body)

  const go = (delta: number) => {
    if (busy) return
    const next = Math.min(STEP_COUNT - 1, Math.max(0, step + delta))
    if (next === step) return
    setDir(delta > 0 ? 1 : -1)
    setStep(next)
    setError(null)
  }

  const advance = () => {
    if (step === 0) {
      const ne = nameError(name)
      if (ne) {
        setError(ne)
        return
      }
    }
    if (step === 1 && bodyErr) {
      // the step already shows the live rose line — this is the keyboard fence
      setError(bodyErr)
      return
    }
    go(1)
  }

  const skipBody = () => {
    if (busy) return
    setBody(EMPTY_BODY_DRAFT)
    setError(null)
    go(1)
  }

  /**
   * Offline tail — the awaken POST just parked in the queue. Park the
   * calibration leg behind it (FIFO: the cookie lands first, then the
   * profile), tell the user, and DO NOT bumpRefresh: a refetch while the
   * link is down would fault the screen. The queue's own flush bumps the
   * refresh key on reconnect, which mounts the app for good.
   */
  const offlineTail = async () => {
    const payload = buildProfilePayload(body, goal)
    if (Object.keys(payload).length > 0) {
      const bodyStr = JSON.stringify({ action: "set-profile", ...payload })
      try {
        // normally this ALSO parks (navigator.onLine is still false)…
        await api("/api/nutrition", { method: "POST", body: bodyStr })
      } catch (e) {
        if (!(e instanceof OfflineQueuedError)) {
          // …but if the link flickered back mid-flight it 404s (no cookie yet
          // — the queued awaken hasn't replayed) — park it manually behind
          // the awaken POST; the queue badge/tap or the next flush lands it.
          enqueueMutation("/api/nutrition", "POST", bodyStr)
        }
      }
    }
    setQueued(true) // busy stays true — AWAKEN must not double-queue
    pushNotice({
      kind: "warn",
      title: "OFFLINE — AWAKENING QUEUED",
      body: "Link is down. Your hunter and calibration are saved and will complete automatically on reconnect.",
    })
    speak("Offline. Your awakening is queued and will complete when the link returns.")
  }

  const awaken = async () => {
    if (busy) return
    // re-validate everything the server will check (fence — gating upstream
    // should have made these unreachable)
    const ne = nameError(name)
    if (ne) {
      setStep(0)
      setError(ne)
      return
    }
    if (bodyErr) {
      setStep(1)
      setError(bodyErr)
      return
    }

    // local-only preference — write before the network legs so it survives
    // both the online and the offline path (it is never load-bearing)
    if (primary) writeOnboardingGoal(primary)

    setBusy(true)
    setError(null)
    // R39 — claim storage access while we still hold the user gesture: in the
    // cross-site preview embed this is what lets Safari (and strict Chrome)
    // accept the identity cookie the POST below sets.
    await requestStorageAccessSafe()
    try {
      // R38 — ship the device's IANA zone with the awakening so every day
      // boundary (dailies, streak, rift, rest decrees) rolls at THIS device's
      // midnight. Server validates; garbage degrades to null = legacy UTC.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      await api<{ hunter: HunterDTO }>("/api/hunter", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), archetype, timezone }),
      })
    } catch (e) {
      if (e instanceof OfflineQueuedError) {
        await offlineTail()
        return
      }
      setError((e as Error).message)
      setBusy(false)
      return
    }

    // R40 — verify the identity cookie actually LANDED before the calibration
    // leg burns a request: the POST above just set it, so if the jar didn't
    // take it this GET 404s RIGHT NOW. Catching the block here means the
    // honest message shows BEFORE the user watches calibration "fail", and
    // dev.log records a clean hunter-404 instead of a nutrition-404 (the
    // R39 probe ran after calibration — same signal, one step later, worse
    // UX). A transient non-404 failure is not fatal — the app's own mount GET
    // retries it. Offline cannot reach this line: a down link would have
    // thrown OfflineQueuedError on the awaken POST itself.
    try {
      await api("/api/hunter")
    } catch (e) {
      if ((e as Error).message === "NOT_AWAKENED") {
        setError(COOKIE_BLOCKED_MSG)
        setBusy(false)
        return
      }
    }

    // calibration leg — ONE call with every filled field (idempotent re-taps
    // are safe: the awaken POST above returns the existing hunter)
    const payload = buildProfilePayload(body, goal)
    const calibrated = Object.keys(payload).length > 0
    if (calibrated) {
      try {
        await api("/api/nutrition", {
          method: "POST",
          body: JSON.stringify({ action: "set-profile", ...payload }),
        })
      } catch (e) {
        if (e instanceof OfflineQueuedError) {
          await offlineTail()
          return
        }
        // the cookie probe above already ruled out the blocked-cookie case,
        // so this is a real calibration fault (or a freak cookie eviction —
        // the branch below still gives the honest message for that). The
        // hunter EXISTS at this point — keep the screen up so the tap that
        // retries calibration is the same AWAKEN button.
        if ((e as Error).message === "NOT_AWAKENED") {
          setError(COOKIE_BLOCKED_MSG)
          setBusy(false)
          return
        }
        setError(`Hunter created — calibration failed: ${(e as Error).message} Tap AWAKEN to retry.`)
        setBusy(false)
        return
      }
    }

    pushNotice({
      kind: "title",
      title: "Profile created",
      body: calibrated
        ? "Calibration applied — targets recomputed from your baseline."
        : "PRIME is now tracking your training.",
    })
    speak(`Profile created. Welcome to the System, ${name.trim()}.`)
    bumpRefresh() // GET /api/hunter refetches → the app mounts
  }

  const archName = ARCHETYPES.find((a) => a.id === archetype)?.name ?? "All-Rounder"

  return (
    <div
      // R36-a marker (re-landed R37 after the platform rollback) — InstallPrompt
      // polls for this id to suppress the install banner during the ritual (the
      // fixed-position banner sits exactly where this flow's CONTINUE/AWAKEN
      // CTAs are and blocks them on 390px).
      id="awakening-ritual"
      className="grid min-h-screen place-items-center px-4 py-10"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.5 }}
        className="w-full max-w-2xl"
      >
        <Card className="w-full">
          {/* header row — brand monogram + step chip (the kit idiom, R67 light register) */}
          <div className="flex items-center gap-3 border-b-2 border-[#e5e5e5] px-4 py-3">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#61d905] to-[#4fbe02] shadow-[0_3px_0_0_#46a302]"
              aria-hidden
            >
              <span className="text-lg font-black leading-none text-white">P</span>
            </div>
            {/* R68 — #a3a3a3 → #8a8a8a: brand kicker earns the label floor */}
            <p className="min-w-0 flex-1 text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a8a8a]">
              Awakening
            </p>
            <Chip tone={queued ? "gold" : "green"} className="shrink-0">
              {queued ? "QUEUED" : `STEP ${step + 1}/${STEP_COUNT} · ${STEP_LABELS[step]}`}
            </Chip>
          </div>

          <div className="p-5 sm:p-8">
            {/* calibration rail — green progress segments + step labels */}
            <div role="group" aria-label="Awakening progress">
              <div className="flex items-center gap-1.5">
                {STEP_LABELS.map((label, i) => (
                  <div key={label} className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e5e5e5]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        i <= step ? "w-full bg-[#58cc02]" : "w-0 bg-transparent",
                        !reduce && "transition-all duration-500"
                      )}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] font-extrabold tracking-[0.12em]">
                {STEP_LABELS.map((label, i) => (
                  <span
                    key={label}
                    className={cn(
                      // R68 — future steps #a3a3a3 → #777 (VLM "ghosted,
                      // easily overlooked"); past steps get full-alpha green.
                      i === step ? "text-[#46a302]" : i < step ? "text-[#58cc02]" : "text-[#777]"
                    )}
                  >
                    0{i + 1} {label}
                  </span>
                ))}
              </div>
            </div>

            {/* step content — directional crossfade, instant under reduced motion */}
            <div className="mt-7">
              <AnimatePresence mode="wait" custom={dir} initial={false}>
                <motion.div
                  key={step}
                  role="group"
                  aria-label={`Step ${step + 1} of ${STEP_COUNT} — ${STEP_LABELS[step]}`}
                  custom={dir}
                  variants={{
                    enter: (d: number) => ({
                      opacity: 0,
                      x: reduce || d === 0 ? 0 : d * 28,
                    }),
                    center: {
                      opacity: 1,
                      x: 0,
                      transition: reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE },
                    },
                    exit: (d: number) => ({
                      opacity: 0,
                      x: reduce || d === 0 ? 0 : d * -20,
                      transition: reduce ? { duration: 0 } : { duration: 0.2, ease: FLOW_EASE },
                    }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                >
                  {step === 0 && (
                    <div>
                      <div className="flex items-start gap-3">
                        <Sparkles className="mt-1 h-5 w-5 shrink-0 text-[#58cc02]" aria-hidden />
                        <div>
                          <p className="text-sm leading-relaxed font-semibold text-[#3c3c3c]">
                            Your <span className="font-extrabold text-[#46a302]">PRIME</span> training profile awaits.
                          </p>
                          <p className="mt-2 text-xs leading-relaxed text-[#777]">
                            Three steps — identity, baseline, directive — sixty seconds to a personalized profile.
                            PRIME will track every rep, every session and every gain. Real workouts earn real
                            XP — level up from F-Rank to S-Rank.{" "}
                            <span className="font-bold text-[#46a302]/80">Consistency is the only rule.</span>
                          </p>
                        </div>
                      </div>

                      {/* name */}
                      <div className="mt-7">
                        <label
                          htmlFor="hunter-name"
                          className="block text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a8a8a]"
                        >
                          Choose your athlete name
                        </label>
                        <input
                          id="hunter-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="e.g. KAEL"
                          maxLength={24}
                          autoComplete="off"
                          className="mt-2 h-12 w-full rounded-xl border-2 border-[#e5e5e5] bg-white px-4 text-sm font-bold text-[#3c3c3c] placeholder:text-[#8f8f8f] focus:border-[#58cc02] focus:outline-none transition-colors duration-150"
                        />
                      </div>

                      {/* archetype */}
                      <div className="mt-6">
                        <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a8a8a]">
                          Select your starting profile
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {ARCHETYPES.map((a, index) => {
                            const active = archetype === a.id
                            const statKeys = ["str", "vit", "endur", "agi", "flex"] as const
                            const maxStat = Math.max(...statKeys.map((k) => a.stats[k]))
                            const uniqueTop = statKeys.filter((k) => a.stats[k] === maxStat).length === 1
                            return (
                              <motion.button
                                key={a.id}
                                type="button"
                                onClick={() => setArchetype(a.id)}
                                aria-pressed={active}
                                initial={reduce ? false : { opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={
                                  reduce ? { duration: 0 } : { duration: 0.4, ease: FLOW_EASE, delay: 0.05 * index }
                                }
                                className={cn(
                                  "relative rounded-xl border-2 p-4 text-left",
                                  "transition-[transform,border-color,background-color] duration-150 active:scale-[0.98]",
                                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                                  active
                                    ? "border-[#58cc02] bg-[#f3fdea]"
                                    : "border-[#e5e5e5] bg-white hover:border-[#c9e8a6] hover:bg-[#fafcf6]"
                                )}
                              >
                                {active && (
                                  <span
                                    className="prime-pop absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[#58cc02]"
                                    aria-hidden
                                  >
                                    <Check className="h-3.5 w-3.5 text-white" aria-hidden />
                                  </span>
                                )}
                                <p className="text-sm font-extrabold text-[#3c3c3c]">{a.name}</p>
                                <p
                                  className={cn(
                                    "mt-0.5 text-[10px] font-bold tracking-[0.12em]",
                                    active ? "text-[#46a302]" : "text-[#777]"
                                  )}
                                >
                                  {a.title}
                                </p>
                                <p className="mt-2 text-xs font-semibold leading-snug text-[#777]">{a.desc}</p>
                                <div className="mt-3 grid grid-cols-5 gap-1">
                                  {statKeys.map((k) => {
                                    const isTop = uniqueTop && a.stats[k] === maxStat
                                    return (
                                      <div
                                        key={k}
                                        className={cn(
                                          "rounded-lg px-1 py-1 text-center",
                                          isTop ? "bg-[#e8f8d8]" : "bg-[#f7f7f4]"
                                        )}
                                      >
                                        {/* R68 — stat keys #a3a3a3 → #6f6f6f: 8px
                                            glyphs need the extra ink (VLM med) */}
                                        <p className="text-[8px] tracking-wider text-[#6f6f6f]">{k.toUpperCase()}</p>
                                        <p
                                          className={cn(
                                            "mt-0.5 text-[10px] font-bold tabular-nums",
                                            isTop ? "text-[#46a302]" : "text-[#3c3c3c]"
                                          )}
                                        >
                                          {a.stats[k]}
                                        </p>
                                      </div>
                                    )
                                  })}
                                </div>
                              </motion.button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 1 && <BodyBaselineStep draft={body} onDraft={setBody} />}

                  {step === 2 && (
                    <DirectiveStep
                      goal={goal}
                      onGoal={setGoal}
                      primary={primary}
                      onPrimary={setPrimary}
                      name={name}
                      archetypeName={archName}
                      body={body}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* in-card error line — rose, reject-don't-clamp */}
            {error && (
              <div
                role="alert"
                className="mt-5 flex items-center gap-2 rounded-xl border-2 border-[#ffd7d7] bg-[#ffe5e5] px-3 py-2 text-xs font-semibold text-[#c63636]"
              >
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                {error}
              </div>
            )}

            {/* navigation — 44px targets throughout */}
            <div className="mt-7 flex items-center gap-3">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => go(-1)}
                  disabled={busy}
                  aria-label="Back to previous step"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-[#e5e5e5] bg-white shadow-[0_3px_0_0_#e5e5e5] transition-all hover:border-[#c9e8a6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02] active:translate-y-[3px] active:shadow-none disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4 text-[#777]" aria-hidden />
                </button>
              ) : (
                <div className="h-11 w-11 shrink-0" aria-hidden />
              )}
              <BigButton
                onClick={step < STEP_COUNT - 1 ? advance : awaken}
                disabled={busy || (step === 1 && bodyErr !== null)}
                variant={queued ? "gold" : "green"}
                size="lg"
                full
                className="flex-1"
              >
                {step < STEP_COUNT - 1
                  ? "Continue"
                  : queued
                    ? "Queued — auto-sync"
                    : busy
                      ? "Setting up…"
                      : "Awaken"}
              </BigButton>
            </div>

            {/* the explicit skip path — library defaults are the fallback */}
            {step === 1 && (
              <button
                type="button"
                onClick={skipBody}
                disabled={busy}
                className="mt-2.5 h-11 w-full rounded-2xl border-2 border-[#e5e5e5] bg-white text-xs font-extrabold text-[#777] transition-colors hover:bg-[#f7f7f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02] disabled:opacity-40"
              >
                Skip — defaults apply
              </button>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
