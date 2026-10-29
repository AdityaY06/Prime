// ─── PRIME · HRV math (R22-b — live RMSSD from the chest strap's RR) ───────────
// Pure, dependency-free heart-rate-variability math over the RR-intervals
// the Heart Rate Measurement characteristic (0x2A37) carries (parsed by
// lib/sensors/bluetooth-hr). RMSSD — the root mean square of successive RR
// differences — is the standard short-window HRV estimate: the number Oura
// and Whoop ship as "HRV". Computed here over a rolling window of the last
// 30 valid intervals (~30 s of beats at rest) — long enough to settle,
// short enough to stay "live". No DOM, no store, no deps: every consumer
// (sensor store, scratch tests) derives from the same pure functions.
//
// HONESTY LEDGER (what this engine claims — and deliberately does NOT):
// · Fewer than 5 valid intervals → NO NUMBER (null). A two-beat RMSSD is
//   noise, not data — the readout renders "—" until the floor is met.
// · RR plausibility gating (300–2000 ms) lives in the PARSER; this module
//   trusts its input and only sanity-checks finiteness.
// · No beat is ever invented: dropped notifications simply leave the window
//   short — no interpolation, no synthetic intervals, no back-fill.
// · The buffer keeps up to 120 intervals (~2 min) so the estimate's window
//   (30) always has history behind it; only the LAST 30 feed RMSSD.
// · Beat-confidence (fraction of expected beats actually delivered) was
//   considered and SKIPPED — not displayed anywhere, and wall-clock vs
//   RR-clock drift makes it guesswork rather than a measurement.

// ── Window constants ──────────────────────────────────────────────────────────

/** Rolling window size for the RMSSD estimate — the last N valid intervals. */
export const HRV_WINDOW = 30
/** Honest floor: fewer valid intervals than this → no number, "—". */
export const HRV_MIN_INTERVALS = 5
/** Rolling buffer cap (~2 minutes of beats) — the estimate reads only its tail. */
export const HRV_BUFFER_CAP = 120

// ── Pure math ─────────────────────────────────────────────────────────────────

/**
 * RMSSD core — root mean square of successive RR differences over the LAST
 * `window` intervals of the series; null below the `minIntervals` floor.
 * Pure: input array is never mutated. (Internal — the exported rmssd and the
 * tracker's snapshot both derive from this one implementation.)
 */
function rmssdOver(rrs: readonly number[], window: number, minIntervals: number): number | null {
  const count = rrs.length
  if (count < minIntervals) return null
  const start = Math.max(0, count - window)
  let sumSquares = 0
  for (let i = start + 1; i < count; i++) {
    const d = rrs[i] - rrs[i - 1]
    sumSquares += d * d
  }
  const diffs = count - start - 1
  return diffs > 0 ? Math.sqrt(sumSquares / diffs) : null
}

/**
 * RMSSD in ms — root mean square of successive RR differences — over the
 * LAST HRV_WINDOW (30) intervals of the series. Null when fewer than
 * HRV_MIN_INTERVALS (5) intervals are available (the honest floor).
 * Pure: input array is never mutated.
 */
export function rmssd(rrs: readonly number[]): number | null {
  return rmssdOver(rrs, HRV_WINDOW, HRV_MIN_INTERVALS)
}

// ── Rolling state (in-memory only — NEVER persisted) ─────────────────────────

/** The live HRV snapshot consumers render. */
export type HrvSnapshot = {
  /** RMSSD over the last 30 intervals — null below the 5-interval floor. */
  rmssdMs: number | null
  /** Valid intervals currently in the rolling buffer (caps at HRV_BUFFER_CAP). */
  sampleCount: number
  /** Most recent accepted RR-interval in ms — null before the first one. */
  lastRrMs: number | null
}

/** Rolling RR-interval accumulator — push, snapshot, reset. */
export type HrvTracker = {
  /** Append validated RR-intervals (ms) from one or more notifications. */
  push: (rrs: readonly number[]) => void
  /** Current RMSSD/sample-count/last-RR view — cheap, recomputed per call. */
  snapshot: () => HrvSnapshot
  /** Wipe the buffer (disconnect/reconnect — a stale window is not data). */
  reset: () => void
}

/** Tunable tracker knobs — every field optional; defaults are the constants above. */
export type HrvTrackerOptions = {
  /** Rolling RMSSD window, in intervals (default HRV_WINDOW = 30). */
  window?: number
  /** Honest floor — fewer buffered intervals than this → null (default HRV_MIN_INTERVALS = 5). */
  minIntervals?: number
  /** Rolling buffer cap in intervals (default HRV_BUFFER_CAP = 120; never below `window`). */
  bufferCap?: number
}

/** Sanitized integer at-or-above `min`, falling back when absent or junk. */
const intAtLeast = (v: number | undefined, fallback: number, min: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.round(v)) : fallback

/**
 * Create an independent rolling HRV tracker (the module-level singleton in
 * the sensor store; fresh instances in tests). Values are stored as-given —
 * physiological validation is the parser's job; only non-finite junk is
 * ignored here as a last-resort guard. The buffer is capped (oldest
 * evicted) and RMSSD reads only the last `window` intervals of it.
 */
export function createHrvTracker(opts: HrvTrackerOptions = {}): HrvTracker {
  const window = intAtLeast(opts.window, HRV_WINDOW, 2)
  const minIntervals = intAtLeast(opts.minIntervals, HRV_MIN_INTERVALS, 2)
  const bufferCap = Math.max(window, intAtLeast(opts.bufferCap, HRV_BUFFER_CAP, 2))
  let buffer: number[] = []
  return {
    push: (rrs) => {
      for (const rr of rrs) {
        if (Number.isFinite(rr)) buffer.push(rr)
      }
      if (buffer.length > bufferCap) {
        // keep the freshest bufferCap intervals — age out the head
        buffer = buffer.slice(buffer.length - bufferCap)
      }
    },
    snapshot: () => ({
      rmssdMs: rmssdOver(buffer, window, minIntervals),
      sampleCount: buffer.length,
      lastRrMs: buffer.length > 0 ? buffer[buffer.length - 1] : null,
    }),
    reset: () => {
      buffer = []
    },
  }
}

// ── Formatting (the app's honesty idiom: absence renders "—") ────────────────

/** RMSSD in whole ms ("42"); null/non-finite → "—" (never a fake number). */
export function formatHrv(ms: number | null): string {
  return ms !== null && Number.isFinite(ms) ? `${Math.round(ms)}` : "—"
}
