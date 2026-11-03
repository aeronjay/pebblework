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
  type DragStartEvent,
} from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripHorizontal, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToday } from '../app/useToday'
import { useProjects, type ProjectSummary } from '../features/board/hooks'
import { arrayMove } from '../features/board/components/model'
import { ProjectCard } from '../features/projects/ProjectCard'
import { ProjectsEmpty } from '../features/projects/ProjectsEmpty'
import { FILTERS, filterProjects, mergeShownOrder, sortProjects, type ProjectFilter } from '../features/projects/model'
import { dayKey } from '../features/quests/day'
import { QuestSheet, type SheetTarget } from '../features/quests/components/QuestSheet'
import { ToastProvider } from '../features/quests/components/Toast'
import { useToast } from '../features/quests/components/toastContext'
import { reorderProjects } from '../features/quests/repo'
import { ui } from '../ui/styles'

export function ProjectsScreen() {
  return (
    <ToastProvider>
      <Projects />
    </ToastProvider>
  )
}

const primary = ui.cta

function Projects() {
  const todayKey = dayKey(useToday())
  const all = useProjects()
  const reduce = useReducedMotion()
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [sheet, setSheet] = useState<SheetTarget | null>(null)
  const toast = useToast()
  // Optimistic order (every project's id) until the live query catches up (same `all` array = not yet).
  const [order, setOrder] = useState<{ ids: string[]; base: ProjectSummary[] } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const create = () => setSheet({ mode: 'create', category: filter === 'mq' ? 'mq' : 'sq', project: true })

  // "N" starts a new project, unless the user is typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || sheet) return
      const el = e.target as HTMLElement
      if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      e.preventDefault()
      setSheet({ mode: 'create', category: filter === 'mq' ? 'mq' : 'sq', project: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, filter])

  const auto = all ? sortProjects(all) : []
  const byId = new Map(auto.map((p) => [p.quest.id, p]))
  const pending = !!order && order.base === all
  const sorted = pending && order ? order.ids.map((id) => byId.get(id)).filter((p): p is ProjectSummary => !!p) : auto
  const shown = filterProjects(sorted, filter)
  const shownIds = shown.map((p) => p.quest.id)
  const dragged = dragId ? byId.get(dragId) : undefined

  // Open and completed projects stay apart (completed ones always sort last), so a drop across them does nothing.
  async function onDragEnd({ active, over }: DragEndEvent) {
    setDragId(null)
    if (!over || active.id === over.id || !all) return
    const from = shownIds.indexOf(String(active.id))
    const to = shownIds.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    if (!!shown[from].quest.projectDoneAt !== !!shown[to].quest.projectDoneAt) {
      toast.show('Completed projects stay at the end.', 'info')
      return
    }
    const ids = mergeShownOrder(
      sorted.map((p) => p.quest.id),
      arrayMove(shownIds, from, to),
    )
    setOrder({ ids, base: all })
    const ok = await toast.run(async () => {
      await reorderProjects(ids)
      return true
    })
    if (!ok) setOrder(null)
  }
  const open = sorted.filter((p) => !p.quest.projectDoneAt).length
  const count = (f: ProjectFilter) => filterProjects(sorted, f).length

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-muted">
            {all ? (all.length ? `${open} open, ${all.length - open} completed` : 'Boards') : ' '}
          </p>
          <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.025em] text-ink md:text-[42px]">
            Projects
          </h1>
          <p className="mt-2 max-w-[52ch] text-[14px] text-muted">Big quests, broken into stages. Every stage you finish earns a stone.</p>
        </div>
        <button type="button" onClick={create} aria-keyshortcuts="N" className={primary}>
          <Plus aria-hidden className="size-4" strokeWidth={2} />
          New project
          <kbd className={ui.ctaKbd}>N</kbd>
        </button>
      </header>

      {!all ? (
        <GridSkeleton />
      ) : all.length === 0 ? (
        <ProjectsEmpty onCreate={create} />
      ) : (
        <>
          <div role="group" aria-label="Filter projects" className="mb-5 flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.id)}
                  className={`relative inline-flex items-center gap-1.5 rounded-chip px-3.5 py-1.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'text-canvas' : 'text-muted hover:bg-sunken hover:text-ink'}`}
                >
                  {active && (
                    <motion.span
                      layoutId="project-filter"
                      aria-hidden
                      className="absolute inset-0 rounded-chip bg-ink shadow-card"
                      transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <span className="relative">{f.label}</span>
                  <span className={`relative text-[12px] tabular-nums ${active ? 'text-canvas/70' : 'text-faint'}`}>{count(f.id)}</span>
                </button>
              )
            })}
          </div>

          {shown.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
              <p className="font-display text-[18px] font-normal text-ink">No {filter === 'mq' ? 'main' : 'side'} projects yet</p>
              <p className="mt-1 text-[13px] text-muted">Projects you start here get their own board.</p>
              <button type="button" onClick={create} className={`${primary} mt-5`}>
                <Plus aria-hidden className="size-4" strokeWidth={2} />
                New {filter === 'mq' ? 'main' : 'side'} project
              </button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={({ active }: DragStartEvent) => setDragId(String(active.id))}
              onDragEnd={onDragEnd}
              onDragCancel={() => setDragId(null)}
              accessibility={{
                screenReaderInstructions: {
                  draggable: 'Press Space to pick up a project, arrow keys to move it, Space to drop, Escape to cancel.',
                },
              }}
            >
              <SortableContext items={shownIds} strategy={rectSortingStrategy}>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {shown.map((p) => (
                      <SortableProject key={p.quest.id} project={p} todayKey={todayKey} sorting={!!dragId || pending} />
                    ))}
                  </AnimatePresence>
                </ul>
              </SortableContext>
              {createPortal(
                <DragOverlay zIndex={60}>
                  {dragged ? (
                    <div className="rotate-[1.5deg] cursor-grabbing rounded-card shadow-pop">
                      <ProjectCard project={dragged} todayKey={todayKey} />
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body,
              )}
            </DndContext>
          )}
        </>
      )}

      <QuestSheet target={sheet} todayKey={todayKey} onClose={() => setSheet(null)} />
    </div>
  )
}

// One grid cell: the card plus a grip (outside the card's link) to drag it to a new position.
function SortableProject({ project, todayKey, sorting }: { project: ProjectSummary; todayKey: string; sorting: boolean }) {
  const reduce = useReducedMotion()
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: project.quest.id })
  // While sorting, dnd-kit owns the movement; motion's layout animation would fight it.
  return (
    <motion.li
      layout={!reduce && !sorting}
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce || sorting ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
      className="group/cell min-w-0"
    >
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition: reduce ? undefined : transition }}
        className={`relative ${isDragging ? 'opacity-40' : ''}`}
      >
        <ProjectCard project={project} todayKey={todayKey} />
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-roledescription="draggable project"
          aria-label={`Reorder “${project.quest.title}”`}
          className="absolute top-1 left-1/2 z-10 grid h-5 w-10 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-md text-faint opacity-0 transition outline-none group-hover/cell:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing pointer-coarse:opacity-60"
        >
          <GripHorizontal aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </motion.li>
  )
}

function GridSkeleton() {
  return (
    <div aria-hidden className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[236px] animate-pulse rounded-card border border-line bg-surface shadow-card motion-reduce:animate-none" />
      ))}
    </div>
  )
}
