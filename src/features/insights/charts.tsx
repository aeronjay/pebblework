import { useState, type ReactNode } from 'react'
import type { QuestCategory } from '../../db/types'
import { PEBBLE } from '../quests/components/Pebble'
import { CATEGORY, CATEGORY_ORDER } from '../quests/meta'

export interface Column {
  key: string
  label: string // under the bar
  long: string // tooltip / accessible name, e.g. "Monday"
  value: number
  display: string // formatted value, e.g. "2.3"
  emphasis?: boolean // the column the story is about: darker, and labeled at its cap
  muted?: boolean // e.g. a partial current week
}

// Single-series column chart: one hue, 4px rounded caps on a shared baseline, hairline baseline, one direct label on
// the emphasized column, a hover/focus readout for the rest. Values also live in each column's accessible name.
export function ColumnChart({ columns, height = 140, unit }: { columns: Column[]; height?: number; unit: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(...columns.map((c) => c.value), 0)
  return (
    <ol className="flex items-end gap-[2px]" style={{ height: height + 40 }} onPointerLeave={() => setHover(null)}>
      {columns.map((c) => {
        const h = max > 0 ? Math.max(c.value > 0 ? 3 : 0, (c.value / max) * height) : 0
        const shown = hover === c.key || (hover === null && c.emphasis)
        return (
          <li
            key={c.key}
            tabIndex={0}
            aria-label={`${c.long}: ${c.display} ${unit}`}
            onPointerEnter={() => setHover(c.key)}
            onFocus={() => setHover(c.key)}
            onBlur={() => setHover(null)}
            className="group relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className={`mb-1 text-[12px] whitespace-nowrap tabular-nums transition-opacity ${shown ? 'opacity-100' : 'opacity-0'} ${hover === c.key ? 'font-semibold text-ink' : 'text-muted'}`}
            >
              {c.display}
            </span>
            <span
              aria-hidden
              className={`block w-full max-w-6 rounded-t-[4px] transition-colors ${c.emphasis ? 'bg-ink' : c.muted ? 'bg-ring/45' : 'bg-ring'} ${hover === c.key && !c.emphasis ? 'brightness-110' : ''}`}
              style={{ height: h }}
            />
            <span aria-hidden className="w-full border-t border-line-strong pt-1.5 text-center text-[11px] font-medium text-muted">
              {c.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// What you finish, split by quest type: one horizontal bar per type, each with its stone and name (never color
// alone), the count and share at the bar's end.
export function CategoryBars({ counts }: { counts: Record<QuestCategory, number> }) {
  const total = CATEGORY_ORDER.reduce((n, c) => n + counts[c], 0)
  const max = Math.max(1, ...CATEGORY_ORDER.map((c) => counts[c]))
  return (
    <ul className="flex flex-col gap-3.5">
      {CATEGORY_ORDER.map((c) => {
        const Icon = PEBBLE[c]
        const share = total ? Math.round((counts[c] / total) * 100) : 0
        return (
          <li key={c} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3" aria-label={`${CATEGORY[c].label}: ${counts[c]}, ${share}%`}>
            <span aria-hidden className="inline-flex items-center gap-2 text-[13.5px] font-medium text-ink">
              <Icon size={18} />
              {CATEGORY[c].label}
            </span>
            <span aria-hidden className="flex min-w-0 items-center gap-2.5">
              <span className="block h-4 rounded-r-[4px]" style={{ width: `${(counts[c] / max) * 78}%`, background: CATEGORY[c].color, minWidth: counts[c] ? 3 : 0 }} />
              <span className="shrink-0 text-[13px] text-muted tabular-nums">
                <span className="font-semibold text-ink">{counts[c]}</span> · {share}%
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function Tile({ label, value, unit, note }: { label: string; value: ReactNode; unit?: string; note?: ReactNode }) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface px-4 py-4">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">{value}</span>
        {unit && <span className="text-[13px] text-muted">{unit}</span>}
      </p>
      {note && <p className="mt-2 text-[12.5px] leading-snug text-faint">{note}</p>}
    </div>
  )
}
