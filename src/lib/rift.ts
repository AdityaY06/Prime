// ─── ASCENDANT · Rift of the Day (daily featured gate surge) ───────────────────
//
// Every day, one gate is chosen by a deterministic hash of the day key. That
// gate becomes "the rift" — XP gains inside it are boosted on top of its own
// multiplier, and clearing it grants bonus aether essence. R38: when
// Hunter.timezone is set, the rotation rolls at the HUNTER's midnight — the
// server routes pass dayKeyIn(hunter.timezone) to riftOfTheDay, and the
// countdown below aims at that same boundary. Null-timezone hunters keep the
// legacy 00:00 UTC roll (the backend's dayKey() is server-local, which is UTC
// in this deployment).

import { GATES, type GateDef } from "./gates"
import { dayKey, isValidTimeZone, msUntilNextTzMidnight } from "./game"

/** XP bonus applied on top of the rift gate's own multiplier (0.5 = +50%). */
export const RIFT_XP_BONUS = 0.5

/** Flat bonus aether essence for clearing the rift gate. */
export const RIFT_ESSENCE_BONUS = 10

export type RiftInfo = {
  gateId: string
  gateName: string
  /** Effective XP multiplier for the rift gate (gate mult × surge). */
  bonusMult: number
  /** The surge factor alone, for display ("×1.5 SURGE"). */
  surge: number
  essenceBonus: number
}

function hashDay(day: string): number {
  let h = 0
  for (let i = 0; i < day.length; i++) {
    h = (h * 31 + day.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** The rift active on `day` (defaults to today, local time). */
export function riftOfTheDay(day: string = dayKey()): RiftInfo {
  const gate = GATES[hashDay(day) % GATES.length]
  return {
    gateId: gate.id,
    gateName: gate.name,
    bonusMult: Math.round(gate.xpMultiplier * (1 + RIFT_XP_BONUS) * 100) / 100,
    surge: 1 + RIFT_XP_BONUS,
    essenceBonus: RIFT_ESSENCE_BONUS,
  }
}

/** Is this gate the rift on `day`? */
export function isRiftGate(gateId: string, day: string = dayKey()): boolean {
  return riftOfTheDay(day).gateId === gateId
}

/** XP multiplier to use when clearing `gate` on `day` (rift surge included). */
export function riftEffectiveMult(gate: GateDef | undefined, day: string = dayKey()): number {
  const base = gate?.xpMultiplier ?? 1
  return gate && isRiftGate(gate.id, day) ? base * (1 + RIFT_XP_BONUS) : base
}

/** Milliseconds until the next rotation (next midnight).
 *  R37-a (R35 re-land): pure UTC-field math — the rift day key rolls on the
 *  backend's server-local midnight (= 00:00 UTC here), so the countdown must
 *  target that boundary from ANY device timezone. Local-midnight math lied
 *  to a UTC+5:30 device ("2h 52m" when the true reset was 8h away).
 *  R38: with a valid Hunter.timezone the rotation rolls at the HUNTER's
 *  midnight (server routes grant by dayKeyIn(hunter.timezone)) — delegate to
 *  the shared tz day math; null/undefined/invalid tz keeps the exact legacy
 *  UTC math below (byte-compatible for pre-R38 hunters). */
export function msUntilNextRift(tz?: string | null, now: Date = new Date()): number {
  if (tz && isValidTimeZone(tz)) return msUntilNextTzMidnight(tz, now)
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(0, next - now.getTime())
}

/** Format the remaining rift time as HH:MM:SS. */
export function riftCountdownLabel(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
