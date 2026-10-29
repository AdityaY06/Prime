// ─── PRIME · Fastrack watch bridge (R31-c — sensor hub, Vitals tab 04/LINK) ────
//
// THE HONESTY LEDGER (read before touching anything here):
// · Fastrack Reflex/Beat watches sync to the Fastrack PHONE APP over BLE
//   (Play Store). There is NO public Fastrack cloud API a web app can call —
//   PRIME is a PWA and cannot read the Fastrack app's database. Any "sync"
//   that claimed otherwise would be theater.
// · What the browser CAN do: many wearables — Fastrack Reflex models
//   included, when the watch exposes the standard Bluetooth SIG Heart Rate
//   Service 0x180D (typically during workout mode) — stream live HR straight
//   to the page via Web Bluetooth. PRIME already owns that pipe for chest
//   straps (lib/sensors/bluetooth-hr + the sensor store); the Fastrack card
//   reuses it with a Fastrack-aware presentation. ONE live link at a time.
// · What the browser CANNOT do: read the day's steps/sleep/resting-HR/SpO₂
//   history the Fastrack app keeps. Those numbers are bridged by the hunter
//   (WATCH DAY SYNC) into BodyMetric rows — from where readiness, health
//   score and trends already consume them, because those metric types flow
//   through the app.
// · NEVER fabricate a "connected" state: a watch that doesn't appear in the
//   Web-Bluetooth chooser, or a number the user hasn't typed, is an honest
//   gap, not a zero.
//
// PURITY: no DOM, no store, no imports — deterministic strings and math only
// (the science.ts / rpe.ts discipline). The bounds below MIRROR the server's
// POST /api/metrics METRIC_RANGES exactly (steps 0–100000, sleep 0–16 h,
// restingHr 30–120 bpm, spo2 85–100 %) so the client never sends a request
// the server would reject.

/** Substrings that mark a BLE device as a Fastrack-family wearable.
 * Matched case-insensitively against the chooser name / Device Information
 * model + manufacturer strings ("Fastrack Reflex 3.0", "FST-1234",
 * "Reflex Beat", "FTX Pro" — any case). "fst"/"ftx" cover the short BLE
 * advertising names Fastrack models often expose. */
export const FASTRACK_NAME_HINTS: readonly string[] = ["fastrack", "reflex", "fst", "ftx", "beat"]

/**
 * True when ANY non-empty hint appears as a case-insensitive substring in any
 * provided part (live device name, Device Information model/manufacturer,
 * persisted last-link name — null/undefined/empty parts are simply skipped).
 * A miss is NOT proof of "not a Fastrack" — the honest read is "no Fastrack
 * evidence in the name"; callers phrase the badge accordingly.
 */
export function isFastrackDevice(...parts: (string | null | undefined)[]): boolean {
  for (const part of parts) {
    if (typeof part !== "string" || part.length === 0) continue
    const haystack = part.toLowerCase()
    for (const hint of FASTRACK_NAME_HINTS) {
      if (hint.length > 0 && haystack.includes(hint)) return true
    }
  }
  return false
}

/** One WATCH DAY SYNC field — a number the Fastrack app shows that PRIME
 * commits as a BodyMetric. Bounds mirror the server's METRIC_RANGES. */
export type WatchSyncField = {
  /** BodyMetric type id (POST /api/metrics `type`). */
  metricId: string
  /** Uppercase row label. */
  label: string
  /** Unit suffix for the row. */
  unit: string
  /** Inclusive lower bound (server-validated). */
  min: number
  /** Inclusive upper bound (server-validated). */
  max: number
  /** Stepper increment. */
  step: number
  /** WHERE the number lives in the Fastrack app (the honest wayfinding). */
  hint: string
  /** Readout placeholder while unset (greyed example — never a value). */
  placeholder: string
}

/** The four daily numbers the Fastrack app surfaces that PRIME consumes.
 * Steps/sleep/restingHr/spo2 — each feeds readiness, health score and trends
 * through the existing metric pipeline. */
export const WATCH_SYNC_FIELDS: readonly WatchSyncField[] = [
  {
    metricId: "steps",
    label: "STEPS",
    unit: "steps",
    min: 0,
    max: 100000,
    step: 100,
    hint: "TODAY'S STEPS — FASTRACK APP HOME SCREEN / STEPS TILE.",
    placeholder: "8400",
  },
  {
    metricId: "sleep",
    label: "SLEEP",
    unit: "h",
    min: 0,
    max: 16,
    step: 0.5,
    hint: "LAST NIGHT'S TOTAL SLEEP — FASTRACK APP SLEEP SCREEN.",
    placeholder: "7.5",
  },
  {
    metricId: "restingHr",
    label: "RESTING HR",
    unit: "bpm",
    min: 30,
    max: 120,
    step: 1,
    hint: "RESTING HEART RATE — FASTRACK APP HEART RATE SCREEN.",
    placeholder: "62",
  },
  {
    metricId: "spo2",
    label: "SPO₂",
    unit: "%",
    min: 85,
    max: 100,
    step: 1,
    hint: "BLOOD OXYGEN — FASTRACK APP HEALTH / HR SCREEN.",
    placeholder: "98",
  },
] as const

/** The sync field for a metric id, or null when the id isn't one of the four. */
export function syncFieldFor(metricId: string): WatchSyncField | null {
  return WATCH_SYNC_FIELDS.find((f) => f.metricId === metricId) ?? null
}

/** The data-flow line for the bridge diagram (join with " → "): watch → the
 * phone app it syncs to → the PRIME store the numbers land in. */
export const FASTRACK_PIPELINE: readonly string[] = ["FASTRACK WATCH", "FASTRACK APP · PHONE", "PRIME BODY METRICS"]

/**
 * Client-side gate that MIRRORS the server's POST /api/metrics validation:
 * finite number inside the field's [min, max] → returned rounded to 1 decimal
 * (the server's `Math.round(value * 10) / 10`); out-of-range, non-finite or
 * unknown metric → null, so the UI surfaces the range hint instead of sending
 * a request the server would reject. Despite the name this REJECTS rather
 * than clamps — same philosophy as the metrics route (reject-don't-clamp):
 * a silently clamped "150000 steps" would be fabricated data.
 */
export function clampSyncValue(metricId: string, value: number): number | null {
  const field = syncFieldFor(metricId)
  if (field === null) return null
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  if (value < field.min || value > field.max) return null
  return Math.round(value * 10) / 10
}
