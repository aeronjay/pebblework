import { db, getDeviceId, newId, newMeta, type MarbleDB } from '../../db/db'
import type { Quest, QuestCategory, QuestCompletion } from '../../db/types'
import { createProjectBoard } from '../board/repo'
import { CATEGORY_ORDER, canComplete, completionId, dayKey, isMissed, isProject, isQuestCompletion } from './day'
import { QuestError } from './errors'

export { QuestError }

export interface QuestInput {
  category: QuestCategory
  title: string
  dueDate?: string // MQ/SQ only; today or later
  dueTime?: string
  note?: string
  startDate?: string // DQ only; today or later (default today)
  isProject?: boolean // MQ/SQ only; creates the default board. dueDate becomes a display-only deadline.
}

// `null` clears an optional field.
export interface QuestPatch {
  title?: string
  note?: string | null
  dueTime?: string | null
  dueDate?: string | null
  order?: number
}

function stamp(now: Date) {
  return { updatedAt: now.toISOString(), deviceId: getDeviceId() }
}

function cleanTitle(title: string): string {
  const t = title.trim()
  if (!t) throw new QuestError('Quest needs a title.')
  return t
}

async function nextOrder(category: QuestCategory, database: MarbleDB): Promise<number> {
  const list = await database.quests.where('category').equals(category).filter((q) => !q.deletedAt).toArray()
  return list.length ? Math.max(...list.map((q) => q.order)) + 1 : 0
}

async function getLiveQuest(id: string, database: MarbleDB): Promise<Quest> {
  const q = await database.quests.get(id)
  if (!q || q.deletedAt) throw new QuestError('Quest not found.')
  return q
}

export async function createQuest(input: QuestInput, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const today = dayKey(now)
  const title = cleanTitle(input.title)
  const isDQ = input.category === 'dq'
  const startDate = isDQ ? (input.startDate ?? today) : today
  // Past dates would retroactively change days that are already ready or closed.
  if (startDate < today) throw new QuestError('A daily quest cannot start in the past.')
  if (!isDQ && input.dueDate && input.dueDate < today) throw new QuestError('Due date cannot be in the past.')
  if (input.isProject && isDQ) throw new QuestError('Only main and side quests can be projects.')
  const id = newId()
  await database.transaction('rw', database.quests, database.boardColumns, async () => {
    const quest: Quest = {
      id,
      category: input.category,
      title,
      order: await nextOrder(input.category, database),
      startDate,
      dueDate: isDQ ? undefined : input.dueDate || undefined,
      dueTime: input.dueTime || undefined,
      note: input.note?.trim() || undefined,
      isProject: input.isProject || undefined,
      ...newMeta(now.toISOString()),
    }
    await database.quests.add(quest)
    if (quest.isProject) await createProjectBoard(id, now, database)
  })
  return id
}

export async function updateQuest(id: string, patch: QuestPatch, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const today = dayKey(now)
  await database.transaction('rw', database.quests, database.questCompletions, async () => {
    const q = await getLiveQuest(id, database)
    const changes: Partial<Quest> = { ...stamp(now) }
    if (patch.title !== undefined) changes.title = cleanTitle(patch.title)
    if (patch.order !== undefined) changes.order = patch.order
    if (patch.note !== undefined) changes.note = patch.note?.trim() || undefined
    if (patch.dueTime !== undefined) changes.dueTime = patch.dueTime || undefined
    if (patch.dueDate !== undefined && (patch.dueDate || undefined) !== q.dueDate) {
      const next = patch.dueDate || undefined
      if (q.category === 'dq') throw new QuestError('Daily quests have no due date.')
      // A project's deadline is display-only (never assigned), so it stays editable; only past dates are refused.
      if (!isProject(q) && q.dueDate && q.dueDate < today) throw new QuestError('A missed quest keeps its date. Use "Do it today" instead.')
      if (next && next < today) throw new QuestError('Due date cannot be in the past.')
      const done = await database.questCompletions.where('questId').equals(id).filter((c) => !c.deletedAt && isQuestCompletion(c)).count()
      if (done && !isProject(q)) throw new QuestError('A completed quest keeps its date.')
      changes.dueDate = next
    }
    await database.quests.update(id, changes)
  })
}

