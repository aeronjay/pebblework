import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Task } from '../../db/types'
import { arrayMove } from '../board/components/model'
import { useToast } from '../quests/components/toastContext'
import { CATEGORY } from '../quests/meta'
import { DueControl } from './DatePopover'
import { createTask, deleteTask, reorderLooseEnds, toggleTask, updateTask } from './repo'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'
const TICK_MS = 240

// One card, one list: quick reminders that sit outside the quest loop. The list scrolls inside its own height so Home's
// quest list keeps its room; every loose end stays reachable. Two columns when the card is wide enough.
export function LooseEnds({ tasks, todayKey }: { tasks: Task[] | undefined; todayKey: string }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<string>()
  const [dragId, setDragId] = useState<string | null>(null)
  // Optimistic order until the live query catches up (same `tasks` array = not yet).
  const [order, setOrder] = useState<{ ids: string[]; base: Task[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const open = tasks?.filter((task) => !task.completedAt) ?? []
  const byId = new Map(open.map((task) => [task.id, task]))
  const shown = order && order.base === tasks ? order.ids.map((id) => byId.get(id)).filter((task): task is Task => !!task) : open
  const ids = shown.map((task) => task.id)
  const dragged = dragId ? byId.get(dragId) : undefined

  async function add() {
    const value = title.trim()
    if (!value) return
    setTitle('')
    setDueDate(undefined)
    await toast.run(() => createTask({ title: value, dueDate }))
    input.current?.focus()
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setDragId(null)
    if (!over || active.id === over.id || !tasks) return
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    setOrder({ ids: next, base: tasks })
    const ok = await toast.run(async () => {
      await reorderLooseEnds(next)
      return true
    })
    if (!ok) setOrder(null)
  }

  function remove(index: number, id: string) {
    // Keep focus in the list: next row's checkbox, else previous, else the add input.
    const rows = list.current?.querySelectorAll<HTMLElement>('[data-tick]')
    const target = rows?.[index + 1] ?? rows?.[index - 1] ?? input.current
    void toast.run(() => deleteTask(id)).then(() => target?.focus())
  }

  const name = (id: unknown) => byId.get(String(id))?.title ?? 'loose end'
  const place = (id: unknown) => `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up “${name(active.id)}”.`,
    onDragOver: ({ active, over }) => (over ? `“${name(active.id)}” is at ${place(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped “${name(active.id)}” at ${place(over.id)}.` : `Dropped “${name(active.id)}”.`),
    onDragCancel: ({ active }) => `Cancelled. “${name(active.id)}” stays where it was.`,
  }

  return (
    <div className="@container min-w-0 rounded-card border border-line bg-surface">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
        className="flex items-start gap-1.5 border-b border-line px-3 py-2"
      >
        <Plus aria-hidden className="mt-1.5 size-4 shrink-0 text-faint" strokeWidth={1.75} />
        <input
          ref={input}
          value={title}
          maxLength={200}
          aria-label="Add a loose end"
          placeholder="Add a loose end"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && title) {
              e.stopPropagation()
              setTitle('')
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
        />
        <DueControl value={dueDate} todayKey={todayKey} name="this loose end" onChange={(v) => setDueDate(v ?? undefined)} />
        {title.trim() && (
          <button type="submit" className={`h-7 shrink-0 rounded-md px-2 text-[13px] font-medium text-ink transition hover:bg-sunken ${focus}`}>
            Add
          </button>
        )}
      </form>

      {tasks === undefined ? (
        <div aria-hidden className="m-3 h-7 animate-pulse rounded-control bg-sunken motion-reduce:animate-none" />
      ) : shown.length === 0 ? (
        <p className="px-4 py-3 text-[14px] text-muted">No loose ends. Add anything you don’t want to forget.</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setDragId(String(active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragId(null)}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: 'Press Space to pick up a loose end, arrow keys to move it, Space to drop, Escape to cancel.' },
          }}
        >
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <ul ref={list} className="grid max-h-[320px] grid-cols-1 gap-x-3 overflow-y-auto p-1.5 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-16px),transparent)] [scrollbar-width:thin] tall:max-h-[216px] @2xl:grid-cols-2">
              {shown.map((task, i) => (
                <Row
                  key={task.id}
                  task={task}
                  todayKey={todayKey}
                  onTick={() => void toast.run(() => toggleTask(task.id))}
                  onDue={(dueDate) => void toast.run(() => updateTask(task.id, { dueDate }))}
                  onDelete={() => remove(i, task.id)}
                />
              ))}
            </ul>
          </SortableContext>
          {/* Portaled so the held row isn't clipped by the list's scroll area. */}
          {createPortal(
            <DragOverlay zIndex={60}>
              {dragged ? (
                <div className="flex cursor-grabbing items-start gap-2 rounded-[10px] bg-elevated px-3 py-1 text-[14px] leading-5 text-ink shadow-pop ring-1 ring-line-strong">
                  <GripVertical aria-hidden className="mt-0.5 size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
                  <span className="[overflow-wrap:anywhere]">{dragged.title}</span>
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}
    </div>
  )
}

interface RowProps {
  task: Task
  todayKey: string
  onTick: () => void
  onDue: (dueDate: string | null) => void
  onDelete: () => void
}

function Row({ task, todayKey, onTick, onDue, onDelete }: RowProps) {
  const reduce = useReducedMotion()
  const { ticked, tick } = useTick(onTick)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: task.id })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: reduce ? undefined : transition }}
      className={`group/row flex min-w-0 items-start gap-1 rounded-[10px] py-0.5 pr-0.5 hover:bg-sunken/60 ${isDragging ? 'opacity-30' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-roledescription="draggable loose end"
        aria-label={`Reorder “${task.title}”`}
        className={`grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-faint opacity-0 transition group-hover/row:opacity-100 focus-visible:opacity-100 active:cursor-grabbing pointer-coarse:opacity-50 ${focus}`}
      >
        <GripVertical aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
      <TickBox ticked={ticked} label={task.title} onClick={tick} />
      <span className={titleClass(ticked)}>{task.title}</span>
      <DueControl value={task.dueDate} todayKey={todayKey} name={task.title} quiet onChange={onDue} />
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete “${task.title}”`}
        className={`grid size-7 shrink-0 place-items-center rounded-md text-faint opacity-0 transition group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-sunken hover:text-danger-ink pointer-coarse:opacity-60 ${focus}`}
      >
        <X aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
    </li>
  )
}

