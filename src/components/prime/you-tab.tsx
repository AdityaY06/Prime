"use client"

/**
 * R57 · CLEAN SLATE — YOU, the profile facade (task R57-c4).
 *
 * The Duolingo profile register: a warm hero (big green initial avatar, the
 * name, the featured title as a chip, one LV · rank line), a three-number
 * wallet, honest standings from the real /api/leaderboard, and one teaser
 * row that swings open the full legacy rewards hub. Plain human words on
 * this surface — titles, rewards, standings (the lore voice stays in the
 * legacy hub it mounts).
 *
 * ABSOLUTE honesty rule: standings are ONLY /api/leaderboard data — the true
 * rank (`you.rank`), the true population, an honest "—" when an arena is
 * undeclared or unranked, and the R56 opt-out rendered as a quiet pointer to
 * the legacy eye toggle. A rank is never invented. This surface is strictly
 * read-only: no POST/PATCH, no toggles — the eye toggle and every claim keep
 * living in the preserved legacy views.
 *
 * R58 · FLOW — motion pass, zero new visible characters: the stat-points
 * numeral counts up and the hand-rolled teaser row gains the kit's press
 * scale. Essence (Gem glyph) and the ×-multiplier keep their crafted values —
 * countTo replaces the value node, and visible copy is frozen.
 */

import { useState } from "react"
import dynamic from "next/dynamic"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronDown, Crown, EyeOff, Gem, Trophy } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { titleByCode } from "@/lib/titles"
import { cn } from "@/lib/utils"
import type { HunterDTO } from "@/lib/types"
import { Card, Chip, Flourish, Reveal, SectionLabel, Skeleton, StatTile, TapRow, fmt } from "./kit"

const RewardsHubTab = dynamic(
  () => import("@/components/fitness/rewards-hub-tab").then((m) => m.RewardsHubTab),
  { ssr: false },
)

/** One arena's honest feed (GET /api/leaderboard?scope=…). `you.rank` is the
 *  true 1-based position in the ranked pool; optedOut / needsRegion /
 *  needsCountry are the R52-2/R56 honesty flags. */
type StandingsRes = {
  scope: "state" | "country" | "world"
  population: number
  you: { rank: number } | null
  optedOut?: boolean
  needsRegion?: boolean
  needsCountry?: boolean
}

/** Just the count the teaser needs (GET /api/achievements). */
type TitlesRes = {
  titles: { unlocked: boolean }[]
}

/** ×1 renders "×1.0", ×1.2 renders "×1.2" (the legacy numeral convention). */
function multLabel(m: number): string {
  return `×${m.toFixed(2).replace(/0$/, "")}`
}

