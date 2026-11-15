import { createContext, useContext } from 'react'
import type { Identity } from '../../db/types'

// Live goals by id, so a quest row can name what it's for without each row querying. Empty outside a provider.
const EMPTY: ReadonlyMap<string, Identity> = new Map()

export const GoalsContext = createContext<ReadonlyMap<string, Identity>>(EMPTY)

export function useGoalOf(identityId: string | undefined): Identity | undefined {
  const goals = useContext(GoalsContext)
  return identityId ? goals.get(identityId) : undefined
}
