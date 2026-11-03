// Weekly reflection: "what went well, what got in the way, one tweak". One row per week, keyed by the week's first
// day (Monday, like the calendar), so two devices reviewing the same week converge on one record.
import { addWeeks, format, startOfWeek } from 'date-fns'
import { db, newMeta, touch, type MarbleDB } from '../../db/db'
import type { QuestCategory, QuestCompletion, WeeklyReview } from '../../db/types'
import { WEEK_STARTS_ON } from '../calendar/model'
import { CATEGORY_ORDER, addDaysToKey, dayKey, parseDayKey } from '../quests/day'

export type ReviewField = 'wentWell' | 'inTheWay' | 'tweak'
export type ReviewPatch = Partial<Record<ReviewField, string>>

export const REVIEW_FIELDS: ReviewField[] = ['wentWell', 'inTheWay', 'tweak']

export function weekStartKey(d: Date): string {
  return dayKey(startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }))
}

export function shiftWeek(weekStart: string, n: number): string {
  return weekStartKey(addWeeks(parseDayKey(weekStart), n))
}

export function weekEndKey(weekStart: string): string {
  return addDaysToKey(weekStart, 6)
}

// "Nov 2 – 8", "Oct 26 – Nov 1", "Dec 28, 2026 – Jan 3, 2027" (years only when they differ from `now`'s or each other).
export function weekLabel(weekStart: string, now: Date = new Date()): string {
  const a = parseDayKey(weekStart)
  const b = parseDayKey(weekEndKey(weekStart))
  const crossYear = a.getFullYear() !== b.getFullYear()
  const showYear = crossYear || a.getFullYear() !== now.getFullYear()
  const left = format(a, crossYear ? 'MMM d, yyyy' : 'MMM d')
  const right = format(b, a.getMonth() === b.getMonth() && !crossYear ? 'd' : 'MMM d')
  return `${left} – ${right}${showYear ? format(b, ', yyyy') : ''}`
}

export function isBlankReview(r: Partial<Pick<WeeklyReview, ReviewField>> | undefined): boolean {
  return !r || REVIEW_FIELDS.every((f) => !r[f]?.trim())
}

export async function getReview(weekStart: string, database: MarbleDB = db): Promise<WeeklyReview | undefined> {
  const r = await database.weeklyReviews.get(weekStart)
  return r && !r.deletedAt ? r : undefined
}

// Creates the week's row on the first non-blank edit; never writes when nothing changed. Returns whether it wrote.
export async function saveReview(weekStart: string, patch: ReviewPatch, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', database.weeklyReviews, async () => {
    const iso = now.toISOString()
    const existing = await database.weeklyReviews.get(weekStart)
    const live = existing && !existing.deletedAt ? existing : undefined
    const next: WeeklyReview = live ? { ...live } : { id: weekStart, weekStart, ...newMeta(iso) }
    let changed = false
    for (const f of REVIEW_FIELDS) {
      const v = patch[f]
      if (v === undefined || v === (next[f] ?? '')) continue
      if (v) next[f] = v
      else delete next[f]
      changed = true
    }
    if (!changed) return false
    if (!live && isBlankReview(next)) return false
    if (existing?.deletedAt) next.createdAt = existing.createdAt
    await database.weeklyReviews.put(touch(next, iso))
    return true
  })
}

// Live, non-blank reviews, newest week first.
export async function listReviews(database: MarbleDB = db): Promise<WeeklyReview[]> {
  const all = await database.weeklyReviews.filter((r) => !r.deletedAt && !isBlankReview(r)).toArray()
  return all.sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

export interface WeekSummary {
  finished: number // completions (quests, project stages and project bonuses), each counted once
  activeDays: number // days with at least one completion
  byCategory: Record<QuestCategory, number>
  days: { key: string; count: number }[] // the week's 7 days, in order
}

// What the week looked like, from live completions (pass any range; only the week's are counted).
export function weekSummary(weekStart: string, completions: QuestCompletion[]): WeekSummary {
  const end = weekEndKey(weekStart)
  const days = Array.from({ length: 7 }, (_, i) => ({ key: addDaysToKey(weekStart, i), count: 0 }))
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<QuestCategory, number>
  let finished = 0
  for (const c of completions) {
    if (c.deletedAt || c.dayKey < weekStart || c.dayKey > end) continue
    finished++
    byCategory[c.category]++
    days[Math.round((parseDayKey(c.dayKey).getTime() - parseDayKey(weekStart).getTime()) / 86_400_000)].count++
  }
  return { finished, activeDays: days.filter((d) => d.count > 0).length, byCategory, days }
}
