import { NextResponse } from "next/server"
import { requireHunter } from "@/lib/engine"
import { IMPORT_TEMPLATE, applyImport, importSummary, parseImport } from "@/lib/csv"

export const dynamic = "force-dynamic"

// ─── GET /api/import — format docs + downloadable template ────────────────────

export async function GET() {
  return NextResponse.json({
    formats: [
      {
        id: "myfitnesspal",
        label: "MyFitnessPal food export",
        hint: "Food diary → Export → CSV. Columns: Date, Meal, Food, Qty, Unit, Calories, macros.",
      },
      {
        id: "google-takeout",
        label: "Google Takeout · Google Fit",
        hint: "Takeout → Google Fit → CSVs. Weight and step-count aggregates are detected automatically.",
      },
      {
        id: "ascendant",
        label: "ASCENDANT template",
        hint: "One sheet for everything: meals, water and body metrics. See template below.",
      },
    ],
    template: IMPORT_TEMPLATE,
  })
}

// ─── POST /api/import — { csv: string, dryRun?: boolean } ─────────────────────

const MAX_CSV_BYTES = 2_000_000

export async function POST(req: Request) {
  try {
    const hunter = await requireHunter()
    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
    }
    const payload = body as Record<string, unknown>

    const csv = typeof payload.csv === "string" ? payload.csv : ""
    if (!csv.trim()) {
      return NextResponse.json({ error: "Paste CSV text or choose a .csv file first." }, { status: 400 })
    }
    if (csv.length > MAX_CSV_BYTES) {
      return NextResponse.json({ error: "File too large — keep imports under 2 MB of CSV text." }, { status: 400 })
    }

    const dryRun = payload.dryRun !== false
    const parsed = parseImport(csv)

    if (parsed.format === "unknown") {
      return NextResponse.json(
        {
          error:
            "Could not recognize this CSV. Supported: MyFitnessPal food exports, Google Takeout weight/step CSVs, and the ASCENDANT template.",
        },
        { status: 422 }
      )
    }
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: `Recognized ${importSummary(parsed).formatLabel}, but no valid rows were found inside.` },
        { status: 422 }
      )
    }

    if (dryRun) {
      return NextResponse.json(importSummary(parsed))
    }

    const applied = await applyImport(hunter.id, parsed.rows)
    return NextResponse.json({
      ...importSummary(parsed),
      inserted: applied.inserted,
      daysTouched: applied.daysTouched,
      preview: null,
    })
  } catch (e) {
    if ((e as Error).message === "NO_HUNTER") return NextResponse.json({ error: "NOT_AWAKENED" }, { status: 404 })
    console.error("POST /api/import", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
