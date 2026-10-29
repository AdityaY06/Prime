import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { checkProgramAchievements, grantXpOncePerDay, requireHunter } from "@/lib/engine"
import { type ProgramPlan } from "@/lib/exercises"
import {
  EXPERIENCES,
  GOALS,
  TIERS,
  generatePlan,
  programName,
  type EquipmentTier,
  type Experience,
  type ForgeInput,
  type Goal,
} from "@/lib/forge"
import type { Program } from "@prisma/client"

export const dynamic = "force-dynamic"

const FORGE_XP = 10
const FORGE_NOTE = "Program forge"

// ─── DTO ──────────────────────────────────────────────────────────────────────

export type ProgramDTO = {
  id: string
  name: string
  goal: string
  equipment: string
  days: number
  experience: string
  plan: ProgramPlan
  active: boolean
  createdAt: string
  retiredAt: string | null
}

/** Serializes a Program row with a guarded plan parse (fallback: { days: [] }). */
function programDTO(p: Program): ProgramDTO {
  let plan: ProgramPlan = { days: [] }
  try {
    const parsed: unknown = JSON.parse(p.plan)
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as ProgramPlan).days)) {
      plan = parsed as ProgramPlan
    }
  } catch {
    /* keep the empty-plan fallback */
  }
  return {
    id: p.id,
    name: p.name,
    goal: p.goal,
    equipment: p.equipment,
    days: p.days,
    experience: p.experience,
    plan,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    retiredAt: p.retiredAt?.toISOString() ?? null,
  }
}

// ─── GET /api/program — the active protocol (null when none) ─────────────────

export async function GET() {
  try {
    const hunter = await requireHunter()
    const program = await db.program.findFirst({
      where: { hunterId: hunter.id, active: true },
      orderBy: { createdAt: "desc" },
    })
    if (!program) return NextResponse.json({ program: null })
    return NextResponse.json({ program: programDTO(program) })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/program", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// ─── POST /api/program — forge { equipment, goal, days, experience } ──────────

export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }
    const payload = body as Record<string, unknown>

    const equipment = String(payload.equipment ?? "")
    if (!TIERS.includes(equipment as EquipmentTier)) {
      return NextResponse.json({ error: "Equipment must be none, home or full-gym." }, { status: 400 })
    }
    const goal = String(payload.goal ?? "")
    if (!GOALS.includes(goal as Goal)) {
      return NextResponse.json({ error: "Goal must be strength, hypertrophy, conditioning or mobility." }, { status: 400 })
    }
    const experience = String(payload.experience ?? "")
    if (!EXPERIENCES.includes(experience as Experience)) {
      return NextResponse.json({ error: "Experience must be novice, intermediate or advanced." }, { status: 400 })
    }
    const days = Number(payload.days)
    if (!Number.isInteger(days) || days < 2 || days > 6) {
      return NextResponse.json({ error: "Days must be an integer between 2 and 6." }, { status: 400 })
    }

    const input: ForgeInput = {
      equipment: equipment as EquipmentTier,
      goal: goal as Goal,
      days,
      experience: experience as Experience,
    }
    const plan = generatePlan(input)
    const name = programName(input)

    // Retire any active protocol, then strike the new one — atomically
    const created = await db.$transaction(async (tx) => {
      await tx.program.updateMany({
        where: { hunterId: hunter.id, active: true },
        data: { active: false, retiredAt: new Date() },
      })
      return tx.program.create({
        data: {
          hunterId: hunter.id,
          name,
          goal: input.goal,
          equipment: input.equipment,
          days: input.days,
          experience: input.experience,
          plan: JSON.stringify(plan),
          active: true,
        },
      })
    })

    // First forge of the day pays +10 XP — ledger-deduped, re-forges pay nothing
    const granted = await grantXpOncePerDay(hunter.id, FORGE_NOTE, FORGE_XP)
    const titlesUnlocked = await checkProgramAchievements(hunter.id)

    return NextResponse.json({
      program: programDTO(created),
      titlesUnlocked,
      ...(granted ? { xpGranted: FORGE_XP } : {}),
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/program", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// ─── DELETE /api/program — retire the active protocol ─────────────────────────

export async function DELETE() {
  try {
    const hunter = await requireHunter()
    const res = await db.program.updateMany({
      where: { hunterId: hunter.id, active: true },
      data: { active: false, retiredAt: new Date() },
    })
    return NextResponse.json({ retired: res.count > 0 })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("DELETE /api/program", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
