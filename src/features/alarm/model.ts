// Plan alarm: pure rules. A plan says "at 9:00 I'll …"; that only works if 9:00 gets noticed, and a time (unlike
// "after breakfast") is a cue nobody notices by themselves. The alarm is the cue. Two rules keep it from turning into
// one more thing to swipe away: it always offers a way to start right now, and putting it off means moving the plan
// to a real new time (which rings again), never just silencing it.
import { minutesOf, timeOf } from '../plan/model'

export const ALARM_WINDOW_MIN = 30 // opening the app this long after a start time still raises its alarm
export const SNOOZE_MIN = 10
export const RINGS = 3 // chimes per alarm, then it stays on screen quietly
export const RING_EVERY_MS = 4000

export interface AlarmSlot {
  key: string // the plan slot's key ("q:<id>" / "t:<id>")
  time: string // "HH:mm"
  title: string
  ifThen?: string
  done: boolean
  questId?: string
}

export function alarmId(s: Pick<AlarmSlot, 'key' | 'time'>): string {
  return `${s.key}@${s.time}`
}

function minuteOf(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

// The alarm to show now: the earliest open slot whose time has come (and not long gone) and that hasn't been answered.
// `busyWith` = the quest a focus session is already running on: no alarm for what's being done.
export function dueAlarm(slots: AlarmSlot[], now: Date, answered: ReadonlySet<string>, busyWith?: string): AlarmSlot | undefined {
  const minute = minuteOf(now)
  return [...slots]
    .sort((a, b) => a.time.localeCompare(b.time))
    .find((s) => {
      const late = minute - minutesOf(s.time)
      return !s.done && late >= 0 && late <= ALARM_WINDOW_MIN && !answered.has(alarmId(s)) && !(busyWith && s.questId === busyWith)
    })
}

// Milliseconds until the next slot's start time (so the alarm rings on the minute, not on the next periodic tick).
export function msUntilNext(slots: AlarmSlot[], now: Date): number | undefined {
  const at = now.getHours() * 3_600_000 + now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds()
  const waits = slots.filter((s) => !s.done).map((s) => minutesOf(s.time) * 60_000 - at).filter((ms) => ms > 0)
  return waits.length ? Math.min(...waits) : undefined
}

// "In 10 min": the slot's new time. undefined when that would run past midnight (the day's plan ends there).
export function snoozeTime(now: Date): string | undefined {
  const next = minuteOf(now) + SNOOZE_MIN
  return next > 23 * 60 + 59 ? undefined : timeOf(next)
}
