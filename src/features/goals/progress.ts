import { isSameDay, isWithinInterval, endOfWeek, startOfWeek } from 'date-fns'
import type { CheckIn, Goal, Milestone } from '../../db/types'

export const WEEK_STARTS_ON = 1 // Monday

export interface HabitProgress {
  dueToday: boolean
  doneToday: boolean
  done: number // completions in the current period
  required: number
}

export function habitProgress(goal: Goal, checkIns: CheckIn[], today = new Date()): HabitProgress {
  const schedule = goal.schedule ?? { kind: 'daily' }
  const doneToday = checkIns.some((c) => isSameDay(new Date(c.at), today))

  if (schedule.kind === 'weekly') {
    const week = { start: startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }), end: endOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }) }
    const days = new Set(
      checkIns.filter((c) => isWithinInterval(new Date(c.at), week)).map((c) => new Date(c.at).toDateString()),
    )
    const required = schedule.timesPerWeek
    return { dueToday: days.size < required || doneToday, doneToday, done: days.size, required }
  }

  const dueToday = schedule.kind === 'daily' || schedule.days.includes(today.getDay())
  return { dueToday, doneToday, done: doneToday ? 1 : 0, required: 1 }
}

export function numericTotal(checkIns: CheckIn[]): number {
  return checkIns.reduce((sum, c) => sum + (c.amount ?? 0), 0)
}

export function projectProgress(milestones: Milestone[]): { done: number; total: number; next?: Milestone } {
  const done = milestones.filter((m) => m.completedAt).length
  return { done, total: milestones.length, next: milestones.find((m) => !m.completedAt) }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function describeSchedule(goal: Goal): string {
  const s = goal.schedule ?? { kind: 'daily' }
  if (s.kind === 'daily') return 'Every day'
  if (s.kind === 'weekly') return `${s.timesPerWeek}× per week`
  return s.days.map((d) => DAY_NAMES[d]).join(', ')
}
