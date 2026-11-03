import { describe, expect, it } from 'vitest'
import type { QuestCategory, QuestCompletion } from '../../db/types'
import { bestStreak, bestWeekday, computeInsights, currentStreak, streakLine, topCategory, weekdayAverages, weeklyCounts } from './model'

let n = 0
const c = (dayKey: string, category: QuestCategory = 'dq', extra: Partial<QuestCompletion> = {}): QuestCompletion => ({
  id: `c${n++}`,
  questId: 'q',
  category,
  dayKey,
  completedAt: '',
  createdAt: '',
  updatedAt: '',
  deviceId: 'd',
  ...extra,
})

const now = new Date(2026, 10, 4, 15) // Wednesday, Nov 4 2026

describe('streaks', () => {
  it('today does not break a streak until it is over', () => {
    const days = new Set(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(currentStreak(days, now)).toBe(3)
    expect(currentStreak(new Set([...days, '2026-11-04']), now)).toBe(4)
    expect(currentStreak(new Set(['2026-11-01', '2026-11-02']), now)).toBe(0)
    expect(currentStreak(new Set(), now)).toBe(0)
  })

  it('best streak', () => {
    expect(bestStreak(new Set(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']))).toBe(3)
    expect(bestStreak(new Set(['2026-12-31', '2027-01-01']))).toBe(2)
    expect(bestStreak(new Set())).toBe(0)
  })

  it('kind lines', () => {
    expect(streakLine(0, 0, false)).toMatch(/first run/)
    expect(streakLine(0, 5, false)).toBe('Your best run is 5 days. One quest today starts a new one.')
    expect(streakLine(3, 5, false)).toBe('3 days in a row so far. Today can make it 4.')
    expect(streakLine(6, 6, true)).toBe('6 days in a row, your longest run yet.')
    expect(streakLine(1, 4, true)).toBe('1 day in a row. Nice and steady.')
  })
})

describe('weekdays', () => {
  it('averages per occurrence, from the first completion, Monday first', () => {
    // First completion Mon Oct 26: window Oct 26..Nov 4 has 2 Mondays, 2 Tuesdays, 2 Wednesdays, 1 of the rest.
    const stats = weekdayAverages([c('2026-10-26'), c('2026-10-26'), c('2026-11-02'), c('2026-10-31'), c('2026-11-05')], now)
    expect(stats.map((s) => s.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(stats[0]).toEqual({ weekday: 1, total: 3, average: 1.5 })
    expect(stats[5]).toEqual({ weekday: 6, total: 1, average: 1 })
    expect(bestWeekday(stats)?.weekday).toBe(1)
    expect(bestWeekday(weekdayAverages([], now))).toBeUndefined()
  })
})

describe('categories and weeks', () => {
  it('top category counts completions, ties keep daily-main-side order', () => {
    expect(topCategory({ dq: 2, mq: 3, sq: 3 })).toBe('mq')
    expect(topCategory({ dq: 0, mq: 0, sq: 0 })).toBeUndefined()
  })

  it('weekly counts, oldest first, current week last', () => {
    const w = weeklyCounts([c('2026-11-02'), c('2026-11-04'), c('2026-10-25'), c('2026-08-01'), c('2026-11-06')], now, 3)
    expect(w).toEqual([
      { weekStart: '2026-10-19', count: 1 },
      { weekStart: '2026-10-26', count: 0 },
      { weekStart: '2026-11-02', count: 2 },
    ])
  })

  it('computes everything, ignoring deleted and future completions', () => {
    const i = computeInsights([c('2026-11-03', 'mq'), c('2026-11-04', 'sq'), c('2026-11-04', 'sq', { deletedAt: 'x' }), c('2026-11-09')], now)
    expect(i).toMatchObject({ total: 2, activeDays: 2, currentStreak: 2, bestStreak: 2, topCategory: 'mq' })
    expect(i.categories).toEqual({ dq: 0, mq: 1, sq: 1 })
  })
})
