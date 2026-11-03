import { describe, expect, it } from 'vitest'
import type { QuestCompletion } from '../../db/types'
import { freshDb } from '../../test/db'
import { getReview, isBlankReview, listReviews, saveReview, shiftWeek, weekLabel, weekStartKey, weekSummary } from './repo'

const t = (min: number) => new Date(2026, 10, 4, 12, min)

describe('weeks', () => {
  it('start on Monday', () => {
    expect(weekStartKey(new Date(2026, 10, 3))).toBe('2026-11-02') // Tuesday
    expect(weekStartKey(new Date(2026, 10, 8))).toBe('2026-11-02') // Sunday
    expect(weekStartKey(new Date(2026, 10, 9))).toBe('2026-11-09')
    expect(shiftWeek('2026-11-02', -1)).toBe('2026-10-26')
    expect(shiftWeek('2026-11-02', 1)).toBe('2026-11-09')
  })

  it('labels', () => {
    const now = new Date(2026, 10, 3)
    expect(weekLabel('2026-11-02', now)).toBe('Nov 2 – 8')
    expect(weekLabel('2026-10-26', now)).toBe('Oct 26 – Nov 1')
    expect(weekLabel('2026-12-28', now)).toBe('Dec 28, 2026 – Jan 3, 2027')
    expect(weekLabel('2025-11-03', now)).toBe('Nov 3 – 9, 2025')
  })
})

describe('review repo', () => {
  it('does not create a row for blank edits', async () => {
    const d = freshDb()
    expect(await saveReview('2026-11-02', { wentWell: '  ' }, t(0), d)).toBe(false)
    expect(await d.weeklyReviews.count()).toBe(0)
  })

  it('creates on first text, keyed by week, and no-ops when unchanged', async () => {
    const d = freshDb()
    expect(await saveReview('2026-11-02', { wentWell: 'Ran 3x' }, t(0), d)).toBe(true)
    expect(await getReview('2026-11-02', d)).toMatchObject({ id: '2026-11-02', weekStart: '2026-11-02', wentWell: 'Ran 3x' })
    expect(await saveReview('2026-11-02', { wentWell: 'Ran 3x' }, t(1), d)).toBe(false)
    expect((await getReview('2026-11-02', d))?.updatedAt).toBe(t(0).toISOString())

    expect(await saveReview('2026-11-02', { tweak: 'Lay out shoes', wentWell: '' }, t(2), d)).toBe(true)
    const r = await getReview('2026-11-02', d)
    expect(r?.wentWell).toBeUndefined()
    expect(r).toMatchObject({ tweak: 'Lay out shoes', updatedAt: t(2).toISOString() })
  })

  it('lists non-blank reviews newest first', async () => {
    const d = freshDb()
    await saveReview('2026-10-26', { tweak: 'a' }, t(0), d)
    await saveReview('2026-11-02', { inTheWay: 'b' }, t(1), d)
    await saveReview('2026-10-19', { wentWell: 'c' }, t(2), d)
    await saveReview('2026-10-19', { wentWell: '' }, t(3), d)
    expect((await listReviews(d)).map((r) => r.weekStart)).toEqual(['2026-11-02', '2026-10-26'])
    expect(isBlankReview(await d.weeklyReviews.get('2026-10-19'))).toBe(true)
  })
})

describe('weekSummary', () => {
  const c = (dayKey: string, category: QuestCompletion['category'], extra: Partial<QuestCompletion> = {}): QuestCompletion => ({
    id: `${dayKey}:${category}:${Math.random()}`,
    questId: 'q',
    category,
    dayKey,
    completedAt: '',
    createdAt: '',
    updatedAt: '',
    deviceId: 'd',
    ...extra,
  })

  it('counts the week only, by day and category', () => {
    const s = weekSummary('2026-11-02', [
      c('2026-11-01', 'dq'),
      c('2026-11-02', 'dq'),
      c('2026-11-02', 'mq'),
      c('2026-11-08', 'sq'),
      c('2026-11-05', 'sq', { deletedAt: 'x' }),
      c('2026-11-09', 'dq'),
    ])
    expect(s.finished).toBe(3)
    expect(s.activeDays).toBe(2)
    expect(s.byCategory).toEqual({ dq: 1, mq: 1, sq: 1 })
    expect(s.days.map((d) => d.count)).toEqual([2, 0, 0, 0, 0, 0, 1])
  })
})
