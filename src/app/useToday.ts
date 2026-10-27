import { startOfDay } from 'date-fns'
import { useEffect, useState } from 'react'

// Current day that rolls over at midnight and when the app is reopened.
export function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()))

  useEffect(() => {
    const refresh = () => {
      const now = startOfDay(new Date())
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now))
    }
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return today
}
