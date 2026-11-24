import { format } from 'date-fns'
import { Check, ChevronDown } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { href } from '../app/router'
import { useToday } from '../app/useToday'
import type { PromiseLine } from '../features/plan/model'
import { usePromiseHistory } from '../features/promises/hooks'
import { PromiseCalendar } from '../features/promises/PromiseCalendar'
import { byMonth, historyTotals, type DayEntry, type DoneItem, type HistoryRow } from '../features/promises/model'
import { addDaysToKey, dayKey, parseDayKey } from '../features/quests/day'
import { CATEGORY } from '../features/quests/meta'

const PAGE = 31 // rows shown at first, and per "Show earlier days" (about a month)
const DONE_PREVIEW = 5 // a long "Did" list shows this many until "Show all"

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Promises: day by day, what you promised and what you did. Kept apart from the jar on purpose: this is a record of
// your word, not of stones. Built to stay readable with months of days: a calendar for the month at a glance, then the
// days grouped by month, one compact line each (its promise as dots, kept / broken / open), opened for the detail.
// Picking a day on the calendar opens it in the list and scrolls there.
export function PromisesScreen() {
  const today = useToday()
  const todayKey = dayKey(today)
  const rows = usePromiseHistory(todayKey)
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([todayKey]))
  const [selected, setSelected] = useState<string>()
  const [jump, setJump] = useState<{ id: string; n: number }>()

  const days = useMemo(() => new Map((rows ?? []).flatMap((r) => (r.kind === 'day' ? [[r.day.dayKey, r.day] as const] : []))), [rows])
  const first = rows?.at(-1)
  const firstKey = first ? (first.kind === 'day' ? first.day.dayKey : first.from) : todayKey

  const toggle = (key: string) =>
    setOpen((o) => {
      const next = new Set(o)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // A day picked on the calendar: show enough rows to reach it, open it, and scroll it into view.
  function pick(key: string) {
    if (!rows) return
    const index = rows.findIndex((r) => (r.kind === 'day' ? r.day.dayKey === key : r.from <= key && key <= r.to))
    if (index < 0) return
    const row = rows[index]
    setShown((n) => Math.max(n, Math.ceil((index + 1) / PAGE) * PAGE))
    setSelected(key)
    if (row.kind === 'day') setOpen((o) => new Set(o).add(key))
    setJump((j) => ({ id: row.kind === 'day' ? row.day.dayKey : row.from, n: (j?.n ?? 0) + 1 }))
  }

  useEffect(() => {
    if (!jump) return
    const el = document.getElementById(`pday-${jump.id}`)
    if (!el) return
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    const target = el.querySelector<HTMLElement>('button, [tabindex]') ?? el
    target.focus({ preventScroll: true })
  }, [jump, reduce])

  return (
    <div>
      <header className="mb-8">
        <p className="text-[15px] font-semibold text-muted">Your word</p>
        <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.025em] text-ink md:text-[42px]">Promises</h1>
        <p className="mt-2 max-w-[52ch] text-[14px] text-muted">What you promised each day, and what you did.</p>
      </header>

      {!rows ? (
        <div aria-hidden className="flex flex-col gap-3">
          <div className="h-[84px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
          <div className="h-[260px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
        </div>
      ) : rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <Totals rows={rows} todayKey={todayKey} />
          {/* Big screens: the calendar stays put beside the list while it scrolls. */}
          <div className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start lg:gap-8">
            <div className="lg:sticky lg:top-6">
              <PromiseCalendar days={days} first={firstKey} todayKey={todayKey} selected={selected} onSelect={pick} />
            </div>
            <div className="flex min-w-0 flex-col gap-8">
              {byMonth(rows.slice(0, shown), todayKey).map((m) => (
                <Month
                  key={m.month}
                  month={m.month}
                  rows={m.rows}
                  kept={m.totals.kept}
                  total={m.totals.total}
                  todayKey={todayKey}
                  open={open}
                  selected={selected}
                  onToggle={toggle}
                />
              ))}
            </div>
          </div>
          {rows.length > shown && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className={`rounded-control border border-line-strong bg-surface px-4 py-2 text-[13.5px] font-semibold text-ink transition hover:bg-sunken ${focus}`}
              >
                Show earlier days
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Totals({ rows, todayKey }: { rows: HistoryRow[]; todayKey: string }) {
  const t = historyTotals(rows, todayKey)
  if (!t.total) return <p className="text-[14px] text-muted">No finished days with a promise yet. Plan tomorrow tonight to make your first one.</p>
  return (
    <dl className="grid grid-cols-2 gap-3">
      <Stat label="Promises kept" value={t.kept} of={t.total} />
      <Stat label="Days you kept every one" value={t.wholeDays} />
    </dl>
  )
}

function Stat({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <dt className="text-[12.5px] font-semibold text-muted">{label}</dt>
      <dd className="mt-1 font-display text-[28px] leading-none text-ink tabular-nums">
        {value}
        {of !== undefined && <span className="font-sans text-[15px] text-muted"> of {of}</span>}
      </dd>
    </div>
  )
}

interface MonthProps {
  month: string
  rows: HistoryRow[]
  kept: number
  total: number
  todayKey: string
  open: ReadonlySet<string>
  selected: string | undefined
  onToggle: (key: string) => void
}

function Month({ month, rows, kept, total, todayKey, open, selected, onToggle }: MonthProps) {
  const id = useId()
  const d = parseDayKey(`${month}-01`)
  return (
    <section aria-labelledby={id}>
      <div className="mb-2 flex items-baseline justify-between gap-4 px-1">
        <h2 id={id} className="font-display text-[22px] leading-tight font-normal text-ink">
          {format(d, month.slice(0, 4) === todayKey.slice(0, 4) ? 'MMMM' : 'MMMM yyyy')}
        </h2>
        {total > 0 && <p className="text-[13px] text-muted tabular-nums">Kept {kept} of {total}</p>}
      </div>
      <ol className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((row) => (
          <li key={row.kind === 'day' ? row.day.dayKey : `quiet-${row.from}`} id={`pday-${row.kind === 'day' ? row.day.dayKey : row.from}`} className="scroll-mt-6">
            {row.kind === 'day' ? (
              <Day day={row.day} todayKey={todayKey} open={open.has(row.day.dayKey)} selected={selected === row.day.dayKey} onToggle={() => onToggle(row.day.dayKey)} />
            ) : (
              <Quiet from={row.from} to={row.to} selected={!!selected && row.from <= selected && selected <= row.to} />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function relative(key: string, todayKey: string): string | undefined {
  if (key === todayKey) return 'Today'
  if (key === addDaysToKey(todayKey, -1)) return 'Yesterday'
  return undefined
}

// One day: a compact line (date, promise dots, counts) that opens into what was promised and what was done. Today
// starts open.
function Day({ day, todayKey, open, selected, onToggle }: { day: DayEntry; todayKey: string; open: boolean; selected: boolean; onToggle: () => void }) {
  const isToday = day.dayKey === todayKey
  const panelId = useId()
  const d = parseDayKey(day.dayKey)
  const kept = day.promise.filter((l) => l.state === 'kept').length
  const rel = relative(day.dayKey, todayKey)
  return (
    <div className={selected ? 'bg-sunken/40' : undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-sunken/50 sm:gap-4 sm:px-5 focus-visible:ring-inset ${focus}`}
      >
        <span className="w-[46px] shrink-0 text-center">
          <span className="block text-[11.5px] font-semibold tracking-[0.04em] text-muted uppercase">{format(d, 'EEE')}</span>
          <span className="block font-display text-[22px] leading-tight text-ink tabular-nums">{format(d, 'd')}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {day.promise.length ? <Dots lines={day.promise} /> : <span className="text-[13px] text-faint">No promise</span>}
            {rel && <span className="text-[12.5px] font-semibold text-ink">{rel}</span>}
          </span>
          <span className="mt-0.5 block text-[13px] text-muted tabular-nums">
            {day.promise.length ? `Kept ${kept} of ${day.promise.length} · ` : ''}
            {day.done.length ? `${day.done.length} done` : isToday ? 'nothing done yet' : 'nothing done'}
          </span>
        </span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
      </button>
      {open && (
        <div id={panelId} className="grid gap-4 px-4 pt-1 pb-4 sm:px-5 sm:pl-[86px] md:grid-cols-2 md:gap-6 lg:grid-cols-1 lg:gap-4">
          <section aria-label="Promised">
            <h3 className="pb-1.5 text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">Promised</h3>
            {day.promise.length ? (
              <ul className="flex flex-col gap-1.5">
                {day.promise.map((l) => (
                  <PromiseRow key={l.key} line={l} />
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-faint">No promise this day.</p>
            )}
          </section>
          <DoneList items={day.done} isToday={isToday} />
        </div>
      )}
    </div>
  )
}

const STATE_LABEL: Record<PromiseLine['state'], string> = { kept: 'kept', broken: 'broken', open: 'open' }

// The day's promise at a glance: one dot per promised thing. Filled = kept, hollow = broken, dashed = still open.
function Dots({ lines }: { lines: PromiseLine[] }) {
  const count = (s: PromiseLine['state']) => lines.filter((l) => l.state === s).length
  const label = (['kept', 'broken', 'open'] as const)
    .filter((s) => count(s))
    .map((s) => `${count(s)} ${STATE_LABEL[s]}`)
    .join(', ')
  return (
    <span role="img" aria-label={`Promise: ${label}`} className="inline-flex items-center gap-1">
      {lines.map((l) => (
        <span
          key={l.key}
          className={`size-2.5 rounded-full ${
            l.state === 'kept' ? 'bg-ink' : l.state === 'broken' ? 'border-[1.5px] border-muted' : 'border-[1.5px] border-dashed border-faint'
          }`}
        />
      ))}
    </span>
  )
}

function PromiseRow({ line }: { line: PromiseLine }) {
  return (
    <li className="flex gap-3 text-[13.5px] leading-snug">
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

function DoneList({ items, isToday }: { items: DoneItem[]; isToday: boolean }) {
  const [all, setAll] = useState(false)
  const visible = all ? items : items.slice(0, DONE_PREVIEW)
  return (
    <section aria-label="Did">
      <h3 className="pb-1.5 text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">Did</h3>
      {items.length ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {visible.map((d) => (
              <DoneRow key={d.key} item={d} />
            ))}
          </ul>
          {items.length > DONE_PREVIEW && (
            <button
              type="button"
              onClick={() => setAll((a) => !a)}
              className={`mt-1.5 -ml-2 rounded-control px-2 py-1 text-[12.5px] font-semibold text-muted transition hover:bg-sunken hover:text-ink ${focus}`}
            >
              {all ? 'Show less' : `Show all ${items.length}`}
            </button>
          )}
        </>
      ) : (
        <p className="text-[13.5px] text-faint">{isToday ? 'Nothing yet today.' : 'Nothing finished.'}</p>
      )}
    </section>
  )
}

function DoneRow({ item }: { item: DoneItem }) {
  const meta = item.category ? CATEGORY[item.category] : undefined
  const sub =
    item.kind === 'loose'
      ? 'Loose end'
      : item.kind === 'card'
        ? item.project
          ? `Card in ${item.project}`
          : 'Card'
        : item.kind === 'project'
          ? 'Finished the project'
          : meta?.label
  return (
    <li className="flex gap-2.5 text-[13.5px] leading-snug">
      <span className="mt-[1px] grid size-[16px] shrink-0 place-items-center">
        {meta ? <meta.Icon aria-hidden className="size-full" /> : <span aria-hidden className="size-[13px] rounded-full border-[1.5px] border-line-strong" />}
      </span>
      <span className="min-w-0">
        <span className="break-words text-ink">{item.title}</span>
        <span className="block text-[12px] text-muted">
          {sub}
          {item.promised && <span className="font-medium text-ink"> · promised</span>}
        </span>
      </span>
    </li>
  )
}

function Quiet({ from, to, selected }: { from: string; to: string; selected: boolean }) {
  const short = (k: string) => format(parseDayKey(k), 'MMM d')
  return (
    <p tabIndex={-1} className={`px-4 py-2.5 text-[12.5px] text-faint outline-none sm:px-5 ${selected ? 'bg-sunken/40' : ''}`}>
      {from === to ? short(from) : `${short(from)} – ${short(to)}`} · no promise, nothing finished
    </p>
  )
}

function Empty() {
  return (
    <div className="rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-ink">Nothing here yet.</p>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-[13.5px] leading-relaxed text-muted">
        Promise a few things in your plan, or finish a quest, and each day shows up here: what you promised, and what you did.
      </p>
      <a
        href={href.home}
        className={`mt-4 inline-flex rounded-control bg-ink px-4 py-2 text-[13px] font-semibold text-canvas transition hover:opacity-90 focus-visible:ring-offset-2 ${focus}`}
      >
        Go to Home
      </a>
    </div>
  )
}
