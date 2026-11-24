import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { allQuests, liveCompletions } from '../quests/repo'
import { buildHistory, type HistoryRow } from './model'

// The promise history, newest day first. undefined while loading.
export function usePromiseHistory(todayKey: string): HistoryRow[] | undefined {
  return useLiveQuery(async () => {
    const [plans, completions, quests, cards, tasks] = await Promise.all([
      db.dayPlans.toArray(),
      liveCompletions(),
      allQuests(),
      db.cards.toArray(),
      db.tasks.where('completedAt').above('').toArray(),
    ])
    return buildHistory({ todayKey, plans, completions, quests, cards, tasks })
  }, [todayKey])
}
