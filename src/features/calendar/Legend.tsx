import { ChevronDown, Gem } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Intensity } from '../quests/day'
import { tintPercent } from './model'

const STORE = 'qc:legend-open'

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORE) === '1'
  } catch {
    return false
  }
}

function Swatch({ className = '', style, children }: { className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <span aria-hidden className={`qc-cell inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] ${className}`} style={style}>
      {children}
    </span>
  )
}

const LEVELS: Intensity[] = [0, 1, 2, 3, 4]
const levelBg = (i: Intensity) => {
  const p = tintPercent(i, 'claimed')
  return p ? `linear-gradient(135deg, color-mix(in oklch, var(--color-dq) ${p}%, transparent), color-mix(in oklch, var(--color-sq) ${p}%, transparent))` : undefined
}

// "Less → More" scale, always visible.
export function IntensityScale() {
  return (
    <span className="flex items-center gap-1 text-[11px] text-faint" aria-label="Color strength shows how many quests were done that day">
      <span aria-hidden>Less</span>
      {LEVELS.map((i) => (
        <Swatch key={i} className={i === 0 ? 'bg-sunken' : ''} style={{ background: levelBg(i), width: 10, height: 10, borderRadius: 3 }} />
      ))}
      <span aria-hidden>More</span>
    </span>
  )
}

const ITEMS: { label: string; hint: string; swatch: ReactNode }[] = [
  { label: 'Today', hint: 'Bar tracks progress', swatch: <Swatch className="qc-today" /> },
  {
    label: 'Ready',
    hint: 'Stones waiting, claim them',
    swatch: (
      <Swatch className="qc-ready" style={{ background: 'color-mix(in oklch, var(--color-mq) 22%, transparent)' }}>
        <span className="qc-ember size-[4px] rounded-full bg-mq" />
      </Swatch>
    ),
  },
  {
    label: 'Claimed',
    hint: 'Stones are in the jar',
    swatch: (
      <Swatch style={{ background: 'color-mix(in oklch, var(--color-dq) 30%, transparent)' }}>
        <Gem size={8} strokeWidth={2} className="text-dq-ink" />
      </Swatch>
    ),
  },
  { label: 'Closed', hint: 'Passed, left unfinished', swatch: <Swatch className="bg-sunken" /> },
  {
    label: 'Upcoming',
    hint: 'Dots mark scheduled quests',
    swatch: (
      <Swatch className="border border-line">
        <span className="size-1 rounded-full" style={{ boxShadow: 'inset 0 0 0 1px var(--color-mq)' }} />
      </Swatch>
    ),
  },
]

export function Legend({ hint }: { hint?: string }) {
  const [open, setOpen] = useState(readOpen)
  const reduce = useReducedMotion()
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(STORE, v ? '0' : '1')
      } catch {
        // Remembering the toggle is optional.
      }
      return !v
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        {hint && <p className="min-w-0 text-[12.5px] leading-snug text-muted">{hint}</p>}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="qc-legend"
          className="-mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-[8px] px-1.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
        >
          Key
          <ChevronDown size={12} strokeWidth={1.75} className={`transition-transform duration-240 ease-out-soft ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            id="qc-legend"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.32 }}
            className="grid grid-cols-2 gap-x-3 gap-y-2 overflow-hidden pt-2"
          >
            {ITEMS.map((it) => (
              <li key={it.label} className="flex items-center gap-2">
                {it.swatch}
                <span className="min-w-0 leading-tight">
                  <span className="block text-[12px] font-medium text-ink">{it.label}</span>
                  <span className="block truncate text-[11px] text-faint">{it.hint}</span>
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
