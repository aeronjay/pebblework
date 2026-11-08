import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { completeQuest, createQuest, deleteQuest } from '../quests/repo'
import { createTask, deleteTask } from '../tasks/repo'
import { getPlan, planToday, retimeSlot, savePlan, skipPlan, unplanSlot } from './repo'

const now = new Date(2026, 10, 4, 8)
const earlier = new Date(2026, 10, 1, 8)
const KEY = '2026-11-04'

describe('plan repo', () => {
  it('saves a plan sorted by time, trims the if-then, and replaces it on save', async () => {
    const d = freshDb()
    const a = await createQuest({ category: 'mq', title: 'Report', dueDate: KEY }, now, d)
    const b = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    await savePlan(KEY, [{ questId: b, time: '17:00' }, { questId: a, time: '09:00', ifThen: '  right   after lunch ' }], now, d)
    expect((await getPlan(KEY, d))?.slots).toEqual([
      { questId: a, time: '09:00', ifThen: 'right after lunch' },
      { questId: b, time: '17:00' },
    ])
    await savePlan(KEY, [{ questId: b, time: '07:30', ifThen: '   ' }], now, d)
    expect((await getPlan(KEY, d))?.slots).toEqual([{ questId: b, time: '07:30' }])
  })

  it('refuses more than three, duplicates, bad times and deleted quests', async () => {
    const d = freshDb()
    const ids = await Promise.all([1, 2, 3, 4].map((i) => createQuest({ category: 'sq', title: `q${i}` }, now, d)))
    await expect(savePlan(KEY, ids.map((questId) => ({ questId, time: '10:00' })), now, d)).rejects.toThrow(/up to 3/)
    await expect(savePlan(KEY, [{ questId: ids[0], time: '10:00' }, { questId: ids[0], time: '11:00' }], now, d)).rejects.toThrow()
    await expect(savePlan(KEY, [{ questId: ids[0], time: '25:00' }], now, d)).rejects.toThrow()
    await deleteQuest(ids[1], now, d)
    await expect(savePlan(KEY, [{ questId: ids[1], time: '10:00' }], now, d)).rejects.toThrow()
    expect(await getPlan(KEY, d)).toBeUndefined()
  })

  it('"Not today" leaves an empty, skipped plan; planning after clears the skip', async () => {
    const d = freshDb()
    const a = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    await skipPlan(KEY, now, d)
    expect(await getPlan(KEY, d)).toMatchObject({ slots: [], skipped: true })
    await savePlan(KEY, [{ questId: a, time: '09:00' }], now, d)
    expect((await getPlan(KEY, d))?.skipped).toBeUndefined()
  })

  it('retimes and unplans one slot, keeping the order by time', async () => {
    const d = freshDb()
    const a = await createQuest({ category: 'dq', title: 'A' }, now, d)
    const b = await createQuest({ category: 'dq', title: 'B' }, now, d)
    await savePlan(KEY, [{ questId: a, time: '09:00' }, { questId: b, time: '10:00' }], now, d)
    await retimeSlot(KEY, `q:${a}`, '11:00', now, d)
    expect((await getPlan(KEY, d))?.slots.map((s) => [s.questId, s.time])).toEqual([
      [b, '10:00'],
      [a, '11:00'],
    ])
    await expect(retimeSlot(KEY, `q:${a}`, 'soon', now, d)).rejects.toThrow()
    await unplanSlot(KEY, `q:${b}`, now, d)
    expect((await getPlan(KEY, d))?.slots.map((s) => s.questId)).toEqual([a])
  })

  it('planning earns nothing: no completions, no stones', async () => {
    const d = freshDb()
    const a = await createQuest({ category: 'dq', title: 'A' }, now, d)
    await savePlan(KEY, [{ questId: a, time: '09:00' }], now, d)
    expect(await d.questCompletions.count()).toBe(0)
    expect(await d.stones.count()).toBe(0)
    expect(await completeQuest(a, now, d)).toBe(true) // and a planned quest completes as usual
  })

  it('planToday brings quests to today: a later due date moves, a missed one is redone, the rest stay as they are', async () => {
    const d = freshDb()
    const missed = await createQuest({ category: 'mq', title: 'Passport', dueDate: '2026-11-02' }, earlier, d)
    const later = await createQuest({ category: 'sq', title: 'Errand', dueDate: '2026-11-07' }, now, d)
    const project = await createQuest({ category: 'mq', title: 'Game', isProject: true, dueDate: '2026-11-30' }, now, d)
    await planToday(KEY, [{ questId: missed, time: '09:00' }, { questId: later, time: '11:00' }, { questId: project, time: '14:00' }], now, d)
    const original = await d.quests.get(missed)
    expect(original?.redoneAs).toBeDefined()
    expect(original?.dueDate).toBe('2026-11-02') // a missed day stays as it was
    expect((await d.quests.get(original!.redoneAs!))?.dueDate).toBe(KEY)
    expect((await d.quests.get(later))?.dueDate).toBe(KEY)
    expect((await d.quests.get(project))?.dueDate).toBe('2026-11-30') // a project's deadline isn't touched
    expect((await getPlan(KEY, d))?.slots.map((s) => s.questId)).toEqual([original!.redoneAs, later, project])
    expect(await completeQuest(later, now, d)).toBe(true) // and it can be done today now
  })

  it('planToday refuses a bad plan before moving anything', async () => {
    const d = freshDb()
    const ids = await Promise.all([1, 2, 3, 4].map((i) => createQuest({ category: 'sq', title: `q${i}`, dueDate: '2026-11-07' }, now, d)))
    await expect(planToday(KEY, ids.map((questId) => ({ questId, time: '10:00' })), now, d)).rejects.toThrow()
    expect((await d.quests.bulkGet(ids)).every((q) => q?.dueDate === '2026-11-07')).toBe(true)
  })

  it('plans loose ends alongside quests; their dates are left alone', async () => {
    const d = freshDb()
    const q = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    const t = await createTask({ title: 'Call the bank', dueDate: '2026-11-06' }, now, d)
    await planToday(KEY, [{ taskId: t, time: '10:00', ifThen: 'after lunch' }, { questId: q, time: '09:00' }], now, d)
    expect((await getPlan(KEY, d))?.slots).toEqual([
      { questId: q, time: '09:00' },
      { taskId: t, time: '10:00', ifThen: 'after lunch' },
    ])
    expect((await d.tasks.get(t))?.dueDate).toBe('2026-11-06')
    await retimeSlot(KEY, `t:${t}`, '08:00', now, d)
    expect((await getPlan(KEY, d))?.slots.map((s) => s.taskId ?? s.questId)).toEqual([t, q])
    await unplanSlot(KEY, `t:${t}`, now, d)
    expect((await getPlan(KEY, d))?.slots).toEqual([{ questId: q, time: '09:00' }])
  })

  it('refuses a slot with both or neither, the same loose end twice, and deleted loose ends', async () => {
    const d = freshDb()
    const q = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    const t = await createTask({ title: 'Call the bank' }, now, d)
    await expect(savePlan(KEY, [{ questId: q, taskId: t, time: '09:00' }], now, d)).rejects.toThrow()
    await expect(savePlan(KEY, [{ time: '09:00' }], now, d)).rejects.toThrow()
    await expect(savePlan(KEY, [{ taskId: t, time: '09:00' }, { taskId: t, time: '10:00' }], now, d)).rejects.toThrow()
    await deleteTask(t, now, d)
    await expect(savePlan(KEY, [{ taskId: t, time: '09:00' }], now, d)).rejects.toThrow()
  })
})
