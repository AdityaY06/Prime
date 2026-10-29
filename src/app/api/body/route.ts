import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getHunter } from "@/lib/engine"
import { dayKeyIn, tzDayWindow, weekStartKeyIn } from "@/lib/game"
import { freshness, freshnessVerdict, type FreshnessVerdict } from "@/lib/recovery"
import {
  MUSCLES,
  mapExerciseToMuscles,
  normalizeName,
  type BodyDTO,
  type MuscleId,
  type MuscleStat,
} from "@/lib/muscles"

export const dynamic = "force-dynamic"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function emptyStat(id: MuscleId): MuscleStat {
  const def = MUSCLES.find((m) => m.id === id)!
  return {
    id,
    name: def.name,
    region: def.region,
    guideline: [def.guideline[0], def.guideline[1]],
    weeklySets: 0,
    secondarySets: 0,
    lastTrainedHoursAgo: null,
    recovery: "untrained",
    weeklyTrend: [0, 0, 0, 0],
    topExercises: [],
    prs: [],
  }
}

/**
 * R69 — scanner recovery verdict, mapped from the freshness curve's verdict
 * (audit 2-a B4 split-brain closed): the 3D scanner now runs the SAME
 * volume-aware curve as the BODY tab's freshness panel — one recovery model,
 * both surfaces. Curve, verdict bands (FRESH ≥80 · RECOVERING 40–79 ·
 * FATIGUED <40) and citations are documented in lib/recovery.ts's header;
 * the flat 36/72h cutoffs are gone. Verdict → scanner vocabulary (the
 * MuscleStat["recovery"] strings the scanner UI renders):
 * FRESH → "ready" · RECOVERING → "recovering" · FATIGUED → "fatigued".
 */
function mapFreshness(v: FreshnessVerdict): MuscleStat["recovery"] {
  if (v === "FRESH") return "ready"
  if (v === "RECOVERING") return "recovering"
  return "fatigued"
}

