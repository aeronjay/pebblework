import { describe, expect, it } from 'vitest'
import { cleanReminders, dueReminders, type ReminderInput } from './model'

const todayKey = '2026-11-04'
const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m)

const input = (now: Date, extra: Partial<ReminderInput> = {}): ReminderInput => ({
  now,
  todayKey,
  settings: { enabled: true, morning: '08:00', evening: '20:00' },
  slots: [],
  open: ['walk', 'report'],
  tomorrowPlanned: false,
  fired: new Set(),
  ...extra,
})

const ids = (i: ReminderInput) => dueReminders(i).map((r) => r.id)

describe('dueReminders', () => {
  it('is silent when off', () => {
    expect(dueReminders(input(at(8), { settings: { enabled: false, morning: '08:00', evening: '20:00' } }))).toEqual([])
  })

  it('fires the morning one at its time and for a while after, never before or long after', () => {
    expect(ids(input(at(7, 59)))).toEqual([])
    expect(ids(input(at(8)))).toEqual([`${todayKey}:morning`])
    expect(ids(input(at(9, 30)))).toEqual([`${todayKey}:morning`])
    expect(ids(input(at(9, 31)))).toEqual([])
  })

  it('names what today asks for, and stays quiet on a day that asks for nothing', () => {
    const [r] = dueReminders(input(at(8), { open: ['a', 'b', 'c', 'd', 'e'] }))
    expect(r.title).toBe('Today asks for 5 quests')
    expect(r.body).toBe('a · b · c · +2 more')
    expect(ids(input(at(8), { open: [] }))).toEqual([])
  })

  it('fires each reminder once', () => {
    expect(ids(input(at(8, 10), { fired: new Set([`${todayKey}:morning`]) }))).toEqual([])
  })

  it('reminds at a planned start time, unless that slot is done', () => {
    const slots = [
      { key: 'q:report', time: '14:00', title: 'report', ifThen: 'do it after dinner', done: false },
      { key: 'q:walk', time: '14:05', title: 'walk', done: true },
    ]
    expect(ids(input(at(13, 59), { slots }))).toEqual([])
    const due = dueReminders(input(at(14, 10), { slots }))
    expect(due.map((r) => r.id)).toEqual([`${todayKey}:slot:q:report:14:00`])
    expect(due[0].body).toContain('do it after dinner')
    expect(ids(input(at(14, 21), { slots }))).toEqual([])
    // Moved to a new time, it reminds again.
    expect(ids(input(at(16), { slots: [{ ...slots[0], time: '16:00' }], fired: new Set([`${todayKey}:slot:q:report:14:00`]) }))).toEqual([`${todayKey}:slot:q:report:16:00`])
  })

  it('in the evening: what is still open, else planning tomorrow, else nothing', () => {
    expect(dueReminders(input(at(20)))[0].title).toBe('2 quests still open today')
    expect(dueReminders(input(at(20), { open: ['walk'] }))[0].title).toBe('1 quest still open today')
    expect(dueReminders(input(at(20), { open: [] }))[0].title).toBe('Set up tomorrow tonight')
    expect(ids(input(at(20), { open: [], tomorrowPlanned: true }))).toEqual([])
  })
})

describe('cleanReminders', () => {
  it('defaults to off with sane times, and repairs bad ones', () => {
    expect(cleanReminders(undefined)).toEqual({ enabled: false, morning: '08:00', evening: '20:00' })
    expect(cleanReminders({ enabled: true, morning: '7am', evening: '21:30' })).toEqual({ enabled: true, morning: '08:00', evening: '21:30' })
  })
})
