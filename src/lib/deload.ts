// ─── PRIME · Deload library (R22-a — deload advisor, load-console deepening) ──
// Pure data + pure functions only (safe to import from client components).
// The R18 Strain & Load console measures everything and prescribes nothing:
// this lib folds the console's own week history into an explicit DELOAD call
// — the classic strength-training convention of a planned step-back / light
// week after sustained heavy loading. Nothing new is measured here; every
// number is a re-read of the existing LoadView DTO (lib/load.ts), derived
// client-side inside the console panel — no new API surface.
//
// WEEK BUCKETING — 7-day buckets anchored on TODAY, walked backwards:
//   [today−6 … today]     = the CURRENT partial week — still being lived, so
//                           it NEVER counts toward the consecutive-high
//                           streak; it surfaces in the readout only, as
//                           "this week so far".
//   [today−13 … today−7]  = the newest FULL week; then [today−20 … today−14],
//                           and so on.
// A bucket is a FULL week only when all 7 of its calendar days exist in the
// passed series AND it starts at/after the first day carrying load: the DTO
// zero-fills the quiet before the first session, and that padding is
// PRE-HISTORY, not rest data (mirrors buildLoadView's own first-session-day
// anchoring). Buckets inside history with zero total load ARE rest weeks —
// zero is data.
//
// STATUS RULES — deterministic, first match wins (exported bars/weeks for
// testability; the callout's footnote summarizes them):
//   1. NO HISTORY        — empty series, or fewer than 8 days of history
//                          (first-load day → newest data day): nothing to
//                          draw weeks from yet.
//   2. BUILDING PICTURE  — fewer than 2 full weeks mapped: one week is an
//                          anecdote, two is a pattern forming.
//   3. DELOAD NOW        — ≥ 3 consecutive HIGH weeks (meanStrain ≥ 14/21,
//                          the WHOOP-band homage: a week averaging
//                          two-thirds of the strain scale). cutPct 40.
//   4. WATCH             — exactly 2 consecutive HIGH weeks. cutPct 25.
//   5. CRUISE            — default: load in the lane, no cut (cutPct null).
// The streak walks the full weeks newest-first and stops at the first
// sub-bar week, whatever its flavor. A REST week (meanStrain ≤ 2,
// effectively off) BREAKS the streak by that same walk — recovery already
// happened, so only weeks AFTER the most recent rest week count toward the
// current streak — and it additionally supplies the "LAST REST WEEK …"
// evidence line (the walk also stops at moderate weeks; rest gets the
// callout because a named rest week is evidence, a moderate week is not).
//
// ACWR CORROBORATION — the caller may pass the console's own acwr /
// acwrVerdict as optional 3rd/4th params (records-tab passes the DTO's
// values; the function stays pure over its arguments). Only a DANGER
// verdict adds its evidence line — the ratio and the week history reading
// together is the honest double signal. No other verdict gets a line
// (OPTIMAL / ELEVATED / UNDERTRAINED stay the meter's own story), and a
// null/omitted ratio changes nothing.
//
// CITATION INTEGRITY: sources live in DELOAD_CITATIONS and the compact
// DELOAD_FOOTER (the R18-d/R19-b single-line footer idiom). The planned
// step-back week every 4–8 weeks of progressive loading is periodization
// practice descending from Matveyev's classical model — cited as convention
// homage; the 3-consecutive-high-week trigger is this app's own honest read
// of the strain lattice, not a textbook prescription. GUIDELINES, NOT LAWS.

import type { AcwrVerdict, DayLoad } from "@/lib/load"

// ─── Types ────────────────────────────────────────────────────────────────────

/** One 7-day bucket of the load series (a full week, or the current partial). */
export type WeekLoad = {
  /** yyyy-mm-dd — first day of the bucket */
  startDay: string
  /** yyyy-mm-dd — last day of the bucket */
  endDay: string
  /** summed daily load over the bucket (AU) */
  totalLoad: number
  /** mean daily strain over the bucket's 7 calendar days (0–21) */
  meanStrain: number
  /** days in the bucket with load > 0 */
  trainingDays: number
}

export type DeloadStatus = "DELOAD NOW" | "WATCH" | "CRUISE" | "BUILDING PICTURE" | "NO HISTORY"

/** Full deload-advisor view — derived client-side from LoadView.days. */
export type DeloadView = {
  status: DeloadStatus
  /** consecutive weeks (excluding current partial) with meanStrain ≥ the HIGH bar */
  highWeeks: number
  /** the trailing full weeks, newest first, max 6 */
  weeks: WeekLoad[]
  /** recommended next-week volume/strain reduction when status is DELOAD NOW or WATCH, else null */
  cutPct: number | null
  /** ≤ 40 chars, mono uppercase */
  headline: string
  /** ≤ 60 chars */
  sub: string
  /** evidence micro-lines, deterministic, ≤ 48 chars each */
  drivers: string[]
}

// ─── Exported tables (testability) ────────────────────────────────────────────

/** Mean weekly strain ≥ 14/21 = a HIGH week (WHOOP-band homage). */
export const DELOAD_HIGH_BAR = 14

