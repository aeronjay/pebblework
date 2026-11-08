import { Clock, CornerDownRight } from 'lucide-react'
import type { PlanSlot } from '../../../db/types'
import { formatTime, laterTime, nowTime } from '../../plan/model'

export interface RowPlan {
  slot: PlanSlot
  next: boolean // the first planned quest not handled yet
  now: Date
  onRetime: (time: string) => void
}

// Today's plan on a row: its start time (editable in place: moving a time is normal, not failing), "Next up" on the
// first one still open, a one-tap "+1 hour" once the time has passed, and the if-then fallback.
export function PlanLine({ plan, title, done }: { plan: RowPlan; title: string; done: boolean }) {
  const { slot, next, now, onRetime } = plan
  const overdue = !done && slot.time < nowTime(now)
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <label
          className={`relative inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-[12px] font-medium tabular-nums transition focus-within:ring-2 focus-within:ring-ring ${
            done ? 'border-line text-faint' : next ? 'border-transparent bg-ink text-canvas' : 'border-line-strong text-ink'
          }`}
        >
          <Clock aria-hidden className="size-3" strokeWidth={2} />
          {formatTime(slot.time)}
          <input
            type="time"
            value={slot.time}
            aria-label={`Start time for ${title}`}
            disabled={done}
            onChange={(e) => e.target.value && e.target.value !== slot.time && onRetime(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
          />
        </label>
        {next && !done && <span className="text-[12px] font-semibold text-ink">{overdue ? 'Up now' : 'Next up'}</span>}
        {overdue && (
          <button
            type="button"
            onClick={() => onRetime(laterTime(slot.time, now))}
            className="rounded-chip px-2 py-0.5 text-[12px] font-medium text-muted transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Move to {formatTime(laterTime(slot.time, now))}
          </button>
        )}
      </div>
      {slot.ifThen && !done && (
        <p className="flex gap-1.5 text-[12.5px] leading-5 text-muted">
          <CornerDownRight aria-hidden className="mt-[3px] size-3 shrink-0 text-faint" strokeWidth={1.75} />
          <span className="min-w-0">If it slips: {slot.ifThen}</span>
        </p>
      )}
    </div>
  )
}
