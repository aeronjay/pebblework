// Deleting a quest or loose end takes it out of the plans for today and later, promise included: you changed your mind
// about doing it at all, which isn't the same as breaking a promise to do it. Past days keep their record as it was.
// Kept apart from plan/repo so the quest and task repos can call it without an import cycle.
import { touch, type MarbleDB } from '../../db/db'
import type { DayPlan, PlanSlot } from '../../db/types'

const keyOf = (s: Pick<PlanSlot, 'questId' | 'taskId'>) => (s.questId ? `q:${s.questId}` : `t:${s.taskId}`)

// Call inside a transaction that includes `dayPlans`. `key` = the slot key ("q:<id>" / "t:<id>").
export async function forgetInPlans(key: string, fromDay: string, now: Date, database: MarbleDB): Promise<void> {
  const iso = now.toISOString()
  const plans = await database.dayPlans.where('dayKey').aboveOrEqual(fromDay).toArray()
  for (const p of plans) {
    if (p.deletedAt) continue
    const inSlots = p.slots.some((s) => keyOf(s) === key)
    const inPromise = p.promise?.some((x) => x.key === key)
    if (!inSlots && !inPromise) continue
    const next: DayPlan = { ...touch(p, iso), slots: p.slots.filter((s) => keyOf(s) !== key) }
    const promise = (p.promise ?? []).filter((x) => x.key !== key)
    if (promise.length) next.promise = promise
    else delete next.promise
    await database.dayPlans.put(next)
  }
}
