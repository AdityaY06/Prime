import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn } from "@/lib/game"
import { calibrateDailies, requireHunter } from "@/lib/engine"
import { rollDailies } from "@/lib/quests"
import { RELICS, relicByCode } from "@/lib/relics"
import type { ForgeDTO, RelicView } from "@/lib/types"

export const dynamic = "force-dynamic"

function forgeView(essence: number, owned: Map<string, number>): ForgeDTO {
  const relics: RelicView[] = RELICS.map((def) => {
    const charges = owned.get(def.code) ?? 0
    const ownedFlag = owned.has(def.code)
    let canAcquire = essence >= def.cost
    if (def.kind !== "charged" && ownedFlag) canAcquire = false
    return {
      code: def.code,
      name: def.name,
      epithet: def.epithet,
      desc: def.desc,
      effect: def.effect,
      kind: def.kind,
      cost: def.cost,
      maxCharges: def.maxCharges,
      glyph: def.glyph,
      accent: def.accent,
      border: def.border,
      glow: def.glow,
      lore: def.lore,
      owned: ownedFlag,
      charges,
      canAcquire,
    }
  })
  return {
    essence,
    relics,
    nextTierHint: essence < 40 ? "COMPLETE SESSIONS & CLAIM GOALS TO EARN MORE CREDITS" : undefined,
  }
}

// GET /api/forge — essence balance + relic inventory
export async function GET() {
  try {
    const hunter = await requireHunter()
    const rows = await db.relic.findMany({ where: { hunterId: hunter.id }, select: { code: true, charges: true } })
    const owned = new Map(rows.map((r) => [r.code, r.charges]))
    return NextResponse.json(forgeView(hunter.essence, owned))
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/forge", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// POST /api/forge — { action: 'acquire', code } | { action: 'reroll' } | { action: 'revive', questId } | { action: 'mirror' }
export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body = await req.json()
    const action = String(body?.action ?? "")

    // ── acquire a relic ────────────────────────────────────────────────────────
    if (action === "acquire") {
      const def = relicByCode(String(body?.code ?? ""))
      if (!def) return NextResponse.json({ error: "Unknown perk." }, { status: 400 })

      const existing = await db.relic.findUnique({
        where: { hunterId_code: { hunterId: hunter.id, code: def.code } },
      })

      if (def.kind !== "charged" && existing) {
        return NextResponse.json({ error: "You already own this perk." }, { status: 409 })
      }
      if (hunter.essence < def.cost) {
        return NextResponse.json({ error: "Not enough credits." }, { status: 400 })
      }

      await db.hunter.update({ where: { id: hunter.id }, data: { essence: { decrement: def.cost } } })

      if (existing) {
        // charged relic — stack another charge batch
        await db.relic.update({
          where: { id: existing.id },
          data: { charges: { increment: def.maxCharges } },
        })
      } else {
        await db.relic.create({
          data: { hunterId: hunter.id, code: def.code, charges: def.kind === "passive" ? 1 : def.maxCharges },
        })
      }

      const refreshed = await db.hunter.findUniqueOrThrow({ where: { id: hunter.id } })
      const rows = await db.relic.findMany({ where: { hunterId: hunter.id }, select: { code: true, charges: true } })
      return NextResponse.json({
        ...forgeView(refreshed.essence, new Map(rows.map((r) => [r.code, r.charges]))),
        acquired: def.code,
      })
    }

    // ── void compass: reroll today's unclaimed dailies ─────────────────────────
    if (action === "reroll") {
      const compass = await db.relic.findUnique({
        where: { hunterId_code: { hunterId: hunter.id, code: "void-compass" } },
      })
      if (!compass || compass.charges < 1) {
        return NextResponse.json({ error: "No Smart Swap charge available." }, { status: 400 })
      }

      // R38 — the reroll day rolls with the hunter's timezone.
      const today = dayKeyIn(hunter.timezone)
      const todays = await db.quest.findMany({ where: { hunterId: hunter.id, kind: "daily", day: today } })
      const unclaimed = todays.filter((q) => !q.claimed)
      if (unclaimed.length === 0) {
        return NextResponse.json({ error: "Nothing left to reroll today." }, { status: 400 })
      }

      await db.quest.deleteMany({ where: { id: { in: unclaimed.map((q) => q.id) } } })
      await db.relic.update({ where: { id: compass.id }, data: { charges: { decrement: 1 } } })

      // roll replacements, excluding codes that remain (claimed) today
      const remainingCodes = new Set(todays.filter((q) => q.claimed).map((q) => q.code))
      const salt = `${today}#r${Date.now()}`
      let rolled = rollDailies(salt).filter((t) => !remainingCodes.has(t.code))
      rolled = rolled.slice(0, unclaimed.length)
      // re-calibrate targets to the hunter's records
      rolled = await calibrateDailies(hunter.id, rolled)

      if (rolled.length > 0) {
        await db.quest.createMany({
          data: rolled.map((t) => ({
            hunterId: hunter.id,
            kind: "daily",
            code: t.code,
            day: today,
            title: t.title,
            description: t.description,
            metric: t.metric,
            target: t.target,
            xpReward: t.xpReward,
            statReward: t.statReward ? JSON.stringify(t.statReward) : null,
            pointReward: t.pointReward ?? 0,
          })),
        })
      }

      return NextResponse.json({ rerolled: rolled.map((t) => t.code) })
    }

    // ── phoenix ember: revive a failed daily directive ─────────────────────────
    if (action === "revive") {
      const ember = await db.relic.findUnique({
        where: { hunterId_code: { hunterId: hunter.id, code: "phoenix-ember" } },
      })
      if (!ember || ember.charges < 1) {
        return NextResponse.json({ error: "No Streak Revival charge available." }, { status: 400 })
      }

      const questId = String(body?.questId ?? "")
      const quest = await db.quest.findFirst({ where: { id: questId, hunterId: hunter.id, kind: "daily" } })
      if (!quest) return NextResponse.json({ error: "Goal not found." }, { status: 404 })
      if (quest.claimed) return NextResponse.json({ error: "Goal already claimed." }, { status: 400 })
      if (!quest.failed && quest.day === dayKeyIn(hunter.timezone)) {
        return NextResponse.json({ error: "Goal has not failed." }, { status: 400 })
      }

      await db.quest.update({ where: { id: quest.id }, data: { failed: false, day: dayKeyIn(hunter.timezone) } })
      await db.relic.update({ where: { id: ember.id }, data: { charges: { decrement: 1 } } })

      return NextResponse.json({ revived: quest.code })
    }

    // ── mirror of ascension: +2 attribute points ───────────────────────────────
    if (action === "mirror") {
      const mirror = await db.relic.findUnique({
        where: { hunterId_code: { hunterId: hunter.id, code: "mirror-of-ascension" } },
      })
      if (!mirror) return NextResponse.json({ error: "You do not own this perk." }, { status: 400 })

      await db.relic.delete({ where: { id: mirror.id } })
      await db.hunter.update({ where: { id: hunter.id }, data: { statPoints: { increment: 2 } } })

      return NextResponse.json({ mirrorUsed: true })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/forge", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
