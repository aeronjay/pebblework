// Day plan: pure rules. A plan gives a few quests a start time ("implementation intentions"), not every hour of the
// day: detailed hour-by-hour plans tend to break by mid-morning, and a broken plan is easy to abandon wholesale.
// Plans are made the evening before (tomorrow's plan is something to look forward to) or, failing that, in the morning.
import { getDay } from 'date-fns'
import type { DayPlan, PlanSlot, Task } from '../../db/types'
import { addDaysToKey, isAssigned, isoToDayKey, parseDayKey } from '../quests/day'
import type { QuestItem } from '../quests/hooks'
import { isDueToday } from '../quests/components/lists'

export const MAX_PLAN_SLOTS = 3
export const IF_THEN_MAX = 120
export const RETURN_AFTER_DAYS = 3 // this many days or more without a finished quest makes today a fresh start
export const EVENING_HOUR = 18 // from this hour on, Home asks about tomorrow instead of today

export type PlanDay = 'today' | 'tomorrow'

export function isEvening(now: Date): boolean {
  return now.getHours() >= EVENING_HOUR
}

// The day a plan is for, by key.
export function planDayKey(todayKey: string, day: PlanDay): string {
  return day === 'today' ? todayKey : addDaysToKey(todayKey, 1)
}

// The clock to suggest times from: now for today, early morning for tomorrow (so suggestions start at 9:00).
export function planClock(now: Date, day: PlanDay): Date {
  if (day === 'today') return now
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 30)
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(t: string): boolean {
  return TIME.test(t)
}

export function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function timeOf(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function nowTime(now: Date): string {
  return timeOf(now.getHours() * 60 + now.getMinutes())
}

// "9:00", "14:30" → "9:00 AM" style is left to the browser's locale.
export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// A slot's identity across quests and loose ends ("q:<id>" / "t:<id>").
export function slotKey(s: Pick<PlanSlot, 'questId' | 'taskId'>): string {
  return s.questId ? `q:${s.questId}` : `t:${s.taskId}`
}

export function sortSlots<T extends PlanSlot>(slots: T[]): T[] {
  return [...slots].sort((a, b) => a.time.localeCompare(b.time) || slotKey(a).localeCompare(slotKey(b)))
}

// Loose ends worth a time: every open one, dated first (late ones first of all).
export function taskCandidates(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !t.completedAt && !t.deletedAt)
    .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'))
}

// How a quest gets into a day's plan. Items are always computed for today; `ahead` is tomorrow's day key when the plan
// is for tomorrow (undefined: today's plan).
// - ready: can be done that day as it is (due that day, undated, or a daily quest running that day)
// - project: an open project; the slot is a work session on its board
// - moved: a main or side quest due on another day (later, or, planning ahead, today but still open); planning it
//   moves its due date to the plan's day
// - redo: a missed main or side quest; planning it runs "Do it today" (dated for the plan's day) and plans the copy
export type PlanKind = 'ready' | 'project' | 'moved' | 'redo'

export function planKind(i: QuestItem, ahead?: string): PlanKind | undefined {
  const q = i.quest
  if (q.category !== 'dq' && q.isProject) return q.projectDoneAt ? undefined : 'project'
  if (i.missed) return q.redoneAs ? undefined : 'redo'
  if (ahead) {
    if (q.category === 'dq') return isAssigned(q, ahead) ? 'ready' : undefined // done today or not, it runs again
    if (i.done) return undefined
    return q.dueDate && q.dueDate !== ahead ? 'moved' : 'ready'
  }
  if (i.done) return undefined
  if (i.canComplete && (isDueToday(i) || i.when === 'anytime')) return 'ready'
  if (q.category !== 'dq' && i.when === 'upcoming') return 'moved'
  return undefined // a daily quest's rest day
}

// The plan sheet's sections, in order. `leftover` = still open today, only when planning ahead.
export type PlanGroup = 'due' | 'leftover' | 'redo' | 'anytime' | 'project' | 'moved'

const GROUP_ORDER: PlanGroup[] = ['due', 'leftover', 'redo', 'anytime', 'project', 'moved']

export function planGroups(day: PlanDay): { group: PlanGroup; label: string }[] {
  const label: Record<PlanGroup, string> = {
    due: day === 'today' ? 'Due today' : 'Due tomorrow',
    leftover: 'Still open today',
    redo: 'Missed',
    anytime: 'No date',
    project: 'Projects',
    moved: 'Due later',
  }
  return GROUP_ORDER.filter((g) => day === 'tomorrow' || g !== 'leftover').map((group) => ({ group, label: label[group] }))
}

export function planGroup(i: QuestItem, ahead?: string): PlanGroup | undefined {
  const kind = planKind(i, ahead)
  if (kind === 'ready') {
    if (!ahead) return isDueToday(i) ? 'due' : 'anytime'
    return i.quest.category === 'dq' || i.quest.dueDate ? 'due' : 'anytime'
  }
  if (kind === 'moved' && ahead && i.quest.dueDate! < ahead) return 'leftover' // not missed, so due today
  return kind
}

