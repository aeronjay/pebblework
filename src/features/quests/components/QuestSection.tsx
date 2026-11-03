import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, GripVertical, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import type { QuestCategory } from '../../../db/types'
import type { QuestItem } from '../hooks'
import { CATEGORY } from '../meta'
import { moveQuest } from '../repo'
import type { ProjectSummary } from '../../board/hooks'
import { isProject } from '../day'
import { dayCount, isEarlier } from './lists'
import { ProjectRow } from './ProjectRow'
import { QuestRow, type RowDrag } from './QuestRow'
import { useToast } from './toastContext'

interface Props {
  category: QuestCategory
  items: QuestItem[] // this category's live quests, in stored order
  ids: string[] // the visible (draggable) quests in display order; mid-drag it can hold a quest from another list
  lookup: ReadonlyMap<string, QuestItem> // every live quest by id
  sorting: boolean // a drag is in flight (or its result is being saved)
  dropTarget: boolean // the dragged quest came from another list and would land here
  todayKey: string
  claimed: boolean
  open: boolean
  onToggle: () => void
  onAdd: () => void
  onEdit: (item: QuestItem) => void
  projects?: ReadonlyMap<string, ProjectSummary> // board summaries by quest id (undefined while loading)
  bare?: boolean // the list on its own tab: no accordion header, always open
}

const EMPTY: Record<QuestCategory, { title: string; body: string; cta: string }> = {
  dq: { title: 'No rituals yet', body: 'A page read, a short walk. Small rites, kept daily, become the legend.', cta: 'Add a daily quest' },
  mq: { title: 'No main quest underway', body: 'Name the one thing that would make this season count.', cta: 'Add a main quest' },
  sq: { title: 'The side roads are quiet', body: 'Errands, curiosities, little detours. Jot them here.', cta: 'Add a side quest' },
}

