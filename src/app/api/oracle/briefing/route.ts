import { NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { ARCHETYPES, dayKeyIn, keyBefore, tzDayWindow, weekStartKeyIn, xpToNext } from "@/lib/game"
import { riftOfTheDay } from "@/lib/rift"
import { bossOfTheWeek, bossHpForLevel, enrageFor, gateNameOf } from "@/lib/bosses"
import { ascensionMultLabel } from "@/lib/ascension"
import {
  rhrBaselineFromRows,
  readinessScore,
  type DayValue,
  type NextDayView,
} from "@/lib/health"
import type { Hunter, PersonalBest, Quest, WorkoutSession } from "@prisma/client"

export const dynamic = "force-dynamic"

// ─── /api/oracle/briefing ─────────────────────────────────────────────────────
// GET  → today's cached briefing (or null)
// POST → divine today's briefing (LLM, ~110 words), upsert per hunter+day

// The vitals that feed readiness — one-per-type-per-day BodyMetric rows.
const READINESS_METRIC_TYPES = ["sleep", "restingHr", "mood", "energy"] as const

/** Minimal plan-day shape read out of Program.plan (guarded parse). */
type PlanDay = { day: number; focus: string }

function parsePlanDays(planJson: string | null | undefined): PlanDay[] | null {
  if (!planJson) return null
  try {
    const parsed: unknown = JSON.parse(planJson)
    if (!parsed || typeof parsed !== "object") return null
    const days = (parsed as { days?: unknown }).days
    if (!Array.isArray(days) || days.length === 0) return null
    const out: PlanDay[] = []
    for (const d of days) {
      if (!d || typeof d !== "object") continue
      const day = Number((d as { day?: unknown }).day)
      if (!Number.isInteger(day) || day < 1) continue
      const focus = (d as { focus?: unknown }).focus
      out.push({ day, focus: typeof focus === "string" ? focus : "" })
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

function briefingSystemPrompt(
  hunter: Hunter,
  sessions: WorkoutSession[],
  dailies: Quest[],
  prs: PersonalBest[]
): string {
  const archetype = ARCHETYPES.find((a) => a.id === hunter.archetype)
  const rift = riftOfTheDay()

  const raidLines =
    sessions.length === 0
      ? "- No sessions completed yet."
      : sessions
          .map((s) => `- ${s.startedAt.toISOString().slice(0, 10)} · ${s.gateName}: ${s.xpEarned} XP · ${s.durationMin} min · ${s.prCount} PR`)
          .join("\n")

  const directiveLines =
    dailies.length === 0
      ? "- No goals set for today."
      : dailies
          .map((q) => {
            const state = q.claimed ? "CLAIMED" : q.failed ? "FAILED" : q.progress >= q.target ? "COMPLETE-UNCLAIMED" : "OPEN"
            return `- ${q.title} [${q.metric}] ${state} ${q.progress}/${q.target} → +${q.xpReward} XP`
          })
          .join("\n")

  const prLines =
    prs.length === 0 ? "- No personal records set yet." : prs.map((p) => `- ${p.displayName} (${p.type}): ${p.bestValue} ${p.unit}`).join("\n")

  const stats = `STR ${hunter.str} / VIT ${hunter.vit} / END ${hunter.endur} / AGI ${hunter.agi} / FLEX ${hunter.flex}`
  const weakest = ((
    [
      ["STR", hunter.str],
      ["VIT", hunter.vit],
      ["END", hunter.endur],
      ["AGI", hunter.agi],
      ["FLEX", hunter.flex],
    ] as [string, number][]
  ).sort((a, b) => a[1] - b[1])[0] ?? ["STR", 0])[0]

  return [
    "You are PRIME COACH — an evidence-based AI fitness coach writing the athlete's DAILY BRIEFING, spoken aloud by the System Voice each morning.",
    "Tone: supportive, practical, safety-first — like a trusted coach who knows the data.",
    "Structure it EXACTLY as three short stanzas separated by blank lines:",
    "STANZA 1 — RECON: acknowledge the athlete by name; state level/rank, streak standing, and unspent stat points if any.",
    "STANZA 2 — THE DAY AHEAD: name today's bonus training type (data below) with its XP boost, flag the goals most worth chasing, and give ONE concrete training suggestion grounded in the data (favour the weakest attribute or an unfinished goal). If the weekly challenge is still live, weave in one line of strategy: name the challenge, its training type, how much raw XP one session must earn to complete it, and whether the athlete's best session this week is close. If it is already completed this week, do not mention it. When today's readiness score and a recommended program day appear in the data below, weave that recovery state and the recommended day into THE DAY AHEAD; if readiness is not logged, skip both and do not mention them.",
    "STANZA 3 — CLOSER: one short, motivating send-off line. No advice, just encouragement.",
    "Hard limits: 110 words MAX total. Plain text only — no markdown, no headers, no lists, no emoji, no quotation marks. Address the user as 'athlete'. Never mention being an AI.",
    "",
    "ATHLETE DATA:",
    `Name: ${hunter.name} · ${archetype?.name ?? hunter.archetype} · Level ${hunter.level} · XP ${hunter.xp}/${xpToNext(hunter.level)}`,
    `Streak: ${hunter.streak}d (best ${hunter.bestStreak}d) · Unspent points: ${hunter.statPoints} · Credits: ${hunter.essence}`,
    `Stats: ${stats} (weakest: ${weakest})`,
    `Lifetime: ${hunter.totalSessions} sessions · ${Math.round(hunter.totalVolumeKg)} kg · ${hunter.totalMinutes} min`,
    hunter.ascension > 0
      ? `New Cycle: cycle ${hunter.ascension} — all XP gains permanently ${ascensionMultLabel(hunter.ascension)}`
      : "New Cycle: none attempted (unlocks at Level 30)",
    "",
    `TODAY'S BONUS: ${rift.gateName} (×${rift.bonusMult} XP boost, +${rift.essenceBonus} credits on completion)`,
    "",
    "RECENT SESSIONS:",
    raidLines,
    "",
    // R38 — briefing day rolls with the hunter's timezone.
    `TODAY'S GOALS (${dayKeyIn(hunter.timezone)}):`,
    directiveLines,
    "",
    "PERSONAL RECORDS:",
    prLines,
  ].join("\n")
}

export async function GET() {
  try {
    const hunter = await requireHunter()
    const briefing = await db.briefing.findUnique({
      where: { hunterId_day: { hunterId: hunter.id, day: dayKeyIn(hunter.timezone) } },
    })
    return NextResponse.json({ day: dayKeyIn(hunter.timezone), briefing: briefing?.text ?? null })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("GET /api/oracle/briefing", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

export async function POST() {
  try {
    const hunter = await requireHunter()

    // refresh dailies first so the briefing sees today's true directive state
    const { ensureQuests, restDayState } = await import("@/lib/engine")
    await ensureQuests(hunter.id)
    const rest = await restDayState(hunter.id)

    // R38 — the briefing's week + its session window roll with the tz.
    const weekStart = weekStartKeyIn(hunter.timezone)
    const bossDef = bossOfTheWeek(weekStart)
    const [sessions, dailies, prs, defeat, bossRaids] = await Promise.all([
      db.workoutSession.findMany({
        where: { hunterId: hunter.id, status: "cleared" },
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
      db.quest.findMany({ where: { hunterId: hunter.id, kind: "daily", day: dayKeyIn(hunter.timezone) } }),
      db.personalBest.findMany({ where: { hunterId: hunter.id }, orderBy: { updatedAt: "desc" }, take: 8 }),
      db.bossDefeat.findUnique({ where: { hunterId_weekStart: { hunterId: hunter.id, weekStart } } }),
      db.workoutSession.findMany({
        where: {
          hunterId: hunter.id,
          status: "cleared",
          gateId: bossDef.gateId,
          startedAt: { gte: new Date(`${weekStart}T00:00:00`) },
        },
        select: { xpEarned: true },
      }),
    ])

    // Weekly challenge context for stanza 2 — only while the challenge is live
    let bossContext = ""
    if (!defeat) {
      const bossKills = await db.bossDefeat.count({
        where: { hunterId: hunter.id, bossCode: bossDef.code },
      })
      const enrage = enrageFor(bossKills)
      const hp = bossHpForLevel(hunter.level, bossKills)
      const best = bossRaids.reduce((m, r) => Math.max(m, r.xpEarned), 0)
      const near = best >= hp * 0.6
      const lifetimeKills = await db.bossDefeat.count({ where: { hunterId: hunter.id } })
      bossContext = [
        "",
        "WEEKLY CHALLENGE (live — strategy line welcome):",
        `Challenge: ${bossDef.name} — takes place in ${gateNameOf(bossDef.gateId)} (focus: ${bossDef.threat})`,
        enrage.tier > 0
          ? `Difficulty tier: ${enrage.label} (completed ${enrage.kills}× before — target scaled ×${enrage.hpMult})`
          : "Difficulty tier: STANDARD (never completed before)",
        `Completion condition: ONE session in that training type earning ${hp}+ raw XP. Best session there this week: ${best} XP${near ? " — within striking distance" : ""}.`,
        `Reward: bonus XP and credits. Lifetime completions: ${lifetimeKills}.`,
      ].join("\n")
    }

    const zai = await ZAI.create()

    // ── readiness + program context (R2-a) — same rule-set as /api/readiness ──
    // R38 — today + the 7-day vitals window roll with the hunter's tz.
    const today = dayKeyIn(hunter.timezone)
    let vitalsSince = today
    for (let i = 0; i < 7; i++) vitalsSince = keyBefore(vitalsSince)
    const [vitalRows, program, weekSessions] = await Promise.all([
      db.bodyMetric.findMany({
        where: { hunterId: hunter.id, type: { in: [...READINESS_METRIC_TYPES] }, day: { gte: vitalsSince } },
        select: { day: true, type: true, value: true },
      }),
      db.program.findFirst({ where: { hunterId: hunter.id, active: true }, orderBy: { createdAt: "desc" } }),
      db.workoutSession.findMany({
        where: { hunterId: hunter.id, status: "cleared", startedAt: { gte: new Date(`${weekStart}T00:00:00`) } },
        select: { programDay: true },
      }),
    ])

    const rowsOf = (type: string): DayValue[] =>
      vitalRows.filter((r) => r.type === type).map((r) => ({ day: r.day, value: r.value }))
    const valueOn = (rows: DayValue[], day: string): number | null =>
      rows.find((r) => r.day === day)?.value ?? null
    const rhrRows = rowsOf("restingHr")
    const rhrBaseline = rhrBaselineFromRows(rhrRows, today)
    const rhrToday = valueOn(rhrRows, today)
    const rhrDeviation =
      rhrToday !== null && rhrBaseline !== null ? Math.round((rhrToday - rhrBaseline) * 10) / 10 : null
    const readiness = readinessScore({
      sleepHours: valueOn(rowsOf("sleep"), today),
      rhrDeviation,
      mood: valueOn(rowsOf("mood"), today),
      energy: valueOn(rowsOf("energy"), today),
    })

    const week = { planned: program?.days ?? 0, done: weekSessions.length }

    let nextDay: NextDayView | null = null
    if (program) {
      const planDays = parsePlanDays(program.plan)
      if (planDays) {
        const daysDone = [
          ...new Set(weekSessions.map((s) => s.programDay).filter((d): d is number => d !== null)),
        ].sort((a, b) => a - b)
        const next = planDays.filter((p) => !daysDone.includes(p.day)).sort((a, b) => a.day - b.day)[0]
        if (next) {
          nextDay = {
            day: next.day,
            focus: next.focus,
            reason: daysDone.length === 0 ? "NOT YET TRAINED THIS WEEK" : "NEXT UNTRAINED DAY",
            daysDone,
            allDone: false,
          }
        } else {
          nextDay = {
            day: null,
            focus: "",
            reason: "ALL PROGRAM DAYS CLEARED THIS WEEK — REGENERATE OR REST",
            daysDone,
            allDone: true,
          }
        }
      }
      // plan corrupt/unparseable → nextDay stays null (honest, null-safe)
    }

    const readinessLines = [
      readiness
        ? `Readiness today: ${readiness.score}/100 ${readiness.band}${
            readiness.drivers.length > 0
              ? ` (${readiness.drivers.map((d) => `${d.label} ${d.delta >= 0 ? "+" : ""}${d.delta}`).join(", ")})`
              : ""
          }`
        : "Readiness today: not logged (no vitals today)",
      `Week compliance: ${week.done}/${week.planned} planned sessions done`,
    ]
    if (nextDay) {
      readinessLines.push(
        nextDay.allDone
          ? "Program: all plan days cleared this week — regenerate or rest"
          : `Next program day: DAY ${nextDay.day} — ${nextDay.focus || "training"} (${nextDay.reason.toLowerCase()})`
      )
    }
    const readinessContext = "\n\nREADINESS & PROGRAM CONTEXT:\n" + readinessLines.join("\n")

    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            briefingSystemPrompt(hunter, sessions, dailies, prs) +
            bossContext +
            `\nRECOVERY DAY: ${rest.available ? "one recovery day available this week (claiming it shields the streak for one rest day)" : "already spent this week"}` +
            readinessContext,
        },
        { role: "user", content: "Compose today's briefing." },
      ],
      thinking: { type: "disabled" },
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) {
      console.error("POST /api/oracle/briefing — empty completion")
      return NextResponse.json({ error: "THE COACH IS UNAVAILABLE." }, { status: 500 })
    }

    await db.briefing.upsert({
      where: { hunterId_day: { hunterId: hunter.id, day: dayKeyIn(hunter.timezone) } },
      create: { hunterId: hunter.id, day: today, text },
      update: { text },
    })

    return NextResponse.json({ day: today, briefing: text })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("POST /api/oracle/briefing", e)
    return NextResponse.json({ error: "THE COACH IS UNAVAILABLE." }, { status: 500 })
  }
}
