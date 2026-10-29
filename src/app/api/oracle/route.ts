import { NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { ARCHETYPES, dayKey, rankForLevel, xpToNext } from "@/lib/game"
import {
  rhrBaselineFromRows,
  rhrTrendFromRows,
  readinessScore,
  sleep7dAvgFromRows,
  type DayValue,
  type ReadinessView,
  type RhrTrendView,
} from "@/lib/health"
import { calcTargets, hunterProfile } from "@/lib/nutrition"
import { epleyE1rm, validE1rmSet } from "@/lib/strength-science"
import { TITLES, titleByCode } from "@/lib/titles"
import type { Hunter, PersonalBest, Quest, WorkoutSession } from "@prisma/client"

export const dynamic = "force-dynamic"

// ─── Types ─────────────────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string }

/** Known console views the client may report (unknown/absent → no view context). */
const TAB_IDS = ["status", "directives", "gates", "body", "fuel", "vitals", "records", "forge"] as const
type OracleTab = (typeof TAB_IDS)[number]

const VIEW_HEAD: Record<OracleTab, string> = {
  status: "ACTIVE VIEW — the athlete is viewing their STATUS overview.",
  directives: "ACTIVE VIEW — the athlete is viewing their DIRECTIVES console (today's goals).",
  gates: "ACTIVE VIEW — the athlete is viewing their TRAINING GATES — choosing a gate.",
  body: "ACTIVE VIEW — the athlete is viewing their BODY ATLAS (measurements & goals).",
  fuel: "ACTIVE VIEW — the athlete is viewing their FUEL console (nutrition).",
  vitals: "ACTIVE VIEW — the athlete is viewing their VITALS console (health & recovery).",
  records: "ACTIVE VIEW — the athlete is viewing their RECORDS console (personal bests).",
  forge: "ACTIVE VIEW — the athlete is viewing the REWARDS FORGE (shop & titles).",
}

const MAX_HISTORY = 10
const MAX_CONTENT_CHARS = 2000

/** Accepts the client conversation history, keeps only valid turns (last 10). */
function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: ChatMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== "object") continue
    const role = (m as { role?: unknown }).role
    const content = (m as { content?: unknown }).content
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.trim().length > 0
    ) {
      out.push({ role, content: content.trim().slice(0, MAX_CONTENT_CHARS) })
    }
  }
  return out.slice(-MAX_HISTORY)
}

