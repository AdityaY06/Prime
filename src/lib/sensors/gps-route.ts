// ─── PRIME · GPS route math (R21-c — route recorder) ──────────────────────────
// Pure, dependency-free math for outdoor route tracking: haversine distance,
// accuracy/jitter-filtered cumulative distance, pace formatting, EMA speed
// smoothing and auto-pause detection. ZERO DOM/browser APIs — consumed by the
// sensor store (client, live readout) and /api/gps-log (server, notes label),
// so both sides derive identical numbers from the same helpers.
//
// HONESTY LEDGER (what this engine claims — and deliberately does NOT):
// · Distance is a STRAIGHT-LINE sum between successive accepted fixes
//   (haversine, spherical earth R = 6 371 000 m). No barometric, grade or
//   sensor-fusion correction — GPS-only always reads slightly short on
//   curves. Strava-grade map-matching is intentionally NOT reimplemented.
// · Fixes with a REPORTED accuracy worse than 50 m are discarded outright —
//   they never anchor and never accumulate.
// · Displacements under 3 m from the last ACCEPTED fix are GPS jitter: they
//   do not advance distance and do not re-anchor (standing still stays 0 M).
// · Duration is MOVING time: a segment's time counts only when its derived
//   speed ≥ 0.5 m/s, and each segment is capped at 300 s — a GPS gap must
//   not invent standing time. The clock starts at the FIRST accepted fix.
// · Pace above 99 min/km is standing, not a pace — it renders "—".

// ── Track shape ───────────────────────────────────────────────────────────────

/** One accepted-or-not GPS fix as the recorder stores it. */
export type RoutePoint = {
  lat: number
  lon: number
  /** Reported fix accuracy in meters — undefined when the fix didn't say. */
  accuracy?: number
  /** Fix time, epoch ms (GeolocationPosition.timestamp). */
  t: number
}

// ── Filter constants ──────────────────────────────────────────────────────────

/** Fixes reporting accuracy worse than this are discarded entirely. */
export const ACCURACY_GATE_M = 50
/** Sub-displacement treated as GPS jitter — does not advance distance. */
export const MIN_DISPLACEMENT_M = 3
/** Below this derived speed the recorder reports PAUSED. */
export const PAUSE_SPEED_MPS = 0.5
/** EMA smoothing factor for the live speed readout (α ≈ 0.3, ~2-fix memory). */
export const EMA_ALPHA = 0.3
/** Per-segment moving-time cap — a GPS gap must not invent time. */
export const MAX_SEGMENT_MS = 300_000

// ── Distance ──────────────────────────────────────────────────────────────────

/**
 * Great-circle distance between two points on a spherical earth
 * (R = 6 371 000 m — the IUGG mean radius). Identical points → exactly 0.
 */
export function haversineM(a: RoutePoint, b: RoutePoint): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const lat1 = a.lat * rad
  const lat2 = b.lat * rad
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  // asin domain guard: FP noise can push sqrt(h) a hair past 1
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** True when a fix passes the accuracy gate (unreported accuracy passes). */
function acceptedFix(p: RoutePoint): boolean {
  return p.accuracy === undefined || (Number.isFinite(p.accuracy) && p.accuracy <= ACCURACY_GATE_M)
}

/**
 * Filtered straight-line distance in meters over a fix sequence:
 * accuracy gate → first accepted fix anchors → <3 m jitter skipped (and NOT
 * re-anchored, so slow drift accumulates only once it passes the gate).
 */
export function cumulativeDistanceM(points: RoutePoint[]): number {
  let total = 0
  let anchor: RoutePoint | null = null
  for (const p of points) {
    if (!acceptedFix(p)) continue
    if (anchor === null) {
      anchor = p
      continue
    }
    const d = haversineM(anchor, p)
    if (d < MIN_DISPLACEMENT_M) continue // jitter — no advance, no re-anchor
    total += d
    anchor = p
  }
  return total
}

