// ─── ASCENDANT · Server-side game engine ──────────────────────────────────────
// All DB mutations that drive progression live here so every API route shares
// one consistent rule-set: XP → levels → ranks → quests → titles.

import { db } from "@/lib/db"
import { cookies } from "next/headers"
import {
  applyXp,
  combatPower,
  dayKeyIn,
  nextRank,
  rankForLevel,
  STAT_POINTS_PER_LEVEL,
  STAT_POINTS_PER_RANK,
  tzDayWindow,
  weekStartKeyIn,
  xpToNext,
  yesterdayKeyIn,
  type StatKey,
} from "@/lib/game"
import { CALIBRATED_DAILIES, MAIN_QUESTS, rollDailies, type QuestTemplate } from "@/lib/quests"
import { TITLES } from "@/lib/titles"
import { earnedMasteryTitleCodes } from "@/lib/mastery"
import { ascensionXpMult, earnedAscensionTitleCodes } from "@/lib/ascension"
import { earnedBossTitleCodes } from "@/lib/bosses"
import { normalizeExerciseName, prBonusXp, prMetricFor } from "@/lib/relics"
import type { ExerciseLogDTO, HunterDTO, PrInfo, QuestDTO, RewardResult } from "@/lib/types"
import type { ExerciseLog, Hunter, PersonalBest, Quest, WorkoutSession } from "@prisma/client"

// ─── DTO mappers ──────────────────────────────────────────────────────────────

export function hunterDTO(h: Hunter): HunterDTO {
  const rank = rankForLevel(h.level)
  const nr = nextRank(h.level)
  return {
    id: h.id,
    name: h.name,
    archetype: h.archetype,
    equippedTitle: h.equippedTitle,
    level: h.level,
    xp: h.xp,
    xpNeeded: xpToNext(h.level),
    totalXp: h.totalXp,
    rank: rank.rank,
    nextRank: nr?.rank ?? null,
    nextRankAt: nr?.minLevel ?? null,
    statPoints: h.statPoints,
    stats: { str: h.str, vit: h.vit, endur: h.endur, agi: h.agi, flex: h.flex },
    streak: h.streak,
    bestStreak: h.bestStreak,
    totalSessions: h.totalSessions,
    totalVolumeKg: Math.round(h.totalVolumeKg),
    totalMinutes: h.totalMinutes,
    totalCardio: h.totalCardio,
    essence: h.essence,
    power: combatPower(h),
    ascension: h.ascension,
    xpMultiplier: ascensionXpMult(h.ascension),
    // R68 — additive birthYear plumb (audit 2-a B2): client HR-zone surfaces
    // can now age-derive HRmax (hrMaxFromBirthYear) like sensor-hub does.
    birthYear: h.birthYear ?? null,
    timezone: h.timezone ?? null,
    region: h.region ?? null,
    country: h.country ?? null,
    createdAt: h.createdAt.toISOString(),
  }
}

export function questDTO(q: Quest): QuestDTO {
  let statReward: { stat: StatKey; amount: number } | null = null
  if (q.statReward) {
    try {
      const parsed = JSON.parse(q.statReward)
      statReward = { stat: parsed.stat as StatKey, amount: Number(parsed.amount) }
    } catch {
      /* ignore malformed */
    }
  }
  return {
    id: q.id,
    kind: q.kind as "daily" | "main",
    code: q.code,
    title: q.title,
    description: q.description,
    metric: q.metric,
    target: q.target,
    progress: Math.min(q.progress, q.target),
    xpReward: q.xpReward,
    statReward,
    pointReward: q.pointReward,
    claimed: q.claimed,
    completed: q.progress >= q.target,
    failed: q.failed,
    day: q.day,
  }
}

// ─── The one true hunter ──────────────────────────────────────────────────────

// R33 — device identity: the profile is scoped by the `prime-hunter` cookie
// token (set at awakening via Set-Cookie on POST /api/hunter). No cookie or
// no matching hunter → null → routes 404 NOT_AWAKENED and the client renders
// the AwakeningScreen. This fixes the shared-account bug where EVERY visitor
// of a deployed origin landed on the first-created profile and trained on
// someone else's data. Token lookup only — NEVER findFirst.

export const HUNTER_COOKIE = "prime-hunter"

export async function getHunter(): Promise<Hunter | null> {
  let token: string | undefined
  try {
    // next/headers cookies() — valid inside route-handler request scope only;
    // a bare script import (no request) throws, which reads as "no identity".
    const store = await cookies()
    token = store.get(HUNTER_COOKIE)?.value
  } catch {
    return null
  }
  if (!token) return null
  return db.hunter.findUnique({ where: { token } })
}

