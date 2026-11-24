import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import type { DayPlan } from '../../db/types'
import { addDaysToKey } from '../quests/day'
import { promiseLines, type PromiseLine } from './model'
import { getPlan, keptKeys, livePromise } from './repo'

export interface PlanState {
  plan: DayPlan | undefined // undefined = no plan yet today
  tomorrow: DayPlan | undefined // made the evening before; becomes `plan` at midnight
  lastActive: string | undefined // latest day before today with a finished quest
}

// undefined while loading.
export function usePlan(todayKey: string): PlanState | undefined {
  return useLiveQuery(async () => {
    const [plan, tomorrow, last] = await Promise.all([
      getPlan(todayKey),
      getPlan(addDaysToKey(todayKey, 1)),
      db.questCompletions.where('dayKey').below(todayKey).filter((c) => !c.deletedAt).last(),
    ])
    // The dayKey index orders by day, so the last live row below today is the latest active day.
    return { plan, tomorrow, lastActive: last?.dayKey }
  }, [todayKey])
}

export interface PromiseRecord {
  yesterday: PromiseLine[] | undefined // yesterday's promise and how it went, if one was made
  kept: number // every promised thing on past days, kept…
  total: number // …out of this many
}

// The record of past promises. undefined while loading.
export function usePromiseRecord(todayKey: string): PromiseRecord | undefined {
  return useLiveQuery(async () => {
    const past = (await db.dayPlans.where('dayKey').below(todayKey).toArray()).filter((p) => !p.deletedAt && p.promise?.length)
    const days = await Promise.all(
      past.map(async (p) => {
        const promise = await livePromise(p.dayKey, p.promise!)
        return { dayKey: p.dayKey, lines: promiseLines(promise, await keptKeys(p.dayKey, promise), true) }
      }),
    )
    const lines = days.flatMap((d) => d.lines)
    return {
      yesterday: days.find((d) => d.dayKey === addDaysToKey(todayKey, -1))?.lines,
      kept: lines.filter((l) => l.state === 'kept').length,
      total: lines.length,
    }
  }, [todayKey])
}

export interface DayRecord {
  promise: PromiseLine[] // what was promised for the day and how it went; empty: no promise
  note: string | undefined // the day's note, written with its plan
}

// One day's promise and note, for the calendar. undefined while loading (or with no day).
export function useDayRecord(key: string | undefined, todayKey: string): DayRecord | undefined {
  return useLiveQuery(async () => {
    if (!key) return undefined
    const plan = await getPlan(key)
    const promised = plan?.promise?.length ? await livePromise(key, plan.promise) : []
    const promise = promised.length ? promiseLines(promised, await keptKeys(key, promised), key < todayKey) : []
    return { promise, note: plan?.note }
  }, [key, todayKey])
}

// "Not tonight" on the evening prompt: remembered on this device for that one evening. It's not a skipped plan, so
// the morning still asks.
const TONIGHT_KEY = 'pebblework.plan.not-tonight'

function readTonight(): string | null {
  try {
    return localStorage.getItem(TONIGHT_KEY)
  } catch {
    return null
  }
}

export function useNotTonight(tomorrowKey: string): [boolean, () => void] {
  const [skipped, setSkipped] = useState(readTonight)
  function skip() {
    try {
      localStorage.setItem(TONIGHT_KEY, tomorrowKey)
    } catch {
      // private mode: it stays dismissed until the page reloads
    }
    setSkipped(tomorrowKey)
  }
  return [skipped === tomorrowKey, skip]
}

// The current time, refreshed each minute (for "next up" and overdue slots).
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return now
}

// Yesterday's promise card: "OK" hides it for the rest of the day, on this device.
const PROMISE_SEEN_KEY = 'pebblework.plan.promise-seen'

export function usePromiseSeen(todayKey: string): [boolean, () => void] {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(PROMISE_SEEN_KEY)
    } catch {
      return null
    }
  })
  function dismiss() {
    try {
      localStorage.setItem(PROMISE_SEEN_KEY, todayKey)
    } catch {
      // private mode: it stays hidden until the page reloads
    }
    setSeen(todayKey)
  }
  return [seen === todayKey, dismiss]
}
