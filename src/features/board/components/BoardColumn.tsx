import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, ArrowRight, CircleCheck, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardColumn as Column, Card, QuestCategory } from '../../../db/types'
import { MIN_COLUMNS } from '../repo'
import { SortableCard } from './BoardCard'
import { Menu, type MenuItem } from './Menu'
import { CAT_CLASS } from './model'

export interface ColumnProps {
  column: Column
  index: number
  columnCount: number
  cards: Card[]
  category: QuestCategory
  isDone: boolean
  todayKey: string
  pulse: { id: string; n: number } | null
  dragging: boolean
  dropTarget?: boolean // the dragged card is currently in this column
  composing: boolean
  nextTitle?: string // title of the column to the left of done, for "Done moves to …" hints
  prevTitle?: string
  onCompose: (open: boolean) => void
  onAddCard: (title: string) => Promise<boolean>
  onOpenCard: (id: string) => void
  onRename: (title: string) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}

export function SortableColumn(props: ColumnProps) {
  const reduce = useReducedMotion()
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: props.column.id,
    data: { type: 'column' },
  })
  return (
    <div
      ref={setNodeRef}
      data-column-id={props.column.id}
      style={{ transform: CSS.Translate.toString(transform), transition: reduce ? undefined : transition }}
      className="relative flex w-[min(84vw,316px)] shrink-0 snap-start flex-col md:w-[288px]"
    >
      <ColumnShell
        {...props}
        ghost={isDragging}
        handle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-roledescription="draggable column"
            aria-label={`Reorder column “${props.column.title}”`}
            className="absolute top-2.5 left-0.5 grid h-7 w-3.5 cursor-grab touch-none place-items-center rounded-md text-faint opacity-0 transition outline-none group-hover/col:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing pointer-coarse:opacity-60"
          >
            <GripVertical aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
    </div>
  )
}

interface ShellProps extends ColumnProps {
  ghost?: boolean
  handle?: ReactNode
  overlay?: boolean
}

