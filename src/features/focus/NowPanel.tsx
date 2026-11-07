import { motion, useReducedMotion } from 'motion/react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { useInProgress } from '../board/hooks'
import { deadlineOf } from '../projects/model'
import { useTasks } from '../tasks/hooks'
import { LooseEnds, NextLooseEnd } from '../tasks/LooseEnds'
import { InProgressStrip } from './InProgressStrip'

const TABS = ['progress', 'loose'] as const
type Tab = (typeof TABS)[number]
const STORE = 'pebblework.home.now-tab'
const MAX_NEXT_LOOSE_ENDS = 2 // shown under In progress; the rest wait in the Loose ends tab

function readTab(): Tab {
  try {
    return localStorage.getItem(STORE) === 'loose' ? 'loose' : 'progress'
  } catch {
    return 'progress'
  }
}

// Home's "what's on my plate" slot: started work and loose ends share one space, so the quest list below keeps its room.
export function NowPanel({ todayKey }: { todayKey: string }) {
  const items = useInProgress()
  const tasks = useTasks()
  const reduce = useReducedMotion()
  const baseId = useId()
  const [tab, setTab] = useState(readTab)
  const refs = useRef(new Map<Tab, HTMLButtonElement>())

  const open = tasks?.filter((task) => !task.completedAt) ?? []
  const late = open.filter((task) => deadlineOf(task.dueDate, todayKey, false)?.tone === 'late').length

  function select(next: Tab) {
    setTab(next)
    try {
      localStorage.setItem(STORE, next)
    } catch {
      // Private mode: the tab just won't be remembered.
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = tab === 'progress' ? 'loose' : 'progress'
    select(next)
    refs.current.get(next)?.focus()
  }

  const labels: Record<Tab, { title: string; count?: number; extra?: string }> = {
    progress: { title: 'In progress', count: items?.length },
    loose: { title: 'Loose ends', count: tasks && open.length, extra: late > 0 ? `${late} late` : undefined },
  }

  return (
    <section aria-label="On your plate" className="min-w-0">
      <div role="tablist" aria-label="On your plate" onKeyDown={onKey} className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {TABS.map((t) => {
          const { title, count, extra } = labels[t]
          const selected = tab === t
          return (
            <button
              key={t}
              ref={(el) => {
                if (el) refs.current.set(t, el)
                else refs.current.delete(t)
              }}
              type="button"
              role="tab"
              id={`${baseId}-${t}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t)}
              className={`flex items-center gap-2 rounded-control py-1 text-[15px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected ? 'text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {/* The trail blaze marks where attention is, and walks to the tab you pick. */}
              <span aria-hidden className="grid size-2 shrink-0 place-items-center">
                {selected && (
                  <motion.span layoutId={`${baseId}-blaze`} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }} className="size-2 rounded-full bg-blaze" />
                )}
              </span>
              {title}
              {!!count && <span className="font-normal text-muted tabular-nums">{count}</span>}
              {extra && <span className="text-[13px] font-medium text-danger-ink">{extra}</span>}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-${tab}`} className="mt-2.5">
        {tab === 'progress' ? (
          <>
            <InProgressStrip items={items} todayKey={todayKey} />
            {open.slice(0, MAX_NEXT_LOOSE_ENDS).map((task) => (
              <NextLooseEnd key={task.id} task={task} todayKey={todayKey} />
            ))}
          </>
        ) : (
          <LooseEnds tasks={tasks} todayKey={todayKey} />
        )}
      </div>
    </section>
  )
}
