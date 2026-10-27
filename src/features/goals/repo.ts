import { db, newId, newMeta, type MarbleDB } from '../../db/db'
import type { CheckIn, Goal, GoalStatus, Meta, Milestone } from '../../db/types'

export type GoalInput = Omit<Goal, keyof Meta | 'id' | 'status'>
export type GoalPatch = Partial<GoalInput> & { status?: GoalStatus }

const now = () => new Date().toISOString()

export async function createGoal(input: GoalInput, milestones: string[] = [], database: MarbleDB = db): Promise<string> {
  const id = newId()
  const meta = newMeta()
  await database.transaction('rw', database.goals, database.milestones, async () => {
    await database.goals.add({ ...input, id, status: 'active', ...meta })
    const titles = milestones.map((t) => t.trim()).filter(Boolean)
    await database.milestones.bulkAdd(titles.map((title, order) => ({ id: newId(), goalId: id, title, order, ...meta })))
  })
  return id
}

export async function updateGoal(id: string, patch: GoalPatch, database: MarbleDB = db): Promise<void> {
  await database.goals.update(id, { ...patch, ...touched() })
}

export function setGoalStatus(id: string, status: GoalStatus, database: MarbleDB = db): Promise<void> {
  return updateGoal(id, { status }, database)
}

// Soft delete so the deletion can sync to other devices later.
export async function deleteGoal(id: string, database: MarbleDB = db): Promise<void> {
  const stamp = { ...touched(), deletedAt: now() }
  await database.transaction('rw', database.goals, database.milestones, database.checkIns, async () => {
    await database.goals.update(id, stamp)
    await database.milestones.where('goalId').equals(id).modify(stamp)
    await database.checkIns.where('goalId').equals(id).modify(stamp)
  })
}

export async function addMilestone(goalId: string, title: string, database: MarbleDB = db): Promise<string> {
  const id = newId()
  const existing = await liveMilestones(goalId, database)
  const order = existing.length ? Math.max(...existing.map((m) => m.order)) + 1 : 0
  await database.milestones.add({ id, goalId, title: title.trim(), order, ...newMeta() })
  return id
}

export async function renameMilestone(id: string, title: string, database: MarbleDB = db): Promise<void> {
  await database.milestones.update(id, { title: title.trim(), ...touched() })
}

export async function setMilestoneDone(id: string, done: boolean, database: MarbleDB = db): Promise<void> {
  await database.milestones.update(id, { completedAt: done ? now() : undefined, ...touched() })
}

export async function deleteMilestone(id: string, database: MarbleDB = db): Promise<void> {
  await database.milestones.update(id, { deletedAt: now(), ...touched() })
}

export async function moveMilestone(id: string, direction: -1 | 1, database: MarbleDB = db): Promise<void> {
  const m = await database.milestones.get(id)
  if (!m) return
  const list = await liveMilestones(m.goalId, database)
  const i = list.findIndex((x) => x.id === id)
  const other = list[i + direction]
  if (!other) return
  await database.transaction('rw', database.milestones, async () => {
    await database.milestones.update(m.id, { order: other.order, ...touched() })
    await database.milestones.update(other.id, { order: m.order, ...touched() })
  })
}

export async function checkIn(
  goalId: string,
  opts: { amount?: number; at?: string } = {},
  database: MarbleDB = db,
): Promise<string> {
  const id = newId()
  await database.checkIns.add({ id, goalId, at: opts.at ?? now(), amount: opts.amount, ...newMeta() })
  return id
}

export async function undoCheckIn(id: string, database: MarbleDB = db): Promise<void> {
  await database.checkIns.update(id, { deletedAt: now(), ...touched() })
}

export async function liveGoals(database: MarbleDB = db): Promise<Goal[]> {
  const goals = await database.goals.filter((g) => !g.deletedAt).toArray()
  return goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function liveMilestones(goalId: string, database: MarbleDB = db): Promise<Milestone[]> {
  const list = await database.milestones.where('goalId').equals(goalId).filter((m) => !m.deletedAt).toArray()
  return list.sort((a, b) => a.order - b.order)
}

export async function liveCheckIns(goalId: string, database: MarbleDB = db): Promise<CheckIn[]> {
  const list = await database.checkIns.where('goalId').equals(goalId).filter((c) => !c.deletedAt).toArray()
  return list.sort((a, b) => b.at.localeCompare(a.at))
}

function touched() {
  return { updatedAt: now(), deviceId: newMeta().deviceId }
}
