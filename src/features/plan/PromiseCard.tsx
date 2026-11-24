import { Check, Handshake } from 'lucide-react'
import type { PromiseRecord } from './hooks'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// The morning after a promise: how it went, plainly. Kept ones get a check; broken ones are named, not hidden, because
// a promise only means something if breaking it shows. No red and no scolding: just the record, then the day.
export function PromiseCard({ record, onDismiss }: { record: PromiseRecord; onDismiss: () => void }) {
  const lines = record.yesterday ?? []
  const kept = lines.filter((l) => l.state === 'kept').length
  const all = kept === lines.length
  return (
    <section aria-label="Yesterday’s promise" className="rounded-card border border-line bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Handshake aria-hidden className="size-5 shrink-0 text-ink" strokeWidth={1.75} />
        <div className="min-w-[180px] flex-1">
          <p className="text-[14.5px] font-semibold text-ink">
            {all ? 'You kept your word yesterday.' : `Yesterday you kept ${kept} of ${lines.length}.`}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {record.kept} of {record.total} promises kept so far.
          </p>
        </div>
        <button type="button" onClick={onDismiss} className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:bg-sunken ${focus}`}>
          OK
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1 pl-8">
        {lines.map((l) => (
          <li key={l.key} className="flex gap-3 text-[13.5px] leading-snug">
            <span className="w-[68px] shrink-0 font-medium text-muted">
              {l.state === 'kept' ? (
                <span className="inline-flex items-center gap-1 text-ink">
                  <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
                  Kept
                </span>
              ) : (
                'Broken'
              )}
            </span>
            <span className="min-w-0 break-words text-ink">{l.title}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
