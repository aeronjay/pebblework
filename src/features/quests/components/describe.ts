import { differenceInCalendarDays, format, parse } from 'date-fns'
import type { Quest } from '../../../db/types'
import { isoToDayKey, isProject, parseDayKey } from '../day'
import type { QuestItem } from '../hooks'

export function formatTime(hhmm: string): string {
  try {
    return format(parse(hhmm, 'HH:mm', new Date()), 'h:mm a')
  } catch {
    return hhmm
  }
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

// The quiet meta line under a quest title.
export function describeQuest(item: QuestItem, todayKey: string): string {
  const q: Quest = item.quest
  const time = q.dueTime ? formatTime(q.dueTime) : undefined
  if (isProject(q)) return describeProject(q, todayKey)
  const parts: string[] = []
  switch (item.when) {
    case 'today':
      parts.push(q.category === 'dq' ? 'Every day' : 'Due today')
      break
    case 'upcoming':
      parts.push(q.category === 'dq' ? `Starts ${formatDay(q.startDate, todayKey)}` : `Due ${formatDay(q.dueDate!, todayKey)}`)
      break
    case 'anytime':
      parts.push(item.done ? 'Done today' : 'Anytime')
      break
    case 'missed':
      parts.push(q.redoneAs ? `Moved to today · was due ${formatDay(q.dueDate!, todayKey)}` : `Missed · was due ${formatDay(q.dueDate!, todayKey)}`)
      break
    case 'past':
      parts.push(q.dueDate ? `Done · ${formatDay(q.dueDate, todayKey)}` : 'Done earlier')
      break
  }
  if (time && item.when !== 'past' && item.when !== 'missed') parts.push(time)
  return parts.join(' · ')
}

// Projects never sit on a day: their deadline is display-only, and "done" means completeProject ran.
export function describeProject(q: Quest, todayKey: string): string {
  if (q.projectDoneAt) {
    const doneKey = isoToDayKey(q.projectDoneAt)
    return doneKey === todayKey ? 'Completed today' : `Completed ${formatDay(doneKey, todayKey)}`
  }
  if (!q.dueDate) return 'No deadline'
  if (q.dueDate < todayKey) return `Past deadline · ${formatDay(q.dueDate, todayKey)}`
  return `Deadline ${formatDay(q.dueDate, todayKey)}`
}
