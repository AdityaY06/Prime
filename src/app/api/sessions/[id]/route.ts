import { NextResponse } from "next/server"
import type { ExerciseLog, WorkoutSession } from "@prisma/client"
import { db } from "@/lib/db"
import { gateById } from "@/lib/gates"
import { dayKeyIn, exerciseXp, sessionVolume, sessionXp, weekStartKeyIn, type ExerciseType } from "@/lib/game"
import { checkAchievements, checkPersonalRecord, grantXp, ownedRelicCodes, requireHunter, sessionDTO } from "@/lib/engine"
import { essenceForGateClear, relicMultForType, resolveRelicMults } from "@/lib/relics"
import { riftEffectiveMult, riftOfTheDay, RIFT_ESSENCE_BONUS } from "@/lib/rift"
import { BOSS_XP_REWARD_RATIO, bossHpForLevel, bossOfTheWeek, enrageFor } from "@/lib/bosses"

export const dynamic = "force-dynamic"

const EXERCISE_TYPES: ExerciseType[] = ["strength", "bodyweight", "cardio", "mobility"]

async function loadSession(hunterId: string, id: string) {
  const s = await db.workoutSession.findFirst({
    where: { id, hunterId },
    include: { logs: { orderBy: { createdAt: "asc" } } },
  })
  return s
}

// ── R17-D: Strong-style set notes ─────────────────────────────────────────
// Optional free-form text on a log. parseNotes mirrors the rawRir defensive
// pattern used below: null/undefined/"" (or whitespace-only) → null (not
// captured — the column stays nullable for legacy rows); anything else is
// stringified, trimmed and clamped to 200 chars server-side. The client caps
// its textarea at 140 — the headroom tolerates other producers.
function parseNotes(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  return s === "" ? null : s.slice(0, 200)
}

// ── R32-a: Borg CR10 effort rating (1-10) — PERSISTENCE of R30-a's ────────
// client-side RPE stepper. parseRpe mirrors the rawRir defensive idiom
// exactly, on the 1-10 scale: null/undefined/"" (or whitespace-only) → null
// (not captured — the column stays nullable for legacy rows); anything else
// is Math.floor'd and clamped into [1,10]. Semantics of the clamp edges,
// deliberately chosen and mirrored from rir: fractional input floors DOWN
// (7.9 → 7 — the honest integer the rater approached from); numeric garbage
// (Number() → NaN → ||0 → 0) and negatives clamp UP to 1 (the scale's easy
// floor), oversized values clamp DOWN to 10 — a mid-workout capture never
// 400s, it lands on the nearest honest anchor, exactly like rir's garbage → 0.
function parseRpe(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null
  return Math.max(1, Math.min(10, Math.floor(Number(raw)) || 0))
}

// R17-D: engine's shared sessionDTO predates the notes column and strips it
// from log rows. This wrapper re-attaches each log's notes on the wire (same
// row shape + one additive field, index-aligned because sessionDTO maps
// s.logs in order) so the raid console's edit path can prefill and future row
// rendering can consume it. engine.ts is shared and outside this route's
// ownership — the wrapper keeps every response from this file notes-aware.
// (R32-a: rpe now rides sessionDTO NATIVELY — engine.ts was this round's file
// to touch — so the wrapper spreads it through dto.logs[i] unchanged.)
function sessionWithNotes(s: WorkoutSession & { logs: ExerciseLog[] }) {
  const dto = sessionDTO(s)
  return { ...dto, logs: s.logs.map((l, i) => ({ ...dto.logs[i], notes: l.notes })) }
}

