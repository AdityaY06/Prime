import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { STAT_KEYS, type StatKey } from "@/lib/game"
import { hunterDTO, requireHunter, syncQuests } from "@/lib/engine"

export const dynamic = "force-dynamic"

// POST /api/hunter/stats — allocate free stat points
export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body = await req.json()
    const stat = String(body?.stat ?? "") as StatKey
    const amount = Math.floor(Number(body?.amount ?? 1))

    if (!STAT_KEYS.includes(stat)) {
      return NextResponse.json({ error: "Unknown stat." }, { status: 400 })
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 })
    }
    if (amount > hunter.statPoints) {
      return NextResponse.json({ error: "Not enough free stat points." }, { status: 400 })
    }

    const updated = await db.hunter.update({
      where: { id: hunter.id },
      data: {
        statPoints: hunter.statPoints - amount,
        ...(stat === "str" ? { str: hunter.str + amount } : {}),
        ...(stat === "vit" ? { vit: hunter.vit + amount } : {}),
        ...(stat === "endur" ? { endur: hunter.endur + amount } : {}),
        ...(stat === "agi" ? { agi: hunter.agi + amount } : {}),
        ...(stat === "flex" ? { flex: hunter.flex + amount } : {}),
      },
    })

    await syncQuests(hunter.id)
    return NextResponse.json({ hunter: hunterDTO(updated) })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/hunter/stats", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
