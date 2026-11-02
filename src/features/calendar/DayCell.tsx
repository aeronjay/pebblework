import { Gem } from 'lucide-react'
import type { CSSProperties, FocusEvent, PointerEvent } from 'react'
import { CATEGORY } from '../quests/meta'
import { cellClass, cellDots, dayAriaLabel, tintBackground, type CellDay } from './model'

interface Props {
  day: CellDay
  inMonth: boolean
  focusable: boolean
  lifting: boolean
  index: number
  onHover: (key: string, el: HTMLElement) => void
  onFocusCell: (key: string, el: HTMLElement) => void
}

export function DayCell({ day, inMonth, focusable, lifting, index, onHover, onFocusCell }: Props) {
  const { status } = day
  const style: CSSProperties & Record<'--qc-delay', string> = {
    background: tintBackground(day),
    '--qc-delay': `${(index % 7) * 0.14 + Math.floor(index / 7) * 0.07}s`,
  }
  const ink = day.categories[0] ? CATEGORY[day.categories[0]].ink : undefined
  const progress = day.assigned ? day.done / day.assigned : 0
  const dots = cellDots(day)

  return (
    <div
      role="gridcell"
      data-day={day.key}
      tabIndex={focusable ? 0 : -1}
      aria-label={dayAriaLabel(day)}
      aria-current={day.isToday ? 'date' : undefined}
      aria-selected={false}
      onPointerEnter={(e: PointerEvent<HTMLDivElement>) => onHover(day.key, e.currentTarget)}
      onFocus={(e: FocusEvent<HTMLDivElement>) => onFocusCell(day.key, e.currentTarget)}
      style={style}
      className={`qc-cell group mx-auto flex w-full max-w-[60px] h-11 select-none items-center justify-center rounded-[11px] outline-none transition-[background,opacity,transform] duration-150 ease-out-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-12 lg:h-9 tall:h-[30px] [@media(min-height:860px)]:tall:h-9 ${cellClass(day, inMonth)} ${lifting ? 'qc-lift' : ''}`}
    >
      {/* Hover wash, kept separate so it composes with the tint. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] bg-ink opacity-0 transition-opacity duration-150 group-hover:opacity-[0.04]" />

      <span aria-hidden className="relative -mt-1 text-[13px] leading-none tabular-nums">
        {day.date.getDate()}
      </span>

      {status === 'ready' && (
        <span aria-hidden className="qc-ember absolute top-[7px] right-[7px] size-[5px] rounded-full bg-mq" />
      )}
      {status === 'claimed' && (
        <Gem aria-hidden size={10} strokeWidth={1.75} className="absolute top-1.5 right-1.5 opacity-80" style={{ color: ink }} />
      )}

      <span aria-hidden className="absolute inset-x-0 bottom-[7px] flex justify-center">
        {status === 'pending' ? (
          <span className="h-[2.5px] w-4 overflow-hidden rounded-full bg-ink/15">
            <span className="block h-full rounded-full bg-ink transition-[width] duration-240 ease-out-soft" style={{ width: `${Math.max(progress, 0.08) * 100}%` }} />
          </span>
        ) : (
          dots.length > 0 && (
            <span className="flex gap-[3px]">
              {dots.map((c) => (
                <span
                  key={c}
                  className={`size-1 rounded-full ${status === 'closed' ? 'bg-faint/45' : ''}`}
                  style={
                    status === 'closed'
                      ? undefined
                      : status === 'future'
                        ? { boxShadow: `inset 0 0 0 1px ${CATEGORY[c].color}` }
                        : { background: CATEGORY[c].color }
                  }
                />
              ))}
            </span>
          )
        )}
      </span>
    </div>
  )
}
