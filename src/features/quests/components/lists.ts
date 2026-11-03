// Pure helpers for the quest lists' drag and drop (kept out of component files for fast refresh).
import type { QuestCategory } from '../../../db/types'
import type { QuestItem } from '../hooks'
import { CATEGORY_ORDER } from '../meta'

export type Lists = Record<QuestCategory, string[]> // category → visible quest ids, in order

// Done-earlier and already-redone quests fold into a quiet tail so the list stays about what's next.
export function isEarlier(i: QuestItem): boolean {
  return i.when === 'past' || (i.missed && !!i.quest.redoneAs)
}

export function isCategory(id: unknown): id is QuestCategory {
  return (CATEGORY_ORDER as unknown[]).includes(id)
}

// The visible (draggable) quests of each list, in stored order.
export function listsOf(items: QuestItem[]): Lists {
  const lists: Lists = { dq: [], mq: [], sq: [] }
  for (const i of items) if (!isEarlier(i)) lists[i.quest.category].push(i.quest.id)
  return lists
}

export function listOf(lists: Lists, id: string): QuestCategory | undefined {
  if (isCategory(id)) return id
  return CATEGORY_ORDER.find((c) => lists[c].includes(id))
}

// Only main and side quests swap lists (see placeQuest); a missed one stays put. null = allowed.
export function refusal(item: QuestItem, to: QuestCategory): string | null {
  if (item.quest.category === to) return null
  if (item.quest.category === 'dq' || to === 'dq') return 'Daily quests stay in their own list.'
  if (item.missed) return 'A missed quest keeps its list. Use “Do it today” instead.'
  return null
}

// Moves `id` into list `to` at `index` (removing it from wherever it was). Returns a new object.
export function moveTo(lists: Lists, id: string, to: QuestCategory, index: number): Lists {
  const next: Lists = { dq: [], mq: [], sq: [] }
  for (const c of CATEGORY_ORDER) next[c] = lists[c].filter((x) => x !== id)
  next[to].splice(Math.max(0, Math.min(next[to].length, index)), 0, id)
  return next
}

// What today asks for: quests due today, plus anything finished today (undated quests never block a day).
// One basis for the day summary, the Today tab and each list's count.
export function isDueToday(i: QuestItem): boolean {
  return i.when === 'today' || i.doneToday
}

export function dayCount(items: QuestItem[]): { done: number; total: number } {
  const due = items.filter(isDueToday)
  return { done: due.filter((i) => i.done).length, total: due.length }
}

// The Today tab: what's due today, plus missed quests that can still be redone today.
export function todayItems(items: QuestItem[]): QuestItem[] {
  return items.filter((i) => isDueToday(i) || (i.missed && !i.quest.redoneAs))
}

// The Home quest views. 'all' is the stacked lists; a category shows that one list.
export type QuestView = 'today' | 'all' | QuestCategory

export function isQuestView(v: unknown): v is QuestView {
  return v === 'today' || v === 'all' || isCategory(v)
}

export function viewTabId(base: string, v: QuestView): string {
  return `${base}-tab-${v}`
}

// Drop targets on the view tabs are told apart from the lists (which use the bare category as their id).
const TAB = 'tab:'
export function tabDropId(v: QuestView): string {
  return TAB + v
}

export function tabCategory(id: unknown): QuestCategory | undefined {
  if (typeof id !== 'string' || !id.startsWith(TAB)) return undefined
  const c = id.slice(TAB.length)
  return isCategory(c) ? c : undefined
}
