import { addDays, addMonths, eachDayOfInterval, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { navTarget, weekdayLabels, WEEK_STARTS_ON } from '../calendar/model'
import { deadlineOf, type DeadlineTone } from '../projects/model'
import { dayKey, parseDayKey } from '../quests/day'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'
const GAP = 6
const EDGE = 8
// The chosen day is a stone, not a circle: it's the one thing a deadline adds to the list.
const PEBBLE = '58% 42% 54% 46% / 50% 58% 42% 50%'

const TONE: Record<DeadlineTone, string> = {
  calm: 'bg-sunken/70 text-muted hover:text-ink',
  soon: 'bg-blaze-soft text-blaze-ink',
  late: 'bg-danger-soft text-danger-ink',
}

interface PopoverProps {
  anchor: RefObject<HTMLElement | null>
  value?: string
  todayKey: string
  label: string
  min?: string // days before this can't be picked
  clearable?: boolean // offer "Clear" when a day is set (default true)
  align?: 'start' | 'end' // which anchor edge the panel lines up with (default end)
  onPick: (value: string | null) => void
  onClose: (refocus: boolean) => void
}

// A month grid in the page's own style, used for every date the app asks for. Portaled and fixed so a scrolling list
// or a sheet can't clip it.
export function DatePopover({ anchor, value, todayKey, label, min, clearable = true, align = 'end', onPick, onClose }: PopoverProps) {
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const refocusDay = useRef(true)
  const [cursor, setCursor] = useState(() => parseDayKey(value ?? todayKey))
  const [pos, setPos] = useState({ top: -9999, left: -9999 })
  const today = parseDayKey(todayKey)
  const first = startOfWeek(startOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON })
  // Always six weeks, so the panel keeps its size from month to month.
  const days = eachDayOfInterval({ start: first, end: addDays(first, 41) })
  const cursorKey = dayKey(cursor)

  useLayoutEffect(() => {
    function place() {
      const a = anchor.current?.getBoundingClientRect()
      const p = panel.current?.getBoundingClientRect()
      if (!a || !p) return
      const below = a.bottom + GAP
      const top = below + p.height > window.innerHeight - EDGE ? Math.max(EDGE, a.top - GAP - p.height) : below
      const left = align === 'start' ? a.left : a.right - p.width
      setPos({ top, left: Math.max(EDGE, Math.min(left, window.innerWidth - p.width - EDGE)) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, align])

  useEffect(() => {
    function onDown(e: PointerEvent) {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) onClose(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [anchor, onClose])

  useEffect(() => {
    if (!refocusDay.current) return
    refocusDay.current = false
    panel.current?.querySelector<HTMLElement>(`[data-day="${cursorKey}"]`)?.focus({ preventScroll: true })
  }, [cursorKey])

  function onGridKey(e: KeyboardEvent) {
    const next = navTarget(cursor, e.key)
    if (!next) return
    e.preventDefault()
    refocusDay.current = true
    setCursor(next)
  }

  const quick = 'h-8 grow rounded-control px-1 text-[13px] whitespace-nowrap font-medium text-muted transition hover:bg-sunken hover:text-ink ' + focus
  const month = 'grid size-8 place-items-center rounded-control text-muted transition hover:bg-sunken hover:text-ink ' + focus

  return createPortal(
    <motion.div
      ref={panel}
      role="dialog"
      aria-label={label}
      initial={reduce ? false : { opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      style={{ top: pos.top, left: pos.left }}
      onKeyDown={(e) => {
        e.stopPropagation() // Home's "N" shortcut stays out of the picker.
        if (e.key === 'Escape') onClose(true)
      }}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null
        if (to && !panel.current?.contains(to) && !anchor.current?.contains(to)) onClose(false)
      }}
      className="fixed z-[56] w-[280px] origin-top-right rounded-card bg-elevated p-3 text-ink shadow-pop ring-1 ring-line-strong"
    >
      <div className="flex items-center justify-between">
        <button type="button" className={month} onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
          <ChevronLeft aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
        <p aria-live="polite" className="font-display text-[17px] leading-none font-normal tracking-[-0.01em]">
          {format(cursor, 'MMMM yyyy')}
        </p>
        <button type="button" className={month} onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
          <ChevronRight aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      <div role="grid" aria-label={format(cursor, 'MMMM yyyy')} onKeyDown={onGridKey} className="mt-2 grid grid-cols-7">
        {weekdayLabels().map((d) => (
          <abbr key={d.long} title={d.long} className="grid h-7 place-items-center text-[12px] text-faint no-underline">
            {d.short}
          </abbr>
        ))}
        {days.map((d) => {
          const key = dayKey(d)
          const selected = key === value
          const isToday = key === todayKey
          const blocked = !!min && key < min
          const tone = selected ? 'font-semibold text-on-blaze' : !isSameMonth(d, cursor) || d < today ? 'text-faint' : 'text-ink'
          return (
            <button
              key={key}
              type="button"
              data-day={key}
              tabIndex={key === cursorKey ? 0 : -1}
              aria-pressed={selected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={format(d, 'EEEE, MMMM d')}
              aria-disabled={blocked || undefined}
              onClick={() => !blocked && onPick(key)}
              className={`group relative grid h-9 place-items-center text-[13.5px] tabular-nums outline-none ${tone} ${blocked ? 'cursor-not-allowed opacity-45' : ''}`}
            >
              <span
                aria-hidden
                style={{ borderRadius: PEBBLE }}
                className={`absolute inset-x-[3px] inset-y-[2px] transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring ${
                  selected ? 'bg-blaze' : blocked ? '' : 'group-hover:bg-sunken'
                }`}
              />
              <span className="relative">{format(d, 'd')}</span>
              {isToday && <span aria-hidden className={`absolute bottom-[5px] size-1 rounded-full ${selected ? 'bg-on-blaze' : 'bg-blaze'}`} />}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-1 border-t border-line pt-2">
        <button type="button" className={quick} onClick={() => onPick(todayKey)}>
          Today
        </button>
        <button type="button" className={quick} onClick={() => onPick(dayKey(addDays(today, 1)))}>
          Tomorrow
        </button>
        <button type="button" className={quick} onClick={() => onPick(dayKey(addDays(today, 7)))}>
          Next week
        </button>
        {value && clearable && (
          <button type="button" className={`${quick} hover:text-danger-ink`} onClick={() => onPick(null)}>
            Clear
          </button>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}

interface DueControlProps {
  value?: string
  todayKey: string
  name: string // what the deadline is for, for screen readers
  quiet?: boolean // with no date, show only while the row is hovered or focused
  onChange: (value: string | null) => void
}

// With a date: a chip naming it. Without: just a small calendar, so undated rows stay clean.
export function DueControl({ value, todayKey, name, quiet, onChange }: DueControlProps) {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const due = deadlineOf(value, todayKey, false)
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={due ? `Deadline for ${name}: ${due.label}. Change` : `Add a deadline to ${name}`}
        onClick={() => setOpen((v) => !v)}
        className={
          due
            ? `mt-0.5 inline-flex h-6 shrink-0 items-center rounded-chip px-2 text-[12px] font-medium whitespace-nowrap tabular-nums transition ${TONE[due.tone]} ${focus}`
            : `grid size-7 shrink-0 place-items-center rounded-md text-faint transition hover:bg-sunken hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-60 ${
                quiet && !open ? 'opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100' : ''
              } ${focus}`
        }
      >
        {due ? due.label.replace(/^Due /, '') : <CalendarPlus aria-hidden className="size-4" strokeWidth={1.75} />}
      </button>
      {open && (
        <DatePopover
          anchor={button}
          value={value}
          todayKey={todayKey}
          label={`Deadline for ${name}`}
          onClose={close}
          onPick={(next) => {
            onChange(next)
            close(true)
          }}
        />
      )}
    </>
  )
}

interface DateFieldProps {
  id?: string
  value?: string
  todayKey: string
  label: string // names the field for screen readers and titles the picker
  placeholder?: string
  min?: string
  clearable?: boolean
  disabled?: boolean
  className?: string
  onChange: (value: string | null) => void
}

// A form field that opens the same month grid, in place of the browser's own date input.
export function DateField({ id, value, todayKey, label, placeholder = 'Pick a date', min, clearable, disabled, className = '', onChange }: DateFieldProps) {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])
  const shown = value ? format(parseDayKey(value), 'EEE, MMM d, yyyy') : undefined

  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${shown ?? 'none'}. Change`}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 text-left tabular-nums ${className}`}
      >
        <CalendarDays aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
        <span className={`min-w-0 flex-1 truncate ${shown ? '' : 'text-faint'}`}>{shown ?? placeholder}</span>
      </button>
      {open && (
        <DatePopover
          anchor={button}
          value={value}
          todayKey={todayKey}
          label={label}
          min={min}
          clearable={clearable}
          align="start"
          onClose={close}
          onPick={(next) => {
            onChange(next)
            close(true)
          }}
        />
      )}
    </>
  )
}