// ── Speed / time / pause ──────────────────────────────────────────────────────

/** Derived speed between consecutive fixes (m/s); null when dt ≤ 0. */
export function segmentSpeedMps(a: RoutePoint, b: RoutePoint): number | null {
  const dt = (b.t - a.t) / 1000
  if (dt <= 0) return null
  return haversineM(a, b) / dt
}

/**
 * Moving time in ms: segment time counts only when the segment's derived
 * speed ≥ PAUSE_SPEED_MPS, each segment capped at MAX_SEGMENT_MS. The sum
 * starts at the first accepted fix — time before the first fix is not the
 * run's.
 */
export function movingTimeMs(points: RoutePoint[]): number {
  let total = 0
  let prev: RoutePoint | null = null
  for (const p of points) {
    if (!acceptedFix(p)) continue
    if (prev === null) {
      prev = p
      continue
    }
    const v = segmentSpeedMps(prev, p)
    if (v !== null && v >= PAUSE_SPEED_MPS) {
      total += Math.min(p.t - prev.t, MAX_SEGMENT_MS)
    }
    prev = p
  }
  return total
}

/**
 * Auto-pause detection: below 0.5 m/s the live UI renders "PAUSED" honestly
 * (distance cannot advance below the jitter floor anyway). A null/unreadable
 * speed makes NO claim — absent data is not a pause.
 */
export function isPaused(speedMs: number | null): boolean {
  if (speedMs === null || !Number.isFinite(speedMs)) return false
  return speedMs < PAUSE_SPEED_MPS
}

// ── Pace / formatting ─────────────────────────────────────────────────────────

/**
 * Pace in minutes per kilometer. Null when distance/time cannot support a
 * pace (< 1 m, no elapsed time, non-finite, or above the 99 min/km honesty
 * ceiling — that is standing, not a pace).
 */
export function paceMinPerKm(distanceM: number, elapsedMs: number): number | null {
  if (!Number.isFinite(distanceM) || !Number.isFinite(elapsedMs)) return null
  if (distanceM < 1 || elapsedMs <= 0) return null
  const pace = elapsedMs / 60000 / (distanceM / 1000)
  if (!Number.isFinite(pace) || pace <= 0 || pace > 99) return null
  return pace
}

/** "5:41 / KM" — or "—" when the pace is unknown/invalid. */
export function formatPace(pace: number | null): string {
  if (pace === null || !Number.isFinite(pace) || pace < 0) return "—"
  let m = Math.floor(pace)
  let s = Math.round((pace - m) * 60)
  if (s === 60) {
    m += 1
    s = 0
  }
  if (m > 99) return "—" // same honesty ceiling as paceMinPerKm
  return `${m}:${String(s).padStart(2, "0")} / KM`
}

/** "850 M" under a kilometer, "5.20 KM" above (2-decimal km). */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "0 M"
  if (m < 999.5) return `${Math.round(m)} M`
  return `${(m / 1000).toFixed(2)} KM`
}

/** Elapsed clock: "18:20", or "1:05:03" once an hour is on the board. */
export function formatElapsed(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0
  const total = Math.floor(safe / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// ── Live smoothing ────────────────────────────────────────────────────────────

/**
 * Exponential moving average for the live speed readout (α ≈ 0.3 — one
 * spike moves the needle ~30%, decays out over ~2 fixes). Fresh series
 * (prev null) seeds with the observed value.
 */
export function ema(prev: number | null, observed: number, alpha: number = EMA_ALPHA): number {
  if (prev === null || !Number.isFinite(prev)) return observed
  return prev + alpha * (observed - prev)
}

// ── Geometry (future map use) ─────────────────────────────────────────────────

/** Geographic bounds of a track for map rendering; null when empty. */
export function boundingBox(points: RoutePoint[]): {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
} | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  if (minLat === Infinity) return null // every point was non-finite
  return { minLat, maxLat, minLon, maxLon }
}
