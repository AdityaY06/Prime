"use client"

/**
 * R57 · CLEAN SLATE — the PRIME shell, reborn light.
 *
 * "Due to too much clutter — do a complete change, refer to Duolingo and
 * other exercise apps: simple, crisp and human, super clean and neat."
 *
 * The chrome is now five friendly facades (Home / Train / Log / Stats / You)
 * behind one white app shell: a slim stat-pill header, a docked tab bar, a
 * tiny honest footer. The cinematic layers (ambient aurora, film grain,
 * vignette, Oracle console, system voice, PrimeGate splash) are unmounted —
 * merge & hide: every component stays on disk and its features ride behind
 * each facade's ShowEverything expander. Toasts + the reward celebration
 * overlay stay: feedback is the Duolingo soul.
 *
 * Legacy tab values (status/gates/…) resolve onto their facade so internal
 * navigations from preserved components keep working — nothing 404s.
 */

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useApi } from "@/hooks/use-api"
import { TAB_ORDER, useSystem, type Tab } from "@/store/system-store"
import { AwakeningScreen } from "@/components/fitness/awakening-screen"
import { NotificationStack } from "@/components/system/notification-stack"
import { RewardOverlay } from "@/components/system/reward-overlay"
import { SwipeFlow } from "@/components/system/swipe-flow"
import { FLOW_EASE } from "@/components/system/motion"
import { RevealGate } from "@/components/system/reveal"
import { TopBar, TabBar } from "@/components/prime/nav"
import { Skeleton } from "@/components/prime/kit"
import type { HunterDTO } from "@/lib/types"

// Lazy facades — each loads its own chunk on first visit; the shell paints
// instantly with clean skeletons.
const HomeTab = dynamic(() => import("@/components/prime/home-tab").then((m) => m.HomeTab), {
  ssr: false,
  loading: () => <FacadeSkeleton label="Home" />,
})
const TrainTab = dynamic(() => import("@/components/prime/train-tab").then((m) => m.TrainTab), {
  ssr: false,
  loading: () => <FacadeSkeleton label="Train" />,
})
const LogTab = dynamic(() => import("@/components/prime/log-tab").then((m) => m.LogTab), {
  ssr: false,
  loading: () => <FacadeSkeleton label="Log" />,
})
const StatsTab = dynamic(() => import("@/components/prime/stats-tab").then((m) => m.StatsTab), {
  ssr: false,
  loading: () => <FacadeSkeleton label="Stats" />,
})
const ScienceTab = dynamic(() => import("@/components/prime/science-tab").then((m) => m.ScienceTab), {
  ssr: false,
  loading: () => <FacadeSkeleton label="Science" />,
})
const YouTab = dynamic(() => import("@/components/prime/you-tab").then((m) => m.YouTab), {
  ssr: false,
  loading: () => <FacadeSkeleton label="You" />,
})

/** Legacy tab values resolve onto their facade home (merge & hide). */
const FACADE_OF: Record<Tab, "home" | "train" | "log" | "stats" | "science" | "you"> = {
  home: "home",
  train: "train",
  log: "log",
  stats: "stats",
  science: "science",
  you: "you",
  status: "home",
  directives: "home",
  gates: "train",
  body: "log",
  fuel: "log",
  vitals: "log",
  records: "stats",
  forge: "you",
  titles: "you",
}

function FacadeSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-label={`${label} is loading`}>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

/** The clean boot state — one pulsing green monogram, nothing else. */
function CleanBoot() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="grid h-14 w-14 animate-pulse place-items-center rounded-2xl bg-[#58cc02] shadow-[0_4px_0_0_#46a302]">
        <span className="text-2xl font-black leading-none text-white" aria-hidden>
          P
        </span>
        <span className="sr-only">PRIME is starting</span>
      </div>
    </div>
  )
}

