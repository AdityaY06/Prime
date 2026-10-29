"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { InfoHint } from "@/components/system/info-hint"
import type { GlossaryKey } from "@/lib/glossary"
import { SystemPanel } from "@/components/system/system-panel"
import { RankBadge } from "@/components/system/rank-badge"
import { XPBar } from "@/components/system/xp-bar"
import { DecodeText, FLOW_EASE, SPRING_BOUNCE, useCountUp } from "@/components/system/motion"
import { ARCHETYPES, RANKS } from "@/lib/game"
import { titleByCode } from "@/lib/titles"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

/** R43 studio — ladder pill letter tones: monochrome ivory through the
 *  working ranks, amber for the gilded top tiers (the studio's one warm
 *  accent). The shared RANKS tokens still carry pre-studio hues at E/D;
 *  this display map keeps the ladder neutral regardless of rank. */
const RANK_PILL_TEXT: Record<string, string> = {
  F: "text-zinc-200",
  E: "text-zinc-200",
  D: "text-zinc-200",
  C: "text-zinc-100",
  B: "text-amber-300",
  A: "text-amber-200",
  S: "text-amber-100",
}

/** R43 studio — the shared RANKS tokens still carry pre-studio hues at
 *  D (sky) and E (emerald); the medallion reads neutral ivory instead,
 *  via the existing className prop — no shared-file changes. */
const MEDALLION_STUDIO_TEXT: Record<string, string> = {
  D: "text-zinc-100",
  E: "text-zinc-100",
}

