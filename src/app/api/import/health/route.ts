import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireHunter } from "@/lib/engine"
import {
  dedupeAgainst,
  healthDaysPreview,
  healthImportTotals,
  ImportParseError,
  parseHealthCsv,
} from "@/lib/import/health-csv"

export const dynamic = "force-dynamic"

// ─── /api/import/health — health-metrics CSV import (R22-a) ───────────────────
// POST { csv: string, dryRun?: true } → PREVIEW ONLY, never writes.
// POST { csv: string, confirm: true } → ONE db.$transaction (vault precedent):
//   per entry → BodyMetric UPSERT on the @@unique(hunterId, day, type) — so a
//   concurrent double-confirm can never crash on the constraint, it updates.
//   Storage semantic documented in the schema: one value per type per day,
//   latest wins. Re-importing the same file is a NO-OP by construction —
//   (day, type) pairs already logged are marked "ALREADY LOGGED" and excluded
//   by dedupeAgainst, re-checked INSIDE the transaction.
//
// HONESTY CONTRACT:
// - Bounds/skips live in lib/import/health-csv.ts (pure, tested) — the route
//   never sanitizes, never clamps a lie into range.
// - No XP, no quest auto-verify, no streak touch: importing history is
//   backfill, not a live check-in (the /api/metrics POST +5 XP bonus and the
//   daily-sleep quest hook deliberately do NOT fire here).
// - Weight DOES flow back into the hunter profile (mirrors /api/metrics POST)
//   but only when the import EXTENDS the latest weight day forward — an old
//   backfill never regresses today's profile weight to stale history.
// - The response reports what the import genuinely UNLOCKS (distinct days of
//   sleep / restingHr / mood / energy — the /api/readiness inputs), computed
//   inside the same transaction so the numbers are post-commit truth.
// - Import caps: ≤ 2000 entries and ≤ 2 MB per file (parser throws; mapped to
//   400 below with the honest reason).

/** Distinguishes the honest all-dupes/empty abort from a real failure. */
class ImportAbortedError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

/** The BodyMetric types that feed /api/readiness (readiness + RHR baseline). */
const READINESS_TYPES = ["sleep", "restingHr", "mood", "energy"] as const

const PREVIEW_DAYS_CAP = 60

type RouteBody = { csv?: unknown; dryRun?: unknown; confirm?: unknown }

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as RouteBody | null
    const csv = typeof body?.csv === "string" ? body.csv : null
    if (!csv || !csv.trim()) {
      return NextResponse.json({ error: "CSV_REQUIRED", reason: "NO CSV TEXT SUPPLIED" }, { status: 400 })
    }
    const dryRun = body?.dryRun === true
    const confirm = body?.confirm === true
    if (!dryRun && !confirm) {
      return NextResponse.json(
        { error: "CONFIRM_REQUIRED", reason: "PASS dryRun: true FOR A PREVIEW OR confirm: true TO COMMIT" },
        { status: 400 },
      )
    }

    const hunter = await requireHunter()

    let parsed
    try {
      parsed = parseHealthCsv(csv)
    } catch (e) {
      if (e instanceof ImportParseError) {
        return NextResponse.json({ error: "NO_METRICS", reason: e.reason }, { status: 400 })
      }
      throw e
    }

    // ── dry-run: preview only, NEVER writes ─────────────────────────────────
    if (dryRun) {
      const existingRows = await db.bodyMetric.findMany({
        where: { hunterId: hunter.id },
        select: { day: true, type: true },
      })
      const deduped = dedupeAgainst(parsed, existingRows)
      return NextResponse.json({
        ok: true,
        totals: healthImportTotals(deduped),
        days: healthDaysPreview(deduped, PREVIEW_DAYS_CAP),
        skipped: deduped.skipped.slice(0, 20),
        duplicates: parsed.entries.length - deduped.entries.length,
      })
    }

    // ── confirm: one transaction, vault precedent ───────────────────────────
    const created = await db.$transaction(
      async (tx) => {
        // dedupe re-checked inside the transaction — a double-confirm or a
        // concurrent import can never slip a duplicate past this read
        const existingRows = await tx.bodyMetric.findMany({
          where: { hunterId: hunter.id },
          select: { day: true, type: true },
        })
        const deduped = dedupeAgainst(parsed, existingRows)
        if (deduped.entries.length === 0) {
          throw new ImportAbortedError(
            deduped.skipped.length > 0
              ? "NOTHING IMPORTABLE — ALL ROWS SKIPPED OR ALREADY LOGGED"
              : "NOTHING IMPORTABLE",
          )
        }

        const byType: Record<string, number> = {}
        const daySet = new Set<string>()
        for (const e of deduped.entries) {
          await tx.bodyMetric.upsert({
            where: { hunterId_day_type: { hunterId: hunter.id, day: e.day, type: e.type } },
            create: { hunterId: hunter.id, day: e.day, type: e.type, value: e.value, unit: e.unit },
            update: { value: e.value, unit: e.unit },
          })
          byType[e.type] = (byType[e.type] ?? 0) + 1
          daySet.add(e.day)
        }

        // Weight → hunter profile sync, but ONLY when the import extends the
        // latest weight day forward (never regresses to stale history).
        let profileWeightSynced = false
        const importedWeightDays = deduped.entries.filter((e) => e.type === "weight").map((e) => e.day)
        if (importedWeightDays.length > 0) {
          const latest = await tx.bodyMetric.findFirst({
            where: { hunterId: hunter.id, type: "weight" },
            orderBy: { day: "desc" },
          })
          if (latest && importedWeightDays.includes(latest.day) && hunter.weightKg !== latest.value) {
            await tx.hunter.update({ where: { id: hunter.id }, data: { weightKg: latest.value } })
            profileWeightSynced = true
          }
        }

        // What the import genuinely unlocks — distinct days of readiness-input
        // metrics + weight, computed post-commit inside the same transaction.
        const vitalRows = await tx.bodyMetric.findMany({
          where: { hunterId: hunter.id, type: { in: [...READINESS_TYPES, "weight"] } },
          select: { day: true, type: true },
        })
        const readinessDays = new Set<string>()
        const rhrDays = new Set<string>()
        const sleepDays = new Set<string>()
        const weightDays = new Set<string>()
        for (const r of vitalRows) {
          if ((READINESS_TYPES as readonly string[]).includes(r.type)) readinessDays.add(r.day)
          if (r.type === "restingHr") rhrDays.add(r.day)
          if (r.type === "sleep") sleepDays.add(r.day)
          if (r.type === "weight") weightDays.add(r.day)
        }

        return {
          entries: deduped.entries.length,
          days: daySet.size,
          byType,
          profileWeightSynced,
          unlocks: {
            readinessDays: readinessDays.size,
            rhrDays: rhrDays.size,
            sleepDays: sleepDays.size,
            weightDays: weightDays.size,
          },
        }
      },
      { timeout: 30_000 },
    )

    return NextResponse.json({ ok: true, created })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") {
      return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    }
    if (e instanceof ImportParseError) {
      return NextResponse.json({ error: "NO_METRICS", reason: e.reason }, { status: 400 })
    }
    if (e instanceof ImportAbortedError) {
      return NextResponse.json({ error: "NOTHING_TO_IMPORT", reason: e.reason }, { status: 400 })
    }
    console.error("POST /api/import/health", e)
    return NextResponse.json({ error: "IMPORT_FAILED" }, { status: 500 })
  }
}
