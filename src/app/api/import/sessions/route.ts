import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import {
  applyXp,
  dayKey,
  rankForLevel,
  sessionVolume,
  STAT_POINTS_PER_LEVEL,
  STAT_POINTS_PER_RANK,
  type StatKey,
} from "@/lib/game"
import { ascensionXpMult } from "@/lib/ascension"
import {
  dedupeAgainst,
  ImportParseError,
  importTotals,
  parseWorkoutCsv,
  workoutTotals,
  type ParsedImport,
} from "@/lib/import/csv-import"

export const dynamic = "force-dynamic"

// ─── /api/import/sessions — CSV import bridge (R21-a) ─────────────────────────
// POST { csv: string, dryRun?: true } → PREVIEW ONLY, never writes.
// POST { csv: string, confirm: true } → ONE db.$transaction (vault precedent):
//   per workout → WorkoutSession (gateId "import", status "cleared",
//   xpEarned = Σ log xp, volumeKg = the app's sessionVolume, prCount 0) +
//   ExerciseLog rows (rir + notes ride along — round-trip fidelity) +
//   ONE xpEvent per session (source "import", note = workout name, day = the
//   day the workout happened) + the hunter aggregate update.
//
// HONESTY CONTRACT (mirrors the sessions/[id] complete handler where noted):
// - XP per log: the CSV's numeric XP cell (PRIME round-trip), else the REAL
//   engine formula (exerciseXp with the live hunter's stats).
// - Hunter awarding mirrors grantXp: ascension multiplier applied per
//   session, level via applyXp, statPoints via levelUps×3 + rankUp×5 — but
//   NO clear bonus (+25), NO relic/rift multipliers, NO essence, NO streak
//   touch: an import is historical backfill, not a live raid. The XP ledger
//   lands on each workout's own day so chronicle charts stay truthful.
// - Dedupe: (gateName, startedAt) already archived → skipped as
//   "ALREADY IN ARCHIVE", re-checked INSIDE the transaction — importing the
//   same file twice is a no-op.
// - Log createdAt = startedAt + i seconds → deterministic performed order.

/** Distinguishes the honest all-dupes/empty abort from a real failure. */
class ImportAbortedError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

