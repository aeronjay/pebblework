import { differenceInCalendarDays, formatDistanceStrict } from 'date-fns'
import type { QuestCategory } from '../../db/types'
import type { ProjectSummary } from '../board/hooks'
import { parseDayKey } from '../quests/day'
import { formatDay } from '../quests/components/describe'

export type ProjectFilter = 'all' | QuestCategory

export const FILTERS: { id: ProjectFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mq', label: 'Main' },
  { id: 'sq', label: 'Side' },
]

// Open projects first, then completed ones. Within each group, the user's manual order (projectOrder) comes first;
// projects never placed by hand follow: open ones most recently touched first, completed ones most recently finished.
export function sortProjects(list: ProjectSummary[]): ProjectSummary[] {
  const touched = (p: ProjectSummary) => p.lastActivity ?? p.quest.updatedAt
  return [...list].sort((a, b) => {
    const da = a.quest.projectDoneAt
    const db = b.quest.projectDoneAt
    if (!!da !== !!db) return da ? 1 : -1
    const oa = a.quest.projectOrder
    const ob = b.quest.projectOrder
    if (oa !== undefined || ob !== undefined) {
      if (oa === undefined) return 1
      if (ob === undefined) return -1
      if (oa !== ob) return oa - ob
    }
    if (da && db) return db.localeCompare(da)
    return touched(b).localeCompare(touched(a))
  })
}

// After dragging within the shown (maybe filtered) subset: the full order, with the shown projects' slots refilled
// in their new order and every other project left where it was.
export function mergeShownOrder(fullIds: string[], shownIds: string[]): string[] {
  const shown = new Set(shownIds)
  let i = 0
  return fullIds.map((id) => (shown.has(id) ? shownIds[i++] : id))
}

// Archived projects sit apart from the grid, most recently archived first.
export function splitArchived(list: ProjectSummary[]): { active: ProjectSummary[]; archived: ProjectSummary[] } {
  const archived = list.filter((p) => p.quest.archivedAt).sort((a, b) => b.quest.archivedAt!.localeCompare(a.quest.archivedAt!))
  return { active: list.filter((p) => !p.quest.archivedAt), archived }
}

export function filterProjects(list: ProjectSummary[], filter: ProjectFilter): ProjectSummary[] {
  return filter === 'all' ? list : list.filter((p) => p.quest.category === filter)
}

export type DeadlineTone = 'calm' | 'soon' | 'late'

export interface Deadline {
  label: string // "Due Fri", "Due today", "3 days late"
  tone: DeadlineTone
}

// Display only: a project's deadline never blocks a day.
export function deadlineOf(dueDate: string | undefined, todayKey: string, done: boolean): Deadline | undefined {
  if (!dueDate || done) return undefined
  const diff = differenceInCalendarDays(parseDayKey(dueDate), parseDayKey(todayKey))
  if (diff < 0) return { label: diff === -1 ? '1 day late' : `${-diff} days late`, tone: 'late' }
  if (diff === 0) return { label: 'Due today', tone: 'soon' }
  return { label: `Due ${formatDay(dueDate, todayKey)}`, tone: diff <= 3 ? 'soon' : 'calm' }
}

// "Updated 2 hours ago" / "Updated just now".
export function activityLabel(iso: string | undefined, now: Date = new Date()): string | undefined {
  if (!iso) return undefined
  const then = new Date(iso)
  if (now.getTime() - then.getTime() < 60_000) return 'Updated just now'
  return `Updated ${formatDistanceStrict(then, now, { addSuffix: true })}`
}

export function stagesLabel(done: number, total: number): string {
  if (!total) return 'No stages yet'
  return `${done}/${total} ${total === 1 ? 'stage' : 'stages'}`
}