// POST /api/sessions/[id] — { action: 'add-log' | 'update-log' | 'remove-log' | 'complete' | 'abandon', ... }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const hunter = await requireHunter()
    const { id } = await params
    const body = await req.json()
    const action = String(body?.action ?? "")

    const session = await loadSession(hunter.id, id)
    if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 })

    // ── add-log ────────────────────────────────────────────────────────────────
    if (action === "add-log") {
      if (session.status !== "active") return NextResponse.json({ error: "Session is closed." }, { status: 400 })

      const name = String(body?.name ?? "").trim()
      const type = String(body?.type ?? "bodyweight") as ExerciseType
      const sets = Math.max(1, Math.min(50, Math.floor(Number(body?.sets ?? 1)) || 1))
      const reps = Math.max(0, Math.min(2000, Math.floor(Number(body?.reps ?? 0)) || 0))
      const weightKg = Math.max(0, Math.min(500, Number(body?.weightKg ?? 0)) || 0)
      const durationMin = Math.max(0, Math.min(300, Math.floor(Number(body?.durationMin ?? 0)) || 0))
      // Optional reps-in-reserve at the final set (0 = nothing left, 5 = easy).
      // Null/absent = not captured — the column stays nullable for legacy rows.
      const rawRir = body?.rir
      const rir =
        rawRir === null || rawRir === undefined || rawRir === "" ? null : Math.max(0, Math.min(5, Math.floor(Number(rawRir)) || 0))
      // R32-a: optional Borg CR10 effort rating (1-10) — see parseRpe above.
      // Absent on the add path (the dialog has no RPE input) → stored null.
      const rpe = parseRpe(body?.rpe)
      // R17-D: optional Strong-style set notes (see parseNotes above).
      const notes = parseNotes(body?.notes)

      if (name.length < 2) return NextResponse.json({ error: "Exercise name too short." }, { status: 400 })
      if (!EXERCISE_TYPES.includes(type)) return NextResponse.json({ error: "Unknown exercise type." }, { status: 400 })
      if (type === "cardio" || type === "mobility") {
        if (durationMin < 1 && reps < 1) return NextResponse.json({ error: "Log minutes or reps." }, { status: 400 })
      } else if (reps < 1) {
        return NextResponse.json({ error: "Log at least 1 rep." }, { status: 400 })
      }

      const baseXp = exerciseXp(type, sets, reps, weightKg, durationMin, {
        str: hunter.str,
        vit: hunter.vit,
        endur: hunter.endur,
        agi: hunter.agi,
        flex: hunter.flex,
      })

      // Personal record check — bonus XP is baked into the log on a new record
      const { pr, bonusXp } = await checkPersonalRecord(
        hunter.id, session.id, name, type, sets, reps, weightKg, durationMin, baseXp
      )
      const xpValue = baseXp + bonusXp

      await db.exerciseLog.create({
        data: { sessionId: session.id, name, type, sets, reps, weightKg, durationMin, xpValue, rir, rpe, notes },
      })

      const refreshed = await loadSession(hunter.id, id)
      return NextResponse.json({ session: sessionWithNotes(refreshed!), pr })
    }

    // ── update-log ─────────────────────────────────────────────────────────
    // R13-a: mid-workout correction of a mislogged set — an in-place update
    // that keeps the log's id, its createdAt ordering and any baked
    // session.prCount history intact (so it never surfaces as a "fresh log"
    // to the client's PR-banner / rest-timer watcher).
    if (action === "update-log") {
      if (session.status !== "active") return NextResponse.json({ error: "Session is closed." }, { status: 400 })
      const logId = String(body?.logId ?? "")
      // scoped to the session for free — loadSession includes its logs
      const existing = session.logs.find((l) => l.id === logId)
      if (!existing) return NextResponse.json({ error: "Log entry not found." }, { status: 404 })

      // validated exactly like add-log (same clamps, same per-type minimums)
      const name = String(body?.name ?? "").trim()
      const type = String(body?.type ?? "bodyweight") as ExerciseType
      const sets = Math.max(1, Math.min(50, Math.floor(Number(body?.sets ?? 1)) || 1))
      const reps = Math.max(0, Math.min(2000, Math.floor(Number(body?.reps ?? 0)) || 0))
      const weightKg = Math.max(0, Math.min(500, Number(body?.weightKg ?? 0) || 0))
      const durationMin = Math.max(0, Math.min(300, Math.floor(Number(body?.durationMin ?? 0)) || 0))
      const rawRir = body?.rir
      const rir =
        rawRir === null || rawRir === undefined || rawRir === "" ? null : Math.max(0, Math.min(5, Math.floor(Number(rawRir)) || 0))
      // R32-a RPE PATCH semantics — deliberately DIVERGES from rir above:
      // rir nulls when the field is omitted (its R19-d capture leg always
      // sends it), but rpe follows the R17-D notes precedent — field OMITTED
      // keeps the stored rating; explicit null (or "") clears it. Why the
      // divergence: the edit dialog PATCHes without an RPE field (its sheet
      // has no RPE input — it must not fabricate or echo one) and legacy
      // captureRir calls send rir only; under rir's null-on-omit rule every
      // such call would silently destroy a stored rating. The raid console's
      // RPE stepper leg ALWAYS sends both rir and rpe together, so the
      // invariant "capturing RIR must never wipe stored RPE and vice versa"
      // holds on every client leg.
      const rawRpe = body?.rpe
      const rpePatch = rawRpe === undefined ? {} : { rpe: parseRpe(rawRpe) }
      // R17-D notes PATCH semantics — undefined (field omitted) KEEPS the
      // stored notes; null or "" clears them. Deliberate divergence from
      // rir above (which nulls on omit): typed notes are expensive to
      // re-enter, so a client that omits the field must not silently destroy
      // them. The dialog always sends notes explicitly, so this only shields
      // legacy/other producers.
      const rawNotes = body?.notes
      const notesPatch = rawNotes === undefined ? {} : { notes: parseNotes(rawNotes) }

      if (name.length < 2) return NextResponse.json({ error: "Exercise name too short." }, { status: 400 })
      if (!EXERCISE_TYPES.includes(type)) return NextResponse.json({ error: "Unknown exercise type." }, { status: 400 })
      if (type === "cardio" || type === "mobility") {
        if (durationMin < 1 && reps < 1) return NextResponse.json({ error: "Log minutes or reps." }, { status: 400 })
      } else if (reps < 1) {
        return NextResponse.json({ error: "Log at least 1 rep." }, { status: 400 })
      }

      // base XP recomputed fresh with the hunter's CURRENT stats (same call
      // shape as add-log). checkPersonalRecord is deliberately NOT re-run:
      // the PR bonus XP is a one-time mint on add — an edit recomputes the
      // base leg only and lets the already-awarded bonus stand.
      const baseXp = exerciseXp(type, sets, reps, weightKg, durationMin, {
        str: hunter.str,
        vit: hunter.vit,
        endur: hunter.endur,
        agi: hunter.agi,
        flex: hunter.flex,
      })

      await db.exerciseLog.update({
        where: { id: logId },
        data: { name, type, sets, reps, weightKg, durationMin, rir, xpValue: baseXp, ...notesPatch, ...rpePatch },
      })

      const refreshed = await loadSession(hunter.id, id)
      return NextResponse.json({ session: sessionWithNotes(refreshed!) })
    }

    // ── remove-log ─────────────────────────────────────────────────────────────
    if (action === "remove-log") {
      if (session.status !== "active") return NextResponse.json({ error: "Session is closed." }, { status: 400 })
      const logId = String(body?.logId ?? "")
      await db.exerciseLog.deleteMany({ where: { id: logId, sessionId: session.id } })
      const refreshed = await loadSession(hunter.id, id)
      return NextResponse.json({ session: sessionWithNotes(refreshed!) })
    }

    // ── abandon ────────────────────────────────────────────────────────────────
    if (action === "abandon") {
      if (session.status !== "active") return NextResponse.json({ error: "Session is closed." }, { status: 400 })
      const updated = await db.workoutSession.update({
        where: { id: session.id },
        data: { status: "abandoned", endedAt: new Date() },
      })
      return NextResponse.json({ session: sessionWithNotes({ ...updated, logs: session.logs }) })
    }

    // ── complete ───────────────────────────────────────────────────────────────
    if (action === "complete") {
      if (session.status !== "active") return NextResponse.json({ error: "Session is closed." }, { status: 400 })
      if (session.logs.length === 0) {
        return NextResponse.json({ error: "A session cannot be completed with zero exercises." }, { status: 400 })
      }

      const gate = gateById(session.gateId)

      // Rift of the Day — surge evaluated on the day the raid was ENTERED,
      // so a raid spanning midnight keeps the rift it was opened under.
      // R38 — "the day it was entered" is the hunter's tz day (null tz = UTC).
      const enteredDay = dayKeyIn(hunter.timezone, session.startedAt)
      const rift = riftOfTheDay(enteredDay)
      const isRift = session.gateId === rift.gateId

      // Forge relic multipliers (per exercise type + global ember)
      const owned = await ownedRelicCodes(hunter.id)
      const mults = resolveRelicMults(new Set(owned.keys()))
      const relicAdjustedLogs = session.logs.map((l) => ({
        ...l,
        xpValue: Math.round(l.xpValue * relicMultForType(l.type, mults)),
      }))
      const xp = sessionXp(relicAdjustedLogs, riftEffectiveMult(gate, enteredDay))
      const volume = sessionVolume(session.logs)

      // Aether essence: XP-scaled + streak bonus + PR bonus (+ rift bonus)
      const essenceGained = essenceForGateClear(xp, hunter.streak, session.prCount) + (isRift ? RIFT_ESSENCE_BONUS : 0)

      // ── Boss Raid check ──────────────────────────────────────────────────────
      // The boss of the week the raid was ENTERED in; a single raid inside its
      // gate dealing the boss's full (enraged) HP in XP slays it (once per week).
      // Enrage fuel is lifetime kills of THIS boss — read BEFORE the kill is
      // recorded, so it matches the HP the banner advertised all week.
      const boss = bossOfTheWeek(weekStartKeyIn(hunter.timezone, session.startedAt))
      const bossKills = await db.bossDefeat.count({
        where: { hunterId: hunter.id, bossCode: boss.code },
      })
      const enrage = enrageFor(bossKills)
      const bossHp = bossHpForLevel(hunter.level, bossKills)
      const bossEligible = session.gateId === boss.gateId && xp >= bossHp
      let bossDefeated = false
      if (bossEligible) {
        const existingKill = await db.bossDefeat.findUnique({
          where: { hunterId_weekStart: { hunterId: hunter.id, weekStart: weekStartKeyIn(hunter.timezone, session.startedAt) } },
        })
        bossDefeated = !existingKill
      }
      const bossXpBonus = bossDefeated ? Math.round(bossHp * BOSS_XP_REWARD_RATIO) : 0
      const bossEssence = bossDefeated ? enrage.essence : 0

      const now = new Date()
      const wallMinutes = Math.max(1, Math.min(180, Math.round((now.getTime() - session.startedAt.getTime()) / 60000)))
      const cardioMinutes = session.logs
        .filter((l) => l.type === "cardio")
        .reduce((acc, l) => acc + l.durationMin + Math.ceil((l.sets * l.reps) / 10), 0)
      const pushupsInSession = session.logs
        .filter((l) => l.name.toLowerCase().includes("push"))
        .reduce((acc, l) => acc + l.sets * l.reps, 0)

      const updated = await db.workoutSession.update({
        where: { id: session.id },
        data: {
          status: "cleared",
          endedAt: now,
          xpEarned: xp,
          durationMin: wallMinutes,
          volumeKg: volume,
        },
      })

      await db.hunter.update({
        where: { id: hunter.id },
        data: {
          totalSessions: { increment: 1 },
          totalVolumeKg: { increment: volume },
          totalMinutes: { increment: wallMinutes },
          totalCardio: { increment: cardioMinutes },
        },
      })

      // XP engine: levels, ranks, streak, quest sync, titles (+ essence award)
      const reward = await grantXp(
        hunter.id,
        xp + bossXpBonus,
        "gate",
        bossDefeated ? `${session.gateName} · ${boss.name} completed` : session.gateName,
        essenceGained + bossEssence
      )

      // Record the boss kill — damage = the killing raid's raw XP
      if (bossDefeated) {
        await db.bossDefeat.create({
          data: {
            hunterId: hunter.id,
            bossCode: boss.code,
            weekStart: weekStartKeyIn(hunter.timezone, session.startedAt),
            damage: xp,
          },
        })
        reward.bossDefeated = {
          code: boss.code,
          name: boss.name,
          damage: xp,
          hp: bossHp,
          xpReward: bossXpBonus,
          essenceReward: bossEssence,
          enrageLabel: enrage.tier > 0 ? enrage.label : null,
        }
      }

      // Context-sensitive title checks
      const extraTitles = await checkAchievements(hunter.id, {
        pushupsInSession,
        sessionHour: now.getHours(),
        sessionMinutes: wallMinutes,
      })
      reward.unlockedTitles = [...new Set([...reward.unlockedTitles, ...extraTitles])]

      // R1-c: Program achievement hook (export owned by R1-a's engine work) —
      // dynamically imported + guarded so a pending R1-a can never break completion.
      try {
        const { checkProgramAchievements } = await import("@/lib/engine")
        if (typeof checkProgramAchievements === "function") {
          const programTitles = await checkProgramAchievements(hunter.id)
          if (Array.isArray(programTitles) && programTitles.length > 0) {
            reward.unlockedTitles = [...new Set([...reward.unlockedTitles, ...programTitles])]
          }
        }
      } catch {
        // R1-a pending — orchestrator will verify once engine exports it
      }

      // refresh hunter DTO in case achievements changed nothing else
      const refreshed = await loadSession(hunter.id, id)

      return NextResponse.json({
        session: sessionWithNotes(refreshed!),
        reward: {
          ...reward,
          volumeKg: Math.round(volume),
          pushupsInSession,
          durationMin: wallMinutes,
          prCount: session.prCount,
          riftBonus: isRift,
        },
      })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/sessions/[id]", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
