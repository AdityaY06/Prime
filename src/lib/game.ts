// ─── ASCENDANT · Core game constants & pure logic ────────────────────────────

export type StatKey = "str" | "vit" | "endur" | "agi" | "flex"

export const STAT_DEFS: Record<
  StatKey,
  { label: string; short: string; color: string; bar: string; glow: string; desc: string }
> = {
  str: {
    label: "Strength",
    short: "STR",
    color: "text-rose-400",
    bar: "from-rose-600 via-rose-500 to-orange-400",
    glow: "shadow-[0_0_12px_rgba(244,63,94,0.45)]",
    desc: "Raw power. Governs weighted lifts.",
  },
  vit: {
    label: "Vitality",
    short: "VIT",
    color: "text-zinc-200",
    bar: "from-zinc-500 via-zinc-400 to-zinc-200",
    glow: "shadow-[0_0_12px_rgba(212,212,216,0.4)]",
    desc: "Life force. Governs bodyweight volume.",
  },
  endur: {
    label: "Endurance",
    short: "END",
    color: "text-amber-400",
    bar: "from-amber-600 via-amber-500 to-yellow-400",
    glow: "shadow-[0_0_12px_rgba(245,158,11,0.45)]",
    desc: "Stamina. Extends every session.",
  },
  agi: {
    label: "Agility",
    short: "AGI",
    color: "text-teal-400",
    bar: "from-teal-600 via-teal-500 to-cyan-400",
    glow: "shadow-[0_0_12px_rgba(45,212,191,0.45)]",
    desc: "Swiftness. Governs cardio gains.",
  },
  flex: {
    label: "Flexibility",
    short: "FLEX",
    color: "text-zinc-400",
    bar: "from-zinc-700 via-zinc-600 to-zinc-400",
    glow: "shadow-[0_0_12px_rgba(161,161,170,0.35)]",
    desc: "Suppleness. Governs mobility work.",
  },
}

export const STAT_KEYS: StatKey[] = ["str", "vit", "endur", "agi", "flex"]

// ─── Ranks ───────────────────────────────────────────────────────────────────
// R43 studio register: a monochrome prestige ramp — ascending zinc lightness
// F→C, then ascending gold B→S (the gilded elite). No cool hues anywhere.

export type RankDef = {
  rank: string
  minLevel: number
  color: string
  border: string
  glow: string
  tag: string
}

export const RANKS: RankDef[] = [
  { rank: "F", minLevel: 1, color: "text-zinc-500", border: "border-zinc-600/50", glow: "shadow-[0_0_10px_rgba(113,113,122,0.25)]", tag: "unranked" },
  { rank: "E", minLevel: 5, color: "text-zinc-400", border: "border-zinc-500/50", glow: "shadow-[0_0_14px_rgba(161,161,170,0.3)]", tag: "novice" },
  { rank: "D", minLevel: 10, color: "text-zinc-300", border: "border-zinc-400/50", glow: "shadow-[0_0_14px_rgba(212,212,216,0.35)]", tag: "practitioner" },
  { rank: "C", minLevel: 18, color: "text-zinc-200", border: "border-zinc-300/50", glow: "shadow-[0_0_16px_rgba(228,228,231,0.4)]", tag: "veteran" },
  { rank: "B", minLevel: 28, color: "text-amber-400", border: "border-amber-500/60", glow: "shadow-[0_0_16px_rgba(251,191,36,0.5)]", tag: "elite" },
  { rank: "A", minLevel: 40, color: "text-amber-300", border: "border-amber-400/70", glow: "shadow-[0_0_18px_rgba(252,211,77,0.6)]", tag: "master" },
  { rank: "S", minLevel: 60, color: "text-amber-200", border: "border-amber-300/80", glow: "shadow-[0_0_22px_rgba(253,230,138,0.7)]", tag: "sovereign" },
]

export function rankForLevel(level: number): RankDef {
  let current = RANKS[0]
  for (const r of RANKS) if (level >= r.minLevel) current = r
  return current
}

export function nextRank(level: number): RankDef | null {
  return RANKS.find((r) => r.minLevel > level) ?? null
}

// ─── XP curve ─────────────────────────────────────────────────────────────────

/** XP required to advance from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 80 + (level - 1) * 45
}

/** Apply XP to a (level, xp) pair; returns final state + number of level-ups. */
export function applyXp(level: number, xp: number, amount: number) {
  let lvl = level
  let cur = xp + amount
  let levelUps = 0
  while (cur >= xpToNext(lvl)) {
    cur -= xpToNext(lvl)
    lvl += 1
    levelUps += 1
  }
  return { level: lvl, xp: cur, levelUps }
}

export const STAT_POINTS_PER_LEVEL = 3
export const STAT_POINTS_PER_RANK = 5