// What can go in a plan: anything open that could be worked on that day. Main quests first (they're the ones worth a
// time); within a list, in the sheet's group order, then by due date.
export function planCandidates(items: QuestItem[], ahead?: string): QuestItem[] {
  const rank = { mq: 0, sq: 1, dq: 2 } as const
  const group = (i: QuestItem) => GROUP_ORDER.indexOf(planGroup(i, ahead)!)
  return items
    .filter((i) => planKind(i, ahead))
    .sort((a, b) => rank[a.quest.category] - rank[b.quest.category] || group(a) - group(b) || (a.quest.dueDate ?? '').localeCompare(b.quest.dueDate ?? ''))
}

// A planned quest counts as handled once it's done, or (a project) once any of its board work was finished today.
export function isHandled(i: QuestItem): boolean {
  return i.done || !!i.workedToday
}

// A plan made the evening before that hasn't been looked over yet today: the morning shows it for a quick review.
export function needsReview(plan: DayPlan | undefined, todayKey: string): boolean {
  return !!plan && plan.dayKey === todayKey && !plan.skipped && !plan.reviewedAt && isoToDayKey(plan.createdAt) < plan.dayKey
}

// Slots whose quest or loose end still exists (a deleted one drops out quietly).
export function liveSlots(plan: DayPlan | undefined, items: QuestItem[], tasks: Task[] = []): PlanSlot[] {
  if (!plan) return []
  const quests = new Set(items.map((i) => i.quest.id))
  const live = new Set(tasks.filter((t) => !t.deletedAt).map((t) => t.id))
  return sortSlots(plan.slots.filter((s) => (s.questId ? quests.has(s.questId) : !!s.taskId && live.has(s.taskId))))
}

// The first planned quest or loose end not done yet: what to start next.
export function nextSlot(slots: PlanSlot[], items: QuestItem[], tasks: Task[] = []): PlanSlot | undefined {
  const done = new Set([...items.filter(isHandled).map((i) => `q:${i.quest.id}`), ...tasks.filter((t) => t.completedAt).map((t) => `t:${t.id}`)])
  return slots.find((s) => !done.has(slotKey(s)))
}

// Planned quests first, by time; the rest keep their order.
export function orderByPlan<T extends { quest: { id: string } }>(list: T[], slots: PlanSlot[]): T[] {
  const at = new Map(slots.flatMap((s, i) => (s.questId ? [[s.questId, i] as const] : [])))
  const planned = list.filter((i) => at.has(i.quest.id)).sort((a, b) => at.get(a.quest.id)! - at.get(b.quest.id)!)
  return [...planned, ...list.filter((i) => !at.has(i.quest.id))]
}

// A time to suggest for the next slot: the quest's own due time, else an hour after the previous slot, else the next
// half hour from now. Never earlier than now.
export function suggestTime(dueTime: string | undefined, previous: string | undefined, now: Date): string {
  const current = now.getHours() * 60 + now.getMinutes()
  const nextHalf = Math.ceil((current + 1) / 30) * 30
  if (dueTime && isValidTime(dueTime) && minutesOf(dueTime) >= current) return dueTime
  if (previous) return timeOf(Math.max(nextHalf, minutesOf(previous) + 60))
  return timeOf(nextHalf)
}

// One tap to push a slot back without fuss: an hour after its time or now, whichever is later, rounded up to the
// quarter hour (a plan says "5:15", not "5:03").
export function laterTime(time: string, now: Date): string {
  const current = now.getHours() * 60 + now.getMinutes()
  return timeOf(Math.ceil((Math.max(minutesOf(time), current) + 60) / 15) * 15)
}

export type FreshStart = 'return' | 'month' | 'week'

// Temporal landmarks (a new week, a new month, coming back after a break) are when people are most ready to start
// again (the "fresh-start effect"). `lastActive` = the latest day with a finished quest before today, if any.
export function freshStart(todayKey: string, lastActive: string | undefined): FreshStart | undefined {
  if (lastActive && lastActive <= addDaysToKey(todayKey, -RETURN_AFTER_DAYS)) return 'return'
  const d = parseDayKey(todayKey)
  if (d.getDate() === 1) return 'month'
  if (getDay(d) === 1) return 'week'
  return undefined
}

export const FRESH_START_LINE: Record<PlanDay, Record<FreshStart, string>> = {
  today: {
    return: 'Welcome back. Today is a clean slate.',
    month: 'A new month. A good day for a fresh start.',
    week: 'A new week. A good day for a fresh start.',
  },
  tomorrow: {
    return: 'Tomorrow is a clean slate.',
    month: 'Tomorrow starts a new month. A good day for a fresh start.',
    week: 'Tomorrow starts a new week. A good day for a fresh start.',
  },
}
