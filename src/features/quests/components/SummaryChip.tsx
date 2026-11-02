import { Check } from 'lucide-react'
import type { QuestToday } from '../hooks'
import { ProgressRing } from './ProgressRing'

// "3 of 7 done" with a tiny ring; shifts tone once the day is ready or claimed.
export function SummaryChip({ today }: { today: QuestToday }) {
  const { assigned, done, status } = today
  const base = 'inline-flex items-center gap-2 rounded-chip border px-3 py-1 text-[12.5px] font-medium tabular-nums'

  if (status === 'claimed')
    return (
      <span className={`${base} border-transparent bg-dq-soft text-dq-ink`}>
        <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
        Today claimed
      </span>
    )
  if (status === 'ready')
    return (
      <span className={`${base} border-transparent bg-mq-soft text-mq-ink`}>
        <ProgressRing value={1} size={14} color="currentColor" />
        All {done} done, ready to claim
      </span>
    )
  if (!assigned)
    return <span className={`${base} border-line bg-surface text-muted`}>Nothing due today</span>
  return (
    <span className={`${base} border-line bg-surface text-muted shadow-card`}>
      <ProgressRing value={done / assigned} size={14} color="var(--color-dq)" />
      <span>
        <span className="text-ink">{done}</span> of {assigned} done
      </span>
    </span>
  )
}