// ─── Combat power ─────────────────────────────────────────────────────────────

export function combatPower(h: {
  level: number
  str: number
  vit: number
  endur: number
  agi: number
  flex: number
}): number {
  const raw = h.str * 2.2 + h.vit * 1.8 + h.endur * 1.8 + h.agi * 2.0 + h.flex * 1.2
  return Math.round(raw * (1 + h.level * 0.03))
}

// ─── Exercise XP formula ──────────────────────────────────────────────────────

export type ExerciseType = "strength" | "bodyweight" | "cardio" | "mobility"

export function exerciseXp(
  type: ExerciseType,
  sets: number,
  reps: number,
  weightKg: number,
  durationMin: number,
  stats: { str: number; vit: number; endur: number; agi: number; flex: number }
): number {
  let base = 0
  switch (type) {
    case "strength":
      base = sets * reps * weightKg * 0.03
      base *= 1 + (stats.str - 12) * 0.006
      break
    case "bodyweight": {
      const repsTotal = sets * reps
      base = repsTotal * 0.6
      base *= 1 + ((stats.str + stats.vit) / 2 - 12) * 0.006
      break
    }
    case "cardio":
      base = durationMin * 4
      base *= 1 + (stats.agi - 12) * 0.006
      break
    case "mobility":
      base = durationMin * 2.5
      base *= 1 + (stats.flex - 12) * 0.006
      break
  }
  // endurance is a global amplifier (diminishing)
  base *= 1 + (stats.endur - 12) * 0.004
  return Math.max(1, Math.round(base))
}

// ─── Session XP ───────────────────────────────────────────────────────────────

export function sessionXp(
  logs: { type: string; sets: number; reps: number; weightKg: number; durationMin: number; xpValue: number }[],
  gateMultiplier: number
): number {
  const sum = logs.reduce((acc, l) => acc + l.xpValue, 0)
  const clearBonus = 25
  return Math.round((sum + clearBonus) * gateMultiplier)
}

export function sessionVolume(logs: { type: string; sets: number; reps: number; weightKg: number }[]): number {
  return logs
    .filter((l) => l.type === "strength")
    .reduce((acc, l) => acc + l.sets * l.reps * l.weightKg, 0)
}

// ─── Archetypes ───────────────────────────────────────────────────────────────

export type ArchetypeDef = {
  id: string
  name: string
  title: string
  desc: string
  stats: Record<StatKey, number>
  color: string
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: "vanguard",
    name: "All-Rounder",
    title: "Balanced foundation",
    desc: "No weakness, no wasted talent. All attributes grow evenly.",
    stats: { str: 12, vit: 12, endur: 12, agi: 12, flex: 12 },
    color: "from-zinc-500/30 to-zinc-700/10",
  },
  {
    id: "titanblood",
    name: "Strength Focus",
    title: "Built to lift heavy",
    desc: "Born to move mountains. High STR & VIT, slower pace.",
    stats: { str: 20, vit: 16, endur: 10, agi: 8, flex: 6 },
    color: "from-rose-600/30 to-orange-700/10",
  },
  {
    id: "ironwind",
    name: "Cardio Engine",
    title: "Never winds down",
    desc: "A motor that keeps running. High AGI & END, lighter frame.",
    stats: { str: 8, vit: 8, endur: 16, agi: 20, flex: 8 },
    color: "from-fuchsia-600/30 to-violet-700/10",
  },
  {
    id: "earthwarden",
    name: "Durability Focus",
    title: "Hard to wear down",
    desc: "Slow to fall, slow to tire. Deep VIT & FLEX, quiet power.",
    stats: { str: 10, vit: 18, endur: 12, agi: 6, flex: 14 },
    color: "from-zinc-500/30 to-zinc-700/10",
  },
]

// ─── Time helpers ─────────────────────────────────────────────────────────────

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dayKey(d)
}

// ─── Per-device timezone day math (R38) ───────────────────────────────────────
//
// The product promise is "YOUR day": dailies, streaks, rift rotation and rest
// decrees should roll at the hunter's midnight, not the server's. Every helper
// below takes an optional IANA zone (Hunter.timezone); a null/undefined/INVALID
// zone falls back to the exact legacy server-local behavior above, so
// pre-R38 hunters (timezone = null) keep byte-identical semantics.
//
// All instants are computed DST-correctly via the wallclock-offset fixed-point
// trick (offset = wallclock-as-UTC − instant, iterated to convergence), not by
// naive 24h arithmetic.

const dateOnlyFormatters = new Map<string, Intl.DateTimeFormat>()
const wallclockFormatters = new Map<string, Intl.DateTimeFormat>()

