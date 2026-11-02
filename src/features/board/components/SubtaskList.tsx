import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import type { Card, QuestCategory, Subtask } from '../../../db/types'
import { CATEGORY } from '../../quests/meta'
import { useToast } from '../../quests/components/toastContext'
import { addSubtask, deleteSubtask, moveSubtask, renameSubtask, toggleSubtask } from '../repo'
import { arrayMove } from './model'

export function SubtaskList({ card, category }: { card: Card; category: QuestCategory }) {
  const toast = useToast()
  const [order, setOrder] = useState<{ ids: string[]; base: Subtask[] } | null>(null)
  const [draft, setDraft] = useState('')
  const addInput = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Optimistic order until the live card catches up (same object = not yet).
  const subtasks =
    order && order.base === card.subtasks
      ? order.ids.map((id) => card.subtasks.find((s) => s.id === id)).filter((s): s is Subtask => !!s)
      : card.subtasks
  const ids = subtasks.map((s) => s.id)

  async function move(id: string, to: number) {
    const from = ids.indexOf(id)
    if (from < 0 || to < 0 || to >= ids.length || from === to) return
    setOrder({ ids: arrayMove(ids, from, to), base: card.subtasks })
    await toast.run(() => moveSubtask(card.id, id, to))
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    void move(String(active.id), ids.indexOf(String(over.id)))
  }

  async function add() {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await toast.run(() => addSubtask(card.id, title))
    addInput.current?.focus()
  }

  const name = (id: unknown) => subtasks.find((s) => s.id === id)?.title ?? 'subtask'
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up subtask “${name(active.id)}”.`,
    onDragOver: ({ active, over }) => (over ? `“${name(active.id)}” is at position ${ids.indexOf(String(over.id)) + 1} of ${ids.length}.` : undefined),
    onDragEnd: ({ active, over }) =>
      over ? `Dropped “${name(active.id)}” at position ${ids.indexOf(String(over.id)) + 1} of ${ids.length}.` : `Dropped “${name(active.id)}”.`,
    onDragCancel: ({ active }) => `Cancelled. “${name(active.id)}” stays where it was.`,
  }

  return (
    <div className="mt-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: 'Press Space to pick up a subtask, arrow keys to move it, Space to drop, Escape to cancel.' },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul ref={list} className="flex flex-col">
            {subtasks.map((s, i) => (
              <SubtaskRow
                key={s.id}
                subtask={s}
                category={category}
                first={i === 0}
                last={i === subtasks.length - 1}
                onToggle={() => toast.run(() => toggleSubtask(card.id, s.id))}
                onRename={(title) => toast.run(() => renameSubtask(card.id, s.id, title))}
                onMove={(dir) => move(s.id, i + dir)}
                onDelete={() => {
                  // Keep focus in the list: next row's checkbox, else previous, else the add input.
                  const rows = list.current?.querySelectorAll<HTMLElement>('[role="checkbox"]')
                  const target = rows?.[i + 1] ?? rows?.[i - 1] ?? addInput.current
                  void toast.run(() => deleteSubtask(card.id, s.id)).then(() => target?.focus())
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="mt-1 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 focus-within:bg-sunken/60">
        <Plus aria-hidden className="size-4 shrink-0 text-faint" strokeWidth={1.75} />
        <input
          ref={addInput}
          value={draft}
          maxLength={200}
          aria-label="Add a subtask"
          placeholder="Add a subtask"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
            if (e.key === 'Escape' && draft) {
              e.stopPropagation()
              setDraft('')
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
        />
        {draft.trim() && <span className="shrink-0 text-[11px] text-faint">Enter</span>}
      </div>
    </div>
  )
}

interface RowProps {
  subtask: Subtask
  category: QuestCategory
  first: boolean
  last: boolean
  onToggle: () => void
  onRename: (title: string) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}

const iconBtn =
  'grid size-7 shrink-0 place-items-center rounded-md text-faint transition outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30'

function SubtaskRow({ subtask, category, first, last, onToggle, onRename, onMove, onDelete }: RowProps) {
  const reduce = useReducedMotion()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(subtask.title)
  const titleBtn = useRef<HTMLButtonElement>(null)
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: subtask.id })
  const color = CATEGORY[category].color

  function finish(save: boolean) {
    setEditing(false)
    const t = draft.trim()
    if (save && t && t !== subtask.title) onRename(t)
    else setDraft(subtask.title)
    requestAnimationFrame(() => titleBtn.current?.focus())
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition: reduce ? undefined : transition }}
      className={`group/sub relative flex items-center gap-1 rounded-[10px] py-0.5 pr-0.5 pl-0 ${
        isDragging ? 'z-10 bg-elevated shadow-pop ring-1 ring-line-strong' : 'hover:bg-sunken/60'
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-roledescription="draggable subtask"
        aria-label={`Reorder “${subtask.title}”`}
        className="grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center rounded-md text-faint opacity-0 transition outline-none group-hover/sub:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing pointer-coarse:opacity-50"
      >
        <GripVertical aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={subtask.done}
        aria-label={subtask.title}
        onClick={onToggle}
        className="relative grid size-[18px] shrink-0 place-items-center rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-[6px] border-[1.5px] transition-colors duration-150"
          style={{ borderColor: subtask.done ? color : 'var(--color-line-strong)', backgroundColor: subtask.done ? color : 'transparent' }}
        />
        <svg aria-hidden viewBox="0 0 24 24" className="relative size-3" fill="none">
          <motion.path
            d="M5.5 12.5l4.2 4.2L18.5 7.8"
            stroke="rgb(12 13 16 / 0.86)"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: subtask.done ? 1 : 0, opacity: subtask.done ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 24 }}
          />
        </svg>
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={200}
          aria-label="Subtask title"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(true)
            if (e.key === 'Escape') {
              e.stopPropagation()
              finish(false)
            }
          }}
          className="ml-1.5 h-7 min-w-0 flex-1 rounded-md border border-ring/60 bg-surface px-1.5 text-[14px] text-ink ring-2 ring-ring/20 outline-none"
        />
      ) : (
        <button
          ref={titleBtn}
          type="button"
          onClick={() => {
            setDraft(subtask.title)
            setEditing(true)
          }}
          className={`ml-1.5 min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            subtask.done ? 'text-faint line-through decoration-line-strong' : 'text-ink'
          }`}
        >
          <span className="sr-only">Rename </span>
          {subtask.title}
        </button>
      )}
      {!editing && (
        <span className="flex shrink-0 items-center opacity-0 transition group-focus-within/sub:opacity-100 group-hover/sub:opacity-100 pointer-coarse:opacity-100">
          <button type="button" className={`${iconBtn} pointer-coarse:hidden`} disabled={first} onClick={() => onMove(-1)} aria-label={`Move “${subtask.title}” up`}>
            <ChevronUp aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
          <button type="button" className={`${iconBtn} pointer-coarse:hidden`} disabled={last} onClick={() => onMove(1)} aria-label={`Move “${subtask.title}” down`}>
            <ChevronDown aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
          <button type="button" className={iconBtn} onClick={onDelete} aria-label={`Delete “${subtask.title}”`}>
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </span>
      )}
    </li>
  )
}
