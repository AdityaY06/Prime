import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { gateById } from "@/lib/gates"
import {
  applyXp,
  dayKeyIn,
  exerciseXp,
  rankForLevel,
  sessionXp,
  STAT_POINTS_PER_LEVEL,
  STAT_POINTS_PER_RANK,
} from "@/lib/game"
import { checkAchievements, requireHunter, sessionDTO, syncQuests } from "@/lib/engine"
import { essenceForGateClear, relicMultForType, resolveRelicMults } from "@/lib/relics"
import { riftEffectiveMult, riftOfTheDay, RIFT_ESSENCE_BONUS } from "@/lib/rift"
import { ascensionXpMult } from "@/lib/ascension"
import { formatDistance } from "@/lib/sensors/gps-route"

export const dynamic = "force-dynamic"

// ─── /api/gps-log — the ROUTE RECORDER's commit path (R21-c) ──────────────────
// POST { startedAt: ISO string, durationMin: 1–600, distanceM: 10–100000,
//        paceLabel: "5:41 / KM" }  → ONE db.$transaction creating:
//   · WorkoutSession  gateId "gale-fields" (the REAL cardio gate — it exists
//     in lib/gates.ts, so "import" was rejected; an outdoor run clears the
//     same gate a console cardio raid would), gateName "GPS Route",
//     status "cleared", endedAt = startedAt + durationMin
//   · ExerciseLog     type "cardio", durationMin, xpValue = relic-adjusted
//     exerciseXp — distance + pace live in NOTES (ExerciseLog has no distance
//     column; notes are the honest carrier, same surface the CSV export reads)
//   · XpEvent         source "gps" — a NEW ledger source, deliberately not
//     "import": every existing consumer (history/chronicle/heatmap) sums
//     amounts without filtering by source, and only the "bonus"-source
//     dedup checks exist, so "gps" is additive-safe and self-documenting
//   · hunter aggregate update mirroring the sessions/[id] complete handler's
//     awarding math EXACTLY where importable: exerciseXp call shape (add-log),
//     relic per-type multiplier, sessionXp(…, riftEffectiveMult(gate, enteredDay))
//     including the +25 clear bonus, essenceForGateClear + rift essence bonus,
//     and grantXp's level math (applyXp + ascension multiplier + rank-up stat
//     points) applied inline — grantXp itself CANNOT run inside the mandated
//     single transaction (it writes through the global db client), so its
//     math is mirrored, not called. Quest sync + achievement checks run
//     AFTER the transaction commits (grantXp runs them post-award too).
//     Deliberately NOT mirrored (documented divergences): boss-raid slaying
//     (a console-raid mechanic — a GPS import never slays the weekly boss),
//     personal records (GPS Route is a composite outdoor activity, not a
//     per-exercise-name PR surface), and streak touch (touchStreak is a
//     private engine helper; GPS logs arrive on an already-active day).

const GATE_ID = "gale-fields"
const GATE_NAME = "GPS Route"
const MIN_DURATION_MIN = 1
const MAX_DURATION_MIN = 600
const MIN_DISTANCE_M = 10
const MAX_DISTANCE_M = 100000