// GET /api/body — muscle atlas stats for the 3D body scanner
export async function GET() {
  try {
    const now = Date.now()
    const statById = new Map<MuscleId, MuscleStat>(MUSCLES.map((m) => [m.id, emptyStat(m.id)]))
    const unmapped = new Set<string>()

    // Personal bests per muscle (exercises whose PRIMARY movers include the muscle)
    // R33 — cookie-scoped identity (was a raw findFirst that would have served
    // the first-created profile to EVERY device — the shared-account bug).
    const hunter = await getHunter()
    if (hunter) {
      const records = (
        await db.personalBest.findMany({ where: { hunterId: hunter.id } })
      ).sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime())
      for (const pb of records) {
        const mapped = mapExerciseToMuscles(pb.name)
        if (!mapped) continue
        for (const mid of mapped.primary) {
          const st = statById.get(mid)
          if (st && st.prs.length < 5) {
            st.prs.push({ name: pb.displayName, value: pb.bestValue, unit: pb.unit })
          }
        }
      }
    }

    // 90-day sessions with logs (any status — active sessions count too)
    if (hunter) {
      const sessions = await db.workoutSession.findMany({
        where: { hunterId: hunter.id, startedAt: { gte: new Date(now - 90 * DAY) } },
        include: { logs: true },
      })

      // R69 — the weekly-sets window rolls with the hunter's timezone (audit
      // 2-a B3 class; the /api/readiness R68 idiom): hunter-tz Monday key,
      // then the DST-correct UTC instant of that Monday's midnight. Null
      // timezone falls back to legacy server-local behavior per dayKeyIn's
      // contract. Instant-window comparison structure unchanged.
      const weekStart = weekStartKeyIn(hunter.timezone)
      const weekNow = tzDayWindow(weekStart, hunter.timezone).start.getTime()
      const buckets = [weekNow - 3 * WEEK, weekNow - 2 * WEEK, weekNow - WEEK, weekNow]
      const lastTouch = new Map<MuscleId, number>()
      // R69 — recovery inputs for the freshness curve, mirroring lib/recovery.ts
      // lastTrainedByMuscle exactly: CLEARED sessions only (the freshness
      // panel's doctrine — abandoned/active raids carry no completed work),
      // recency = session START instant, and setsSince = every log on that
      // started-day that touched the muscle (multiple same-day sessions sum;
      // non-positive sets skipped). R70 — day attribution = session START day
      // in the HUNTER'S TIMEZONE (dayKeyIn — recovery.ts's own R70 tz param,
      // so the scanner and the freshness panel agree on the calendar day by
      // construction, not by a shared server-local assumption).
      const lastClearedStart = new Map<MuscleId, number>()
      const daySets = new Map<string, Map<MuscleId, number>>()
      // muscle → normalized name → { display, sets }
      const topAgg = new Map<MuscleId, Map<string, { name: string; sets: number }>>()

      for (const session of sessions) {
        // R70 — session-start day key (hunter-tz) for CLEARED sessions only
        // (recovery.ts's day-attribution convention; computed once per session).
        const clearedDay =
          session.status === "cleared" ? dayKeyIn(hunter.timezone, session.startedAt) : null
        const clearedStart = session.status === "cleared" ? session.startedAt.getTime() : null
        for (const log of session.logs) {
          const t = log.createdAt ? log.createdAt.getTime() : session.startedAt.getTime()
          const mapped = mapExerciseToMuscles(log.name)
          if (!mapped) {
            unmapped.add(log.name)
            continue
          }

          const sets = Math.max(0, log.sets)
          const inWeek = t >= now - WEEK
          const touched = new Set<MuscleId>([...mapped.primary, ...mapped.secondary])

          for (const mid of touched) {
            // last trained (primary or secondary)
            const prev = lastTouch.get(mid) ?? -1
            if (t > prev) lastTouch.set(mid, t)

            // R70 — freshness-curve inputs (cleared sessions only, session
            // START day attribution in the hunter's tz — the recovery.ts mirror)
            if (clearedDay && clearedStart !== null && sets > 0) {
              const prevStart = lastClearedStart.get(mid) ?? -1
              if (clearedStart > prevStart) lastClearedStart.set(mid, clearedStart)
              const byMuscle = daySets.get(clearedDay) ?? new Map<MuscleId, number>()
              byMuscle.set(mid, (byMuscle.get(mid) ?? 0) + sets)
              daySets.set(clearedDay, byMuscle)
            }

            // top exercises over 90 days (primary or secondary)
            let byName = topAgg.get(mid)
            if (!byName) {
              byName = new Map()
              topAgg.set(mid, byName)
            }
            const key = normalizeName(log.name)
            const agg = byName.get(key)
            if (agg) agg.sets += sets
            else byName.set(key, { name: log.name, sets })
          }

          for (const mid of mapped.primary) {
            const st = statById.get(mid)
            if (!st) continue
            if (inWeek) st.weeklySets += sets
            for (let i = 0; i < buckets.length; i++) {
              const upper = i + 1 < buckets.length ? buckets[i + 1] : Infinity
              if (t >= buckets[i] && t < upper) {
                st.weeklyTrend[i] += sets
                break
              }
            }
          }

          if (inWeek) {
            for (const mid of mapped.secondary) {
              if (mapped.primary.includes(mid)) continue
              const st = statById.get(mid)
              if (st) st.secondarySets += sets
            }
          }
        }
      }

      for (const [mid, t] of lastTouch) {
        const st = statById.get(mid)
        if (st) st.lastTrainedHoursAgo = Math.round(((now - t) / HOUR) * 10) / 10
      }

      for (const [mid, byName] of topAgg) {
        const st = statById.get(mid)
        if (!st) continue
        st.topExercises = [...byName.values()]
          .sort((a, b) => b.sets - a.sets)
          .slice(0, 3)
          .map((e) => ({ name: e.name, sets: e.sets }))
      }

      // R69 — recovery verdicts derive from the freshness curve (audit 2-a
      // B4): score = freshness(hoursSince, setsSince) over the CLEARED-session
      // recency + last-training-day volume tracked above, then verdict →
      // scanner vocabulary. Same curve, same bands as the freshness panel
      // (lib/recovery.ts) — one recovery model, both BODY-tab surfaces.
      // R70 — the day attribution feeding setsSince is hunter-tz (dayKeyIn),
      // identical to recoveryView(data.history, now, hunter.timezone) on the
      // panel: the two surfaces now agree by construction.
      // Muscles with no cleared history keep the "untrained" default;
      // clock-skew negative hours clamp to 0 inside freshness();
      // lastTrainedHoursAgo keeps its any-status readout semantics (ZERO UI
      // changes — only the recovery field's derivation moved to the curve).
      for (const [mid, at] of lastClearedStart) {
        const st = statById.get(mid)
        if (!st) continue
        const hoursSince = (now - at) / HOUR
        const setsSince = daySets.get(dayKeyIn(hunter.timezone, new Date(at)))?.get(mid) ?? 0
        st.recovery = mapFreshness(freshnessVerdict(freshness(hoursSince, setsSince)))
      }
    }

    const body: BodyDTO = {
      muscles: MUSCLES.map((m) => statById.get(m.id)!),
      unmappedExercises: [...unmapped].sort(),
      generatedAt: new Date(now).toISOString(),
    }
    return NextResponse.json(body)
  } catch (e) {
    console.error("GET /api/body", e)
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 })
  }
}
