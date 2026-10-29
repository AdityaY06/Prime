import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { dayKey } from "@/lib/game"
import { mapExerciseToMuscles, equipmentSwapLine } from "@/lib/muscles"
import { epleyE1rm, parseBumpKg, progressionKey, suggest, validE1rmSet, type ProgressionInput } from "@/lib/progression"
import { WARMUP_RAMP } from "@/lib/strength-science"
import type { AttackPlanDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

// ─── GET /api/oracle/attack-plan?name=<pb.name>&type=<type> ───────────────────
// The Oracle's deterministic next-session prescription for one personal record:
// verdict (progression engine), target line, working top set, session scheme,
// stall risk and tactical notes — plus the R6-b science block: 2-5 evidence
// lines (proximity-to-failure, frequency, volume, deload, stretch-position)
// grounded in an approved consensus citation pool. Pure logic — no LLM, no writes.

// Lower-body movers flip the BUMP LOAD heuristic from +2.5 kg to +5 kg
// (same set the /api/progression route uses).
const LOWER_MUSCLES: ReadonlySet<string> = new Set(["glutes", "quads", "hamstrings", "calves"])

/** Primary movers whose movement pattern naturally loads a deep stretch
 *  (squat / bench / row / RDL families) — Maeo 2021 lengthened-position bias. */
const STRETCH_MUSCLES: ReadonlySet<string> = new Set(["chest", "lats", "quads", "glutes", "hamstrings"])

/** History window feeding the plan — ~10 weeks of cleared sessions. */
const WINDOW_DAYS = 70

/** One cleared log row, day-keyed and e1RM-annotated (progression route shape). */
type Row = ProgressionInput & {
  sessionId: string
  createdAt: Date
  e1rm: number
}

/** Compact kg number (1 decimal max, no trailing-zero noise). */
const fmtKg = (n: number) => String(Math.round(n * 10) / 10)

/** Snap a working weight onto the 2.5 kg plate grid (min 2.5). */
const snap2_5 = (n: number) => Math.max(2.5, Math.round(n / 2.5) * 2.5)

/** R69-a — the scheme's RAMP line is BUILT from the one shared
 * strength-science.WARMUP_RAMP constant (percentages AND reps from a single
 * voice; previously the inline "RAMP — 50% ×5 · 70% ×3 · 85% ×1" string
 * literals — reps now harmonized to the McGowan 2015 ramp 8/5/3). `rungs`
 * trims the ramp tail for lighter verdict days, exactly like the old
 * two-rung variant. */
const rampLine = (rungs: number) =>
  `RAMP — ${WARMUP_RAMP.slice(0, rungs)
    .map(({ pct, reps }) => `${pct}% ×${reps}`)
    .join(" · ")}`

/** Primary metric a record type is judged on (dossier convention: cardio/mobility duration). */
function metricFor(type: string, r: Row): number {
  if (type === "strength") return r.e1rm
  if (type === "cardio" || type === "mobility") return r.durationMin
  return r.reps
}

/** Days between two yyyy-mm-dd keys (b - a), local-midnight safe. */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  return Math.round((new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime()) / 86_400_000)
}

