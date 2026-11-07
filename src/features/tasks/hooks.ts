import { useLiveQuery } from 'dexie-react-hooks'
import { listTasks } from './repo'

export function useTasks() {
  return useLiveQuery(() => listTasks())
}
