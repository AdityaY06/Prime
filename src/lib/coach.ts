// ─── PRIME · Strain Coach (R23-b — the daily training directive engine) ───────
// Pure data + pure functions only (client-safe, no DB, no fetch). The coach
// reads everything the app already knows about the hunter each morning —
// load (strain / ACWR / TSB from lib/load.ts) and readiness (band / sleep
// debt / RHR deviation from lib/health.ts) — and issues ONE honest
// directive. This is the Whoop "Daily Strain Coach" / Oura "Readiness
// Recommendation" layer, deterministic and free of narrative invention:
// every rule carries the evidence lines that produced it, and absence of a
// signal is rendered honestly (never fabricated — the zero-is-data /
// absent-is-not-a-claim house idiom).
//
// R24-a adds the HRV percent deviation vs the prior-7-day baseline as an
// EVIDENCE row (+ a defensively-pure RECOVERY guard — see rule 3's comment).
//
// ─── RULE ORDER — first match wins ────────────────────────────────────────────
//  1. DELOAD NOW  — ACWR verdict DANGER (≥1.5) — accumulated overload risk.
//  2. REST        — TSB WATCH (≤−10) · readiness BACK OFF · sleep debt ≥2.5h ·
//                   strain ≥17 already accrued today. Cap 0 — nothing hard.
//  3. RECOVERY    — TSB FATIGUED (−5..−10) · ACWR ELEVATED (1.3–1.5) ·
//                   readiness MODERATE · sleep debt 1–2.5h · RHR ≥+4 bpm vs
//                   the 7-day baseline · HRV ≤−20% vs baseline but ONLY when
//                   no readiness band exists (see the no-double-count note).
//                   Cap 10.
//  4. TRAIN HARD  — readiness PRIMED AND TSB FRESH AND ACWR OPTIMAL (0.8–1.3)
//                   AND sleep debt <1h — the green light. No cap.
//  5. TRAIN       — default when load history exists but no green/red flags.
//                   Cap 14 (honest mid ceiling).
//  6. Insufficient — strain/acwr/tsb/readiness ALL null → neutral TRAIN default
//                   with the honest BUILDING PICTURE note.
//
// EVALUATION ORDER: 1 → 2 → 3 → 4 → 6 → 5. Rule 6 sits between the green
// light and the default: red/caution flags outrank the insufficient note
// (a 3h sleep debt is a REST even while the load picture forms), and rule 6
// must precede rule 5 so the BUILDING PICTURE note renders instead of the
// load-history default when every headline signal is absent. (With all four
// headline signals null no rule 1–4 trigger can exist, so its position
// relative to them only matters for defensively-pure inputs the real API
// can never produce — a sleep debt or RHR deviation always implies a
// readiness band.)
//
// SLEEP DEBT definition (documented interpretation of "hours owed vs 7-day
// need"): today's sleep shortfall vs the hunter's own 7-day mean sleep — the
// demonstrated need, mirroring the RHR-deviation idiom exactly (today vs the
// 7-day baseline, health.ts sleep7dAvgFromRows). A null debt is NOT a claim:
// it neither fires the caution rules nor blocks the green light (the
// isPaused(null)=false precedent — absence of data is not a verdict).

import {
  LOAD_CITATIONS,
  STRAIN_MAX,
  type AcwrVerdict,
  type StrainBand,
  type TsbVerdict,
} from "./load"
import { READINESS_CITATION, HRV_PCT_THRESHOLDS, type ReadinessBand } from "./health"

// ─── Types ────────────────────────────────────────────────────────────────────

/** The directive ladder — one imperative, tone-colored in the UI. */
export type CoachVerdict = "TRAIN HARD" | "TRAIN" | "RECOVERY" | "REST" | "DELOAD NOW"

/** Evidence row tone — good emerald / caution amber / alert rose / neutral zinc. */
export type CoachTone = "good" | "caution" | "alert" | "neutral"

