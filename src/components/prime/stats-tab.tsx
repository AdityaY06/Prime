"use client"

/**
 * R57 · CLEAN SLATE — STATS, the progress facade.
 *
 * The Duolingo stats register: four honest lifetime numbers straight off the
 * hunter DTO (zero fetching), the preserved 26-week streak calendar (the
 * legacy XpHeatmap, reused as-is — it fetches its own /api/heatmap), a short
 * personal-records shelf, a quiet level strip, and the full 56-round Records
 * console one tap away behind ShowEverything (merge & hide — never delete).
 *
 * Data: hunter props + GET /api/prs (read-only). No POSTs ever leave this tab.
 *
 * R58 · FLOW — motion pass, zero new visible characters: the lifetime
 * numerals count up on mount (kit StatTile countTo). The records list stays
 * static by design — nothing on this read-only surface mutates in-visit.
 */

import dynamic from "next/dynamic"
import { Flame, Trophy, Zap } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { XpHeatmap } from "@/components/fitness/xp-heatmap"
import type { HunterDTO, PersonalBestDTO } from "@/lib/types"
import {
  Card,
  Chip,
  EmptyNote,
  Flourish,
  Reveal,
  SectionLabel,
  ShowEverything,
  Skeleton,
  StatTile,
  fmt,
} from "./kit"

const RecordsTab = dynamic(
  () => import("@/components/fitness/records-tab").then((m) => m.RecordsTab),
  { ssr: false },
)

/** How many records earn a row on the clean surface (rest stay in the console). */
const PR_PREVIEW = 5

type PrsResponse = { records: PersonalBestDTO[] }

/** "Jan 5" — short human date for a record's hover context. */
function shortDay(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/** The record's how-it-was-set context, folded onto the row's title. */
function prContext(c: PersonalBestDTO["context"]): string | null {
  if (!c) return null
  const bits: string[] = []
  if (c.sets > 0 && c.reps > 0) bits.push(`${c.sets}×${c.reps} reps`)
  if (c.weightKg > 0) bits.push(`${c.weightKg} kg`)
  if (c.durationMin > 0) bits.push(`${c.durationMin} min`)
  return bits.length > 0 ? bits.join(" · ") : null
}

function prTitle(r: PersonalBestDTO): string {
  const ctx = prContext(r.context)
  return `Personal record — set ${shortDay(r.achievedAt)}${ctx ? ` · ${ctx}` : ""}`
}

export function StatsTab({ hunter }: { hunter: HunterDTO }) {
  const prs = useApi<PrsResponse>("/api/prs")
  const records = prs.data?.records ?? []
  const preview = records.slice(0, PR_PREVIEW)
  const more = records.length - preview.length
  // float-safe label ("×1.15", never "×1.4499999999…") — hunter-card idiom
  const mult = hunter.xpMultiplier > 1 ? hunter.xpMultiplier.toFixed(2).replace(/0$/, "") : null

  return (
    <div className="prime-rise space-y-4">
      {/* R60 — hero: the fifth facade gets the same h1 + Flourish idiom as
          Home/Train/Log, so all five open with an editorial anchor */}
      <section aria-label="Progress overview">
        <h1 className="text-2xl font-black tracking-tight text-[#46a302] md:text-3xl">Progress</h1>
        <Flourish />
        <p className="mt-2 text-sm font-semibold text-[#777]">
          The shape of your work — numbers, streaks, records.
        </p>
      </section>

      {/* lifetime big numbers — straight off the hunter, no fetching */}
      <section aria-label="All-time numbers">
        <SectionLabel>All-time</SectionLabel>
        <Card className="grid grid-cols-4 gap-2 p-4 transition-transform hover:-translate-y-0.5">
          <StatTile
            value={fmt(hunter.totalSessions)}
            countTo={hunter.totalSessions}
            label="Total workouts"
            tone="teal"
            title="Lifetime cleared sessions"
          />
          <StatTile
            value={fmt(hunter.totalVolumeKg)}
            countTo={hunter.totalVolumeKg}
            label="Volume kg"
            tone="ink"
            title="Lifetime weight moved, in kilograms"
          />
          <StatTile
            value={fmt(hunter.totalMinutes)}
            countTo={hunter.totalMinutes}
            label="Minutes"
            tone="orange"
            title="Lifetime training time"
          />
          {/* countTo replaces the value node, so this tile keeps its Flame
              glyph and stays static — visible copy is frozen (R58 rule). */}
          <StatTile
            value={
              <span className="inline-flex items-center gap-1">
                <Flame className="h-4 w-4" aria-hidden />
                {fmt(hunter.bestStreak)}
              </span>
            }
            label="Best streak"
            tone="gold"
            title="Longest run of training days"
          />
        </Card>
      </section>

      {/* consistency — the preserved 26-week daily-XP streak calendar */}
      <Reveal>
        <section aria-label="Consistency calendar">
          <SectionLabel>Last 26 weeks</SectionLabel>
          <Card className="p-1.5">
            {/* Adapter wrapper (this file only — the heatmap itself is untouchable):
                .legacy-surface re-inks its dark-era panel/text utilities so the
                legacy component sits legibly on the white kit. */}
            <div className="legacy-surface">
              <XpHeatmap />
            </div>
          </Card>
        </section>
      </Reveal>

      {/* personal records — the top shelf, newest first */}
      <Reveal>
        <section aria-label="Personal records">
          <SectionLabel right={more > 0 ? <Chip tone="gold">+{more} more</Chip> : undefined}>
            Personal records
          </SectionLabel>
        <Card className="p-1.5">
          {prs.loading ? (
            <div className="space-y-2.5 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-3/4" />
            </div>
          ) : prs.error ? (
            <div className="p-3" title={prs.error ?? undefined}>
              <EmptyNote>Couldn&apos;t load records right now.</EmptyNote>
            </div>
          ) : preview.length === 0 ? (
            <div className="p-3">
              <EmptyNote>No personal records yet — they come from real sessions.</EmptyNote>
            </div>
          ) : (
            <ul>
              {preview.map((r) => (
                <li
                  key={r.id}
                  title={prTitle(r)}
                  className="flex min-h-14 items-center gap-3 rounded-xl p-3"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff4cc]"
                    aria-hidden
                  >
                    <Trophy className="h-5 w-5 text-[#c98f00]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-[#3c3c3c]">
                    {r.displayName}
                  </span>
                  <span className="shrink-0 text-sm font-extrabold tabular-nums text-[#c98f00]">
                    {fmt(r.bestValue)} {r.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </section>
      </Reveal>

      {/* level strip — the quiet economy summary */}
      <Reveal>
        <Card
          className="flex items-center justify-between gap-3 p-4 transition-transform hover:-translate-y-0.5"
          aria-label="Level summary"
        >
          <p className="text-sm font-extrabold text-[#3c3c3c]">LV {hunter.level}</p>
          <p className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums text-[#777]">
            <Zap className="h-4 w-4 text-[#58cc02]" aria-hidden />
            {fmt(hunter.totalXp)} XP
          </p>
          {mult && <Chip tone="green">×{mult} XP boost</Chip>}
        </Card>
      </Reveal>

      {/* the full 56-round Records console, one tap away */}
      <Reveal>
        <ShowEverything label="Show full progress charts">
          <RecordsTab hunter={hunter} />
        </ShowEverything>
      </Reveal>
    </div>
  )
}