/** 3+ consecutive HIGH weeks → DELOAD NOW. */
export const DELOAD_TRIGGER_WEEKS = 3

/** 2 consecutive HIGH weeks → WATCH (early warning). */
export const DELOAD_WATCH_WEEKS = 2

/** Mean weekly strain ≤ 2 = a REST week — breaks the consecutive-HIGH streak. */
export const DELOAD_REST_BAR = 2

/** Weeks that assemble a full picture: the 3-week trigger stack + the current week. */
export const DELOAD_PICTURE_WEEKS = DELOAD_TRIGGER_WEEKS + 1

/** Recommended next-week volume cut, by status (null = no cut prescribed). */
export const DELOAD_CUTS: Record<DeloadStatus, number | null> = {
  "DELOAD NOW": 40,
  WATCH: 25,
  CRUISE: null,
  "BUILDING PICTURE": null,
  "NO HISTORY": null,
}

/** Copy table — headline/sub per status, ≤ 40 / ≤ 60 chars, mono uppercase. */
export const DELOAD_COPY: Record<DeloadStatus, { headline: string; sub: string }> = {
  "DELOAD NOW": { headline: "DELOAD WEEK", sub: "CUT VOLUME 40% · BANK THE ADAPTATION" },
  WATCH: { headline: "TWO HEAVY WEEKS DEEP", sub: "PLAN THE STEP-BACK NEXT WEEK" },
  CRUISE: { headline: "LOAD IN THE LANE", sub: "NO DELOAD ON THE DOCKET" },
  "BUILDING PICTURE": { headline: "PICTURE ASSEMBLING", sub: "WEEKS OF DATA STILL OWED" },
  "NO HISTORY": { headline: "NO WEEKS YET", sub: "CLEAR SESSIONS TO DRAW WEEKS" },
}

/** The advisor's footnote sources (house citation discipline). */
export const DELOAD_CITATIONS: string[] = [
  "The planned step-back (light) week after every 4–8 weeks of progressive loading is classic strength-training convention — periodization practice descending from Matveyev's classical model (L.P. Matveyev, Fundamentals of Sports Training, 1977: load phases alternate with restoration); cited as convention homage, not prescription.",
  "HIGH week = mean daily strain ≥ 14/21 across all 7 calendar days — two-thirds of the R18 strain lattice (the WHOOP 0–21 scale convention as homage, lib/load.ts); three consecutive HIGH weeks triggers the call, two holds it at WATCH.",
  "ACWR corroboration follows the injury-risk bands — Gabbett TJ, Br J Sports Med 2016;50:273–280 — via the console's own ratio; a DANGER ratio and a deep high-week streak reading together is the honest double signal.",
  "Bands are evidence-informed GUIDELINES, NOT LAWS — the advisor reads the hunter's own week history and never invents an input it lacks.",
]

/** Compact footnote (the R18-d/R19-b single-line footer idiom). */
export const DELOAD_FOOTER =
  "HIGH WEEK = MEAN STRAIN ≥ 14/21 · 3 CONSECUTIVE HIGH WEEKS → DELOAD NOW (−40% VOLUME) · 2 → WATCH (−25%) · A REST WEEK (≤ 2) BREAKS THE STREAK · PLANNED STEP-BACK-WEEK CONVENTION — PERIODIZATION PRACTICE AFTER MATVEYEV'S CLASSICAL MODEL · ACWR BANDS (GABBETT 2016, BJSM) · GUIDELINES, NOT LAWS"