/** Every input is nullable — absence is honest, never fabricated. */
export type CoachInput = {
  /** today's 0–21 daily strain (null = no session history). */
  strain: number | null
  strainBand: StrainBand | null
  /** acute:chronic workload ratio (null = no chronic baseline). */
  acwr: number | null
  acwrVerdict: AcwrVerdict | null
  /** training stress balance through yesterday (null = no history). */
  tsb: number | null
  tsbVerdict: TsbVerdict | null
  /** today's readiness band (null = no vitals logged today). */
  readinessBand: ReadinessBand | null
  /** hours owed (positive) vs the 7-day mean sleep (null = not computable). */
  sleepDebtH: number | null
  /** bpm above (+) / below (−) the 7-day resting-HR baseline (null = n/a). */
  rhrDeviation: number | null
  /**
   * HRV percent deviation vs the prior-7-day baseline (R24-a; null/undefined
   * = n/a — optional so pre-R24-a callers stay valid). Feeds the HRV evidence
   * row and, only as a defensively-pure guard when no readiness band exists,
   * the RECOVERY trigger (see rule 3's no-double-count note).
   */
  hrvPctDeviation?: number | null
  /** ALL sessions started in the last 7 days (any status — attempts). */
  sessionsLast7Days: number | null
  /** cleared sessions started in the last 7 days (completed work). */
  clearedSessionsLast7Days: number | null
}

export type CoachEvidence = {
  label: string
  value: string
  tone: CoachTone
}

export type CoachDirective = {
  verdict: CoachVerdict
  /** one-line imperative (stored uppercase — house display idiom). */
  directive: string
  /** 1–2 sentence plain-language why (sentence case, briefing idiom). */
  rationale: string
  /** the lines that produced the verdict — max ~7 rows, one per signal. */
  evidence: CoachEvidence[]
  /** suggested strain ceiling for today (0–21); null = no cap (earn it). */
  strainCap: number | null
  /** literature already cited by the load + readiness layers it reads. */
  citations: string[]
}

// ─── Thresholds (exported for tests + display hints) ─────────────────────────

/** The coach's decision edges — each documented at its rule. */
export const COACH_THRESHOLDS = {
  /** sleep debt at/above which the day is a REST (a ≥2.5h-short night). */
  sleepDebtRestH: 2.5,
  /** sleep debt at/above which the day downgrades to RECOVERY. */
  sleepDebtRecoveryH: 1,
  /** RHR bpm above baseline signaling incomplete recovery (Plews band). */
  rhrDeviationRecoveryBpm: 4,
  /** HRV % edges vs the 7-day baseline (R24-a) — single source: health.ts. */
  hrvSupranormalPct: HRV_PCT_THRESHOLDS.supranormalPct,
  hrvBelowBaselinePct: HRV_PCT_THRESHOLDS.belowBaselinePct,
  /** HRV % at/below which suppression is substantial (RECOVERY guard edge). */
  hrvSuppressedPct: HRV_PCT_THRESHOLDS.suppressedPct,
  /** strain already accrued today that closes the day (near the 21 ceiling). */
  strainOverload: 17,
  /** strain ceiling on RECOVERY / DELOAD days. */
  recoveryStrainCap: 10,
  /** strain ceiling on the neutral TRAIN default. */
  trainStrainCap: 14,
} as const

/** The coach's footnote sources — the load + readiness layers it reads. */
export const COACH_CITATIONS: string[] = [
  ...LOAD_CITATIONS,
  READINESS_CITATION,
  "Sleep window 7.5–9h per Cappuccio et al. 2010 meta-analysis (Sleep); the coach's sleep-debt line is today's shortfall vs your own 7-day mean — the demonstrated need.",
]

// ─── Formatting helpers (single source of truth for value strings) ───────────

