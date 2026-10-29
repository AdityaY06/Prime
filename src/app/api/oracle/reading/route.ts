import { NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { ARCHETYPES, keyBefore, rankForLevel, tzDayWindow, weekStartKeyIn } from "@/lib/game"
import { requireHunter } from "@/lib/engine"
import { riftOfTheDay } from "@/lib/rift"
import { bossOfTheWeek, bossHpForLevel, enrageFor, gateNameOf } from "@/lib/bosses"
import { ascensionMultLabel } from "@/lib/ascension"

export const dynamic = "force-dynamic"

// ─── /api/oracle/reading — THE WEEKLY DIVINATION ──────────────────────────────
// POST → a long-form Oracle reading of the training week just lived and the one
// arriving: RETROSPECT / THE CURRENT TIDE / PROPHECY / SYSTEM VERDICT.
// Ephemeral by design — a divination is a ritual, not a record.

function readingSystemPrompt(ctx: string): string {
  return [
    "You are PRIME COACH — an evidence-based AI fitness coach writing the WEEKLY REVIEW: a longer, thoughtful look across the athlete's whole training week, deeper than the daily briefing.",
    "Tone: supportive, practical, safety-first.",
    "Structure it EXACTLY as four sections, each opened by its heading on its own line:",
    "I. RETROSPECT",
    "2-4 sentences reviewing the week just lived — what the sessions built, volume balanced against rest, records set.",
    "II. WHERE YOU STAND",
    "2-4 sentences on the athlete's current position — momentum, streak, rank progress, the balance or imbalance of their five attributes.",
    "III. NEXT WEEK",
    "3-5 sentences of concrete, practical prescriptions for the coming week — training types to prioritise, the weekly challenge if it is live, attributes to feed, goals worth chasing. Be specific; ground every recommendation in the data.",
    "SYSTEM VERDICT: one final line of at most 14 words, stamped like a verdict. No advice, pure assessment.",
    "Hard limits: 260 words MAX total. Plain text only — no markdown, no lists, no emoji, no quotation marks. Address the user as 'athlete'. Never mention being an AI.",
    "",
    ctx,
  ].join("\n")
}

export async function POST() {
  try {
    const hunter = await requireHunter()

    // R38 — the reading's weeks roll with the hunter's timezone: this week's
    // and the previous week's Monday-midnight instants come from tzDayWindow
    // (DST-correct), and the prev-week key is calendar arithmetic.
    const weekStart = weekStartKeyIn(hunter.timezone)
    const thisWeekInstant = tzDayWindow(weekStart, hunter.timezone).start
    let prevKey = weekStart
    for (let i = 0; i < 7; i++) prevKey = keyBefore(prevKey)
    const prevStart = tzDayWindow(prevKey, hunter.timezone).start

    const bossDef = bossOfTheWeek(weekStart)
    const [thisWeekSessions, prevWeekSessions, weekQuests, defeat, bossRaids, bossKills, relics] = await Promise.all([
      db.workoutSession.findMany({
        where: { hunterId: hunter.id, status: "cleared", startedAt: { gte: thisWeekInstant } },
        select: { gateName: true, xpEarned: true, durationMin: true, volumeKg: true, prCount: true },
      }),
      db.workoutSession.findMany({
        where: {
          hunterId: hunter.id,
          status: "cleared",
          startedAt: { gte: prevStart, lt: thisWeekInstant },
        },
        select: { xpEarned: true, durationMin: true },
      }),
      db.quest.findMany({
        where: { hunterId: hunter.id, kind: "daily", day: { gte: weekStart } },
        select: { claimed: true, failed: true, progress: true, target: true },
      }),
      db.bossDefeat.findUnique({ where: { hunterId_weekStart: { hunterId: hunter.id, weekStart } } }),
      db.workoutSession.findMany({
        where: {
          hunterId: hunter.id,
          status: "cleared",
          gateId: bossDef.gateId,
          startedAt: { gte: thisWeekInstant },
        },
        select: { xpEarned: true },
      }),
      db.bossDefeat.count({ where: { hunterId: hunter.id, bossCode: bossDef.code } }),
      db.relic.findMany({ where: { hunterId: hunter.id }, select: { code: true } }),
    ])

    // week aggregates
    const wxp = thisWeekSessions.reduce((a, s) => a + s.xpEarned, 0)
    const wmin = thisWeekSessions.reduce((a, s) => a + s.durationMin, 0)
    const wvol = Math.round(thisWeekSessions.reduce((a, s) => a + s.volumeKg, 0))
    const wprs = thisWeekSessions.reduce((a, s) => a + s.prCount, 0)
    const prevXp = prevWeekSessions.reduce((a, s) => a + s.xpEarned, 0)

    // gate distribution
    const gateMap = new Map<string, number>()
    for (const s of thisWeekSessions) gateMap.set(s.gateName, (gateMap.get(s.gateName) ?? 0) + s.xpEarned)
    const gateLines =
      gateMap.size === 0
        ? "- No training sessions this week."
        : [...gateMap.entries()].map(([g, xp]) => `- ${g}: ${xp} XP`).join("\n")

    // directive ledger for the week
    const claimed = weekQuests.filter((q) => q.claimed).length
    const failed = weekQuests.filter((q) => q.failed && !q.claimed).length
    const stillOpen = weekQuests.filter((q) => !q.claimed && !q.failed).length

    // boss hunt block
    const enrage = enrageFor(bossKills)
    const bossHp = bossHpForLevel(hunter.level, bossKills)
    const bestBossRaid = bossRaids.reduce((m, r) => Math.max(m, r.xpEarned), 0)
    const bossBlock = defeat
      ? `WEEKLY CHALLENGE: ${bossDef.name} — COMPLETED this cycle (difficulty tier: ${enrage.label}).`
      : [
          `WEEKLY CHALLENGE: ${bossDef.name} — LIVE, in ${gateNameOf(bossDef.gateId)}.`,
          `Difficulty tier ${enrage.label} (completed ${enrage.kills}x before). Completion condition: one session of ${bossHp}+ raw XP in its training type.`,
          `Best session in that training type this week: ${bestBossRaid} XP.`,
        ].join("\n")

    const archetype = ARCHETYPES.find((a) => a.id === hunter.archetype)

    const ctx = [
      "ATHLETE DATA:",
      `Name: ${hunter.name} · ${archetype?.name ?? hunter.archetype} · Level ${hunter.level} · Rank ${rankForLevel(hunter.level).rank}`,
      `Streak: ${hunter.streak}d (best ${hunter.bestStreak}d) · Unspent points: ${hunter.statPoints} · Credits: ${hunter.essence}`,
      `Stats: STR ${hunter.str} / VIT ${hunter.vit} / END ${hunter.endur} / AGI ${hunter.agi} / FLEX ${hunter.flex}`,
      hunter.ascension > 0
        ? `New Cycle: cycle ${hunter.ascension} — all XP gains permanently ${ascensionMultLabel(hunter.ascension)}`
        : "New Cycle: none attempted (unlocks at Level 30)",
      `Rewards perks owned: ${relics.length}`,
      "",
      "THE WEEK JUST LIVED:",
      `Sessions completed: ${thisWeekSessions.length} · XP: ${wxp} (previous week: ${prevXp}) · Time: ${wmin} min · Volume: ${wvol} kg · Records: ${wprs}`,
      gateLines,
      `Goals across the week: ${claimed} claimed · ${failed} failed · ${stillOpen} still open`,
      "",
      bossBlock,
      "",
      `TODAY'S BONUS (for the plan): ${riftOfTheDay().gateName}`,
    ].join("\n")

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: readingSystemPrompt(ctx) },
        { role: "user", content: "Write the weekly review." },
      ],
      thinking: { type: "disabled" },
    })

    const reading = completion.choices[0]?.message?.content?.trim()
    if (!reading) {
      console.error("POST /api/oracle/reading — empty completion")
      return NextResponse.json({ error: "THE COACH IS UNAVAILABLE." }, { status: 500 })
    }

    return NextResponse.json({ reading, divinedAt: new Date().toISOString() })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("POST /api/oracle/reading", e)
    return NextResponse.json({ error: "THE COACH IS UNAVAILABLE." }, { status: 500 })
  }
}
