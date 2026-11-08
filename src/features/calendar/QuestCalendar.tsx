import { addMonths, format, isSameMonth, startOfMonth } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useToday } from '../../app/useToday'
import { getSettings } from '../../db/db'
import { buzz, primeAudio } from '../jar/feedback'
import { claimAll } from '../quests/claim'
import { emitClaim, onClaimRequest } from '../quests/claimBus'
import { dayKey, monthGrid, type MonthDay } from '../quests/day'
import { useClaimable, useMonth } from '../quests/hooks'
import { ClaimButton } from './ClaimButton'
import { DayCell } from './DayCell'
import { DayTooltip, TIP_WIDTH, type TipPos } from './DayTooltip'
import { Legend } from './Legend'
import { monthSummary, navTarget, WEEK_STARTS_ON, weekdayLabels, type CellDay } from './model'
import './calendar.css'

const WEEKDAYS = weekdayLabels(WEEK_STARTS_ON)
const LIFT_MS = 760
const MESSAGE_MS = 4500

const iconBtn =
  'inline-flex size-8 items-center justify-center rounded-[10px] text-muted transition-colors duration-150 hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ring'

export function QuestCalendar() {
  const today = useToday()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [dir, setDir] = useState<1 | -1>(1)
  const [focusKey, setFocusKey] = useState(() => dayKey(new Date()))
  const [tip, setTip] = useState<{ key: string; pos: TipPos } | null>(null)
  const [busy, setBusy] = useState(false)
  const [lifting, setLifting] = useState<ReadonlySet<string>>(() => new Set())
  const [message, setMessage] = useState<string | null>(null)
  const reduce = useReducedMotion()

  const gridRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const busyRef = useRef(false)
  const refocus = useRef(false)

  const data = useMonth(month, WEEK_STARTS_ON)
  const claimable = useClaimable()
  const settings = useLiveQuery(() => getSettings())

  // Build cells from the local grid so layout is stable while the query loads or lags behind a month switch.
  const monthKey = dayKey(month)
  const cells = useMemo(() => {
    const byKey = new Map<string, MonthDay>(data.map((d) => [d.key, d]))
    const todayKey = dayKey(today)
    return monthGrid(month, WEEK_STARTS_ON).map((date) => {
      const key = dayKey(date)
      const found = byKey.get(key)
      const day: CellDay = {
        key,
        date,
        isToday: key === todayKey,
        status: found?.status ?? (key > todayKey ? 'future' : 'empty'),
        assigned: found?.assigned ?? 0,
        done: found?.done ?? 0,
        intensity: found?.intensity ?? 0,
        categories: found?.categories ?? [],
      }
      return { day, inMonth: isSameMonth(date, month) }
    })
  }, [data, month, today])

  const rows = useMemo(() => Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7)), [cells])
  const rovingKey = cells.some((c) => c.day.key === focusKey) ? focusKey : (cells.find((c) => c.inMonth)?.day.key ?? '')
  const summary = monthSummary(cells.map((c) => ({ status: c.day.status, inMonth: c.inMonth })))
  const isCurrentMonth = isSameMonth(month, today)
  const tipDay = tip ? cells.find((c) => c.day.key === tip.key)?.day : undefined

  // Restore keyboard focus after a keyboard move re-rendered (or switched) the grid.
  useLayoutEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${rovingKey}"]`)?.focus()
  }, [rovingKey, monthKey])

  useEffect(() => {
    if (!lifting.size) return
    const t = setTimeout(() => setLifting(new Set()), LIFT_MS)
    return () => clearTimeout(t)
  }, [lifting])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), MESSAGE_MS)
    return () => clearTimeout(t)
  }, [message])

  function goTo(next: Date, focus?: string) {
    const m = startOfMonth(next)
    if (m.getTime() === month.getTime()) return
    setDir(m > month ? 1 : -1)
    setMonth(m)
    setTip(null)
    const todayKey = dayKey(today)
    setFocusKey(focus ?? (isSameMonth(m, today) ? todayKey : dayKey(m)))
  }

  function placeTip(key: string, el: HTMLElement) {
    const wrap = gridRef.current?.parentElement
    if (!wrap) return
    const w = wrap.getBoundingClientRect()
    const c = el.getBoundingClientRect()
    const center = c.left - w.left + c.width / 2
    const half = TIP_WIDTH / 2
    const left = w.width <= TIP_WIDTH ? w.width / 2 : Math.min(Math.max(center, half), w.width - half)
    setTip({ key, pos: { left, top: c.top - w.top, arrow: center - left } })
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const current = cells.find((c) => c.day.key === rovingKey)
    if (!current) return
    if ((e.key === 'Enter' || e.key === ' ') && !current.inMonth) {
      e.preventDefault()
      refocus.current = true
      goTo(current.day.date, current.day.key)
      return
    }
    if (e.key === 'Escape') {
      setTip(null)
      return
    }
    const target = navTarget(current.day.date, e.key, WEEK_STARTS_ON)
    if (!target) return
    e.preventDefault()
    const key = dayKey(target)
    if (key === rovingKey) return
    refocus.current = true
    setFocusKey(key)
    if (!isSameMonth(target, month)) goTo(target, key)
  }

  // Claims asked for elsewhere (the "Claim" action on the last-quest toast) run through the same flow.
  const claimRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    claimRef.current = claim
  })
  useEffect(() => onClaimRequest(() => void claimRef.current()), [])

  async function claim() {
    if (busyRef.current || !claimable.days.length) return
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    primeAudio() // the jar's clinks need audio unlocked by this gesture
    if (settings?.haptics) buzz(10)

    // Viewport rects, read before the claim re-renders the cells.
    const fallback = buttonRef.current?.getBoundingClientRect()
    const rects: Record<string, DOMRect> = {}
    for (const key of claimable.days) {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-day="${key}"]`)
      if (el) rects[key] = el.getBoundingClientRect()
    }

    try {
      const result = await claimAll()
      if (!result.days.length) {
        setMessage('Already claimed. Nothing new to add.')
        return
      }
      const origins: Record<string, DOMRect> = {}
      for (const key of result.days) {
        const r = rects[key] ?? fallback
        if (r) origins[key] = r
      }
      setLifting(new Set(result.days))
      try {
        emitClaim({ result, origins })
      } catch (err) {
        console.error('Claim listener failed', err) // the claim itself is saved
      }
    } catch (err) {
      console.error('Claim failed', err)
      setMessage('Couldn’t claim just now. Your progress is safe, so try again in a moment.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="qc-title">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="qc-title" className="text-[15px] leading-tight font-semibold text-ink" aria-live="polite">
              {format(month, 'MMMM')} <span className="font-normal text-muted">{format(month, 'yyyy')}</span>
            </h2>
            <p className="mt-0.5 h-4 text-[12.5px] text-muted tabular-nums">{summary || 'Your days at a glance'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <AnimatePresence initial={false}>
              {!isCurrentMonth && (
                <motion.button
                  key="today"
                  type="button"
                  onClick={() => goTo(today)}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="mr-1 h-7 rounded-chip border border-line px-2.5 text-[12px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Today
                </motion.button>
              )}
            </AnimatePresence>
            <button type="button" className={iconBtn} onClick={() => goTo(addMonths(month, -1))} aria-label="Previous month">
              <ChevronLeft size={17} strokeWidth={1.75} />
            </button>
            <button type="button" className={iconBtn} onClick={() => goTo(addMonths(month, 1))} aria-label="Next month">
              <ChevronRight size={17} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="relative mt-3" onPointerLeave={() => setTip(null)}>
          <div role="presentation" className="mb-1.5 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <abbr key={w.long} title={w.long} className="text-center text-[11px] font-medium text-faint no-underline">
                {w.short}
              </abbr>
            ))}
          </div>
          <motion.div
            key={`m-${monthKey}`}
            ref={gridRef}
            role="grid"
            aria-labelledby="qc-title"
            aria-describedby={tip ? 'qc-tip' : undefined}
            onKeyDown={onGridKey}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTip(null)
            }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-1 tall:gap-0.5"
          >
            {rows.map((row, r) => (
              <div key={row[0]?.day.key ?? r} role="row" className="grid grid-cols-7 gap-1">
                {row.map(({ day, inMonth }, i) => (
                  <DayCell
                    key={day.key}
                    day={day}
                    inMonth={inMonth}
                    focusable={day.key === rovingKey}
                    lifting={lifting.has(day.key)}
                    index={r * 7 + i}
                    onHover={placeTip}
                    onFocusCell={(key, el) => {
                      setFocusKey(key)
                      placeTip(key, el)
                    }}
                  />
                ))}
              </div>
            ))}
          </motion.div>
          {tip && tipDay && <DayTooltip key={`tip-${tip.key}`} day={tipDay} pos={tip.pos} />}
        </div>

        {/* Footer */}
        <div className="mt-3">
          <Legend hint="Claim finished days to drop their stones in the jar." />
          <div className="mt-2.5">
            <ClaimButton ref={buttonRef} days={claimable.days.length} weight={claimable.weight} busy={busy} onClaim={claim} />
            <AnimatePresence>
              {message && (
                <motion.p
                  key={message}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden text-center text-[12px] text-muted"
                >
                  <span className="block pt-2">{message}</span>
                </motion.p>
              )}
            </AnimatePresence>
            <p role="status" className="sr-only">
              {message ?? ''}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
