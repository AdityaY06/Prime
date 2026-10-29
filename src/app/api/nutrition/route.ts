import { NextResponse } from "next/server"
import { createRequire } from "node:module"
import { db } from "@/lib/db"
import { dayKeyIn, keyBefore } from "@/lib/game"
import { grantXpDeduped, requireHunter } from "@/lib/engine"
import { ACTIVITY_LEVELS, GOALS, MACRO_SPLITS, MEAL_TYPES, calcTargets, hunterProfile } from "@/lib/nutrition"
import { validateEntryPatch } from "@/lib/nutrition-entry"
import type { Hunter, NutritionLog, PrismaClient } from "@prisma/client"

export const dynamic = "force-dynamic"

// ─── Live-server Prisma self-heal (R3-b infra · R17-A probe bump) ────────────
// The dev server process may predate a schema push, so the Prisma client
// instance it loaded rejects the newer columns ("Unknown argument …").
// Restarts are forbidden, so this module rebuilds the client ONCE per server
// process from the regenerated on-disk code (require-cache surgery — Task 13-a
// / R1-b precedent) and stores it on globalThis. Fail-open: on any error the
// stale client keeps serving every pre-existing field exactly as before.
// R17-A: the probe now checks NutritionLog.fiber (the micro columns this route
// writes) instead of the R3-b-era Hunter.macroSplit — lib/db.ts's centralized
// heal usually lands first (converging prisma_v10), and this probe only fires
// its own surgery when the imported `db` still predates the micro columns.

type HealedGlobal = typeof globalThis & {
  __r3bPrismaHealed?: boolean
  prisma_v10?: PrismaClient
  prisma_v9?: PrismaClient
}

let healedDb: PrismaClient | null = null

;(function healPrismaClient() {
  if (process.env.NODE_ENV === "production") return
  // cheap probe: the loaded client may already know the columns (fresh process
  // or lib/db.ts's centralized R17 heal already converged prisma_v10)
  const liveFields = (db.nutritionLog as unknown as { fields?: Record<string, unknown> }).fields
  if (liveFields && "fiber" in liveFields) return
  const g = globalThis as HealedGlobal
  if (g.__r3bPrismaHealed && g.prisma_v10) return // only skip when a previous attempt SUCCEEDED
  g.__r3bPrismaHealed = true
  try {
    // createRequire yields a made require with the process-wide .cache map
    // (Module._cache); process.mainModule.require lacks .cache.
    const req = createRequire(`${process.cwd()}/package.json`) as unknown as NodeJS.Require
    if (!req?.cache) return
    for (const key of Object.keys(req.cache)) {
      if (key.includes(".prisma/client") || key.includes("@prisma/client")) delete req.cache[key]
    }
    const { PrismaClient: FreshClient } = req("@prisma/client") as {
      PrismaClient: new (opts: { log: string[] }) => PrismaClient
    }
    const fresh = new FreshClient({ log: ["error", "warn"] })
    g.prisma_v10 = fresh
    g.prisma_v9 = fresh // converge: any future db.ts evaluation reuses the healed instance
    healedDb = fresh
    console.info("[api/nutrition] Prisma client healed — R17-A micro columns aware")
  } catch (healErr) {
    // fail-open — the stale client still serves every pre-existing field
    console.warn("[api/nutrition] Prisma heal skipped:", (healErr as Error)?.message ?? healErr)
  }
})()

/** The healed client when the live server needed surgery; `db` otherwise. */
function pdb(): PrismaClient {
  const g = globalThis as HealedGlobal
  return healedDb ?? g.prisma_v10 ?? (db as PrismaClient)
}

/**
 * The hunter as seen by the R17-aware client. requireHunter() may serve a
 * record from a pre-push client (newer columns omitted) — this re-read always
 * flows through the healed instance when one exists (a fresh server process
 * needs no surgery: its disk-generated client already knows the columns).
 */
