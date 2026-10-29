"use client"

import { ArrowRight } from "lucide-react"
import { riftOfTheDay } from "@/lib/rift"
import { useApi } from "@/hooks/use-api"
import { useSystem, type Tab } from "@/store/system-store"
import { cn } from "@/lib/utils"
import type { DestinationsDTO } from "@/lib/types"

type Destination = {
  tab: Tab
  index: string
  name: string
}

/** The seven destinations beyond Status — the command center's depth layer.
 *  Ordered along the primary tab ring (TAB_ORDER minus status), so the index
 *  reads as the journey: set the day's goals, train them, then let the body,
 *  fuel and vitals surfaces tell you what the work did, and Progress/Rewards
 *  bank it. R52 declutter: one quiet editorial row per surface — numeral +
 *  display-scale name + live badge — no descriptor prose on the landing view. */
const DESTINATIONS: Destination[] = [
  { tab: "directives", index: "01", name: "Goals" },
  { tab: "gates", index: "02", name: "Training" },
  { tab: "body", index: "03", name: "Body" },
  { tab: "fuel", index: "04", name: "Fuel" },
  { tab: "vitals", index: "05", name: "Vitals" },
  { tab: "records", index: "06", name: "Progress" },
  { tab: "forge", index: "07", name: "Rewards" },
]

/** R45 · Phase D — LAYER C: THE DESTINATION INDEX.
 *
 *  KOTA-style editorial rows replacing the three scattered CTAs the
 *  command deck absorbs: every destination of the app as one full-row control
 *  — hollow index numeral, display-scale name, and a live badge wherever the
 *  tab already holds the data (Goals progress, the day's rift multiplier, the
 *  credit balance).
 *
 *  R55 — HONEST BADGES FOR EVERY ROW: the rows that used to go badge-less
 *  (Body / Fuel / Vitals / Progress) now self-fetch ONE lean GET
 *  (/api/destinations — hunter-timezone-aware, same readiness pipeline as
 *  /api/readiness) and badge live state: latest mass, today's fuel, today's
 *  readiness composite, PR ledger. STILL no mock data ever — a surface that
 *  has never been fed renders NO badge (null/0 in the DTO = no chip), and
 *  while the feed loads the rows simply stay quiet. */
