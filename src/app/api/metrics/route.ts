import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { dayKeyIn } from "@/lib/game"
import { grantXpDeduped, requireHunter } from "@/lib/engine"
import {
  METRIC_TYPES,
  bmiCategory,
  bmiFor,
  hunterProfile,
} from "@/lib/nutrition"
import type { BodyMetric, Hunter } from "@prisma/client"

export const dynamic = "force-dynamic"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validation ranges per metric type (mirrors METRIC_TYPES units). */
const METRIC_RANGES: Record<string, { min: number; max: number; message: string }> = {
  weight: { min: 25, max: 300, message: "Weight must be between 25 and 300 kg." },
  chest: { min: 20, max: 250, message: "Chest must be between 20 and 250 cm." },
  waist: { min: 20, max: 250, message: "Waist must be between 20 and 250 cm." },
  hips: { min: 20, max: 250, message: "Hips must be between 20 and 250 cm." },
  // R68 — Navy body-fat tape input (audit 2-a B1): mirrors csv.ts's importer
  // range so the tape-grid Neck row logs through the same validation path.
  neck: { min: 20, max: 80, message: "Neck must be between 20 and 80 cm." },
  arm: { min: 20, max: 250, message: "Arm must be between 20 and 250 cm." },
  thigh: { min: 20, max: 250, message: "Thigh must be between 20 and 250 cm." },
  calf: { min: 20, max: 250, message: "Calf must be between 20 and 250 cm." },
  sleep: { min: 0, max: 16, message: "Sleep must be between 0 and 16 hours." },
  restingHr: { min: 30, max: 120, message: "Resting HR must be between 30 and 120 bpm." },
  // health vitals (Vitals tab)
  bpSystolic: { min: 70, max: 250, message: "Systolic BP must be between 70 and 250 mmHg." },
  bpDiastolic: { min: 40, max: 150, message: "Diastolic BP must be between 40 and 150 mmHg." },
  spo2: { min: 85, max: 100, message: "Blood O₂ must be between 85 and 100 %." },
  hrv: { min: 5, max: 200, message: "HRV must be between 5 and 200 ms." },
  stress: { min: 0, max: 10, message: "Stress must be between 0 and 10." },
  mood: { min: 1, max: 5, message: "Mood must be between 1 and 5." },
  energy: { min: 1, max: 5, message: "Energy must be between 1 and 5." },
  // fitness tests (Vitals tab — testing lab)
  vo2max: { min: 10, max: 80, message: "VO₂ max must be between 10 and 80 ml/kg/min." },
  pushupReps: { min: 0, max: 200, message: "Push-up reps must be between 0 and 200." },
  plankSec: { min: 0, max: 600, message: "Plank hold must be between 0 and 600 seconds." },
  sitReachCm: { min: -20, max: 60, message: "Sit & reach must be between -20 and 60 cm." },
  // sensor-bridge & power metrics (R31 — watch sync + Ascent advisor)
  steps: { min: 0, max: 100000, message: "Steps must be between 0 and 100000." },
  verticalJumpCm: { min: 10, max: 120, message: "Vertical jump must be between 10 and 120 cm." },
  standingReachCm: { min: 100, max: 300, message: "Standing reach must be between 100 and 300 cm." },
  // Ascent-expansion capability tests (R32-b — paired with the METRIC_TYPES
  // entries added in the same commit; bounds follow the spec's suggested
  // sanity fences: dead hang 0–600 s (10 min = elite grip), 5K 600–3600 s
  // (10–60 min — the floor is a typo fence like verticalJumpCm's beyond-human
  // 120 max, the 60 min ceiling covers brisk walkers), 1K 120–900 s (2–15 min).)
  deadHangSec: { min: 0, max: 600, message: "Dead hang must be between 0 and 600 seconds." },
  best5kSec: { min: 600, max: 3600, message: "5K time must be between 600 and 3600 seconds." },
  best1kSec: { min: 120, max: 900, message: "1K time must be between 120 and 900 seconds." },
}

/** "YYYY-MM-DD" that is also a real calendar date. */
function validDayKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** Returns the request day (validated) or null when malformed.
 *  R38 — the default is the caller's "today" (hunter-tz day from routes). */
function parseDay(value: unknown, defaultDay: string): string | null {
  if (value === undefined || value === null || value === "") return defaultDay
  if (typeof value !== "string" || !validDayKey(value)) return null
  return value
}

function profileOut(h: Hunter) {
  return { ...hunterProfile(h), isDefault: h.heightCm === null }
}

// ─── Vitals check-in XP hook ───────────────────────────────────────────────────

const VITALS_CHECKIN_NOTE = "Vitals check-in"
const VITALS_CHECKIN_XP = 5

/** The eight daily check-in vital types (fitness-test types excluded). */
const VITAL_METRIC_IDS = [
  "bpSystolic",
  "bpDiastolic",
  "restingHr",
  "spo2",
  "hrv",
  "stress",
  "mood",
  "energy",
]

/**
 * Grants bonus XP once per (day, note) — deduped against the XP ledger.
 * R37-a (R35 re-land): the local check-then-grant copy was TOCTOU. The body
 * delegates to engine.grantXpDeduped — the in-process enqueueGrant queue
 * below narrows same-process races, the deterministic-id ledger gate closes
 * cross-tab/process ones.
 */