export async function GET(req: Request) {
  try {
    const hunter = await requireHunter()

    const url = new URL(req.url)
    const key = progressionKey(url.searchParams.get("name") ?? "")
    if (!key) return NextResponse.json({ error: "UNKNOWN_LIFT" }, { status: 404 })

    const pb = await db.personalBest.findFirst({ where: { hunterId: hunter.id, name: key } })
    if (!pb) return NextResponse.json({ error: "UNKNOWN_LIFT" }, { status: 404 })

    // The PB row is the source of truth for type — the echoed `type` query param
    // is advisory only, so a stale client record can never 404 a living lift.
    const type = pb.type

    // ── single-lift mirror of the /api/progression grouping pipeline ──────────
    const since = new Date()
    since.setDate(since.getDate() - WINDOW_DAYS)

    const logs = await db.exerciseLog.findMany({
      where: { session: { hunterId: hunter.id, status: "cleared", startedAt: { gte: since } } },
      include: { session: { select: { startedAt: true } } },
      orderBy: { createdAt: "asc" },
    })

    const rows: Row[] = []
    for (const l of logs) {
      if (progressionKey(l.name) !== key) continue
      rows.push({
        day: dayKey(l.session.startedAt),
        sets: l.sets,
        reps: l.reps,
        weightKg: l.weightKg,
        durationMin: l.durationMin,
        sessionId: l.sessionId,
        createdAt: l.createdAt,
        e1rm: epleyE1rm(l.weightKg, l.reps),
        lastRir: l.rir ?? null,
      })
    }

    // Per-session top set (best e1RM of the session; ties → latest log), then
    // chronological per-session trend (day asc; same-day ties by log time).
    // R68 — loaded sets outside Epley's 1-12 rep domain never win a top-set
    // (mirror of the /api/progression filter — their inflated e1RM would
    // poison the verdict, stall check and best-row). Unloaded rows stay so
    // the bodyweight reps / cardio-mobility durationMin tracks keep history.
    const bySession = new Map<string, Row>()
    for (const r of rows) {
      if (r.weightKg > 0 && !validE1rmSet(r.reps, r.weightKg)) continue
      const cur = bySession.get(r.sessionId)
      if (!cur || r.e1rm > cur.e1rm || (r.e1rm === cur.e1rm && r.createdAt >= cur.createdAt)) {
        bySession.set(r.sessionId, r)
      }
    }
    const trend = [...bySession.values()].sort((a, b) =>
      a.day === b.day ? a.createdAt.getTime() - b.createdAt.getTime() : a.day < b.day ? -1 : 1
    )

    // Verdict — straight from the shared progression engine.
    const mapped = mapExerciseToMuscles(pb.displayName)
    const isLower = (mapped?.primary ?? []).some((m) => LOWER_MUSCLES.has(m))
    const verdict = suggest(
      trend.map((r) => ({ day: r.day, e1rm: r.e1rm, weightKg: r.weightKg, reps: r.reps, lastRir: r.lastRir ?? null })),
      isLower
    )

    // Record context — the exact set that set the current PB.
    let ctx: { sets: number; reps: number; weightKg: number; durationMin: number } | null = null
    if (pb.context) {
      try {
        const c = JSON.parse(pb.context)
        ctx = { sets: c.sets, reps: c.reps, weightKg: c.weightKg, durationMin: c.durationMin }
      } catch {
        /* ignore malformed context */
      }
    }

    // ── plan computation (deterministic, type-aware) ──────────────────────────
    const action = verdict.action
    const bestRow = trend.reduce<Row | null>((b, r) => {
      if (!b) return r
      return metricFor(type, r) > metricFor(type, b) ? r : b
    }, null)

    // Stall detection: none of the last 3 sessions beat the running best
    // established before them (with exactly 3 sessions, the first is the baseline).
    let stallRisk = false
    if (trend.length >= 3) {
      const windowStart = trend.length - 3
      let runningBest = windowStart > 0 ? 0 : metricFor(type, trend[0])
      for (let i = 0; i < windowStart; i++) runningBest = Math.max(runningBest, metricFor(type, trend[i]))
      stallRisk = true
      for (let i = Math.max(1, windowStart); i < trend.length; i++) {
        if (metricFor(type, trend[i]) > runningBest) {
          stallRisk = false
          break
        }
        runningBest = Math.max(runningBest, metricFor(type, trend[i]))
      }
    }

    let targetLine = ""
    let topSet = ""
    let scheme: string[] = []
    const notes: string[] = []

    if (type === "strength") {
      const bestW = pb.bestValue > 0 ? pb.bestValue : (bestRow?.weightKg ?? 0)
      const bestReps = Math.max(1, ctx?.reps ?? bestRow?.reps ?? 5)
      const bestSets = Math.max(1, ctx?.sets ?? bestRow?.sets ?? 3)
      const bump = parseBumpKg(verdict.detail)

      if (action === "BUMP LOAD") {
        targetLine = `${fmtKg(bestW + bump)} KG`
        topSet = `3-5 × ${fmtKg(snap2_5(bestW * 0.93))} KG (~93%)`
        scheme = [
          rampLine(WARMUP_RAMP.length),
          `TOP SET — ${topSet} AT 1-2 RIR`,
          `ASSAULT — ${fmtKg(bestW + bump)} KG × 3-5 (NEW RECORD WEIGHT)`,
          "BACK-OFF — 80% × 2×5 UNDER FATIGUE",
          "LOG EVERY SET — THE ORACLE SEES ALL",
        ]
      } else if (action === "ADD REPS") {
        targetLine = `${fmtKg(bestW)} KG × ${bestReps + 1}`
        topSet = `${bestSets} × ${bestReps + 1} @ ${fmtKg(bestW)} KG`
        scheme = [
          rampLine(WARMUP_RAMP.length),
          `TOP SET — ${topSet} AT 1-2 RIR`,
          "BACK-OFF — 80% × 2×5 UNDER FATIGUE",
          "LOG EVERY SET — THE ORACLE SEES ALL",
        ]
      } else {
        targetLine = `${fmtKg(bestW)} KG × ${bestReps}`
        topSet = `${bestSets} × ${bestReps} @ ${fmtKg(bestW)} KG`
        scheme = [
          rampLine(2),
          `TOP SET — ${topSet}`,
          "BACK-OFF — 75% × 2×5 UNDER FATIGUE",
          "LOG EVERY SET — THE ORACLE SEES ALL",
        ]
      }
      notes.push("REST 3-4 MIN AROUND TOP SETS — EARN EVERY REP", "CUE — BRACE HARD, MOVE THE BAR FAST")
    } else if (type === "bodyweight") {
      const bestReps = Math.max(1, bestRow?.reps ?? ctx?.reps ?? Math.max(1, Math.round(pb.bestValue / Math.max(1, ctx?.sets ?? 1))))
      const bestSets = Math.max(1, bestRow?.sets ?? ctx?.sets ?? 3)
      const targetReps = bestReps + 2
      targetLine = `${targetReps} REPS`
      topSet = `${bestSets} × ${targetReps}`
      scheme = [
        "WARM-UP — 40% REPS × 1 EASY SET + JOINT CIRCLES",
        `TOP SET — 1 × ${targetReps} MAX ATTEMPT`,
        `BACK-OFF — ${bestSets} × ${Math.max(1, Math.round(bestReps * 0.5))} REPS AT 50%`,
        "LOG EVERY SET — THE ORACLE SEES ALL",
      ]
      notes.push("REST 90S-2 MIN BETWEEN SETS", "CUE — LOCK THE CORE, NO HIP SAG")
    } else if (type === "cardio") {
      const targetMin = Math.max(1, Math.round(Math.max(pb.bestValue, bestRow?.durationMin ?? 0) * 1.1))
      targetLine = `${targetMin} MIN`
      topSet = `1 × ${targetMin} MIN STEADY BOUT`
      scheme = [
        "WARM-UP — 5 MIN EASY PACE (RPE 3-4)",
        `MAIN — ${targetMin} MIN STEADY BOUT (RPE 6-7)`,
        "SURGE — FINAL 2 MIN AT CONTROLLED RPE 8",
        "COOLDOWN — 5 MIN WALK + STRETCH",
      ]
      notes.push("HOLD RPE 6-7 — NO HERO SURGES", "FUEL + WATER BEFORE THE GATE")
    } else {
      // mobility
      const targetMin = Math.max(1, Math.round(Math.max(pb.bestValue, bestRow?.durationMin ?? 0) * 1.15))
      targetLine = `${targetMin} MIN`
      topSet = `1 × ${targetMin} MIN UNBROKEN FLOW`
      scheme = [
        "ARRIVE — 3 MIN BREATHING RESET",
        `FLOW — ${targetMin} MIN UNBROKEN SEQUENCE`,
        "SEAL — 2 MIN STILLNESS, NOTE WHAT OPENED",
      ]
      notes.push("BREATHE INTO EVERY POSITION — 4S IN / 6S OUT", "DAILY IS FINE — INTENSITY STAYS LOW")
    }

    // Spacing note — honest distance from the last logged session.
    const lastDay = trend.length > 0 ? trend[trend.length - 1].day : dayKey(pb.updatedAt)
    const sinceDays = Math.max(0, daysBetween(lastDay, dayKey()))
    if (sinceDays <= 1) {
      notes.unshift(`RECOVER — ONLY ${sinceDays}D SINCE THE LAST RAID, SPACE 48-72H`)
    } else {
      notes.unshift(`SPACE 48-72H BETWEEN SESSIONS — LAST RAID ${sinceDays}D AGO`)
    }

    // Stall → prepend the deload recommendation (spec: -10% session first).
    if (stallRisk) {
      notes.unshift("DELOAD FIRST — RUN THIS LIFT AT -10% FOR ONE SESSION, THEN RE-ASSAULT")
    }

    // ── R6-b science block — evidence lines for the prescription ─────────────
    // Approved pool only (author+year): Robinson 2024 proximity-to-failure,
    // Schoenfeld 2016 frequency + rest, Schoenfeld 2017 volume, Grgic 2022,
    // Maeo 2021 long-length, Helms deload, ACSM cardio, Morton 2018 protein,
    // Areta 2013 dosing, Hirshkowitz 2015 sleep. Weekly averages use the
    // analyzed window itself as the denominator (WINDOW_DAYS / 7 weeks).
    const science: string[] = []
    const windowWeeks = WINDOW_DAYS / 7
    const sessionsPerWeek = trend.length / windowWeeks
    const fmtRate = (n: number) => String(Math.round(n * 10) / 10)
    const primary = mapped?.primary ?? []

    if (type === "strength" || type === "bodyweight") {
      // 1) proximity to failure — verdict-aware (Robinson et al. 2024).
      if (type === "bodyweight") {
        // The prescribed top set is a max attempt — inside the 0-3 RIR zone.
        science.push("RIDE THE MAX ATTEMPT — 0-3 RIR FROM FAILURE CAPTURES THE STIMULUS (ROBINSON 2024)")
      } else if (action === "BUMP LOAD" || action === "ADD REPS") {
        science.push("TOP SETS AT 1-2 RIR — THE LAST REPS SHOULD COST SOMETHING (ROBINSON 2024)")
      } else {
        science.push("LEAVE 1-3 REPS IN THE TANK — 0-3 RIR CAPTURES THE GROWTH STIMULUS (ROBINSON 2024)")
      }

      // 2) frequency — derived from this lift's own session history (2×/wk
      //    muscle-specific frequency beats one session; Schoenfeld 2016).
      science.push(
        sessionsPerWeek >= 2
          ? `FREQUENCY ON TARGET — ~${fmtRate(sessionsPerWeek)} SESSIONS/WK (SCHOENFELD 2016)`
          : "HIT THIS LIFT 2×/WK — MUSCLE-SPECIFIC FREQUENCY BEATS ONE SESSION (SCHOENFELD 2016)"
      )

      // 3) volume — weekly hard-set average for the muscle (atlas convention:
      //    primary movers, every window log counted), exercise-level fallback
      //    for unmapped lifts, general line when nothing is computable.
      if (primary.length > 0) {
        let muscleSets = 0
        for (const l of logs) {
          const lm = mapExerciseToMuscles(l.name)
          if (lm && lm.primary.some((m) => primary.includes(m))) muscleSets += l.sets
        }
        const perWeek = muscleSets / windowWeeks
        science.push(
          muscleSets > 0
            ? perWeek >= 10
              ? `VOLUME ON TARGET — ~${fmtRate(perWeek)} SETS/WK · 10+ = GROWTH ZONE (SCHOENFELD 2017)`
              : `${primary[0].toUpperCase()} AT ~${fmtRate(perWeek)} SETS/WK — 10+ HARD SETS/WK = GROWTH ZONE (SCHOENFELD 2017)`
            : "10+ HARD SETS/WK PER MUSCLE = THE GROWTH ZONE (SCHOENFELD 2017)"
        )
      } else {
        const ownSets = rows.reduce((a, r) => a + r.sets, 0)
        science.push(
          ownSets > 0
            ? `THIS LIFT RUNS ~${fmtRate(ownSets / windowWeeks)} SETS/WK — 10+ SETS/WK PER MUSCLE = GROWTH ZONE (SCHOENFELD 2017)`
            : "10+ HARD SETS/WK PER MUSCLE = THE GROWTH ZONE (SCHOENFELD 2017)"
        )
      }
    } else if (type === "cardio") {
      // Health floor first (ACSM), then a frequency principle — no RIR or
      // hypertrophy volume claims for cardio; principles stay uncited.
      science.push("150 MIN/WK MODERATE CARDIO IS THE HEALTH BASELINE (ACSM)")
      science.push(
        sessionsPerWeek >= 2
          ? "FREQUENCY ON TARGET — CONSISTENT BOUTS BUILD THE ENGINE"
          : "SPREAD CARDIO ACROSS THE WEEK — FREQUENCY BUILDS THE ENGINE"
      )
    } else {
      // mobility — frequency + calm-exposure principles, no citation needed.
      science.push(
        sessionsPerWeek >= 2
          ? "FREQUENCY ON TARGET — LITTLE AND OFTEN KEEPS THE RANGE"
          : "MOBILITY RESPONDS TO FREQUENCY — LITTLE AND OFTEN WINS"
      )
      science.push("RANGE GROWS THROUGH CALM EXPOSURE — INTENSITY STAYS LOW")
    }

    // 4) stall → evidence-graded deload (Helms et al.).
    if (stallRisk) {
      science.push("DELOAD — CUT LOAD 10-15% FOR ONE WEEK, KEEP THE PATTERN (HELMS ET AL.)")
    }

    // 5) stretch-position cue — only patterns that naturally load a deep
    //    stretch (squat/bench/row/RDL families via primary movers); unmapped
    //    strength lifts take the general cue per the R6-b spec.
    const stretchLoaded = primary.some((m) => STRETCH_MUSCLES.has(m))
    if ((type === "strength" || type === "bodyweight") && (stretchLoaded || (type === "strength" && primary.length === 0))) {
      science.push("CONTROL THE DEEP STRETCH — LENGTHENED REPS BIAS GROWTH (MAEO 2021)")
    }

    // 6) equipment swap — same movement pattern without the iron (R6-a link).
    //    Appended only when the recorded lift depends on equipment; grounded in
    //    the Calatayud 2015 matched-intensity substitution evidence family.
    const swap = equipmentSwapLine(pb.displayName)
    if (swap && type === "strength") science.push(swap)

    const plan: AttackPlanDTO = {
      name: pb.name,
      displayName: pb.displayName,
      type,
      unit: pb.unit,
      best: { value: pb.bestValue, day: dayKey(pb.updatedAt) },
      verdict,
      targetLine,
      topSet,
      scheme,
      stallRisk,
      notes,
      science,
      sessionsAnalyzed: trend.length,
    }

    return NextResponse.json(plan)
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/oracle/attack-plan", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
