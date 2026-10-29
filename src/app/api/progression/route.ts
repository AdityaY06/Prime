import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { dayKey } from "@/lib/game"
import { mapExerciseToMuscles } from "@/lib/muscles"
import { epleyE1rm, progressionKey, suggest, validE1rmSet, type ProgressionInput } from "@/lib/progression"

export const dynamic = "force-dynamic"

// Lower-body movers flip the BUMP LOAD heuristic from +2.5 kg to +5 kg.
const LOWER_MUSCLES: ReadonlySet<string> = new Set(["glutes", "quads", "hamstrings", "calves"])

const PROGRESSION_WINDOW_DAYS = 90

/** One decimal — RPE averages read at 0.1 resolution (the CR10 anchors are
 *  integers; 0.1 is already finer than the scale's honest precision). */
const round1 = (n: number) => Math.round(n * 10) / 10

/** One cleared log row, day-keyed and e1RM-annotated. */
type Row = ProgressionInput & {
  sessionId: string
  createdAt: Date
  e1rm: number
  /** R34-a — Borg CR10 effort rating of the logged set (null = not captured,
   *  incl. every pre-R32-a legacy row). */
  rpe: number | null
}

// GET /api/progression — 90-day per-exercise progression intelligence
export async function GET() {
  try {
    const hunter = await requireHunter()
    const since = new Date()
    since.setDate(since.getDate() - PROGRESSION_WINDOW_DAYS)

    // Cleared (non-abandoned) sessions in the window, joined through their logs.
    const logs = await db.exerciseLog.findMany({
      where: { session: { hunterId: hunter.id, status: "cleared", startedAt: { gte: since } } },
      include: { session: { select: { startedAt: true } } },
      orderBy: { createdAt: "asc" },
    })

    const groups = new Map<string, { displayName: string; type: string; rows: Row[] }>()
    for (const l of logs) {
      const key = progressionKey(l.name)
      if (!key) continue
      const row: Row = {
        day: dayKey(l.session.startedAt),
        sets: l.sets,
        reps: l.reps,
        weightKg: l.weightKg,
        durationMin: l.durationMin,
        sessionId: l.sessionId,
        createdAt: l.createdAt,
        // R68 — honest 0 outside Epley's 1-12 rep domain (a 13+ rep set has no
        // e1RM — never an inflated extrapolation). The 0 never reaches
        // suggest(): invalid LOADED rows are filtered out of the top-set
        // grouping below, so the BUMP-LOAD branch cannot collapse onto it.
        e1rm: validE1rmSet(l.reps, l.weightKg) ? epleyE1rm(l.weightKg, l.reps) : 0,
        lastRir: l.rir ?? null,
        rpe: l.rpe ?? null,
      }
      const g = groups.get(key)
      if (g) {
        g.rows.push(row)
        g.displayName = l.name // latest raw spelling wins
        g.type = l.type
      } else {
        groups.set(key, { displayName: l.name, type: l.type, rows: [row] })
      }
    }

    // ── R34-a · the global effort ledger ────────────────────────────────────
    // Per-session average RPE across ALL rated logs in the window (any
    // exercise — not just progression-keyed names), day-ascending; windowAvg
    // is the set-level mean of every rated log (null when nothing is rated).
    // Sessions are the unit (multiple sessions may share a day key — ties
    // break by session start, so a two-a-day reads as two honest points).
    const effortBySession = new Map<
      string,
      { day: string; startedAt: Date; sum: number; rated: number }
    >()
    let effortSum = 0
    let effortRated = 0
    for (const l of logs) {
      if (l.rpe == null) continue
      effortSum += l.rpe
      effortRated += 1
      const cur = effortBySession.get(l.sessionId)
      if (cur) {
        cur.sum += l.rpe
        cur.rated += 1
      } else {
        effortBySession.set(l.sessionId, {
          day: dayKey(l.session.startedAt),
          startedAt: l.session.startedAt,
          sum: l.rpe,
          rated: 1,
        })
      }
    }
    const effort = {
      series: [...effortBySession.values()]
        .sort((a, b) =>
          a.day === b.day ? a.startedAt.getTime() - b.startedAt.getTime() : a.day < b.day ? -1 : 1
        )
        .map((v) => ({ day: v.day, avgRpe: round1(v.sum / v.rated), ratedSets: v.rated })),
      windowAvg: effortRated > 0 ? round1(effortSum / effortRated) : null,
    }

    const entries = [...groups.entries()].map(([key, g]) => {
      // Per-session top set (best e1rm of that session; ties → latest log).
      // R68 — loaded sets outside Epley's 1-12 rep domain never win a top-set
      // and never enter the trend (their inflated e1RM is the poison); they
      // are FILTERED here, not zeroed. Unloaded rows stay: their 0 is honest
      // and they carry the bodyweight-only track that judges reps, not load.
      const bySession = new Map<string, Row>()
      for (const r of g.rows) {
        if (r.weightKg > 0 && !validE1rmSet(r.reps, r.weightKg)) continue
        const cur = bySession.get(r.sessionId)
        if (!cur || r.e1rm > cur.e1rm || (r.e1rm === cur.e1rm && r.createdAt >= cur.createdAt)) {
          bySession.set(r.sessionId, r)
        }
      }
      // Chronological per-session trend (day asc; same-day ties by log time)
      const trendRows = [...bySession.values()].sort((a, b) =>
        a.day === b.day ? a.createdAt.getTime() - b.createdAt.getTime() : a.day < b.day ? -1 : 1
      )
      const lastLog = g.rows[g.rows.length - 1] // latest individual log

      let best = trendRows[0] ?? null
      for (const r of trendRows) if (r.e1rm > (best?.e1rm ?? 0)) best = r

      const mapped = mapExerciseToMuscles(g.displayName)
      const isLower = (mapped?.primary ?? []).some((m) => LOWER_MUSCLES.has(m))
      const suggestion = suggest(
        trendRows.map((r) => ({ day: r.day, e1rm: r.e1rm, weightKg: r.weightKg, reps: r.reps, lastRir: r.lastRir ?? null })),
        isLower
      )

      // ── R34-a · per-exercise effort stats ──────────────────────────────────
      // avgRpe/ratedCount describe the window's rated logs; rpeTrend is the
      // per-session mean RPE (day asc, RATED sessions only) so the client can
      // draw a mini effort trend beside the e1RM trend. Window-bounded by
      // construction — the exact discipline `trend` follows.
      const ratedRows = g.rows.filter((r) => r.rpe != null)
      const ratedCount = ratedRows.length
      const avgRpe = ratedCount > 0 ? round1(ratedRows.reduce((a, r) => a + (r.rpe ?? 0), 0) / ratedCount) : null
      const rpeBySession = new Map<
        string,
        { day: string; createdAt: Date; sum: number; rated: number }
      >()
      for (const r of ratedRows) {
        const cur = rpeBySession.get(r.sessionId)
        if (cur) {
          cur.sum += r.rpe ?? 0
          cur.rated += 1
        } else {
          rpeBySession.set(r.sessionId, { day: r.day, createdAt: r.createdAt, sum: r.rpe ?? 0, rated: 1 })
        }
      }
      const rpeTrend = [...rpeBySession.values()]
        .sort((a, b) =>
          a.day === b.day ? a.createdAt.getTime() - b.createdAt.getTime() : a.day < b.day ? -1 : 1
        )
        .map((v) => ({ day: v.day, avgRpe: round1(v.sum / v.rated), ratedSets: v.rated }))

      return {
        name: g.displayName,
        type: g.type,
        sessions: trendRows.length,
        firstDay: trendRows[0]?.day ?? null,
        lastDay: trendRows[trendRows.length - 1]?.day ?? null,
        lastLog: {
          day: lastLog.day,
          sets: lastLog.sets,
          reps: lastLog.reps,
          weightKg: lastLog.weightKg,
          durationMin: lastLog.durationMin,
          e1rm: lastLog.e1rm,
        },
        bestE1rm: best?.e1rm ?? 0,
        bestE1rmDay: best && best.e1rm > 0 ? best.day : null,
        // extras (sets/reps/weightKg) let clients render top-set context per session
        trend: trendRows.map((r) => ({
          day: r.day,
          e1rm: r.e1rm,
          sets: r.sets,
          reps: r.reps,
          weightKg: r.weightKg,
        })),
        suggestion,
        // R34-a — effort ledger extras (additive; null/empty when nothing rated)
        avgRpe,
        ratedCount,
        rpeTrend,
        // key echoed for cheap client-side matching
        key,
      }
    })

    entries.sort((a, b) => {
      const ld = (b.lastDay ?? "").localeCompare(a.lastDay ?? "")
      return ld !== 0 ? ld : a.name.localeCompare(b.name)
    })

    // effort rides alongside entries — additive, existing consumers ignore it
    return NextResponse.json({ entries, effort })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/progression", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
