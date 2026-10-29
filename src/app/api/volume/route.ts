import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import { buildVolumeReadouts, LANDMARK_FOOTER, tallyWeeklySets } from "@/lib/volume-landmarks"

export const dynamic = "force-dynamic"

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// GET /api/volume — weekly hard-set readout per muscle vs Israetel 2020
// volume landmarks. Any session status counts (the sets happened), but only
// logs from sessions the hunter owns; window = last 7 days by log createdAt.
export async function GET() {
  try {
    const hunter = await requireHunter()
    const since = new Date(Date.now() - WEEK_MS)

    const [logs, firstLogEver] = await Promise.all([
      db.exerciseLog.findMany({
        where: { session: { hunterId: hunter.id }, createdAt: { gte: since } },
        // R68 — type rides along so the tally can exclude cardio/mobility
        // rows: Israetel's MEV/MAV/MRV landmarks count hard RESISTANCE sets,
        // and a walk or a stretch is not one (additive select field).
        select: { name: true, sets: true, createdAt: true, type: true },
      }),
      // distinguishes "never logged anything" (panel empty state) from
      // "logged before, quiet this week" (all-zero rows — the gap to see)
      db.exerciseLog.findFirst({
        where: { session: { hunterId: hunter.id } },
        select: { id: true },
      }),
    ])

    return NextResponse.json({
      readouts: buildVolumeReadouts(tallyWeeklySets(logs)),
      footer: LANDMARK_FOOTER,
      everLogged: firstLogEver !== null,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/volume", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
