import type { MarbleReason } from '../../db/types'

// Single place to tune how many marbles each kind of progress is worth.
export const MARBLE_VALUES: Record<Exclude<MarbleReason, 'streak' | 'starter'>, number> = {
  checkin: 1,
  chunk: 1,
  milestone: 3,
  goal_complete: 10,
  weekly_review: 1,
}

export const RARITY_ODDS = { mythic: 0.01, golden: 0.05 }

export const STARTER_MARBLES = 3
