"use client"

import { useState } from "react"
import { Check, Crown } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { EmptyGlyph, LockedRune } from "@/components/system/empty-glyph"
import { InfoHint } from "@/components/system/info-hint"
import { SwipeRow, type SwipeRowAction } from "@/components/system/swipe-row"
import { RowHint } from "@/components/system/row-hint"
import { DecodeText, FLOW_EASE, PopIn } from "@/components/system/motion"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { TIER_STYLES } from "@/lib/titles"
import { cn } from "@/lib/utils"
import type { HunterDTO } from "@/lib/types"

type TitlesRes = {
  titles: {
    code: string
    title: string
    epithet: string
    desc: string
    tier: "common" | "rare" | "epic" | "legend"
    tierLabel: string
    unlocked: boolean
    unlockedAt: string | null
    equipped: boolean
  }[]
  equipped: string | null
}

/** R12-a — swipe-to-feature on unlocked, un-equipped badge cards: violet rail;
 *  the swipe routes to the same equip() as the FEATURE button. */
const SWIPE_FEATURE: SwipeRowAction = { icon: Crown, tone: "violet", label: "FEATURE" }

/** TITLES tab — achievement grid with equip. */
export function TitlesTab({ hunter }: { hunter: HunterDTO }) {
  const { data, loading, reload } = useApi<TitlesRes>("/api/achievements")
  const { pushNotice, bumpRefresh } = useSystem()
  const [busy, setBusy] = useState<string | null>(null)
  const reduce = useReducedMotion()

  const titles = data?.titles ?? []
  const unlockedCount = titles.filter((t) => t.unlocked).length

  const equip = async (code: string | null) => {
    if (busy) return
    setBusy(code ?? "none")
    try {
      await api("/api/hunter", {
        method: "PATCH",
        body: JSON.stringify({ equippedTitle: code }),
      })
      pushNotice({
        kind: "info",
        title: code ? "Badge featured" : "Badge removed",
        body: code ? "Your featured badge has changed." : "No featured badge selected.",
      })
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Action failed", body: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {loading && !data ? (
        <SkeletonPanel label="SYNCING BADGE COLLECTION" rows={3} />
      ) : (
      <SystemPanel
        label="Badge Collection"
        labelAccent={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
              {unlockedCount}/{titles.length} ACQUIRED
            </span>
            {/* R54-c4 declutter — the editorial paragraph ("Badges are permanent
                proof of your training milestones. Feature one to wear it…")
                folded into this InfoHint (badges glossary key). */}
            <InfoHint term="badges" />
          </span>
        }
      >
        <div className="p-4 sm:p-5">
          {/* R54-c4 — the editorial intro stood down; the featured-badge state
              rides the grid's title attribute below (and the FEATURED chip on
              the equipped card shows it live). */}

          {/* all-locked state — the sealed registry (R54-c4: two dramatic caps
              lines → one quiet sentence-case line; the full phrase rides the
              role=status aria-label) */}
          {titles.length > 0 && unlockedCount === 0 && (
            <div
              className="mt-5 flex flex-col items-center rounded-sm border border-dashed border-violet-500/25 bg-violet-500/[0.03] py-7 text-center"
              role="status"
              aria-label="The collection is sealed — no badges claimed · your first milestone awaits"
            >
              <EmptyGlyph variant="crown" className="h-20 w-20" />
              <p className="mt-3 font-mono text-xs tracking-widest text-zinc-400">No badges claimed yet.</p>
            </div>
          )}

          {/* R13-b — one-time row-gesture hint (badge cards below) */}
          <RowHint surface="titles" />

          <div
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            title={`Featured badge: ${hunter.equippedTitle ? "custom" : "none"}`}
          >
            {titles.map((t, i) => {
              const tier = TIER_STYLES[t.tier]
              // R15 — standard card rise: delay min(i,8)*0.05, 0.45s FLOW_EASE
              // (capped stagger so long collections queue ≤0.4s)
              const cardDelay = Math.min(i, 8) * 0.05
              // one card body shared by both render paths (R11-a pattern) —
              // pixel-identical whether or not it rides the swipe affordance.
              // R15: the card is a PLAIN div now — its entrance motion moved
              // out to the grid-cell wrapper so it never lives inside
              // SwipeRow's sheet transform owner.
              const card = (
                <div
                  // R54-c4 declutter — the card's description prose rides this
                  // title attribute; the face keeps name · epithet · tier · state.
                  title={t.desc}
                  className={cn(
                    "relative overflow-hidden rounded-lg border p-4",
                    t.unlocked ? cn(tier.border, tier.glow) : "border-zinc-800/70",
                    t.unlocked ? "bg-gradient-to-br from-zinc-900/80 to-zinc-950/90" : "bg-zinc-950/40"
                  )}
                >
                  {/* faint rune watermark on locked titles */}
                  {!t.unlocked && (
                    <svg
                      viewBox="0 0 80 80"
                      className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24 text-zinc-800/70"
                      fill="none"
                      aria-hidden
                    >
                      <path d="M40 6 L74 40 L40 74 L6 40 Z" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M40 22 L58 40 L40 58 L22 40 Z" stroke="currentColor" strokeWidth="1" opacity="0.6" />
                    </svg>
                  )}
                  {t.equipped && (
                    <div className="absolute right-0 top-0 rounded-bl-sm border-b border-l border-violet-400/40 bg-violet-500/20 px-2 py-0.5 font-mono text-[8px] tracking-[0.25em] text-violet-200">
                      FEATURED
                    </div>
                  )}
                  <div className="relative flex items-start gap-3">
                    {t.unlocked ? (
                      <Crown className={cn("mt-0.5 h-5 w-5 shrink-0", tier.text)} aria-hidden />
                    ) : (
                      <LockedRune className="mt-0.5 text-zinc-700" />
                    )}
                    <div className="min-w-0">
                      {t.equipped ? (
                        // R15 — the equipped badge is the hero of the tab: its
                        // name decrypts in (R14 hunter-card recipe) just as the
                        // card's PopIn spring settles
                        <DecodeText
                          text={t.title}
                          as="p"
                          delay={cardDelay + 0.3}
                          className={cn(
                            "truncate font-mono text-sm font-bold tracking-wider",
                            tier.text
                          )}
                        />
                      ) : (
                        <p className={cn("truncate font-mono text-sm font-bold tracking-wider", t.unlocked ? tier.text : "text-zinc-600")}>
                          {t.title}
                        </p>
                      )}
                      <p className={cn("mt-0.5 truncate text-[10px] font-mono tracking-widest", t.unlocked ? "text-zinc-400" : "text-zinc-700")}>
                        {t.epithet}
                      </p>
                    </div>
                  </div>
                  {/* R54-c4 — the 11px description prose stood down; it rides
                      the card root's title attribute above. */}
                  <div className="mt-3 flex items-center justify-between">
                    <span
                      className={cn(
                        "font-mono text-[9px] tracking-[0.3em]",
                        t.unlocked ? tier.text : "text-zinc-700"
                      )}
                    >
                      {t.tierLabel}
                    </span>
                    {t.unlocked && !t.equipped && (
                      <button
                        onClick={() => equip(t.code)}
                        disabled={busy !== null}
                        className="min-h-11 rounded-sm border border-violet-400/50 bg-violet-500/15 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/35 active:bg-violet-500/45 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                      >
                        FEATURE
                      </button>
                    )}
                    {t.equipped && (
                      <button
                        onClick={() => equip(null)}
                        disabled={busy !== null}
                        className="flex min-h-11 items-center gap-1 rounded-sm border border-emerald-400/50 bg-emerald-500/10 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.25em] text-emerald-300 transition-all hover:bg-emerald-500/25 active:bg-emerald-500/35 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                      >
                        <Check className="h-3 w-3" aria-hidden /> FEATURED
                      </button>
                    )}
                  </div>
                </div>
              )
              // R12-a — swipe-to-feature: unlocked && un-equipped cards ride a
              // SwipeRow (the swipe IS the feature — onCommit routes to the same
              // equip() as the FEATURE button, which stays the accessible path;
              // an in-flight equip PATCH or reduced motion stands the gesture
              // down). Equipped and locked cards stay unwrapped (lightest DOM,
              // R11-a sanctioned pattern — un-feature remains a deliberate tap,
              // locked has no action). The opaque sheet base sleeps under the
              // card's translucent gradient so the violet rail rests hidden —
              // R10 quest-row / R11 fuel-row recipe. R15: the grid cell is now
              // a motion wrapper AROUND the whole SwipeRow — entrance motion
              // never rides inside the sheet transform owner — and the
              // equipped card gets the hero treatment instead (PopIn + name
              // decrypt, above).
              if (t.equipped) {
                return (
                  <PopIn key={t.code} delay={cardDelay}>
                    {card}
                  </PopIn>
                )
              }
              return (
                <motion.div
                  key={t.code}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { delay: cardDelay, duration: 0.45, ease: FLOW_EASE }
                  }
                >
                  {t.unlocked ? (
                    <SwipeRow
                      action={SWIPE_FEATURE}
                      onCommit={() => equip(t.code)}
                      enabled={busy === null && !reduce}
                      className="relative overflow-hidden rounded-lg"
                    >
                      <div
                        className="relative rounded-lg"
                        style={{ backgroundImage: "linear-gradient(160deg, #17171B, #0B0B0E)" }}
                      >
                        {card}
                        {/* grip hint — AFTER the (position:relative) card in DOM so it
                            paints above it; sits in the card's p-4 padding strip,
                            inside the overflow-hidden root */}
                        {!reduce && busy === null && (
                          <span
                            className="sys-row-hint pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[10px] leading-none text-zinc-600"
                            aria-hidden
                          >
                            «
                          </span>
                        )}
                      </div>
                    </SwipeRow>
                  ) : (
                    card
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>
      </SystemPanel>
      )}
    </div>
  )
}
