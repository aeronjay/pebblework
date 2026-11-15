// A calendar file with two repeating daily events (morning and evening), each with an alarm. A local-first app has no
// server to push notifications from, so reminders it sends itself only work while it's open. The phone's or computer's
// own calendar has no such limit: import this once and it reminds every day, app open or not.
import type { ReminderSettings } from '../../db/types'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Text values escape backslash, semicolon, comma and newlines (RFC 5545 §3.3.11).
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

function stampUtc(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// Floating local time (no zone): "8:00" stays 8:00 wherever the device is.
function localStart(d: Date, time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(h)}${pad(m)}00`
}

interface DailyEvent {
  uid: string
  time: string
  summary: string
  description: string
}

// Stable UIDs: importing a newer file updates the two events instead of adding two more.
export function buildRemindersIcs(settings: Pick<ReminderSettings, 'morning' | 'evening'>, appUrl: string, now: Date = new Date()): string {
  const events: DailyEvent[] = [
    { uid: 'morning@pebblework', time: settings.morning, summary: 'Pebblework: what’s today for?', description: `Open Pebblework and start the first thing. ${appUrl}` },
    { uid: 'evening@pebblework', time: settings.evening, summary: 'Pebblework: close today, plan tomorrow', description: `Tick off what you did and pick 1–3 things for tomorrow. ${appUrl}` },
  ]
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pebblework//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stampUtc(now)}`,
      `DTSTART:${localStart(now, e.time)}`,
      'DURATION:PT5M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${esc(e.summary)}`,
      `DESCRIPTION:${esc(e.description)}`,
      `URL:${appUrl}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.summary)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export interface PlanEvent {
  key: string // the plan slot's key
  time: string // "HH:mm"
  title: string
  ifThen?: string
}

// One day's plan as calendar events, each with an alarm at its start time: the way to be rung when Pebblework is
// closed. One UID per day and slot, so exporting again after a change moves the event instead of doubling it.
export function buildPlanIcs(dayKey: string, events: PlanEvent[], appUrl: string, now: Date = new Date()): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const day = new Date(y, m - 1, d)
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pebblework//Plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:plan-${dayKey}-${e.key.replace(/[^A-Za-z0-9-]/g, '-')}@pebblework`,
      `DTSTAMP:${stampUtc(now)}`,
      `DTSTART:${localStart(day, e.time)}`,
      'DURATION:PT25M',
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(`${e.ifThen ? `If it slips, I’ll ${e.ifThen}\n` : ''}Planned in Pebblework. ${appUrl}`)}`,
      `URL:${appUrl}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

function save(text: string, name: string): void {
  const blob = new Blob([text], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadPlanIcs(dayKey: string, events: PlanEvent[]): void {
  save(buildPlanIcs(dayKey, events, location.origin + location.pathname), `pebblework-plan-${dayKey}.ics`)
}

export function downloadRemindersIcs(settings: Pick<ReminderSettings, 'morning' | 'evening'>): void {
  save(buildRemindersIcs(settings, location.origin + location.pathname), 'pebblework-reminders.ics')
}
