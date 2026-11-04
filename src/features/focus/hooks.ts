import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { FocusSession } from '../../db/types'
import { activeSession, listSessions } from './repo'

// The open session: null when there's none, undefined while loading.
export function useActiveSession(): FocusSession | null | undefined {
  return useLiveQuery(async () => (await activeSession()) ?? null)
}

// Finished sessions, newest first. undefined while loading.
export function useFocusSessions(): FocusSession[] | undefined {
  return useLiveQuery(() => listSessions())
}

// The current time, ticking every second while `live`.
export function useNow(live: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [live])
  return now
}
