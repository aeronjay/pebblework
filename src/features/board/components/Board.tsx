import {
  closestCenter,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import confetti from 'canvas-confetti'
import { Plus, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { href, navigate } from '../../../app/router'
import { useToday } from '../../../app/useToday'
import type { Card } from '../../../db/types'
import { useCompleteFeedback } from '../../quests/components/feedback'
import { useToast } from '../../quests/components/toastContext'
import { dayKey } from '../../quests/day'
import { useQuestToday } from '../../quests/hooks'
import { resolveCategoryColor } from '../../quests/meta'
import { deleteQuest, updateQuest } from '../../quests/repo'
import { hex, toRgb } from '../../jar/palette'
import type { BoardState } from '../hooks'
import {
  addCard,
  addColumn,
  completeProject,
  deleteCard,
  deleteColumn,
  moveCard,
  moveColumn,
  renameColumn,
  reopenProject,
  type CardMoveResult,
} from '../repo'
import { CardFace } from './BoardCard'
import { ColumnShell, SortableColumn } from './BoardColumn'
import { BoardHeader } from './BoardHeader'
import { CardDrawer } from './CardDrawer'
import { DeleteColumnDialog } from './DeleteColumnDialog'
import { Dialog } from './Dialog'
import { arrayMove, containerOf, itemsOf, moveItem, moveMessage, plural, projectMessage, type Items } from './model'

interface Override {
  cols: string[]
  items: Items
  board: BoardState // snapshot it was derived from; a newer live board supersedes it
}

const noop = () => {}

function confettiOrigin(el: HTMLElement | null) {
  const r = el?.getBoundingClientRect()
  if (!r) return { x: 0.8, y: 0.2 }
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight }
}

export function Board({ board }: { board: BoardState }) {
  const { quest, columns, cardsByColumn, doneColumnId, progress } = board
  const today = useToday()
  const todayKey = dayKey(today)
  const toast = useToast()
  const feedback = useCompleteFeedback()
  const reduce = useReducedMotion()
  const questToday = useQuestToday()
  // Quests still open today: card stones can't be claimed until these are done.
  const openQuests = questToday ? Math.max(0, questToday.assigned - questToday.done) : 0

  const [override, setOverride] = useState<Override | null>(null)
  const [active, setActive] = useState<{ id: string; type: 'card' | 'column' } | null>(null)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const [composing, setComposing] = useState<string | null>(null)
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'complete' | 'delete' | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const lastOver = useRef<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })
  // Fade the board's edges only where there's more to scroll, so a clipped column reads as "scroll for more".
  const updateEdges = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const start = el.scrollLeft > 2
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }))
  }, [])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    updateEdges()
    const ro = new ResizeObserver(updateEdges)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => ro.disconnect()
  }, [updateEdges, columns.length])
  const startColumn = useRef<string | null>(null)

  // Optimistic layout while dragging, and after a drop until the live query delivers the written state.
  const live = override && (active || override.board === board) ? override : null
  const colIds = live?.cols ?? columns.map((c) => c.id)
  const items = useMemo(() => live?.items ?? itemsOf(cardsByColumn), [live, cardsByColumn])
  // Mirrors for dnd-kit callbacks (collision detection runs outside React's render cycle).
  const itemsRef = useRef(items)
  const overrideRef = useRef(override)
  useLayoutEffect(() => {
    itemsRef.current = items
    overrideRef.current = override
  })

  const cardById = useMemo(() => new Map(Object.values(cardsByColumn).flat().map((c) => [c.id, c])), [cardsByColumn])
  const colById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])
  // While a column drag is in flight the done column follows the optimistic order.
  const doneId = colIds[colIds.length - 1] ?? doneColumnId

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  // Columns: closest column center. Cards: what's under the pointer; inside a column, its nearest card.
  const collision: CollisionDetection = useCallback(
    (args) => {
      if (active?.type === 'column') {
        return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === 'column') })
      }
      const hits = pointerWithin(args)
      const found = hits.length ? hits : rectIntersection(args)
      let overId = getFirstCollision(found, 'id') as string | null
      if (overId != null) {
        const cols = itemsRef.current
        if (overId in cols) {
          const inCol = cols[overId]
          if (inCol.length) {
            const near = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter((c) => c.id !== overId && inCol.includes(String(c.id))),
            })[0]?.id as string | undefined
            if (near) overId = near
          }
        }
        lastOver.current = overId
        return [{ id: overId }]
      }
      return lastOver.current ? [{ id: lastOver.current }] : []
    },
    [active],
  )

  const cardTitle = (id: unknown) => cardById.get(String(id))?.title ?? 'card'
  const colTitle = (id: string | undefined) => (id ? (colById.get(id)?.title ?? 'column') : 'column')
  const position = (id: string) => {
    const col = containerOf(itemsRef.current, id)
    if (!col) return ''
    const list = itemsRef.current[col]
    return `“${colTitle(col)}”, position ${list.indexOf(id) + 1} of ${list.length}`
  }
  const announcements: Announcements = {
    onDragStart: ({ active: a }) =>
      a.data.current?.type === 'column'
        ? `Picked up column “${colTitle(String(a.id))}”. Use left and right arrows to move it.`
        : `Picked up “${cardTitle(a.id)}” in ${position(String(a.id))}.`,
    onDragOver: ({ active: a, over }) => {
      if (!over) return undefined
      if (a.data.current?.type === 'column') return `Column “${colTitle(String(a.id))}” is over “${colTitle(String(over.id))}”.`
      return `“${cardTitle(a.id)}” is in ${position(String(a.id))}.`
    },
    onDragEnd: ({ active: a, over }) => {
      if (!over) return `Dropped. Nothing moved.`
      if (a.data.current?.type === 'column') return `Dropped column “${colTitle(String(a.id))}”.`
      return `Dropped “${cardTitle(a.id)}” in ${position(String(a.id))}.`
    },
    onDragCancel: ({ active: a }) => `Cancelled. ${a.data.current?.type === 'column' ? 'The column' : `“${cardTitle(a.id)}”`} is back where it was.`,
  }

  // ---- results & feedback ----

  const afterMove = useCallback(
    (cardId: string, from: string, to: string, result: CardMoveResult | undefined) => {
      if (!result || from === to) return
      const enteredDone = to === doneColumnId
      if (enteredDone) {
        feedback()
        setPulse((p) => ({ id: cardId, n: (p?.n ?? 0) + 1 }))
        window.setTimeout(() => setPulse((p) => (p?.id === cardId ? { ...p, id: '' } : p)), 900)
      }
      const message = moveMessage(result, enteredDone, openQuests)
      if (message) toast.show(message, 'info')
    },
    [doneColumnId, feedback, toast, openQuests],
  )

  const moveTo = useCallback(
    async (cardId: string, to: string, index: number) => {
      const from = cardById.get(cardId)?.columnId ?? to
      const result = await toast.run(() => moveCard(cardId, to, index))
      if (!result) setOverride(null)
      afterMove(cardId, from, to, result)
    },
    [afterMove, cardById, toast],
  )

  // ---- drag lifecycle ----

  function onDragStart({ active: a }: DragStartEvent) {
    const type = a.data.current?.type === 'column' ? 'column' : 'card'
    setActive({ id: String(a.id), type })
    setOpenCardId(null)
    setComposing(null)
    startColumn.current = type === 'card' ? (containerOf(items, String(a.id)) ?? null) : null
    setOverride({ cols: colIds, items, board })
  }

  function onDragOver({ active: a, over }: DragOverEvent) {
    if (a.data.current?.type === 'column' || !over) return
    const id = String(a.id)
    const overId = String(over.id)
    setOverride((o) => {
      if (!o) return o
      const from = containerOf(o.items, id)
      const to = containerOf(o.items, overId)
      if (!from || !to || from === to) return o
      const target = o.items[to]
      let index = target.length
      if (overId !== to) {
        const at = target.indexOf(overId)
        const r = a.rect.current.translated
        const below = r && r.top > over.rect.top + over.rect.height / 2
        index = at + (below ? 1 : 0)
      }
      return { ...o, items: moveItem(o.items, id, to, index) }
    })
  }

  function onDragEnd({ active: a, over }: DragEndEvent) {
    const id = String(a.id)
    const type = active?.type
    setActive(null)
    lastOver.current = null
    const o = overrideRef.current
    if (!o || !over) return setOverride(null)

    if (type === 'column') {
      const from = o.cols.indexOf(id)
      const to = o.cols.indexOf(String(over.id))
      if (from < 0 || to < 0 || from === to) return setOverride(null)
      setOverride({ ...o, cols: arrayMove(o.cols, from, to) })
      void toast.run(() => moveColumn(id, to)).then((r) => r === undefined && setOverride(null))
      return
    }

    const col = containerOf(o.items, id)
    if (!col) return setOverride(null)
    let next = o.items
    const overId = String(over.id)
    if (overId !== col && o.items[col].includes(overId)) {
      const list = o.items[col]
      next = { ...o.items, [col]: arrayMove(list, list.indexOf(id), list.indexOf(overId)) }
    }
    const index = next[col].indexOf(id)
    const original = startColumn.current
    const card = cardById.get(id)
    const unchanged = card && card.columnId === col && original === col && cardsByColumn[col]?.[index]?.id === id
    if (unchanged) return setOverride(null)
    setOverride({ ...o, items: next })
    void moveTo(id, col, index)
  }

  function onDragCancel() {
    setActive(null)
    lastOver.current = null
    setOverride(null)
  }

  // ---- actions ----

  async function onAddCard(columnId: string, title: string) {
    const id = await toast.run(() => addCard(quest.id, columnId, title))
    if (!id) return false
    if (columnId === doneColumnId) {
      // addCard settles straight into done; mirror the move feedback.
      afterMove(id, '', columnId, { awarded: true, withdrawn: false, todayClaimed: false })
    }
    return true
  }

  function onMoveColumn(id: string, dir: -1 | 1) {
    const i = colIds.indexOf(id)
    const to = i + dir
    if (to < 0 || to >= colIds.length) return
    void toast.run(() => moveColumn(id, to))
  }

  const completeAnchor = useRef<HTMLElement | null>(null)

  async function runComplete() {
    setConfirm(null)
    const earned = await toast.run(() => completeProject(quest.id))
    if (earned === undefined) return
    feedback()
    toast.show(projectMessage(earned, openQuests), 'info')
    if (!reduce) {
      const c = hex(toRgb(resolveCategoryColor(quest.category)))
      const ink = hex(toRgb(resolveCategoryColor(quest.category, 'ink')))
      void confetti({ particleCount: 70, spread: 70, startVelocity: 32, origin: confettiOrigin(completeAnchor.current), colors: [c, ink, '#ffffff'], scalar: 0.85, ticks: 160, disableForReducedMotion: true })
    }
  }

  async function runReopen() {
    const withdrawn = await toast.run(() => reopenProject(quest.id))
    if (withdrawn === undefined) return
    toast.show(withdrawn ? 'Project reopened — today’s bonus was returned.' : 'Project reopened.', 'info')
  }

  async function runDeleteProject() {
    setConfirm(null)
    const ok = await toast.run(async () => {
      await deleteQuest(quest.id)
      return true
    })
    if (ok) navigate(href.projects, { replace: true })
  }

  async function onDeleteCard(id: string) {
    const card = cardById.get(id)
    const list = card ? (cardsByColumn[card.columnId] ?? []) : []
    const neighbor = list[list.indexOf(card!) + 1] ?? list[list.indexOf(card!) - 1]
    setOpenCardId(null)
    const result = await toast.run(() => deleteCard(id))
    if (!result) return
    toast.show(result.withdrawn ? 'Card deleted — today’s stone was returned.' : 'Card deleted.', 'info')
    requestAnimationFrame(() => {
      const el =
        (neighbor && document.querySelector<HTMLElement>(`[data-card-id="${neighbor.id}"] [aria-roledescription]`)) ||
        document.querySelector<HTMLElement>(`[data-column-id="${card?.columnId}"] header button[title]`)
      el?.focus()
    })
  }

  const openOpen = progress.total - progress.done
  const activeCard = active?.type === 'card' ? cardById.get(active.id) : undefined
  const activeCol = active?.type === 'column' ? colById.get(active.id) : undefined
  const openCard = openCardId ? cardById.get(openCardId) : undefined
  const dropAnimation: DropAnimation | null = reduce ? null : { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }

  const columnProps = (id: string, index: number) => {
    const col = colById.get(id)!
    const cards = (items[id] ?? []).map((cid) => cardById.get(cid)).filter((c): c is Card => !!c)
    return {
      column: col,
      index,
      columnCount: colIds.length,
      cards,
      category: quest.category,
      isDone: id === doneId,
      todayKey,
      pulse,
      dragging: !!active,
      dropTarget: !!activeCard && containerOf(items, activeCard.id) === id,
      composing: composing === id,
      prevTitle: colById.get(colIds[colIds.length - 2])?.title,
      onCompose: (open: boolean) => setComposing(open ? id : null),
      onAddCard: (title: string) => onAddCard(id, title),
      onOpenCard: setOpenCardId,
      onRename: (title: string) => void toast.run(() => renameColumn(id, title)),
      onMove: (dir: -1 | 1) => onMoveColumn(id, dir),
      onDelete: () => setDeleting(id),
    }
  }

  return (
    // Fills the viewport (minus <main> padding and, on phones, the bottom nav) so columns read as full-height lanes.
    <div className="flex min-h-[calc(100dvh-8rem)] min-w-0 flex-col md:min-h-[calc(100dvh-5rem)]">
      <BoardHeader
        quest={quest}
        progress={progress}
        todayKey={todayKey}
        onRename={async (title) => void (await toast.run(() => updateQuest(quest.id, { title })))}
        onComplete={(anchor) => {
          completeAnchor.current = anchor
          if (openOpen > 0) setConfirm('complete')
          else void runComplete()
        }}
        onReopen={() => void runReopen()}
        onDelete={() => setConfirm('delete')}
      />

      {progress.total === 0 && (
        <div className="mb-5 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center md:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-sunken text-muted">
            <Sparkles aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold text-ink">Break the quest into stages</p>
            <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
              Add each step as a card and drag it across as you go. Every stage that reaches{' '}
              <span className="font-medium text-ink">{colById.get(doneColumnId)?.title}</span> earns a stone for the day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setComposing(colIds[0])}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-control bg-ink px-3 text-[13.5px] font-semibold text-canvas shadow-card transition outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:self-center"
          >
            <Plus aria-hidden className="size-4" strokeWidth={2} />
            Add the first stage
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Press Enter to open a card. Press Space to pick up a card or column, arrow keys to move it, Space to drop, Escape to cancel.',
          },
        }}
      >
        <div
          ref={scroller}
          role="region"
          aria-label="Board columns"
          onScroll={updateEdges}
          style={edgeMask(edges)}
          className={`-mx-4 flex min-h-[420px] flex-1 scroll-px-4 items-stretch gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:scroll-px-8 md:gap-4 md:px-8 xl:-mx-12 xl:px-12 ${
            active ? '' : 'snap-x snap-mandatory md:snap-none'
          } [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]`}
        >
          <SortableContext items={colIds} strategy={horizontalListSortingStrategy}>
            {colIds.map((id, i) => (colById.has(id) ? <SortableColumn key={id} {...columnProps(id, i)} /> : null))}
          </SortableContext>
          <AddColumn
            open={addingColumn}
            doneTitle={colById.get(doneColumnId)?.title ?? 'Done'}
            onOpen={setAddingColumn}
            onAdd={async (title) => !!(await toast.run(() => addColumn(quest.id, title)))}
          />
          <div aria-hidden className="w-px shrink-0" />
        </div>

        {createPortal(
          <DragOverlay dropAnimation={dropAnimation} zIndex={60}>
            {activeCard ? (
              <motion.div
                initial={reduce ? false : { rotate: 0, scale: 1 }}
                animate={reduce ? undefined : { rotate: 2.2, scale: 1.03 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                style={{ cursor: 'grabbing' }}
              >
                <CardFace
                  card={activeCard}
                  category={quest.category}
                  inDone={containerOf(items, activeCard.id) === doneId}
                  todayKey={todayKey}
                  overlay
                />
              </motion.div>
            ) : activeCol ? (
              <div className="w-[min(84vw,316px)] md:w-[288px]" style={{ cursor: 'grabbing' }}>
                <ColumnShell
                  {...columnProps(activeCol.id, colIds.indexOf(activeCol.id))}
                  onCompose={noop}
                  composing={false}
                  dragging={false}
                  overlay
                />
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <CardDrawer
        card={openCard}
        columns={columns}
        doneColumnId={doneColumnId}
        category={quest.category}
        todayKey={todayKey}
        onMove={(cardId, to) => void moveTo(cardId, to, (cardsByColumn[to] ?? []).filter((c) => c.id !== cardId).length)}
        onDelete={(id) => void onDeleteCard(id)}
        onClose={() => setOpenCardId(null)}
      />

      <DeleteColumnDialog
        column={deleting ? colById.get(deleting) : undefined}
        columns={columns}
        cardCount={deleting ? (cardsByColumn[deleting]?.length ?? 0) : 0}
        doneColumnId={doneColumnId}
        onClose={() => setDeleting(null)}
        onConfirm={async (moveTo) => {
          const id = deleting!
          setDeleting(null)
          await toast.run(() => deleteColumn(id, moveTo))
        }}
      />

      <Dialog
        open={confirm === 'complete'}
        title="Complete the whole project?"
        confirmLabel="Complete project"
        onConfirm={() => void runComplete()}
        onClose={() => setConfirm(null)}
      >
        {plural(openOpen, 'stage is', 'stages are')} still open. Completing now earns the project bonus; open stages stay on the board and can
        still be finished.
      </Dialog>
      <Dialog
        open={confirm === 'delete'}
        title={`Delete “${quest.title}”?`}
        confirmLabel="Delete project"
        tone="danger"
        onConfirm={() => void runDeleteProject()}
        onClose={() => setConfirm(null)}
      >
        Its board and {plural(progress.total, 'card')} go with it. Stones you’ve already earned stay in your jar.
      </Dialog>
    </div>
  )
}

const FADE = '40px'
const FADED = 'rgb(0 0 0 / 0.18)' // not fully transparent: a sliver of the next column must still peek through
function edgeMask({ start, end }: { start: boolean; end: boolean }): CSSProperties | undefined {
  if (!start && !end) return undefined
  const mask = `linear-gradient(to right, ${start ? FADED : '#000'} 0, #000 ${FADE}, #000 calc(100% - ${FADE}), ${end ? FADED : '#000'} 100%)`
  return { maskImage: mask, WebkitMaskImage: mask }
}

function AddColumn({
  open,
  doneTitle,
  onOpen,
  onAdd,
}: {
  open: boolean
  doneTitle: string
  onOpen: (open: boolean) => void
  onAdd: (title: string) => Promise<boolean>
}) {
  const [value, setValue] = useState('')
  async function submit() {
    const t = value.trim()
    if (!t) return onOpen(false)
    if (await onAdd(t)) {
      setValue('')
      onOpen(false)
    }
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpen(true)}
        className="group/add flex h-12 w-[min(84vw,316px)] shrink-0 snap-start items-center gap-2 self-start rounded-[18px] border border-dashed border-line-strong px-4 text-[13.5px] font-medium text-muted transition outline-none hover:border-solid hover:bg-sunken/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring md:h-auto md:w-14 md:flex-col md:gap-3 md:self-stretch md:px-0 md:py-3.5"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg transition-colors md:bg-ink/[0.04] md:group-hover/add:bg-ink/[0.07]">
          <Plus aria-hidden className="size-4" strokeWidth={1.75} />
        </span>
        <span className="md:[writing-mode:vertical-rl]">Add column</span>
      </button>
    )
  }
  return (
    <div className="w-[min(84vw,316px)] shrink-0 snap-start self-start rounded-[18px] border border-line-strong bg-sunken/70 p-2 md:w-[260px]">
      <input
        autoFocus
        value={value}
        maxLength={60}
        aria-label="Column name"
        placeholder="Column name, e.g. Review"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
          if (e.key === 'Escape') onOpen(false)
        }}
        onBlur={(e) => {
          if (!value.trim() && !e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) onOpen(false)
        }}
        className="h-9 w-full rounded-[11px] border border-line-strong bg-surface px-2.5 text-[13.5px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
      />
      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => void submit()}
          className="h-7 rounded-lg bg-ink px-2.5 text-[12.5px] font-semibold text-canvas transition outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Add column
        </button>
        <button
          type="button"
          onClick={() => onOpen(false)}
          className="h-7 rounded-lg px-2 text-[12.5px] font-medium text-muted transition outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 px-1 text-[11.5px] leading-snug text-faint">Goes before “{doneTitle}”, so it stays your done column.</p>
    </div>
  )
}
