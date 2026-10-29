// ─── PRIME · GPX 1.1 route export (R23-a — Strava/Garmin/Runkeeper bridge) ─────
// Standards-compliant GPX 1.1 serialization of a recorded route, so the track
// a user just ran imports NATIVELY into Strava, Garmin Connect, Runkeeper and
// Google Earth. Pure string building over RoutePoint[] (the sensor store's
// in-memory fix log) — ZERO DOM, zero store imports, so scratch QA scripts can
// exercise every escaping/skip path headlessly. The only DOM surface lives in
// lib/export/share.ts (Web Share dispatch + download fallback), mirroring the
// R20-c CSV bridge.
//
// HONESTY LEDGER (what this artifact claims — and deliberately does NOT):
// · NO <ele> ELEMENTS, EVER. RoutePoint carries no altitude — the browser
//   Geolocation API reports one, but the recorder's store shape never kept it.
//   Fabricating <ele>0</ele> would render as a confident sea-level flatline in
//   every elevation-graph consumer. Absent data stays absent.
// · Fixes with non-finite or out-of-range coordinates (or a non-finite time)
//   are SKIPPED, never clamped, never rounded into range — and the count is
//   reported (sanitizeTrackPoints.skipped) so the UI can disclose it.
// · Times are the fix timestamps, verbatim, ISO 8601 UTC with millisecond
//   precision. Nothing is re-clocked.
// · Distance in the description line is the SAME filtered cumulativeDistanceM
//   the recorder's own summary shows (lib/sensors/gps-route) — the artifact's
//   claims match the app's claims.
// · <type> is the plain string "running": the GPX 1.1 XSD defines trk/type as
//   a FREE-FORM xsd:string ("Type (classification) of track." — verified
//   against http://www.topografix.com/GPX/1/1/gpx.xsd) with NO numeric
//   enumeration. The "9" seen in Strava/Garmin legacy exports is a VENDOR
//   convention, not the schema — an opaque number to every consumer outside
//   that table. PRIME's recorder is a run recorder by design (OUTDOOR RUN
//   framing, min/km pace), so the honest classification is the human-readable
//   schema-valid word. Importers that read it get a real word; importers that
//   ignore it (Strava upload asks the user anyway) lose nothing.
// · EMPTY INPUT → a still-valid GPX with an EMPTY <trkseg> and NO <metadata>
//   <time> (minOccurs=0 in the schema — absence, not a fabricated start).
//   Chosen over a thrown guard so a defensive call can never crash the export
//   path; the UI gates the button behind "nothing to export" regardless.
//
// SCHEMA ORDER (byte-verified against the official XSD, both sequences):
//   metadataType: name, desc, author, copyright, link, time, keywords, bounds
//   trkType:      name, cmt, desc, src, link, number, type, extensions, trkseg

import { cumulativeDistanceM, formatDistance, type RoutePoint } from "@/lib/sensors/gps-route"

// ── Constants ─────────────────────────────────────────────────────────────────

/** GPX 1.1 creator string — who wrote the file (required gpx attribute). */
export const GPX_CREATOR = "PRIME Adaptive Training System"

/** Standard GPX 1.1 namespace + schema location attributes. */
const GPX_ROOT_ATTRS =
  'version="1.1" ' +
  `creator="${GPX_CREATOR}" ` +
  'xmlns="http://www.topografix.com/GPX/1/1" ' +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd"'

/** Fixed decimal places for lat/lon — 6 dp ≈ 0.11 m at the equator (sub-meter). */
const COORD_DP = 6

/** Default route name prefix — the em-dash house idiom, honest UTC date. */
const DEFAULT_NAME_PREFIX = "PRIME Route"

// ── Small pure helpers ────────────────────────────────────────────────────────

/** XML-escape the five predefined entities (& < > " '). & first, always. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** ISO 8601 UTC with millisecond precision ("2026-10-08T06:30:02.100Z"). */
function isoZ(epochMs: number): string {
  return new Date(epochMs).toISOString()
}

/** UTC calendar stamp "YYYY-MM-DD" for the default route name. */
function utcDateStamp(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10)
}

/** True when a fix's lat/lon are finite AND inside the GPX schema's ranges
 *  (latitudeType [-90,90], longitudeType [-180,180] — min/maxInclusive). */
function plausibleCoord(p: RoutePoint): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lon >= -180 &&
    p.lon <= 180
  )
}

// ── Track sanitization ────────────────────────────────────────────────────────

/**
 * Drop every fix that cannot be an honest <trkpt> — non-finite or schema-range
 * violating coordinates, or a non-finite timestamp — and COUNT the drops so
 * callers can disclose them. Skipped points are never clamped or repaired:
 * a fix with no usable coordinate is absent data, not data to bend.
 */
export function sanitizeTrackPoints(points: RoutePoint[]): { points: RoutePoint[]; skipped: number } {
  const kept: RoutePoint[] = []
  let skipped = 0
  for (const p of points) {
    if (plausibleCoord(p) && Number.isFinite(p.t)) kept.push(p)
    else skipped++
  }
  return { points: kept, skipped }
}

