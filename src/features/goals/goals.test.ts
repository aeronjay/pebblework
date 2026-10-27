import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { newMeta } from '../../db/db'
import type { CheckIn, Goal } from '../../db/types'
import {
  addMilestone,
  checkIn,
  createGoal,
  deleteGoal,
  liveCheckIns,
  liveGoals,
  liveMilestones,
  moveMilestone,
  setMilestoneDone,
  undoCheckIn,
  updateGoal,
} from './repo'
import { habitProgress, numericTotal, projectProgress } from './progress'

const base = { color: '#f97316' }

describe('goal repo', () => {
  it('creates a project with ordered milestones and edits it', async () => {
    const d = freshDb()
    const id = await createGoal({ ...base, type: 'project', title: 'Ship app' }, ['Spec', ' ', 'Build'], d)
    await addMilestone(id, 'Launch', d)
    await updateGoal(id, { title: 'Ship v1' }, d)

    const [goal] = await liveGoals(d)
    expect(goal).toMatchObject({ title: 'Ship v1', status: 'active' })
    expect((await liveMilestones(id, d)).map((m) => m.title)).toEqual(['Spec', 'Build', 'Launch'])
  })

  it('reorders and completes milestones', async () => {
    const d = freshDb()
    const id = await createGoal({ ...base, type: 'project', title: 'P' }, ['A', 'B'], d)
    const [a] = await liveMilestones(id, d)
    await moveMilestone(a.id, 1, d)
    await setMilestoneDone(a.id, true, d)
    const list = await liveMilestones(id, d)
    expect(list.map((m) => m.title)).toEqual(['B', 'A'])
    expect(projectProgress(list)).toMatchObject({ done: 1, total: 2, next: { title: 'B' } })
  })

  it('soft-deletes a goal with its check-ins', async () => {
    const d = freshDb()
    const id = await createGoal({ ...base, type: 'habit', title: 'Read', schedule: { kind: 'daily' } }, [], d)
    await checkIn(id, {}, d)
    await deleteGoal(id, d)
    expect(await liveGoals(d)).toEqual([])
    expect(await liveCheckIns(id, d)).toEqual([])
    expect(await d.goals.count()).toBe(1)
  })

  it('sums numeric check-ins and ignores undone ones', async () => {
    const d = freshDb()
    const id = await createGoal({ ...base, type: 'numeric', title: 'Run', target: { amount: 100, unit: 'km', chunk: 10 } }, [], d)
    await checkIn(id, { amount: 5 }, d)
    const mistake = await checkIn(id, { amount: 50 }, d)
    await undoCheckIn(mistake, d)
    expect(numericTotal(await liveCheckIns(id, d))).toBe(5)
  })
})

describe('habitProgress', () => {
  const goal = (schedule: Goal['schedule']): Goal => ({ id: 'g', type: 'habit', title: 'H', color: '', status: 'active', schedule, ...newMeta() })
  const at = (iso: string): CheckIn => ({ id: iso, goalId: 'g', at: new Date(iso).toISOString(), ...newMeta() })
  const wed = new Date('2026-10-28T12:00:00')

  it('daily habits are due every day', () => {
    expect(habitProgress(goal({ kind: 'daily' }), [], wed)).toMatchObject({ dueToday: true, doneToday: false })
    expect(habitProgress(goal({ kind: 'daily' }), [at('2026-10-28T08:00:00')], wed)).toMatchObject({ doneToday: true, done: 1 })
  })

  it('weekday habits are due only on their days', () => {
    expect(habitProgress(goal({ kind: 'weekdays', days: [1, 5] }), [], wed).dueToday).toBe(false)
    expect(habitProgress(goal({ kind: 'weekdays', days: [3] }), [], wed).dueToday).toBe(true)
  })

  it('weekly habits count distinct days this week and stop being due once met', () => {
    const g = goal({ kind: 'weekly', timesPerWeek: 2 })
    const checkIns = [at('2026-10-26T08:00:00'), at('2026-10-26T20:00:00'), at('2026-10-27T08:00:00'), at('2026-10-20T08:00:00')]
    expect(habitProgress(g, checkIns, wed)).toMatchObject({ done: 2, required: 2, dueToday: false })
    expect(habitProgress(g, checkIns.slice(0, 2), wed)).toMatchObject({ done: 1, dueToday: true })
  })
})
