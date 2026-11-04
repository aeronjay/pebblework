import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, GripVertical } from 'lucide-react'
import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { href } from '../../app/router'
import { arrayMove } from '../board/components/model'
import { useInProgress, type InProgressItem } from '../board/hooks'
import { reorderInProgress } from '../board/repo'
import { useToast } from '../quests/components/toastContext'
import { deadlineOf, type DeadlineTone } from '../projects/model'
import { CATEGORY } from '../quests/meta'

const TONE: Record<DeadlineTone, string> = {
  calm: 'text-muted',
  soon: 'text-mq-ink',
  late: 'text-danger-ink',
}

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Cards sitting in a middle column of an open project board: work already started, kept in view on Home.
// One horizontally scrolling row at every size, so it never pushes the quest list around. Each card has a grip to
// drag it into the user's own order, which stays as arranged (new cards join at the end).
export function InProgressStrip({ todayKey }: { todayKey: string }) {
  const items = useInProgress()
  const titleId = useId()
  const toast = useToast()
  // Optimistic order until the live query catches up (same `items` array = not yet).
  const [order, setOrder] = useState<{ ids: string[]; base: InProgressItem[] } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Reserve the row's height while loading so nothing jumps.
  if (!items) return <div aria-hidden className="h-[24px]" />

  const byId = new Map(items.map((i) => [i.card.id, i]))
  const pending = !!order && order.base === items
  const shown = pending && order ? order.ids.map((id) => byId.get(id)).filter((i): i is InProgressItem => !!i) : items
  const ids = shown.map((i) => i.card.id)
  const dragged = dragId ? byId.get(dragId) : undefined

  async function onDragEnd({ active, over }: DragEndEvent) {
    setDragId(null)
    if (!over || active.id === over.id || !items) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(ids, from, to)
    setOrder({ ids: next, base: items })
    const ok = await toast.run(async () => {
      await reorderInProgress(next)
      return true
    })
    if (!ok) setOrder(null)
  }

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        {/* The trail blaze: where today's attention goes first. */}
        <span aria-hidden className="size-2 rounded-full bg-blaze" />
        In progress
        {items.length > 0 && <span className="font-normal text-muted tabular-nums">{items.length}</span>}
      </h2>

      {items.length === 0 ? (
        <p className="mt-1.5 text-[14px] leading-snug text-muted">
          Nothing started yet. Move a card to In progress on a{' '}
          <a href={href.projects} className={`rounded-sm font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink ${focus}`}>
            project board
          </a>{' '}
          and it shows up here.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setDragId(String(active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragId(null)}
          accessibility={{
            screenReaderInstructions: {
              draggable: 'Press Space to pick up a card, arrow keys to move it, Space to drop, Escape to cancel.',
            },
          }}
        >
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {/* Scroll snapping fights the drag's auto-scroll, so it's off while a card is held. */}
            <ul
              className={`-mx-4 mt-3 flex scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 md:-mx-1 md:scroll-px-1 md:px-1 [scrollbar-width:thin] ${dragId ? '' : 'snap-x snap-mandatory'}`}
            >
              {shown.map((item) => (
                <SortableItem key={item.card.id} item={item} todayKey={todayKey} />
              ))}
            </ul>
          </SortableContext>
          {createPortal(
            <DragOverlay zIndex={60}>
              {dragged ? (
                <div className="w-[236px] rotate-[1.5deg] cursor-grabbing rounded-card shadow-pop">
                  <Item item={dragged} todayKey={todayKey} />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}
    </section>
  )
}

// One card plus a grip (outside the card's link, so a click still opens the board) to drag it to a new place.
function SortableItem({ item, todayKey }: { item: InProgressItem; todayKey: string }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: item.card.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group/cell relative w-[236px] shrink-0 snap-start ${isDragging ? 'opacity-40' : ''}`}
    >
      <Item item={item} todayKey={todayKey} />
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-roledescription="draggable card"
        aria-label={`Reorder “${item.card.title}”`}
        className={`absolute top-2 right-1.5 z-10 grid h-7 w-5 cursor-grab touch-none place-items-center rounded-md text-faint opacity-0 transition group-hover/cell:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 active:cursor-grabbing pointer-coarse:opacity-60 ${focus}`}
      >
        <GripVertical aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
    </li>
  )
}

function Item({ item: { card, column, quest, subtasks }, todayKey }: { item: InProgressItem; todayKey: string }) {
  const meta = CATEGORY[quest.category]
  const due = deadlineOf(card.dueDate, todayKey, false)
  const stage = column.title.trim().toLowerCase() === 'in progress' ? undefined : column.title
  const pct = subtasks.total ? subtasks.done / subtasks.total : 0
  return (
    <a
      href={href.board(quest.id)}
      aria-label={[
        card.title,
        `in ${quest.title}`,
        stage && `column ${stage}`,
        subtasks.total > 0 && `${subtasks.done} of ${subtasks.total} subtasks done`,
        due?.label,
        'Open board',
      ]
        .filter(Boolean)
        .join(', ')}
      className={`flex h-full min-h-[96px] flex-col rounded-card border border-line bg-surface p-3.5 transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focus}`}
    >
      {/* Right padding keeps the stage label clear of the reorder grip. */}
      <span className="flex min-w-0 items-center gap-1.5 pr-4 text-[12.5px] text-muted">
        <meta.Icon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{quest.title}</span>
        {stage && <span className="shrink-0 text-faint">in {stage}</span>}
      </span>
      <span className="mt-1.5 line-clamp-2 text-[15px] leading-snug font-medium text-ink">{card.title}</span>
      <span className="mt-auto flex items-center gap-3 pt-2.5 text-[12.5px] text-muted">
        {subtasks.total > 0 && (
          <span className="flex min-w-0 flex-1 items-center gap-2 tabular-nums">
            <span aria-hidden className="h-1 min-w-0 flex-1 overflow-hidden rounded-chip bg-ink/10">
              <span className="block h-full rounded-chip" style={{ width: `${pct * 100}%`, background: meta.color }} />
            </span>
            {subtasks.done}/{subtasks.total}
          </span>
        )}
        {due && (
          <span className={`inline-flex shrink-0 items-center gap-1 ${TONE[due.tone]}`}>
            <CalendarClock aria-hidden className="size-3.5" strokeWidth={1.75} />
            {due.label}
          </span>
        )}
      </span>
    </a>
  )
}
