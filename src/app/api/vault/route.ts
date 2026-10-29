import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import {
  bool,
  enumOrNull,
  floatOrNull,
  int,
  intOrNull,
  isoOrNull,
  macroSplitOrFallback,
  num,
  nutritionLogCreateData,
  str,
  toDate,
  type AnyRecord,
} from "@/lib/vault-import"

export const dynamic = "force-dynamic"

// ─── /api/vault — full backup export / import ─────────────────────────────────
// GET  → complete vault JSON v2 (hunter + all child records incl. fuel & metrics)
// POST → { data: VaultFile, confirm: true } — replaces the current hunter
//         accepts v1 (legacy, no fuel/metrics) and v2 files
// R70-c — restore fidelity: nutritionLog recreate keeps fiber/sodium/sugar
//         (was: silently dropped to the schema 0 defaults) and Hunter
//         .macroSplit threads through validated. The pure row mapping +
//         macroSplit validation live in lib/vault-import.ts so the probe can
//         lock them without a live wipe-and-recreate restore.

const VAULT_VERSION = 2
// v1 files were exported before the Fuel tab existed — they carry no
// nutritionLogs / waterLogs / bodyMetrics arrays and no body-profile fields
const ACCEPTED_VERSIONS = [1, 2]

// ── GET: export the vault ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const hunter = await requireHunter()

    const [sessions, quests, achievements, xpEvents, records, relics, briefings, restDays, bossDefeats, nutritionLogs, waterLogs, bodyMetrics] = await Promise.all([
      db.workoutSession.findMany({ where: { hunterId: hunter.id }, include: { logs: true }, orderBy: { startedAt: "asc" } }),
      db.quest.findMany({ where: { hunterId: hunter.id }, orderBy: { createdAt: "asc" } }),
      db.achievement.findMany({ where: { hunterId: hunter.id } }),
      db.xpEvent.findMany({ where: { hunterId: hunter.id }, orderBy: { createdAt: "asc" } }),
      db.personalBest.findMany({ where: { hunterId: hunter.id } }),
      db.relic.findMany({ where: { hunterId: hunter.id } }),
      db.briefing.findMany({ where: { hunterId: hunter.id } }),
      db.restDay.findMany({ where: { hunterId: hunter.id } }),
      db.bossDefeat.findMany({ where: { hunterId: hunter.id }, orderBy: { defeatedAt: "asc" } }),
      db.nutritionLog.findMany({ where: { hunterId: hunter.id }, orderBy: { createdAt: "asc" } }),
      db.waterLog.findMany({ where: { hunterId: hunter.id }, orderBy: { createdAt: "asc" } }),
      db.bodyMetric.findMany({ where: { hunterId: hunter.id }, orderBy: { day: "asc" } }),
    ])

    const vault = {
      version: VAULT_VERSION,
      app: "ascendant",
      exportedAt: new Date().toISOString(),
      hunter: { ...hunter },
      sessions: sessions.map((s) => ({
        ...s,
        logs: s.logs.map((l) => ({ ...l })),
      })),
      quests,
      achievements,
      xpEvents,
      records,
      relics,
      briefings,
      restDays,
      bossDefeats,
      nutritionLogs,
      waterLogs,
      bodyMetrics,
    }

    return NextResponse.json(vault, {
      headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="prime-vault-${new Date().toISOString().slice(0, 10)}.json"` },
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/vault", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// ── POST: import (replace) ────────────────────────────────────────────────────

const HUNTER_FIELDS = [
  "id", "name", "archetype", "equippedTitle", "level", "xp", "totalXp", "statPoints",
  "str", "vit", "endur", "agi", "flex", "streak", "bestStreak", "lastActiveDay",
  "totalSessions", "totalVolumeKg", "totalMinutes", "totalCardio", "essence", "ascension",
  "heightCm", "weightKg", "birthYear", "sex", "activityLevel", "goal", "macroSplit",
] as const

/**
 * Raw hunter row → prisma create data. R70-c: macroSplit threads through —
 * only a known preset id restores (macroSplitOrFallback); junk / missing /
 * v1 files keep the CURRENT hunter's value (`currentMacroSplit`, read before
 * the wipe) so a restore never corrupts the Fuel tab's macro-split setting.
 */
function importHunterData(raw: AnyRecord, currentMacroSplit: string | null): AnyRecord {
  return {
    id: str(raw.id) || undefined,
    name: str(raw.name, "ATHLETE").slice(0, 24) || "ATHLETE",
    archetype: str(raw.archetype, "vanguard"),
    equippedTitle: str(raw.equippedTitle) || null,
    level: Math.max(1, int(raw.level, 1)),
    xp: Math.max(0, int(raw.xp)),
    totalXp: Math.max(0, int(raw.totalXp)),
    statPoints: Math.max(0, int(raw.statPoints)),
    str: int(raw.str, 12),
    vit: int(raw.vit, 12),
    endur: int(raw.endur, 12),
    agi: int(raw.agi, 12),
    flex: int(raw.flex, 12),
    streak: Math.max(0, int(raw.streak)),
    bestStreak: Math.max(0, int(raw.bestStreak)),
    lastActiveDay: str(raw.lastActiveDay) || null,
    totalSessions: Math.max(0, int(raw.totalSessions)),
    totalVolumeKg: Math.max(0, num(raw.totalVolumeKg)),
    totalMinutes: Math.max(0, int(raw.totalMinutes)),
    totalCardio: Math.max(0, int(raw.totalCardio)),
    essence: Math.max(0, int(raw.essence)),
    ascension: Math.max(0, int(raw.ascension)),
    // body profile (Fuel tab) — v1 files simply import as null
    heightCm: floatOrNull(raw.heightCm),
    weightKg: floatOrNull(raw.weightKg),
    birthYear: intOrNull(raw.birthYear),
    sex: enumOrNull(raw.sex, ["male", "female"]),
    activityLevel: enumOrNull(raw.activityLevel, ["sedentary", "light", "moderate", "active", "very"]),
    goal: enumOrNull(raw.goal, ["cut", "maintain", "bulk"]),
    // R70-c — macroSplit: a known preset id restores; anything else (junk /
    // missing / v1) keeps the current hunter's value — never corrupt
    macroSplit: macroSplitOrFallback(raw.macroSplit, currentMacroSplit),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { data?: unknown; confirm?: unknown } | null
    if (!body || body.confirm !== true || !body.data || typeof body.data !== "object") {
      return NextResponse.json({ error: "CONFIRM_REQUIRED" }, { status: 400 })
    }
    const v = body.data as AnyRecord
    const fileVersion = int(v.version, 0)
    if (!ACCEPTED_VERSIONS.includes(fileVersion) || v.app !== "ascendant" || !v.hunter || typeof v.hunter !== "object") {
      return NextResponse.json({ error: "INVALID_VAULT_FILE" }, { status: 400 })
    }

    const hunter = await requireHunter()
    // R70-c — read the live macroSplit BEFORE the wipe: importHunterData's
    // fallback for a file that predates / corrupts the field
    const hunterData = importHunterData(v.hunter as AnyRecord, hunter.macroSplit)
    const finalHunterId = typeof hunterData.id === "string" && hunterData.id.length > 4 ? hunterData.id : hunter.id
    hunterData.id = finalHunterId

    // sanitize child arrays
    const sessions = Array.isArray(v.sessions) ? (v.sessions as AnyRecord[]) : []
    const quests = Array.isArray(v.quests) ? (v.quests as AnyRecord[]) : []
    const achievements = Array.isArray(v.achievements) ? (v.achievements as AnyRecord[]) : []
    const xpEvents = Array.isArray(v.xpEvents) ? (v.xpEvents as AnyRecord[]) : []
    const records = Array.isArray(v.records) ? (v.records as AnyRecord[]) : []
    const relics = Array.isArray(v.relics) ? (v.relics as AnyRecord[]) : []
    const briefings = Array.isArray(v.briefings) ? (v.briefings as AnyRecord[]) : []
    const restDays = Array.isArray(v.restDays) ? (v.restDays as AnyRecord[]) : []
    const bossDefeats = Array.isArray(v.bossDefeats) ? (v.bossDefeats as AnyRecord[]) : []
    const nutritionLogs = Array.isArray(v.nutritionLogs) ? (v.nutritionLogs as AnyRecord[]) : []
    const waterLogs = Array.isArray(v.waterLogs) ? (v.waterLogs as AnyRecord[]) : []
    const bodyMetrics = Array.isArray(v.bodyMetrics) ? (v.bodyMetrics as AnyRecord[]) : []

    // count before replacing (for the response summary)
    const sessionCount = sessions.length
    const logCount = sessions.reduce((acc, s) => acc + (Array.isArray(s.logs) ? (s.logs as unknown[]).length : 0), 0)

    await db.$transaction(async (tx) => {
      // wipe current hunter + children (FK-safe order; cascades cover the rest)
      await tx.exerciseLog.deleteMany({ where: { session: { hunterId: hunter.id } } })
      await tx.workoutSession.deleteMany({ where: { hunterId: hunter.id } })
      await tx.quest.deleteMany({ where: { hunterId: hunter.id } })
      await tx.achievement.deleteMany({ where: { hunterId: hunter.id } })
      await tx.xpEvent.deleteMany({ where: { hunterId: hunter.id } })
      await tx.relic.deleteMany({ where: { hunterId: hunter.id } })
      await tx.personalBest.deleteMany({ where: { hunterId: hunter.id } })
      await tx.briefing.deleteMany({ where: { hunterId: hunter.id } })
      await tx.restDay.deleteMany({ where: { hunterId: hunter.id } })
      await tx.bossDefeat.deleteMany({ where: { hunterId: hunter.id } })
      await tx.nutritionLog.deleteMany({ where: { hunterId: hunter.id } })
      await tx.waterLog.deleteMany({ where: { hunterId: hunter.id } })
      await tx.bodyMetric.deleteMany({ where: { hunterId: hunter.id } })
      await tx.hunter.delete({ where: { id: hunter.id } })

      // recreate hunter
      await tx.hunter.create({ data: hunterData as never })

      // sessions + their logs
      for (const s of sessions) {
        const logs = Array.isArray(s.logs) ? (s.logs as AnyRecord[]) : []
        await tx.workoutSession.create({
          data: {
            id: str(s.id) || undefined,
            hunterId: finalHunterId,
            gateId: str(s.gateId, "unknown"),
            gateName: str(s.gateName, "Unknown Training"),
            status: str(s.status, "cleared"),
            startedAt: toDate(s.startedAt),
            endedAt: isoOrNull(s.endedAt) ? toDate(s.endedAt) : null,
            xpEarned: Math.max(0, int(s.xpEarned)),
            durationMin: Math.max(0, int(s.durationMin)),
            volumeKg: Math.max(0, num(s.volumeKg)),
            prCount: Math.max(0, int(s.prCount)),
            createdAt: toDate(s.createdAt),
          },
        })
        for (const l of logs) {
          await tx.exerciseLog.create({
            data: {
              id: str(l.id) || undefined,
              sessionId: str(s.id),
              name: str(l.name, "Exercise").slice(0, 60),
              type: str(l.type, "bodyweight"),
              sets: Math.max(1, int(l.sets, 1)),
              reps: Math.max(0, int(l.reps)),
              weightKg: Math.max(0, num(l.weightKg)),
              durationMin: Math.max(0, int(l.durationMin)),
              xpValue: Math.max(0, int(l.xpValue)),
              createdAt: toDate(l.createdAt),
            },
          })
        }
      }

      // quests
      for (const q of quests) {
        await tx.quest.create({
          data: {
            id: str(q.id) || undefined,
            hunterId: finalHunterId,
            kind: str(q.kind, "daily"),
            code: str(q.code, "unknown"),
            title: str(q.title, "Goal").slice(0, 80),
            description: str(q.description).slice(0, 300),
            metric: str(q.metric, "sessions"),
            target: Math.max(1, int(q.target, 1)),
            progress: Math.max(0, int(q.progress)),
            xpReward: Math.max(0, int(q.xpReward)),
            statReward: str(q.statReward) || null,
            pointReward: Math.max(0, int(q.pointReward)),
            claimed: bool(q.claimed),
            completedAt: isoOrNull(q.completedAt) ? toDate(q.completedAt) : null,
            day: str(q.day) || null,
            failed: bool(q.failed),
            createdAt: toDate(q.createdAt),
          },
        })
      }

      // achievements
      for (const a of achievements) {
        await tx.achievement.create({
          data: {
            id: str(a.id) || undefined,
            hunterId: finalHunterId,
            code: str(a.code, "unknown"),
            unlockedAt: toDate(a.unlockedAt),
          },
        })
      }

      // xp ledger
      for (const x of xpEvents) {
        await tx.xpEvent.create({
          data: {
            id: str(x.id) || undefined,
            hunterId: finalHunterId,
            amount: int(x.amount),
            source: str(x.source, "bonus"),
            note: str(x.note) || null,
            day: str(x.day, new Date().toISOString().slice(0, 10)),
            createdAt: toDate(x.createdAt),
          },
        })
      }

      // personal records
      for (const r of records) {
        await tx.personalBest.create({
          data: {
            id: str(r.id) || undefined,
            hunterId: finalHunterId,
            name: str(r.name, "unknown").slice(0, 80),
            displayName: str(r.displayName, "Unknown").slice(0, 80),
            type: str(r.type, "bodyweight"),
            bestValue: Math.max(0, num(r.bestValue)),
            unit: str(r.unit, "reps"),
            context: str(r.context) || null,
            achievedAt: toDate(r.achievedAt),
            updatedAt: toDate(r.updatedAt),
          },
        })
      }

      // relics
      for (const r of relics) {
        await tx.relic.create({
          data: {
            id: str(r.id) || undefined,
            hunterId: finalHunterId,
            code: str(r.code, "unknown"),
            charges: Math.max(0, int(r.charges, 1)),
            acquiredAt: toDate(r.acquiredAt),
          },
        })
      }

      // briefings
      for (const b of briefings) {
        await tx.briefing.create({
          data: {
            id: str(b.id) || undefined,
            hunterId: finalHunterId,
            day: str(b.day, new Date().toISOString().slice(0, 10)),
            text: str(b.text).slice(0, 4000),
            createdAt: toDate(b.createdAt),
          },
        })
      }

      // sanctified rest days
      for (const r of restDays) {
        await tx.restDay.create({
          data: {
            id: str(r.id) || undefined,
            hunterId: finalHunterId,
            day: str(r.day, new Date().toISOString().slice(0, 10)),
            createdAt: toDate(r.createdAt),
          },
        })
      }

      // boss raid kills
      for (const b of bossDefeats) {
        await tx.bossDefeat.create({
          data: {
            id: str(b.id) || undefined,
            hunterId: finalHunterId,
            bossCode: str(b.bossCode, "unknown"),
            weekStart: str(b.weekStart, new Date().toISOString().slice(0, 10)),
            damage: Math.max(0, int(b.damage)),
            defeatedAt: toDate(b.defeatedAt),
          },
        })
      }

      // fuel — food entries (macros already multiplied by qty at log time).
      // R70-c — mapping extracted to lib/vault-import.ts nutritionLogCreateData:
      // fiber/sodium/sugar now restore (Number() coercion, 0 fallback — v1
      // files predate the micro columns, absent = untracked then, 0 is honest;
      // they previously fell to the schema defaults silently).
      for (const n of nutritionLogs) {
        await tx.nutritionLog.create({
          data: nutritionLogCreateData(n, finalHunterId, new Date().toISOString().slice(0, 10)),
        })
      }

      // fuel — water entries (ml, negatives allowed for undo)
      for (const w of waterLogs) {
        await tx.waterLog.create({
          data: {
            id: str(w.id) || undefined,
            hunterId: finalHunterId,
            day: str(w.day, new Date().toISOString().slice(0, 10)),
            ml: int(w.ml),
            createdAt: toDate(w.createdAt),
          },
        })
      }

      // body metrics — latest-wins per (day,type); unique constraint may collide
      // on malformed files so each row falls back to an upsert
      for (const m of bodyMetrics) {
        const day = str(m.day, new Date().toISOString().slice(0, 10))
        const type = str(m.type, "weight").slice(0, 32)
        await tx.bodyMetric.upsert({
          where: { hunterId_day_type: { hunterId: finalHunterId, day, type } },
          create: {
            id: str(m.id) || undefined,
            hunterId: finalHunterId,
            day,
            type,
            value: Math.max(0, num(m.value)),
            unit: str(m.unit, "kg").slice(0, 16),
            createdAt: toDate(m.createdAt),
          },
          update: {
            value: Math.max(0, num(m.value)),
            unit: str(m.unit, "kg").slice(0, 16),
          },
        })
      }
    })

    return NextResponse.json({
      ok: true,
      version: fileVersion,
      summary: {
        name: hunterData.name as string,
        level: hunterData.level as number,
        sessions: sessionCount,
        logs: logCount,
        quests: quests.length,
        records: records.length,
        meals: nutritionLogs.length,
        waterEntries: waterLogs.length,
        bodyMetrics: bodyMetrics.length,
      },
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("POST /api/vault", e)
    return NextResponse.json({ error: "IMPORT_FAILED" }, { status: 500 })
  }
}
