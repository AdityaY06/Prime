// ─── PRIME · GPX 1.1 export (R30-b — route interchange) ──────────────────────
// Pure, dependency-free serializer: a recorded route's fix log → a valid GPX
// 1.1 document. WHY GPX 1.1: it is the universal GPS-track interchange format
// of the fitness world — Strava, Komoot and Runalyze all ingest GPX 1.1 file
// uploads on their import/upload surfaces, and the schema has been frozen and
// stable at topografix.com since 2004 (no vendor lock, no version churn).
// Exporting the track means a route recorded here lives anywhere, not just in
// this app's in-memory recorder.
//
// HONESTY LEDGER (what this serializer claims — and deliberately does NOT):
// · Fewer than 2 exportable fixes → NULL, never an empty <trkseg>: a
//   degenerate route is not a route, and the UI renders the honest disabled
//   state instead of a file that pretends otherwise.
// · <ele> only on fixes that actually reported altitude; <time> only on fixes
//   with a finite timestamp. Absent data is omitted, never invented.
// · lat/lon at 6 decimals (~0.11 m at the equator — beyond any GPS fix
//   precision, so no false accuracy theater); ele at 1 decimal (GPS/baro
//   altitude is ± meters at best).
// · The track is the fix log EXACTLY as the recorder stored it (accuracy
//   gating happens upstream in the watch pipe). distance/movingMs ride the
//   meta for honest naming upstream — GPX 1.1 metadata carries name + time
//   only, so the numbers are NOT smuggled into the document.
//
// ALTITUDE NOTE: gps-route.ts's RoutePoint (R21-c) is deliberately minimal
// (lat/lon/accuracy/t — pure math never needed height). The sensor store's
// watch pipe attaches the fix's altitude as an OPTIONAL structural extra
// when the platform reports one; this module reads it tolerantly via the
// GpxPoint widening below rather than touching the pure math module's type.

import type { RoutePoint } from "@/lib/sensors/gps-route"

/** RoutePoint widened with the optional altitude the watch pipe attaches (meters). */
export type GpxPoint = RoutePoint & { alt?: number }

/** Header facts for the document; name/time serialize, distance/movingMs do not. */
export type GpxMeta = {
  /** Track name (metadata) — XML-escaped on output. */
  name: string
  /** Route start, ISO 8601 — the <metadata><time>. */
  startedAt: string
  /** Filtered distance (m) — naming contract upstream, not serialized. */
  distanceM: number
  /** Moving time (ms) — naming contract upstream, not serialized. */
  movingMs: number
}

// ── Escaping ──────────────────────────────────────────────────────────────────

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
}

/** XML character escaping — the five predefined entities, nothing more. */
export function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c] ?? c)
}

// ── Tolerant field reads (honest omission, never invention) ──────────────────

/** Finite altitude in meters when the fix reported one; null otherwise. */
function eleM(p: RoutePoint): number | null {
  const alt = (p as GpxPoint).alt
  return typeof alt === "number" && Number.isFinite(alt) ? alt : null
}

/** ISO 8601 for a fix's epoch-ms timestamp; null when the fix didn't say. */
function isoTime(t: number): string | null {
  if (!Number.isFinite(t)) return null
  const iso = new Date(t).toISOString()
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

// ── Serializer ────────────────────────────────────────────────────────────────

/**
 * Serialize a fix log as GPX 1.1: XML declaration, one <gpx> root (creator +
// TopoGrafix namespace), <metadata> name/time, ONE <trk> holding ONE <trkseg>
 * of <trkpt lat/lon> (+ <ele>, + <time>). Returns NULL when fewer than 2
 * fixes with finite coordinates exist — the honest degenerate-route answer.
 * Lightly newline-indented (parsers don't care; humans diffing do).
 */
export function routeToGpx(points: readonly RoutePoint[], meta: GpxMeta): string | null {
  // non-finite coordinates cannot be written as decimals — they are dropped,
  // and dropping can push an already-thin track below the 2-point floor
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (pts.length < 2) return null
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="PRIME Training System" xmlns="http://www.topografix.com/GPX/1/1">',
    "  <metadata>",
    `    <name>${xmlEscape(meta.name)}</name>`,
    `    <time>${xmlEscape(meta.startedAt)}</time>`,
    "  </metadata>",
    "  <trk>",
    "    <trkseg>",
  ]
  for (const p of pts) {
    lines.push(`    <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">`)
    const ele = eleM(p)
    if (ele !== null) lines.push(`      <ele>${ele.toFixed(1)}</ele>`)
    const time = isoTime(p.t)
    if (time !== null) lines.push(`      <time>${time}</time>`)
    lines.push("    </trkpt>")
  }
  lines.push("    </trkseg>", "  </trk>", "</gpx>", "")
  return lines.join("\n")
}
