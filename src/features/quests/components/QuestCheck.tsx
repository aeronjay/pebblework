import { Lock } from 'lucide-react'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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

// Completing is a press-and-hold: long enough to feel like a deliberate act, short enough not to drag.
// Unchecking stays a plain tap so undoing a slip is never a chore.
const HOLD_S = 0.6
const TAP_HINT_S = 0.22 // released sooner than this → it was a tap, so explain the hold

const isActivationKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter'

export function QuestCheck({ state, category, title, reason, onToggle }: Props) {
  const reduce = useReducedMotion()
  const hintId = useId()
  const [burst, setBurst] = useState(0)
  const [pressing, setPressing] = useState(false)
  const [hint, setHint] = useState(0)
  const progress = useMotionValue(0)
  const ringOpacity = useTransform(progress, [0, 0.03], [0, 1])
  const chargeScale = useTransform(progress, [0, 1], [0.3, 0.86])
  const chargeOpacity = useTransform(progress, [0, 1], [0, 0.4])
  const hold = useRef<AnimationPlaybackControls | null>(null)
  const startedAt = useRef(0)
  const swallowClick = useRef(false) // the click that ends a pointer hold must not toggle again
  const keyHolding = useRef(false)
  const color = CATEGORY[category].color
  const done = state === 'done' || state === 'doneFixed'
  const interactive = state === 'open' || state === 'done'

  useEffect(() => () => hold.current?.stop(), [])
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(0), 1400)
    return () => clearTimeout(t)
  }, [hint])

  function complete() {
    hold.current = null
    setPressing(false)
    setHint(0)
    progress.set(0)
    setBurst((n) => n + 1)
    onToggle()
  }

  function startHold() {
    if (!interactive || done || hold.current) return
    startedAt.current = performance.now()
    setPressing(true)
    setHint(0)
    hold.current = animate(progress, 1, {
      duration: HOLD_S * (1 - progress.get()),
      ease: [0.35, 0, 0.65, 1],
      onComplete: complete,
    })
  }

  function cancelHold() {
    if (!hold.current) return
    hold.current.stop()
    hold.current = null
    setPressing(false)
    if ((performance.now() - startedAt.current) / 1000 < TAP_HINT_S) setHint((n) => n + 1)
    animate(progress, 0, { duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] })
  }

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
      aria-describedby={interactive && !done ? hintId : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        swallowClick.current = interactive && !done
        startHold()
      }}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(e) => interactive && !done && e.preventDefault()} // long-press on touch shouldn't open a menu
      onKeyDown={(e) => {
        if (!isActivationKey(e) || !interactive) return
        // Own the key while holding (and its auto-repeats after completing), so the native click can't toggle back.
        if (keyHolding.current || !done) e.preventDefault()
        if (!done && !e.repeat) {
          keyHolding.current = true
          startHold()
        }
      }}
      onKeyUp={(e) => {
        if (!isActivationKey(e) || !keyHolding.current) return
        e.preventDefault()
        keyHolding.current = false
        cancelHold()
      }}
      onBlur={() => {
        keyHolding.current = false
        cancelHold()
      }}
      onClick={(e) => {
        if (!interactive) return
        const fromPointer = e.detail > 0
        if (fromPointer && swallowClick.current) {
          swallowClick.current = false
          return
        }
        if (done) onToggle()
        else if (!fromPointer) complete() // screen-reader activation: there's no hold to perform
      }}
      animate={{ scale: pressing ? 0.9 : 1 }}
      whileTap={interactive && done ? { scale: 0.86 } : undefined}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={{ WebkitTouchCallout: 'none' }}
      className={`relative grid size-[22px] shrink-0 touch-manipulation select-none place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
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
      {/* charge: the fill swells while held, then pops to full on completion */}
      {!done && (
        <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ backgroundColor: color, scale: chargeScale, opacity: chargeOpacity }} />
      )}
      {/* hold progress, drawn just outside the ring from 12 o'clock */}
      <svg aria-hidden viewBox="0 0 30 30" className="pointer-events-none absolute -inset-1 size-[30px] -rotate-90 overflow-visible">
        <motion.circle cx="15" cy="15" r="13.5" fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" style={{ pathLength: progress, opacity: ringOpacity }} />
      </svg>
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
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 2.3, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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
      <span id={hintId} hidden>
        Press and hold to complete
      </span>
      {/* a quick tap explains itself instead of doing nothing */}
      <AnimatePresence>
        {hint > 0 && (
          <motion.span
            key={hint}
            aria-hidden
            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-chip bg-ink px-2 py-0.5 text-[11.5px] font-medium text-surface shadow-card"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2, transition: { duration: 0.15 } }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            Hold to finish
          </motion.span>
        )}
      </AnimatePresence>
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
