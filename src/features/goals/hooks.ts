import { useLiveQuery } from 'dexie-react-hooks'
import type { CheckIn, Goal, Milestone } from '../../db/types'
import { liveCheckIns, liveGoals, liveMilestones } from './repo'

export function useGoals(): Goal[] | undefined {
  return useLiveQuery(() => liveGoals())
}

export function useCheckIns(goalId: string): CheckIn[] {
  return useLiveQuery(() => liveCheckIns(goalId), [goalId]) ?? []
}

export function useMilestones(goalId: string): Milestone[] {
  return useLiveQuery(() => liveMilestones(goalId), [goalId]) ?? []
}
