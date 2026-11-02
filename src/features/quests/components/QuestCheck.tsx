import { Lock } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import type { QuestCategory } from '../../../db/types'
import { CATEGORY } from '../meta'
import { Tooltip } from './Tooltip'

export type CheckState = 'open' | 'done' | 'doneFixed' | 'locked' | 'missed'

interface Props {
  state: CheckState
  category: QuestCategory
  title: string
  reason?: string // why it can't be toggled (locked / doneFixed / missed)
  onToggle: () => void
}

// Glyph on the category-colored fill: near-black reads at ≥ 7:1 on all three tints in both themes.
const CHECK_INK = 'rgb(12 13 16 / 0.86)'

export function QuestCheck({ state, category, title, reason, onToggle }: Props) {
  const reduce = useReducedMotion()
  const [burst, setBurst] = useState(0)
  const color = CATEGORY[category].color
  const done = state === 'done' || state === 'doneFixed'
  const interactive = state === 'open' || state === 'done'

  if (state === 'locked' || state === 'missed') {
    const label = reason ?? (state === 'locked' ? 'Can only be completed on its due day' : 'Missed')
    return (
      <Tooltip text={label} side="right">
        <button
          type="button"
          aria-disabled="true"
          aria-label={`${title}: ${label}`}
          className="grid size-[22px] shrink-0 cursor-not-allowed place-items-center rounded-full border-[1.5px] border-dashed border-line-strong text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          {state === 'locked' && <Lock aria-hidden className="size-[11px]" strokeWidth={2.25} />}
        </button>
      </Tooltip>
    )
  }

  const button = (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-disabled={!interactive || undefined}
      aria-label={reason && !interactive ? `${title}: ${reason}` : title}
      onClick={() => {
        if (!interactive) return
        if (!done) setBurst((n) => n + 1)
        onToggle()
      }}
      whileTap={interactive ? { scale: 0.86 } : undefined}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      className={`relative grid size-[22px] shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {/* ring */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border-[1.5px] transition-[border-color,background-color] duration-200"
        style={{
          borderColor: done ? color : `color-mix(in oklab, ${color} 78%, var(--color-ink))`,
          backgroundColor: done ? 'transparent' : `color-mix(in oklab, ${color} 6%, transparent)`,
        }}
      />
      {/* fill */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        initial={false}
        animate={{ scale: done ? 1 : 0.3, opacity: done ? 1 : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 26 }}
      />
      {/* celebratory ripple, once per completion */}
      <AnimatePresence>
        {burst > 0 && !reduce && (
          <motion.span
            key={burst}
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-full border-2"
            style={{ borderColor: color }}
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setBurst(0)}
          />
        )}
      </AnimatePresence>
      <svg aria-hidden viewBox="0 0 24 24" className="relative size-[14px]" fill="none">
        <motion.path
          d="M5.5 12.5l4.2 4.2L18.5 7.8"
          stroke={CHECK_INK}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : done
                ? { pathLength: { type: 'spring', stiffness: 260, damping: 20, delay: 0.06 }, opacity: { duration: 0.05, delay: 0.06 } }
                : { duration: 0.12 }
          }
        />
      </svg>
    </motion.button>
  )

  return reason && !interactive ? (
    <Tooltip text={reason} side="right">
      {button}
    </Tooltip>
  ) : (
    button
  )
}