export async function requireHunter(): Promise<Hunter> {
  const h = await getHunter()
  if (!h) throw new Error("NO_HUNTER")
  return h
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

async function clearedSessionIds(hunterId: string, day?: string, tz?: string | null): Promise<string[]> {
  // R38 — a tz-set hunter's "that day" window is their zone's midnight-to-midnight
  // (DST-correct via tzDayWindow); null tz keeps the legacy server-local window.
  const window = day
    ? tz
      ? tzDayWindow(day, tz)
      : { start: new Date(`${day}T00:00:00`), end: new Date(`${day}T23:59:59.999`) }
    : null
  const sessions = await db.workoutSession.findMany({
    where: {
      hunterId,
      status: "cleared",
      ...(window ? { startedAt: { gte: window.start, lt: window.end } } : {}),
    },
    select: { id: true },
  })
  return sessions.map((s) => s.id)
}

export type Aggregates = {
  sessions: number
  pushups: number
  squats: number
  cardio: number
  mobility: number
  volume: number
  minutes: number
}

export async function computeAggregates(hunterId: string, day?: string, tz?: string | null): Promise<Aggregates> {
  const ids = await clearedSessionIds(hunterId, day, tz)
  const agg: Aggregates = { sessions: ids.length, pushups: 0, squats: 0, cardio: 0, mobility: 0, volume: 0, minutes: 0 }
  if (ids.length === 0) return agg

  const logs = await db.exerciseLog.findMany({ where: { sessionId: { in: ids } } })
  for (const l of logs) {
    const name = l.name.toLowerCase()
    // R68 · planner-audit B3 — the push-up family only: substring "push" was
    // counting Push Press / Cable Pushdown / Band triceps Pushdown into the
    // daily-pushups directive + century achievement. Family match keeps
    // Push-ups / Pike / Incline / Diamond / ladder variants, drops press/down.
    if (name.includes("push-up") || name.includes("pushup")) agg.pushups += l.sets * l.reps
    if (name.includes("squat")) agg.squats += l.sets * l.reps
    if (l.type === "cardio") {
      agg.cardio += l.durationMin + Math.ceil((l.sets * l.reps) / 10)
    }
    if (l.type === "mobility") agg.mobility += l.durationMin
    if (l.type === "strength") agg.volume += l.sets * l.reps * l.weightKg
    agg.minutes += l.durationMin
  }
  agg.volume = Math.round(agg.volume)
  return agg
}

// ─── Quest machinery ──────────────────────────────────────────────────────────

function templateFields(t: QuestTemplate) {
  return {
    title: t.title,
    description: t.description,
    metric: t.metric,
    target: t.target,
    xpReward: t.xpReward,
    statReward: t.statReward ? JSON.stringify(t.statReward) : null,
    pointReward: t.pointReward ?? 0,
  }
}

/** Per-directive copy shapes — one honest builder, four distinct voices. */
const CALIBRATION_COPY: Record<string, { verb: string; noun: string; floorUnit: string }> = {
  "daily-pushups": { verb: "Perform", noun: "total push-ups", floorUnit: "-rep" },
  "daily-squats": { verb: "Perform", noun: "total squats", floorUnit: "-rep" },
  "daily-cardio": { verb: "Log", noun: "minutes of cardio", floorUnit: "-min" },
  "daily-volume": { verb: "Move", noun: "kg of total volume", floorUnit: " kg" },
}

/**
 * Builds the description for a calibrated daily. Pure + exported so the clamp
 * math and its copy can be tested together. Honesty contract (R7-c): the
 * stated percentage is the ACTUAL target/base ratio (never the spec's own),
 * and a clamp that moved the target is named in plain language — the copy
 * never claims math it didn't do.
 */
export function calibrationDescription(
  code: string,
  target: number,
  base: number | null,
  recordLabel: string,
  fallback: string
): string {
  if (base === null || base <= 0) return fallback
  const spec = CALIBRATED_DAILIES[code]
  const copy = CALIBRATION_COPY[code]
  if (!spec || !copy) return fallback

  const raw = base * spec.ratio
  const rawRounded = Math.round(raw)
  const specPct = Math.round(spec.ratio * 100)
  const volume = spec.kind === "avg-volume"
  const fmt = (n: number) => (volume ? n.toLocaleString() : `${n}`)

  // floor clamp raised the target above the ratio's own math — say so
  if (target > rawRounded) {
    return volume
      ? `${copy.verb} ${fmt(target)} ${copy.noun} — calibrated to ${recordLabel}, raised to the ${fmt(spec.min)}${copy.floorUnit} floor.`
      : `${copy.verb} ${target} ${copy.noun} — your ${specPct}% target (${rawRounded}) was raised to the ${spec.min}${copy.floorUnit} floor.`
  }
  // cap clamp cut the target below the ratio's own math — say so
  if (target < rawRounded) {
    return volume
      ? `${copy.verb} ${fmt(target)} ${copy.noun} — calibrated to ${recordLabel}, capped at ${fmt(spec.max)} to stay sane.`
      : `${copy.verb} ${target} ${copy.noun} — your ${specPct}% target (${rawRounded}) was capped at ${spec.max} to stay sane.`
  }
  // clamp neutral — state the ACTUAL target/base ratio, not the spec's
  if (volume) return `${copy.verb} ${fmt(target)} ${copy.noun} — calibrated to ${recordLabel}.`
  const pct = Math.round((target / base) * 100)
  return `${copy.verb} ${target} ${copy.noun} — ${pct}% of ${recordLabel}.`
}

/**
 * Calibrates roll-time daily targets to the hunter's own records —
 * the description states the real target/base ratio and names any clamp
 * that moved the target (floor or cap). Directives with no matching
 * record fall back to their template defaults untouched.
 */
export async function calibrateDailies(hunterId: string, templates: QuestTemplate[]): Promise<QuestTemplate[]> {
  const codes = new Set(templates.map((t) => t.code))
  const specs = Object.entries(CALIBRATED_DAILIES).filter(([code]) => codes.has(code))
  if (specs.length === 0) return templates

  const [prs, hunter] = await Promise.all([
    db.personalBest.findMany({ where: { hunterId } }),
    db.hunter.findUnique({ where: { id: hunterId } }),
  ])

  return templates.map((t) => {
    const spec = CALIBRATED_DAILIES[t.code]
    if (!spec) return t

    let base: number | null = null
    let recordLabel = ""

    if (spec.kind === "pr-reps" || spec.kind === "pr-minutes") {
      let pr = prs.find(
        (p) => p.bestValue > 0 && (!spec.prType || p.type === spec.prType) && (!spec.match || p.name.includes(spec.match))
      )
      // cardio: any cardio record, prefer the longest
      if (spec.kind === "pr-minutes" && !spec.match) {
        pr = prs.filter((p) => p.type === (spec.prType ?? "cardio")).sort((a, b) => b.bestValue - a.bestValue)[0]
      }
      if (pr && pr.bestValue > 0) {
        base = pr.bestValue
        const unit = spec.kind === "pr-reps" ? "rep" : "min"
        recordLabel = `your ${Math.round(pr.bestValue)}-${unit} record`
      }
    } else if (spec.kind === "avg-volume") {
      if (hunter && hunter.totalSessions > 0 && hunter.totalVolumeKg > 0) {
        base = hunter.totalVolumeKg / hunter.totalSessions
        recordLabel = `your ${Math.round(base).toLocaleString()} kg session average`
      }
    }

    if (!base) return t

    const target = Math.round(Math.min(spec.max, Math.max(spec.min, base * spec.ratio)))
    const description = calibrationDescription(t.code, target, base, recordLabel, t.description)
    return { ...t, target, description }
  })
}

/** Creates today's dailies if missing + main quests on first run. Marks stale dailies failed.
 *  R38 — "today" is the hunter's timezone day (null tz = legacy server-local). */
export async function ensureQuests(hunterId: string): Promise<void> {
  const hunter = await db.hunter.findUnique({ where: { id: hunterId }, select: { timezone: true } })
  const today = dayKeyIn(hunter?.timezone)

  // Fail any stale incomplete dailies from previous days
  await db.quest.updateMany({
    where: { hunterId, kind: "daily", day: { not: today }, claimed: false, completedAt: null },
    data: { failed: true },
  })

  const existingDailies = await db.quest.count({ where: { hunterId, kind: "daily", day: today } })
  if (existingDailies === 0) {
    const rolled = await calibrateDailies(hunterId, rollDailies(today))
    await db.quest.createMany({
      data: rolled.map((t) => ({ hunterId, kind: "daily", code: t.code, day: today, ...templateFields(t) })),
    })
  }

  const existingMain = await db.quest.findMany({
    where: { hunterId, kind: "main" },
    select: { code: true },
  })
  const ownedCodes = new Set(existingMain.map((q) => q.code))
  // Backfill: hunters awakened before a template shipped get the new
  // milestones inserted (progress syncs retroactively on next read/grant).
  const missing = MAIN_QUESTS.filter((t) => !ownedCodes.has(t.code))
  if (missing.length > 0) {
    await db.quest.createMany({
      data: missing.map((t) => ({ hunterId, kind: "main", code: t.code, day: null, ...templateFields(t) })),
    })
  }
}

/**
 * R39 — the Recovery Directive quest (insights side-effect ①). When the
 * training-load detector flags deload-advised, GET /api/insights injects
 * TODAY's directive as a real daily quest: light work only — mobility minutes
 * count, exactly like the rolled mobility daily (syncQuests advances the
 * mobility metric from logged exercise, and the generic claim route handles
 * the reward). Idempotent per day via check-then-create (the Quest model has
 * no unique constraint on hunterId+kind+day+code); a stale uncompleted
 * directive is failed by ensureQuests' own sweep like every other daily.
 * XP reward matches the rolled mobility daily (30) — no richer reward for
 * being overtrained. R38-aware: "today" is the hunter's timezone day.
 */
export async function ensureDeloadQuest(hunterId: string): Promise<void> {
  const hunter = await db.hunter.findUnique({ where: { id: hunterId }, select: { timezone: true } })
  const today = dayKeyIn(hunter?.timezone)
  const existing = await db.quest.findFirst({
    where: { hunterId, kind: "daily", day: today, code: "recovery-directive" },
    select: { id: true },
  })
  if (existing) return
  await db.quest.create({
    data: {
      hunterId,
      kind: "daily",
      code: "recovery-directive",
      day: today,
      title: "Recovery Directive",
      description:
        "The System flagged an acute-load spike with incomplete recovery — keep today LIGHT: mobility, technique, Zone 2. Nothing heavy.",
      metric: "mobility",
      target: 10,
      xpReward: 30,
      statReward: null,
      pointReward: 0,
    },
  })
}

/** Recomputes progress on all unclaimed quests. Returns newly completed codes.
 *  R38 — the daily window (today + its aggregates) rolls with the hunter's tz. */
export async function syncQuests(hunterId: string): Promise<string[]> {
  const hunter = await db.hunter.findUnique({ where: { id: hunterId } })
  if (!hunter) return []

  const today = dayKeyIn(hunter.timezone)
  const lifetime = await computeAggregates(hunterId)
  const todayAgg = await computeAggregates(hunterId, today, hunter.timezone)

  const open = await db.quest.findMany({
    where: { hunterId, claimed: false, OR: [{ kind: "main" }, { kind: "daily", day: today }] },
  })

  // Lifetime boss kills — feeds the boss_kills metric below
  const bossKills = await db.bossDefeat.count({ where: { hunterId } })

  const newlyCompleted: string[] = []
  for (const q of open) {
    // Manual-check metrics are only advanced by explicit user action
    if (q.metric === "hydrate" || q.metric === "sleep") continue

    let progress = q.progress
    switch (q.metric) {
      case "sessions":
        progress = q.kind === "daily" ? todayAgg.sessions : lifetime.sessions
        break
      case "pushups":
        progress = q.kind === "daily" ? todayAgg.pushups : lifetime.pushups
        break
      case "squats":
        progress = q.kind === "daily" ? todayAgg.squats : lifetime.squats
        break
      case "cardio":
        progress = q.kind === "daily" ? todayAgg.cardio : lifetime.cardio
        break
      case "mobility":
        progress = todayAgg.mobility
        break
      case "volume":
        progress = q.kind === "daily" ? todayAgg.volume : lifetime.volume
        break
      case "level":
        progress = hunter.level
        break
      case "streak":
        progress = hunter.streak
        break
      case "total_minutes":
        progress = lifetime.minutes
        break
      case "ascensions":
        progress = hunter.ascension
        break
      case "boss_kills":
        progress = bossKills
        break
    }

    const nowComplete = progress >= q.target
    if (progress !== q.progress || (nowComplete && !q.completedAt)) {
      await db.quest.update({
        where: { id: q.id },
        data: { progress, completedAt: nowComplete ? q.completedAt ?? new Date() : null },
      })
      if (nowComplete && !q.completedAt) newlyCompleted.push(q.code)
    }
  }
  return newlyCompleted
}

// ─── Titles ───────────────────────────────────────────────────────────────────

type AchievementCtx = {
  pushupsInSession?: number
  sessionHour?: number
  sessionMinutes?: number
}

export async function checkAchievements(hunterId: string, ctx: AchievementCtx = {}): Promise<string[]> {
  const hunter = await db.hunter.findUnique({ where: { id: hunterId } })
  if (!hunter) return []
  const agg = await computeAggregates(hunterId)
  const owned = new Set(
    (await db.achievement.findMany({ where: { hunterId }, select: { code: true } })).map((a) => a.code)
  )

  const should: string[] = ["awakened"]
  if (agg.sessions >= 1) should.push("first-raid")
  if (agg.sessions >= 10) should.push("raider-10")
  if (agg.sessions >= 50) should.push("raider-50")
  if (agg.sessions >= 100) should.push("raider-100")
  if (hunter.streak >= 7 || hunter.bestStreak >= 7) should.push("streak-7")
  if (hunter.streak >= 30 || hunter.bestStreak >= 30) should.push("streak-30")
  if (hunter.streak >= 100 || hunter.bestStreak >= 100) should.push("streak-100")
  if (hunter.level >= 10) should.push("level-10")
  if (hunter.level >= 20) should.push("level-20")
  if (hunter.level >= 40) should.push("level-40")
  if (hunter.level >= 60) should.push("level-60")
  if (agg.volume >= 25000) should.push("volume-25k")
  if (agg.volume >= 250000) should.push("volume-250k")
  if ((ctx.pushupsInSession ?? 0) >= 100) should.push("century")
  if (ctx.sessionHour !== undefined && (ctx.sessionHour >= 22 || ctx.sessionHour < 4)) should.push("night-raider")
  if (ctx.sessionHour !== undefined && ctx.sessionHour < 7) should.push("dawn-wolf")
  if ((ctx.sessionMinutes ?? 0) >= 60) should.push("marathon-mind")

  // Gate mastery titles — computed from per-gate clear counts
  const grouped = await db.workoutSession.groupBy({
    by: ["gateId"],
    where: { hunterId, status: "cleared" },
    _count: { _all: true },
  })
  const clearsByGate: Record<string, number> = {}
  for (const g of grouped) clearsByGate[g.gateId] = g._count._all
  should.push(...earnedMasteryTitleCodes(clearsByGate))

  // Ascension Protocol titles — from completed prestige cycles
  should.push(...earnedAscensionTitleCodes(hunter.ascension))

  // Boss slayer titles — from lifetime world-boss kills
  const bossKills = await db.bossDefeat.count({ where: { hunterId } })
  should.push(...earnedBossTitleCodes(bossKills))

  const toUnlock = should.filter((c) => TITLES.some((t) => t.code === c) && !owned.has(c))
  if (toUnlock.length > 0) {
    await db.achievement.createMany({ data: toUnlock.map((code) => ({ hunterId, code })) })
  }
  return toUnlock
}

// ─── Program achievements (Program Forge) ─────────────────────────────────────

/**
 * Program-system titles. Run after every forge (POST /api/program) and after
 * every program-day session clear — the session-complete path (R1-c) should
 * also call this so followed-10/50 and perfect-week fire on schedule.
 */
export async function checkProgramAchievements(hunterId: string): Promise<string[]> {
  const owned = new Set(
    (await db.achievement.findMany({ where: { hunterId }, select: { code: true } })).map((a) => a.code)
  )

  const should: string[] = []

  // Lifetime forges (retired programs included)
  const forges = await db.program.count({ where: { hunterId } })
  if (forges >= 1) should.push("program-architect")
  if (forges >= 5) should.push("program-multi-forge")

  // Cleared sessions that executed a program plan day
  const programDaySessions = await db.workoutSession.count({
    where: { hunterId, status: "cleared", programDay: { not: null } },
  })
  if (programDaySessions >= 10) should.push("program-followed-10")
  if (programDaySessions >= 50) should.push("program-followed-50")

  // Perfect week — every planned day of the active program cleared this Mon-based week
  const active = await db.program.findFirst({
    where: { hunterId, active: true },
    orderBy: { createdAt: "desc" },
    select: { days: true },
  })
  if (active && active.days >= 2) {
    // R68 — the perfect-week window rolls with the hunter's timezone (audit
    // 2-a B3): restDayState precedent — the checker owns its own hunter read;
    // null tz keeps the legacy server-local Monday (byte-compatible).
    const tzHunter = await db.hunter.findUnique({
      where: { id: hunterId },
      select: { timezone: true },
    })
    const tz = tzHunter?.timezone ?? null
    const weekStart = weekStartKeyIn(tz)
    const weekStartInstant = tzDayWindow(weekStart, tz).start
    const clearedThisWeek = await db.workoutSession.findMany({
      where: {
        hunterId,
        status: "cleared",
        programDay: { not: null },
        startedAt: { gte: weekStartInstant },
      },
      select: { programDay: true },
    })
    const doneDays = new Set(clearedThisWeek.map((s) => s.programDay))
    if (Array.from({ length: active.days }, (_, i) => i + 1).every((d) => doneDays.has(d))) {
      should.push("program-perfect-week")
    }
  }

  const toUnlock = should.filter((c) => TITLES.some((t) => t.code === c) && !owned.has(c))
  if (toUnlock.length > 0) {
    await db.achievement.createMany({ data: toUnlock.map((code) => ({ hunterId, code })) })
  }
  return toUnlock
}

// ─── Streak + XP core ─────────────────────────────────────────────────────────────────

/** Monday-based ISO week start key (yyyy-mm-dd of this week's Monday).
 *  R38 — delegates to game.weekStartKeyIn so a tz can be threaded by callers
 *  that have the hunter in scope; no-arg calls keep legacy server-local math. */
export function weekStartKey(d: Date = new Date()): string {
  return weekStartKeyIn(null, d)
}

/** Current state of the weekly Sanctified Rest decree.
 *  R38 — the decree's week + "today" roll with the hunter's timezone. */
export async function restDayState(
  hunterId: string
): Promise<import("@/lib/types").RestDayDTO> {
  const hunter = await db.hunter.findUnique({ where: { id: hunterId } })
  if (!hunter) {
    return {
      available: false,
      usedDay: null,
      weekStart: weekStartKey(),
      claimedToday: false,
      eligible: false,
      reason: "NO_CHAIN",
    }
  }
  const tz = hunter.timezone
  const today = dayKeyIn(tz)
  const weekStart = weekStartKeyIn(tz)

  const used = await db.restDay.findFirst({
    where: { hunterId, day: { gte: weekStart } },
    orderBy: { day: "desc" },
  })

  const claimedToday = used?.day === today
  const trainedWindow = tzDayWindow(today, tz)
  const trainedToday = await db.workoutSession.count({
    where: {
      hunterId,
      status: "cleared",
      startedAt: { gte: trainedWindow.start, lt: trainedWindow.end },
    },
  })

  const available = !used
  let reason: import("@/lib/types").RestDayDTO["reason"] = "OK"
  if (claimedToday) reason = "ALREADY_CLAIMED_TODAY"
  else if (!available) reason = "ALREADY_USED_THIS_WEEK"
  else if (trainedToday > 0) reason = "TRAINED_TODAY"
  else if (hunter.streak <= 0) reason = "NO_CHAIN"

  return {
    available,
    usedDay: used?.day ?? null,
    weekStart,
    claimedToday,
    eligible: reason === "OK",
    reason,
  }
}

async function touchStreak(
  hunter: Hunter
): Promise<{ streak: number; bestStreak: number; wardUsed: boolean; shieldUsed: boolean }> {
  // R38 — the streak day rolls at the hunter's midnight (null tz = legacy UTC).
  const tz = hunter.timezone
  const today = dayKeyIn(tz)
  if (hunter.lastActiveDay === today)
    return { streak: hunter.streak, bestStreak: hunter.bestStreak, wardUsed: false, shieldUsed: false }

  let streak: number
  let wardUsed = false
  let shieldUsed = false
  if (hunter.lastActiveDay === yesterdayKeyIn(tz)) {
    streak = hunter.streak + 1
  } else {
    // A day was missed. First: a Sanctified Rest decree covering exactly that
    // missed day (free weekly shield) bridges the chain…
    const dayBeforeGap = new Date()
    dayBeforeGap.setDate(dayBeforeGap.getDate() - 2)
    let bridged = false
    if (hunter.lastActiveDay === dayKeyIn(tz, dayBeforeGap)) {
      const rest = await db.restDay.findUnique({
        where: { hunterId_day: { hunterId: hunter.id, day: yesterdayKeyIn(tz) } },
      })
      if (rest) {
        shieldUsed = true
        bridged = true
      }
    }
    // …then the Ward of Continuity relic charge…
    if (!bridged) {
      const ward = await db.relic.findUnique({
        where: { hunterId_code: { hunterId: hunter.id, code: "ward-of-continuity" } },
      })
      if (ward && ward.charges > 0 && hunter.streak > 0) {
        await db.relic.update({
          where: { id: ward.id },
          data: { charges: { decrement: 1 } },
        })
        wardUsed = true
        bridged = true
      }
    }
    // …else the chain breaks.
    streak = bridged ? hunter.streak + 1 : 1
  }
  const bestStreak = Math.max(streak, hunter.bestStreak)
  await db.hunter.update({ where: { id: hunter.id }, data: { streak, bestStreak, lastActiveDay: today } })
  return { streak, bestStreak, wardUsed, shieldUsed }
}

/**
 * The single entry point for granting XP. Handles levels, rank-ups, stat points,
 * quest sync, achievement checks and the XP ledger. Ascension cycles apply a
 * permanent multiplier to every XP grant.
 *
 * R37-a (R35 re-land) — ledger-first, INSERT-gated grants: when a deterministic
 * `eventId` is passed, the xpEvent row is written BEFORE any hunter state
 * mutates, so the INSERT itself is the once-per-day gate — a P2002 unique
 * violation on the @id means "already granted" and is thrown (as
 * LedgerAlreadyGrantedError) before touchStreak or the hunter update can move
 * a single point of state. Callers without an eventId keep the legacy
 * ordering (hunter update, then ledger row).
 */
export async function grantXp(
  hunterId: string,
  amount: number,
  source: "gate" | "quest" | "bonus",
  note?: string,
  essenceAward = 0,
  eventId?: string
): Promise<RewardResult> {
  const before = await db.hunter.findUniqueOrThrow({ where: { id: hunterId } })
  const oldRank = rankForLevel(before.level).rank

  const mult = ascensionXpMult(before.ascension)
  const granted = Math.round(amount * mult)
  const { level, xp, levelUps } = applyXp(before.level, before.xp, granted)
  const newRank = rankForLevel(level).rank
  const rankUp = newRank !== oldRank && levelUps > 0
  const statPointsGained = levelUps * STAT_POINTS_PER_LEVEL + (rankUp ? STAT_POINTS_PER_RANK : 0)

  // R37-a — the gated ledger INSERT comes FIRST: with a deterministic id the
  // @id uniqueness is the once-per-day gate, and the collision fires before
  // any mutation below can run. Level-ups / rank bonuses / stat points stay
  // exactly where they were — only the ledger ordering moved.
  if (eventId) {
    try {
      await db.xpEvent.create({
        // R38 — the ledger day is the hunter's tz day; grantXpDeduped's
        // pre-check/eventId key space uses the caller's `day`, which for
        // tz-set hunters is the same zone's key (callers default it via
        // dayKeyIn(hunter.timezone)).
        data: { id: eventId, hunterId, amount: granted, source, note: note ?? null, day: dayKeyIn(before.timezone) },
      })
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") {
        // rethrown as the unambiguous gate signal so grantXpDeduped never
        // mistakes a P2002 from elsewhere in the grant chain for this one
        throw new LedgerAlreadyGrantedError(eventId)
      }
      throw e
    }
  }

  const streakInfo = await touchStreak(before)

  const updated = await db.hunter.update({
    where: { id: hunterId },
    data: {
      level,
      xp,
      totalXp: before.totalXp + granted,
      statPoints: before.statPoints + statPointsGained,
      ...(essenceAward > 0 ? { essence: { increment: essenceAward } } : {}),
    },
  })

  if (!eventId) {
    await db.xpEvent.create({
      data: { hunterId, amount: granted, source, note: note ?? null, day: dayKeyIn(before.timezone) },
    })
  }

  await syncQuests(hunterId)
  const unlockedTitles = await checkAchievements(hunterId)

  return {
    xpGained: granted,
    levelUps,
    newLevel: level,
    rankUp,
    newRank: rankUp ? newRank : null,
    statPointsGained,
    unlockedTitles,
    hunter: hunterDTO(updated),
    essenceGained: essenceAward > 0 ? essenceAward : undefined,
    streakShielded: streakInfo.shieldUsed || undefined,
  }
}

