"use client"

import { useEffect, useRef, useState } from "react"
import { Gem, Lock, Plus, Wand2 } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { InfoHint } from "@/components/system/info-hint"
import { FLOW_EASE, PopIn, pulseBreathe, useCountUp } from "@/components/system/motion"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import type { ForgeDTO, HunterDTO, RelicView } from "@/lib/types"
import { cn } from "@/lib/utils"

type ForgeRes = ForgeDTO & { acquired?: string }

const KIND_LABEL: Record<RelicView["kind"], string> = {
  passive: "PASSIVE",
  charged: "CHARGED",
  instant: "INSTANT",
}

function ChargePips({ charges, max, accent }: { charges: number; max: number; accent: string }) {
  // R15 — pips fill in sequence on mount (scaleX 0→1 from the left edge,
  // pip-staggered 0.06s — the rank reads as charging up) and the row pops in
  // on a SPRING_BOUNCE via PopIn; the charges key remounts the whole row when
  // a charge lands so the sequence replays. The old forge-pip-pop CSS
  // keyframe is gone (it fought framer's inline transform). Reduced motion:
  // PopIn renders a plain div and the pips mount statically.
  const reduce = useReducedMotion()
  if (max <= 1) return null
  return (
    <PopIn
      key={charges}
      className="flex items-center gap-1"
      aria-label={`${charges} of ${max} charges`}
    >
      {Array.from({ length: max }).map((_, i) => (
        <motion.span
          key={i}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={
            reduce ? { duration: 0 } : { delay: i * 0.06, duration: 0.35, ease: FLOW_EASE }
          }
          style={{ transformOrigin: "left" }}
          className={cn(
            "h-1.5 w-3 rounded-full",
            i < charges
              ? cn(accent.replace("text-", "bg-"), "drop-shadow-[0_0_4px_rgba(255,255,255,0.45)]")
              : "bg-zinc-800"
          )}
          aria-hidden
        />
      ))}
    </PopIn>
  )
}

/** Decorative forge divider — flowing ember dash + pulsing anvil nodes + rising sparks. */
function ForgeDivider() {
  const nodes = [12, 32, 50, 68, 88]
  const sparks = [
    { left: "20%", delay: "0s" },
    { left: "44%", delay: "0.8s" },
    { left: "76%", delay: "1.6s" },
  ]
  return (
    <div className="relative mx-1 mt-1 h-6 select-none" aria-hidden>
      <svg
        className="absolute inset-x-0 top-1/2 h-2 w-full -translate-y-1/2"
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        fill="none"
      >
        <line x1="0" y1="4" x2="100" y2="4" stroke="rgba(245,158,11,0.13)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line
          x1="0"
          y1="4"
          x2="100"
          y2="4"
          stroke="rgba(252,211,77,0.75)"
          strokeWidth="1"
          strokeDasharray="5 95"
          vectorEffect="non-scaling-stroke"
          className="forge-ember-flow"
        />
      </svg>
      {nodes.map((left, i) => (
        <span
          key={left}
          className={cn(
            "absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border",
            i === 2
              ? "sys-pulse border-amber-300/70 bg-amber-400/30 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
              : "border-amber-500/40 bg-amber-500/10"
          )}
          style={{ left: `${left}%` }}
        />
      ))}
      {sparks.map((s) => (
        <span
          key={s.left}
          className="forge-spark absolute h-1 w-1 rounded-full bg-amber-300/80 shadow-[0_0_6px_rgba(245,158,11,0.8)]"
          style={{ left: s.left, top: "calc(50% - 2px)", animationDelay: s.delay }}
        />
      ))}
    </div>
  )
}