async function grantOnce(hunterId: string, day: string, note: string, amount: number): Promise<boolean> {
  return grantXpDeduped(hunterId, note, amount, day)
}

/**
 * Serializes the first-vital-of-day grant decision. A batch check-in fires
 * several concurrent POSTs; the check-then-grant span must not interleave or
 * two requests could both pass the "first vital today" test and double-grant.
 * All requests run in this single Node process, so an in-process queue closes
 * the race.
 */
let vitalsGrantQueue: Promise<unknown> = Promise.resolve()
function enqueueGrant<T>(fn: () => Promise<T>): Promise<T> {
  const run = vitalsGrantQueue.then(fn, fn)
  vitalsGrantQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

// ─── GET /api/metrics — latest values + 30-point series per metric ────────────

export async function GET() {
  try {
    const hunter = await requireHunter()
    const profile = hunterProfile(hunter)
    const metrics = await db.bodyMetric.findMany({ where: { hunterId: hunter.id } })

    const byType = new Map<string, BodyMetric[]>()
    for (const m of metrics) {
      const list = byType.get(m.type)
      if (list) list.push(m)
      else byType.set(m.type, [m])
    }

    const latest: Record<string, { value: number; day: string; unit: string } | null> = {}
    const series: Record<string, { day: string; value: number }[]> = {}

    for (const t of METRIC_TYPES) {
      const list = (byType.get(t.id) ?? []).sort(
        (a, b) => a.day.localeCompare(b.day) || a.updatedAt.getTime() - b.updatedAt.getTime()
      )
      series[t.id] = list.slice(-30).map((m) => ({ day: m.day, value: m.value }))
      const last = list.length > 0 ? list[list.length - 1] : null
      latest[t.id] = last ? { value: last.value, day: last.day, unit: last.unit } : null
    }

    // R68 — BMI is derived from the latest weight + the REAL profile height.
    // A missing height must not fabricate a BMI from the 175 cm placeholder
    // (audit 2-a B8): null stays null and every consumer renders the honest
    // "—" (healthScore's Body part skips a null BMI by design).
    let bmiCategoryOut: string | null = null
    const weightLatest = latest.weight
    if (weightLatest && profile.heightCm !== null) {
      const bmi = bmiFor(weightLatest.value, profile.heightCm)
      latest.bmi = { value: bmi, day: weightLatest.day, unit: "kg/m²" }
      bmiCategoryOut = bmiCategory(bmi)
    } else {
      latest.bmi = null
    }

    return NextResponse.json({
      profile: profileOut(hunter),
      latest,
      bmiCategory: bmiCategoryOut,
      series,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/metrics", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// ─── POST /api/metrics — { day?, type, value } upsert ─────────────────────────

export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }
    const payload = body as Record<string, unknown>

    // R38 — the default day (and every "is this today?" hook below) rolls at
    // the hunter's midnight when a timezone is set (null tz = legacy UTC day).
    const todayTz = dayKeyIn(hunter.timezone)
    const day = parseDay(payload.day, todayTz)
    if (!day) return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 })

    const type = typeof payload.type === "string" ? payload.type : ""
    const def = METRIC_TYPES.find((m) => m.id === type)
    if (!def) return NextResponse.json({ error: "Unknown metric type." }, { status: 400 })

    const range = METRIC_RANGES[type]
    const value = Number(payload.value)
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      return NextResponse.json({ error: range.message }, { status: 400 })
    }
    const valueR = Math.round(value * 10) / 10

    const metric = await db.bodyMetric.upsert({
      where: { hunterId_day_type: { hunterId: hunter.id, day, type } },
      create: { hunterId: hunter.id, day, type, unit: def.unit, value: valueR },
      update: { value: valueR, unit: def.unit },
    })

    // Weight flows back into the hunter profile (drives calorie/macro targets)
    if (type === "weight") {
      await db.hunter.update({ where: { id: hunter.id }, data: { weightKg: valueR } })
    }

    // 7+ hours of logged sleep auto-verifies today's sleep goal
    let questCompleted: boolean | undefined
    if (type === "sleep" && valueR >= 7 && day === todayTz) {
      const quest = await db.quest.findFirst({
        where: { hunterId: hunter.id, kind: "daily", code: "daily-sleep", day },
      })
      if (quest && !quest.claimed && quest.progress < quest.target) {
        await db.quest.update({
          where: { id: quest.id },
          data: { progress: 1, completedAt: new Date() },
        })
        questCompleted = true
      }
    }

    // First vital-type check-in of the day pays a one-time +5 XP bonus.
    // Fitness-test metrics (vo2max/pushupReps/plankSec/sitReachCm) never trigger it.
    let xpGranted: number | undefined
    if (VITAL_METRIC_IDS.includes(type) && day === todayTz) {
      const granted = await enqueueGrant(async () => {
        const others = await db.bodyMetric.count({
          where: { hunterId: hunter.id, day, type: { in: VITAL_METRIC_IDS, not: type } },
        })
        if (others > 0) return false
        return grantOnce(hunter.id, day, VITALS_CHECKIN_NOTE, VITALS_CHECKIN_XP)
      })
      if (granted) xpGranted = VITALS_CHECKIN_XP
    }

    return NextResponse.json({
      metric: { day: metric.day, type: metric.type, value: metric.value, unit: metric.unit },
      ...(questCompleted !== undefined ? { questCompleted } : {}),
      ...(xpGranted !== undefined ? { xpGranted } : {}),
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/metrics", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
