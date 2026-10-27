import { db, newId, newMeta, type MarbleDB } from '../../db/db'
import type { CheckIn, Goal, GoalStatus, Meta, Milestone } from '../../db/types'
import { MARBLE_VALUES } from '../marbles/config'
import { awardMarbles, revokeMarbles } from '../marbles/engine'
import { numericTotal } from './progress'

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
  await database.transaction('rw', [database.goals, ...marbleTables(database)], async () => {
    const goal = await database.goals.get(id)
    if (!goal) return
    await database.goals.update(id, { ...patch, ...touched() })
    if (!patch.status || patch.status === goal.status) return
    const sourceId = `complete:${id}`
    if (patch.status === 'completed') {
      await awardMarbles(database, { reason: 'goal_complete', count: MARBLE_VALUES.goal_complete, color: goal.color, goalId: id, sourceId })
    } else if (goal.status === 'completed') {
      await revokeMarbles(database, sourceId)
    }
  })
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
  await database.transaction('rw', [database.milestones, database.goals, ...marbleTables(database)], async () => {
    const m = await database.milestones.get(id)
    if (!m || !!m.completedAt === done) return
    await database.milestones.update(id, { completedAt: done ? now() : undefined, ...touched() })
    const goal = await database.goals.get(m.goalId)
    if (done && goal) {
      await awardMarbles(database, { reason: 'milestone', count: MARBLE_VALUES.milestone, color: goal.color, goalId: goal.id, sourceId: id })
    } else {
      await revokeMarbles(database, id)
    }
  })
}

export async function deleteMilestone(id: string, database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', [database.milestones, ...marbleTables(database)], async () => {
    await database.milestones.update(id, { deletedAt: now(), ...touched() })
    await revokeMarbles(database, id)
  })
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
  await database.transaction('rw', [database.checkIns, database.goals, ...marbleTables(database)], async () => {
    const goal = await database.goals.get(goalId)
    if (!goal) throw new Error(`Goal ${goalId} not found`)
    const before = goal.type === 'numeric' ? numericTotal(await liveCheckIns(goalId, database)) : 0
    await database.checkIns.add({ id, goalId, at: opts.at ?? now(), amount: opts.amount, ...newMeta() })
    const award = { color: goal.color, goalId, sourceId: id }
    if (goal.type === 'habit') {
      await awardMarbles(database, { ...award, reason: 'checkin', count: MARBLE_VALUES.checkin })
    } else if (goal.type === 'numeric' && goal.target) {
      const count = chunksCrossed(before, before + (opts.amount ?? 0), goal.target.chunk) * MARBLE_VALUES.chunk
      await awardMarbles(database, { ...award, reason: 'chunk', count })
    }
  })
  return id
}

export function chunksCrossed(before: number, after: number, chunk: number): number {
  if (!(chunk > 0)) return 0
  return Math.max(0, Math.floor(after / chunk) - Math.floor(before / chunk))
}

export async function undoCheckIn(id: string, database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', [database.checkIns, ...marbleTables(database)], async () => {
    await database.checkIns.update(id, { deletedAt: now(), ...touched() })
    await revokeMarbles(database, id)
  })
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

function marbleTables(database: MarbleDB) {
  return [database.marbleEvents, database.jars, database.settings]
}

function touched() {
  return { updatedAt: now(), deviceId: newMeta().deviceId }
}
