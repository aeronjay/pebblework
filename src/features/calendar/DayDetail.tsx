import { format } from 'date-fns'
import { Check, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { trapTab, useModal } from '../board/components/a11y'
import { useDayRecord } from '../plan/hooks'
import type { PlanDay, PromiseLine } from '../plan/model'
import { addDaysToKey, parseDayKey } from '../quests/day'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface Props {
  dayKey: string | null // the day picked on the calendar; null = closed
  todayKey: string
  onPlan?: (day: PlanDay) => void // opens the plan sheet (today and tomorrow only)
  onClose: () => void
}

// A day picked on the calendar: what you promised for it (kept, broken, or still open) and the note you wrote with
// its plan.
// "Edit plan" waits until this has fully closed (focus handed back, page scroll restored) before the plan sheet opens.
export function DayDetail({ onPlan, ...props }: Props) {
  const pending = useRef<PlanDay | null>(null)
  return createPortal(
    <AnimatePresence
      onExitComplete={() => {
        const day = pending.current
        pending.current = null
        if (day && onPlan) requestAnimationFrame(() => onPlan(day))
      }}
    >
      {props.dayKey && (
        <Panel
          {...props}
          dayKey={props.dayKey}
          onPlan={
            onPlan &&
            ((day) => {
              pending.current = day
              props.onClose()
            })
          }
        />
      )}
    </AnimatePresence>,
    document.body,
  )
}

function relative(key: string, todayKey: string): string | undefined {
  if (key === todayKey) return 'Today'
  if (key === addDaysToKey(todayKey, -1)) return 'Yesterday'
  if (key === addDaysToKey(todayKey, 1)) return 'Tomorrow'
  return undefined
}

function Panel({ dayKey, todayKey, onPlan, onClose }: Props & { dayKey: string }) {
  const reduce = useReducedMotion()
  const record = useDayRecord(dayKey, todayKey)
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  useModal(closeBtn)

  const rel = relative(dayKey, todayKey)
  const planDay: PlanDay | undefined = dayKey === todayKey ? 'today' : dayKey === addDaysToKey(todayKey, 1) ? 'tomorrow' : undefined
  const promise = record?.promise ?? []
  const kept = promise.filter((l) => l.state === 'kept').length
  const empty = record && !promise.length && !record.note

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[rgb(12_13_16/0.32)] backdrop-blur-[6px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          trapTab(e, panel.current)
        }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99, transition: { duration: 0.16 } }}
        transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0.18, duration: 0.45 }}
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-line bg-elevated shadow-pop sm:max-w-[460px] sm:rounded-card"
      >
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
          <div className="min-w-0">
            {rel && <p className="text-[12.5px] font-semibold tracking-[0.04em] text-muted uppercase">{rel}</p>}
            <h2 id={titleId} className="mt-0.5 font-display text-[26px] leading-tight font-normal text-ink">
              {format(parseDayKey(dayKey), 'EEEE, MMMM d')}
            </h2>
          </div>
          <button
            ref={closeBtn}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-faint transition hover:bg-sunken hover:text-ink ${focus}`}
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-1 pb-5 sm:px-6">
          {!record ? (
            <div aria-hidden className="h-24 animate-pulse rounded-[14px] bg-sunken/60 motion-reduce:animate-none" />
          ) : empty ? (
            <p className="text-[14px] text-muted">No plan for this day.</p>
          ) : (
            <>
              <section aria-labelledby={`${titleId}-promised`}>
                <div className="flex items-baseline justify-between gap-3 pb-2">
                  <h3 id={`${titleId}-promised`} className="text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">
                    Promised
                  </h3>
                  {promise.length > 0 && (
                    <span className="text-[12.5px] text-muted tabular-nums">
                      Kept {kept} of {promise.length}
                    </span>
                  )}
                </div>
                {promise.length ? (
                  <ul className="flex flex-col gap-2">
                    {promise.map((l) => (
                      <PromiseRow key={l.key} line={l} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13.5px] text-faint">No promise this day.</p>
                )}
              </section>
              <section aria-labelledby={`${titleId}-note`}>
                <h3 id={`${titleId}-note`} className="pb-2 text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">
                  Note
                </h3>
                {record.note ? (
                  <p className="rounded-[14px] bg-sunken/60 px-3.5 py-3 text-[14px] leading-relaxed break-words whitespace-pre-wrap text-ink">{record.note}</p>
                ) : (
                  <p className="text-[13.5px] text-faint">No note this day.</p>
                )}
              </section>
            </>
          )}
        </div>

        {planDay && onPlan && (
          <footer className="flex justify-end border-t border-line bg-surface/60 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
            <button
              type="button"
              onClick={() => onPlan(planDay)}
              className={`rounded-control bg-ink px-4 py-2 text-[13px] font-semibold text-canvas shadow-card transition hover:opacity-90 ${focus} focus-visible:ring-offset-2 focus-visible:ring-offset-elevated`}
            >
              {empty ? `Plan ${planDay}` : 'Edit plan'}
            </button>
          </footer>
        )}
      </motion.div>
    </div>
  )
}

function PromiseRow({ line }: { line: PromiseLine }) {
  return (
    <li className="flex gap-3 text-[14px] leading-snug">
      <span className={`w-[64px] shrink-0 font-medium ${line.state === 'kept' ? 'text-ink' : line.state === 'broken' ? 'text-muted' : 'text-faint'}`}>
        {line.state === 'kept' ? (
          <span className="inline-flex items-center gap-1">
            <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
            Kept
          </span>
        ) : line.state === 'broken' ? (
          'Broken'
        ) : (
          'Open'
        )}
      </span>
      <span className="min-w-0 break-words text-ink">{line.title || 'Untitled'}</span>
    </li>
  )
}