// ── GPX building ──────────────────────────────────────────────────────────────

/**
 * Serialize a fix log as a complete GPX 1.1 document: XML declaration, gpx
 * root (standard namespaces + schemaLocation), metadata (name, optional
 * description, start time when a fix exists), and ONE <trk> holding ONE
 * <trkseg> with one <trkpt lat lon> + <time> per kept fix.
 *
 * · name defaults to "PRIME Route — YYYY-MM-DD" (UTC date of the FIRST kept
 *   fix; the export moment when the track is empty — a name is not a claim
 *   about the track, the times inside are).
 * · description (when given) lands in <metadata><desc>, before <time>, in
 *   schema order. It is not duplicated into <trk>.
 * · No <ele>, ever — see the honesty ledger at the top of this file.
 * · Non-plausible fixes are skipped and counted via sanitizeTrackPoints.
 * · Empty input → valid GPX, empty <trkseg>, no <metadata> time.
 */
export function buildGpx(points: RoutePoint[], opts: { name?: string; description?: string } = {}): string {
  const kept = sanitizeTrackPoints(points).points
  const startedAt = kept.length > 0 ? kept[0].t : Date.now()
  const name = opts.name ?? `${DEFAULT_NAME_PREFIX} — ${utcDateStamp(startedAt)}`

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(`<gpx ${GPX_ROOT_ATTRS}>`)
  lines.push("  <metadata>")
  lines.push(`    <name>${xmlEscape(name)}</name>`)
  if (opts.description !== undefined && opts.description !== "") {
    lines.push(`    <desc>${xmlEscape(opts.description)}</desc>`)
  }
  if (kept.length > 0) {
    // start time = the FIRST kept fix — a real timestamp the track owns.
    // Empty track → no <time> element at all (honest absence).
    lines.push(`    <time>${isoZ(startedAt)}</time>`)
  }
  lines.push("  </metadata>")
  lines.push("  <trk>")
  lines.push(`    <name>${xmlEscape(name)}</name>`)
  lines.push(`    <type>running</type>`)
  lines.push("    <trkseg>")
  for (const p of kept) {
    lines.push(`      <trkpt lat="${p.lat.toFixed(COORD_DP)}" lon="${p.lon.toFixed(COORD_DP)}">`)
    lines.push(`        <time>${isoZ(p.t)}</time>`)
    lines.push("      </trkpt>")
  }
  lines.push("    </trkseg>")
  lines.push("  </trk>")
  lines.push("</gpx>")
  return `${lines.join("\n")}\n`
}

// ── Filename / description helpers ────────────────────────────────────────────

/**
 * Download filename from the route's start (epoch ms): UTC date + HHmm,
 * e.g. "prime-route-2026-10-08-0630.gpx". A non-finite start falls back to
 * the export moment — the dispatch needs a filename, and the file's own
 * metadata carries the honest times regardless.
 */
export function gpxFileName(startedAt: number): string {
  const t = Number.isFinite(startedAt) ? startedAt : Date.now()
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, "0")
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  const hm = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  return `prime-route-${stamp}-${hm}.gpx`
}

/**
 * One-line summary for <metadata><desc>: distance (the recorder's own filtered
 * cumulativeDistanceM over the KEPT fixes — the artifact describes itself),
 * kept-point count, start → end times, and — when fixes were dropped — the
 * skip count, disclosed. "0 M · 0 POINTS · NO GPS FIX" for an empty track.
 */
export function gpxStats(points: RoutePoint[]): string {
  const { points: kept, skipped } = sanitizeTrackPoints(points)
  if (kept.length === 0) return "0 M · 0 POINTS · NO GPS FIX"
  const parts = [
    `${formatDistance(cumulativeDistanceM(kept))} · ${kept.length} POINT${kept.length === 1 ? "" : "S"}`,
    `${isoZ(kept[0].t)} → ${isoZ(kept[kept.length - 1].t)}`,
  ]
  if (skipped > 0) {
    parts.push(`${skipped} FIX${skipped === 1 ? "" : "ES"} SKIPPED — NO USABLE COORDINATE`)
  }
  return parts.join(" · ")
}

// ── Structural validation (round-trip check for QA) ──────────────────────────

/**
 * Lightweight structural plausibility check — no DOM dependency, so it runs
 * in any runtime (bun scratch tests, non-DOM edges). True when the document
 * has an XML declaration, a <gpx> root (version 1.1), at least one <trkseg>
 * and at least one <trkpt lat lon> pair, and closes its root. False for the
 * honest empty artifact (zero trackpoints = no plausible track), which is
 * exactly the distinction callers care about.
 */
export function isPlausibleGpx(xml: string): boolean {
  if (typeof xml !== "string" || xml.length === 0) return false
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) return false
  if (!/<gpx\s+version="1\.1"\s+creator="[^"]+"/.test(xml)) return false
  if (!/<trkseg>/.test(xml)) return false
  if (!/<trkpt lat="-?\d+\.\d+" lon="-?\d+\.\d+">/.test(xml)) return false
  return xml.trimEnd().endsWith("</gpx>")
}
