// Pure helpers for the board UI (kept out of component files for fast refresh).
import { differenceInCalendarDays, format } from 'date-fns'
import type { Card, Subtask } from '../../../db/types'
import { parseDayKey } from '../../quests/day'
import type { CardMoveResult } from '../repo'

export type Items = Record<string, string[]> // column id → card ids in order

export function itemsOf(cardsByColumn: Record<string, Card[]>): Items {
  return Object.fromEntries(Object.entries(cardsByColumn).map(([col, cards]) => [col, cards.map((c) => c.id)]))
}

export function containerOf(items: Items, id: string): string | undefined {
  if (id in items) return id
  return Object.keys(items).find((col) => items[col].includes(id))
}

// Moves `id` into `to` at `index` (removing it from wherever it was). Returns a new object.
export function moveItem(items: Items, id: string, to: string, index: number): Items {
  const next: Items = {}
  for (const [col, ids] of Object.entries(items)) next[col] = ids.filter((x) => x !== id)
  const list = next[to] ?? []
  list.splice(Math.max(0, Math.min(list.length, index)), 0, id)
  next[to] = list
  return next
}

export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}

export type DueTone = 'overdue' | 'soon' | 'later'

// "Due Fri", "Due today", "Due Nov 21"; tone drives a quiet color shift (reminders only, never alarming).
export function describeDue(key: string, todayKey: string): { label: string; long: string; tone: DueTone } {
  const d = parseDayKey(key)
  const diff = differenceInCalendarDays(d, parseDayKey(todayKey))
  const sameYear = d.getFullYear() === parseDayKey(todayKey).getFullYear()
  const date = format(d, sameYear ? 'MMM d' : 'MMM d, yyyy')
  const tone: DueTone = diff < 0 ? 'overdue' : diff <= 2 ? 'soon' : 'later'
  let label: string
  if (diff === 0) label = 'Due today'
  else if (diff === 1) label = 'Due tomorrow'
  else if (diff === -1) label = 'Was due yesterday'
  else if (diff > 1 && diff < 7) label = `Due ${format(d, 'EEE')}`
  else label = diff < 0 ? `Was due ${date}` : `Due ${date}`
  return { label, long: `${format(d, 'EEEE, MMMM d')}${sameYear ? '' : `, ${d.getFullYear()}`}`, tone }
}

export function describeDeadline(key: string, todayKey: string): string {
  const d = parseDayKey(key)
  const diff = differenceInCalendarDays(d, parseDayKey(todayKey))
  const date = format(d, d.getFullYear() === parseDayKey(todayKey).getFullYear() ? 'MMM d' : 'MMM d, yyyy')
  if (diff === 0) return 'Deadline today'
  if (diff === 1) return 'Deadline tomorrow'
  if (diff < 0) return `Deadline passed · ${date}`
  return `${date} · in ${diff} days`
}

export function subtaskProgress(subtasks: Subtask[]): { done: number; total: number } {
  return { done: subtasks.filter((s) => s.done).length, total: subtasks.length }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

// "claim it" only once today can actually be claimed (a day is ready when its assigned quests are all done).
function claimHint(openQuests: number): string {
  return openQuests > 0 ? `finish today’s ${plural(openQuests, 'quest')} to claim it` : 'claim it on the calendar'
}

// What to tell the user after a card changed column. null = say nothing (plain moves are their own feedback).
// `openQuests` = quests still assigned to today and not done.
export function moveMessage(result: CardMoveResult, enteredDone: boolean, openQuests = 0): string | null {
  if (result.awarded) return `+1 stone for today — ${claimHint(openQuests)}`
  if (enteredDone) return 'Stage done. It already earned its stone earlier.'
  if (result.withdrawn) return 'Moved out of Done — today’s stone was returned.'
  return null
}

export function projectMessage(earned: boolean, openQuests = 0): string {
  if (earned) return `+3 stones project bonus — ${claimHint(openQuests).replace(' it', ' them')}`
  return 'Project complete. Its bonus was earned the first time.'
}

// Where "back" goes: the in-app page the user came from, if any (hash routing, so track hashchange ourselves).
let cameFrom: string | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', (e) => {
    try {
      cameFrom = new URL(e.oldURL).hash || '#/'
    } catch {
      cameFrom = null
    }
  })
}

export function backTarget(): { label: string; inApp: boolean } {
  const from = cameFrom ?? ''
  if (!cameFrom || from.startsWith('#/quests/')) return { label: 'Home', inApp: false }
  if (from.startsWith('#/projects')) return { label: 'Projects', inApp: true }
  if (from.startsWith('#/today')) return { label: 'Today', inApp: true }
  if (from.startsWith('#/goals')) return { label: 'Goals', inApp: true }
  if (from.startsWith('#/settings')) return { label: 'Settings', inApp: true }
  return { label: 'Home', inApp: true }
}

// Literal class names per category (Tailwind can't see `text-${category}-ink`).
export const CAT_CLASS = {
  dq: { ink: 'text-dq-ink', soft: 'bg-dq-soft', fill: 'bg-dq', text: 'text-dq' },
  mq: { ink: 'text-mq-ink', soft: 'bg-mq-soft', fill: 'bg-mq', text: 'text-mq' },
  sq: { ink: 'text-sq-ink', soft: 'bg-sq-soft', fill: 'bg-sq', text: 'text-sq' },
} as const
