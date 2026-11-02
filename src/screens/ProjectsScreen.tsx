import { Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useToday } from '../app/useToday'
import { useProjects } from '../features/board/hooks'
import { ProjectCard } from '../features/projects/ProjectCard'
import { ProjectsEmpty } from '../features/projects/ProjectsEmpty'
import { FILTERS, filterProjects, sortProjects, type ProjectFilter } from '../features/projects/model'
import { dayKey } from '../features/quests/day'
import { QuestSheet, type SheetTarget } from '../features/quests/components/QuestSheet'
import { ToastProvider } from '../features/quests/components/Toast'

export function ProjectsScreen() {
  return (
    <ToastProvider>
      <Projects />
    </ToastProvider>
  )
}

const primary =
  'inline-flex items-center gap-2 rounded-control bg-ink py-2.5 pr-3 pl-3.5 text-[14px] font-semibold text-canvas shadow-card transition hover:opacity-90 active:scale-[.98] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas'

function Projects() {
  const todayKey = dayKey(useToday())
  const all = useProjects()
  const reduce = useReducedMotion()
  const [filter, setFilter] = useState<ProjectFilter>('all')
  const [sheet, setSheet] = useState<SheetTarget | null>(null)

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

  const sorted = all ? sortProjects(all) : []
  const shown = filterProjects(sorted, filter)
  const open = sorted.filter((p) => !p.quest.projectDoneAt).length
  const count = (f: ProjectFilter) => filterProjects(sorted, f).length

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
            {all ? (all.length ? `${open} open · ${all.length - open} completed` : 'Boards') : ' '}
          </p>
          <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-medium tracking-[-0.02em] text-ink [font-variation-settings:'opsz'_72] md:text-[40px]">
            Projects
          </h1>
          <p className="mt-2 max-w-[52ch] text-[14px] text-muted">Big quests, broken into stages. Every stage you finish earns a stone.</p>
        </div>
        <button type="button" onClick={create} aria-keyshortcuts="N" className={primary}>
          <Plus aria-hidden className="size-4" strokeWidth={2} />
          New project
          <kbd className="ml-1 hidden rounded-[5px] border border-canvas/20 px-1.5 font-sans text-[11px] font-medium text-canvas/70 md:inline">N</kbd>
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
              <p className="font-display text-[18px] font-medium text-ink">No {filter === 'mq' ? 'main' : 'side'} projects yet</p>
              <p className="mt-1 text-[13px] text-muted">Projects you start here get their own board.</p>
              <button type="button" onClick={create} className={`${primary} mt-5`}>
                <Plus aria-hidden className="size-4" strokeWidth={2} />
                New {filter === 'mq' ? 'main' : 'side'} project
              </button>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false} mode="popLayout">
                {shown.map((p) => (
                  <motion.li
                    key={p.quest.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                    className="min-w-0"
                  >
                    <ProjectCard project={p} todayKey={todayKey} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </>
      )}

      <QuestSheet target={sheet} todayKey={todayKey} onClose={() => setSheet(null)} />
    </div>
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
