import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useProjects } from '../../board/hooks'
import { arrayMove } from '../../board/components/model'
import type { QuestCategory } from '../../../db/types'
import type { QuestItem, QuestToday } from '../hooks'
import { CATEGORY, CATEGORY_ORDER } from '../meta'
import { placeQuest } from '../repo'
import { isCategory, listOf, listsOf, moveTo, refusal, type Lists } from './lists'
import { QuestSection } from './QuestSection'
import { useToast } from './toastContext'

const OPEN_KEY = 'quests:open-sections'

function readOpen(): Record<QuestCategory, boolean> {
  const all = { dq: true, mq: true, sq: true }
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    return raw ? { ...all, ...JSON.parse(raw) } : all
  } catch {
    return all
  }
}

interface Props {
  today: QuestToday
  onAdd: (category: QuestCategory) => void
  onEdit: (item: QuestItem) => void
}

// The DQ / MQ / SQ accordions. Any number can be open; the choice is remembered per device.
// Quests drag to reorder within a list, and main and side quests can be dragged into each other's list.
export function QuestLists({ today, onAdd, onEdit }: Props) {
  const [open, setOpen] = useState(readOpen)
  const toast = useToast()
  const summaries = useProjects()
  const projects = useMemo(() => (summaries ? new Map(summaries.map((p) => [p.quest.id, p])) : undefined), [summaries])
  const lookup = useMemo(() => new Map(today.items.map((i) => [i.quest.id, i])), [today.items])

  // Drag state: the lists as they look mid-drag, then held after the drop until the live query catches up
  // (same `items` array = not yet).
  const [activeId, setActiveId] = useState<string | null>(null)
  const [held, setHeld] = useState<{ lists: Lists; base: QuestItem[] } | null>(null)
  const natural = useMemo(() => listsOf(today.items), [today.items])
  const pending = !!held && (!!activeId || held.base === today.items)
  const lists = pending && held ? held.lists : natural
  // Mirror for dnd-kit callbacks (collision detection and drop run outside React's render cycle).
  const listsRef = useRef(lists)
  useLayoutEffect(() => {
    listsRef.current = lists
  })

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // A quest under the pointer wins; over a list (its header, gaps, or when collapsed/empty) its nearest quest, else the
  // list itself (= drop at its end).
  const collision: CollisionDetection = useCallback((args) => {
    const hits = pointerWithin(args)
    const pool = hits.length ? hits : closestCorners(args)
    const item = pool.find((c) => !isCategory(c.id))
    if (item) return [item]
    const list = pool[0]
    if (!list) return []
    const ids = listsRef.current[list.id as QuestCategory] ?? []
    const near = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => ids.includes(String(c.id))) })[0]
    return [near ?? list]
  }, [])

  function toggle(c: QuestCategory) {
    setOpen((prev) => {
      const next = { ...prev, [c]: !prev[c] }
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next))
      } catch {
        // Private mode etc.: still works for this session.
      }
      return next
    })
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
    setHeld({ lists: natural, base: today.items })
  }

  // Crossing into another list happens live, so the rows there make room for it.
  function onDragOver({ active, over }: DragOverEvent) {
    const item = lookup.get(String(active.id))
    if (!over || !item) return
    const id = item.quest.id
    const overId = String(over.id)
    setHeld((h) => {
      if (!h) return h
      const from = listOf(h.lists, id)
      const to = listOf(h.lists, overId)
      if (!from || !to || from === to || refusal(item, to)) return h
      let index = h.lists[to].length
      if (!isCategory(overId)) {
        const r = active.rect.current.translated
        const below = r && r.top > over.rect.top + over.rect.height / 2
        index = h.lists[to].indexOf(overId) + (below ? 1 : 0)
      }
      return { ...h, lists: moveTo(h.lists, id, to, index) }
    })
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    const item = lookup.get(String(active.id))
    const cur = listsRef.current
    if (!over || !item) return setHeld(null)
    const id = item.quest.id
    const overId = String(over.id)
    const to = listOf(cur, id)
    if (!to) return setHeld(null)

    const overList = listOf(cur, overId)
    if (overList && overList !== to) {
      const why = refusal(item, overList)
      if (why) toast.show(why, 'info')
    }

    let list = cur[to]
    if (overList === to && !isCategory(overId) && overId !== id) list = arrayMove(list, list.indexOf(id), list.indexOf(overId))
    const before = list[list.indexOf(id) + 1] ?? null
    const unchanged = to === item.quest.category && natural[to].join() === list.join()
    if (unchanged) return setHeld(null)

    setHeld({ lists: { ...cur, [to]: list }, base: today.items })
    const ok = await toast.run(async () => {
      await placeQuest(id, to, before)
      return true
    })
    if (!ok) setHeld(null)
  }

  function onDragCancel() {
    setActiveId(null)
    setHeld(null)
  }

  const active = activeId ? lookup.get(activeId) : undefined
  const activeList = activeId ? listOf(lists, activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press Space to pick up a quest, arrow keys to move it, Space to drop, Escape to cancel. Main and side quests can move between their lists.',
        },
      }}
    >
      <div className="flex flex-col gap-6">
        {CATEGORY_ORDER.map((c) => (
          <QuestSection
            key={c}
            category={c}
            items={today.items.filter((i) => i.quest.category === c)}
            ids={lists[c]}
            lookup={lookup}
            sorting={!!activeId || pending}
            dropTarget={!!active && activeList === c && active.quest.category !== c}
            todayKey={today.todayKey}
            claimed={today.claimed}
            open={open[c]}
            onToggle={() => toggle(c)}
            onAdd={() => onAdd(c)}
            onEdit={onEdit}
            projects={projects}
          />
        ))}
      </div>
      {createPortal(
        <DragOverlay zIndex={60}>{active && <DragPreview item={active} list={activeList ?? active.quest.category} />}</DragOverlay>,
        document.body,
      )}
    </DndContext>
  )
}

// What follows the pointer: the quest, wearing the stone of the list it would land in.
function DragPreview({ item, list }: { item: QuestItem; list: QuestCategory }) {
  const meta = CATEGORY[list]
  return (
    <div className="flex h-full min-h-[46px] cursor-grabbing items-center gap-3 rounded-control bg-elevated px-3 py-2.5 shadow-pop ring-1 ring-line-strong">
      <meta.Icon aria-hidden className="size-[22px] shrink-0" />
      <span className="min-w-0 truncate text-[15px] font-medium text-ink">{item.quest.title}</span>
    </div>
  )
}