// ─── Day-key helpers (local mirrors of lib/load.ts's private set) ─────────────

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** "SEP 30" — month short + day, the console's formatDayLabel voice (en-US, deterministic). */
function fmtDay(day: string): string {
  return parseDayKey(day)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase()
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Calendar days between two day-keys, inclusive (0 when the span is empty/inverted). */
function spanDays(a: string, b: string): number {
  return Math.round((parseDayKey(b).getTime() - parseDayKey(a).getTime()) / 86400000) + 1
}

// ─── Advisor ──────────────────────────────────────────────────────────────────

/**
 * Derives the deload-advisor view from the load series. `days` is the
 * LoadView DTO's calendar window (ascending, zero-filled); `today` is the
 * yyyy-mm-dd anchor (the caller passes dayKey()); `acwr`/`acwrVerdict` are
 * OPTIONAL corroborating inputs — pass the console's own values and a DANGER
 * verdict adds its evidence line (null/omitted → no line, byte-identical).
 */
export function deloadView(
  days: DayLoad[],
  today: string,
  acwr?: number | null,
  acwrVerdict?: AcwrVerdict,
): DeloadView {
  // ── index the series; find the history anchor ──
  // firstWorkDay = first day carrying load. The zero-fill before it is
  // pre-history padding (not rest data); lastDay = newest day present,
  // capped at today defensively.
  const byDay = new Map<string, DayLoad>()
  let lastDay = ""
  let firstWorkDay: string | null = null
  for (const d of days) {
    byDay.set(d.day, d)
    if (d.day > lastDay && d.day <= today) lastDay = d.day
    if (d.load > 0 && (firstWorkDay === null || d.day < firstWorkDay)) firstWorkDay = d.day
  }
  const historyDays =
    firstWorkDay !== null && lastDay !== "" && firstWorkDay <= lastDay ? spanDays(firstWorkDay, lastDay) : 0

  const todayDate = parseDayKey(today)

  // ── full weeks, newest first: [today−13…today−7], [today−20…today−14], … ──
  // A bucket joins the list only when all 7 days exist in the series AND the
  // bucket starts at/after firstWorkDay (no pre-history padding inside it).
  // The walk breaks at the first bucket that fails either test — older
  // buckets fail harder. Hard cap 12: a 90-day DTO tops out there anyway.
  const weeks: WeekLoad[] = []
  if (firstWorkDay !== null) {
    for (let j = 1; weeks.length < 12; j++) {
      const end = addDays(todayDate, -7 * j)
      const start = addDays(end, -6)
      const startKey = dayKeyOf(start)
      const endKey = dayKeyOf(end)
      if (startKey < firstWorkDay) break // reaches into the pre-history padding
      let total = 0
      let strainSum = 0
      let training = 0
      let complete = true
      for (let k = 0; k < 7; k++) {
        const e = byDay.get(dayKeyOf(addDays(start, k)))
        if (!e) {
          complete = false
          break
        }
        total += e.load
        strainSum += e.strain
        if (e.load > 0) training++
      }
      if (!complete) break // walked past the series' edge
      weeks.push({
        startDay: startKey,
        endDay: endKey,
        totalLoad: round2(total),
        meanStrain: round2(strainSum / 7),
        trainingDays: training,
      })
    }
  }

  // ── current partial week [today−6 … today] — streak-excluded by design ──
  // "This week so far": mean strain over the days present (a fresh DTO gives
  // all 7 — the same number the console reads as weekStrain); pre-history
  // padding inside the window is skipped, not zero-filled.
  let curMean: number | null = null
  let curTraining = 0
  if (firstWorkDay !== null) {
    let strainSum = 0
    let n = 0
    for (let k = 0; k < 7; k++) {
      const key = dayKeyOf(addDays(todayDate, k - 6))
      const e = byDay.get(key)
      if (!e || key < firstWorkDay) continue
      strainSum += e.strain
      n++
      if (e.load > 0) curTraining++
    }
    if (n > 0) curMean = round2(strainSum / n)
  }

  // ── consecutive-HIGH streak (newest-first; any sub-bar week breaks it) ──
  let highWeeks = 0
  for (const w of weeks) {
    if (w.meanStrain >= DELOAD_HIGH_BAR) highWeeks++
    else break
  }
  // most recent REST week — recovery's last timestamp, for the evidence line
  const restWeek = weeks.find((w) => w.meanStrain <= DELOAD_REST_BAR) ?? null

  // ── status (first match wins; see header) ──
  let status: DeloadStatus
  if (days.length === 0 || historyDays < 8) status = "NO HISTORY"
  else if (weeks.length < 2) status = "BUILDING PICTURE"
  else if (highWeeks >= DELOAD_TRIGGER_WEEKS) status = "DELOAD NOW"
  else if (highWeeks === DELOAD_WATCH_WEEKS) status = "WATCH"
  else status = "CRUISE"

  // ── drivers (deterministic micro-lines, ≤ 48 chars each) ──
  const drivers: string[] = []
  const fmtMean = (m: number): string => m.toFixed(1)
  if (status === "DELOAD NOW" || status === "WATCH") {
    drivers.push(`${highWeeks} CONSECUTIVE HIGH WEEKS · MEAN STRAIN ${fmtMean(weeks[0].meanStrain)}/21`)
    drivers.push(
      restWeek
        ? `LAST REST WEEK ${fmtDay(restWeek.startDay)} – ${fmtDay(restWeek.endDay)}`
        : `NO REST WEEK IN ${Math.min(weeks.length, 6)} MAPPED WEEKS`,
    )
  } else if (status === "CRUISE") {
    drivers.push(`HIGH-WEEK STREAK ${highWeeks} · NEWEST WEEK ${fmtMean(weeks[0].meanStrain)}/21`)
  } else if (status === "BUILDING PICTURE") {
    drivers.push(`WEEKS MAPPED ${weeks.length}/${DELOAD_PICTURE_WEEKS} · HISTORY ${historyDays}D`)
  } else {
    drivers.push(`DAYS OF HISTORY ${historyDays} · FLOOR IS 8`)
  }
  // ACWR corroboration — DANGER verdicts only (see header)
  if (acwrVerdict === "DANGER" && acwr !== null && acwr !== undefined && Number.isFinite(acwr)) {
    drivers.push(`ACWR ${acwr.toFixed(2)} · DANGER ZONE`)
  }
  if (curMean !== null) {
    drivers.push(`THIS WEEK SO FAR · ${fmtMean(curMean)}/21 · ${curTraining} TRAINING DAYS`)
  }

  const copy = DELOAD_COPY[status]
  return {
    status,
    highWeeks,
    weeks: weeks.slice(0, 6),
    cutPct: DELOAD_CUTS[status],
    headline: copy.headline,
    sub: copy.sub,
    drivers,
  }
}
