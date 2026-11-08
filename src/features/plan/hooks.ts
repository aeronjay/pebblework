import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import type { DayPlan } from '../../db/types'
import { getPlan } from './repo'

export interface PlanState {
  plan: DayPlan | undefined // undefined = no plan yet today
  lastActive: string | undefined // latest day before today with a finished quest
}

// undefined while loading.
export function usePlan(todayKey: string): PlanState | undefined {
  return useLiveQuery(async () => {
    const [plan, last] = await Promise.all([
      getPlan(todayKey),
      db.questCompletions.where('dayKey').below(todayKey).filter((c) => !c.deletedAt).last(),
    ])
    // The dayKey index orders by day, so the last live row below today is the latest active day.
    return { plan, lastActive: last?.dayKey }
  }, [todayKey])
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