function RelicCard({ relic, essence, onAct, busy, index, cardRef }: {
  relic: RelicView
  essence: number
  onAct: (relic: RelicView, action: "acquire" | "mirror") => void
  busy: string | null
  /** Grid position — drives the staggered entrance delay. */
  index: number
  /** Registers the card surface for the R15 live-purchase pulse. */
  cardRef: (el: HTMLDivElement | null) => void
}) {
  const reduce = useReducedMotion()
  const affordable = essence >= relic.cost
  const isBusy = busy === relic.code

  return (
    // R15 — staggered rise on the flow language (delay min(i,8)*0.05, 0.45s
    // FLOW_EASE; reduced motion → instant). transition-all is scoped to the
    // color/border/shadow/filter set so the CSS engine never tweens framer's
    // transform writes (R14-b lesson) — hover states are visually identical.
    <motion.div
      ref={cardRef}
      // R54-c4 declutter — the card's description prose rides this title
      // attribute; the face keeps name · epithet · effect · price · state.
      title={relic.desc}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : { delay: Math.min(index, 8) * 0.05, duration: 0.45, ease: FLOW_EASE }
      }
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-sm border bg-zinc-950/50 p-4",
        "transition-[color,background-color,border-color,box-shadow,filter]",
        "focus-within:border-violet-400/50",
        relic.owned
          ? cn(relic.border, "bg-gradient-to-b from-zinc-950/80 to-zinc-950/40", relic.glow, "group-hover:brightness-110")
          : "border-zinc-700/60 hover:border-violet-400/60 hover:shadow-[0_0_18px_rgba(139,92,246,0.22)]"
      )}
    >
      {/* owned relics — soft breathing inner glow */}
      {relic.owned && (
        <span
          className="relic-breathe pointer-events-none absolute inset-0 rounded-sm shadow-[inset_0_0_22px_rgba(167,139,250,0.14)]"
          aria-hidden
        />
      )}
      {/* glyph watermark — tilts + swells on hover */}
      <span
        className={cn(
          "pointer-events-none absolute -right-3 -top-4 select-none font-mono text-7xl font-black opacity-[0.06] transition-all duration-500 group-hover:-rotate-6 group-hover:scale-110 group-hover:opacity-[0.14]",
          relic.accent
        )}
        aria-hidden
      >
        {relic.glyph}
      </span>

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-sm border bg-black/40 font-mono text-lg font-bold",
            relic.owned ? relic.border : "border-zinc-700/60"
          )}>
            <span className={relic.accent}>{relic.glyph}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-bold tracking-wider text-zinc-100">{relic.name}</p>
            <p className={cn("truncate font-mono text-[8px] tracking-[0.3em]", relic.accent)}>{relic.epithet}</p>
          </div>
        </div>
        {relic.owned && (
          <span className="shrink-0 rounded-sm border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.2em] text-emerald-300">
            OWNED
          </span>
        )}
      </div>

      {/* R54-c4 — the 11px description prose stood down; it rides the card
          root's title attribute above (relic.desc, unchanged from relics.ts). */}

      <p className={cn("mt-3 font-mono text-[10px] font-bold tracking-widest", relic.accent)}>
        ◆ {relic.effect}
      </p>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <div className="flex flex-col gap-1.5">
          {/* R16 — kind/lore footer line: zinc-600 was below AA at 9px → zinc-400. */}
          <span className="font-mono text-[9px] tracking-[0.2em] text-zinc-400">{KIND_LABEL[relic.kind]} · {relic.lore.split("·")[1]?.trim() ?? ""}</span>
          {relic.kind === "charged" && relic.owned && (
            <ChargePips charges={relic.charges} max={relic.maxCharges} accent={relic.accent} />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={cn(
            "flex items-center gap-1 font-mono text-xs font-bold tabular-nums",
            relic.owned ? "text-zinc-600 line-through" : affordable ? "text-teal-300" : "text-zinc-600"
          )}>
            <Gem className="h-3 w-3" aria-hidden /> {relic.cost}
          </span>

          {relic.kind === "instant" && relic.owned ? (
            <button
              onClick={() => onAct(relic, "mirror")}
              disabled={isBusy}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.25em] transition-all",
                "border-teal-400/60 bg-teal-500/15 text-teal-300 hover:bg-teal-500/30 hover:shadow-[0_0_12px_rgba(20,184,166,0.3)] disabled:opacity-40",
                "focus-visible:outline focus-visible:outline-violet-400/70"
              )}
            >
              <Wand2 className="h-3 w-3" aria-hidden />
              {isBusy ? "USING…" : "USE"}
            </button>
          ) : relic.owned && relic.kind === "passive" ? (
            <span className="flex items-center gap-1 font-mono text-[9px] tracking-[0.2em] text-zinc-400">
              <Lock className="h-3 w-3" aria-hidden /> PERMANENT
            </span>
          ) : (
            <button
              onClick={() => onAct(relic, "acquire")}
              disabled={isBusy || !relic.canAcquire}
              className={cn(
                "flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.25em] transition-all",
                relic.canAcquire
                  ? "border-teal-400/60 bg-teal-500/10 text-teal-300 hover:bg-teal-500/25 hover:shadow-[0_0_14px_rgba(20,184,166,0.3)] active:bg-teal-500/35"
                  : "border-zinc-700/60 bg-zinc-900/40 text-zinc-600",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "focus-visible:outline focus-visible:outline-violet-400/70"
              )}
            >
              <Plus className="h-3 w-3" aria-hidden />
              {isBusy ? "BUYING…" : relic.owned ? "ADD CHARGE" : "GET PERK"}
            </button>
          )}
        </div>
      </div>

      {/* R16 — VLM "dim" flag: base color is animation-owned (.forge-need in
          globals.css pulses zinc-500→amber, and a running keyframe overrides
          any utility class), so the in-file crispness lever is size: 9px→10px
          matches the CREDITS label and the file's other 10px micro labels. */}
      {!relic.owned && !affordable && (
        <p className="forge-need mt-2 font-mono text-[10px] font-bold tabular-nums tracking-widest">
          REQUIRES {(relic.cost - essence).toLocaleString()} MORE CREDITS
        </p>
      )}
    </motion.div>
  )
}