/** The main hunter status window — the "system window" identity piece. */
export function HunterCard({ hunter }: { hunter: HunterDTO }) {
  // flow numerals — mount from zero, glide between values on refresh
  const level = useCountUp(hunter.level)
  const xp = useCountUp(hunter.xp)
  const xpNeeded = useCountUp(hunter.xpNeeded)
  const power = useCountUp(hunter.power)
  const streak = useCountUp(hunter.streak)
  const totalSessions = useCountUp(hunter.totalSessions)
  const arch = ARCHETYPES.find((a) => a.id === hunter.archetype)
  const title = hunter.equippedTitle ? titleByCode(hunter.equippedTitle) : null
  const rankIdx = RANKS.findIndex((r) => r.rank === hunter.rank)

  // R14 entrance sweep — one narrow light band sweeps the freshly mounted
  // card (0.7s, signature ease), echoing the tab-change sweep language, then
  // unmounts itself via onAnimationComplete. Absolutely positioned +
  // pointer-transparent (zero layout shift); never rendered under reduced
  // motion.
  const reduce = useReducedMotion()
  const [sweepDone, setSweepDone] = useState(false)

  return (
    <SystemPanel
      label="Athlete Status"
      labelAccent={
        <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[9px] font-bold tabular-nums tracking-wider text-violet-300/90">
          ID {hunter.id.slice(-6).toUpperCase()}
        </span>
      }
    >
      <div className="relative p-5 sm:p-6">
        {/* identity row — R42: 2x vertical breathing; the medallion keeps ONE
            living ring (organic-ring) — the hard Tailwind border is gone. */}
        <div className="flex items-start gap-5 py-2.5 sm:gap-6">
          <div className="flex shrink-0 flex-col items-center gap-2.5">
            {/* R14 — the hero emblem lands physically: SPRING_BOUNCE scale-in
                from 0.6 / opacity 0, 0.15s after the card touches down. */}
            {/* R41 — the rank seal: the insignia sits inside a soft glass
                medallion with a living organic-ring border, breathing very
                slowly. R42: single glowing ring only — no double border. */}
            {reduce ? (
              <div className="organic-ring grove-breathe-slow grid h-[132px] w-[132px] place-items-center rounded-full bg-violet-500/[0.04]">
                <RankBadge rank={hunter.rank} size="lg" className={MEDALLION_STUDIO_TEXT[hunter.rank]} />
              </div>
            ) : (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...SPRING_BOUNCE, delay: 0.15 }}
              >
                <div className="organic-ring grove-breathe-slow grid h-[132px] w-[132px] place-items-center rounded-full bg-violet-500/[0.04]">
                  <RankBadge rank={hunter.rank} size="lg" className={MEDALLION_STUDIO_TEXT[hunter.rank]} />
                </div>
              </motion.div>
            )}
            {/* R42 contrast fix (VLM audit): the rank word under the medallion
                was zinc-400 on the darkest pocket of the card — zinc-300 + the
                living rank hue keeps it legible at 390px. */}
            <span className="sys-label text-zinc-300">{hunter.rank}-RANK</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {/* R14 — the operator name decrypts into existence (the signature
                  reveal, ~0.7s — not animated anywhere else on this card). */}
              {/* R43 studio — the name sets in the display grotesque
                  (Space Grotesk via the font-display utility), natural case,
                  normal tracking: a person, not a terminal. */}
              <DecodeText
                as="h1"
                text={hunter.name}
                delay={0.1}
                className="font-display min-w-0 truncate text-2xl font-medium tracking-normal text-violet-50 sm:text-3xl"
              />
              {title && (
                <span className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-fuchsia-300">
                  {title.title}
                </span>
              )}
            </div>
            <p className="mt-2 text-[11px] font-medium tracking-wider text-zinc-400">
              {arch ? `${arch.name} · ${arch.title}` : hunter.archetype}
            </p>
          </div>
        </div>

        {/* HERO SPINE — R10-c spatial continuity. One violet hairline rail runs
            the data column's left margin — LEVEL hero → rank ladder → power
            cluster — and every horizontal rule (XP meter, ladder edge, zone tie)
            anchors INTO it while the text column hangs off it by a 10px gutter:
            the eye travels down one stitched structure, not floating islands. */}
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-3 left-0 top-0 w-px bg-gradient-to-b from-violet-400/30 via-violet-400/25 to-transparent"
          />

          {/* LEVEL hero — the typographic explosion. R42: the numeral goes
              truly oversized (Mirage-style) — inline clamp beats the
              sys-display-xl scale; everything else orbits its baseline. */}
          <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2 pl-2.5">
            <div className="flex min-w-0 items-end gap-2.5">
              <span
                className="sys-display sys-display-xl text-violet-100"
                style={{ fontSize: "clamp(6rem, 31vw, 10rem)" }}
              >
                {Math.round(level)}
              </span>
              <span className="flex flex-col gap-1 pb-2">
                <span className="text-[9px] font-bold tracking-[0.16em] text-zinc-400">Level</span>
                {hunter.ascension > 0 && (
                  <span
                    className="flex items-center gap-1 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-[9px] font-bold tabular-nums tracking-wider text-fuchsia-300"
                    title={`New Cycle ${hunter.ascension} — all XP gains ×${hunter.xpMultiplier.toFixed(2).replace(/0$/, "")}`}
                  >
                    ◈{hunter.ascension} · ×{hunter.xpMultiplier.toFixed(2).replace(/0$/, "")}
                  </span>
                )}
              </span>
            </div>
            <p className="ml-auto min-w-0 text-right">
              <span className="sys-display sys-display-md text-violet-200">
                {Math.round(xp).toLocaleString()}
              </span>
              <span className="ml-1.5 flex items-center justify-end gap-1 text-[10px] font-semibold tabular-nums tracking-wider text-zinc-400">
                / {Math.round(xpNeeded).toLocaleString()} XP
                {/* R52 declutter — the reading's meaning lives behind the glyph */}
                <InfoHint term="xp" />
              </span>
            </p>
          </div>
          {/* meter tie — the track roots on the spine; its fill flows out of the rail */}
          <XPBar value={hunter.xp} max={hunter.xpNeeded} className="mt-4" />

          {/* rank ladder — R42 studio: the ladder rounds fully into glass
              pills (1.5x spacing). R43: the pills sit on one clean aligned
              rail — the current rank lifts a single pixel behind its glow
              (no organic arc); passed ranks sit quiet, dormant ranks dim. */}
          <div className="mt-7 border-t border-violet-500/10 pl-2.5 pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[8px] font-bold tracking-[0.14em] text-zinc-400">
                Rank ladder
                <InfoHint term="rank" />
              </span>
              {hunter.nextRank ? (
                <span className="text-[9px] font-semibold tabular-nums tracking-wider text-zinc-400">
                  Next:{" "}
                  <span className={cn("font-bold", RANKS[rankIdx + 1]?.color)}>
                    {hunter.nextRank}-RANK
                  </span>{" "}
                  at LV.{hunter.nextRankAt} · {Math.max(0, (hunter.nextRankAt ?? 0) - hunter.level)} to go
                </span>
              ) : (
                <span className="text-[9px] font-bold tracking-wider text-fuchsia-300">
                  Apex reached
                </span>
              )}
            </div>
            <div
              className="mt-4 flex items-center justify-between gap-1.5 sm:gap-2"
              role="group"
              aria-label={`Rank ladder F to S, current rank ${hunter.rank}`}
            >
              {RANKS.map((r) => {
                const idx = RANKS.indexOf(r)
                const isCurrent = idx === rankIdx
                const passed = idx < rankIdx
                return (
                  <span
                    key={r.rank}
                    style={
                      isCurrent
                        ? { transform: "translateY(-1px) scale(1.05)" }
                        : undefined
                    }
                    className={cn(
                      "glass-pill grid h-9 min-w-[2.35rem] place-items-center px-2 font-display text-[13px] font-semibold",
                      isCurrent && "sys-bloom",
                      isCurrent
                        ? RANK_PILL_TEXT[r.rank] ?? "text-zinc-100"
                        : passed
                          ? "text-zinc-300"
                          : "text-zinc-500 sys-dim"
                    )}
                  >
                    {r.rank}
                  </span>
                )
              })}
            </div>
          </div>

          {/* R52 declutter — the metric cluster compresses to ONE slim row of
              four compact chips (micro-cap label + mono numeral, glass pill
              chrome). Power/streak/credits each carry an InfoHint; the former
              essence footer merged into the CREDITS chip (best-streak rides a
              title attribute on the STREAK chip — merged & hidden, not removed). */}
          <div
            className="mt-7 h-px bg-gradient-to-r from-violet-400/25 via-violet-400/15 to-transparent"
            aria-hidden
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 pl-2.5">
            <MetricChip label="Power" value={Math.round(power).toLocaleString()} term="power" />
            <MetricChip
              label="Streak"
              value={`${Math.round(streak)}d`}
              term="streak"
              title={`Best streak ${hunter.bestStreak} days`}
            />
            <MetricChip label="Sessions" value={String(Math.round(totalSessions))} />
            <MetricChip label="Credits" value={hunter.essence.toLocaleString()} term="credits" />
          </div>
        </div>

        {/* R14 entrance sweep — the sweep itself. The band is w-1/4 of the
            card, so x: -100% → 400% (band-width units) carries it fully
            across; its gradient edges are transparent, so peak opacity is
            the via-stop's ~0.16 (R45: the ivory light pass rejoins the R44
            violet identity — it echoes the shell's tab-change sweeps). */}
        {!reduce && !sweepDone && (
          <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-[rgba(167,139,250,0.16)] to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "400%" }}
              transition={{ duration: 0.7, ease: FLOW_EASE }}
              onAnimationComplete={() => setSweepDone(true)}
            />
          </motion.div>
        )}
      </div>
    </SystemPanel>
  )
}

/** R52 declutter — one compact metric chip: micro-cap label + mono numeral in
 *  the quiet glass-pill chrome, with an optional InfoHint for the term's
 *  meaning and an optional title for folded-away detail. */
function MetricChip({
  label,
  value,
  term,
  title,
}: {
  label: string
  value: string
  term?: GlossaryKey
  title?: string
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5"
    >
      <span className="text-[8px] font-bold tracking-[0.14em] text-zinc-400">{label.toUpperCase()}</span>
      <span className="text-xs font-bold tabular-nums leading-none text-zinc-100">{value}</span>
      {term && <InfoHint term={term} />}
    </span>
  )
}
