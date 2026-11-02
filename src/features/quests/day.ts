// Pure quest/day rules. Every function that depends on "today" takes `now` so tests can pin the clock.
import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import type { Quest, QuestCategory, QuestCompletion } from '../../db/types'

export type DayStatus = 'future' | 'empty' | 'pending' | 'ready' | 'claimed' | 'closed'
export type Intensity = 0 | 1 | 2 | 3 | 4
export type StoneWeight = 1 | 2 | 3

export interface StoneSpec {
  category: QuestCategory
  weight: StoneWeight
}

export interface DaySummary {
  status: DayStatus
  assigned: number // quests assigned to the day ∪ quests completed that day (undated ones)
  done: number // completions that day (= stone weight units)
  intensity: Intensity
  categories: QuestCategory[] // categories assigned or completed that day, in CATEGORY_ORDER
}

export interface MonthDay extends DaySummary {
  key: string
  date: Date
  inMonth: boolean
  isToday: boolean
}

// Where a quest sits relative to today, for list grouping.
export type QuestWhen = 'today' | 'upcoming' | 'anytime' | 'missed' | 'past'

export const CATEGORY_ORDER: QuestCategory[] = ['dq', 'mq', 'sq']
export const MAX_STONE_WEIGHT = 3
export const CAPACITY_MIN = 21
export const CAPACITY_MAX = 150
export const CAPACITY_WINDOW_DAYS = 14 // includes today
export const DQ_CAPACITY_DAYS = 14

// Local calendar day. Never use toISOString().slice(0, 10): that's the UTC day.
export function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// Local midnight of a day key.
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDaysToKey(key: string, n: number): string {
  return dayKey(addDays(parseDayKey(key), n))
}

export function isoToDayKey(iso: string): string {
  return dayKey(new Date(iso))
}

export function completionId(questId: string, key: string): string {
  return `${questId}:${key}`
}

export function cardCompletionId(cardId: string): string {
  return `card:${cardId}`
}

export function projectCompletionId(questId: string): string {
  return `project:${questId}`
}

// Stone weight units a completion is worth (project bonus = 3).
export function units(c: QuestCompletion): number {
  return c.units ?? 1
}

export function sumUnits(completions: QuestCompletion[]): number {
  return completions.reduce((n, c) => n + (c.deletedAt ? 0 : units(c)), 0)
}

// Claimed completions already dropped their stones; they can never be withdrawn.
export function isClaimed(c: QuestCompletion): boolean {
  return !!c.claimedAt
}

// Live completions not yet claimed (what the next claim would drop).
export function unclaimed(completions: QuestCompletion[]): QuestCompletion[] {
  return completions.filter((c) => !c.deletedAt && !c.claimedAt)
}

// A completion of the quest itself (not a project card or project bonus).
export function isQuestCompletion(c: QuestCompletion): boolean {
  return !c.cardId && (c.kind ?? 'quest') === 'quest'
}

export function isProject(q: Quest): boolean {
  return !!q.isProject && q.category !== 'dq'
}

// Projects count as undated: their `dueDate` is a display-only deadline.
export function isUndated(q: Quest): boolean {
  return q.category !== 'dq' && (!q.dueDate || isProject(q))
}

// Deleting a quest removes it from its deletion day onward; earlier days keep it. Projects are never assigned.
export function isAssigned(q: Quest, key: string): boolean {
  if (isProject(q)) return false
  if (q.deletedAt && isoToDayKey(q.deletedAt) <= key) return false
  if (q.category === 'dq') return q.startDate <= key
  return q.dueDate === key
}

// Live completions of the quest itself (card/project completions never mark the quest done).
function liveFor(q: Quest, completions: QuestCompletion[]): QuestCompletion[] {
  return completions.filter((c) => c.questId === q.id && !c.deletedAt && isQuestCompletion(c))
}

// DQ: done today. MQ/SQ: done at all (dated ones can only be done on their due day). Project: completeProject ran.
export function isQuestDone(q: Quest, completions: QuestCompletion[], now: Date): boolean {
  if (isProject(q)) return !!q.projectDoneAt
  const mine = liveFor(q, completions)
  if (q.category === 'dq') return mine.some((c) => c.dayKey === dayKey(now))
  return mine.length > 0
}

// Same-day lock: only today's work can be checked off. Projects complete on their board, never here.
export function canComplete(q: Quest, completions: QuestCompletion[], now: Date): boolean {
  if (isProject(q)) return false
  const today = dayKey(now)
  const mine = liveFor(q, completions)
  if (isUndated(q)) return !q.deletedAt && mine.length === 0
  return isAssigned(q, today) && !mine.some((c) => c.dayKey === today)
}

// A live completion made today that hasn't been claimed yet. Claimed completions are permanent. `_todayClaimed` is
// accepted for compatibility but unused: after a claim, newer (unclaimed) completions of today can still be undone.
export function canUncomplete(q: Quest, completions: QuestCompletion[], _todayClaimed: boolean, now: Date): boolean {
  const today = dayKey(now)
  return liveFor(q, completions).some((c) => c.dayKey === today && !isClaimed(c))
}

// A dated MQ/SQ whose day passed without completion. Its date is frozen; offer doItToday instead.
export function isMissed(q: Quest, completions: QuestCompletion[], now: Date): boolean {
  if (isProject(q)) return false
  return q.category !== 'dq' && !!q.dueDate && q.dueDate < dayKey(now) && liveFor(q, completions).length === 0
}

