// Insights: patterns in what you've finished, framed to encourage. Pure functions over live completions; every one
// takes `now`. A "completion" is anything that dropped (or will drop) a stone: a quest, a project stage, a project
// bonus. Each counts once here (units/weights belong to the jar, not to "how often you showed up").
import { getDay } from 'date-fns'
import type { QuestCategory, QuestCompletion } from '../../db/types'
import { WEEK_STARTS_ON } from '../calendar/model'
import { weekStartKey } from '../review/repo'
import { CATEGORY_ORDER, addDaysToKey, dayKey, parseDayKey } from '../quests/day'

const live = (cs: QuestCompletion[]) => cs.filter((c) => !c.deletedAt)

export function activeDays(completions: QuestCompletion[]): Set<string> {
  return new Set(live(completions).map((c) => c.dayKey))
}

// A day that neither extends nor breaks a run (a daily quest's rest day with nothing done).
export type RestDay = (key: string) => boolean
const noRest: RestDay = () => false

// Consecutive active days ending today, or ending yesterday while today is still open (today never breaks a streak
// until it's over). Rest days in between are skipped: they don't count, and they don't break the run.
export function currentStreak(days: ReadonlySet<string>, now: Date, rest: RestDay = noRest): number {
  const first = [...days].sort()[0]
  if (!first) return 0
  let key = addDaysToKey(dayKey(now), -1)
  let n = days.has(dayKey(now)) ? 1 : 0
  for (; key >= first; key = addDaysToKey(key, -1)) {
    if (days.has(key)) n++
    else if (!rest(key)) break
  }
  return n
}

export function bestStreak(days: ReadonlySet<string>, rest: RestDay = noRest): number {
  const sorted = [...days].sort()
  let best = 0
  let run = 0
  let prev: string | undefined
  for (const k of sorted) {
    run = prev && bridged(prev, k, rest) ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return best
}

// Whether every day strictly between two active days is a rest day.
function bridged(from: string, to: string, rest: RestDay): boolean {
  for (let k = addDaysToKey(from, 1); k < to; k = addDaysToKey(k, 1)) if (!rest(k)) return false
  return true
}

export interface WeekdayStat {
  weekday: number // 0 = Sunday
  average: number // completions per occurrence of this weekday in the window
  total: number
}

// Average per weekday over the last `windowDays` (through today), starting no earlier than the first completion so a
// new user isn't averaged against weeks before they began. Ordered from the week's first day (Monday).
export function weekdayAverages(completions: QuestCompletion[], now: Date, windowDays = 84): WeekdayStat[] {
  const today = dayKey(now)
  const cs = live(completions).filter((c) => c.dayKey <= today)
  const first = cs.reduce<string | undefined>((m, c) => (!m || c.dayKey < m ? c.dayKey : m), undefined)
  const windowStart = addDaysToKey(today, -(windowDays - 1))
  const from = first && first > windowStart ? first : windowStart
  const totals = Array(7).fill(0) as number[]
  const occurrences = Array(7).fill(0) as number[]
  if (first) {
    for (let k = from; k <= today; k = addDaysToKey(k, 1)) occurrences[getDay(parseDayKey(k))]++
    for (const c of cs) if (c.dayKey >= from) totals[getDay(parseDayKey(c.dayKey))]++
  }
  return Array.from({ length: 7 }, (_, i) => {
    const weekday = (i + WEEK_STARTS_ON) % 7
    return { weekday, total: totals[weekday], average: occurrences[weekday] ? totals[weekday] / occurrences[weekday] : 0 }
  })
}

// The weekday with the highest average, if any day has completions. Ties go to the earlier day of the week.
export function bestWeekday(stats: WeekdayStat[]): WeekdayStat | undefined {
  return stats.reduce<WeekdayStat | undefined>((best, s) => (s.average > 0 && (!best || s.average > best.average) ? s : best), undefined)
}

export function categoryCounts(completions: QuestCompletion[]): Record<QuestCategory, number> {
  const out = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<QuestCategory, number>
  for (const c of live(completions)) out[c.category]++
  return out
}

// The type you finish most; undefined with no completions. Ties keep CATEGORY_ORDER.
export function topCategory(counts: Record<QuestCategory, number>): QuestCategory | undefined {
  return CATEGORY_ORDER.reduce<QuestCategory | undefined>((top, c) => (counts[c] > 0 && (!top || counts[c] > counts[top]) ? c : top), undefined)
}

export interface WeekCount {
  weekStart: string
  count: number
}

// Completions per week for the last `weeks` weeks, oldest first; the last entry is the current (partial) week.
export function weeklyCounts(completions: QuestCompletion[], now: Date, weeks = 12): WeekCount[] {
  const current = weekStartKey(now)
  const out: WeekCount[] = Array.from({ length: weeks }, (_, i) => ({ weekStart: addDaysToKey(current, -7 * (weeks - 1 - i)), count: 0 }))
  const index = new Map(out.map((w, i) => [w.weekStart, i]))
  const today = dayKey(now)
  for (const c of live(completions)) {
    if (c.dayKey > today) continue
    const i = index.get(weekStartKey(parseDayKey(c.dayKey)))
    if (i !== undefined) out[i].count++
  }
  return out
}

export interface Insights {
  total: number
  activeDays: number
  currentStreak: number
  bestStreak: number
  weekdays: WeekdayStat[]
  bestWeekday?: WeekdayStat
  categories: Record<QuestCategory, number>
  topCategory?: QuestCategory
  weeks: WeekCount[]
}

export function computeInsights(completions: QuestCompletion[], now: Date, rest: RestDay = noRest): Insights {
  const today = dayKey(now)
  const past = live(completions).filter((c) => c.dayKey <= today)
  const days = activeDays(past)
  const weekdays = weekdayAverages(past, now)
  const categories = categoryCounts(past)
  return {
    total: past.length,
    activeDays: days.size,
    currentStreak: currentStreak(days, now, rest),
    bestStreak: bestStreak(days, rest),
    weekdays,
    bestWeekday: bestWeekday(weekdays),
    categories,
    topCategory: topCategory(categories),
    weeks: weeklyCounts(past, now),
  }
}

// One kind sentence about the streak. Never scolds a gap.
export function streakLine(current: number, best: number, doneToday: boolean): string {
  if (current === 0) return best > 0 ? `Your best run is ${best} ${best === 1 ? 'day' : 'days'}. One quest today starts a new one.` : 'One quest today starts your first run.'
  const days = `${current} ${current === 1 ? 'day' : 'days'}`
  if (!doneToday) return `${days} in a row so far. Today can make it ${current + 1}.`
  if (current >= best && current > 1) return `${days} in a row, your longest run yet.`
  return `${days} in a row. Nice and steady.`
}
