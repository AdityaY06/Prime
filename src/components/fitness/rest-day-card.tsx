"use client"

import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { BedDouble, Loader2, Moon, ShieldCheck } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { InfoHint } from "@/components/system/info-hint"
import { useApi, api } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { formatDayLabel } from "@/lib/game"
import type { HunterDTO, RestDayDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

/** GET /api/rest-day response — RestDayDTO + additive Streak Shield ward inventory. */
type RestDayRes = RestDayDTO & {
  ward?: { owned: boolean; charges: number } | null
}

const REASON_COPY: Record<Exclude<RestDayDTO["reason"], "OK">, { title: string; body: string }> = {
  ALREADY_CLAIMED_TODAY: {
    title: "Recovery approved",
    body: "The recovery day is locked in. Your streak survives tonight — tomorrow, train.",
  },
  ALREADY_USED_THIS_WEEK: {
    title: "Recovery day used",
    body: "This week's recovery day has been spent. It recharges on Monday.",
  },
  TRAINED_TODAY: {
    title: "No rest needed",
    body: "You already trained today — your streak needs no shield.",
  },
  NO_CHAIN: {
    title: "No streak to shield",
    body: "Complete a session and start a streak first; then recovery days can protect it.",
  },
}

const WEEKDAY_ABBR = ["M", "T", "W", "T", "F", "S", "S"]

/** Monday-first weekday index of a YYYY-MM-DD date string. */
function mondayIndexOf(dayIso: string): number {
  const [y, m, d] = dayIso.split("-").map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

/** SANCTIFIED REST — the weekly streak-shield decree. */
export function RestDayCard({ hunter }: { hunter: HunterDTO }) {
  const { data, loading, error, reload } = useApi<RestDayRes>("/api/rest-day")
  const { pushNotice, speak, bumpRefresh } = useSystem()
  const reduce = useReducedMotion()
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)

  async function claim() {
    if (claiming) return
    setClaiming(true)
    setClaimError(null)
    try {
      await api<RestDayDTO>("/api/rest-day", { method: "POST", body: JSON.stringify({ action: "claim" }) })
      pushNotice({
        kind: "info",
        title: "Recovery approved",
        body: "Rest approved. Your streak endures.",
      })
      speak("Recovery day approved. Your streak endures.")
      bumpRefresh()
      reload()
    } catch (e) {
      const msg = (e as Error).message
      const copy = REASON_COPY[msg as keyof typeof REASON_COPY]
      setClaimError(copy ? copy.title : msg)
      pushNotice({ kind: "warn", title: "Recovery day refused", body: copy ? copy.body : msg })
    } finally {
      setClaiming(false)
    }
  }

  return (
    <>
      {loading && !data ? (
        <SkeletonPanel label="Checking your recovery day" rows={1}>
          <div className="skel-bar h-10 w-full" style={{ animationDelay: "0.15s" }} />
        </SkeletonPanel>
      ) : error ? (
        <SystemPanel label="Recovery Day">
          <div className="p-5 text-center">
            <p className="text-xs font-semibold tracking-wide text-rose-400/80">Recovery day unavailable</p>
            <p className="mt-1 text-[10px] font-medium tracking-wider text-zinc-400">{error}</p>
          </div>
        </SystemPanel>
      ) : data ? (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <SystemPanel
            label="Recovery Day"
            labelAccent={
              <span
                className={cn(
                  "flex items-center gap-1.5 text-[10px] font-semibold tabular-nums tracking-wider",
                  data.claimedToday || data.available ? "text-amber-300/90" : "text-zinc-400"
                )}
                title="One recovery day per week — claim it to shield your streak from tonight's missed session"
              >
                {data.claimedToday ? "Shield engaged" : data.available ? "1 of 1 available" : "0 of 1 available"}
                <InfoHint term="recovery" />
              </span>
            }
          >
            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-3.5">
                {/* glyph — the decree's night aura: dashed orbit + star motes.
                    R43 studio: the moon sits static and calm (rest-moon keeps
                    its breathing amber glow). */}
                <div
                  className={cn(
                    "relative grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all",
                    data.claimedToday
                      ? "border-amber-400/50 bg-amber-500/10 shadow-[0_0_16px_rgba(251,191,36,0.25)]"
                      : data.available
                        ? "border-amber-400/40 bg-amber-500/10"
                        : "border-zinc-700/60 bg-zinc-950/60"
                  )}
                  aria-hidden
                >
                  {(data.claimedToday || data.available) && (
                    <span
                      className="rest-orbit absolute -inset-1.5 rounded-full border border-dashed border-amber-400/25"
                    />
                  )}
                  {data.available && !data.claimedToday && (
                    <>
                      <span className="rest-star" style={{ right: "9%", top: "8%", animationDelay: "0s" }} />
                      <span className="rest-star" style={{ left: "4%", top: "44%", animationDelay: "1.1s" }} />
                      <span className="rest-star" style={{ left: "28%", bottom: "-1%", animationDelay: "2s" }} />
                    </>
                  )}
                  {data.claimedToday ? (
                    /* the sealed decree — stroke-drawn wax seal (vault language) */
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 text-amber-300"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="9" pathLength="100" className="vault-check-circle" />
                      <path d="m8.5 12.5 2.5 2.5 5-6" pathLength="100" className="vault-check-mark" />
                    </svg>
                  ) : data.available ? (
                    <span className="inline-flex">
                      <Moon className="rest-moon h-5 w-5 text-amber-300" />
                    </span>
                  ) : (
                    <BedDouble className="h-5 w-5 text-zinc-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {data.eligible ? (
                    <>
                      {/* R55 — the header chip ("1 of 1 available" + hint)
                          carries the state; the old "Recovery day available"
                          body line folded to the card's sr-only text. */}
                      <p className="sr-only">Recovery day available</p>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={claim}
                        disabled={claiming}
                        className={cn(
                          "relative mt-3 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-amber-400/50 bg-amber-500/15 text-[10px] font-bold tracking-[0.12em] text-amber-200 transition-colors hover:bg-amber-500/25 hover:shadow-[0_0_18px_rgba(245,158,11,0.35)] focus-visible:outline focus-visible:outline-amber-400/70 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-6",
                          claiming && "rift-chip rest-sealing"
                        )}
                      >
                        {claiming ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Claim rest day
                          </>
                        )}
                      </motion.button>
                    </>
                  ) : (
                    (() => {
                      const copy = REASON_COPY[data.reason]
                      const usedIdx = data.usedDay ? mondayIndexOf(data.usedDay) : -1
                      return (
                        <>
                          <p
                            className={cn(
                              "text-xs font-bold tracking-[0.12em]",
                              data.claimedToday ? "text-amber-300" : "text-zinc-400"
                            )}
                          >
                            {copy.title}
                          </p>
                          <p className="mt-1 text-[11px] leading-snug text-zinc-400">{copy.body}</p>
                          {data.usedDay && !data.claimedToday && (
                            <div className="mt-2.5">
                              <p className="text-[9px] font-semibold tabular-nums tracking-wider text-zinc-400">
                                Granted {formatDayLabel(data.usedDay)} · recharges Monday
                              </p>
                              {/* week-ticks — the spent day marked, the rest recharging toward Monday */}
                              <div
                                className="mt-2 inline-flex items-end gap-[5px] rounded-full border border-zinc-800/80 bg-zinc-950/40 px-3 py-2"
                                role="img"
                                aria-label={`Recovery day used ${formatDayLabel(data.usedDay)} — recharges Monday`}
                              >
                                {WEEKDAY_ABBR.map((abbr, i) => {
                                  const used = i === usedIdx
                                  return (
                                    <span key={i} className="flex flex-col items-center gap-1">
                                      <span
                                        className={cn(
                                          "h-2.5 w-[3px] rounded-full",
                                          used
                                            ? "bg-amber-400/80 shadow-[0_0_5px_rgba(245,158,11,0.55)]"
                                            : "bg-zinc-700"
                                        )}
                                      />
                                      <span
                                        className={cn(
                                          "text-[7px] font-bold leading-none tracking-wider",
                                          used ? "text-amber-300/90" : "text-zinc-400"
                                        )}
                                      >
                                        {abbr}
                                      </span>
                                    </span>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {data.claimedToday && (
                            <p className="mt-2 flex items-center gap-1.5 text-[9px] font-semibold tabular-nums tracking-wider text-amber-400/70">
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full border border-amber-400/70 bg-amber-500/25 shadow-[0_0_5px_rgba(251,191,36,0.5)]"
                                aria-hidden
                              />
                              Streak shield active until {hunter.timezone ? "your midnight" : "midnight UTC"}
                            </p>
                          )}
                        </>
                      )
                    })()
                  )}
                  {claimError && (
                    <p className="mt-2 text-[9px] font-semibold tracking-wider text-rose-400/80">{claimError}</p>
                  )}
                </div>
              </div>

              {/* streak shield inventory — weekly recovery charge + relic ward charges */}
              <div
                className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800/60 pt-3"
                aria-label="Streak shield inventory"
              >
                <span className="sys-label text-[8px] text-zinc-400">SHIELDS</span>
                <span
                  className={cn(
                    "grove-press inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold tracking-wider",
                    data.available
                      ? "border-amber-500/40 bg-amber-500/[0.07] text-amber-300"
                      : "border-zinc-700/60 bg-zinc-800/40 text-zinc-400"
                  )}
                  title="One free recovery day per ISO week — it shields your streak from one missed session"
                >
                  <ShieldCheck className="h-2.5 w-2.5" aria-hidden />
                  {data.available ? "ready" : "spent"}
                </span>
                {data.ward?.owned && (
                  <span
                    className={cn(
                      "grove-press inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold tabular-nums tracking-wider",
                      data.ward.charges > 0
                        ? "border-teal-500/40 bg-teal-500/[0.07] text-teal-300"
                        : "border-zinc-700/60 bg-zinc-800/40 text-zinc-400"
                    )}
                    title="Streak Shield relic — auto-shields your streak for one missed day per charge"
                  >
                    <span aria-hidden>⌘</span> Relic ward ×{data.ward.charges}
                  </span>
                )}
              </div>
            </div>
          </SystemPanel>
        </motion.div>
      ) : null}
    </>
  )
}
