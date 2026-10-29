import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn } from "@/lib/game"
import { ensureQuests, questDTO, requireHunter, syncQuests } from "@/lib/engine"
import { essenceForQuest } from "@/lib/relics"

export const dynamic = "force-dynamic"

// GET /api/quests — today's dailies + main directives (auto-refreshed)
export async function GET() {
  try {
    const hunter = await requireHunter()
    await ensureQuests(hunter.id)
    await syncQuests(hunter.id)

    // R38 — "today" must match the roll's day (hunter tz), else the GET
    // would show zero dailies between UTC-midnight and tz-midnight.
    const today = dayKeyIn(hunter.timezone)
    const quests = await db.quest.findMany({
      where: { hunterId: hunter.id, OR: [{ kind: "main" }, { kind: "daily", day: today }] },
      orderBy: [{ kind: "desc" }, { createdAt: "asc" }],
    })

    const dailies = quests.filter((q) => q.kind === "daily").map(questDTO)
    const main = quests.filter((q) => q.kind === "main").map(questDTO)

    // recently failed dailies (revivable with a Phoenix Ember)
    const failed = await db.quest.findMany({
      where: { hunterId: hunter.id, kind: "daily", failed: true, claimed: false },
      orderBy: { day: "desc" },
      take: 5,
    })

    return NextResponse.json({ dailies, main, failed: failed.map(questDTO) })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/quests", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// POST /api/quests — { questId, action: 'claim' | 'check' }
export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body = await req.json()
    const questId = String(body?.questId ?? "")
    const action = String(body?.action ?? "")

    const quest = await db.quest.findFirst({ where: { id: questId, hunterId: hunter.id } })
    if (!quest) return NextResponse.json({ error: "Goal not found." }, { status: 404 })

    if (action === "check") {
      // Manual verification (hydrate / sleep protocols)
      if (quest.claimed) return NextResponse.json({ error: "Already claimed." }, { status: 400 })

      // R37-a (R35 re-land) — CAS bump: ONE atomic increment. The progress<target
      // predicate keeps racing tabs from pushing a target-1 protocol past its
      // goal — losers match zero rows and no-op, so N parallel checks move the
      // DB row by exactly +1 (the DTO clamp would hide an overshoot, the row
      // would not).
      await db.quest.updateMany({
        where: { id: quest.id, hunterId: hunter.id, claimed: false, progress: { lt: quest.target } },
        data: { progress: { increment: 1 } },
      })

      // Predicate-scoped completion stamp — unconditional + idempotent: it
      // marks the row the CAS just completed AND backfills rows that reached
      // target through another door (water/sleep auto-verify, aggregate sync).
      await db.quest.updateMany({
        where: { id: quest.id, progress: { gte: quest.target }, completedAt: null },
        data: { completedAt: new Date() },
      })

      const refreshed = await db.quest.findUniqueOrThrow({ where: { id: quest.id } })
      return NextResponse.json({ quest: questDTO(refreshed) })
    }

    if (action === "claim") {
      // R37-a (R35 re-land) — atomic compare-and-set: the row itself carries
      // the gate (unclaimed AND at target). Exactly one racing tab flips
      // `claimed` and wins the payout; every loser sees count=0 and 400s
      // BEFORE any reward is computed. The pre-read above only supplies the
      // friendly error copy — it never decides whether a reward is paid.
      const won = await db.quest.updateMany({
        where: { id: quest.id, hunterId: hunter.id, claimed: false, progress: { gte: quest.target } },
        data: { claimed: true, completedAt: quest.completedAt ?? new Date() },
      })
      if (won.count === 0) {
        const why =
          quest.claimed || quest.progress >= quest.target
            ? "Already claimed."
            : "Goal not yet complete."
        return NextResponse.json({ error: why }, { status: 400 })
      }

      // Stat + point rewards land in ONE hunter.update built entirely from
      // {increment} atoms. THE TRAP the R35 race suite caught live: a bare
      // number is a SET, not an increment ({vit: 1} would read vit 12 → 1) —
      // increments must be spelled {vit: {increment: 1}}.
      const statInc: Record<string, { increment: number }> = {}
      if (quest.statReward) {
        try {
          const parsed = JSON.parse(quest.statReward)
          const map: Record<string, string> = { str: "str", vit: "vit", endur: "endur", agi: "agi", flex: "flex" }
          const col = map[parsed.stat as string]
          if (col) statInc[col] = { increment: Number(parsed.amount) }
        } catch {
          /* ignore */
        }
      }
      if (quest.pointReward > 0) {
        statInc.statPoints = { increment: quest.pointReward }
      }
      if (Object.keys(statInc).length > 0) {
        await db.hunter.update({ where: { id: hunter.id }, data: statInc })
      }

      // XP through the central engine (level-ups, ranks, titles, streak) + essence
      const { grantXp } = await import("@/lib/engine")
      const essenceGained = essenceForQuest(quest.kind as "daily" | "main")
      const reward = await grantXp(hunter.id, quest.xpReward, "quest", quest.title, essenceGained)
      const refreshed = await db.quest.findUniqueOrThrow({ where: { id: quest.id } })

      return NextResponse.json({
        quest: questDTO(refreshed),
        reward: { ...reward, statGained: quest.statReward ? JSON.parse(quest.statReward) : null, pointReward: quest.pointReward },
      })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/quests", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
