import { format } from 'date-fns'
import { CalendarClock, Sunrise } from 'lucide-react'
import type { PlanSlot } from '../../db/types'
import { parseDayKey } from '../quests/day'
import { FRESH_START_LINE, formatTime, type FreshStart, type PlanDay } from './model'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

const COPY: Record<PlanDay, { title: string; body: string; skip: string; plan: string }> = {
  today: {
    title: 'Plan your day in two minutes.',
    body: 'Give your 1–3 most important quests a start time. Deciding when makes you far more likely to follow through.',
    skip: 'Not today',
    plan: 'Plan my day',
  },
  tomorrow: {
    title: 'Set up tomorrow tonight.',
    body: 'Pick 1–3 things for tomorrow and when you’ll start each. You’ll wake up to a plan instead of a blank page.',
    skip: 'Not tonight',
    plan: 'Plan tomorrow',
  },
}

// The daily ask: in the evening, for tomorrow (shown until tomorrow has a plan or "Not tonight"); otherwise, for today
// (shown until today has a plan or "Not today"). After that the header's Plan button is the way in, so the quest list
// keeps its room. On a fresh-start day (new week, new month, back after a break) it leads with that, since those are
// the days people are most ready to begin again.
export function PlanPrompt({ day, fresh, onPlan, onSkip }: { day: PlanDay; fresh?: FreshStart; onPlan: () => void; onSkip: () => void }) {
  const copy = COPY[day]
  return (
    <section aria-label={day === 'today' ? 'Plan your day' : 'Plan tomorrow'} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-surface px-4 py-3.5">
      <CalendarClock aria-hidden className="size-5 shrink-0 text-ink" strokeWidth={1.75} />
      <div className="min-w-[200px] flex-1">
        <p className="text-[14.5px] font-semibold text-ink">{fresh ? FRESH_START_LINE[day][fresh] : copy.title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{copy.body}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={onSkip} className={`rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink ${focus}`}>
          {copy.skip}
        </button>
        <button type="button" onClick={onPlan} className={`rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-canvas transition hover:opacity-90 ${focus}`}>
          {copy.plan}
        </button>
      </div>
    </section>
  )
}

export interface PreviewLine {
  slot: PlanSlot
  title: string
  done?: boolean
}

// A plan made the evening before, at both ends of the night:
// - tomorrow (evenings, once planned): what's waiting in the morning, so there's something to look forward to
// - review (the next morning, until "Looks good" or a change): a quick look before the day starts, with Edit one tap
//   away. Plans made the night before often need a nudge once the day is real.
export function PlanPreview({
  variant,
  dayKey,
  lines,
  onEdit,
  onConfirm,
}: {
  variant: 'tomorrow' | 'review'
  dayKey: string
  lines: PreviewLine[]
  onEdit: () => void
  onConfirm?: () => void
}) {
  const review = variant === 'review'
  const title = review ? 'Your plan for today' : `Tomorrow, ${format(parseDayKey(dayKey), 'EEEE')}`
  return (
    <section aria-label={review ? 'Review today’s plan' : 'Tomorrow’s plan'} className="rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Sunrise aria-hidden className="size-5 shrink-0 text-ink" strokeWidth={1.75} />
        <div className="min-w-[180px] flex-1">
          <p className="text-[14.5px] font-semibold text-ink">
            {title}
            {!review && <span className="font-normal text-muted">{lines.length ? ` · ${lines.length} planned` : ' · nothing needs a time'}</span>}
          </p>
          {review && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
              {lines.length ? 'You made this last night. Still look right?' : 'Last night you left today open. Still the plan?'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className={`rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink ${focus}`}
          >
            Edit
          </button>
          {review && onConfirm && (
            <button type="button" onClick={onConfirm} className={`rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-canvas transition hover:opacity-90 ${focus}`}>
              Looks good
            </button>
          )}
        </div>
      </div>
      {lines.length > 0 && (
        <ol className="mt-2 flex flex-col gap-1 pl-8">
          {lines.map(({ slot, title, done }) => (
            <li key={slot.questId ?? slot.taskId} className="flex gap-3 text-[13.5px] leading-snug">
              <span className="w-[68px] shrink-0 font-medium text-muted tabular-nums">{formatTime(slot.time)}</span>
              <span className={`min-w-0 break-words ${done ? 'text-faint line-through' : 'text-ink'}`}>{title}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
