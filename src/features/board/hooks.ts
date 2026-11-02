import { useLiveQuery } from 'dexie-react-hooks'
import { loadBoard, loadProjects, type BoardState, type ProjectSummary } from './repo'

export type { BoardState, ProjectSummary }

// undefined while loading; null when the quest is missing, deleted, or not a project.
export function useBoard(questId: string): BoardState | null | undefined {
  return useLiveQuery(() => loadBoard(questId), [questId])
}

// Live project quests (complete ones included). undefined while loading.
export function useProjects(): ProjectSummary[] | undefined {
  return useLiveQuery(() => loadProjects())
}
