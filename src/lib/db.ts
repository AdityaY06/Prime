import { PrismaClient } from '@prisma/client'
import { createRequire } from 'node:module'

// NOTE: key is versioned — bump the suffix after any `prisma db push` schema
// change so a running dev server creates a fresh client with the new models.
// v8: Program/MetricGoal/WorkoutSession.programDay re-applied after the
// 2026-09-30 platform restore (R1-0 foundation push). Cache purged via temp
// /api/prisma-fix route (require-cache surgery, Task 13-a precedent).
//
// ─── R17 centralized self-heal (supersedes per-route surgery) ────────────────
// The dev server process predates the R17 schema push (NutritionLog.fiber/
// sodium/sugar + ExerciseLog.notes), so the client instance it loaded rejects
// the new columns ("Unknown argument fiber"). Restarts are avoided, so this
// module rebuilds the client ONCE per server process from the regenerated
// on-disk code (require-cache surgery — Task 13-a / R3-b precedent) and hands
// every importer the healed instance. Fail-open: on any error the stale client
// keeps serving every pre-existing field exactly as before.
// Probe history: macroSplit → fiber (R17) → Hunter.region (R52-2 standings
// arenas — same surgery, new probe column; the converged v-keys keep every
// older push covered too) → Hunter.leaderboardOptOut (R56 standings
// visibility — the running dev server had already healed to `region`, so the
// probe must move to the NEWEST column to force one more surgery pass).
const globalForPrisma = globalThis as unknown as {
  prisma_v9?: PrismaClient
  prisma_v10?: PrismaClient
  prisma_v11?: PrismaClient
  prisma_v12?: PrismaClient
  __r17PrismaHealed?: boolean
  __r52Healed?: boolean
  __r56Healed?: boolean
}

/** Constructor shape every candidate class must fit (log level literals —
 *  the generic imported class is cast onto it at the single push site). */
type PrismaCtor = new (opts: { log: ("error" | "warn")[] }) => PrismaClient

function healedClient(): PrismaClient | null {
  if (process.env.NODE_ENV === 'production') return null
  // R52-2 lesson (live-diagnosed): the TOP-LEVEL import binding can itself be
  // a pre-push evaluation (stale generated code) — a cache purge does not
  // rebind it. Only a class re-required FROM DISK after the purge is trusted
  // for the probe; the bundled import stays the last-resort candidate.
  const candidates: PrismaCtor[] = []
  try {
    const req = createRequire(`${process.cwd()}/package.json`) as unknown as NodeJS.Require
    if (req?.cache) {
      for (const key of Object.keys(req.cache)) {
        if (key.includes('.prisma/client') || key.includes('@prisma/client')) delete req.cache[key]
      }
    }
    // the generated client first (what @prisma/client re-exports anyway)
    const direct = req('.prisma/client') as { PrismaClient?: PrismaCtor }
    if (direct?.PrismaClient) candidates.push(direct.PrismaClient)
    const reexport = req('@prisma/client') as { PrismaClient: PrismaCtor }
    candidates.push(reexport.PrismaClient)
  } catch (err) {
    console.warn('[lib/db] Prisma re-require failed:', (err as Error)?.message ?? err)
  }
  candidates.push(PrismaClient as unknown as PrismaCtor)
  for (const PC of candidates) {
    try {
      const fresh = new PC({ log: ['error', 'warn'] })
      const hunterFields = (fresh.hunter as unknown as { fields?: Record<string, unknown> }).fields
      if (hunterFields && 'leaderboardOptOut' in hunterFields) {
        // v12/v11/v10/v9 converge: any future db.ts evaluation reuses the healed instance
        globalForPrisma.prisma_v12 = fresh
        globalForPrisma.prisma_v11 = fresh
        globalForPrisma.prisma_v10 = fresh
        globalForPrisma.prisma_v9 = fresh
        console.info('[lib/db] Prisma client healed — R56 standings visibility aware')
        return fresh
      }
    } catch {
      /* try the next candidate class */
    }
  }
  console.warn('[lib/db] Prisma heal failed — serving the legacy client (pre-R56 fields only)')
  return null
}

function selfHeal(): PrismaClient {
  const legacy =
    globalForPrisma.prisma_v12 ??
    globalForPrisma.prisma_v11 ??
    globalForPrisma.prisma_v10 ??
    globalForPrisma.prisma_v9
  const liveFields = (legacy?.hunter as unknown as { fields?: Record<string, unknown> } | undefined)?.fields
  if (liveFields && 'leaderboardOptOut' in liveFields && legacy) return legacy // already healed in this process
  if (globalForPrisma.__r56Healed) return legacy ?? new PrismaClient({ log: ['error', 'warn'] })
  globalForPrisma.__r56Healed = true
  const fresh = healedClient()
  if (fresh) return fresh
  return legacy ?? new PrismaClient({ log: ['error', 'warn'] })
}

export const db = selfHeal()

if (process.env.NODE_ENV !== 'production' && !globalForPrisma.prisma_v9) {
  globalForPrisma.prisma_v9 = db
}