export default function Page() {
  const { tab } = useSystem()
  const tabDirection = useSystem((s) => s.tabDirection)
  const reduce = useReducedMotion()
  const { data, error, loading } = useApi<{ hunter: HunterDTO }>("/api/hunter")

  const notAwakened = error === "NOT_AWAKENED"
  const view = FACADE_OF[tab]

  // every view change glides back to the top
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
  }, [tab, reduce])

  // R20-a boot deep-link (launcher shortcuts, external links): the param is
  // validated against the six-facade TAB_ORDER; one-shot on mount.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab")
    if (requested && TAB_ORDER.includes(requested as Tab)) {
      useSystem.setState({ tab: requested as Tab, tabDirection: 0 })
    }
  }, [])

  return (
    // R59 — the root drops its bg-white: the body's ambient wash (the
    // Stripe-style tri-tone radial gradients on body::before) now glows
    // through beneath the content, cards and frosted chrome float on it.
    <div className="flex min-h-screen flex-col">
      {/* R29-a — reveal gate: the legacy scroll-reveal module's js-reveal
          document gate must sit in the client graph before any legacy mount */}
      <RevealGate />

      {/* boot / onboarding states */}
      {loading && <CleanBoot />}
      {!loading && notAwakened && (
        <div className="legacy-surface min-h-screen rounded-none border-0">
          <AwakeningScreen />
        </div>
      )}

      {/* main app */}
      {!loading && !notAwakened && data?.hunter && (
        <>
          <TopBar hunter={data.hunter} />
          <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pb-24 pt-5">
            <SwipeFlow>
              <div className="relative overflow-x-clip">
                {/* R14-a — the battle-tested overlapping crossfade, tuned
                    lighter for the clean era: R58 swaps the fixed tween for a
                    soft spring glide-in (flowy settle, no bounce) with a quick
                    fade-pop out (self-managed out-of-flow exit). */}
                <AnimatePresence mode="sync" custom={tabDirection}>
                  <motion.div
                    key={tab}
                    role="region"
                    aria-label={`${view} view`}
                    custom={tabDirection}
                    variants={{
                      enter: (dir: number) => ({
                        opacity: 0,
                        x: reduce || dir === 0 ? 0 : dir * 44,
                      }),
                      center: {
                        opacity: 1,
                        x: 0,
                        transition: reduce
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 380, damping: 34 },
                      },
                      exit: (dir: number) => ({
                        opacity: 0,
                        x: reduce || dir === 0 ? 0 : dir * -24,
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        zIndex: 0,
                        pointerEvents: "none",
                        transition: { duration: 0.15, ease: FLOW_EASE },
                      }),
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    style={{ zIndex: 1 }}
                  >
                    {view === "home" && <HomeTab hunter={data.hunter} />}
                    {view === "train" && <TrainTab hunter={data.hunter} />}
                    {view === "log" && <LogTab hunter={data.hunter} />}
                    {view === "stats" && <StatsTab hunter={data.hunter} />}
                    {view === "science" && <ScienceTab hunter={data.hunter} />}
                    {view === "you" && <YouTab hunter={data.hunter} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </SwipeFlow>
          </main>

          <footer className="mt-auto mb-[76px] px-4 text-center md:mb-4">
            {/* R68 — #c9c9c9 (1.9:1) → #8a8a8a (3.5:1): the footer was the
              single faintest text on every facade (VLM: "nearly invisible") */}
          <p className="text-[11px] font-bold text-[#8a8a8a]">
              prime · your data stays on this device
            </p>
          </footer>

          <TabBar />
        </>
      )}

      {/* error state (non-404) */}
      {!loading && error && !notAwakened && (
        <div className="grid min-h-screen place-items-center px-6">
          <div className="max-w-md rounded-2xl border-2 border-[#e5e5e5] bg-white p-6 text-center">
            <p className="text-sm font-black text-[#e64545]">Something broke</p>
            <p className="mt-2 text-sm font-semibold text-[#777]">{error}</p>
            <p className="mt-3 text-xs font-bold text-[#8a8a8a]">
              Reload the page to try again
            </p>
          </div>
        </div>
      )}

      {/* feedback stays: toasts + the reward celebration */}
      <NotificationStack />
      <RewardOverlay />
    </div>
  )
}