type RouteBody = { csv?: unknown; dryRun?: unknown; confirm?: unknown }

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as RouteBody | null
    const csv = typeof body?.csv === "string" ? body.csv : null
    if (!csv || !csv.trim()) {
      return NextResponse.json({ error: "CSV_REQUIRED", reason: "NO CSV TEXT SUPPLIED" }, { status: 400 })
    }
    const dryRun = body?.dryRun === true
    const confirm = body?.confirm === true
    if (!dryRun && !confirm) {
      return NextResponse.json(
        { error: "CONFIRM_REQUIRED", reason: "PASS dryRun: true FOR A PREVIEW OR confirm: true TO COMMIT" },
        { status: 400 },
      )
    }

    const hunter = await requireHunter()
    const stats: Record<StatKey, number> = {
      str: hunter.str,
      vit: hunter.vit,
      endur: hunter.endur,
      agi: hunter.agi,
      flex: hunter.flex,
    }

    let parsed: ParsedImport
    try {
      parsed = parseWorkoutCsv(csv, { stats })
    } catch (e) {
      if (e instanceof ImportParseError) {
        return NextResponse.json({ error: "NO_SESSIONS", reason: e.reason }, { status: 400 })
      }
      throw e
    }

    // ── dry-run: preview only, NEVER writes ─────────────────────────────────
    if (dryRun) {
      const existingRows = await db.workoutSession.findMany({
        where: { hunterId: hunter.id, status: "cleared" },
        select: { gateName: true, startedAt: true },
      })
      const deduped = dedupeAgainst(
        parsed,
        existingRows.map((s) => ({ gateName: s.gateName, startedAt: s.startedAt.toISOString() })),
      )
      const totals = importTotals(deduped)
      const times = deduped.workouts.map((w) => w.startedAt).sort()
      return NextResponse.json({
        ok: true,
        totals,
        workouts: deduped.workouts.map((w) => ({
          startedAt: w.startedAt,
          gateName: w.gateName,
          ...workoutTotals(w),
        })),
        skipped: deduped.skipped.slice(0, 20),
        dateRange: { from: times[0] ?? null, to: times[times.length - 1] ?? null },
        duplicates: parsed.workouts.length - deduped.workouts.length,
      })
    }

    // ── confirm: one transaction, vault precedent ───────────────────────────
    const created = await db.$transaction(
      async (tx) => {
        // dedupe re-checked inside the transaction — a double-confirm or a
        // concurrent import can never slip a duplicate past this read
        const existingRows = await tx.workoutSession.findMany({
          where: { hunterId: hunter.id, status: "cleared" },
          select: { gateName: true, startedAt: true },
        })
        const deduped = dedupeAgainst(
          parsed,
          existingRows.map((s) => ({ gateName: s.gateName, startedAt: s.startedAt.toISOString() })),
        )
        if (deduped.workouts.length === 0) {
          throw new ImportAbortedError(
            deduped.skipped.length > 0 ? "NOTHING IMPORTABLE — ALL ROWS SKIPPED OR ALREADY IN ARCHIVE" : "NOTHING IMPORTABLE",
          )
        }

        const grantedEvents: { amount: number; note: string; day: string; createdAt: Date }[] = []
        let logsCreated = 0
        let totalVolume = 0
        let totalMinutes = 0
        let totalCardio = 0

        for (const w of deduped.workouts) {
          const started = new Date(w.startedAt)
          const logMinutes = w.logs.reduce((a, l) => a + l.durationMin, 0)
          // session duration = Σ log minutes; a "Workout Duration" column
          // stands in when per-log minutes are all zero (Strong exports)
          const sessionMinutes = logMinutes > 0 ? logMinutes : (w.durationHintMin ?? 0)
          const endedAt = sessionMinutes > 0 ? new Date(started.getTime() + sessionMinutes * 60000) : null
          const volume = sessionVolume(w.logs)
          const xp = w.logs.reduce((a, l) => a + l.xpValue, 0)

          const session = await tx.workoutSession.create({
            data: {
              hunterId: hunter.id,
              gateId: "import",
              gateName: w.gateName,
              status: "cleared",
              startedAt: started,
              endedAt,
              xpEarned: xp,
              durationMin: sessionMinutes,
              volumeKg: volume,
              prCount: 0,
            },
          })

          for (const [i, l] of w.logs.entries()) {
            await tx.exerciseLog.create({
              data: {
                sessionId: session.id,
                name: l.name,
                type: l.type,
                sets: l.sets,
                reps: l.reps,
                weightKg: l.weightKg,
                durationMin: l.durationMin,
                xpValue: l.xpValue,
                rir: l.rir,
                notes: l.notes,
                createdAt: new Date(started.getTime() + Math.min(i, 600) * 1000),
              },
            })
          }

          logsCreated += w.logs.length
          totalVolume += volume
          totalMinutes += sessionMinutes
          // cardio minutes mirror the complete handler's formula exactly
          totalCardio += w.logs
            .filter((l) => l.type === "cardio")
            .reduce((a, l) => a + l.durationMin + Math.ceil((l.sets * l.reps) / 10), 0)

          // ONE ledger row per session — ascension multiplier applied the
          // same way grantXp applies it, landed on the workout's own day
          grantedEvents.push({
            amount: Math.round(xp * ascensionXpMult(hunter.ascension)),
            note: w.gateName,
            day: dayKey(started),
            createdAt: started,
          })
        }

        // hunter aggregate — grantXp's awarding pattern, mirrored inline so
        // it lands inside the same transaction
        const grantedTotal = grantedEvents.reduce((a, e) => a + e.amount, 0)
        const oldRank = rankForLevel(hunter.level).rank
        const { level, xp, levelUps } = applyXp(hunter.level, hunter.xp, grantedTotal)
        const newRank = rankForLevel(level).rank
        const rankUp = newRank !== oldRank && levelUps > 0
        const statPoints = levelUps * STAT_POINTS_PER_LEVEL + (rankUp ? STAT_POINTS_PER_RANK : 0)

        await tx.hunter.update({
          where: { id: hunter.id },
          data: {
            level,
            xp,
            totalXp: hunter.totalXp + grantedTotal,
            statPoints: hunter.statPoints + statPoints,
            totalSessions: hunter.totalSessions + deduped.workouts.length,
            totalVolumeKg: hunter.totalVolumeKg + totalVolume,
            totalMinutes: hunter.totalMinutes + totalMinutes,
            totalCardio: hunter.totalCardio + totalCardio,
          },
        })

        for (const e of grantedEvents) {
          await tx.xpEvent.create({
            data: {
              hunterId: hunter.id,
              amount: e.amount,
              source: "import",
              note: e.note,
              day: e.day,
              createdAt: e.createdAt,
            },
          })
        }

        return { sessions: deduped.workouts.length, logs: logsCreated, xp: grantedTotal, level, levelUps }
      },
      { timeout: 30_000 },
    )

    return NextResponse.json({ ok: true, created })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    if (e instanceof ImportParseError) {
      return NextResponse.json({ error: "NO_SESSIONS", reason: e.reason }, { status: 400 })
    }
    if (e instanceof ImportAbortedError) {
      return NextResponse.json({ error: "NO_SESSIONS", reason: e.reason }, { status: 400 })
    }
    console.error("POST /api/import/sessions", e)
    return NextResponse.json({ error: "IMPORT_FAILED" }, { status: 500 })
  }
}