export function questWhen(q: Quest, completions: QuestCompletion[], now: Date): QuestWhen {
  const today = dayKey(now)
  if (q.category === 'dq') return q.startDate > today ? 'upcoming' : 'today'
  if (isProject(q)) return q.projectDoneAt && isoToDayKey(q.projectDoneAt) < today ? 'past' : 'anytime'
  if (q.dueDate) {
    if (q.dueDate === today) return 'today'
    if (q.dueDate > today) return 'upcoming'
    return isMissed(q, completions, now) ? 'missed' : 'past'
  }
  const done = liveFor(q, completions)
  return done.length && done.every((c) => c.dayKey < today) ? 'past' : 'anytime'
}

// Incremental claims: `ready` = all assigned done and ≥1 unclaimed completion (a claimed day becomes ready again
// when new completions land). `claimed` = the day has a claim (DayClaim or claimed completions) and isn't ready —
// except today, which is `pending` while new work is open. `claimed` param = a DayClaim exists for `key`.
export function dayStatus(key: string, quests: Quest[], completions: QuestCompletion[], claimed: boolean, now: Date): DayStatus {
  const today = dayKey(now)
  const done = completions.filter((c) => c.dayKey === key && !c.deletedAt)
  const hasClaim = claimed || done.some(isClaimed)
  if (key > today) return hasClaim ? 'claimed' : 'future'
  const assigned = quests.filter((q) => isAssigned(q, key))
  const doneIds = new Set(done.filter(isQuestCompletion).map((c) => c.questId))
  const allDone = assigned.every((q) => doneIds.has(q.id))
  const fresh = unclaimed(done).length > 0
  if (allDone && fresh) return 'ready'
  if (hasClaim) return fresh && key === today ? 'pending' : 'claimed'
  if (!assigned.length && !done.length) return 'empty'
  return key === today ? 'pending' : 'closed'
}

// `done` = stone weight units earned that day; `assigned` = done + assigned quests still open, so done ≤ assigned.
export function daySummary(key: string, quests: Quest[], completions: QuestCompletion[], claimed: boolean, now: Date): DaySummary {
  const done = completions.filter((c) => c.dayKey === key && !c.deletedAt)
  const assigned = quests.filter((q) => isAssigned(q, key))
  const doneIds = new Set(done.filter(isQuestCompletion).map((c) => c.questId))
  const n = sumUnits(done)
  const cats = new Set<QuestCategory>([...assigned.map((q) => q.category), ...done.map((c) => c.category)])
  return {
    status: dayStatus(key, quests, completions, claimed, now),
    assigned: n + assigned.filter((q) => !doneIds.has(q.id)).length,
    done: n,
    intensity: intensity(n),
    categories: CATEGORY_ORDER.filter((c) => cats.has(c)),
  }
}

// Days up to today with unclaimed completions whose assigned quests are all done, oldest first. Includes days
// claimed earlier that gained new completions since.
export function claimableDays(quests: Quest[], completions: QuestCompletion[], claimed: ReadonlySet<string>, now: Date): string[] {
  const today = dayKey(now)
  const keys = new Set(unclaimed(completions).filter((c) => c.dayKey <= today).map((c) => c.dayKey))
  return [...keys].sort().filter((k) => dayStatus(k, quests, completions, claimed.has(k), now) === 'ready')
}

// GitHub-style buckets.
export function intensity(n: number): Intensity {
  if (n <= 0) return 0
  if (n === 1) return 1
  if (n <= 3) return 2
  if (n <= 5) return 3
  return 4
}

// One group per category summing units; each split greedily into stones of weight ≤ 3 (5 → [3, 2], 4 → [3, 1]).
export function stonesForDay(completions: QuestCompletion[]): StoneSpec[] {
  const out: StoneSpec[] = []
  for (const category of CATEGORY_ORDER) {
    let n = sumUnits(completions.filter((c) => c.category === category))
    while (n > 0) {
      const weight = Math.min(MAX_STONE_WEIGHT, n) as StoneWeight
      out.push({ category, weight })
      n -= weight
    }
  }
  return out
}

// Weight units the jar holds. Only used until the jar's first stone lands; then the jar's stored capacity is frozen.
export function jarCapacityFor(quests: Quest[], now: Date, completions: QuestCompletion[] = []): number {
  const today = dayKey(now)
  const horizon = addDaysToKey(today, CAPACITY_WINDOW_DAYS - 1)
  const live = quests.filter((q) => !q.deletedAt)
  const activeDQ = live.filter((q) => q.category === 'dq').length
  const dueSoon = live.filter((q) => q.category !== 'dq' && !isUndated(q) && q.dueDate && q.dueDate >= today && q.dueDate <= horizon).length
  const openUndated = live.filter((q) => isUndated(q) && (isProject(q) ? !q.projectDoneAt : liveFor(q, completions).length === 0)).length
  const raw = activeDQ * DQ_CAPACITY_DAYS + dueSoon + openUndated
  return Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, raw))
}

export function monthGrid(month: Date, weekStartsOn: 0 | 1 = 0): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn }),
  })
}

export function monthDays(
  month: Date,
  quests: Quest[],
  completions: QuestCompletion[],
  claimed: ReadonlySet<string>,
  now: Date,
  weekStartsOn: 0 | 1 = 0,
): MonthDay[] {
  const today = dayKey(now)
  return monthGrid(month, weekStartsOn).map((date) => {
    const key = dayKey(date)
    return {
      key,
      date,
      inMonth: isSameMonth(date, month),
      isToday: key === today,
      ...daySummary(key, quests, completions, claimed.has(key), now),
    }
  })
}