// One of the top loose ends, kept in view on Home's In progress tab. Keyed by task id, so each keeps its own tick as the list moves up.
export function NextLooseEnd({ task, todayKey }: { task: Task; todayKey: string }) {
  const toast = useToast()
  const { ticked, tick } = useTick(() => void toast.run(() => toggleTask(task.id)))

  return (
    <div role="group" aria-label="Next loose end" className="group/row mt-2 flex min-w-0 items-start gap-1 rounded-card border border-line bg-surface py-1 pr-1.5 pl-3">
      <TickBox ticked={ticked} label={task.title} onClick={tick} />
      <span className={titleClass(ticked)}>{task.title}</span>
      <DueControl value={task.dueDate} todayKey={todayKey} name={task.title} quiet onChange={(dueDate) => void toast.run(() => updateTask(task.id, { dueDate }))} />
    </div>
  )
}

function useTick(onTick: () => void) {
  const reduce = useReducedMotion()
  const [ticked, setTicked] = useState(false)

  function tick() {
    if (ticked) return
    setTicked(true)
    // Let the check land before the row leaves the list.
    if (reduce) onTick()
    else setTimeout(onTick, TICK_MS)
  }

  return { ticked, tick }
}

function titleClass(ticked: boolean) {
  return `ml-1.5 min-w-0 flex-1 py-1 text-[14px] leading-5 [overflow-wrap:anywhere] ${ticked ? 'text-faint line-through decoration-line-strong' : 'text-ink'}`
}

export function TickBox({ ticked, label, onClick }: { ticked: boolean; label: string; onClick: () => void }) {
  const reduce = useReducedMotion()
  const color = CATEGORY.sq.color // Finishing one drops a side-quest stone.

  return (
    <button
      type="button"
      role="checkbox"
      data-tick
      aria-checked={ticked}
      aria-label={label}
      onClick={onClick}
      className="relative mt-[5px] grid size-[18px] shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border-[1.5px] transition-colors duration-150"
        style={{ borderColor: ticked ? color : 'var(--color-line-strong)', backgroundColor: ticked ? color : 'transparent' }}
      />
      <svg aria-hidden viewBox="0 0 24 24" className="relative size-3" fill="none">
        <motion.path
          d="M5.5 12.5l4.2 4.2L18.5 7.8"
          stroke="rgb(12 13 16 / 0.86)"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: ticked ? 1 : 0, opacity: ticked ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 24 }}
        />
      </svg>
    </button>
  )
}