// Soft delete. Past days keep the quest; today's unclaimed completions of it (incl. a project's card/bonus
// completions) are withdrawn; claimed ones stay. A project's columns and cards are soft-deleted with it.
export async function deleteQuest(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const today = dayKey(now)
  const tables = [database.quests, database.questCompletions, database.dayClaims, database.boardColumns, database.cards]
  await database.transaction('rw', tables, async () => {
    const q = await database.quests.get(id)
    if (!q || q.deletedAt) return
    const gone = { deletedAt: now.toISOString(), ...stamp(now) }
    await database.quests.update(id, gone)
    await database.boardColumns.where('questId').equals(id).filter((c) => !c.deletedAt).modify(gone)
    await database.cards.where('questId').equals(id).filter((c) => !c.deletedAt).modify(gone)
    await database.questCompletions
      .where('questId')
      .equals(id)
      .filter((c) => !c.deletedAt && !c.claimedAt && c.dayKey === today)
      .modify(gone)
  })
}

// A missed MQ/SQ can't move (that would retro-unblock its day), so it's copied to today instead.
export async function doItToday(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const today = dayKey(now)
  const newQuestId = newId()
  await database.transaction('rw', database.quests, database.questCompletions, async () => {
    const q = await getLiveQuest(id, database)
    const done = await database.questCompletions.where('questId').equals(id).toArray()
    if (!isMissed(q, done, now)) throw new QuestError('Only missed quests can be redone today.')
    if (q.redoneAs) throw new QuestError('This quest was already redone.')
    await database.quests.update(id, { redoneAs: newQuestId, ...stamp(now) })
    await database.quests.add({
      id: newQuestId,
      category: q.category,
      title: q.title,
      order: await nextOrder(q.category, database),
      startDate: today,
      dueDate: today,
      dueTime: q.dueTime,
      note: q.note,
      ...newMeta(now.toISOString()),
    })
  })
  return newQuestId
}

// Returns false when the same-day lock forbids it (or it's already done). Completing after today was claimed
// makes today ready again; the next claim drops just the new stones.
export async function completeQuest(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', database.quests, database.questCompletions, async () => {
    const q = await database.quests.get(id)
    if (!q) return false
    const mine = await database.questCompletions.where('questId').equals(id).toArray()
    if (!canComplete(q, mine, now)) return false
    const key = dayKey(now)
    const iso = now.toISOString()
    // put: replaces a previously un-completed (soft-deleted) row with the same id.
    const completion: QuestCompletion = { id: completionId(id, key), questId: id, category: q.category, dayKey: key, completedAt: iso, ...newMeta(iso) }
    await database.questCompletions.put(completion)
    return true
  })
}

// Same day only, and only while that completion is unclaimed (claimed completions are permanent).
export async function uncompleteQuest(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  const key = dayKey(now)
  return database.transaction('rw', database.questCompletions, async () => {
    const c = await database.questCompletions.get(completionId(id, key))
    if (!c || c.deletedAt || c.claimedAt) return false
    await database.questCompletions.update(c.id, { deletedAt: now.toISOString(), ...stamp(now) })
    return true
  })
}

export async function moveQuest(id: string, direction: -1 | 1, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.quests, async () => {
    const q = await getLiveQuest(id, database)
    const list = sortQuests(await database.quests.where('category').equals(q.category).filter((x) => !x.deletedAt).toArray())
    const i = list.findIndex((x) => x.id === id)
    const other = list[i + direction]
    if (!other) return
    await database.quests.update(q.id, { order: other.order, ...stamp(now) })
    await database.quests.update(other.id, { order: q.order, ...stamp(now) })
  })
}

export function sortQuests(list: Quest[]): Quest[] {
  return [...list].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.order - b.order ||
      a.createdAt.localeCompare(b.createdAt),
  )
}

export async function liveQuests(database: MarbleDB = db): Promise<Quest[]> {
  return sortQuests(await database.quests.filter((q) => !q.deletedAt).toArray())
}

// Including deleted ones: past days still count quests deleted after them.
export async function allQuests(database: MarbleDB = db): Promise<Quest[]> {
  return database.quests.toArray()
}

export async function completionsBetween(fromKey: string, toKey: string, database: MarbleDB = db): Promise<QuestCompletion[]> {
  return database.questCompletions.where('dayKey').between(fromKey, toKey, true, true).filter((c) => !c.deletedAt).toArray()
}

export async function liveCompletions(database: MarbleDB = db): Promise<QuestCompletion[]> {
  return database.questCompletions.filter((c) => !c.deletedAt).toArray()
}

export async function claimedKeys(database: MarbleDB = db): Promise<Set<string>> {
  return new Set(await database.dayClaims.toCollection().primaryKeys())
}
