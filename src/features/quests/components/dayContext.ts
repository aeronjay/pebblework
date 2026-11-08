import { createContext, useContext } from 'react'

// How many quests today asks for are still open, so a row can tell when it's the last one (and offer to claim).
export const OpenTodayContext = createContext<number | null>(null)

export function useOpenToday(): number | null {
  return useContext(OpenTodayContext)
}
