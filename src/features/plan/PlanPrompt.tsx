import { CalendarClock } from 'lucide-react'
import { useToast } from '../quests/components/toastContext'
import { FRESH_START_LINE, type FreshStart } from './model'
import { skipPlan } from './repo'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// The morning ask, once a day: shown until today has a plan or "Not today". After that the header's Plan button is
// the way in, so the quest list keeps its room. On a fresh-start day (new week, new month, back after a break) it
// leads with that, since those are the days people are most ready to begin again.
export function PlanPrompt({ todayKey, fresh, onPlan }: { todayKey: string; fresh?: FreshStart; onPlan: () => void }) {
  const toast = useToast()
  return (
    <section aria-label="Plan your day" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-line bg-surface px-4 py-3.5">
      <CalendarClock aria-hidden className="size-5 shrink-0 text-ink" strokeWidth={1.75} />
      <div className="min-w-[200px] flex-1">
        <p className="text-[14.5px] font-semibold text-ink">{fresh ? FRESH_START_LINE[fresh] : 'Plan your day in two minutes.'}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
          Give your 1–3 most important quests a start time. Deciding when makes you far more likely to follow through.
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => void toast.run(() => skipPlan(todayKey))}
          className={`rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink ${focus}`}
        >
          Not today
        </button>
        <button type="button" onClick={onPlan} className={`rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-canvas transition hover:opacity-90 ${focus}`}>
          Plan my day
        </button>
      </div>
    </section>
  )
}