/** Optional `tab` body field — must be a known view id, else ignored. */
function parseTab(raw: unknown): OracleTab | null {
  return typeof raw === "string" && (TAB_IDS as readonly string[]).includes(raw) ? (raw as OracleTab) : null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// ─── System prompt ─────────────────────────────────────────────────────────────

function raidSummary(sessions: WorkoutSession[]): string {
  if (sessions.length === 0) return "- No sessions completed yet."
  return sessions
    .map((s) => {
      const day = s.startedAt.toISOString().slice(0, 10)
      return `- ${day} · ${s.gateName}: ${s.xpEarned} XP · ${s.durationMin} min · ${Math.round(s.volumeKg)} kg volume · ${s.prCount} PR`
    })
    .join("\n")
}

function directiveSummary(dailies: Quest[]): string {
  if (dailies.length === 0) return "- No goals set for today."
  return dailies
    .map((q) => {
      const state = q.claimed ? "CLAIMED" : q.failed ? "FAILED" : q.progress >= q.target ? "COMPLETE" : "OPEN"
      return `- ${q.title} [${q.metric}] ${state} ${q.progress}/${q.target} → +${q.xpReward} XP`
    })
    .join("\n")
}

function prSummary(prs: PersonalBest[]): string {
  if (prs.length === 0) return "- No personal records set yet."
  return prs
    .map((p) => `- ${p.displayName} (${p.type}): ${p.bestValue} ${p.unit}`)
    .join("\n")
}

// ─── Vitals context (R1-b) — same readiness rule-set as /api/readiness ────────

type VitalsFacts = {
  readiness: ReadinessView | null
  rhrTrend: RhrTrendView | null
  sleepAvg: number | null
}

/** The live recovery facts (readiness + RHR + sleep) — shared by the prompt's
 *  VITALS CONTEXT block and the ACTIVE VIEW section for gates/vitals. */
function vitalsFacts(rows: { day: string; type: string; value: number }[], today: string): VitalsFacts {
  const rowsOf = (type: string): DayValue[] =>
    rows.filter((r) => r.type === type).map((r) => ({ day: r.day, value: r.value }))
  const sleepRows = rowsOf("sleep")
  const rhrRows = rowsOf("restingHr")

  const rhrTrend = rhrTrendFromRows(rhrRows, today)
  const rhrBaseline = rhrBaselineFromRows(rhrRows, today)
  const rhrToday = rhrRows.find((r) => r.day === today)?.value ?? null
  const readiness = readinessScore({
    sleepHours: sleepRows.find((r) => r.day === today)?.value ?? null,
    rhrDeviation:
      rhrToday !== null && rhrBaseline !== null ? Math.round((rhrToday - rhrBaseline) * 10) / 10 : null,
    mood: rowsOf("mood").find((r) => r.day === today)?.value ?? null,
    energy: rowsOf("energy").find((r) => r.day === today)?.value ?? null,
  })

  return {
    readiness,
    rhrTrend,
    sleepAvg: sleep7dAvgFromRows(sleepRows, today),
  }
}

/** 1–3 live recovery fact lines for the prompt; reuses the health.ts scoring. */
function vitalsContextLines(facts: VitalsFacts): string[] {
  const lines: string[] = []
  if (facts.readiness) {
    const drivers =
      facts.readiness.drivers.length > 0
        ? ` (${facts.readiness.drivers.map((d) => `${d.label} ${d.delta > 0 ? "+" : "-"}${Math.abs(d.delta)}`).join(", ")})`
        : ""
    lines.push(`- Daily readiness: ${facts.readiness.band} ${facts.readiness.score}/100${drivers}`)
  }
  if (facts.rhrTrend) {
    lines.push(
      `- Resting HR trend: ${facts.rhrTrend.title} (latest ${facts.rhrTrend.latest} vs ${facts.rhrTrend.baseline} bpm 7-day baseline)`
    )
  }
  if (facts.sleepAvg !== null) {
    lines.push(`- Sleep 7-day average: ${facts.sleepAvg} h`)
  }
  return lines
}

// ─── ACTIVE VIEW (R3) — tab-specific live facts for the prompt ────────────────

/** Epley e1RM from a strength PR's context JSON ({ sets, reps, weightKg }). */
function e1rmFromContext(p: PersonalBest): number | null {
  if (p.type !== "strength" || !p.context) return null
  try {
    const c = JSON.parse(p.context) as { weightKg?: unknown; reps?: unknown }
    const w = Number(c.weightKg)
    const r = Number(c.reps)
    if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return null
    // R69 — the one Epley core (lib/strength-science): r=1 identity pin +
    // the 1-12 validity domain. A 13+ rep record has no honest e1RM — null,
    // never the inflated extrapolation the old unbounded formula produced.
    if (!validE1rmSet(r, w)) return null
    return round1(epleyE1rm(w, r))
  } catch {
    return null
  }
}

/**
 * LIVE facts for the console the athlete currently has open. Only cheap,
 * read-only queries — and only the ones the active view actually needs
 * (a request without a valid tab performs none of them).
 */
async function activeViewLines(
  tab: OracleTab,
  hunter: Hunter,
  dailies: Quest[],
  prs: PersonalBest[],
  facts: VitalsFacts
): Promise<string[]> {
  const head = VIEW_HEAD[tab]

  if (tab === "status") {
    return [
      head,
      `- Snapshot: Level ${hunter.level} (${rankForLevel(hunter.level).rank}-rank) · streak ${hunter.streak} days (best ${hunter.bestStreak}) · ${hunter.statPoints} unspent stat points · ${hunter.essence} credits.`,
    ]
  }

  if (tab === "directives") {
    const unclaimed = dailies.filter((q) => !q.claimed && !q.failed)
    const claimable = unclaimed.reduce((acc, q) => acc + q.xpReward, 0)
    const state =
      dailies.length === 0
        ? "- No goals set for today."
        : unclaimed.length === 0
          ? "- All of today's goals are claimed."
          : `- ${unclaimed.length} unclaimed goal(s) today, +${claimable} XP claimable in total.`
    return [head, state]
  }

  if (tab === "gates") {
    const active = await db.workoutSession.findFirst({
      where: { hunterId: hunter.id, status: "active" },
      orderBy: { startedAt: "desc" },
      include: { _count: { select: { logs: true } } },
    })
    return [
      head,
      active
        ? `- Session in progress: ${active.gateName} — ${active._count.logs} exercise(s) logged so far.`
        : "- No session in progress.",
      facts.readiness
        ? `- Readiness: ${facts.readiness.band} ${facts.readiness.score}/100.`
        : "- No vitals logged today — readiness unscored.",
    ]
  }

  if (tab === "body") {
    const goals = await db.metricGoal.findMany({
      where: { hunterId: hunter.id },
      orderBy: { createdAt: "asc" },
    })
    const types = [...new Set([...goals.map((g) => g.metric), "weight"])]
    const rows = await db.bodyMetric.findMany({
      where: { hunterId: hunter.id, type: { in: types } },
      select: { day: true, type: true, value: true },
      orderBy: { day: "desc" },
    })
    // rows are day-desc, so the first row seen per type is its latest sample
    const latestByType = new Map<string, { value: number; day: string }>()
    for (const r of rows) {
      if (!latestByType.has(r.type)) latestByType.set(r.type, { value: r.value, day: r.day })
    }
    const weight = latestByType.get("weight")
    const goalText =
      goals.length === 0
        ? "- No body-metric goals set."
        : goals
            .map((g) => {
              const unit = g.metric === "weight" ? "kg" : "cm"
              const latest = latestByType.get(g.metric)
              if (!latest) return `${g.metric} → ${round1(g.targetValue)} ${unit} (no ${g.metric} logged yet)`
              const toGo = round1(Math.abs(g.targetValue - latest.value))
              return `${g.metric} ${round1(latest.value)} → ${round1(g.targetValue)} ${unit} (${toGo} ${unit} to target)`
            })
            .join(" · ")
    return [
      head,
      weight ? `- Latest weight: ${round1(weight.value)} kg (${weight.day}).` : "- No weight logged yet.",
      goalText,
    ]
  }

  if (tab === "fuel") {
    const today = dayKey()
    const targets = calcTargets(hunterProfile(hunter))
    const [logs, waterRows] = await Promise.all([
      db.nutritionLog.findMany({
        where: { hunterId: hunter.id, day: today },
        select: { calories: true, protein: true, carbs: true, fat: true },
      }),
      db.waterLog.findMany({ where: { hunterId: hunter.id, day: today }, select: { ml: true } }),
    ])
    const sum = logs.reduce(
      (acc, l) => ({
        calories: acc.calories + l.calories,
        protein: acc.protein + l.protein,
        carbs: acc.carbs + l.carbs,
        fat: acc.fat + l.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
    const waterMl = Math.max(0, waterRows.reduce((acc, w) => acc + w.ml, 0))
    const macroLine = `- Targets: ${targets.calories} kcal · protein ${targets.protein} g · carbs ${targets.carbs} g · fat ${targets.fat} g · water ${targets.waterMl} ml.`
    return [
      head,
      logs.length === 0
        ? `- No fuel logged today. ${macroLine.slice(2)}`
        : `- Today: ${round1(sum.calories)}/${targets.calories} kcal · P ${round1(sum.protein)}/${targets.protein} g · C ${round1(sum.carbs)}/${targets.carbs} g · F ${round1(sum.fat)}/${targets.fat} g · water ${waterMl}/${targets.waterMl} ml.`,
    ]
  }

  if (tab === "vitals") {
    return [
      head,
      facts.readiness
        ? `- Readiness: ${facts.readiness.band} ${facts.readiness.score}/100.`
        : "- No vitals logged today — readiness unscored.",
      ...(facts.rhrTrend
        ? [`- RHR trend: ${facts.rhrTrend.title} (latest ${facts.rhrTrend.latest} vs ${facts.rhrTrend.baseline} bpm baseline).`]
        : []),
      ...(facts.sleepAvg !== null ? [`- Sleep 7-day average: ${facts.sleepAvg} h.`] : []),
    ]
  }

  if (tab === "records") {
    const top3 = prs.slice(0, 3) // prs are already ordered by updatedAt desc
    const bestE1rm = prs
      .map((p) => ({ p, e: e1rmFromContext(p) }))
      .filter((x): x is { p: PersonalBest; e: number } => x.e !== null)
      .sort((a, b) => b.e - a.e)[0]
    const topText =
      top3.length === 0
        ? "- No personal records set yet."
        : `- Top records: ${top3
            .map((p) => {
              const improved = p.updatedAt.getTime() > p.achievedAt.getTime()
              return `${p.displayName} ${p.bestValue} ${p.unit}${improved ? ` (re-set ${p.updatedAt.toISOString().slice(0, 10)})` : ""}`
            })
            .join(" · ")}`
    return [
      head,
      topText,
      ...(bestE1rm
        ? [
            bestE1rm.p.updatedAt.getTime() > bestE1rm.p.achievedAt.getTime()
              ? `- Best strength e1RM: ${bestE1rm.p.displayName} ≈ ${bestE1rm.e} kg — trending up (record re-set ${bestE1rm.p.updatedAt.toISOString().slice(0, 10)}).`
              : `- Best strength e1RM: ${bestE1rm.p.displayName} ≈ ${bestE1rm.e} kg — unchanged since first set (${bestE1rm.p.achievedAt.toISOString().slice(0, 10)}).`,
          ]
        : []),
    ]
  }

  // tab === "forge"
  const titleCodes = new Set(TITLES.map((t) => t.code))
  const achievementRows = await db.achievement.findMany({
    where: { hunterId: hunter.id },
    select: { code: true },
  })
  const titlesEarned = achievementRows.filter((a) => titleCodes.has(a.code)).length
  return [
    head,
    `- Balance: ${hunter.essence} credits · ${achievementRows.length} achievements unlocked · ${titlesEarned} titles earned.`,
  ]
}

function oracleSystemPrompt(
  hunter: Hunter,
  sessions: WorkoutSession[],
  dailies: Quest[],
  prs: PersonalBest[],
  vitalsLines: string[],
  activeLines: string[]
): string {
  const archetype = ARCHETYPES.find((a) => a.id === hunter.archetype)
  const title = hunter.equippedTitle
    ? (titleByCode(hunter.equippedTitle)?.title ?? hunter.equippedTitle)
    : "none"
  const rank = rankForLevel(hunter.level).rank

  return [
    "You are PRIME COACH — an evidence-based AI fitness coach inside the PRIME adaptive training app.",
    "You are supportive, practical and safety-first. You speak in clear, concise coaching language.",
    "You give concrete, safe, practical training advice grounded in the athlete's data: stats, rank, XP, streak, recent sessions, personal records and today's goals.",
    "Base guidance on established training principles: progressive overload, adequate recovery, balanced conditioning, and technique first.",
    "Never give medical diagnoses; suggest professional consultation for injuries or pain.",
    "Keep responses under 150 words. Address the user as 'athlete'.",
    "",
    "ATHLETE CONTEXT (live training data):",
    `Name: ${hunter.name} · Profile: ${archetype?.name ?? hunter.archetype} (${archetype?.title ?? "unknown"})`,
    `Level: ${hunter.level} · Rank: ${rank} · XP: ${hunter.xp}/${xpToNext(hunter.level)} · Total XP: ${hunter.totalXp}`,
    `Streak: ${hunter.streak} days (best ${hunter.bestStreak}) · Unspent stat points: ${hunter.statPoints} · Credits: ${hunter.essence}`,
    `Stats — STR ${hunter.str} / VIT ${hunter.vit} / END ${hunter.endur} / AGI ${hunter.agi} / FLEX ${hunter.flex}`,
    `Featured badge: ${title}`,
    `Lifetime: ${hunter.totalSessions} sessions completed · ${Math.round(hunter.totalVolumeKg)} kg volume · ${hunter.totalMinutes} active minutes · ${hunter.totalCardio} cardio minutes`,
    "",
    "RECENT SESSIONS (latest first, last 5 completed):",
    raidSummary(sessions),
    "",
    "PERSONAL RECORDS:",
    prSummary(prs),
    "",
    `TODAY'S GOALS (${dayKey()}):`,
    directiveSummary(dailies),
    ...(vitalsLines.length > 0 ? ["", "VITALS CONTEXT (live recovery data):", ...vitalsLines] : []),
    ...(activeLines.length > 0
      ? ["", "ACTIVE VIEW (the console the athlete currently has open — tailor your answer to it):", ...activeLines]
      : []),
    "",
    "Use this data when answering. If stat points are unspent, remind the athlete to allocate them. If the streak is at risk, say so kindly.",
  ].join("\n")
}

// ─── POST /api/oracle — consult the Oracle ─────────────────────────────────────

export async function POST(req: Request) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }

    const history = sanitizeHistory((body as { messages?: unknown } | null)?.messages)
    if (history.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 })
    }

    const tab = parseTab((body as { tab?: unknown } | null)?.tab)

    const hunter = await requireHunter()

    // One extra query feeds the whole vitals context (readiness + RHR + sleep).
    const vitalsSince = dayKey(new Date(Date.now() - 7 * 86400000))
    const [sessions, dailies, prs, vitalRows] = await Promise.all([
      db.workoutSession.findMany({
        where: { hunterId: hunter.id, status: "cleared" },
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
      db.quest.findMany({ where: { hunterId: hunter.id, kind: "daily", day: dayKey() } }),
      db.personalBest.findMany({ where: { hunterId: hunter.id }, orderBy: { updatedAt: "desc" } }),
      db.bodyMetric.findMany({
        where: {
          hunterId: hunter.id,
          type: { in: ["sleep", "restingHr", "mood", "energy"] },
          day: { gte: vitalsSince },
        },
        select: { day: true, type: true, value: true },
      }),
    ])

    const facts = vitalsFacts(vitalRows, dayKey())
    const activeLines = tab ? await activeViewLines(tab, hunter, dailies, prs, facts) : []
    const systemPrompt = oracleSystemPrompt(
      hunter,
      sessions,
      dailies,
      prs,
      vitalsContextLines(facts),
      activeLines
    )

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [{ role: "assistant", content: systemPrompt }, ...history],
      thinking: { type: "disabled" },
    })

    const reply = completion.choices[0]?.message?.content?.trim()
    if (!reply) {
      console.error("POST /api/oracle — empty completion")
      return NextResponse.json({ error: "THE COACH IS UNAVAILABLE. Try again." }, { status: 500 })
    }

    return NextResponse.json({ reply })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    console.error("POST /api/oracle", e)
    return NextResponse.json({ error: "THE COACH IS UNAVAILABLE. Try again." }, { status: 500 })
  }
}
