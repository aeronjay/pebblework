import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import type { DayPlan } from '../../db/types'
import { addDaysToKey } from '../quests/day'
import { getPlan } from './repo'

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
