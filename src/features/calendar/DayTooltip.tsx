import { format } from 'date-fns'
import { motion, useReducedMotion } from 'motion/react'
import type { DayStatus } from '../quests/day'
import { CATEGORY } from '../quests/meta'
import { progressText, STATUS_LABEL, type CellDay } from './model'

export const TIP_WIDTH = 196

export interface TipPos {
  left: number // tooltip center, relative to the grid wrapper
  top: number // cell top edge
  arrow: number // arrow offset from tooltip center
}

const DOT: Record<DayStatus, string> = {
  future: 'bg-faint/50',
  empty: 'bg-faint/40',
  pending: 'bg-ink',
  ready: 'bg-mq',
  claimed: 'bg-ink/60',
  closed: 'bg-faint/60',
}

export function DayTooltip({ day, pos }: { day: CellDay; pos: TipPos }) {
  const reduce = useReducedMotion()
  return (
    <div
      role="tooltip"
      id="qc-tip"
      className="pointer-events-none absolute z-20"
      style={{ left: pos.left - TIP_WIDTH / 2, top: pos.top - 8, width: TIP_WIDTH, transform: 'translateY(-100%)' }}
    >
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 3, scale: reduce ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
      style={{ originY: 1 }}
    >
      <div className="rounded-[12px] border border-line bg-elevated px-3 py-2.5 text-[12px] shadow-pop">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium text-ink">{format(day.date, 'EEE, MMM d')}</span>
          {day.isToday && <span className="text-[11px] font-medium text-muted">Today</span>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-muted">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={`size-1.5 rounded-full ${DOT[day.status]}`} />
            {STATUS_LABEL[day.status]}
          </span>
          <span className="whitespace-nowrap tabular-nums">{progressText(day)}</span>
        </div>
        {day.categories.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {day.categories.map((c) => {
              const { Icon, short, soft, ink } = CATEGORY[c]
              return (
                <span key={c} className="inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide" style={{ background: soft, color: ink }}>
                  <Icon size={11} strokeWidth={1.75} />
                  {short}
                </span>
              )
            })}
          </div>
        )}
      </div>
      <span
        aria-hidden
        className="absolute -bottom-[5px] left-1/2 size-2.5 rotate-45 border-r border-b border-line bg-elevated"
        style={{ marginLeft: pos.arrow - 5 }}
      />
    </motion.div>
    </div>
  )
}
