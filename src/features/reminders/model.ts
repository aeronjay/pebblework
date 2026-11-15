// Reminders: pure rules for what's worth a notification right now.
// Three kinds, at most a handful a day: the morning look at today, each planned start time ("at 9:00 I'll …" only
// works if 9:00 gets noticed), and one evening nudge. Nothing fires late: a reminder whose moment passed while the
// app was closed is dropped, not delivered in a pile on the next open.
import type { ReminderSettings } from '../../db/types'
import { formatTime, isValidTime, minutesOf } from '../plan/model'

export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, morning: '08:00', evening: '20:00' }

export const DAILY_GRACE_MIN = 90 // morning and evening reminders still fire this long after their time
export const SLOT_GRACE_MIN = 20 // a planned start time, this long

export interface ReminderSlot {
  key: string // the plan slot's key
  time: string // "HH:mm"
  title: string
  ifThen?: string
  done: boolean
}

export interface ReminderInput {
  now: Date
  todayKey: string
  settings: ReminderSettings
  slots: ReminderSlot[]
  open: string[] // titles of what today still asks for
  tomorrowPlanned: boolean
  fired: ReadonlySet<string> // ids already shown
}

export interface Reminder {
  id: string // stable per day and kind, so each fires once
  title: string
  body: string
}

export function cleanReminders(s: Partial<ReminderSettings> | undefined): ReminderSettings {
  return {
    enabled: !!s?.enabled,
    morning: s?.morning && isValidTime(s.morning) ? s.morning : DEFAULT_REMINDERS.morning,
    evening: s?.evening && isValidTime(s.evening) ? s.evening : DEFAULT_REMINDERS.evening,
  }
}

function within(now: Date, time: string, grace: number): boolean {
  const late = now.getHours() * 60 + now.getMinutes() - minutesOf(time)
  return late >= 0 && late <= grace
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export function dueReminders({ now, todayKey, settings, slots, open, tomorrowPlanned, fired }: ReminderInput): Reminder[] {
  if (!settings.enabled) return []
  const out: Reminder[] = []

  for (const s of slots) {
    if (s.done || !within(now, s.time, SLOT_GRACE_MIN)) continue
    out.push({
      id: `${todayKey}:slot:${s.key}:${s.time}`,
      title: `${formatTime(s.time)}: ${s.title}`,
      body: s.ifThen ? `You planned this for now. If it slips, you’ll ${s.ifThen}` : 'You planned this for now. Five minutes is enough to start.',
    })
  }

  if (within(now, settings.morning, DAILY_GRACE_MIN) && open.length) {
    out.push({
      id: `${todayKey}:morning`,
      title: `Today asks for ${count(open.length, 'quest')}`,
      body: open.slice(0, 3).join(' · ') + (open.length > 3 ? ` · +${open.length - 3} more` : ''),
    })
  }

  if (within(now, settings.evening, DAILY_GRACE_MIN)) {
    if (open.length) {
      out.push({ id: `${todayKey}:evening`, title: `${count(open.length, 'quest')} still open today`, body: `There’s time for one: ${open[0]}` })
    } else if (!tomorrowPlanned) {
      out.push({ id: `${todayKey}:evening`, title: 'Set up tomorrow tonight', body: 'Pick 1–3 things and when you’ll start each. Two minutes.' })
    }
  }

  return out.filter((r) => !fired.has(r.id))
}
