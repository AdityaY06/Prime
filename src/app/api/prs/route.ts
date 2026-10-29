import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { personalBestDTO, requireHunter } from "@/lib/engine"

export const dynamic = "force-dynamic"

// GET /api/prs — all personal records, most recent first
export async function GET() {
  try {
    const hunter = await requireHunter()
    const records = await db.personalBest.findMany({
      where: { hunterId: hunter.id },
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json({ records: records.map(personalBestDTO) })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/prs", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
