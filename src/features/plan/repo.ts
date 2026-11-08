// Today's plan, one row per day. Plans never touch completions or stones: planning is not the work, so it earns nothing.
import { db, newMeta, touch, type MarbleDB } from '../../db/db'
import type { DayPlan, PlanSlot } from '../../db/types'
import { dayKey, isMissed, isProject, isQuestCompletion } from '../quests/day'
import { QuestError } from '../quests/errors'
import { doItToday, updateQuest } from '../quests/repo'
import { IF_THEN_MAX, MAX_PLAN_SLOTS, isValidTime, slotKey, sortSlots } from './model'

export async function getPlan(key: string, database: MarbleDB = db): Promise<DayPlan | undefined> {
  const p = await database.dayPlans.get(key)
  return p && !p.deletedAt ? p : undefined
}

function cleanSlots(slots: PlanSlot[]): PlanSlot[] {
  if (slots.length > MAX_PLAN_SLOTS) throw new QuestError(`Plan up to ${MAX_PLAN_SLOTS} quests. Leave room for the day to happen.`)
  const seen = new Set<string>()
  return sortSlots(
    slots.map((s) => {
      if (!s.questId === !s.taskId) throw new QuestError('Each slot plans one quest or one loose end.')
      if (seen.has(slotKey(s))) throw new QuestError('Each one goes in the plan once.')
      seen.add(slotKey(s))
      if (!isValidTime(s.time)) throw new QuestError('Give each planned quest a start time.')
      const ifThen = s.ifThen?.trim().replace(/\s+/g, ' ').slice(0, IF_THEN_MAX)
      const ref = s.questId ? { questId: s.questId } : { taskId: s.taskId }
      return ifThen ? { ...ref, time: s.time, ifThen } : { ...ref, time: s.time }
    }),
  )
}

async function put(key: string, patch: Pick<DayPlan, 'slots'> & { skipped?: boolean }, now: Date, database: MarbleDB): Promise<void> {
  const iso = now.toISOString()
  await database.transaction('rw', database.dayPlans, async () => {
    const cur = await database.dayPlans.get(key)
    const next: DayPlan = cur ? { ...touch(cur, iso), slots: patch.slots } : { dayKey: key, slots: patch.slots, ...newMeta(iso) }
    delete next.deletedAt
    if (patch.skipped) next.skipped = true
    else delete next.skipped
    await database.dayPlans.put(next)
  })
}

// Replaces the day's plan. Quests and loose ends must be live; an empty list is a valid plan ("nothing needs a time
// today").
export async function savePlan(key: string, slots: PlanSlot[], now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const clean = cleanSlots(slots)
  const [quests, tasks] = await Promise.all([
    database.quests.bulkGet(clean.flatMap((s) => (s.questId ? [s.questId] : []))),
    database.tasks.bulkGet(clean.flatMap((s) => (s.taskId ? [s.taskId] : []))),
  ])
  if ([...quests, ...tasks].some((x) => !x || x.deletedAt)) throw new QuestError('One of those no longer exists.')
  await put(key, { slots: clean }, now, database)
}

// "Not today": the prompt stays quiet for the rest of the day.
export async function skipPlan(key: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await put(key, { slots: [], skipped: true }, now, database)
}

// Moves one planned slot (by slotKey) to a new time. Re-planning is normal, not a failure, so it's one tap and leaves no
// trace.
export async function retimeSlot(key: string, slot: string, time: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  if (!isValidTime(time)) throw new QuestError('That isn’t a valid time.')
  const cur = await getPlan(key, database)
  if (!cur || !cur.slots.some((s) => slotKey(s) === slot)) return
  await put(key, { slots: sortSlots(cur.slots.map((s) => (slotKey(s) === slot ? { ...s, time } : s))) }, now, database)
}

export async function unplanSlot(key: string, slot: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const cur = await getPlan(key, database)
  if (!cur) return
  await put(key, { slots: cur.slots.filter((s) => slotKey(s) !== slot) }, now, database)
}

// Gets a quest ready to be planned today and returns the id to plan. A main or side quest due on a later day has its
// due date moved to today; a missed one is redone today ("Do it today") and the copy is planned. Anything else (due
// today, undated, a project) is plannable as it is.
export async function bringToToday(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const today = dayKey(now)
  const q = await database.quests.get(id)
  if (!q || q.deletedAt) throw new QuestError('One of those quests no longer exists.')
  if (q.category === 'dq' || isProject(q) || !q.dueDate || q.dueDate === today) return id
  const mine = (await database.questCompletions.where('questId').equals(id).toArray()).filter((c) => !c.deletedAt && isQuestCompletion(c))
  if (isMissed(q, mine, now)) return q.redoneAs ?? doItToday(id, now, database)
  if (q.dueDate > today && !mine.length) await updateQuest(id, { dueDate: today }, now, database)
  return id
}

// Saves today's plan, first bringing each picked quest to today (see bringToToday). Loose ends need nothing: their
// date is only a reminder.
export async function planToday(key: string, slots: PlanSlot[], now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  cleanSlots(slots) // refuse a bad plan before moving anything
  const ready: PlanSlot[] = []
  for (const s of slots) ready.push(s.questId ? { ...s, questId: await bringToToday(s.questId, now, database) } : s)
  await savePlan(key, ready, now, database)
}
