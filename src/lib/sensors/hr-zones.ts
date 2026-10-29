// ─── PRIME · HR zone model (R20-b — sensor hub) ───────────────────────────────
// Pure, client-safe math for the 5-zone %HRmax training model. No DOM, no
// store — every consumer (sensor hub, raid chip, tests) derives from here.
//
// CITATIONS (the honest layer — the app discloses its own approximations):
// · 5-zone %HRmax convention — ACSM's Guidelines for Exercise Testing and
//   Prescription (zone bands expressed as fractions of maximum heart rate;
//   the 50–60/60–70/70–80/80–90/90–100 split follows the classic Edwards
//   5-zone model, Edwards S., The Heart Rate Monitor Book).
// · HRmax = 220 − age — Fox SM, Naughton JP, Haskell WL (1971), "Physical
//   activity and the prevention of coronary heart disease".
// · DISCLOSED IN CODE: Tanaka H, Monahan KD, Seals DR (2001) showed
//   HRmax = 208 − 0.7 × age predicts better across ages, especially in older
//   adults (220 − age overestimates in young, underestimates in old). The
//   Fox formula ships as the default because it is the convention every
//   chest-strap ecosystem uses, and the sensor hub exposes a MAX HR OVERRIDE
//   stepper (persisted) so a hunter who knows better (lab test, Tanaka) can
//   pin the real number — the override wins everywhere zones are computed.

/** A training zone: id, display label, %HRmax bounds and its house color. */
export type HrZone = {
  id: "Z1" | "Z2" | "Z3" | "Z4" | "Z5"
  label: "RECOVER" | "ENDURE" | "TEMPO" | "THRESHOLD" | "PEAK"
  /** Lower bound as a fraction of HRmax (inclusive). */
  lo: number
  /** Upper bound as a fraction of HRmax (exclusive, except Z5). */
  hi: number
  /** Text color class for chips/labels. */
  colorClass: string
  /** Fill class for the zone-bar segments. */
  barClass: string
  /** Full chip skin (border/bg/text) for the live zone chip. */
  chipClass: string
}

/** The 5-zone ladder (classic %HRmax convention, Edwards-style). */
export const ZONES: readonly HrZone[] = [
  { id: "Z1", label: "RECOVER", lo: 0.5, hi: 0.6, colorClass: "text-teal-400", barClass: "bg-teal-400", chipClass: "border-teal-400/50 bg-teal-500/10 text-teal-300" },
  { id: "Z2", label: "ENDURE", lo: 0.6, hi: 0.7, colorClass: "text-teal-300", barClass: "bg-teal-300", chipClass: "border-teal-300/50 bg-teal-500/10 text-teal-200" },
  { id: "Z3", label: "TEMPO", lo: 0.7, hi: 0.8, colorClass: "text-amber-300", barClass: "bg-amber-300", chipClass: "border-amber-300/50 bg-amber-500/10 text-amber-200" },
  { id: "Z4", label: "THRESHOLD", lo: 0.8, hi: 0.9, colorClass: "text-amber-400", barClass: "bg-amber-400", chipClass: "border-amber-400/50 bg-amber-500/10 text-amber-300" },
  { id: "Z5", label: "PEAK", lo: 0.9, hi: 1.0, colorClass: "text-rose-400", barClass: "bg-rose-400", chipClass: "border-rose-400/50 bg-rose-500/10 text-rose-300" },
] as const

/** Default HRmax when nothing is known (age 30 by the Fox formula). */
export const DEFAULT_HR_MAX = 190

/**
 * HRmax from a birth year via 220 − age (Fox 1971).
 * Age is clamped 13–90 (the formula's honest range — younger athletes and
 * older adults are exactly where Tanaka outperforms it). `null` birth year →
 * the 190 default. The current year is derived dynamically, never hardcoded.
 */
export function hrMaxFromBirthYear(birthYear: number | null): number {
  if (birthYear === null || !Number.isFinite(birthYear)) return DEFAULT_HR_MAX
  const age = Math.min(90, Math.max(13, new Date().getFullYear() - Math.round(birthYear)))
  return 220 - age
}

/**
 * The zone a BPM falls in for a given HRmax. Below 50% clamps to Z1 (warm-up
 * / daily life — still "recover" territory); above 100% clamps to Z5 (straps
 * glitch, spikes happen — the readout stays sane). Bounds are [lo, hi) except
 * Z5, which swallows everything from 90% up.
 */
export function zoneFor(bpm: number, hrMax: number): HrZone {
  const max = hrMax > 0 ? hrMax : DEFAULT_HR_MAX
  const pct = bpm / max
  for (const z of ZONES) {
    if (pct < z.hi) return z
  }
  return ZONES[ZONES.length - 1]
}

/** One rendered segment of the 5-zone bar — absolute BPM bounds + flex weight. */
export type ZoneSegment = {
  zone: HrZone
  lo: number
  hi: number
  /** Relative width weight (hi − lo) — segments sized by their zone bounds. */
  weight: number
}

/** Zone bar geometry for a given HRmax — segments sized by the %HRmax bounds. */
export function zoneBounds(hrMax: number): ZoneSegment[] {
  const max = hrMax > 0 ? hrMax : DEFAULT_HR_MAX
  return ZONES.map((zone) => ({
    zone,
    lo: Math.round(zone.lo * max),
    hi: Math.round(zone.hi * max),
    // 3-decimal round kills FP noise (0.7−0.6 → 0.09999…) so equal-width
    // zones render with exactly equal flex weights
    weight: Math.round((zone.hi - zone.lo) * 1000) / 1000,
  }))
}