/**
 * R37-a (R35 re-land) — the ledger gate lost the id race: another tab or
 * process inserted the deterministic xpEvent id first. Thrown by grantXp's
 * gated insert BEFORE any hunter state mutates; only grantXpDeduped ever
 * catches it (and reads it as a clean "already granted today").
 */
class LedgerAlreadyGrantedError extends Error {
  constructor(eventId: string) {
    super(`XP ledger gate: already granted (${eventId})`)
    this.name = "LedgerAlreadyGrantedError"
  }
}

/**
 * R37-a (R35 re-land) — bonus XP at most once per (hunter, note, day).
 * Two layers make the dedupe airtight across tabs AND processes:
 *  1. a findFirst pre-check (hunterId + note + day) short-circuits the common
 *     already-granted case and covers restored-backup rows whose ids are fresh
 *     cuids (they would miss an id-collision);
 *  2. the deterministic event id `dedupe:{hunterId}:{day}:{note}` makes the
 *     ledger INSERT itself the atomic gate — two racing callers can both pass
 *     the pre-check, but only one insert survives the @id uniqueness; the
 *     loser's P2002 fires before any hunter state has moved.
 * Returns true when granted, false when already granted that day for that note.
 */
export async function grantXpDeduped(
  hunterId: string,
  note: string,
  amount: number,
  day?: string
): Promise<boolean> {
  // R38 — the default day rolls with the hunter's timezone (null/legacy = UTC).
  // Explicit days (metrics/nutrition pass the log's own day) are honored as-is.
  let dayKey_ = day
  if (dayKey_ === undefined) {
    const h = await db.hunter.findUnique({ where: { id: hunterId }, select: { timezone: true } })
    dayKey_ = dayKeyIn(h?.timezone)
  }
  const already = await db.xpEvent.findFirst({ where: { hunterId, day: dayKey_, note } })
  if (already) return false
  const eventId = `dedupe:${hunterId}:${dayKey_}:${note}`
  try {
    await grantXp(hunterId, amount, "bonus", note, 0, eventId)
    return true
  } catch (e) {
    if (e instanceof LedgerAlreadyGrantedError) return false
    throw e
  }
}

