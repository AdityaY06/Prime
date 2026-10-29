import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const t = new Date(); const dk = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`
// remove MY test artifacts only: the 250ml water row + the first-meal XP event, revert xp
const water = await db.waterLog.findMany({ where: { day: dk, ml: 250 } })
console.log('water rows found (mine):', water.length)
for (const w of water) await db.waterLog.delete({ where: { id: w.id } })
const ev = await db.xpEvent.findFirst({ where: { day: dk, source: 'bonus', note: 'First meal logged' } })
console.log('first-meal xp event:', ev?.id, ev?.amount)
if (ev) {
  await db.xpEvent.delete({ where: { id: ev.id } })
  const h = await db.hunter.findFirst()
  if (h) await db.hunter.update({ where: { id: h.id }, data: { xp: h.xp - ev.amount, totalXp: h.totalXp - ev.amount } })
  console.log('reverted hunter xp by', ev.amount)
}
console.log('final: nutrition', await db.nutritionLog.count({ where: { day: dk } }), 'water', await db.waterLog.count({ where: { day: dk } }), 'goals', await db.metricGoal.count())
const h2 = await db.hunter.findFirst()
console.log('hunter xp/totalXp:', h2?.xp, h2?.totalXp)
await db.$disconnect()
