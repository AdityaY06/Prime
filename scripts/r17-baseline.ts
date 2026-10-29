// R15 QA baseline dump — all tables to /tmp/r17-baseline.json
import { db } from "@/lib/db"
import { writeFileSync } from "fs"

const dump: Record<string, unknown[]> = {}
const tables = [
  "hunter", "quest", "workoutSession", "exerciseLog", "achievement",
  "xpEvent", "personalBest", "relic", "briefing", "restDay",
  "bossDefeat", "nutritionLog", "waterLog", "program", "metricGoal", "bodyMetric",
] as const

for (const t of tables) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dump[t] = await (db as any)[t].findMany()
}

writeFileSync("/tmp/r17-baseline.json", JSON.stringify(dump, null, 1))
console.log("dumped:", Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])))
