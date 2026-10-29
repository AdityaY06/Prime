"use client"

// ─── PRIME · LeaderboardPanel (R52-2 — standings arenas) ────────────────────
// The state / country / worldwide boards, HONEST BY CONSTRUCTION: /api/leader
// board ranks only the hunter rows that exist in this device's SQLite DB, so
// this panel never implies a global crowd. Three tiers behind a segmented
// control; an undeclared tier offers the one-line arena setter (no phantom
// rankings); a tier you alone hold says so; the footer whisper states the
// locality outright. Studio skin: SystemPanel chrome, micro-cap label +
// InfoHint, mono tabular numerals, violet active pill, amber/zinc top-3 ink.
//
// R56 — the eye toggle in the header: leaderboardOptOut, one icon, zero
// visible characters (context rides aria-label + title — the density
// discipline holds). Eye = listed; EyeOff = hidden from every board. The
// flag is the hunter's own privacy switch, PATCHed to /api/hunter and
// reflected back by every leaderboard response as `optedOut`.

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { InfoHint } from "@/components/system/info-hint"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { cn } from "@/lib/utils"

type LeaderboardRow = {
  rank: number
  name: string
  level: number
  totalXp: number
  power: number
  region: string | null
  country: string | null
  isYou: boolean
}

type LeaderboardRes = {
  scope: "state" | "country" | "world"
  population: number
  rows: LeaderboardRow[]
  you: { rank: number } | null
  optedOut?: boolean
  needsRegion?: boolean
  needsCountry?: boolean
}

const TIERS = [
  { id: "state", label: "STATE" },
  { id: "country", label: "COUNTRY" },
  { id: "world", label: "WORLD" },
] as const
type Tier = (typeof TIERS)[number]["id"]

/** Top-3 ink — gold / silver / bronze, deliberately quiet. */
function rankInk(rank: number): string {
  if (rank === 1) return "text-amber-300"
  if (rank === 2) return "text-zinc-300"
  if (rank === 3) return "text-amber-400/70"
  return "text-zinc-500"
}

