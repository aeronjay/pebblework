import { db, getSettings, newId, newMeta, touch, type MarbleDB } from '../../db/db'
import type { Stone, Task } from '../../db/types'
import { dayKey } from '../quests/day'
import { ensureActiveQuestJar } from '../quests/claim'
import { rollRarity } from '../marbles/engine'

export interface NewTask {
  title: string
  note?: string
  dueDate?: string
}

export interface TaskPatch {
  title?: string
  dueDate?: string | null
}

async function getLive(id: string, database: MarbleDB): Promise<Task | undefined> {
  const task = await database.tasks.get(id)
  return task && !task.deletedAt ? task : undefined
}

export async function createTask(input: NewTask, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const id = newId()
  await database.tasks.add({
    id,
    title: input.title.trim(),
    note: input.note?.trim() || undefined,
    dueDate: input.dueDate || undefined,
    ...newMeta(now.toISOString()),
  })
  return id
}

export async function toggleTask(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', [database.tasks, database.jars, database.quests, database.questCompletions, database.stones], async () => {
    const task = await getLive(id, database)
    if (!task) return false
    const next = touch(task, now.toISOString())
    if (task.completedAt) {
      delete next.completedAt
    } else {
      const iso = now.toISOString()
      next.completedAt = iso
      if (!task.marbleAwardedAt) {
        const jar = await ensureActiveQuestJar(database, now)
        const stone: Stone = {
          id: newId(),
          jarId: jar.id,
          dayKey: dayKey(now),
          category: 'sq',
          weight: 1,
          rarity: rollRarity(),
          at: iso,
          ...newMeta(iso),
        }
        await database.stones.add(stone)
        next.marbleAwardedAt = iso
      }
    }
    await database.tasks.put(next)
    return !!next.completedAt
  })
}

export async function updateTask(id: string, patch: TaskPatch, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', database.tasks, async () => {
    const task = await getLive(id, database)
    if (!task) return false
    const next = { ...task }
    let changed = false
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (!title || title === task.title) return false
      next.title = title
      changed = true
    }
    if (patch.dueDate !== undefined && (patch.dueDate || undefined) !== task.dueDate) {
      if (patch.dueDate) next.dueDate = patch.dueDate
      else delete next.dueDate
      changed = true
    }
    if (!changed) return false
    await database.tasks.put(touch(next, now.toISOString()))
    return true
  })
}

export async function deleteTask(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.tasks, async () => {
    const task = await getLive(id, database)
    if (task) await database.tasks.put({ ...touch(task, now.toISOString()), deletedAt: now.toISOString() })
  })
}

export async function reorderLooseEnds(ids: string[], database: MarbleDB = db): Promise<void> {
  await database.settings.put({ ...(await getSettings(database)), looseEndOrder: [...ids] })
}

// Open tasks the user has arranged keep that order. Anything not arranged yet sits above them, by deadline, so a new
// loose end is seen right away. Finished tasks always come last.
export function applyLooseEndOrder(sorted: Task[], order: string[] = []): Task[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  const open = sorted.filter((task) => !task.completedAt)
  const arranged = open.filter((task) => rank.has(task.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  return [...open.filter((task) => !rank.has(task.id)), ...arranged, ...sorted.filter((task) => task.completedAt)]
}

export async function listTasks(database: MarbleDB = db, now: Date = new Date()): Promise<Task[]> {
  const [tasks, settings] = await Promise.all([database.tasks.filter((task) => !task.deletedAt).toArray(), getSettings(database)])
  const today = dayKey(now)
  const sorted = tasks.sort((a, b) => {
    const aDone = Number(!!a.completedAt)
    const bDone = Number(!!b.completedAt)
    if (aDone !== bDone) return aDone - bDone
    if (!aDone) {
      const aDue = a.dueDate ?? '9999-12-31'
      const bDue = b.dueDate ?? '9999-12-31'
      const aOverdue = Number(!!a.dueDate && a.dueDate < today)
      const bOverdue = Number(!!b.dueDate && b.dueDate < today)
      if (aOverdue !== bOverdue) return bOverdue - aOverdue
      if (aDue !== bDue) return aDue.localeCompare(bDue)
    }
    return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
  })
  return applyLooseEndOrder(sorted, settings.looseEndOrder)
}