// Column chrome. Rendered by the sortable wrapper and (statically) by the drag overlay.
export function ColumnShell(p: ShellProps) {
  const { column, cards, isDone, category } = p
  const [renaming, setRenaming] = useState(false)
  const titleBtn = useRef<HTMLButtonElement>(null)
  const ids = cards.map((c) => c.id)

  const items: MenuItem[] = [
    { label: 'Rename', Icon: Pencil, onSelect: () => setRenaming(true) },
    {
      label: 'Move left',
      Icon: ArrowLeft,
      disabled: p.index === 0,
      hint: isDone && p.prevTitle ? `“${p.prevTitle}” becomes the done column` : undefined,
      onSelect: () => p.onMove(-1),
    },
    {
      label: 'Move right',
      Icon: ArrowRight,
      disabled: p.index === p.columnCount - 1,
      hint: p.index === p.columnCount - 2 ? 'This becomes the done column' : undefined,
      onSelect: () => p.onMove(1),
    },
    {
      label: 'Delete column',
      Icon: Trash2,
      danger: true,
      separator: true,
      disabled: p.columnCount <= MIN_COLUMNS,
      hint: p.columnCount <= MIN_COLUMNS ? `A board needs at least ${MIN_COLUMNS} columns` : cards.length ? 'You’ll pick where its cards go' : undefined,
      onSelect: p.onDelete,
    },
  ]

  const tint = `var(--color-${category}-soft)`
  const accent = `var(--color-${category})`
  const target = p.dropTarget && !p.overlay
  return (
    <section
      aria-label={`${column.title}${isDone ? ' (done column)' : ''}, ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`}
      className={`group/col flex flex-col rounded-[18px] border transition-[opacity,box-shadow,background-color,border-color] duration-200 ${
        p.overlay ? 'rotate-[1.2deg] border-line-strong bg-sunken shadow-pop' : 'flex-1 border-line bg-sunken/60 dark:bg-white/[0.022]'
      } ${p.ghost ? 'opacity-40' : ''}`}
      // Drop target: a soft category wash and a hairline in the category color.
      style={
        target
          ? {
              backgroundImage: `linear-gradient(${tint}, ${tint})`,
              borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
            }
          : undefined
      }
    >
      <header
        className={`relative flex h-12 items-center gap-1.5 rounded-t-[17px] pr-1.5 pl-[17px] ${isDone ? 'border-b border-line' : ''}`}
        style={isDone ? { backgroundColor: tint } : undefined}
      >
        {p.handle}
        {isDone && <CircleCheck aria-hidden className={`size-4 shrink-0 ${CAT_CLASS[category].ink}`} strokeWidth={2} />}
        {renaming ? (
          <TitleInput
            initial={column.title}
            onDone={(title) => {
              setRenaming(false)
              if (title && title !== column.title) p.onRename(title)
              requestAnimationFrame(() => titleBtn.current?.focus())
            }}
          />
        ) : (
          <button
            ref={titleBtn}
            type="button"
            onClick={() => setRenaming(true)}
            title="Rename column"
            className={`min-w-0 truncate rounded-md px-1 py-0.5 text-left text-[13.5px] font-semibold tracking-[-0.005em] outline-none hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-ring ${
              isDone ? `${CAT_CLASS[category].ink}` : 'text-ink'
            }`}
          >
            <span className="sr-only">Rename column </span>
            {column.title}
          </button>
        )}
        <span
          className={`ml-0.5 shrink-0 rounded-chip px-1.5 text-[12px] leading-5 font-medium tabular-nums ${isDone ? `${CAT_CLASS[category].ink}` : 'text-muted'}`}
          aria-hidden
        >
          {cards.length}
        </span>
        <span className="flex-1" />
        {!p.overlay && (
          <>
            <button
              type="button"
              onClick={() => p.onCompose(true)}
              aria-label={`Add a card to “${column.title}”`}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-faint opacity-0 transition outline-none group-hover/col:opacity-100 hover:bg-ink/5 hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:hidden"
            >
              <Plus aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
            <Menu label={`Column actions for “${column.title}”`} items={items} size="sm" className="hover:bg-ink/5" />
          </>
        )}
      </header>

      <SortableContext id={column.id} items={ids} strategy={verticalListSortingStrategy}>
        <ul className={`flex min-h-[56px] flex-col gap-2 px-2 ${isDone ? 'pt-2' : ''} ${cards.length || p.composing ? 'pb-2' : ''}`}>
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              category={category}
              inDone={isDone}
              todayKey={p.todayKey}
              columnTitle={column.title}
              pulse={p.pulse?.id === card.id ? p.pulse.n : 0}
              dragging={p.dragging}
              onOpen={p.onOpenCard}
            />
          ))}
          {!cards.length && !p.composing && <EmptyColumn isDone={isDone} dragging={p.dragging} />}
        </ul>
      </SortableContext>

      {!p.overlay && (
        <div className="px-2 pb-2">
          {p.composing ? (
            <Composer onAdd={p.onAddCard} onClose={() => p.onCompose(false)} isDone={isDone} />
          ) : (
            <button
              type="button"
              onClick={() => p.onCompose(true)}
              className="flex h-9 w-full items-center gap-2 rounded-[11px] px-2.5 text-[13px] font-medium text-muted transition outline-none hover:bg-ink/[0.04] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus aria-hidden className="size-4" strokeWidth={1.75} />
              Add card
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function EmptyColumn({ isDone, dragging }: { isDone: boolean; dragging: boolean }) {
  return (
    <li
      className={`flex min-h-[88px] flex-col items-center justify-center rounded-[14px] border border-dashed px-4 py-5 text-center transition-colors ${
        dragging ? 'border-line-strong bg-surface/40' : 'border-line-strong'
      }`}
    >
      <p className="text-[13px] font-medium text-muted">{dragging ? 'Drop it here' : isDone ? 'Nothing finished yet' : 'No cards yet'}</p>
      {!dragging && (
        <p className="mt-0.5 max-w-[30ch] text-[12px] leading-snug text-balance text-muted">
          {isDone ? 'Stages that land here earn a stone.' : 'Add one below, or drag one in.'}
        </p>
      )}
    </li>
  )
}

function TitleInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v?.trim() || null)
  }
  return (
    <input
      autoFocus
      value={value}
      aria-label="Column name"
      maxLength={60}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(null)
      }}
      className="h-7 min-w-0 flex-1 rounded-md border border-ring/60 bg-surface px-1.5 text-[13.5px] font-semibold text-ink ring-2 ring-ring/25 outline-none"
    />
  )
}

// Inline "new card" composer. Enter adds and stays open for rapid entry; Esc or blurring empty closes.
function Composer({ onAdd, onClose, isDone }: { onAdd: (title: string) => Promise<boolean>; onClose: () => void; isDone: boolean }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  async function submit() {
    const title = value.trim()
    if (!title) return onClose()
    // Clear right away so fast typing goes into the next card; restore on failure.
    setValue('')
    if (!(await onAdd(title))) setValue((v) => v || title)
    input.current?.focus()
  }
  return (
    <div className="rounded-[14px] border border-line-strong bg-surface p-2 shadow-card focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20">
      <textarea
        ref={input}
        value={value}
        rows={2}
        maxLength={200}
        aria-label="Card title"
        placeholder={isDone ? 'Something already finished…' : 'What’s the next stage?'}
        onChange={(e) => setValue(e.target.value.replace(/\n/g, ''))}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
          if (e.key === 'Escape') onClose()
        }}
        onBlur={(e) => {
          if (!value.trim() && !e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) onClose()
        }}
        className="block w-full resize-none bg-transparent px-1.5 py-1 text-[14px] leading-[1.4] font-medium text-ink outline-none placeholder:font-normal placeholder:text-faint"
      />
      <div className="mt-1 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void submit()}
          className="h-7 rounded-lg bg-ink px-2.5 text-[12.5px] font-semibold text-canvas transition outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Add card
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-7 rounded-lg px-2 text-[12.5px] font-medium text-muted transition outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          Cancel
        </button>
        <span className="ml-auto pr-1 text-[11px] text-faint max-sm:hidden">
          <kbd className="font-sans">Enter</kbd> to add
        </span>
      </div>
      {isDone && <p className="mt-1.5 px-1.5 text-[11.5px] leading-snug text-faint">Cards added here count as finished today.</p>}
    </div>
  )
}
