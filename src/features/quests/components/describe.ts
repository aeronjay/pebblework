import { differenceInCalendarDays, format, parse } from 'date-fns'
import type { Quest } from '../../../db/types'
import { isEveryDay, isoToDayKey, isProject, nextScheduledDay, parseDayKey, scheduleOn } from '../day'
import type { QuestItem } from '../hooks'

export function formatTime(hhmm: string): string {
  try {
    return format(parse(hhmm, 'HH:mm', new Date()), 'h:mm a')
  } catch {
    return hhmm
  }
}

// formatDay for mid-sentence use: "due today", "due Friday", "was due Nov 1".
export function formatDayInline(key: string, todayKey: string): string {
  const d = formatDay(key, todayKey)
  return /^(Today|Tomorrow|Yesterday)$/.test(d) ? d.toLowerCase() : d
}

export function formatDay(key: string, todayKey: string): string {
  const d = parseDayKey(key)
  const diff = differenceInCalendarDays(d, parseDayKey(todayKey))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return format(d, 'EEEE')
  return format(d, d.getFullYear() === parseDayKey(todayKey).getFullYear() ? 'MMM d' : 'MMM d, yyyy')
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri" (Monday first).
export function scheduleLabel(days: number[]): string {
  const key = days.join()
  if (isEveryDay(days)) return 'Every day'
  if (key === '1,2,3,4,5') return 'Weekdays'
  if (key === '0,6') return 'Weekends'
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_SHORT[d]).join(', ')
}

// Why a daily quest isn't on today: it hasn't started, or today is a rest day.
export function dqRestLine(q: Quest, todayKey: string): string {
  if (q.startDate > todayKey) return `Starts ${formatDay(q.startDate, todayKey)}`
  const next = nextScheduledDay(q, todayKey)
  return next ? `Rest day, back ${formatDay(next, todayKey).replace(/^Tomorrow$/, 'tomorrow')}` : 'Rest day'
}

// The quiet meta line under a quest title.
export function describeQuest(item: QuestItem, todayKey: string): string {
  const q: Quest = item.quest
  const time = q.dueTime ? formatTime(q.dueTime) : undefined
  if (isProject(q)) return describeProject(q, todayKey)
  const parts: string[] = []
  switch (item.when) {
    case 'today':
      // A daily quest due today needs no caption (its section already says it's daily), unless it skips some days.
      if (q.category !== 'dq') parts.push('Due today')
      else if (!isEveryDay(scheduleOn(q, todayKey))) parts.push(scheduleLabel(scheduleOn(q, todayKey)))
      break
    case 'upcoming':
      parts.push(q.category === 'dq' ? dqRestLine(q, todayKey) : `Due ${formatDay(q.dueDate!, todayKey)}`)
      break
    case 'anytime':
      parts.push(item.done ? 'Done today' : 'Anytime')
      break
    case 'missed':
      parts.push(q.redoneAs ? `Moved to today, was due ${formatDay(q.dueDate!, todayKey)}` : `Missed, was due ${formatDay(q.dueDate!, todayKey)}`)
      break
    case 'past':
      parts.push(q.dueDate ? `Done ${formatDay(q.dueDate, todayKey)}` : 'Done earlier')
      break
  }
  if (time && item.when !== 'past' && item.when !== 'missed') parts.push(time)
  return parts.join(', ')
}

// Projects never sit on a day: their deadline is display-only, and "done" means completeProject ran.
export function describeProject(q: Quest, todayKey: string): string {
  if (q.projectDoneAt) {
    const doneKey = isoToDayKey(q.projectDoneAt)
    return doneKey === todayKey ? 'Completed today' : `Completed ${formatDay(doneKey, todayKey)}`
  }
  if (!q.dueDate) return 'No deadline'
  if (q.dueDate < todayKey) return `Deadline passed ${formatDay(q.dueDate, todayKey)}`
  return `Deadline ${formatDay(q.dueDate, todayKey)}`
}