export function QuestSection(props: Props) {
  const { category, items, ids, lookup, sorting, dropTarget, todayKey, claimed, open, onToggle, onAdd, onEdit, projects, bare } = props
  const meta = CATEGORY[category]
  const reduce = useReducedMotion()
  const toast = useToast()
  const panelId = useId()
  const [showEarlier, setShowEarlier] = useState(false)
  // The whole section takes drops, so a quest can land in a collapsed or empty list (at its end).
  const { setNodeRef } = useDroppable({ id: category })

  const current = ids.map((id) => lookup.get(id)).filter((i): i is QuestItem => !!i)
  const earlier = items.filter(isEarlier)
  // Same basis as the day summary (see dayCount).
  const { done: doneCount, total: dueCount } = dayCount(current)
  const later = current.filter((i) => i.when === 'upcoming').length
  const allDone = dueCount > 0 && doneCount === dueCount

  // Neighbors in the visible list may be separated by hidden ones; step past them.
  async function move(item: QuestItem, direction: -1 | 1) {
    const target = current[current.indexOf(item) + direction]
    if (!target) return
    const steps = Math.abs(items.indexOf(target) - items.indexOf(item))
    await toast.run(async () => {
      for (let n = 0; n < steps; n++) await moveQuest(item.quest.id, direction)
    })
  }

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, bounce: 0, duration: 0.42 }

  return (
    <section
      ref={setNodeRef}
      className={`-m-1.5 rounded-[22px] p-1.5 transition-colors duration-150 ${dropTarget ? 'bg-sunken/70 ring-2 ring-[var(--drop)]' : ''}`}
      style={{ ['--drop' as string]: meta.color }}
    >
      {!bare && (
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="group/head flex w-full items-center gap-3 rounded-control px-1 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <meta.Icon aria-hidden className="size-7 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] leading-tight font-semibold text-ink">{meta.label}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted sm:truncate">{meta.blurb}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2.5">
            {dueCount > 0 ? (
              <span
                className={`text-[13px] font-medium tabular-nums transition-colors ${allDone ? '' : 'text-muted'}`}
                style={allDone ? { color: meta.ink } : undefined}
                aria-label={`${doneCount} of ${dueCount} done`}
              >
                {doneCount}
                <span className="text-faint">/{dueCount}</span>
              </span>
            ) : later > 0 ? (
              <span className="text-[13px] text-faint tabular-nums">{later} later</span>
            ) : null}
            <motion.span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg text-faint transition-colors group-hover/head:bg-sunken group-hover/head:text-ink"
              animate={{ rotate: open ? 0 : -90 }}
              transition={spring}
            >
              <ChevronDown className="size-4" strokeWidth={1.75} />
            </motion.span>
          </span>
        </button>
      </h2>
      )}

      <AnimatePresence initial={false}>
        {(open || bare) && (
          <motion.div
            id={panelId}
            role={bare ? undefined : 'region'}
            aria-label={bare ? undefined : meta.label}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: spring, opacity: reduce ? { duration: 0 } : { duration: 0.2 } }}
            className={bare ? undefined : 'overflow-hidden'}
          >
            <div className={`${bare ? '' : 'mt-1 '}rounded-card border border-line bg-surface px-1.5 pt-1.5 pb-2 sm:px-2`}>
              {current.length === 0 && earlier.length === 0 ? (
                <EmptyState category={category} onAdd={onAdd} />
              ) : (
                <>
                  {current.length === 0 && <p className="px-3 py-3 text-[13px] text-faint">Nothing open here. Nicely done.</p>}
                  <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    <ul>
                      <AnimatePresence initial={false}>
                        {current.map((item, i) => (
                          <SortableQuest key={item.quest.id} id={item.quest.id} title={item.quest.title} sorting={sorting}>
                            {(drag) => {
                              const shared = {
                                item,
                                todayKey,
                                drag,
                                onEdit: () => onEdit(item),
                                onMove: (d: -1 | 1) => move(item, d),
                                canMoveUp: !sorting && i > 0,
                                canMoveDown: !sorting && i < current.length - 1,
                              }
                              return isProject(item.quest) ? (
                                <ProjectRow summary={projects?.get(item.quest.id)} {...shared} />
                              ) : (
                                <QuestRow claimed={claimed} {...shared} />
                              )
                            }}
                          </SortableQuest>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </SortableContext>
                  <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                    <AddButton label={EMPTY[category].cta} onClick={onAdd} />
                    {earlier.length > 0 && (
                      <button
                        type="button"
                        aria-expanded={showEarlier}
                        onClick={() => setShowEarlier((v) => !v)}
                        className="rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {showEarlier ? 'Hide earlier' : `${earlier.length} earlier`}
                      </button>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {showEarlier && earlier.length > 0 && (
                      <motion.ul
                        key="earlier"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ height: spring, opacity: reduce ? { duration: 0 } : { duration: 0.2 } }}
                        className="mt-1 overflow-hidden border-t border-dashed border-line pt-1"
                      >
                        {earlier.map((item) =>
                          isProject(item.quest) ? (
                            <ProjectRow key={item.quest.id} item={item} summary={projects?.get(item.quest.id)} todayKey={todayKey} onEdit={() => onEdit(item)} />
                          ) : (
                            <QuestRow key={item.quest.id} item={item} todayKey={todayKey} claimed={claimed} onEdit={() => onEdit(item)} />
                          ),
                        )}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

// Wires one row into drag and drop: the row renders the grip and takes the transform on its inner box (the <li>
// keeps motion's enter/exit; its layout animation is off while sorting so it doesn't fight dnd-kit).
function SortableQuest({ id, title, sorting, children }: { id: string; title: string; sorting: boolean; children: (drag: RowDrag) => ReactNode }) {
  const reduce = useReducedMotion()
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id })
  return children({
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition: reduce ? undefined : transition },
    dragging: isDragging,
    sorting,
    handle: (
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-roledescription="draggable quest"
        aria-label={`Reorder “${title}”`}
        className="absolute top-1/2 -left-[5px] z-10 grid h-8 w-4 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-md text-faint opacity-0 transition outline-none group-hover/row:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing pointer-coarse:opacity-50"
      >
        <GripVertical aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
    ),
  })
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group/add inline-flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-[22px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong transition group-hover/add:border-solid group-hover/add:border-current">
        <Plus aria-hidden className="size-3" strokeWidth={2.25} />
      </span>
      {label}
    </button>
  )
}

function EmptyState({ category, onAdd }: { category: QuestCategory; onAdd: () => void }) {
  const meta = CATEGORY[category]
  const copy = EMPTY[category]
  return (
    <div className="flex flex-col items-center px-6 pt-7 pb-6 text-center">
      <meta.Icon aria-hidden className="size-12" />
      <p className="mt-4 font-display text-[17px] font-normal text-ink">{copy.title}</p>
      <p className="mt-1 max-w-[30ch] text-[13px] leading-relaxed text-muted">{copy.body}</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-[13px] font-semibold transition hover:brightness-95 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]"
        style={{ backgroundColor: meta.soft, color: meta.ink }}
      >
        <Plus aria-hidden className="size-3.5" strokeWidth={2} />
        {copy.cta}
      </button>
    </div>
  )
}
