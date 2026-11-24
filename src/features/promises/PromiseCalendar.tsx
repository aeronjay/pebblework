import { addMonths, format, isSameMonth, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { navTarget, WEEK_STARTS_ON, weekdayLabels } from '../calendar/model'
import { dayKey, monthGrid, parseDayKey } from '../quests/day'
import type { DayEntry } from './model'

const WEEKDAYS = weekdayLabels(WEEK_STARTS_ON)

const iconBtn =
  'inline-flex size-8 items-center justify-center rounded-[10px] text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35 outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface Props {
  days: ReadonlyMap<string, DayEntry> // every day with a promise or something finished
  first: string // the first day in the history; nothing before it can be picked
  todayKey: string
  selected: string | undefined
  onSelect: (key: string) => void
}

type Look = 'all-kept' | 'promise' | 'done' | 'none'

function lookOf(day: DayEntry | undefined, todayKey: string): Look {
  if (!day) return 'none'
  if (day.promise.length) return day.dayKey < todayKey && day.promise.every((l) => l.state === 'kept') ? 'all-kept' : 'promise'
  return day.done.length ? 'done' : 'none'
}

function cellLabel(date: Date, day: DayEntry | undefined): string {
  const name = format(date, 'EEEE, MMMM d')
  if (!day) return `${name}: no promise, nothing finished`
  const kept = day.promise.filter((l) => l.state === 'kept').length
  const promise = day.promise.length ? `kept ${kept} of ${day.promise.length} promised` : 'no promise'
  return `${name}: ${promise}, ${day.done.length} done`
}

// The month at a glance: a day where every promise was kept is filled in; a day with a promise shows one dot per
// promised thing (filled = kept, hollow = broken, dashed = still open); a day with no promise but finished work has its
// number in full ink. Picking a day opens it in the list.
export function PromiseCalendar({ days, first, todayKey, selected, onSelect }: Props) {
  const today = parseDayKey(todayKey)
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [focusKey, setFocusKey] = useState(todayKey)
  const gridRef = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)

  const firstMonth = startOfMonth(parseDayKey(first))
  const thisMonth = startOfMonth(today)
  const cells = monthGrid(month, WEEK_STARTS_ON).map((date) => {
    const key = dayKey(date)
    return { date, key, inMonth: isSameMonth(date, month), enabled: key >= first && key <= todayKey, day: days.get(key) }
  })
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7))
  const rovingKey = cells.some((c) => c.key === focusKey && c.inMonth && c.enabled)
    ? focusKey
    : (cells.find((c) => c.inMonth && c.key === todayKey)?.key ?? cells.filter((c) => c.inMonth && c.enabled).at(-1)?.key)

  // The month's promises, finished days only (today is still being kept).
  const monthDays = cells.filter((c) => c.inMonth && c.day?.promise.length && c.key < todayKey).map((c) => c.day!)
  const lines = monthDays.flatMap((d) => d.promise)
  const kept = lines.filter((l) => l.state === 'kept').length

  useLayoutEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${rovingKey}"]`)?.focus()
  }, [rovingKey, month])

  function goTo(next: Date) {
    const m = startOfMonth(next)
    if (m < firstMonth || m > thisMonth) return false
    setMonth(m)
    return true
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!rovingKey) return
    const target = navTarget(parseDayKey(rovingKey), e.key, WEEK_STARTS_ON)
    if (!target) return
    e.preventDefault()
    const key = dayKey(target)
    if (key < first || key > todayKey) return
    if (!isSameMonth(target, month) && !goTo(target)) return
    refocus.current = true
    setFocusKey(key)
  }

  return (
    <section aria-labelledby="pc-title" className="rounded-card border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="pc-title" className="text-[15px] leading-tight font-semibold text-ink" aria-live="polite">
            {format(month, 'MMMM')} <span className="font-normal text-muted">{format(month, 'yyyy')}</span>
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted tabular-nums">{lines.length ? `Kept ${kept} of ${lines.length}` : 'No promises kept or broken yet'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!isSameMonth(month, today) && (
            <button
              type="button"
              onClick={() => goTo(today)}
              className="mr-1 h-7 rounded-chip border border-line px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Today
            </button>
          )}
          <button type="button" className={iconBtn} disabled={month <= firstMonth} onClick={() => goTo(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft size={17} strokeWidth={1.75} />
          </button>
          <button type="button" className={iconBtn} disabled={month >= thisMonth} onClick={() => goTo(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight size={17} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div role="presentation" className="mb-1.5 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <abbr key={w.long} title={w.long} className="text-center text-[11px] font-medium text-faint no-underline">
              {w.short}
            </abbr>
          ))}
        </div>
        <div ref={gridRef} role="grid" aria-labelledby="pc-title" onKeyDown={onKey} className="flex flex-col gap-1">
          {rows.map((row) => (
            <div key={row[0].key} role="row" className="grid grid-cols-7 gap-1">
              {row.map((c) => {
                if (!c.inMonth) return <div key={c.key} role="gridcell" aria-hidden className="h-11 sm:h-12 lg:h-10" />
                const look = lookOf(c.day, todayKey)
                const isToday = c.key === todayKey
                return (
                  <div key={c.key} role="gridcell" aria-selected={selected === c.key}>
                    <button
                      type="button"
                      data-day={c.key}
                      tabIndex={c.key === rovingKey ? 0 : -1}
                      disabled={!c.enabled}
                      aria-label={c.enabled ? cellLabel(c.date, c.day) : format(c.date, 'EEEE, MMMM d')}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => {
                        setFocusKey(c.key)
                        onSelect(c.key)
                      }}
                      className={`relative mx-auto flex h-11 w-full max-w-[52px] flex-col items-center justify-center gap-[5px] rounded-[11px] text-[13px] leading-none tabular-nums transition-[background,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-default sm:h-12 lg:h-10 ${
                        look === 'all-kept'
                          ? 'bg-ink font-semibold text-canvas hover:opacity-90'
                          : look === 'promise'
                            ? 'bg-sunken font-medium text-ink hover:bg-line'
                            : look === 'done'
                              ? 'font-medium text-ink hover:bg-sunken'
                              : c.enabled
                                ? 'text-faint hover:bg-sunken'
                                : 'text-faint opacity-45'
                      } ${isToday ? 'shadow-[inset_0_0_0_1.5px_var(--color-ink)]' : ''} ${selected === c.key && !isToday ? 'shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]' : ''}`}
                    >
                      <span aria-hidden>{c.date.getDate()}</span>
                      {look === 'promise' && (
                        <span aria-hidden className="flex gap-[3px]">
                          {c.day!.promise.map((l) => (
                            <span
                              key={l.key}
                              className={`size-[5px] rounded-full ${
                                l.state === 'kept' ? 'bg-ink' : l.state === 'broken' ? 'border border-muted' : 'border border-dashed border-faint'
                              }`}
                            />
                          ))}
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <ul aria-label="What the days mean" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-[4px] bg-ink" />
          Kept every promise
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="flex gap-[3px]">
            <span className="size-[6px] rounded-full bg-ink" />
            <span className="size-[6px] rounded-full border border-muted" />
          </span>
          Kept · broken
        </li>
      </ul>
    </section>
  )
}
