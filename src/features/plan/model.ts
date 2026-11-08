// Morning plan: pure rules. A plan gives a few quests a start time ("implementation intentions"), not every hour of the
// day: detailed hour-by-hour plans tend to break by mid-morning, and a broken plan is easy to abandon wholesale.
import { getDay } from 'date-fns'
import type { DayPlan, PlanSlot, Task } from '../../db/types'
import { addDaysToKey, parseDayKey } from '../quests/day'
import type { QuestItem } from '../quests/hooks'
import { isDueToday } from '../quests/components/lists'

export const MAX_PLAN_SLOTS = 3
export const IF_THEN_MAX = 120
export const RETURN_AFTER_DAYS = 3 // this many days or more without a finished quest makes today a fresh start

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

// How a quest gets into today's plan.
// - today: due today (or undated) and can be checked off today as it is
// - project: an open project; the slot is a work session on its board
// - moved: a main or side quest due on a later day; planning it moves its due date to today
// - redo: a missed main or side quest; planning it runs "Do it today" and plans the copy
export type PlanKind = 'today' | 'project' | 'moved' | 'redo'

export function planKind(i: QuestItem): PlanKind | undefined {
  const q = i.quest
  if (q.category !== 'dq' && q.isProject) return q.projectDoneAt ? undefined : 'project'
  if (i.missed) return q.redoneAs ? undefined : 'redo'
  if (i.done) return undefined
  if (i.canComplete && (isDueToday(i) || i.when === 'anytime')) return 'today'
  if (q.category !== 'dq' && i.when === 'upcoming') return 'moved'
  return undefined // a daily quest's rest day
}

// What can go in a plan: anything open that could be worked on today. Main quests first (they're the ones worth a
// time); within a list, what's due today, then missed, undated, projects, and finally quests due later.
export function planCandidates(items: QuestItem[]): QuestItem[] {
  const rank = { mq: 0, sq: 1, dq: 2 } as const
  const order: Record<PlanKind, number> = { today: 0, redo: 1, project: 2, moved: 3 }
  const group = (i: QuestItem) => (planKind(i) === 'today' && !isDueToday(i) ? 1.5 : order[planKind(i)!]) // undated after missed
  return items
    .filter((i) => planKind(i))
    .sort((a, b) => rank[a.quest.category] - rank[b.quest.category] || group(a) - group(b) || (a.quest.dueDate ?? '').localeCompare(b.quest.dueDate ?? ''))
}

// The plan sheet's sections, in order.
export type PlanGroup = 'due' | 'redo' | 'anytime' | 'project' | 'moved'

export const PLAN_GROUPS: { group: PlanGroup; label: string }[] = [
  { group: 'due', label: 'Due today' },
  { group: 'redo', label: 'Missed' },
  { group: 'anytime', label: 'No date' },
  { group: 'project', label: 'Projects' },
  { group: 'moved', label: 'Due later' },
]

export function planGroup(i: QuestItem): PlanGroup | undefined {
  const kind = planKind(i)
  if (kind === 'today') return isDueToday(i) ? 'due' : 'anytime'
  return kind
}

// A planned quest counts as handled once it's done, or (a project) once any of its board work was finished today.
export function isHandled(i: QuestItem): boolean {
  return i.done || !!i.workedToday
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

export const FRESH_START_LINE: Record<FreshStart, string> = {
  return: 'Welcome back. Today is a clean slate.',
  month: 'A new month. A good day for a fresh start.',
  week: 'A new week. A good day for a fresh start.',
}
