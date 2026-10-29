// ─── ASCENDANT · Boss Raids (weekly world-boss hunts) ──────────────────────────
//
// Every ISO week (Monday-based) one boss materializes beside its gate. The boss
// has no body you can touch — it is a bar to clear: deal its full HP in raw XP
// within a single raid inside its gate, and it falls. Slain bosses pay out a
// bounty of bonus XP and aether essence, and count toward the slayer title
// track. The hunt resets with each new week.
//
// ENRAGE — bosses remember. Each lifetime kill of a given boss makes its next
// spawn harder (+15% HP per kill, capped at ×2.5) and pays a richer essence
// bounty. Kill tallies per boss climb the tier ladder: STANDARD → EMPOWERED
// → ENRAGED → APEX. The challenge scales with the hunter's own legend.

import { GATES } from "./gates"
import { dayKey, isValidTimeZone, keyAfter, tzDayWindow, weekStartKeyIn } from "./game"

/** Boss HP anchor at level 1 — scales +4% per level above it. */
export const BOSS_BASE_HP = 220

/** Enrage: HP growth per lifetime kill of this boss. */
export const BOSS_ENRAGE_STEP = 0.15

/** Enrage: HP multiplier ceiling for ancient legends. */
export const BOSS_ENRAGE_CAP = 2.5

/** Boss HP for a hunter at `level` with `kills` lifetime kills of this boss. */
export function bossHpForLevel(level: number, kills = 0): number {
  const enraged = Math.min(1 + kills * BOSS_ENRAGE_STEP, BOSS_ENRAGE_CAP)
  return Math.round(BOSS_BASE_HP * (1 + (Math.max(1, level) - 1) * 0.04) * enraged)
}

// ─── Enrage tiers — the ladder a boss climbs as it is slain again and again ───

export type BossEnrage = {
  /** 0 STANDARD · 1 EMPOWERED · 2 ENRAGED · 3 APEX */
  tier: 0 | 1 | 2 | 3
  label: string
  /** lifetime kills of this boss feeding the rage. */
  kills: number
  /** HP multiplier at these kills (2dp for display). */
  hpMult: number
  /** essence bounty at this tier. */
  essence: number
}

/** Enrage state for a boss with `kills` lifetime kills (pre-check, never post-kill). */
export function enrageFor(kills: number): BossEnrage {
  const k = Math.max(0, Math.floor(kills))
  const tier = k >= 6 ? 3 : k >= 3 ? 2 : k >= 1 ? 1 : 0
  const hpMult = Math.min(1 + k * BOSS_ENRAGE_STEP, BOSS_ENRAGE_CAP)
  return {
    tier: tier as BossEnrage["tier"],
    label: ["STANDARD", "TOUGH", "BRUTAL", "LEGENDARY"][tier],
    kills: k,
    hpMult: Math.round(hpMult * 100) / 100,
    essence: BOSS_ESSENCE_REWARD + tier * 15,
  }
}

/** Bounty: bonus XP paid on a kill, as a fraction of the boss's (enraged) HP. */
export const BOSS_XP_REWARD_RATIO = 0.5

/** Bounty: flat aether essence paid on a kill (scales +15 per enrage tier). */
export const BOSS_ESSENCE_REWARD = 50

export type BossDef = {
  code: string
  name: string
  epithet: string
  gateId: string
  /** lucide icon name for the sigil. */
  glyph: string
  /** text-color class for the boss's own accent (danger spectrum). */
  accent: string
  /** border class for the banner frame. */
  frame: string
  /** how the boss "attacks" — flavor for the HP bar caption. */
  threat: string
}

export const BOSSES: BossDef[] = [
  {
    code: "wraith-of-gales",
    name: "THE ENGINE TRIAL",
    epithet: "A cardio target worth chasing this week",
    gateId: "gale-fields",
    glyph: "Ghost",
    accent: "text-rose-300",
    frame: "border-rose-500/40",
    threat: "Outlast the distance",
  },
  {
    code: "iron-tyrant",
    name: "THE STRENGTH TRIAL",
    epithet: "Heavy iron, honest reps",
    gateId: "iron-forge",
    glyph: "Anvil",
    accent: "text-rose-300",
    frame: "border-rose-500/40",
    threat: "Move the weight",
  },
  {
    code: "colossus-prime",
    name: "THE FULL-BODY GAUNTLET",
    epithet: "Your conditioning, tested end to end",
    gateId: "titan-trial",
    glyph: "Skull",
    accent: "text-rose-300",
    frame: "border-rose-500/40",
    threat: "Master your own weight",
  },
  {
    code: "the-unblinking",
    name: "THE MOBILITY TRIAL",
    epithet: "Slow work, real results",
    gateId: "flow-sanctum",
    glyph: "Eye",
    accent: "text-rose-300",
    frame: "border-rose-500/40",
    threat: "Hold the positions",
  },
  {
    code: "gauntlet-warden",
    name: "THE CONSISTENCY TEST",
    epithet: "Everything at once — earn the reward",
    gateId: "colossus-gate",
    glyph: "Crown",
    accent: "text-rose-300",
    frame: "border-rose-500/40",
    threat: "Run the full circuit",
  },
]

function hashKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** The boss active during the ISO week whose Monday is `weekStart`. */
export function bossOfTheWeek(weekStart: string): BossDef {
  return BOSSES[hashKey(weekStart) % BOSSES.length]
}

export function bossByCode(code: string): BossDef | undefined {
  return BOSSES.find((b) => b.code === code)
}

export function gateNameOf(gateId: string): string {
  return GATES.find((g) => g.id === gateId)?.name ?? gateId
}

/** Monday-based ISO week start key — mirrors engine.weekStartKey client-side. */
export function weekStartOf(d: Date = new Date()): string {
  const c = new Date(d)
  const dow = (c.getDay() + 6) % 7 // Monday=0 … Sunday=6
  c.setDate(c.getDate() - dow)
  return dayKey(c)
}

/** Calendar day 7 after `day` — one boss-week hop (pure string arithmetic;
 *  loops keyAfter rather than reimplementing tz math locally). */
function keyAfter7(day: string): string {
  let k = day
  for (let i = 0; i < 7; i++) k = keyAfter(k)
  return k
}

/** Milliseconds until the next boss spawns (next Monday midnight).
 *  R37-a (R35 re-land): pure UTC-field math — the boss week rolls on the
 *  backend's Monday-based server-local week key (= Monday 00:00 UTC in this
 *  deployment), so the countdown must target that boundary from ANY device
 *  timezone, not the device's own Monday midnight.
 *  R38: with a valid Hunter.timezone the hunt rolls at Monday midnight in
 *  the HUNTER's zone (the backend week key is weekStartKeyIn(hunter.timezone))
 *  — this week's Monday key in tz + 7 calendar days resolves, via
 *  tzDayWindow, to the next spawn instant (DST-correct). Null/undefined/
 *  invalid tz keeps the exact legacy UTC math below (byte-compatible for
 *  pre-R38 hunters). */
export function msUntilNextBoss(tz?: string | null, now: Date = new Date()): number {
  if (tz && isValidTimeZone(tz)) {
    const nextMonday = keyAfter7(weekStartKeyIn(tz, now))
    return Math.max(0, tzDayWindow(nextMonday, tz).start.getTime() - now.getTime())
  }
  const dow = (now.getUTCDay() + 6) % 7 // Monday=0 … Sunday=6
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (7 - dow))
  return Math.max(0, next - now.getTime())
}

/** Format the remaining hunt time as `1D 06:22:41`. */
export function bossCountdownLabel(ms: number): string {
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d}D ${pad(h)}:${pad(m)}:${pad(s)}`
}

// ─── Slayer title track ───────────────────────────────────────────────────────

export const BOSS_TITLES: { count: number; code: string }[] = [
  { count: 1, code: "boss-1" },
  { count: 3, code: "boss-3" },
  { count: 10, code: "boss-10" },
  { count: 25, code: "boss-25" },
  { count: 50, code: "boss-50" },
]

/** Title codes earned for `n` lifetime boss kills. */
export function earnedBossTitleCodes(n: number): string[] {
  return BOSS_TITLES.filter((t) => n >= t.count).map((t) => t.code)
}

/** The next slayer title and how many kills it still needs (null at track end). */
export function nextBossTitle(n: number): { count: number; code: string } | null {
  return BOSS_TITLES.find((t) => t.count > n) ?? null
}

/** The DTO served by /api/boss. */
export type BossDTO = {
  code: string
  name: string
  epithet: string
  threat: string
  glyph: string
  gateId: string
  gateName: string
  /** Boss HP at the hunter's level, enraged by lifetime kills of this boss. */
  hp: number
  /** Best single-raid XP in the boss's gate this week ("damage dealt"). */
  damage: number
  defeated: boolean
  defeatedAt: string | null
  xpReward: number
  essenceReward: number
  totalDefeats: number
  weekStart: string
  /** Enrage state driven by lifetime kills of this boss. */
  enrage: { tier: number; label: string; kills: number; hpMult: number }
}
