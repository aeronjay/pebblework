import { describe, expect, it } from 'vitest'
import { dayKey } from '../quests/day'
import { cellClass, cellDots, claimCopy, dayAriaLabel, monthSummary, navTarget, progressText, tintBackground, tintPercent, weekdayLabels, type CellDay } from './model'

const day = (over: Partial<CellDay> = {}): CellDay => ({
  key: '2026-11-04',
  date: new Date(2026, 10, 4),
  isToday: false,
  status: 'claimed',
  assigned: 5,
  done: 4,
  intensity: 3,
  categories: ['dq', 'mq'],
  ...over,
})

describe('calendar model', () => {
  it('starts weeks on Monday', () => {
    const w = weekdayLabels()
    expect(w[0].long).toBe('Monday')
    expect(w[6].long).toBe('Sunday')
  })

  it('describes progress per status', () => {
    expect(progressText(day())).toBe('4 of 5 done')
    expect(progressText(day({ status: 'future', assigned: 2 }))).toBe('2 scheduled')
    expect(progressText(day({ status: 'future', assigned: 0 }))).toBe('Nothing scheduled')
    expect(progressText(day({ status: 'empty' }))).toBe('Nothing scheduled')
  })

  it('builds a full aria label', () => {
    expect(dayAriaLabel(day({ isToday: true, status: 'ready', done: 5 }))).toBe('Wednesday, November 4, today. Ready to claim. 5 of 5 done. Daily, Main')
  })

  it('scales tint with intensity; quiet states stay untinted', () => {
    expect(tintPercent(0, 'claimed')).toBe(0)
    expect(tintPercent(1, 'claimed')).toBeLessThan(tintPercent(4, 'claimed'))
    expect(tintPercent(1, 'ready')).toBeGreaterThanOrEqual(20)
    expect(tintPercent(4, 'future')).toBe(0)
    expect(tintPercent(4, 'closed')).toBeLessThan(tintPercent(4, 'claimed'))
    expect(tintBackground(day({ status: 'empty', intensity: 0 }))).toBeUndefined()
  })

  it('blends category colors, and keeps closed days neutral', () => {
    expect(tintBackground(day())).toMatch(/^linear-gradient\(135deg, .*--color-dq.*--color-mq/)
    expect(tintBackground(day({ categories: ['sq'] }))).toBe('color-mix(in oklch, var(--color-sq) 34%, transparent)')
    expect(tintBackground(day({ status: 'closed' }))).toContain('--color-ink')
  })

  it('maps state to classes', () => {
    expect(cellClass(day({ status: 'ready' }), true)).toContain('qc-ready')
    expect(cellClass(day({ status: 'pending', isToday: true }), true)).toContain('qc-today')
    expect(cellClass(day(), false)).toContain('opacity-45')
    expect(cellClass(day({ status: 'ready' }), false)).toContain('opacity-80')
    expect(cellClass(day({ status: 'closed' }), true)).not.toMatch(/red/)
  })

  it('dots future days only for dated one-offs', () => {
    expect(cellDots(day({ status: 'future', categories: ['dq', 'sq'] }))).toEqual(['sq'])
    expect(cellDots(day({ status: 'future', categories: ['dq'] }))).toEqual([])
    expect(cellDots(day({ status: 'pending' }))).toEqual([])
    expect(cellDots(day())).toEqual(['dq', 'mq'])
  })

  it('writes claim copy', () => {
    expect(claimCopy(0, 0).label).toBe('Nothing to claim yet')
    expect(claimCopy(1, 2)).toMatchObject({ label: 'Claim 1 day', detail: '+2' })
    expect(claimCopy(3, 7).aria).toBe('Claim 3 days, adding 7 stone weight to the jar')
  })

  it('moves focus with keyboard keys', () => {
    const wed = new Date(2026, 10, 4)
    const k = (key: string) => {
      const t = navTarget(wed, key)
      return t && dayKey(t)
    }
    expect(k('ArrowLeft')).toBe('2026-11-03')
    expect(k('ArrowRight')).toBe('2026-11-05')
    expect(k('ArrowUp')).toBe('2026-10-28')
    expect(k('ArrowDown')).toBe('2026-11-11')
    expect(k('Home')).toBe('2026-11-02')
    expect(k('End')).toBe('2026-11-08')
    expect(k('PageUp')).toBe('2026-10-04')
    expect(k('PageDown')).toBe('2026-12-04')
    expect(k('a')).toBeNull()
  })

  it('summarizes the visible month only', () => {
    expect(
      monthSummary([
        { status: 'claimed', inMonth: true },
        { status: 'claimed', inMonth: false },
        { status: 'ready', inMonth: true },
        { status: 'closed', inMonth: true },
      ]),
    ).toBe('1 claimed · 1 ready')
    expect(monthSummary([])).toBe('')
  })
})
