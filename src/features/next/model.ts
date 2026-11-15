// "Next up": Home names one thing to do now, so opening the app never starts with choosing from five lists.
// Pure rules; the order below is the whole policy.
import type { PlanSlot, Task } from '../../db/types'
import type { InProgressItem } from '../board/repo'
import { formatTime, isHandled, minutesOf, slotKey } from '../plan/model'
import { isProject } from '../quests/day'
import type { QuestItem } from '../quests/hooks'

export const PLAN_LEAD_MIN = 30 // a planned slot becomes "next" this long before its time

export type NextPick =
  | { kind: 'quest'; key: string; title: string; reason: string; item: QuestItem; slot?: PlanSlot }
  | { kind: 'task'; key: string; title: string; reason: string; task: Task; slot?: PlanSlot }
  | { kind: 'card'; key: string; title: string; reason: string; card: InProgressItem }

export interface NextInput {
  now: Date
  todayKey: string
  items: QuestItem[] // every live quest, in list order
  slots: PlanSlot[] // today's live plan slots, by time
  tasks: Task[] // loose ends, in the user's order
  inProgress: InProgressItem[] // started board cards, in the user's order
}

// Everything that could be done now, most pressing first:
// 1. what you planned for about now (you already decided; a plan beats a fresh choice)
// 2. today's main quests, then daily quests, then side quests due today
// 3. board cards already started (finishing beats starting)
// 4. loose ends due today or late
// 5. what's planned for later today
// 6. undated quests, then the remaining loose ends
export function nextCandidates({ now, todayKey, items, slots, tasks, inProgress }: NextInput): NextPick[] {
  const minute = now.getHours() * 60 + now.getMinutes()
  const byQuest = new Map(items.map((i) => [i.quest.id, i]))
  const openTasks = tasks.filter((t) => !t.completedAt && !t.deletedAt)
  const byTask = new Map(openTasks.map((t) => [t.id, t]))

  const planned = (slot: PlanSlot): NextPick | undefined => {
    const reason = `Planned for ${formatTime(slot.time)}`
    if (slot.questId) {
      const item = byQuest.get(slot.questId)
      return item && !isHandled(item) ? { kind: 'quest', key: slotKey(slot), title: item.quest.title, reason, item, slot } : undefined
    }
    const task = slot.taskId ? byTask.get(slot.taskId) : undefined
    return task ? { kind: 'task', key: slotKey(slot), title: task.title, reason, task, slot } : undefined
  }
  const quest = (item: QuestItem, reason: string): NextPick => ({ kind: 'quest', key: `q:${item.quest.id}`, title: item.quest.title, reason, item })
  const loose = (task: Task, reason: string): NextPick => ({ kind: 'task', key: `t:${task.id}`, title: task.title, reason, task })
  const open = items.filter((i) => !i.done && i.canComplete && !isProject(i.quest))
  const dueToday = (c: string) => open.filter((i) => i.quest.category === c && i.when === 'today')

  const out: NextPick[] = [
    ...slots.filter((s) => minutesOf(s.time) <= minute + PLAN_LEAD_MIN).flatMap((s) => planned(s) ?? []),
    ...dueToday('mq').map((i) => quest(i, 'Main quest, due today')),
    ...dueToday('dq').map((i) => quest(i, 'Daily quest')),
    ...dueToday('sq').map((i) => quest(i, 'Side quest, due today')),
    ...inProgress.map((card): NextPick => ({ kind: 'card', key: `c:${card.card.id}`, title: card.card.title, reason: `Already started in ${card.quest.title}`, card })),
    ...openTasks.filter((t) => t.dueDate && t.dueDate <= todayKey).map((t) => loose(t, t.dueDate! < todayKey ? 'Loose end, overdue' : 'Loose end, due today')),
    ...slots.filter((s) => minutesOf(s.time) > minute + PLAN_LEAD_MIN).flatMap((s) => planned(s) ?? []),
    ...open.filter((i) => i.when === 'anytime').map((i) => quest(i, 'No date, whenever you’re ready')),
    ...openTasks.filter((t) => !t.dueDate || t.dueDate > todayKey).map((t) => loose(t, 'Loose end')),
  ]
  // Something given a later time waits for it: it's only offered in its planned place, not earlier as a plain quest.
  const later = new Set(slots.filter((s) => minutesOf(s.time) > minute + PLAN_LEAD_MIN).map(slotKey))
  const seen = new Set<string>()
  return out.filter((p) => (p.kind === 'card' || !!p.slot || !later.has(p.key)) && !seen.has(p.key) && !!seen.add(p.key))
}

// The first candidate the user hasn't waved off ("Not now") this visit.
export function pickNext(candidates: NextPick[], skipped: ReadonlySet<string>): NextPick | undefined {
  return candidates.find((c) => !skipped.has(c.key))
}

// The goal a pick works toward, if its quest (or the card's project) is linked to one.
export function goalIdOf(pick: NextPick): string | undefined {
  if (pick.kind === 'quest') return pick.item.quest.identityId
  if (pick.kind === 'card') return pick.card.quest.identityId
  return undefined
}