export function YouTab({ hunter }: { hunter: HunterDTO }) {
  const setTab = useSystem((s) => s.setTab)
  const reduce = useReducedMotion()
  const [hubOpen, setHubOpen] = useState(false)

  // the three real arenas + the titles count — read-only GETs
  const world = useApi<StandingsRes>("/api/leaderboard?scope=world")
  const country = useApi<StandingsRes>("/api/leaderboard?scope=country")
  const state = useApi<StandingsRes>("/api/leaderboard?scope=state")
  const achievements = useApi<TitlesRes>("/api/achievements")

  // R56 — the privacy flag; every scope's response agrees on it
  const optedOut =
    world.data?.optedOut === true ||
    country.data?.optedOut === true ||
    state.data?.optedOut === true

  // profile hero bits
  const initial = hunter.name.trim().charAt(0).toUpperCase()
  const titleDef = hunter.equippedTitle ? titleByCode(hunter.equippedTitle) : undefined
  const joinedDate = hunter.createdAt ? new Date(hunter.createdAt) : null
  const joined =
    joinedDate && !Number.isNaN(joinedDate.getTime())
      ? joinedDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : null
  const quietLine = [
    joined ? `Joined ${joined}` : null,
    `${fmt(hunter.totalSessions)} workout${hunter.totalSessions === 1 ? "" : "s"}`,
    `best streak ${hunter.bestStreak}`,
  ]
    .filter(Boolean)
    .join(" · ")

  // teaser count — "…" while loading, "—" if unavailable, never invented
  const unlocked = achievements.data?.titles.filter((t) => t.unlocked).length ?? null
  const totalTitles = achievements.data?.titles.length ?? null

  const arenas = [
    { label: "World", sub: null as string | null, res: world },
    { label: "Country", sub: hunter.country ?? null, res: country },
    { label: "State", sub: hunter.region ?? null, res: state },
  ]

  return (
    <div className="prime-rise space-y-4">
      {/* the hero — this is the "You" page */}
      <section aria-label="Profile">
        <Card className="flex items-center gap-4 p-4 transition-transform hover:-translate-y-0.5 md:gap-5 md:p-5">
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[#58cc02] shadow-[0_4px_0_0_#46a302] md:h-20 md:w-20"
            aria-hidden
          >
            <span className="text-2xl font-black leading-none text-white md:text-3xl">
              {initial}
            </span>
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight text-[#46a302] md:text-3xl">
              {hunter.name}
            </h1>
            {/* R60 — the profile hero joins the Flourish idiom (R59 motion
                debt: You/Stats facades had none) */}
            <Flourish className="mt-1.5" />
            {titleDef ? (
              <Chip
                tone="gold"
                className="mt-1.5"
                title="Your featured title — change it in rewards below"
              >
                <Crown className="h-3 w-3" aria-hidden />
                {titleDef.title}
              </Chip>
            ) : (
              <Chip
                tone="ink"
                className="mt-1.5"
                title="Earn titles from milestones — see rewards below"
              >
                No title yet
              </Chip>
            )}
            <p className="mt-2 text-sm font-bold text-[#777]">
              LV {hunter.level} · {hunter.rank}-RANK
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-[#777]">{quietLine}</p>
          </div>
        </Card>
      </section>

      {/* wallet — the three numbers that spend or boost */}
      <section aria-label="Wallet">
        <SectionLabel>Wallet</SectionLabel>
        <Card className="grid grid-cols-3 gap-2 p-4 transition-transform hover:-translate-y-0.5">
          <StatTile
            value={
              <span className="inline-flex items-center gap-1.5">
                <Gem className="h-5 w-5 shrink-0 text-[#0d9488]" aria-hidden />
                {fmt(hunter.essence)}
              </span>
            }
            label="Essence"
            tone="teal"
            title="Earned from workouts, records and goals — spend it in rewards below"
          />
          <StatTile
            value={fmt(hunter.statPoints)}
            countTo={hunter.statPoints}
            label="Stat points"
            tone="ink"
            title={
              hunter.statPoints > 0
                ? "Unspent points — allocate them in the full status console"
                : "Earn points by leveling up"
            }
          />
          <StatTile
            value={multLabel(hunter.xpMultiplier)}
            label="XP multiplier"
            tone={hunter.xpMultiplier > 1 ? "gold" : "ink"}
            title="Boost applied to all XP you earn"
          />
        </Card>
        {hunter.statPoints > 0 && (
          <p className="mt-2 px-1 text-xs font-semibold text-[#777]">
            Spend them in the full status console.
          </p>
        )}
      </section>

      {/* standings — real positions only, never a fabricated rank */}
      <Reveal>
        <section aria-label="Standings">
        <SectionLabel>Standings</SectionLabel>
        <Card>
          {optedOut ? (
            <div className="p-1.5">
              <TapRow
                icon={<EyeOff className="h-5 w-5 text-[#777]" aria-hidden />}
                title="You're hidden from standings"
                sub="The eye toggle lives in the full progress console"
                onClick={() => setTab("stats")}
              />
            </div>
          ) : (
            <ul className="divide-y divide-[#f2f2ee]" aria-label="Your standing in each arena">
              {arenas.map((a) => {
                const d = a.res.data
                const pending = a.res.loading && !d
                const you = d?.you ?? null
                const why =
                  a.res.error != null
                    ? `Standings unavailable — ${a.res.error}`
                    : d?.needsRegion === true
                      ? "No state declared — declare one in the full progress console"
                      : d?.needsCountry === true
                        ? "No country declared — declare one in the full progress console"
                        : you == null
                          ? "Not ranked in this arena"
                          : ""
                return (
                  <li
                    key={a.label}
                    className="flex min-h-14 items-center justify-between gap-3 p-3"
                    title={why || "Ranked by lifetime XP"}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-[#3c3c3c]">
                        {a.label}
                      </span>
                      {a.sub && (
                        <span className="mt-0.5 block truncate text-xs font-semibold text-[#777]">
                          {a.sub}
                        </span>
                      )}
                    </span>
                    {pending ? (
                      <Skeleton className="h-4 w-28" />
                    ) : you != null && d != null ? (
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-extrabold tabular-nums text-[#3c3c3c]">
                          #{you.rank} of {d.population} {d.population === 1 ? "hunter" : "hunters"}
                        </span>
                        {/* R68 — XP values #afafaf → #6f6f6f: they are the
                            arena's actual data point, not decoration */}
                        <span className="mt-0.5 block text-xs font-semibold tabular-nums text-[#6f6f6f]">
                          {fmt(hunter.totalXp)} XP
                        </span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-extrabold text-[#777]">—</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <p className="mt-2 px-1 text-xs font-semibold text-[#777]">
          Standings count hunters registered on this device.
        </p>
        </section>
      </Reveal>

      {/* the teaser row IS the expander — one tap swings open the full
          legacy rewards hub (forge + titles + the eye toggle, all preserved) */}
      <Reveal>
        <section aria-label="Titles and rewards">
        <button
          type="button"
          onClick={() => setHubOpen((v) => !v)}
          aria-expanded={hubOpen}
          className={cn(
            "flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-[#e5e5e5] bg-white p-3 text-left",
            "transition-[background-color,transform] duration-150 hover:bg-[#f7f7f4] active:scale-[0.99]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
          )}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff4cc]">
            <Trophy className="h-5 w-5 text-[#c98f00]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-[#3c3c3c]">
              Titles &amp; rewards
            </span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-[#777]">
              {hubOpen ? "Hide" : "Show"} full rewards hub
            </span>
          </span>
          <Chip tone="gold" className="shrink-0" title="Titles you've earned">
            {achievements.loading
              ? "…"
              : unlocked != null && totalTitles != null
                ? `${unlocked} of ${totalTitles}`
                : "—"}
          </Chip>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-[#8a8a8a] transition-transform duration-200",
              hubOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <AnimatePresence initial={false}>
          {hubOpen && (
            <motion.div
              key="legacy-rewards"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
              }
              className="overflow-hidden"
            >
              <div className="legacy-surface mt-3 p-3 md:p-4">
                <RewardsHubTab hunter={hunter} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </section>
      </Reveal>
    </div>
  )
}