/** FORGE tab — aether essence economy + relic binding. */
export function ForgeTab({ hunter }: { hunter: HunterDTO }) {
  const { data, loading, reload } = useApi<ForgeRes>("/api/forge")
  const { pushNotice, bumpRefresh } = useSystem()
  const [busy, setBusy] = useState<string | null>(null)
  const reduce = useReducedMotion()

  // R15 — live-purchase celebration (R14-c claim-bloom recipe): one surface
  // ref + one previous owned/charges snapshot per card. After a data refresh
  // the effect diffs and fires a one-shot pulseBreathe on that card's surface
  // — ONLY on the live owned flip (GET PERK) or charge gain (ADD CHARGE). A
  // card that mounts already-owned never pulses (prev === undefined), mirror
  // USE and un-owns stand down, reduced motion skips entirely, and codes that
  // leave the set are pruned. The card root is at rest (transform: none) long
  // before any purchase, so the imperative pulse composes cleanly with the
  // framer-managed entrance.
  const cardSurfaces = useRef(new Map<string, HTMLDivElement>())
  const prevState = useRef(new Map<string, { owned: boolean; charges: number }>())
  useEffect(() => {
    if (!data) return
    for (const r of data.relics) {
      const prev = prevState.current.get(r.code)
      prevState.current.set(r.code, { owned: r.owned, charges: r.charges })
      if (!prev || reduce) continue
      const acquired = r.owned && !prev.owned
      const chargeGain = r.owned && prev.owned && r.charges > prev.charges
      if (!acquired && !chargeGain) continue
      const el = cardSurfaces.current.get(r.code)
      if (el) pulseBreathe(el)
    }
    const live = new Set(data.relics.map((r) => r.code))
    for (const code of prevState.current.keys()) {
      if (!live.has(code)) {
        prevState.current.delete(code)
        cardSurfaces.current.delete(code)
      }
    }
  }, [data, reduce])

  const essence = data?.essence ?? hunter.essence
  // R15 — the hero numeral counts up on mount and GLIDES on refresh (a
  // purchase visibly drains the balance); useCountUp self-gates on reduce.
  const essenceShown = useCountUp(essence)
  const relics = data?.relics ?? []

  const acquire = async (relic: RelicView, action: "acquire" | "mirror") => {
    if (busy) return
    setBusy(relic.code)
    try {
      const res = await api<ForgeRes>("/api/forge", {
        method: "POST",
        body: JSON.stringify({ action, code: relic.code }),
      })
      if (action === "mirror") {
        pushNotice({
          kind: "title",
          title: "PERK USED",
          body: "+2 attribute points added to your profile.",
        })
        bumpRefresh()
      } else {
        pushNotice({
          kind: "info",
          title: `${relic.name.toUpperCase()} ACQUIRED`,
          body: relic.effect,
        })
      }
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Shop failed", body: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-4 sm:space-y-5">
        <SkeletonPanel label="LOADING REWARDS SHOP" rows={1}>
          <div className="skel-bar h-16 w-full" />
        </SkeletonPanel>
        <SkeletonPanel label="SYNCING PERKS" rows={4} />
      </div>
    )
  }

  const ownedCount = relics.filter((r) => r.owned).length

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* essence header */}
      <SystemPanel
        label="Rewards Shop"
        labelAccent={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
              {ownedCount}/{relics.length} OWNED
            </span>
            {/* R54-c4 declutter — the editorial paragraph ("Credits are earned
                from completed sessions… each perk is a permanent boost…")
                folded into this InfoHint (perks glossary key). */}
            <InfoHint term="perks" />
          </span>
        }
      >
        <div className="relative p-4 sm:p-5">
          {/* forge ember field — rising embers + drifting heat haze */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="forge-glow-drift absolute -right-10 -top-14 h-40 w-40 rounded-full bg-teal-500/10 blur-3xl" />
            <div
              className="forge-glow-drift absolute -left-14 top-2 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl"
              style={{ animationDelay: "-4.5s" }}
            />
            <span
              className="forge-ember"
              style={{ left: "7%", width: 3, height: 3, "--ember-delay": "0s", "--ember-dur": "6.5s", "--ember-drift": "14px" } as React.CSSProperties}
            />
            <span
              className="forge-ember"
              style={{ left: "22%", width: 2, height: 2, "--ember-delay": "1.8s", "--ember-dur": "7.5s", "--ember-drift": "-10px" } as React.CSSProperties}
            />
            <span
              className="forge-ember"
              style={{
                left: "38%", width: 4, height: 4, "--ember-delay": "3.2s", "--ember-dur": "8s", "--ember-drift": "12px",
                background: "rgba(94,234,212,0.8)",
                boxShadow: "0 0 6px rgba(45,212,191,0.7), 0 0 12px rgba(20,184,166,0.3)",
              } as React.CSSProperties}
            />
            <span
              className="forge-ember"
              style={{ left: "56%", width: 2, height: 2, "--ember-delay": "0.9s", "--ember-dur": "7s", "--ember-drift": "-14px" } as React.CSSProperties}
            />
            <span
              className="forge-ember"
              style={{ left: "72%", width: 3, height: 3, "--ember-delay": "2.6s", "--ember-dur": "6.2s", "--ember-drift": "10px" } as React.CSSProperties}
            />
            <span
              className="forge-ember"
              style={{ left: "88%", width: 2, height: 2, "--ember-delay": "4.1s", "--ember-dur": "8.4s", "--ember-drift": "-12px" } as React.CSSProperties}
            />
          </div>

          <div
            className="relative flex flex-wrap items-center gap-5"
            title="Earned from: session complete + streak · personal record +15 · goal claim"
          >
            <div className="flex items-center gap-3">
              <div className="relative grid h-14 w-14 place-items-center rounded-sm border border-teal-500/50 bg-teal-500/10 shadow-[0_0_24px_rgba(20,184,166,0.35)]">
                <Gem className="h-6 w-6 text-teal-300 drop-shadow-[0_0_8px_rgba(45,212,191,0.7)]" aria-hidden />
                <span className="absolute inset-0 animate-ping rounded-sm border border-teal-400/20" aria-hidden />
              </div>
              <div>
                <p className="font-mono text-3xl font-bold tabular-nums text-glow-teal text-teal-200">
                  ◈ {Math.round(essenceShown).toLocaleString()}
                </p>
                {/* R16 — VLM nit: the 8px zinc-600 "CREDITS" label was far
                    below AA → 10px zinc-400 (sys-label already sets 10px +
                    0.32em tracking; text-[10px] keeps it explicit). */}
                <p className="sys-label text-[10px] text-zinc-400">CREDITS</p>
              </div>
            </div>
            {/* R54-c4 — the earn-rate line (SESSION COMPLETE + STREAK /
                PERSONAL RECORD +15 / GOAL CLAIM) folded into the wrapper's
                title attribute above; the editorial paragraph lives in the
                perks InfoHint on the panel label. */}
          </div>
        </div>
      </SystemPanel>

      {/* relic grid — R16: the label row's shared violet/10 border reads
          near-invisible at desktop width, so the header↔list separation now
          rides the app's in-panel zinc hairline (gates-tab / test-lab
          separator idiom: mt-2 + border-zinc-800/60, grid keeps its p-4 air). */}
      <SystemPanel label="Perks">
        <div className="mt-2 border-t border-zinc-800/60" aria-hidden />
        <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
          {relics.map((r, i) => (
            <RelicCard
              key={r.code}
              relic={r}
              essence={essence}
              onAct={acquire}
              busy={busy}
              index={i}
              cardRef={(el) => {
                if (el) cardSurfaces.current.set(r.code, el)
                else cardSurfaces.current.delete(r.code)
              }}
            />
          ))}
        </div>
      </SystemPanel>

      {/* forge divider motif — ember line above the bottom caption */}
      <ForgeDivider />

      {/* R54-c4 declutter — the all-caps mechanics banner now a quiet
          sentence-case one-liner (the streak-shield note rides the shield
          card's own title attribute). */}
      <p className="px-1 text-center font-mono text-[10px] tracking-widest text-zinc-400">
        Passives apply automatically · charged perks fire from the goal log.
      </p>
    </div>
  )
}
