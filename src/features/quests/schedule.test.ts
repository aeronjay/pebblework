import { describe, expect, it } from 'vitest'
import type { Quest } from '../../db/types'
import { freshDb } from '../../test/db'
import { bestStreak, currentStreak } from '../insights/model'
import { describeQuest, scheduleLabel } from './components/describe'
import { canComplete, daySummary, dayStatus, isAssigned, isRestDay, jarCapacityFor, nextScheduledDay, questWhen } from './day'
import type { QuestItem } from './hooks'
import { completeQuest, createQuest, updateQuest } from './repo'

// Nov 1 2026 is a Sunday, so Nov 2 = Mon, Nov 4 = Wed, Nov 6 = Fri, Nov 10 = Tue.
const at = (key: string) => new Date(`${key}T12:00:00`)
const TODAY = '2026-11-10'
const NOW = at(TODAY)
const MWF = [1, 3, 5]
const meta = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', deviceId: 't' }

function dq(p: Partial<Quest> = {}): Quest {
  return { id: 'd', category: 'dq', title: 'd', order: 0, startDate: '2026-11-01', ...meta, ...p }
}

describe('weekday schedules', () => {
  it('assigns a scheduled daily quest only on its weekdays', () => {
    const q = dq({ schedule: [{ from: '2026-11-01', days: MWF }] })
    expect(isAssigned(q, '2026-11-02')).toBe(true) // Mon
    expect(isAssigned(q, '2026-11-03')).toBe(false) // Tue
    expect(isAssigned(q, '2026-11-06')).toBe(true) // Fri
    expect(questWhen(q, [], NOW)).toBe('upcoming') // today is Tuesday
    expect(canComplete(q, [], NOW)).toBe(false)
    expect(nextScheduledDay(q, TODAY)).toBe('2026-11-11')
  })

  it('treats a rest day as empty, not pending or closed', () => {
    const q = dq({ schedule: [{ from: '2026-11-01', days: MWF }] })
    expect(dayStatus(TODAY, [q], [], false, NOW)).toBe('empty')
    expect(dayStatus('2026-11-03', [q], [], false, NOW)).toBe('empty')
    expect(dayStatus('2026-11-04', [q], [], false, NOW)).toBe('closed')
    expect(isRestDay([q], '2026-11-03')).toBe(true)
    expect(isRestDay([q], '2026-11-04')).toBe(false)
    expect(isRestDay([q], '2026-10-27')).toBe(false) // before it started
  })

  it('counts scheduled days toward jar capacity (every day still 14)', () => {
    const daily = Array.from({ length: 3 }, (_, i) => dq({ id: `e${i}` }))
    expect(jarCapacityFor(daily, NOW)).toBe(42)
    const mwf = Array.from({ length: 7 }, (_, i) => dq({ id: `m${i}`, schedule: [{ from: '2026-11-01', days: MWF }] }))
    expect(jarCapacityFor(mwf, NOW)).toBe(42) // 7 × 3 days × 2 weeks
  })

  it('labels schedules Monday first', () => {
    expect(scheduleLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
    expect(scheduleLabel([1, 2, 3, 4, 5])).toBe('Weekdays')
    expect(scheduleLabel([0, 6])).toBe('Weekends')
    expect(scheduleLabel([0, 1, 5])).toBe('Mon, Fri, Sun')
  })

  it('captions a rest day with the next scheduled day', () => {
    const q = dq({ schedule: [{ from: '2026-11-01', days: MWF }] })
    const item = { quest: q, when: 'upcoming' } as QuestItem
    expect(describeQuest(item, TODAY)).toBe('Rest day, back tomorrow')
  })
})

describe('changing a schedule', () => {
  it('never changes past days', async () => {
    const d = freshDb()
    const start = at('2026-11-02')
    const id = await createQuest({ category: 'dq', title: 'gym' }, start, d)
    await completeQuest(id, at('2026-11-03'), d)
    const before = await d.quests.get(id)
    const pastStatus = dayStatus('2026-11-04', [before!], [], false, NOW)
    const pastSummary = daySummary('2026-11-04', [before!], [], false, NOW)

    await updateQuest(id, { days: [6] }, NOW, d) // Saturdays only, from today
    const after = (await d.quests.get(id))!
    expect(after.schedule).toEqual([{ from: TODAY, days: [6] }])
    expect(dayStatus('2026-11-04', [after], [], false, NOW)).toBe(pastStatus)
    expect(daySummary('2026-11-04', [after], [], false, NOW)).toEqual(pastSummary)
    expect(isAssigned(after, '2026-11-09')).toBe(true) // yesterday (Mon) kept every-day
    expect(isAssigned(after, '2026-11-11')).toBe(false)
    expect(isAssigned(after, '2026-11-14')).toBe(true)
  })

  it('stores nothing for every day, replaces same-day edits, and keeps history when going back to every day', async () => {
    const d = freshDb()
    const id = await createQuest({ category: 'dq', title: 'read', days: [0, 1, 2, 3, 4, 5, 6] }, at('2026-11-02'), d)
    expect((await d.quests.get(id))!.schedule).toBeUndefined()

    await updateQuest(id, { days: MWF }, at('2026-11-03'), d)
    await updateQuest(id, { days: [1, 3] }, at('2026-11-03'), d) // same day: replaced, not appended
    expect((await d.quests.get(id))!.schedule).toEqual([{ from: '2026-11-03', days: [1, 3] }])

    await updateQuest(id, { days: [0, 1, 2, 3, 4, 5, 6] }, NOW, d)
    expect((await d.quests.get(id))!.schedule).toEqual([
      { from: '2026-11-03', days: [1, 3] },
      { from: TODAY, days: [0, 1, 2, 3, 4, 5, 6] },
    ])
  })

  it('starts a not-yet-started quest’s schedule on its start date, and refuses no days or non-daily quests', async () => {
    const d = freshDb()
    const id = await createQuest({ category: 'dq', title: 'x', startDate: '2026-11-20', days: MWF }, NOW, d)
    expect((await d.quests.get(id))!.schedule).toEqual([{ from: '2026-11-20', days: MWF }])
    await expect(updateQuest(id, { days: [] }, NOW, d)).rejects.toThrow('Pick at least one day.')
    const m = await createQuest({ category: 'mq', title: 'm' }, NOW, d)
    await expect(updateQuest(m, { days: MWF }, NOW, d)).rejects.toThrow('Only daily quests')
    await expect(createQuest({ category: 'sq', title: 's', days: MWF }, NOW, d)).rejects.toThrow('Only daily quests')
  })
})

describe('runs over rest days', () => {
  it('skips rest days instead of breaking on them', () => {
    const q = dq({ schedule: [{ from: '2026-11-01', days: MWF }] })
    const rest = (k: string) => isRestDay([q], k)
    const days = new Set(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09'])
    expect(currentStreak(days, NOW, rest)).toBe(4) // today (Tue) is a rest day and still open
    expect(currentStreak(days, NOW)).toBe(1) // without schedules: just yesterday
    expect(bestStreak(days, rest)).toBe(4)
    expect(bestStreak(new Set(['2026-11-02', '2026-11-06']), rest)).toBe(2) // Wed was missed: one miss doesn't break a run
    expect(bestStreak(new Set(['2026-11-02', '2026-11-09']), rest)).toBe(1) // Wed and Fri missed: two in a row do
  })
})
