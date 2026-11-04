import type { FocusRating, FocusSession } from '../../db/types'
import { addDaysToKey, dayKey } from '../quests/day'

export const DURATIONS = [15, 25, 45, 0] as const // minutes; 0 = open-ended
export const DEFAULT_DURATION = 25

// The user's own words for how a session felt, low to high. Labels, not grades.
export const RATINGS: { value: FocusRating; label: string }[] = [
  { value: 1, label: 'Scattered' },
  { value: 2, label: 'Choppy' },
  { value: 3, label: 'Steady' },
  { value: 4, label: 'Locked in' },
  { value: 5, label: 'Deep flow' },
]

export function ratingLabel(r: FocusRating): string {
  return RATINGS[r - 1].label
}

// A break sized to the work (about 1 minute per 5 focused), between 3 and 30 minutes.
export function breakMinutes(focusMs: number): number {
  return Math.min(30, Math.max(3, Math.round(focusMs / 60_000 / 5)))
}

const minutesOf = (ms: number) => ms / 60_000

// "25:00", "1:05:09"
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${h ? `${h}:` : ''}${pad(m)}:${pad(s)}`
}

// "0m", "25m", "1h 05m"
export function formatMinutes(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export interface FocusDay {
  key: string
  minutes: number
}

export interface FocusStats {
  todayMin: number
  weekMin: number // the last 7 days, today included
  prevWeekMin: number // the 7 days before that
  weekSessions: number
  days: FocusDay[] // the last 7 days, oldest first
  avgRating?: number // over this week's rated sessions
  rated: number
  prevAvgRating?: number
  parked: number // thoughts parked this week
  away: number // tab-leaves this week
}

function average(list: number[]): number | undefined {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : undefined
}

// Finished sessions → this week's picture. A session counts on the day it started.
export function focusStats(sessions: FocusSession[], today: Date): FocusStats {
  const todayKey = dayKey(today)
  const weekFrom = addDaysToKey(todayKey, -6)
  const prevFrom = addDaysToKey(todayKey, -13)
  const live = sessions.filter((s) => !s.deletedAt && s.endedAt)
  const week = live.filter((s) => s.dayKey >= weekFrom && s.dayKey <= todayKey)
  const prev = live.filter((s) => s.dayKey >= prevFrom && s.dayKey < weekFrom)
  const sum = (list: FocusSession[]) => minutesOf(list.reduce((n, s) => n + s.focusMs, 0))
  const ratings = (list: FocusSession[]) => list.flatMap((s) => (s.rating ? [s.rating] : []))
  const days = Array.from({ length: 7 }, (_, i) => {
    const key = addDaysToKey(weekFrom, i)
    return { key, minutes: sum(week.filter((s) => s.dayKey === key)) }
  })
  return {
    todayMin: days[6].minutes,
    weekMin: sum(week),
    prevWeekMin: sum(prev),
    weekSessions: week.length,
    days,
    avgRating: average(ratings(week)),
    rated: ratings(week).length,
    prevAvgRating: average(ratings(prev)),
    parked: week.reduce((n, s) => n + s.parked.length, 0),
    away: week.reduce((n, s) => n + s.awayCount, 0),
  }
}

// A neutral line comparing this week with last. Never scolds a dip.
export function weekLine(s: Pick<FocusStats, 'weekMin' | 'prevWeekMin' | 'weekSessions'>): string {
  const sessions = `${s.weekSessions} ${s.weekSessions === 1 ? 'session' : 'sessions'}`
  if (s.prevWeekMin < 1) return `${sessions} in the last 7 days.`
  const diff = Math.round(s.weekMin - s.prevWeekMin)
  if (Math.abs(diff) < 5) return `${sessions}, about the same as the week before.`
  return diff > 0 ? `${sessions}, ${formatMinutes(diff)} more than the week before.` : `${sessions}. The week before had ${formatMinutes(s.prevWeekMin)}.`
}
