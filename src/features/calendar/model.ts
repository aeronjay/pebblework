// Pure presentation logic for the quest calendar (no React, no CSS), so it can be unit tested.
import { addDays, addMonths, endOfWeek, format, startOfWeek } from 'date-fns'
import type { QuestCategory } from '../../db/types'
import type { DayStatus, Intensity, MonthDay } from '../quests/day'

// Monday, matching goals/progress.ts WEEK_STARTS_ON. Used for useMonth, the local grid and the weekday header.
export const WEEK_STARTS_ON = 1 as const

export const STATUS_LABEL: Record<DayStatus, string> = {
  future: 'Upcoming',
  empty: 'Quiet day',
  pending: 'In progress',
  ready: 'Ready to claim',
  claimed: 'Claimed',
  closed: 'Closed',
}

const CATEGORY_NAME: Record<QuestCategory, string> = { dq: 'Daily', mq: 'Main', sq: 'Side' }

export type CellDay = Pick<MonthDay, 'key' | 'date' | 'status' | 'assigned' | 'done' | 'intensity' | 'categories' | 'isToday'>

export function weekdayLabels(weekStartsOn: 0 | 1 = WEEK_STARTS_ON): { short: string; long: string }[] {
  const start = startOfWeek(new Date(2026, 0, 7), { weekStartsOn })
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i)
    return { short: format(d, 'EEEEEE'), long: format(d, 'EEEE') }
  })
}

export function progressText(day: Pick<MonthDay, 'status' | 'assigned' | 'done'>): string {
  if (day.status === 'future') return day.assigned ? `${day.assigned} scheduled` : 'Nothing scheduled'
  if (day.status === 'empty') return 'Nothing scheduled'
  return `${day.done} of ${day.assigned} done`
}

export function categoryNames(categories: QuestCategory[]): string {
  return categories.map((c) => CATEGORY_NAME[c]).join(', ')
}

export function dayAriaLabel(day: CellDay): string {
  const parts = [format(day.date, 'EEEE, MMMM d') + (day.isToday ? ', today' : ''), STATUS_LABEL[day.status], progressText(day)]
  if (day.categories.length) parts.push(categoryNames(day.categories))
  return parts.join('. ')
}

// Tint strength (percent of the category color) per GitHub-style intensity bucket.
const TINT: Record<Intensity, number> = { 0: 0, 1: 14, 2: 24, 3: 34, 4: 46 }

export function tintPercent(intensity: Intensity, status: DayStatus): number {
  if (status === 'future' || status === 'empty') return 0
  const base = TINT[intensity]
  // Ready days always carry enough color to read as "lit"; closed days stay neutral and quieter.
  if (status === 'ready') return Math.max(base, 20)
  if (status === 'closed') return Math.round(base * 0.5)
  return base
}

const mix = (cssVar: string, pct: number) => `color-mix(in oklch, var(${cssVar}) ${pct}%, transparent)`

// Background for a cell: a blend of its categories at intensity strength. Closed days use neutral ink.
export function tintBackground(day: Pick<MonthDay, 'status' | 'intensity' | 'categories'>): string | undefined {
  const pct = tintPercent(day.intensity, day.status)
  if (!pct) return undefined
  if (day.status === 'closed' || !day.categories.length) return mix('--color-ink', Math.max(4, Math.round(pct * 0.45)))
  const stops = day.categories.map((c) => mix(`--color-${c}`, pct))
  return stops.length === 1 ? stops[0] : `linear-gradient(135deg, ${stops.join(', ')})`
}

// Category dots under a cell. Future days skip DQ: it recurs daily, so marking it would dot every cell; only
// dated one-offs (MQ/SQ) stand out.
export function cellDots(day: Pick<MonthDay, 'status' | 'categories'>): QuestCategory[] {
  if (day.status === 'empty' || day.status === 'pending') return []
  if (day.status === 'future') return day.categories.filter((c) => c !== 'dq')
  return day.categories
}

// Base classes per status. Positioning/size live in the component.
export const STATUS_CLASS: Record<DayStatus, string> = {
  future: 'text-muted',
  empty: 'text-faint',
  pending: 'text-ink',
  ready: 'qc-ready text-ink font-semibold',
  claimed: 'text-ink',
  closed: 'bg-sunken/70 text-faint',
}

export function cellClass(day: Pick<MonthDay, 'status' | 'isToday'>, inMonth: boolean): string {
  const out = [STATUS_CLASS[day.status]]
  if (day.isToday) out.push('qc-today font-semibold')
  // Adjacent-month days fade, but stay legible when they still need action.
  if (!inMonth) out.push(day.status === 'ready' || day.status === 'pending' ? 'opacity-80' : 'opacity-45')
  return out.join(' ')
}

export interface ClaimCopy {
  label: string
  detail: string
  aria: string
}

export function claimCopy(days: number, weight: number): ClaimCopy {
  if (!days) return { label: 'Nothing to claim yet', detail: 'Check off a quest to earn a stone', aria: 'Nothing to claim yet' }
  const d = days === 1 ? '1 day' : `${days} days`
  return {
    label: `Claim ${d}`,
    detail: `+${weight}`,
    aria: `Claim ${d}, adding ${weight} stone weight to the jar`,
  }
}

// Target date for a grid keyboard key, or null when the key isn't a navigation key.
export function navTarget(date: Date, key: string, weekStartsOn: 0 | 1 = WEEK_STARTS_ON): Date | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(date, -1)
    case 'ArrowRight':
      return addDays(date, 1)
    case 'ArrowUp':
      return addDays(date, -7)
    case 'ArrowDown':
      return addDays(date, 7)
    case 'Home':
      return startOfWeek(date, { weekStartsOn })
    case 'End':
      return endOfWeek(date, { weekStartsOn })
    case 'PageUp':
      return addMonths(date, -1)
    case 'PageDown':
      return addMonths(date, 1)
    default:
      return null
  }
}

export function monthSummary(days: Pick<MonthDay, 'status' | 'inMonth'>[]): string {
  let claimed = 0
  let ready = 0
  for (const d of days) {
    if (!d.inMonth) continue
    if (d.status === 'claimed') claimed++
    else if (d.status === 'ready') ready++
  }
  const parts: string[] = []
  if (claimed) parts.push(`${claimed} claimed`)
  if (ready) parts.push(`${ready} ready`)
  return parts.join(', ')
}
