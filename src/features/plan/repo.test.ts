import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { completeQuest, createQuest, deleteQuest } from '../quests/repo'
import { createTask, deleteTask, toggleTask } from '../tasks/repo'
import { needsReview, promiseLines } from './model'
import { getPlan, keptKeys, planDay, retimeSlot, reviewPlan, savePlan, skipPlan, unplanSlot } from './repo'

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

  it('keeps the day’s note with the plan; other changes leave it alone', async () => {
    const d = freshDb()
    const a = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    await planDay(KEY, { slots: [{ questId: a, time: '09:00' }], note: '\r\n  Wake up early\r\ndo projects early\n\n' }, now, d)
    expect((await getPlan(KEY, d))?.note).toBe('Wake up early\ndo projects early')
    await retimeSlot(KEY, `q:${a}`, '10:00', now, d)
    await savePlan(KEY, [{ questId: a, time: '11:00' }], now, d) // no note given: unchanged
    expect((await getPlan(KEY, d))?.note).toBe('Wake up early\ndo projects early')
    await planDay(KEY, { slots: [], note: '   ' }, now, d)
    expect((await getPlan(KEY, d))?.note).toBeUndefined()
  })

  it('a plan can be just a note', async () => {
    const d = freshDb()
    await planDay(KEY, { slots: [], note: 'Ask about the email' }, now, d)
    const plan = await getPlan(KEY, d)
    expect(plan?.slots).toEqual([])
    expect(plan?.note).toBe('Ask about the email')
    expect(plan?.promise).toBeUndefined()
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

  it('planDay brings quests to today: a later due date moves, a missed one is redone, the rest stay as they are', async () => {
    const d = freshDb()
    const missed = await createQuest({ category: 'mq', title: 'Passport', dueDate: '2026-11-02' }, earlier, d)
    const later = await createQuest({ category: 'sq', title: 'Errand', dueDate: '2026-11-07' }, now, d)
    const project = await createQuest({ category: 'mq', title: 'Game', isProject: true, dueDate: '2026-11-30' }, now, d)
    await planDay(KEY, [{ questId: missed, time: '09:00' }, { questId: later, time: '11:00' }, { questId: project, time: '14:00' }], now, d)
    const original = await d.quests.get(missed)
    expect(original?.redoneAs).toBeDefined()
    expect(original?.dueDate).toBe('2026-11-02') // a missed day stays as it was
    expect((await d.quests.get(original!.redoneAs!))?.dueDate).toBe(KEY)
    expect((await d.quests.get(later))?.dueDate).toBe(KEY)
    expect((await d.quests.get(project))?.dueDate).toBe('2026-11-30') // a project's deadline isn't touched
    expect((await getPlan(KEY, d))?.slots.map((s) => s.questId)).toEqual([original!.redoneAs, later, project])
    expect(await completeQuest(later, now, d)).toBe(true) // and it can be done today now
  })

  it('planDay refuses a bad plan before moving anything', async () => {
    const d = freshDb()
    const ids = await Promise.all([1, 2, 3, 4].map((i) => createQuest({ category: 'sq', title: `q${i}`, dueDate: '2026-11-07' }, now, d)))
    await expect(planDay(KEY, ids.map((questId) => ({ questId, time: '10:00' })), now, d)).rejects.toThrow()
    expect((await d.quests.bulkGet(ids)).every((q) => q?.dueDate === '2026-11-07')).toBe(true)
  })

  it('plans loose ends alongside quests; their dates are left alone', async () => {
    const d = freshDb()
    const q = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    const t = await createTask({ title: 'Call the bank', dueDate: '2026-11-06' }, now, d)
    await planDay(KEY, [{ taskId: t, time: '10:00', ifThen: 'after lunch' }, { questId: q, time: '09:00' }], now, d)
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

  it('planning tomorrow the evening before: due dates move to tomorrow, a missed one is redone for tomorrow', async () => {
    const d = freshDb()
    const evening = new Date(2026, 10, 4, 21)
    const TOMORROW = '2026-11-05'
    const missed = await createQuest({ category: 'mq', title: 'Passport', dueDate: '2026-11-02' }, earlier, d)
    const open = await createQuest({ category: 'sq', title: 'Report', dueDate: KEY }, now, d)
    const later = await createQuest({ category: 'sq', title: 'Errand', dueDate: '2026-11-09' }, now, d)
    const walk = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    await completeQuest(walk, now, d)
    await savePlan(KEY, [{ questId: open, time: '10:00' }, { questId: walk, time: '07:00' }], now, d)

    await planDay(TOMORROW, [{ questId: missed, time: '09:00' }, { questId: open, time: '11:00' }, { questId: later, time: '14:00' }], evening, d)
    const copy = (await d.quests.get(missed))!.redoneAs!
    expect((await d.quests.get(copy))?.dueDate).toBe(TOMORROW)
    expect((await d.quests.get(open))?.dueDate).toBe(TOMORROW)
    expect((await d.quests.get(later))?.dueDate).toBe(TOMORROW)
    expect((await getPlan(TOMORROW, d))?.slots.map((s) => s.questId)).toEqual([copy, open, later])
    // Moved off today, so it leaves today's plan; the daily quest stays.
    expect((await getPlan(KEY, d))?.slots.map((s) => s.questId)).toEqual([walk])
    // Tomorrow morning it's simply today's plan, and the quests can be done.
    const morning = new Date(2026, 10, 5, 8)
    expect(await completeQuest(open, morning, d)).toBe(true)
    expect(await completeQuest(copy, morning, d)).toBe(true)
  })

  it('a plan made the night before asks for a review in the morning, until "Looks good" or any change', async () => {
    const d = freshDb()
    const evening = new Date(2026, 10, 3, 21)
    const later = new Date(2026, 10, 4, 9)
    const walk = await createQuest({ category: 'dq', title: 'Walk' }, earlier, d)
    const read = await createQuest({ category: 'dq', title: 'Read' }, earlier, d)
    await planDay(KEY, [{ questId: walk, time: '07:00' }], evening, d)
    expect(needsReview(await getPlan(KEY, d), KEY)).toBe(true)
    await reviewPlan(KEY, now, d)
    expect(needsReview(await getPlan(KEY, d), KEY)).toBe(false)
    expect((await getPlan(KEY, d))?.slots).toEqual([{ questId: walk, time: '07:00' }]) // reviewing changes nothing

    // Editing in the morning counts as reviewing it.
    const OTHER = '2026-11-05'
    await planDay(OTHER, [{ questId: walk, time: '07:00' }], later, d)
    const morning = new Date(2026, 10, 5, 7)
    expect(needsReview(await getPlan(OTHER, d), OTHER)).toBe(true)
    await retimeSlot(OTHER, `q:${walk}`, '08:00', morning, d)
    expect(needsReview(await getPlan(OTHER, d), OTHER)).toBe(false)
    await planDay(OTHER, [{ questId: read, time: '09:00' }], morning, d)
    expect(needsReview(await getPlan(OTHER, d), OTHER)).toBe(false)
  })

  it('a plan made the same morning needs no review', async () => {
    const d = freshDb()
    const walk = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    await planDay(KEY, [{ questId: walk, time: '09:00' }], now, d)
    expect(needsReview(await getPlan(KEY, d), KEY)).toBe(false)
  })

  it('plans only today or tomorrow', async () => {
    const d = freshDb()
    const q = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
    await expect(planDay('2026-11-06', [{ questId: q, time: '09:00' }], now, d)).rejects.toThrow()
    await expect(planDay('2026-11-03', [{ questId: q, time: '09:00' }], now, d)).rejects.toThrow()
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

  describe('the promise', () => {
    it('saving promises what is on the plan; moving a time keeps the promise', async () => {
      const d = freshDb()
      const a = await createQuest({ category: 'dq', title: 'Walk' }, now, d)
      const t = await createTask({ title: 'Call the bank' }, now, d)
      await savePlan(KEY, [{ questId: a, time: '09:00' }, { taskId: t, time: '10:00' }], now, d)
      const plan = await getPlan(KEY, d)
      expect(plan?.promisedAt).toBe(now.toISOString())
      expect(plan?.promise).toEqual([
        { key: `q:${a}`, title: 'Walk' },
        { key: `t:${t}`, title: 'Call the bank' },
      ])
      await retimeSlot(KEY, `q:${a}`, '11:00', now, d)
      expect((await getPlan(KEY, d))?.promise?.every((p) => !p.brokenAt)).toBe(true)
    })

    it('taking a promised thing out breaks it, whichever way it leaves', async () => {
      const d = freshDb()
      const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((title) => createQuest({ category: 'dq', title }, now, d)))
      await savePlan(KEY, [{ questId: a, time: '09:00' }, { questId: b, time: '10:00' }, { questId: c, time: '11:00' }], now, d)
      const later = new Date(2026, 10, 4, 12)
      await unplanSlot(KEY, `q:${a}`, later, d)
      await savePlan(KEY, [{ questId: c, time: '11:00' }], later, d) // b left out
      const promise = (await getPlan(KEY, d))?.promise
      expect(promise?.find((p) => p.key === `q:${a}`)?.brokenAt).toBe(later.toISOString())
      expect(promise?.find((p) => p.key === `q:${b}`)?.brokenAt).toBe(later.toISOString())
      expect(promise?.find((p) => p.key === `q:${c}`)?.brokenAt).toBeUndefined()
      // Promising it again takes it back
      await savePlan(KEY, [{ questId: a, time: '13:00' }, { questId: c, time: '11:00' }], later, d)
      expect((await getPlan(KEY, d))?.promise?.find((p) => p.key === `q:${a}`)?.brokenAt).toBeUndefined()
    })

    it('moving a quest promised today onto tomorrow breaks today’s promise', async () => {
      const d = freshDb()
      const report = await createQuest({ category: 'mq', title: 'Report', dueDate: KEY }, now, d)
      await planDay(KEY, [{ questId: report, time: '09:00' }], now, d)
      const evening = new Date(2026, 10, 4, 20)
      await planDay('2026-11-05', [{ questId: report, time: '09:00' }], evening, d)
      expect((await getPlan(KEY, d))?.promise?.[0].brokenAt).toBe(evening.toISOString())
      expect((await getPlan('2026-11-05', d))?.promise?.[0]).toEqual({ key: `q:${report}`, title: 'Report' })
    })

    it('an empty plan promises nothing', async () => {
      const d = freshDb()
      await savePlan(KEY, [], now, d)
      const plan = await getPlan(KEY, d)
      expect(plan?.promise).toBeUndefined()
      expect(plan?.promisedAt).toBeUndefined()
    })

    it('kept = finished that day; anything else is broken once the day is over', async () => {
      const d = freshDb()
      const [a, b] = await Promise.all(['A', 'B'].map((title) => createQuest({ category: 'dq', title }, now, d)))
      const t = await createTask({ title: 'Call the bank' }, now, d)
      await savePlan(KEY, [{ questId: a, time: '09:00' }, { questId: b, time: '10:00' }, { taskId: t, time: '11:00' }], now, d)
      await completeQuest(a, now, d)
      await toggleTask(t, now, d)
      const plan = (await getPlan(KEY, d))!
      const kept = await keptKeys(KEY, plan.promise!, d)
      expect(promiseLines(plan.promise, kept, false).map((l) => l.state)).toEqual(['kept', 'open', 'kept'])
      expect(promiseLines(plan.promise, kept, true).map((l) => l.state)).toEqual(['kept', 'broken', 'kept'])
      // Done the next day is too late for this day's promise
      await completeQuest(b, new Date(2026, 10, 5, 9), d)
      expect((await keptKeys(KEY, plan.promise!, d)).has(`q:${b}`)).toBe(false)
    })
  })
})