export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()

    const body = (await req.json().catch(() => null)) as {
      startedAt?: unknown
      durationMin?: unknown
      distanceM?: unknown
      paceLabel?: unknown
    } | null
    if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 })

    const startedAtMs = typeof body.startedAt === "string" ? Date.parse(body.startedAt) : Number.NaN
    if (!Number.isFinite(startedAtMs)) {
      return NextResponse.json({ error: "INVALID_STARTED_AT" }, { status: 400 })
    }
    const startedAt = new Date(startedAtMs)

    const durationMin = Math.round(Number(body.durationMin))
    if (!Number.isFinite(durationMin) || durationMin < MIN_DURATION_MIN || durationMin > MAX_DURATION_MIN) {
      return NextResponse.json({ error: "DURATION_OUT_OF_RANGE" }, { status: 400 })
    }

    const distanceM = Math.round(Number(body.distanceM))
    if (!Number.isFinite(distanceM) || distanceM < MIN_DISTANCE_M || distanceM > MAX_DISTANCE_M) {
      return NextResponse.json({ error: "DISTANCE_OUT_OF_RANGE" }, { status: 400 })
    }

    // paceLabel is display-only prose for the log notes — clamp it hard
    const paceLabel =
      typeof body.paceLabel === "string" && body.paceLabel.trim() !== "" ? body.paceLabel.trim().slice(0, 16) : "—"

    const stats = { str: hunter.str, vit: hunter.vit, endur: hunter.endur, agi: hunter.agi, flex: hunter.flex }
    const gate = gateById(GATE_ID)
    // R38 — the day a GPS raid counts for rolls with the hunter's timezone.
    const enteredDay = dayKeyIn(hunter.timezone, startedAt)

    const distanceLabel = formatDistance(distanceM)
    const notes = `${distanceLabel} · ${paceLabel}`

    const result = await db.$transaction(async (tx) => {
      // ── log XP: the exact add-log call shape (cardio: minutes × AGI/END scaling)
      const baseLogXp = exerciseXp("cardio", 1, 0, 0, durationMin, stats)

      // ── forge relic multipliers (per-type), read inside the transaction
      const relics = await tx.relic.findMany({ where: { hunterId: hunter.id }, select: { code: true } })
      const mults = resolveRelicMults(new Set(relics.map((r) => r.code)))
      const logXp = Math.round(baseLogXp * relicMultForType("cardio", mults))

      // ── session XP: (sum + clear bonus) × gate mult (rift surge included)
      const rift = riftOfTheDay(enteredDay)
      const isRift = gate?.id === rift.gateId
      const xp = sessionXp(
        [{ type: "cardio", sets: 1, reps: 0, weightKg: 0, durationMin, xpValue: logXp }],
        riftEffectiveMult(gate, enteredDay),
      )

      // ── essence: gate-clear formula + rift bonus (complete-handler shape)
      const essence = essenceForGateClear(xp, hunter.streak, 0) + (isRift ? RIFT_ESSENCE_BONUS : 0)

      // ── the session: complete-on-arrival, volume-free, PR-free (honest)
      const session = await tx.workoutSession.create({
        data: {
          hunterId: hunter.id,
          gateId: GATE_ID,
          gateName: GATE_NAME,
          status: "cleared",
          startedAt,
          endedAt: new Date(startedAt.getTime() + durationMin * 60000),
          xpEarned: xp,
          durationMin,
          volumeKg: 0,
          prCount: 0,
        },
      })

      // ── the log: distance + pace ride the notes (no distance column exists)
      const log = await tx.exerciseLog.create({
        data: {
          sessionId: session.id,
          name: GATE_NAME,
          type: "cardio",
          sets: 1,
          reps: 0,
          weightKg: 0,
          durationMin,
          xpValue: logXp,
          notes,
        },
      })

      // ── hunter aggregates + level math — grantXp mirrored inline
      const granted = Math.round(xp * ascensionXpMult(hunter.ascension))
      const { level, xp: carriedXp, levelUps } = applyXp(hunter.level, hunter.xp, granted)
      const rankUp = rankForLevel(level).rank !== rankForLevel(hunter.level).rank && levelUps > 0
      const statPointsGained = levelUps * STAT_POINTS_PER_LEVEL + (rankUp ? STAT_POINTS_PER_RANK : 0)

      await tx.hunter.update({
        where: { id: hunter.id },
        data: {
          level,
          xp: carriedXp,
          totalXp: hunter.totalXp + granted,
          statPoints: hunter.statPoints + statPointsGained,
          totalSessions: { increment: 1 },
          totalMinutes: { increment: durationMin },
          totalCardio: { increment: durationMin },
          ...(essence > 0 ? { essence: { increment: essence } } : {}),
        },
      })

      // ── the ledger entry
      await tx.xpEvent.create({
        data: {
          hunterId: hunter.id,
          amount: granted,
          source: "gps",
          note: `${GATE_NAME} · ${distanceLabel}`,
          day: dayKeyIn(hunter.timezone),
        },
      })

      return { session: { ...session, logs: [log] }, granted, levelUps, essence, isRift }
    })

    // ── post-commit sync (grantXp runs these after its award too) — best
    // effort: a failure here must not mask a committed session
    let unlockedTitles: string[] = []
    try {
      await syncQuests(hunter.id)
      unlockedTitles = await checkAchievements(hunter.id, { sessionMinutes: durationMin })
    } catch {
      // quest/achievement sync is enriching, not essential
    }

    return NextResponse.json({
      ok: true,
      session: sessionDTO(result.session),
      xp: result.granted,
      levelUps: result.levelUps,
      essenceGained: result.essence > 0 ? result.essence : undefined,
      riftBonus: result.isRift,
      unlockedTitles,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/gps-log", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
