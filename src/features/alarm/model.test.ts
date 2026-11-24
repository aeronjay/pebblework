import { describe, expect, it } from 'vitest'
import { alarmId, dueAlarm, msUntilNext, snoozeTime, type AlarmSlot } from './model'

const at = (h: number, m = 0, s = 0) => new Date(2026, 10, 4, h, m, s)
const slot = (key: string, time: string, extra: Partial<AlarmSlot> = {}): AlarmSlot => ({ key, time, title: key, done: false, ...extra })

const slots = [slot('q:report', '14:00', { questId: 'report' }), slot('q:walk', '09:00', { questId: 'walk' }), slot('t:call', '09:15')]
const none = new Set<string>()

describe('dueAlarm', () => {
  it('rings from the start time, for half an hour, and not before', () => {
    expect(dueAlarm(slots, at(8, 59), none)).toBeUndefined()
    expect(dueAlarm(slots, at(9), none)?.key).toBe('q:walk')
    expect(dueAlarm([slots[1]], at(9, 30), none)?.key).toBe('q:walk')
    expect(dueAlarm([slots[1]], at(9, 31), none)).toBeUndefined()
  })

  it('takes the earliest open slot, skipping done and answered ones', () => {
    expect(dueAlarm(slots, at(9, 20), none)?.key).toBe('q:walk')
    expect(dueAlarm(slots, at(9, 20), new Set([alarmId(slots[1])]))?.key).toBe('t:call')
    expect(dueAlarm([{ ...slots[1], done: true }, slots[2]], at(9, 20), none)?.key).toBe('t:call')
  })

  it('stays quiet for what a focus session is already on', () => {
    expect(dueAlarm(slots, at(9), none, 'walk')).toBeUndefined()
    expect(dueAlarm(slots, at(9), none, 'report')?.key).toBe('q:walk')
  })

  it('rings again when a slot moves to a new time', () => {
    const answered = new Set([alarmId(slots[1])])
    const moved = { ...slots[1], time: '09:10' }
    expect(dueAlarm([moved], at(9, 5), answered)).toBeUndefined()
    expect(dueAlarm([moved], at(9, 10), answered)?.time).toBe('09:10')
  })
})

describe('timing', () => {
  it('waits exactly until the next open start time', () => {
    expect(msUntilNext(slots, at(8, 59, 30))).toBe(30_000)
    expect(msUntilNext(slots, at(9, 0))).toBe(15 * 60_000)
    expect(msUntilNext(slots.map((s) => ({ ...s, done: s.key !== 'q:report' })), at(9))).toBe(5 * 3_600_000)
    expect(msUntilNext(slots, at(15))).toBeUndefined()
  })

  it('snoozes ten minutes, but not past midnight', () => {
    expect(snoozeTime(at(9, 3))).toBe('09:13')
    expect(snoozeTime(at(23, 49))).toBe('23:59')
    expect(snoozeTime(at(23, 55))).toBeUndefined()
  })
})