function dateOnlyFormatter(tz: string): Intl.DateTimeFormat | null {
  let f = dateOnlyFormatters.get(tz)
  if (!f) {
    try {
      // en-CA yields YYYY-MM-DD directly
      f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      dateOnlyFormatters.set(tz, f)
    } catch {
      return null
    }
  }
  return f
}

function wallclockFormatter(tz: string): Intl.DateTimeFormat | null {
  let f = wallclockFormatters.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      })
      wallclockFormatters.set(tz, f)
    } catch {
      return null
    }
  }
  return f
}

/** True when `tz` is a usable IANA zone name (bounded length, formattable). */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  return dateOnlyFormatter(tz) !== null
}

/** UTC ms offset of `tz`'s wall clock at `instant` (positive = ahead of UTC). */
function tzOffsetMs(instant: number, tz: string): number {
  const f = wallclockFormatter(tz)
  if (!f) return 0
  const secs = Math.floor(instant / 1000) * 1000 // sub-second offsets would smear the boundary
  const parts = f.formatToParts(secs)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0")
  const wallclockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
  return wallclockAsUtc - secs
}

/** UTC instant (ms) of local midnight starting calendar day `day` in `tz`. */
function tzDayStart(day: string, tz: string): number {
  const [y, m, d] = day.split("-").map(Number)
  const dayAsUtc = Date.UTC(y, m - 1, d)
  // Noon guess converges for any legal zone (±14h); DST shifts move the
  // offset by ≤2h so the fixed point is reached in ≤3 iterations.
  let guess = dayAsUtc + 12 * 3600_000
  for (let i = 0; i < 4; i++) {
    const target = dayAsUtc - tzOffsetMs(guess, tz)
    if (target === guess) break
    guess = target
  }
  return guess
}

/** Calendar day after `day` (pure string arithmetic). */
export function keyAfter(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  const next = new Date(Date.UTC(y, m - 1, d) + 86_400_000)
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`
}

/** Calendar day before `day` (pure string arithmetic). */
export function keyBefore(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d) - 86_400_000)
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`
}

/**
 * Day key of `d` in the hunter's timezone: "your day". Null/undefined/invalid
 * zone → legacy server-local `dayKey` (byte-compatible with pre-R38 rows).
 */
export function dayKeyIn(tz: string | null | undefined, d: Date = new Date()): string {
  if (!tz) return dayKey(d)
  const f = dateOnlyFormatter(tz)
  if (!f) return dayKey(d)
  return f.format(d)
}

/** Yesterday's key in the hunter's timezone (DST-safe via the day boundary). */
export function yesterdayKeyIn(tz: string | null | undefined): string {
  if (!tz) return yesterdayKey()
  return dayKeyIn(tz, new Date(tzDayStart(dayKeyIn(tz), tz) - 1))
}

/**
 * UTC instants of [start-of-day, start-of-next-day) for calendar `day` in
 * `tz` — the correct window for "sessions trained that day" queries. Null tz
 * → the legacy server-local midnight window (UTC server: exact).
 */
export function tzDayWindow(day: string, tz: string | null | undefined): { start: Date; end: Date } {
  if (!tz || !dateOnlyFormatter(tz)) {
    return { start: new Date(`${day}T00:00:00`), end: new Date(`${day}T23:59:59.999`) }
  }
  return { start: new Date(tzDayStart(day, tz)), end: new Date(tzDayStart(keyAfter(day), tz)) }
}

/** Milliseconds until the next midnight in `tz` (null → next UTC midnight). */
export function msUntilNextTzMidnight(tz: string | null | undefined, now: Date = new Date()): number {
  if (!tz || !dateOnlyFormatter(tz)) {
    return Math.max(0, Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime())
  }
  const tomorrow = keyAfter(dayKeyIn(tz, now))
  return Math.max(0, tzDayStart(tomorrow, tz) - now.getTime())
}

/**
 * Monday-based ISO week start key of `d` in the hunter's timezone. Calendar
 * arithmetic runs on the WALLCLOCK date (never on instants), so DST weeks
 * can't shift the key. Null tz → legacy server-local `weekStartKey`.
 */
export function weekStartKeyIn(tz: string | null | undefined, d: Date = new Date()): string {
  if (!tz) {
    const c = new Date(d)
    const dow = (c.getDay() + 6) % 7
    c.setDate(c.getDate() - dow)
    return dayKey(c)
  }
  const f = wallclockFormatter(tz)
  if (!f) {
    return weekStartKeyIn(null, d)
  }
  const parts = f.formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0")
  const y = get("year")
  const m = get("month")
  const dd = get("day")
  const utcDow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay()
  const back = (utcDow + 6) % 7
  const monday = new Date(Date.UTC(y, m - 1, dd) - back * 86_400_000)
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`
}

export function formatDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