async function freshHunter(id: string): Promise<Hunter> {
  const h = await pdb().hunter.findUnique({ where: { id } })
  if (!h) throw new Error("NO_HUNTER")
  return h
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const FIRST_MEAL_NOTE = "First meal logged"
const HYDRATION_NOTE = "Hydration milestone"

const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }

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

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// R68 · nutrition-audit B2 — the qty storage grid is TWO decimals end-to-end.
// round1 here was the silent-drift source: the client reviewed "3/4 roti"
// at 97.5 kcal, the server stored round1(0.75)=0.8 → 104 kcal (+7%), and
// "⅛ roti" 32.5 → 39 (+20%). Quarter servings are the parser's native
// grid; the client now sends round2(qty) and derives per-serving from the
// SAME rounded q, so stored totals reproduce the reviewed totals byte-exactly.
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * NaN-safe read of an R17-A micro column — a fail-open stale client (heal
 * skipped) omits fiber/sodium/sugar from returned rows; this keeps the day
 * aggregates and DTOs numeric instead of poisoning them with NaN/undefined.
 */
function num(v: number | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function clampRange(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function profileOut(h: Hunter) {
  return { ...hunterProfile(h), isDefault: h.heightCm === null }
}

function mealEntryDTO(l: NutritionLog) {
  return {
    id: l.id,
    mealType: l.mealType,
    name: l.name,
    qty: l.qty,
    unit: l.unit,
    calories: l.calories,
    protein: l.protein,
    carbs: l.carbs,
    fat: l.fat,
    // R17-A micros (per logged row, already qty-multiplied at write time)
    fiber: num(l.fiber),
    sodium: num(l.sodium),
    sugar: num(l.sugar),
    createdAt: l.createdAt.toISOString(),
  }
}

async function dayWaterTotal(hunterId: string, day: string): Promise<number> {
  const rows = await db.waterLog.findMany({ where: { hunterId, day }, select: { ml: true } })
  return Math.max(0, rows.reduce((acc, w) => acc + w.ml, 0))
}

/**
 * Grants bonus XP once per (day, note) — deduped against the XP ledger.
 * R37-a (R35 re-land): the local check-then-grant copy was TOCTOU — two
 * racing requests could both pass the findFirst and double-pay. The body now
 * delegates to engine.grantXpDeduped, whose deterministic-id ledger gate is
 * atomic across tabs and processes.
 */
async function grantOnce(hunterId: string, day: string, note: string, amount: number): Promise<boolean> {
  return grantXpDeduped(hunterId, note, amount, day)
}

// ─── GET /api/nutrition?date=YYYY-MM-DD ───────────────────────────────────────

export async function GET(req: Request) {
  try {
    const hunter = await requireHunter()
    // newer columns live only on the healed client's records — re-read when healed
    const profileHunter = await freshHunter(hunter.id)
    const url = new URL(req.url)
    const date = parseDay(url.searchParams.get("date"), dayKeyIn(hunter.timezone))
    if (!date) return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 })

    const targets = calcTargets(hunterProfile(profileHunter))

    const [logs, waterRows] = await Promise.all([
      pdb().nutritionLog.findMany({ where: { hunterId: hunter.id, day: date } }),
      db.waterLog.findMany({ where: { hunterId: hunter.id, day: date }, select: { ml: true } }),
    ])

    // R17-A — fiber/sodium/sugar aggregate exactly like the macros: each row
    // already stores its qty-multiplied total (log-food scales per-serving
    // values by qty at write time), so the day rollup is a plain sum + round1.
    const consumed = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 }
    for (const l of logs) {
      consumed.calories += l.calories
      consumed.protein += l.protein
      consumed.carbs += l.carbs
      consumed.fat += l.fat
      consumed.fiber += num(l.fiber)
      consumed.sodium += num(l.sodium)
      consumed.sugar += num(l.sugar)
    }
    consumed.calories = round1(consumed.calories)
    consumed.protein = round1(consumed.protein)
    consumed.carbs = round1(consumed.carbs)
    consumed.fat = round1(consumed.fat)
    consumed.fiber = round1(consumed.fiber)
    consumed.sodium = round1(consumed.sodium)
    consumed.sugar = round1(consumed.sugar)

    const waterMl = Math.max(0, waterRows.reduce((acc, w) => acc + w.ml, 0))

    const meals = logs
      .sort(
        (a, b) =>
          (MEAL_ORDER[a.mealType] ?? 9) - (MEAL_ORDER[b.mealType] ?? 9) ||
          a.createdAt.getTime() - b.createdAt.getTime()
      )
      .map(mealEntryDTO)

    // 7-day history — always anchored to TODAY (R38: the hunter's tz day),
    // ascending (ignores ?date). Key arithmetic is DST-safe by construction.
    const days: string[] = []
    {
      let key = dayKeyIn(hunter.timezone)
      for (let i = 0; i < 7; i++) {
        days.push(key)
        key = keyBefore(key)
      }
      days.reverse()
    }
    const [histLogs, histWater] = await Promise.all([
      pdb().nutritionLog.findMany({ where: { hunterId: hunter.id, day: { in: days } } }),
      db.waterLog.findMany({ where: { hunterId: hunter.id, day: { in: days } } }),
    ])
    const kcalByDay = new Map<string, number>()
    const waterByDay = new Map<string, number>()
    for (const l of histLogs) kcalByDay.set(l.day, (kcalByDay.get(l.day) ?? 0) + l.calories)
    for (const w of histWater) waterByDay.set(w.day, (waterByDay.get(w.day) ?? 0) + w.ml)
    const history = days.map((day) => ({
      day,
      calories: round1(kcalByDay.get(day) ?? 0),
      target: targets.calories,
      waterMl: Math.max(0, waterByDay.get(day) ?? 0),
    }))

    return NextResponse.json({
      date,
      profile: profileOut(profileHunter),
      targets,
      consumed,
      waterMl,
      meals,
      history,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("GET /api/nutrition", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}

// ─── POST /api/nutrition — action-based ───────────────────────────────────────

type ProfileUpdate = {
  heightCm?: number
  weightKg?: number
  birthYear?: number
  sex?: string
  activityLevel?: string
  goal?: string
  /** Macro-split preset id (MACRO_SPLITS) — null clears back to per-goal defaults. */
  macroSplit?: string | null
}

export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }
    const payload = body as Record<string, unknown>
    const action = String(payload.action ?? "")
    // R38 — the default day for every action below rolls at the hunter's midnight.
    const todayTz = dayKeyIn(hunter.timezone)

    // ── log-food ────────────────────────────────────────────────────────────
    if (action === "log-food") {
      const date = parseDay(payload.date, todayTz)
      if (!date) return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 })

      const mealType = typeof payload.mealType === "string" ? payload.mealType : ""
      if (!MEAL_TYPES.some((m) => m.id === mealType)) {
        return NextResponse.json({ error: "Invalid meal type." }, { status: 400 })
      }

      const name = typeof payload.name === "string" ? payload.name.trim() : ""
      if (name.length < 1 || name.length > 80) {
        return NextResponse.json({ error: "Food name must be 1–80 characters." }, { status: 400 })
      }

      const qty = Number(payload.qty)
      if (!Number.isFinite(qty) || qty < 0.1 || qty > 50) {
        return NextResponse.json({ error: "Quantity must be between 0.1 and 50." }, { status: 400 })
      }
      const qtyR = round2(qty)

      const perServing = [payload.calories, payload.protein, payload.carbs, payload.fat].map(Number)
      if (perServing.some((v) => !Number.isFinite(v))) {
        return NextResponse.json({ error: "Calories and macros must be numbers." }, { status: 400 })
      }
      // R68 · nutrition-audit B12 — one validation voice: negative macros are
      // a hard 400 here too (batch already clamped them silently; log-food
      // zeroed them silently — now both endpoints reject). Out-of-range-high
      // stays a silent clamp, mirroring the batch endpoint's R31-b bounds.
      if (perServing.some((v) => v < 0)) {
        return NextResponse.json({ error: "Calories and macros can't be negative." }, { status: 400 })
      }
      const [calP, proP, carP, fatP] = [
        clampRange(perServing[0], 0, 3000),
        clampRange(perServing[1], 0, 500),
        clampRange(perServing[2], 0, 500),
        clampRange(perServing[3], 0, 500),
      ]
      const [calories, protein, carbs, fat] = [calP, proP, carP, fatP].map((v) => round1(clampRange(v * qtyR, 0, 5000)))

      // R17-A — optional per-serving micros (fiber g · sodium mg · sugar g):
      // absent → 0, non-finite/negative → 0 (fail-open default — manual/custom
      // entries carry no micros this round). Scaled by qty exactly like the
      // macros, so rows store their qty-multiplied totals for plain-sum days.
      const microPerServing = [payload.fiber, payload.sodium, payload.sugar].map((v) => {
        if (v === undefined || v === null || v === "") return 0
        const n = Number(v)
        return Number.isFinite(n) && n > 0 ? n : 0
      })
      const [fiber, sodium, sugar] = microPerServing.map((v) => round1(clampRange(v * qtyR, 0, 100000)))

      const unit =
        typeof payload.unit === "string" && payload.unit.trim() ? payload.unit.trim().slice(0, 60) : "serving"

      // write through pdb() — the R17-A columns exist only on the healed client
      const isFirstToday = (await pdb().nutritionLog.count({ where: { hunterId: hunter.id, day: date } })) === 0
      const entry = await pdb().nutritionLog.create({
        data: { hunterId: hunter.id, day: date, mealType, name, qty: qtyR, unit, calories, protein, carbs, fat, fiber, sodium, sugar },
      })

      let xpGranted: number | undefined
      if (isFirstToday && (await grantOnce(hunter.id, date, FIRST_MEAL_NOTE, 5))) xpGranted = 5

      return NextResponse.json({ entry: mealEntryDTO(entry), ...(xpGranted !== undefined ? { xpGranted } : {}) })
    }

    // ── log-food-batch (R31-b · DESCRIBE-MEAL) ──────────────────────────────
    // One described meal → 1–12 rows in ONE transaction. Validation mirrors
    // log-food's messages/limits (name range/qty bounds are hard 400s; macros
    // clamp silently per the R31-b per-serving bounds before the qty multiply);
    // storage is qty-multiplied per row exactly like log-food, and the
    // first-meal-of-day XP check runs ONCE for the whole batch (a batch is one
    // meal event).
    if (action === "log-food-batch") {
      const date = parseDay(payload.date, todayTz)
      if (!date) return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 })

      const mealType = typeof payload.mealType === "string" ? payload.mealType : ""
      if (!MEAL_TYPES.some((m) => m.id === mealType)) {
        return NextResponse.json({ error: "Invalid meal type." }, { status: 400 })
      }

      const rawItems = payload.items
      if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 12) {
        return NextResponse.json({ error: "Items must be an array of 1–12 entries." }, { status: 400 })
      }

      const rows: {
        name: string
        qty: number
        unit: string
        calories: number
        protein: number
        carbs: number
        fat: number
        fiber: number
        sodium: number
        sugar: number
      }[] = []
      for (const raw of rawItems) {
        if (!raw || typeof raw !== "object") {
          return NextResponse.json({ error: "Each item must be an object." }, { status: 400 })
        }
        const it = raw as Record<string, unknown>

        const name = typeof it.name === "string" ? it.name.trim() : ""
        if (name.length < 1 || name.length > 60) {
          return NextResponse.json({ error: "Item name must be 1–60 characters." }, { status: 400 })
        }

        const qty = Number(it.qty)
        // R68 · B10/B12 — the batch floor drops to 0.1 (log-food's floor);
        // ⅛-serving rows no longer 400 on the batch path.
        if (!Number.isFinite(qty) || qty < 0.1 || qty > 50) {
          return NextResponse.json({ error: "Item quantity must be between 0.1 and 50." }, { status: 400 })
        }
        const qtyR = round2(qty)

        const perServing = [it.calories, it.protein, it.carbs, it.fat].map(Number)
        if (perServing.some((v) => !Number.isFinite(v))) {
          return NextResponse.json({ error: "Item calories and macros must be numbers." }, { status: 400 })
        }
        // R68 · B12 — negatives are a hard 400 (was: silent zero via clamp)
        if (perServing.some((v) => v < 0)) {
          return NextResponse.json({ error: "Item calories and macros can't be negative." }, { status: 400 })
        }
        // R31-b per-serving input bounds (silent clamp — log-food clamps
        // out-of-range macros rather than erroring; name/qty stay hard 400s)
        const [calP, proP, carP, fatP] = [
          clampRange(perServing[0], 0, 3000),
          clampRange(perServing[1], 0, 500),
          clampRange(perServing[2], 0, 500),
          clampRange(perServing[3], 0, 500),
        ]

        // optional micros — absent/blank/negative → 0 (fail-open, like log-food)
        const microPerServing = [it.fiber, it.sodium, it.sugar].map((v) => {
          if (v === undefined || v === null || v === "") return 0
          const n = Number(v)
          if (!Number.isFinite(n) || n <= 0) return 0
          return clampRange(n, 0, 5000)
        })

        const unit = typeof it.unit === "string" && it.unit.trim() ? it.unit.trim().slice(0, 20) : "serving"

        // qty-multiplied storage exactly like log-food L287–302
        rows.push({
          name,
          qty: qtyR,
          unit,
          calories: round1(clampRange(calP * qtyR, 0, 5000)),
          protein: round1(clampRange(proP * qtyR, 0, 5000)),
          carbs: round1(clampRange(carP * qtyR, 0, 5000)),
          fat: round1(clampRange(fatP * qtyR, 0, 5000)),
          fiber: round1(clampRange(microPerServing[0] * qtyR, 0, 100000)),
          sodium: round1(clampRange(microPerServing[1] * qtyR, 0, 100000)),
          sugar: round1(clampRange(microPerServing[2] * qtyR, 0, 100000)),
        })
      }

      // ONE transaction (import-route multi-row precedent): the first-meal
      // check reads today's count BEFORE any row lands, then per-row creates
      // through the healed client (the R17-A columns live on pdb()).
      const { entries, isFirstToday } = await pdb().$transaction(async (tx) => {
        const isFirst = (await tx.nutritionLog.count({ where: { hunterId: hunter.id, day: date } })) === 0
        const created: NutritionLog[] = []
        for (const row of rows) {
          created.push(
            await tx.nutritionLog.create({
              data: { hunterId: hunter.id, day: date, mealType, ...row },
            })
          )
        }
        return { entries: created, isFirstToday: isFirst }
      })

      let xpGranted: number | undefined
      if (isFirstToday && (await grantOnce(hunter.id, date, FIRST_MEAL_NOTE, 5))) xpGranted = 5

      return NextResponse.json({
        entries: entries.map(mealEntryDTO),
        logged: entries.length,
        ...(xpGranted !== undefined ? { xpGranted } : {}),
      })
    }

    // ── log-water ───────────────────────────────────────────────────────────
    if (action === "log-water") {
      const date = parseDay(payload.date, todayTz)
      if (!date) return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 })

      const ml = Number(payload.ml)
      if (!Number.isInteger(ml) || ml < -2000 || ml > 2000) {
        return NextResponse.json({ error: "Water amount must be an integer between -2000 and 2000 ml." }, { status: 400 })
      }

      // R68 · nutrition-audit B5 — the phantom-debt guard. dayWaterTotal
      // floors at 0, so a negative log beyond the current balance was
      // silently eaten by the hidden sum (+500, −1000 → 0): the row persisted,
      // the ledger showed nothing. A correction that would drive the day
      // below zero is rejected outright — correct the excess, not the memory.
      // `before` also feeds the 2 L first-crossing bonus below.
      const before = await dayWaterTotal(hunter.id, date)
      if (ml < 0 && before + ml < 0) {
        return NextResponse.json(
          { error: `That correction exceeds today's water log (${before} ml logged).` },
          { status: 400 },
        )
      }

      await db.waterLog.create({ data: { hunterId: hunter.id, day: date, ml } })
      const total = await dayWaterTotal(hunter.id, date)

      // Auto-verify the daily hydration goal at 3 L
      let questCompleted: boolean | undefined
      if (total >= 3000) {
        const quest = await db.quest.findFirst({
          where: { hunterId: hunter.id, kind: "daily", code: "daily-hydrate", day: date },
        })
        if (quest && !quest.claimed && quest.progress < quest.target) {
          await db.quest.update({
            where: { id: quest.id },
            data: { progress: 1, completedAt: new Date() },
          })
          questCompleted = true
        }
      }

      // First crossing of 2 L for the day pays a one-time bonus
      let xpGranted: number | undefined
      if (before < 2000 && total >= 2000 && (await grantOnce(hunter.id, date, HYDRATION_NOTE, 10))) {
        xpGranted = 10
      }

      return NextResponse.json({
        waterMl: total,
        ...(questCompleted !== undefined ? { questCompleted } : {}),
        ...(xpGranted !== undefined ? { xpGranted } : {}),
      })
    }

    // ── delete-entry ────────────────────────────────────────────────────────
    if (action === "delete-entry") {
      const id = typeof payload.id === "string" ? payload.id : ""
      if (!id) return NextResponse.json({ error: "Missing entry id." }, { status: 400 })

      const entry = await pdb().nutritionLog.findFirst({ where: { id, hunterId: hunter.id } })
      if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 })

      await pdb().nutritionLog.delete({ where: { id: entry.id } })
      return NextResponse.json({ ok: true })
    }

    // ── edit-entry (R70-c · per-entry EDIT) ─────────────────────────────────
    // WYSIWYG explicit-field edit: entries store qty-multiplied totals (log-food
    // scales per-serving FOODS values by qty at log time), so the edit saves
    // EXACTLY the submitted patch fields — no hidden re-derivation, no qty
    // rescale of the stored macros. Validation mirrors log-food field-for-field
    // via the shared pure validator (src/lib/nutrition-entry.ts — one truth,
    // probe-locked). XP-neutral by design, matching delete-entry's accepted
    // stance (worklog 5010): corrections neither grant nor revoke XP, so this
    // branch never touches the ledger or the first-meal bonuses.
    if (action === "edit-entry") {
      const id = typeof payload.id === "string" ? payload.id : ""
      if (!id) return NextResponse.json({ error: "Missing entry id." }, { status: 400 })

      const raw = payload.patch
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json({ error: "Invalid patch." }, { status: 400 })
      }
      const validated = validateEntryPatch(raw as Record<string, unknown>)
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
      if (Object.keys(validated.data).length === 0) {
        return NextResponse.json({ error: "No entry fields provided." }, { status: 400 })
      }

      // write through pdb() — the R17-A micro columns live on the healed client
      const entry = await pdb().nutritionLog.findFirst({ where: { id, hunterId: hunter.id } })
      if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 })

      const updated = await pdb().nutritionLog.update({ where: { id: entry.id }, data: validated.data })
      return NextResponse.json({ entry: mealEntryDTO(updated) })
    }

    // ── set-profile ─────────────────────────────────────────────────────────
    if (action === "set-profile") {
      const data: ProfileUpdate = {}

      if (payload.heightCm !== undefined && payload.heightCm !== null) {
        const v = Number(payload.heightCm)
        if (!Number.isFinite(v) || v < 100 || v > 250) {
          return NextResponse.json({ error: "Height must be between 100 and 250 cm." }, { status: 400 })
        }
        data.heightCm = round1(v)
      }
      if (payload.weightKg !== undefined && payload.weightKg !== null) {
        const v = Number(payload.weightKg)
        if (!Number.isFinite(v) || v < 25 || v > 300) {
          return NextResponse.json({ error: "Weight must be between 25 and 300 kg." }, { status: 400 })
        }
        data.weightKg = round1(v)
      }
      if (payload.birthYear !== undefined && payload.birthYear !== null) {
        const v = Number(payload.birthYear)
        if (!Number.isInteger(v) || v < 1920 || v > new Date().getFullYear()) {
          return NextResponse.json({ error: "Birth year must be between 1920 and the current year." }, { status: 400 })
        }
        data.birthYear = v
      }
      if (payload.sex !== undefined && payload.sex !== null) {
        const v = String(payload.sex)
        if (v !== "male" && v !== "female") {
          return NextResponse.json({ error: "Sex must be male or female." }, { status: 400 })
        }
        data.sex = v
      }
      if (payload.activityLevel !== undefined && payload.activityLevel !== null) {
        const v = String(payload.activityLevel)
        if (!ACTIVITY_LEVELS.some((a) => a.id === v)) {
          return NextResponse.json({ error: "Unknown activity level." }, { status: 400 })
        }
        data.activityLevel = v
      }
      if (payload.goal !== undefined && payload.goal !== null) {
        const v = String(payload.goal)
        if (!GOALS.some((g) => g.id === v)) {
          return NextResponse.json({ error: "Unknown goal." }, { status: 400 })
        }
        data.goal = v
      }
      if (payload.macroSplit !== undefined) {
        if (payload.macroSplit === null || payload.macroSplit === "") {
          data.macroSplit = null
        } else {
          const v = String(payload.macroSplit)
          if (!MACRO_SPLITS.some((s) => s.id === v)) {
            return NextResponse.json({ error: "Unknown macro split." }, { status: 400 })
          }
          data.macroSplit = v
        }
      }

      if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "No profile fields provided." }, { status: 400 })
      }

      const updated = await pdb().hunter.update({ where: { id: hunter.id }, data })

      // A new weight doubles as today's body-metric sample
      if (data.weightKg !== undefined) {
        const today = todayTz
        await db.bodyMetric.upsert({
          where: { hunterId_day_type: { hunterId: hunter.id, day: today, type: "weight" } },
          create: { hunterId: hunter.id, day: today, type: "weight", unit: "kg", value: data.weightKg },
          update: { value: data.weightKg, unit: "kg" },
        })
      }

      return NextResponse.json({ profile: profileOut(updated) })
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/nutrition", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
