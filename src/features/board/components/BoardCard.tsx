import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlarmClock, AlignLeft, Check } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Card, QuestCategory } from '../../../db/types'
import { CATEGORY } from '../../quests/meta'
import { describeDue, subtaskProgress } from './model'

interface FaceProps {
  card: Card
  category: QuestCategory
  inDone: boolean
  todayKey: string
  pulse?: number // bump to play the "just finished" check pulse
  overlay?: boolean
}

// The visual card, shared by the sortable item and the drag overlay.
export function CardFace({ card, category, inDone, todayKey, pulse = 0, overlay }: FaceProps) {
  const reduce = useReducedMotion()
  const sub = subtaskProgress(card.subtasks)
  const due = card.dueDate && !inDone ? describeDue(card.dueDate, todayKey) : undefined
  const color = CATEGORY[category].color
  const hasMeta = sub.total > 0 || !!due || !!card.note
  const allDone = sub.total > 0 && sub.done === sub.total
  const chip = 'inline-flex h-[22px] items-center gap-1.5 rounded-[7px] px-1.5 font-medium'
  return (
    <div
      className={`group/card relative overflow-hidden rounded-[14px] border px-3.5 py-3 text-left transition-[border-color,box-shadow,transform] duration-200 ease-out-soft motion-reduce:transition-none ${
        overlay
          ? 'border-line-strong bg-elevated shadow-pop'
          : 'border-line bg-surface shadow-card group-hover/sort:-translate-y-px group-hover/sort:border-line-strong group-hover/sort:shadow-pop motion-reduce:group-hover/sort:translate-y-0'
      }`}
    >
      {/* Category accent: a hairline on the leading edge that warms up on hover. */}
      {!inDone && (
        <span
          aria-hidden
          className={`absolute top-3 bottom-3 left-0 w-[2.5px] rounded-r-full transition-opacity duration-200 ${overlay ? 'opacity-100' : 'opacity-0 group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100'}`}
          style={{ backgroundColor: color }}
        />
      )}
      <div className="flex items-start gap-2">
        {inDone && (
          <span className="relative mt-[3px] grid size-4 shrink-0 place-items-center rounded-full" style={{ backgroundColor: color }}>
            <Check aria-hidden className="size-[11px] text-[rgb(12_13_16/0.86)]" strokeWidth={3} />
            <AnimatePresence>
              {pulse > 0 && !reduce && (
                <motion.span
                  key={pulse}
                  aria-hidden
                  className="pointer-events-none absolute -inset-px rounded-full border-2"
                  style={{ borderColor: color }}
                  initial={{ scale: 1, opacity: 0.7 }}
                  animate={{ scale: 2.6, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </AnimatePresence>
          </span>
        )}
        <p className={`line-clamp-3 min-w-0 flex-1 text-[14px] leading-[1.4] font-medium tracking-[-0.003em] break-words ${inDone ? 'text-muted' : 'text-ink'}`}>
          {card.title}
        </p>
      </div>
      {hasMeta && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          {sub.total > 0 && (
            <span className={`${chip} bg-ink/[0.045] dark:bg-white/[0.06]`} aria-label={`${sub.done} of ${sub.total} subtasks done`}>
              <SubtaskRing done={sub.done} total={sub.total} color={color} />
              <span aria-hidden className={`tabular-nums ${allDone ? 'text-ink' : ''}`}>
                {sub.done}/{sub.total}
              </span>
            </span>
          )}
          {due && (
            <span
              className={`${chip} ${due.tone === 'later' ? 'bg-ink/[0.045] dark:bg-white/[0.06]' : 'bg-mq-soft text-mq-ink'}`}
              aria-label={`Reminder: ${due.label.toLowerCase()}`}
            >
              <AlarmClock aria-hidden className="size-3" strokeWidth={2} />
              {due.label}
            </span>
          )}
          {card.note && (
            <span className={`${chip} bg-ink/[0.045] text-muted dark:bg-white/[0.06]`} aria-label="Has a note" title="Has a note">
              <AlignLeft aria-hidden className="size-3" strokeWidth={2} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// 12px progress ring for a card's checklist; a filled check once every subtask is done.
function SubtaskRing({ done, total, color }: { done: number; total: number; color: string }) {
  const r = 4.75
  const c = 2 * Math.PI * r
  if (done === total) {
    return (
      <span aria-hidden className="grid size-3 place-items-center rounded-full" style={{ backgroundColor: color }}>
        <Check className="size-2 text-[rgb(12_13_16/0.86)]" strokeWidth={3.5} />
      </span>
    )
  }
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 -rotate-90">
      <circle cx="6" cy="6" r={r} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="1.75" />
      {done > 0 && (
      <circle
        cx="6"
        cy="6"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray={`${(done / total) * c} ${c}`}
        className="transition-[stroke-dasharray] duration-300 ease-out-soft"
      />
      )}
    </svg>
  )
}

interface SortableProps extends Omit<FaceProps, 'overlay'> {
  columnTitle: string
  onOpen: (id: string) => void
  dragging: boolean // any drag in progress (Enter shouldn't open the drawer mid-drag)
}

export function SortableCard({ card, columnTitle, onOpen, dragging, ...face }: SortableProps) {
  const reduce = useReducedMotion()
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', columnId: card.columnId },
  })
  const sub = subtaskProgress(card.subtasks)
  const label = [card.title, face.inDone ? 'done' : columnTitle, sub.total ? `${sub.done} of ${sub.total} subtasks` : '']
    .filter(Boolean)
    .join(', ')
  return (
    <li
      ref={setNodeRef}
      data-card-id={card.id}
      style={{ transform: CSS.Translate.toString(transform), transition: reduce ? undefined : transition }}
      className="relative"
    >
      <div
        {...attributes}
        {...listeners}
        aria-label={label}
        aria-roledescription="draggable card"
        onClick={() => onOpen(card.id)}
        onKeyDown={(e) => {
          listeners?.onKeyDown?.(e)
          if (e.key === 'Enter' && !dragging && !e.defaultPrevented) {
            e.preventDefault()
            onOpen(card.id)
          }
        }}
        className={`group/sort cursor-grab rounded-[14px] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:cursor-grabbing ${
          isDragging ? 'opacity-0' : ''
        }`}
      >
        <CardFace card={card} {...face} />
      </div>
      {/* Drop placeholder: where the card will land. */}
      {isDragging && <div aria-hidden className="absolute inset-0 rounded-[14px] border-[1.5px] border-dashed border-line-strong bg-sunken/70" />}
    </li>
  )
}
