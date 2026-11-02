import { addDays, format, parseISO } from 'date-fns'
import { AlarmClock, AlignLeft, CalendarPlus, ChevronDown, ListChecks, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { BoardColumn, Card, QuestCategory } from '../../../db/types'
import { CATEGORY } from '../../quests/meta'
import { useToast } from '../../quests/components/toastContext'
import { updateCard } from '../repo'
import { trapTab, useModal } from './a11y'
import { describeDue, subtaskProgress } from './model'
import { SubtaskList } from './SubtaskList'

interface Props {
  card: Card | undefined // undefined = closed
  columns: BoardColumn[]
  doneColumnId: string
  category: QuestCategory
  todayKey: string
  onMove: (cardId: string, columnId: string) => void
  onDelete: (cardId: string) => void
  onClose: () => void
}

// Card detail: a right-side drawer on md+, a bottom sheet below.
export function CardDrawer(props: Props) {
  return createPortal(
    <AnimatePresence>{props.card && <Drawer key={props.card.id} {...props} card={props.card} />}</AnimatePresence>,
    document.body,
  )
}

const label = 'flex items-center gap-1.5 text-[13px] font-bold text-faint'

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}

function Drawer({ card, columns, doneColumnId, category, todayKey, onMove, onDelete, onClose }: Props & { card: Card }) {
  const reduce = useReducedMotion()
  const desktop = useIsDesktop()
  const toast = useToast()
  const panel = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [confirmDelete, setConfirmDelete] = useState(false)
  useModal(closeBtn, () => document.querySelector<HTMLElement>(`[data-card-id="${card.id}"] [aria-roledescription]`))

  const sub = subtaskProgress(card.subtasks)
  const color = CATEGORY[category].color

  const save = (patch: Parameters<typeof updateCard>[1]) => toast.run(() => updateCard(card.id, patch))

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : desktop
      ? { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }
      : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }

  return (
    <div className="fixed inset-0 z-[55]">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/25 dark:bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...motionProps}
        transition={{ type: 'spring', bounce: 0, duration: 0.38 }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          trapTab(e, panel.current)
        }}
        className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-[22px] border border-line bg-elevated shadow-pop md:inset-y-2 md:right-2 md:left-auto md:max-h-none md:w-[460px] md:rounded-[22px]"
      >
        {/* Mobile grabber */}
        <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong md:hidden" />

        <div className="flex shrink-0 items-center gap-2 px-5 pt-3 pb-2 md:pt-5">
          <ColumnPicker
            columns={columns}
            value={card.columnId}
            doneColumnId={doneColumnId}
            category={category}
            onChange={(id) => onMove(card.id, id)}
          />
          {card.columnId === doneColumnId && card.doneAt && (
            <span className="truncate text-[12.5px] text-muted">Finished {format(new Date(card.doneAt), 'MMM d')}</span>
          )}
          <span className="flex-1" />
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="Close card"
            className="grid size-9 place-items-center rounded-control text-faint transition outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          <TitleEditor id={titleId} value={card.title} onSave={(title) => save({ title })} />

          <dl className="mt-5 grid grid-cols-[112px_1fr] items-center gap-y-2 text-[13.5px]">
            <dt className={label}>
              <AlarmClock aria-hidden className="size-3.5" strokeWidth={1.75} />
              <span id={`${titleId}-due-label`}>Reminder</span>
            </dt>
            <dd className="min-w-0">
              <ReminderField id={`${titleId}-due`} value={card.dueDate} todayKey={todayKey} onChange={(dueDate) => void save({ dueDate })} />
            </dd>
          </dl>
          <p className="mt-1.5 pl-[112px] text-[12px] leading-snug text-faint">Just a nudge — it never blocks a day.</p>

          <section className="mt-6">
            <h3 className={label}>
              <AlignLeft aria-hidden className="size-3.5" strokeWidth={1.75} />
              <label htmlFor={`${titleId}-note`}>Note</label>
            </h3>
            <NoteEditor id={`${titleId}-note`} value={card.note ?? ''} onSave={(note) => save({ note: note || null })} />
          </section>

          <section className="mt-6">
            <div className="flex items-center gap-3">
              <h3 className={label}>
                <ListChecks aria-hidden className="size-3.5" strokeWidth={1.75} />
                Subtasks
              </h3>
              {sub.total > 0 && (
                <>
                  <span aria-hidden className="relative h-1 flex-1 overflow-hidden rounded-full bg-sunken">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out-soft"
                      style={{ width: `${(sub.done / sub.total) * 100}%`, backgroundColor: color }}
                    />
                  </span>
                  <span className="text-[12px] font-medium text-muted tabular-nums">
                    {sub.done}/{sub.total}
                  </span>
                </>
              )}
            </div>
            <SubtaskList card={card} category={category} />
          </section>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="min-w-0 flex-1 truncate text-[12px] text-faint">
            Created {format(new Date(card.createdAt), 'MMM d')}, edited {format(new Date(card.updatedAt), 'MMM d, h:mm a')}
          </p>
          <button
            type="button"
            onClick={() => (confirmDelete ? onDelete(card.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              confirmDelete ? 'bg-danger-soft text-danger-ink' : 'text-muted hover:bg-danger-soft hover:text-danger-ink'
            }`}
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
            {confirmDelete ? 'Click again to delete' : 'Delete card'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

function ColumnPicker({
  columns,
  value,
  doneColumnId,
  category,
  onChange,
}: {
  columns: BoardColumn[]
  value: string
  doneColumnId: string
  category: QuestCategory
  onChange: (id: string) => void
}) {
  const inDone = value === doneColumnId
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Move to column</span>
      <span
        aria-hidden
        className="pointer-events-none absolute left-2.5 size-2 rounded-full"
        style={{ backgroundColor: inDone ? CATEGORY[category].color : 'var(--color-line-strong)', boxShadow: inDone ? undefined : 'inset 0 0 0 1.5px var(--color-faint)' }}
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-chip border border-line-strong bg-surface pr-7 pl-6 text-[13px] font-medium text-ink outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-ring"
      >
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
            {c.id === doneColumnId && !/^done$/i.test(c.title.trim()) ? ' (done)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-faint" strokeWidth={2} />
    </label>
  )
}

// Seeds once from props (keyed by card), commits on blur/Enter; never re-syncs mid-edit so typing doesn't jump.
function TitleEditor({ id, value, onSave }: { id: string; value: string; onSave: (v: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const shown = focused ? draft : value
  useAutosize(ref, shown)
  function commit() {
    const t = draft.trim()
    if (!t) setDraft(value)
    else if (t !== value) void onSave(t)
  }
  return (
    <textarea
      ref={ref}
      id={id}
      rows={1}
      value={shown}
      aria-label="Card title"
      maxLength={200}
      onFocus={() => {
        setDraft(value)
        setFocused(true)
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, ''))}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape' && draft !== value) {
          e.stopPropagation()
          setDraft(value)
          requestAnimationFrame(() => ref.current?.blur())
        }
      }}
      className="-mx-2 block w-[calc(100%+1rem)] resize-none overflow-hidden rounded-[10px] bg-transparent px-2 py-1 font-display text-[22px] leading-[1.25] font-normal text-ink outline-none hover:bg-sunken/60 focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring/40"
    />
  )
}

function NoteEditor({ id, value, onSave }: { id: string; value: string; onSave: (v: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const shown = focused ? draft : value
  useAutosize(ref, shown)
  return (
    <textarea
      ref={ref}
      id={id}
      rows={3}
      value={shown}
      maxLength={4000}
      placeholder="Add details, links, acceptance criteria…"
      onFocus={() => {
        setDraft(value)
        setFocused(true)
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false)
        if (draft.trim() !== value.trim()) void onSave(draft.trim())
      }}
      className="mt-2 block min-h-[84px] w-full resize-none overflow-hidden rounded-control border border-line bg-surface px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none transition placeholder:text-faint hover:border-line-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
    />
  )
}

function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}

// The native date input stays hidden (its empty state reads "mm/dd/yyyy"); chips open its picker instead.
function ReminderField({ id, value, todayKey, onChange }: { id: string; value?: string; todayKey: string; onChange: (v: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const inDays = (n: number) => format(addDays(parseISO(todayKey), n), 'yyyy-MM-dd')
  const open = () => {
    const el = input.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }
  const chip =
    'inline-flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      <input
        ref={input}
        id={id}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value ?? ''}
        // A half-cleared native date reports '' mid-edit; only the clear button removes a reminder.
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />
      {value ? (
        <>
          <button
            type="button"
            onClick={open}
            aria-labelledby={`${id}-label ${id}-value`}
            className={`${chip} border border-line-strong bg-surface text-ink hover:border-ring/50`}
          >
            <AlarmClock aria-hidden className="size-3.5 text-muted" strokeWidth={1.75} />
            <span id={`${id}-value`}>{format(parseISO(value), 'EEE, MMM d')}</span>
            <span className="text-[12px] font-normal text-muted">{describeDue(value, todayKey).label.replace(/^Due /, '')}</span>
          </button>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Clear reminder"
            className="grid size-8 place-items-center rounded-[9px] text-faint outline-none transition hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={open}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-none`}
            className={`${chip} border border-dashed border-line-strong text-muted hover:border-solid hover:bg-sunken/60 hover:text-ink`}
          >
            <CalendarPlus aria-hidden className="size-3.5" strokeWidth={1.75} />
            <span id={`${id}-none`}>Pick a date</span>
          </button>
          <button type="button" onClick={() => onChange(inDays(1))} className={`${chip} text-muted hover:bg-sunken hover:text-ink`}>
            Tomorrow
          </button>
          <button type="button" onClick={() => onChange(inDays(7))} className={`${chip} text-muted hover:bg-sunken hover:text-ink max-[440px]:hidden`}>
            Next week
          </button>
        </>
      )}
    </div>
  )
}