/**
 * Grants bonus XP once per (hunter, day, note) — deduped against the XP
 * ledger (same pattern as the vitals check-in bonus). Re-forging on the
 * same day never double-pays. Thin alias over grantXpDeduped (R37-a re-land
 * of the R35 gate — same signature, race-proof body).
 */
export async function grantXpOncePerDay(
  hunterId: string,
  note: string,
  amount: number,
  day?: string
): Promise<boolean> {
  return grantXpDeduped(hunterId, note, amount, day)
}

// ─── Essence + relic helpers ──────────────────────────────────────────────────

export async function ownedRelicCodes(hunterId: string): Promise<Map<string, number>> {
  const rows = await db.relic.findMany({ where: { hunterId }, select: { code: true, charges: true } })
  return new Map(rows.map((r) => [r.code, r.charges]))
}

// ─── Personal records ─────────────────────────────────────────────────────────

export function personalBestDTO(p: PersonalBest) {
  let context: { sets: number; reps: number; weightKg: number; durationMin: number } | null = null
  if (p.context) {
    try {
      const c = JSON.parse(p.context)
      context = { sets: c.sets, reps: c.reps, weightKg: c.weightKg, durationMin: c.durationMin }
    } catch {
      /* ignore */
    }
  }
  return {
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    type: p.type,
    bestValue: p.bestValue,
    unit: p.unit,
    context,
    achievedAt: p.achievedAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

/**
 * Checks a just-logged exercise against the hunter's all-time best.
 * On a new record: persists/updates the PersonalBest row, increments the
 * session's PR counter and returns bonus XP to bake into the log.
 */
export async function checkPersonalRecord(
  hunterId: string,
  sessionId: string,
  displayName: string,
  type: string,
  sets: number,
  reps: number,
  weightKg: number,
  durationMin: number,
  baseXp: number
): Promise<{ pr: PrInfo | null; bonusXp: number }> {
  const metric = prMetricFor(type, sets, reps, weightKg, durationMin)
  if (metric.value <= 0) return { pr: null, bonusXp: 0 }

  const key = normalizeExerciseName(displayName)
  const existing = await db.personalBest.findUnique({ where: { hunterId_name: { hunterId, name: key } } })

  let pr: PrInfo | null = null
  if (!existing) {
    await db.personalBest.create({
      data: {
        hunterId,
        name: key,
        displayName: displayName.trim(),
        type,
        bestValue: metric.value,
        unit: metric.unit,
        context: JSON.stringify({ sets, reps, weightKg, durationMin }),
      },
    })
    pr = { name: key, displayName: displayName.trim(), value: metric.value, unit: metric.unit, previous: 0, bonusXp: prBonusXp(baseXp) }
  } else if (metric.value > existing.bestValue && existing.type === type) {
    await db.personalBest.update({
      where: { id: existing.id },
      data: {
        bestValue: metric.value,
        type,
        context: JSON.stringify({ sets, reps, weightKg, durationMin }),
        updatedAt: new Date(),
      },
    })
    pr = {
      name: key,
      displayName: existing.displayName,
      value: metric.value,
      unit: metric.unit,
      previous: existing.bestValue,
      bonusXp: prBonusXp(baseXp),
    }
  }

  if (pr) {
    await db.workoutSession.update({ where: { id: sessionId }, data: { prCount: { increment: 1 } } })
    return { pr, bonusXp: pr.bonusXp }
  }
  return { pr: null, bonusXp: 0 }
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export function sessionDTO(s: WorkoutSession & { logs: ExerciseLog[] }) {
  return {
    id: s.id,
    gateId: s.gateId,
    gateName: s.gateName,
    status: s.status as "active" | "cleared" | "abandoned",
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    xpEarned: s.xpEarned,
    durationMin: s.durationMin,
    volumeKg: Math.round(s.volumeKg),
    logs: s.logs.map<ExerciseLogDTO>((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      sets: l.sets,
      reps: l.reps,
      weightKg: l.weightKg,
      durationMin: l.durationMin,
      xpValue: l.xpValue,
      rir: l.rir,
      rpe: l.rpe, // R32-a — CR10 effort rating rides the shared DTO (null for legacy rows)
      notes: l.notes, // R17-D — set notes ride the shared DTO so edit-prefill survives reload
    })),
  }
}

export async function getActiveSession(hunterId: string) {
  const s = await db.workoutSession.findFirst({
    where: { hunterId, status: "active" },
    include: { logs: { orderBy: { createdAt: "asc" } } },
  })
  return s
}