export function DestinationIndex({
  doneCount,
  totalCount,
  essence,
}: {
  doneCount: number
  totalCount: number
  essence: number
}) {
  const { setTab } = useSystem()
  const rift = riftOfTheDay()
  const { data: feed } = useApi<DestinationsDTO>("/api/destinations")

  const badge = (d: Destination): { text: string; cls: string; title?: string } | null => {
    if (d.tab === "directives") {
      if (totalCount === 0) return null
      const allClear = doneCount >= totalCount
      return allClear
        ? { text: "ALL CLEAR", cls: "border-amber-400/40 bg-amber-500/10 text-amber-300" }
        : { text: `${doneCount}/${totalCount}`, cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" }
    }
    if (d.tab === "gates") {
      return { text: `×${rift.bonusMult} RIFT`, cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" }
    }
    if (d.tab === "forge") {
      return { text: `◈ ${essence.toLocaleString()}`, cls: "border-teal-500/40 bg-teal-500/10 text-teal-300" }
    }

    // ── R55 API-fed rows — every branch honestly null when unfed ──
    if (!feed) return null

    if (d.tab === "body") {
      if (feed.body.latestMassKg !== null) {
        return {
          text: `${feed.body.latestMassKg} KG`,
          cls: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
          title: `Latest weight ${feed.body.latestMassKg} kg${feed.body.latestMassDay ? ` · logged ${feed.body.latestMassDay}` : ""}${feed.body.activeTargets > 0 ? ` · ${feed.body.activeTargets} active target${feed.body.activeTargets === 1 ? "" : "s"}` : ""}`,
        }
      }
      if (feed.body.activeTargets > 0) {
        return {
          text: `${feed.body.activeTargets} TARGET${feed.body.activeTargets === 1 ? "" : "S"}`,
          cls: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
          title: "No weight logged yet — the atlas holds body-metric targets only",
        }
      }
      return null
    }

    if (d.tab === "fuel") {
      if (feed.fuel.loggedToday && feed.fuel.todayKcal !== null) {
        return {
          text: `${feed.fuel.todayKcal.toLocaleString()} KCAL`,
          cls: "border-amber-400/40 bg-amber-500/10 text-amber-300",
          title: `Today: ${feed.fuel.todayKcal.toLocaleString()} kcal${feed.fuel.todayProteinG !== null ? ` · ${feed.fuel.todayProteinG} g protein` : ""}${feed.fuel.waterMl > 0 ? ` · ${(feed.fuel.waterMl / 1000).toFixed(1)} L water` : ""}`,
        }
      }
      if (feed.fuel.waterMl > 0) {
        return {
          text: `${(feed.fuel.waterMl / 1000).toFixed(1)} L`,
          cls: "border-teal-500/40 bg-teal-500/10 text-teal-300",
          title: "No food logged today — water only",
        }
      }
      return null
    }

    if (d.tab === "vitals") {
      if (feed.vitals.readiness) {
        const band = feed.vitals.readiness.band
        const cls =
          band === "PRIMED"
            ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
            : band === "READY"
              ? "border-teal-500/40 bg-teal-500/10 text-teal-300"
              : band === "MODERATE"
                ? "border-orange-400/40 bg-orange-500/10 text-orange-300"
                : "border-rose-400/40 bg-rose-500/10 text-rose-300"
        return {
          text: `${feed.vitals.readiness.score} ${band}`,
          cls,
          title: `Today's readiness composite: ${feed.vitals.readiness.score}/100 (${band.toLowerCase()}) — same pipeline as the Vitals tab`,
        }
      }
      if (feed.vitals.checkedInToday) {
        return {
          text: "CHECKED IN",
          cls: "border-teal-500/40 bg-teal-500/10 text-teal-300",
          title: "Vitals logged today, but no readiness component available yet",
        }
      }
      return null
    }

    if (d.tab === "records") {
      if (feed.records.prCount > 0) {
        return {
          text: `${feed.records.prCount} PR${feed.records.prCount === 1 ? "" : "S"}`,
          cls: "border-amber-400/40 bg-amber-500/10 text-amber-300",
          title: `Personal-best ledger: ${feed.records.prCount} record${feed.records.prCount === 1 ? "" : "s"} · ${feed.records.sessionsThisWeek} raid${feed.records.sessionsThisWeek === 1 ? "" : "s"} cleared this week`,
        }
      }
      if (feed.records.sessionsThisWeek > 0) {
        return {
          text: `${feed.records.sessionsThisWeek} RAID${feed.records.sessionsThisWeek === 1 ? "" : "S"}`,
          cls: "border-violet-500/40 bg-violet-500/10 text-violet-300",
          title: `${feed.records.sessionsThisWeek} session${feed.records.sessionsThisWeek === 1 ? "" : "s"} cleared this week — no personal records yet`,
        }
      }
      return null
    }

    return null
  }

  return (
    <nav aria-label="Destinations — the seven surfaces beyond Status">
      <div className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-950/30">
        {DESTINATIONS.map((d) => {
          const b = badge(d)
          return (
            <button
              key={d.tab}
              type="button"
              onClick={() => setTab(d.tab)}
              className="index-row group flex min-h-16 w-full items-center gap-4 border-t border-zinc-800/60 py-4 pl-3 pr-2 text-left transition-colors first:border-t-0 hover:bg-violet-500/[0.04] focus-visible:outline focus-visible:outline-violet-400/70 sm:gap-5 sm:py-5 sm:pl-4"
            >
              {/* the hollow index numeral — zinc at rest, ignites violet on approach */}
              <span className="sys-display w-7 shrink-0 text-sm tabular-nums text-zinc-600 transition-colors group-hover:text-violet-300">
                {d.index}
              </span>

              {/* name — display-scale, the label IS the destination */}
              <span className="min-w-0 flex-1">
                <span className="font-display block text-base font-medium text-zinc-100 sm:text-lg">
                  {d.name}
                </span>
              </span>

              {/* the live badge — R55: every row, honest null when unfed */}
              {b && (
                <span
                  title={b.title}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-bold tabular-nums tracking-wider",
                    b.cls
                  )}
                >
                  {b.text}
                </span>
              )}

              <ArrowRight
                className="h-4 w-4 shrink-0 text-zinc-600 transition-all duration-300 group-hover:translate-x-1 group-hover:text-violet-300"
                aria-hidden
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
