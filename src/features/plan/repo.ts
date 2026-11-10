// A day's plan, one row per day (today's, or tomorrow's made the evening before). Plans never touch completions or stones: planning is not the work, so it earns nothing.
import { db, newMeta, touch, type MarbleDB } from '../../db/db'
import type { DayPlan, PlanSlot } from '../../db/types'
import { addDaysToKey, dayKey, isMissed, isProject, isQuestCompletion } from '../quests/day'
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
    if (dayKey(now) === key) next.reviewedAt ??= iso // changing a plan on its day means it's been looked at
    await database.dayPlans.put(next)
  })
}

// "Looks good": the morning review of a plan made the evening before, without changing it.
export async function reviewPlan(key: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const iso = now.toISOString()
  await database.transaction('rw', database.dayPlans, async () => {
    const cur = await database.dayPlans.get(key)
    if (!cur || cur.deletedAt || cur.reviewedAt) return
    await database.dayPlans.put({ ...touch(cur, iso), reviewedAt: iso })
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
  if (!cur || !cur.slots.some((s) => slotKey(s) === slot)) return
  await put(key, { slots: cur.slots.filter((s) => slotKey(s) !== slot) }, now, database)
}

// Gets a quest ready to be planned on day `key` (today or tomorrow) and returns the id to plan. A main or side quest
// due on another day has its due date moved to `key`; a missed one is redone ("Do it today", dated `key`) and the copy
// is planned. Anything else (due that day, undated, a daily quest, a project) is plannable as it is.
export async function bringToDay(id: string, key: string, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const today = dayKey(now)
  const q = await database.quests.get(id)
  if (!q || q.deletedAt) throw new QuestError('One of those quests no longer exists.')
  if (q.category === 'dq' || isProject(q) || !q.dueDate || q.dueDate === key) return id
  const mine = (await database.questCompletions.where('questId').equals(id).toArray()).filter((c) => !c.deletedAt && isQuestCompletion(c))
  if (isMissed(q, mine, now)) return q.redoneAs ? bringToDay(q.redoneAs, key, now, database) : doItToday(id, now, database, key)
  if (q.dueDate >= today && !mine.length) await updateQuest(id, { dueDate: key }, now, database)
  return id
}

// Saves the plan for day `key` (today, or tomorrow the evening before), first bringing each picked quest to that day
// (see bringToDay). A quest due today that moves to tomorrow leaves today's plan too. Loose ends need nothing: their
// date is only a reminder.
export async function planDay(key: string, slots: PlanSlot[], now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const today = dayKey(now)
  if (key < today || key > addDaysToKey(today, 1)) throw new QuestError('Plan today or tomorrow.')
  cleanSlots(slots) // refuse a bad plan before moving anything
  const ready: PlanSlot[] = []
  const leftToday: string[] = []
  for (const s of slots) {
    if (!s.questId) {
      ready.push(s)
      continue
    }
    const before = await database.quests.get(s.questId)
    const id = await bringToDay(s.questId, key, now, database)
    if (key !== today && before?.dueDate === today && id === s.questId) leftToday.push(slotKey(s))
    ready.push({ ...s, questId: id })
  }
  await savePlan(key, ready, now, database)
  for (const slot of leftToday) await unplanSlot(today, slot, now, database)
}
