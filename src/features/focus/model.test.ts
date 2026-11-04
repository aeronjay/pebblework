import { describe, expect, it } from 'vitest'
import type { FocusSession } from '../../db/types'
import { breakMinutes, focusStats, formatClock, formatMinutes, weekLine } from './model'

const today = new Date(2026, 10, 4, 15, 0) // Wed Nov 4

function session(dayKey: string, minutes: number, extra: Partial<FocusSession> = {}): FocusSession {
  return {
    id: `${dayKey}-${minutes}-${Math.random()}`,
    dayKey,
    task: 'x',
    plannedMin: 25,
    startedAt: `${dayKey}T09:00:00.000Z`,
    endedAt: `${dayKey}T10:00:00.000Z`,
    focusMs: minutes * 60_000,
    parked: [],
    awayCount: 0,
    createdAt: '',
    updatedAt: '',
    deviceId: 'd',
    ...extra,
  }
}

describe('focus model', () => {
  it('formats clocks and minutes', () => {
    expect(formatClock(25 * 60_000)).toBe('25:00')
    expect(formatClock(65_400)).toBe('01:05')
    expect(formatClock(3_909_000)).toBe('1:05:09')
    expect(formatClock(-5)).toBe('00:00')
    expect(formatMinutes(0)).toBe('0m')
    expect(formatMinutes(25.4)).toBe('25m')
    expect(formatMinutes(65)).toBe('1h 05m')
  })

  it('sizes breaks to the work', () => {
    expect(breakMinutes(5 * 60_000)).toBe(3)
    expect(breakMinutes(25 * 60_000)).toBe(5)
    expect(breakMinutes(50 * 60_000)).toBe(10)
    expect(breakMinutes(5 * 60 * 60_000)).toBe(30)
  })

  it('sums the last 7 days against the 7 before, and averages ratings', () => {
    const stats = focusStats(
      [
        session('2026-11-04', 25, { rating: 4, parked: ['a', 'b'], awayCount: 1 }),
        session('2026-11-04', 20, { rating: 2 }),
        session('2026-10-29', 30), // 6 days ago: this week
        session('2026-10-28', 40, { rating: 5 }), // 7 days ago: last week
        session('2026-10-21', 99), // too old
        session('2026-11-03', 50, { deletedAt: 'x' }),
        session('2026-11-03', 50, { endedAt: undefined }), // still open
      ],
      today,
    )
    expect(stats.todayMin).toBe(45)
    expect(stats.weekMin).toBe(75)
    expect(stats.prevWeekMin).toBe(40)
    expect(stats.weekSessions).toBe(3)
    expect(stats.days.map((d) => d.key)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])
    expect(stats.days[0].minutes).toBe(30)
    expect(stats.avgRating).toBe(3)
    expect(stats.rated).toBe(2)
    expect(stats.prevAvgRating).toBe(5)
    expect(stats.parked).toBe(2)
    expect(stats.away).toBe(1)
  })

  it('compares weeks without scolding', () => {
    expect(weekLine({ weekMin: 60, prevWeekMin: 0, weekSessions: 1 })).toBe('1 session in the last 7 days.')
    expect(weekLine({ weekMin: 60, prevWeekMin: 58, weekSessions: 3 })).toBe('3 sessions, about the same as the week before.')
    expect(weekLine({ weekMin: 120, prevWeekMin: 60, weekSessions: 4 })).toBe('4 sessions, 1h 00m more than the week before.')
    expect(weekLine({ weekMin: 30, prevWeekMin: 90, weekSessions: 1 })).toBe('1 session. The week before had 1h 30m.')
  })
})