/** Signed 1-decimal number ("−3.2" / "+1.5" / "2") — mirrors health.ts signed1. */
function signed1(n: number): string {
  const r = Math.round(Math.abs(n) * 10) / 10
  const body = Number.isInteger(r) ? String(r) : r.toFixed(1)
  return n < 0 ? `−${body}` : n > 0 ? `+${body}` : body
}

/** Unsigned 1-decimal number ("8.2" / "2") — mirrors health.ts fmt1. */
function fmt1(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** STRAIN row value — "12.4 · MODERATE" / "NOT LOGGED" (zero is data: "0 · LOW"). */
export function formatCoachStrain(strain: number | null, band: StrainBand | null): string {
  if (strain === null || band === null) return "NOT LOGGED"
  return `${fmt1(strain)} · ${band}`
}

/** ACWR row value — "1.62 · DANGER" / "0.00 · UNDERTRAINED" / "NOT LOGGED". */
export function formatCoachAcwr(acwr: number | null, verdict: AcwrVerdict | null): string {
  if (acwr === null || verdict === null) return "NOT LOGGED"
  return `${acwr.toFixed(2)} · ${verdict}`
}

/** TSB row value — "+12.4 · FRESH" / "−12.4 · WATCH" / "NOT LOGGED". */
export function formatCoachTsb(tsb: number | null, verdict: TsbVerdict | null): string {
  if (tsb === null || verdict === null) return "NOT LOGGED"
  return `${signed1(tsb)} · ${verdict}`
}

/** SLEEP DEBT row value — "3.1 H" / "0.4 H" / "NOT LOGGED". */
export function formatCoachSleepDebt(debt: number | null): string {
  if (debt === null) return "NOT LOGGED"
  return `${fmt1(debt)} H`
}

/** RHR row value — "+5 BPM VS BASELINE" / "−2 BPM VS BASELINE" / "NOT LOGGED". */
export function formatCoachRhr(dev: number | null): string {
  if (dev === null) return "NOT LOGGED"
  return `${signed1(dev)} BPM VS BASELINE`
}

/** HRV row value — "−15% VS BASELINE" / "+6.7% VS BASELINE" / "NOT LOGGED" (R24-a). */
export function formatCoachHrv(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "NOT LOGGED"
  return `${signed1(pct)}% VS BASELINE`
}

// ─── Evidence tones (per signal family) ───────────────────────────────────────

function strainTone(strain: number | null, band: StrainBand | null): CoachTone {
  if (strain === null || band === null) return "neutral"
  if (strain >= COACH_THRESHOLDS.strainOverload) return "alert"
  if (band === "HIGH") return "caution"
  return "neutral" // LOW / MODERATE are honest context, not flags
}

function acwrTone(verdict: AcwrVerdict | null): CoachTone {
  if (verdict === "DANGER") return "alert"
  if (verdict === "ELEVATED") return "caution"
  if (verdict === "OPTIMAL") return "good"
  return "neutral" // UNDERTRAINED / null — honest, not alarming
}

function tsbTone(verdict: TsbVerdict | null): CoachTone {
  if (verdict === "WATCH") return "alert"
  if (verdict === "FATIGUED") return "caution"
  if (verdict === "FRESH") return "good"
  return "neutral"
}

function readinessTone(band: ReadinessBand | null): CoachTone {
  if (band === "BACK OFF") return "alert"
  if (band === "MODERATE") return "caution"
  if (band === "PRIMED" || band === "READY") return "good"
  return "neutral"
}

function sleepDebtTone(debt: number | null): CoachTone {
  if (debt === null) return "neutral"
  if (debt >= COACH_THRESHOLDS.sleepDebtRestH) return "alert"
  if (debt >= COACH_THRESHOLDS.sleepDebtRecoveryH) return "caution"
  return "good"
}

function rhrTone(dev: number | null): CoachTone {
  if (dev === null) return "neutral"
  if (dev > 6) return "alert" // matches rhrTrendTitle's "elevated — fatigue signal" edge
  if (dev >= COACH_THRESHOLDS.rhrDeviationRecoveryBpm) return "caution"
  if (dev <= -3) return "good" // adaptation band (rhrContribution bonus edge)
  return "neutral"
}

/**
 * HRV tone (R24-a) — caution at ≤−8%, good at ≥+5%, neutral otherwise (±8%
 * is normal day-to-day RMSSD variation). The ≤−20% substantial-suppression
 * edge escalates to alert, mirroring rhrTone's fatigue-flag escalation over
 * the coach's softer +4 bpm caution band.
 */
function hrvTone(pct: number | null | undefined): CoachTone {
  if (pct === null || pct === undefined) return "neutral"
  if (pct <= COACH_THRESHOLDS.hrvSuppressedPct) return "alert"
  if (pct <= COACH_THRESHOLDS.hrvBelowBaselinePct) return "caution"
  if (pct >= COACH_THRESHOLDS.hrvSupranormalPct) return "good"
  return "neutral"
}

// ─── Evidence builder — one row per signal, ~7 rows, honest nulls ─────────────

function buildEvidence(input: CoachInput): CoachEvidence[] {
  return [
    { label: "STRAIN", value: formatCoachStrain(input.strain, input.strainBand), tone: strainTone(input.strain, input.strainBand) },
    { label: "ACWR", value: formatCoachAcwr(input.acwr, input.acwrVerdict), tone: acwrTone(input.acwrVerdict) },
    { label: "TSB · FORM", value: formatCoachTsb(input.tsb, input.tsbVerdict), tone: tsbTone(input.tsbVerdict) },
    { label: "READINESS", value: input.readinessBand ?? "NOT LOGGED", tone: readinessTone(input.readinessBand) },
    { label: "SLEEP DEBT", value: formatCoachSleepDebt(input.sleepDebtH), tone: sleepDebtTone(input.sleepDebtH) },
    { label: "RHR", value: formatCoachRhr(input.rhrDeviation), tone: rhrTone(input.rhrDeviation) },
    { label: "HRV", value: formatCoachHrv(input.hrvPctDeviation), tone: hrvTone(input.hrvPctDeviation) },
  ]
}

// ─── The directive engine ─────────────────────────────────────────────────────

/**
 * The daily training directive — PRIORITY-ORDERED rules, first match wins
 * (see the file header for the full table + evaluation order). Deterministic
 * and pure: the same input always produces a deep-equal directive.
 */
export function coachDirective(input: CoachInput): CoachDirective {
  const evidence = buildEvidence(input)

  // ── RULE 1 · DELOAD NOW — ACWR in the Gabbett danger band (≥1.5): the
  //    7-day load is sprinting away from the chronic baseline and injury risk
  //    spikes. Beats everything — even a PRIMED readiness cannot outrun an
  //    accumulated overload.
  if (input.acwrVerdict === "DANGER") {
    return {
      verdict: "DELOAD NOW",
      directive: "CUT LOAD — HARD WORK IS OFF THE TABLE TODAY",
      rationale: `Your 7-day load is running at ${input.acwr?.toFixed(2)}× your chronic baseline — inside the danger band where injury risk spikes. Today exists to shed fatigue, not add it.`,
      evidence,
      strainCap: COACH_THRESHOLDS.recoveryStrainCap,
      citations: COACH_CITATIONS,
    }
  }

  // ── RULE 2 · REST — any single hard stop: form in deep deficit, readiness
  //    in the back-off band, a badly short night, or a near-ceiling strain
  //    day already banked. Cap 0 — train nothing hard.
  const restReason: string | null =
    input.tsbVerdict === "WATCH"
      ? `Form sits at ${formatCoachTsb(input.tsb, input.tsbVerdict)} — a deep training-stress deficit. A zero day is the fastest way back to green.`
      : input.readinessBand === "BACK OFF"
        ? "Readiness is in the back-off band — the body is reporting incomplete recovery, and hard training today would dig the hole deeper."
        : input.sleepDebtH !== null && input.sleepDebtH >= COACH_THRESHOLDS.sleepDebtRestH
          ? `You are ${fmt1(input.sleepDebtH)}h short of your 7-day sleep norm — training hard on that debt compounds the shortfall. Sleep is the session today.`
          : input.strain !== null && input.strain >= COACH_THRESHOLDS.strainOverload
            ? `Today has already banked a ${fmt1(input.strain)} strain day — near the 21 ceiling. More load lands in overreach territory.`
            : null
  if (restReason !== null) {
    return {
      verdict: "REST",
      directive: "FULL REST — NOTHING HARDER THAN A WALK",
      rationale: restReason,
      evidence,
      strainCap: 0,
      citations: COACH_CITATIONS,
    }
  }

  // ── RULE 3 · RECOVERY — any single soft flag: fatigued form, elevated
  //    ratio, moderate readiness, a modest sleep debt, an elevated resting HR
  //    vs baseline, or (defensively-pure only) HRV suppression with no
  //    readiness band. Cap 10 — easy work only.
  //
  //    HRV NO-DOUBLE-COUNT NOTE (R24-a): HRV suppression now feeds
  //    readinessScore itself (health.ts hrvContribution — ≤−20% costs 10
  //    points), so an HRV-suppressed day already drags the band toward
  //    MODERATE/BACK OFF and fires this rule through those branches — an
  //    UNCONDITIONAL second HRV switch would count the same signal twice.
  //    The HRV branch below therefore fires ONLY when readinessBand is null,
  //    i.e. when the band could not form at all. Via the real API that is
  //    unreachable (an hrvPctDeviation always implies a readiness component,
  //    hence a band — same reasoning as the header's rule-6 note); it exists as
  //    the defensively-pure guard so inconsistent engine inputs can never
  //    silently drop a substantial suppression. The HRV evidence ROW always
  //    renders regardless — evidence, not a second verdict switch.
  const hrvPctDeviation = input.hrvPctDeviation ?? null
  const recoveryReason: string | null =
    input.tsbVerdict === "FATIGUED"
      ? `Form sits at ${formatCoachTsb(input.tsb, input.tsbVerdict)} — fatigue is winning. Zone 2, technique, mobility; nothing that adds meaningful strain.`
      : input.acwrVerdict === "ELEVATED"
        ? `Load ratio ${input.acwr?.toFixed(2)} is elevated (1.3–1.5) — one hard day from the danger band. Keep today light to pull it back.`
        : input.readinessBand === "MODERATE"
          ? "Readiness is moderate — train, but scale. Favor technique work and leave 2 reps in the tank."
          : input.sleepDebtH !== null && input.sleepDebtH >= COACH_THRESHOLDS.sleepDebtRecoveryH
            ? `You are ${fmt1(input.sleepDebtH)}h short of your 7-day sleep norm — enough to blunt adaptation. Keep the session easy and bank the sleep.`
            : input.rhrDeviation !== null && input.rhrDeviation >= COACH_THRESHOLDS.rhrDeviationRecoveryBpm
              ? `Resting HR is ${signed1(input.rhrDeviation)} bpm above your 7-day baseline — an incomplete-recovery signal. Easy work until it settles.`
              : hrvPctDeviation !== null &&
                  hrvPctDeviation <= COACH_THRESHOLDS.hrvSuppressedPct &&
                  input.readinessBand === null
                ? `HRV is ${fmt1(Math.abs(hrvPctDeviation))}% below your 7-day baseline — substantial suppression and an incomplete-recovery signal. Easy work until it climbs back.`
                : null
  if (recoveryReason !== null) {
    return {
      verdict: "RECOVERY",
      directive: "RECOVERY SESSION — EASY WORK ONLY",
      rationale: recoveryReason,
      evidence,
      strainCap: COACH_THRESHOLDS.recoveryStrainCap,
      citations: COACH_CITATIONS,
    }
  }

  // ── RULE 4 · TRAIN HARD — the full green quad: readiness PRIMED AND form
  //    FRESH AND ratio OPTIMAL AND sleep debt under 1h (null debt is not a
  //    claim — it neither blocks nor grants the light). No cap — earn it.
  if (
    input.readinessBand === "PRIMED" &&
    input.tsbVerdict === "FRESH" &&
    input.acwrVerdict === "OPTIMAL" &&
    (input.sleepDebtH === null || input.sleepDebtH < COACH_THRESHOLDS.sleepDebtRecoveryH)
  ) {
    return {
      verdict: "TRAIN HARD",
      directive: "GREEN LIGHT — ATTACK THE HEAVIEST WORK",
      rationale: `Readiness PRIMED, form fresh at ${formatCoachTsb(input.tsb, input.tsbVerdict)}, load ratio in the 0.8–1.3 sweet spot${
        input.sleepDebtH === null ? "" : `, sleep on norm (${fmt1(input.sleepDebtH)}h debt)`
      } — every logged signal is green.`,
      evidence,
      strainCap: null,
      citations: COACH_CITATIONS,
    }
  }

  // ── RULE 6 · BUILDING PICTURE — all four headline signals null (checked
  //    BEFORE the default so the honest note renders; after the flag rules so
  //    a real sleep debt / strain overload still commands the day). Degrades
  //    to the neutral default, never fabricates.
  if (
    input.strain === null &&
    input.acwr === null &&
    input.tsb === null &&
    input.readinessBand === null
  ) {
    return {
      verdict: "TRAIN",
      directive: "TRAIN AS PLANNED — PICTURE FORMING",
      rationale: "BUILDING PICTURE — LOG SLEEP, VITALS AND SESSIONS TO SHARPEN THE DIRECTIVE",
      evidence: [{ label: "SIGNALS", value: "INSUFFICIENT — BASELINE FORMING", tone: "neutral" }],
      strainCap: COACH_THRESHOLDS.trainStrainCap,
      citations: COACH_CITATIONS,
    }
  }

  // ── RULE 5 · TRAIN — the honest default: load history exists, no green
  //    quad, no red flags. Week shape joins the rationale when it exists.
  const cleared = input.clearedSessionsLast7Days
  const weekLine =
    cleared === null || cleared === 0
      ? ""
      : cleared === 1
        ? " 1 cleared session in the last 7 days"
        : ` ${cleared} cleared sessions in the last 7 days`
  return {
    verdict: "TRAIN",
    directive: "TRAIN AS PLANNED — STANDARD SESSION",
    rationale: `No red flags and no full green quad — the honest default.${weekLine} Keep today in the normal lane and log the effort.`,
    evidence,
    strainCap: COACH_THRESHOLDS.trainStrainCap,
    citations: COACH_CITATIONS,
  }
}

// ─── Display meta (pure — shared by the card, kept next to the engine) ───────

/** Verdict display family: green-light teal · default violet · recovery amber · rest/deload rose. */
export const COACH_VERDICT_META: Record<CoachVerdict, { text: string; capHint: string }> = {
  "TRAIN HARD": { text: "text-teal-300", capHint: "NO CAP — EARN IT" },
  TRAIN: { text: "text-violet-300", capHint: `CEILING ${COACH_THRESHOLDS.trainStrainCap} / ${STRAIN_MAX}` },
  RECOVERY: { text: "text-amber-300", capHint: `CEILING ${COACH_THRESHOLDS.recoveryStrainCap} / ${STRAIN_MAX}` },
  REST: { text: "text-rose-300", capHint: `CEILING 0 / ${STRAIN_MAX}` },
  "DELOAD NOW": { text: "text-rose-300", capHint: `CEILING ${COACH_THRESHOLDS.recoveryStrainCap} / ${STRAIN_MAX}` },
}
