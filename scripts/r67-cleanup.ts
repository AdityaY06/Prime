// R67 QA cleanup — delete the throwaway E2E hunter (cascade), leave KAEL intact.
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  const junk = await db.hunter.findMany({
    where: { name: { in: ["R67QA"] } },
    select: { id: true, name: true, leaderboardOptOut: true },
  })
  for (const h of junk) {
    await db.hunter.delete({ where: { id: h.id } })
    console.log(`deleted ${h.name} (${h.id})`)
  }
  const world = await db.hunter.count({ where: { leaderboardOptOut: false } })
  const kael = await db.hunter.findUnique({
    where: { name: "KAEL" },
    select: { level: true, xp: true, totalXp: true, essence: true, streak: true },
  })
  console.log(`world population: ${world}; KAEL: ${JSON.stringify(kael)}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
