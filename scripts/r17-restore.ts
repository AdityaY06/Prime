// R15 QA restore — surgically rebuild the pre-QA baseline from /tmp/r17-baseline.json
import { db } from "@/lib/db"
import { readFileSync } from "fs"

const baseline = JSON.parse(readFileSync("/tmp/r17-baseline.json", "utf8")) as Record<string, Record<string, unknown>[]>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = db as any

for (const [table, rows] of Object.entries(baseline)) {
  const ids = rows.map((r) => r.id)
  // 1) sweep rows created after the baseline
  const del = await d[table].deleteMany({ where: { id: { notIn: ids } } })
  // 2) upsert every baseline row back to its exact field values
  for (const row of rows) {
    const { id, ...data } = row
    await d[table].upsert({ where: { id }, create: row, update: data })
  }
  console.log(`${table}: swept ${del.count}, restored ${rows.length}`)
}
console.log("RESTORE COMPLETE")
