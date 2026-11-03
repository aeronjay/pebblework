import { useLiveQuery } from 'dexie-react-hooks'
import { useToday } from '../../app/useToday'
import { dayKey } from '../quests/day'
import { allQuests, liveCompletions } from '../quests/repo'
import { buildIdentityViews, listIdentities, type IdentityView } from './repo'

// undefined while loading.
export function useIdentityViews(): IdentityView[] | undefined {
  const today = useToday()
  return useLiveQuery(async () => {
    const [identities, quests, completions] = await Promise.all([listIdentities(), allQuests(), liveCompletions()])
    return buildIdentityViews(identities, quests, completions, today)
  }, [dayKey(today)])
}

