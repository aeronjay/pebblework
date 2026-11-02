import { useLiveQuery } from 'dexie-react-hooks'
import type { Note } from '../../db/types'
import { listNotes } from './repo'

// Live notes, pinned first then most recently edited. undefined while loading.
export function useNotes(): Note[] | undefined {
  return useLiveQuery(() => listNotes())
}
