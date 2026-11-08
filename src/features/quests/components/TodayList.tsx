import { ChevronDown, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import type { PlanSlot, Task } from '../../../db/types'
import { useNow } from '../../plan/hooks'
import { nextSlot, orderByPlan, slotKey } from '../../plan/model'
import { retimeSlot } from '../../plan/repo'
import { useTasks } from '../../tasks/hooks'
import { PlannedTaskRow } from '../../tasks/PlannedTaskRow'
import type { QuestItem } from '../hooks'
import { todayItems } from './lists'
import type { ProjectSummary } from '../../board/hooks'
import { isProject } from '../day'
import { ProjectRow } from './ProjectRow'
import { QuestRow, type RowPlan } from './QuestRow'
import { useToast } from './toastContext'

interface Props {
  items: QuestItem[] // every live quest, sorted by category then order
  todayKey: string
  claimed: boolean
  onAdd: () => void
  onEdit: (item: QuestItem) => void
  onBrowse: () => void // open the stacked lists (for undated side quests etc.)
  slots: PlanSlot[] // today's plan, by time
  projects?: Map<string, ProjectSummary> // board summaries, for planned projects
}

// Every list's quests for today in one short list (category order, then each list's own order; reorder on a list's tab).
// Finished quests fold into a quiet "N done today" line so the list shrinks as the day goes. One finished while this
// view is open stays in place (its check animates and it can still be unticked) until the view is left or reloaded.
export function TodayList({ items, todayKey, claimed, onAdd, onEdit, onBrowse, slots, projects }: Props) {
  const reduce = useReducedMotion()
  const [showDone, setShowDone] = useState(false)
  const toast = useToast()
  const now = useNow()
  const tasks = useTasks()
  // Planned quests (incl. undated ones and projects picked for today) lead, by start time; the rest keep their list order.
  const plannedIds = new Set(slots.flatMap((s) => (s.questId ? [s.questId] : [])))
  const base = todayItems(items)
  const inBase = new Set(base.map((i) => i.quest.id))
  const day = orderByPlan([...base, ...items.filter((i) => plannedIds.has(i.quest.id) && !inBase.has(i.quest.id))], slots)
  const next = nextSlot(slots, items, tasks)
  const planOf = (slot: PlanSlot): RowPlan => ({
    slot,
    next: !!next && slotKey(next) === slotKey(slot),
    now,
    onRetime: (time) => void toast.run(() => retimeSlot(todayKey, slotKey(slot), time)),
  })
  const planFor = (item: QuestItem): RowPlan | undefined => {
    const slot = slots.find((s) => s.questId === item.quest.id)
    return slot ? planOf(slot) : undefined
  }
  // Loose ends in the plan sit among the planned quests, at their times.
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t]))
  const plannedTasks = slots.flatMap((slot) => (slot.taskId && taskById.has(slot.taskId) ? [{ slot, task: taskById.get(slot.taskId)! }] : []))
  // Ids seen open in this view; it only grows. Updated during render (React's "adjusting state when props change"),
  // so a quest that turns done is already known and stays put instead of folding away under its check animation.
  const [seenOpen, setSeenOpen] = useState(() => new Set(day.filter((i) => !i.done).map((i) => i.quest.id)))
  const unseen = day.filter((i) => !i.done && !seenOpen.has(i.quest.id))
  if (unseen.length) setSeenOpen((prev) => new Set([...prev, ...unseen.map((i) => i.quest.id)]))
  const shown = day.filter((i) => !i.done || seenOpen.has(i.quest.id))
  const folded = day.filter((i) => i.done && !seenOpen.has(i.quest.id))
  const byQuest = new Map(shown.map((i) => [i.quest.id, i]))
  type Entry = { kind: 'quest'; item: QuestItem } | { kind: 'task'; task: Task; slot: PlanSlot }
  const rows: Entry[] = [
    ...slots.flatMap((slot): Entry[] => {
      if (slot.questId) return byQuest.has(slot.questId) ? [{ kind: 'quest', item: byQuest.get(slot.questId)! }] : []
      const t = plannedTasks.find((p) => p.slot === slot)
      return t ? [{ kind: 'task', ...t }] : []
    }),
    ...shown.filter((i) => !plannedIds.has(i.quest.id)).map((item): Entry => ({ kind: 'quest', item })),
  ]

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, bounce: 0, duration: 0.42 }
  const fade = reduce ? { duration: 0 } : { duration: 0.2 }

  return (
    <div className="rounded-card border border-line bg-surface px-1.5 pt-1.5 pb-2 sm:px-2">
      {day.length === 0 && plannedTasks.length === 0 ? (
        <div className="px-3 pt-5 pb-4 text-center">
          <p className="font-display text-[17px] font-normal text-ink">Nothing due today</p>
          <p className="mx-auto mt-1 max-w-[34ch] text-[13px] leading-relaxed text-muted">
            A free day. Pick something from{' '}
            <button type="button" onClick={onBrowse} className={link}>
              your lists
            </button>{' '}
            or add a quest.
          </p>
        </div>
      ) : (
        <>
          {rows.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-muted">
              <span className="font-semibold text-ink">Everything for today is done.</span> Claim it on the calendar.
            </p>
          )}
          <ul>
            <AnimatePresence initial={false}>
              {rows.map((row) => {
                if (row.kind === 'task') return <PlannedTaskRow key={`t:${row.task.id}`} task={row.task} todayKey={todayKey} plan={planOf(row.slot)} />
                const { item } = row
                return isProject(item.quest) ? (
                  <ProjectRow key={item.quest.id} item={item} summary={projects?.get(item.quest.id)} todayKey={todayKey} onEdit={() => onEdit(item)} plan={planFor(item)} />
                ) : (
                  <QuestRow key={item.quest.id} item={item} todayKey={todayKey} claimed={claimed} onEdit={() => onEdit(item)} showCategory plan={planFor(item)} />
                )
              })}
            </AnimatePresence>
          </ul>
        </>
      )}

      <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
        <button
          type="button"
          onClick={onAdd}
          className="group/add inline-flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-[22px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong transition group-hover/add:border-solid group-hover/add:border-current">
            <Plus aria-hidden className="size-3" strokeWidth={2.25} />
          </span>
          Add a quest
        </button>
        {folded.length > 0 && (
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {folded.length} done today
            <motion.span aria-hidden animate={{ rotate: showDone ? 180 : 0 }} transition={spring} className="grid">
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            </motion.span>
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showDone && folded.length > 0 && (
          <motion.ul
            key="done"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: spring, opacity: fade }}
            className="mt-1 overflow-hidden border-t border-dashed border-line pt-1"
          >
            {folded.map((item) => (
              <QuestRow key={item.quest.id} item={item} todayKey={todayKey} claimed={claimed} onEdit={() => onEdit(item)} showCategory plan={planFor(item)} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

const link =
  'rounded-sm font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink outline-none focus-visible:ring-2 focus-visible:ring-ring'
