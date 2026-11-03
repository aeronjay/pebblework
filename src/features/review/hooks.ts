import { useLiveQuery } from 'dexie-react-hooks'
import type { QuestCompletion, WeeklyReview } from '../../db/types'
import { completionsBetween } from '../quests/repo'
import { getReview, listReviews, weekEndKey } from './repo'

export interface ReviewWeek {
  weekStart: string
  review: WeeklyReview | null
  previous: WeeklyReview | null // the week before, for "last week's tweak"
  completions: QuestCompletion[]
}

// undefined while loading, including while switching weeks (a live query keeps its last result until the new one
// lands, which would seed the next week's form with the previous week's text).
export function useReviewWeek(weekStart: string, previousStart: string): ReviewWeek | undefined {
  const week = useLiveQuery(async (): Promise<ReviewWeek> => {
    const [review, previous, completions] = await Promise.all([
      getReview(weekStart),
      getReview(previousStart),
      completionsBetween(weekStart, weekEndKey(weekStart)),
    ])
    return { weekStart, review: review ?? null, previous: previous ?? null, completions }
  }, [weekStart, previousStart])
  return week?.weekStart === weekStart ? week : undefined
}

export function useReviews(): WeeklyReview[] | undefined {
  return useLiveQuery(() => listReviews())
}