/** STANDINGS — the three-tier board, ranked by lifetime XP. */
export function LeaderboardPanel() {
  const [tier, setTier] = useState<Tier>("world")
  const { data, loading, error, reload } = useApi<LeaderboardRes>(
    `/api/leaderboard?scope=${tier}`,
  )
  const { pushNotice, bumpRefresh } = useSystem()
  const [arena, setArena] = useState("")
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)

  const needsArena = data?.needsRegion === true || data?.needsCountry === true
  const arenaKind: "region" | "country" = data?.needsRegion === true ? "region" : "country"
  const you = data?.rows.find((r) => r.isYou) ?? null
  // R56 — the cookie hunter's own standings-visibility flag
  const optedOut = data?.optedOut === true
  // sole-holder line — state/country tiers only (a world of one is just the
  // device's whole roster; that story is the footer whisper's job)
  const soleHunter =
    data !== null && !needsArena && (tier === "state" || tier === "country") && data.population === 1 && you !== null
  const soleArena = tier === "state" ? (you?.region ?? null) : (you?.country ?? null)

  const declareArena = async () => {
    const value = arena.trim()
    if (value.length < 2 || value.length > 48) {
      pushNotice({
        kind: "warn",
        title: "Arena not declared",
        body: "Enter 2–48 characters — a real state or country name.",
      })
      return
    }
    setSaving(true)
    try {
      await api("/api/hunter", {
        method: "PATCH",
        body: JSON.stringify({ [arenaKind]: value }),
      })
      pushNotice({
        kind: "info",
        title: arenaKind === "region" ? "State declared" : "Country declared",
        body: `You now stand in ${value}.`,
      })
      setArena("")
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Action failed", body: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // R56 — flip standings visibility. Eye → listed on every board; EyeOff →
  // hidden from every board (you still see them — appearance, not access).
  const toggleListed = async () => {
    if (toggling) return
    setToggling(true)
    try {
      await api("/api/hunter", {
        method: "PATCH",
        body: JSON.stringify({ leaderboardOptOut: !optedOut }),
      })
      pushNotice({
        kind: "info",
        title: optedOut ? "Listed on boards" : "Hidden from boards",
        body: optedOut
          ? "Your row stands on every standings board again."
          : "You are hidden from every standings board. The boards stay visible to you.",
      })
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Action failed", body: (e as Error).message })
    } finally {
      setToggling(false)
    }
  }

  if (loading && !data) {
    return <SkeletonPanel label="SYNCING STANDINGS" rows={3} />
  }
  if (error || !data) {
    return (
      <SystemPanel>
        <div className="p-5 text-center">
          <p className="font-mono text-xs tracking-widest text-rose-400/80">THE BOARDS ARE SEALED</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-zinc-400">
            {(error ?? "NO DATA").toUpperCase()}
          </p>
        </div>
      </SystemPanel>
    )
  }

  return (
    <SystemPanel>
      {/* header — SystemPanel's own idiom with the InfoHint seated beside the
          label (the shared component takes a plain-string label only) */}
      <div className="flex items-center gap-2 border-b border-violet-500/10 px-4 py-2.5">
        <span className="block h-2.5 w-2.5 rounded-[4px] bg-zinc-100/90" aria-hidden />
        <span className="sys-label text-violet-300/80">Standings</span>
        <InfoHint term="standings" />
        <span className="ml-auto font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          {data.population} {data.population === 1 ? "HUNTER" : "HUNTERS"}
        </span>
        {/* R56 — standings visibility: one icon, zero visible characters.
            Eye = your row appears on the boards; EyeOff = hidden. Full
            context rides the aria-label + title (density discipline). */}
        <button
          type="button"
          onClick={() => void toggleListed()}
          disabled={toggling}
          aria-pressed={!optedOut}
          aria-label={
            optedOut
              ? "Hidden from standings boards — select to appear on them"
              : "Listed on standings boards — select to hide from them"
          }
          title={
            optedOut
              ? "Hidden — your row is off every standings board (boards stay visible to you). Click to be listed."
              : "Listed — your row stands on every standings board. Click to hide."
          }
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-sm border transition-all focus-visible:outline focus-visible:outline-violet-400/70 active:scale-[0.96] disabled:opacity-50",
            optedOut
              ? "border-zinc-800 bg-black/30 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
              : "border-violet-400/40 bg-violet-500/10 text-violet-200/90 hover:border-violet-400/60 hover:bg-violet-500/20 hover:shadow-[0_0_14px_rgba(139,92,246,0.25)]",
          )}
        >
          {optedOut ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
        {/* the concept behind the eye — sibling InfoHint (never nested in the
            button); short action hint rides the button's own title */}
        <InfoHint term="listed" />
      </div>

      <div className="p-4 pt-4 sm:p-5">
        {/* tier selector — three pills, one active */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Standings tier">
          {TIERS.map((t) => {
            const selected = tier === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTier(t.id)}
                aria-pressed={selected}
                aria-label={`${t.label.toLowerCase()} standings tier`}
                className={cn(
                  "flex h-11 min-w-0 flex-1 items-center justify-center rounded-full border px-3 font-mono text-[10px] font-bold tracking-widest transition-all focus-visible:outline focus-visible:outline-violet-400/70",
                  selected
                    ? "border-violet-400/60 bg-violet-500/20 text-violet-200 shadow-[0_0_18px_rgba(139,92,246,0.35)]"
                    : "border-zinc-800 bg-black/30 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300",
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* undeclared tier — the honest ask, one line + one input */}
        {needsArena && (
          <div className="pt-4">
            <p className="font-mono text-xs tracking-widest text-zinc-300">
              Stand in your {arenaKind === "region" ? "state" : "country"} arena — set your{" "}
              {arenaKind}:
            </p>
            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void declareArena()
              }}
            >
              <input
                value={arena}
                onChange={(e) => setArena(e.target.value)}
                maxLength={48}
                placeholder={arenaKind === "region" ? "STATE / REGION" : "COUNTRY"}
                aria-label={`Your ${arenaKind}`}
                className="h-11 min-w-0 flex-1 rounded-full border border-zinc-700/60 bg-black/30 px-4 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-violet-400/60 focus:outline-none focus:ring-1 focus:ring-violet-400/40"
              />
              <button
                type="submit"
                disabled={saving}
                className="h-11 shrink-0 rounded-full border border-violet-400/50 bg-violet-500/15 px-4 font-mono text-[10px] font-bold tracking-[0.2em] text-violet-200 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.4)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70 disabled:opacity-50"
              >
                {saving ? "…" : "SAVE"}
              </button>
            </form>
          </div>
        )}

        {/* the board — honest rows, YOUR row ringed */}
        {!needsArena && (
          <ul
            className="scroll-sys mt-4 max-h-96 overflow-y-auto"
            aria-label={`${tier} standings, ranked by lifetime XP`}
          >
            {data.rows.map((r) => (
              <li
                key={`${r.rank}-${r.name}`}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  r.isYou
                    ? "my-1 border border-violet-400/40 bg-violet-500/10 shadow-[0_0_18px_rgba(139,92,246,0.15)]"
                    : "hover:bg-violet-500/5",
                )}
              >
                <span
                  className={cn(
                    "w-7 shrink-0 text-right font-mono text-xs font-bold tabular-nums",
                    rankInk(r.rank),
                  )}
                >
                  {r.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-display text-[13px] font-medium text-zinc-100">
                  {r.name}
                  {r.isYou && (
                    <span className="ml-1.5 inline-flex items-center rounded-full border border-violet-400/50 bg-violet-500/20 px-1.5 py-0.5 align-middle font-mono text-[8px] font-bold tracking-[0.14em] text-violet-200">
                      YOU
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
                  LV.{r.level} · {r.totalXp.toLocaleString()} XP
                </span>
              </li>
            ))}

            {/* sole holder — the arena exists, you are its only hunter */}
            {soleHunter && (
              <li className="px-3 pb-1 pt-2 font-mono text-[10px] tracking-widest text-zinc-500">
                First hunter in {soleArena ?? "this arena"} — the arena is yours.
              </li>
            )}
          </ul>
        )}
      </div>

      {/* the honesty label — R55: one sr-only whisper + title (sighted surface
          stays clean; screen readers keep the full sentence) */}
      <p
        className="sr-only border-t border-zinc-800/50 px-4 py-2 text-center font-mono text-[9px] tracking-[0.14em] text-zinc-500"
        title="Local standings — hunters registered on this device."
      >
        Local standings — hunters registered on this device.
      </p>
    </SystemPanel>
  )
}
