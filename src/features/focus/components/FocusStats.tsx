import { format, isToday, isYesterday } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FocusSession } from '../../../db/types'
import { ColumnChart, Tile, type Column } from '../../insights/charts'
import { parseDayKey } from '../../quests/day'
import { focusStats, formatMinutes, ratingLabel, weekLine } from '../model'
import { deleteSession } from '../repo'

const RECENT = 5

// How focused you've been: time, your own rating, and drifts noticed. A mirror, not a score.
export function FocusStats({ sessions, today }: { sessions: FocusSession[]; today: Date }) {
  if (!sessions.length) return <HowItWorks />
  const s = focusStats(sessions, today)
  const avg = s.avgRating
  const columns: Column[] = s.days.map((d, i) => {
    const date = parseDayKey(d.key)
    const last = i === s.days.length - 1
    return {
      key: d.key,
      label: last ? 'Today' : format(date, 'EEE'),
      long: last ? 'Today' : format(date, 'EEEE, MMM d'),
      value: d.minutes,
      display: formatMinutes(d.minutes),
      emphasis: last,
    }
  })

  return (
    <section aria-labelledby="focus-stats" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="focus-stats" className="text-[17px] font-semibold">
          Your last 7 days
        </h2>
        <p className="text-[13px] text-muted">{weekLine(s)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Tile label="Today" value={formatMinutes(s.todayMin)} note={s.todayMin ? 'Focused time. Pauses don’t count.' : 'Nothing yet today. Fifteen minutes is a start.'} />
        <Tile label="This week" value={formatMinutes(s.weekMin)} note={`Across ${s.weekSessions} ${s.weekSessions === 1 ? 'session' : 'sessions'}.`} />
        <Tile
          label="How focused it felt"
          value={avg ? avg.toFixed(1) : '–'}
          unit={avg ? 'of 5' : undefined}
          note={avg ? `Mostly ${ratingLabel(Math.round(avg) as 1 | 2 | 3 | 4 | 5).toLowerCase()}, by your own rating.` : 'Rate a session when it ends to see this.'}
        />
        <Tile
          label="Drifts caught"
          value={s.parked}
          note={`Thoughts parked instead of chased${s.away ? `, and ${s.away} tab ${s.away === 1 ? 'switch' : 'switches'}` : ''}. Noticing is the skill.`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="rounded-card border border-line bg-surface p-5">
          <h3 className="text-[15px] font-semibold">Minutes focused per day</h3>
          <div className="mt-4">
            <ColumnChart columns={columns} height={170} unit="focused" />
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface p-5">
          <h3 className="text-[15px] font-semibold">Recent sessions</h3>
          <ul className="mt-1.5 divide-y divide-line">
            {sessions.slice(0, RECENT).map((x) => (
              <SessionRow key={x.id} session={x} />
            ))}
          </ul>
        </section>
      </div>
    </section>
  )
}

function when(iso: string): string {
  const d = new Date(iso)
  const day = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEE, MMM d')
  return `${day}, ${format(d, 'h:mm a')}`
}

// Deleting takes two clicks: the trash turns into a "Delete" button for a few seconds.
function SessionRow({ session: x }: { session: FocusSession }) {
  const [confirm, setConfirm] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  function arm() {
    setConfirm(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setConfirm(false), 4000)
  }

  return (
    <li className="group flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-medium">{x.task}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-faint">
          {when(x.startedAt)}
          {x.rating ? `, felt ${ratingLabel(x.rating).toLowerCase()}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatMinutes(x.focusMs / 60_000)}</span>
      {confirm ? (
        <button
          type="button"
          onClick={() => void deleteSession(x.id)}
          onBlur={() => setConfirm(false)}
          autoFocus
          className="shrink-0 rounded-control bg-danger-soft px-2.5 py-1 text-[13px] font-semibold text-danger-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Delete
        </button>
      ) : (
        <button
          type="button"
          aria-label={`Delete session: ${x.task}`}
          onClick={arm}
          className="grid size-8 shrink-0 place-items-center rounded-control text-faint opacity-50 transition outline-none group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      )}
    </li>
  )
}

// Empty state: the four steps of a session, in order.
function HowItWorks() {
  const steps = [
    ['Pick one thing', 'Link it to a quest or card and you can mark it done at the end.'],
    ['Start small', 'Fifteen minutes is enough. The clock keeps counting if you’re in the flow.'],
    ['Park, don’t chase', 'Write stray thoughts down and go back. They’ll wait.'],
    ['Rate it, then rest', 'Say how focused it felt, then take a break sized to the work.'],
  ]
  return (
    <section aria-labelledby="focus-how" className="flex flex-col gap-3">
      <h2 id="focus-how" className="text-[17px] font-semibold">
        How a session goes
      </h2>
      <ol className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent lg:grid-cols-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="px-4 py-3.5 sm:rounded-card sm:border sm:border-line sm:bg-surface sm:p-4">
            <span className="text-[13px] font-semibold text-ring tabular-nums">Step {i + 1}</span>
            <p className="mt-1 text-[14.5px] font-semibold">{title}</p>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">{body}</p>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-faint">Your focus time, ratings and drifts show up here after your first session.</p>
    </section>
  )
}
