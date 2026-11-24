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
  onReady?: () => void // the ring just closed: letting go now (on the circle) completes
  size?: 'md' | 'sm' // sm: loose ends, which sit in denser lists
  quiet?: boolean // open ring in neutral line color instead of the category tint
  className?: string
}

const SIZE = {
  md: { box: 'size-[22px]', ring: 'size-[30px]', glyph: 'size-[14px]', hint: 'bottom-full left-1/2 mb-2 -translate-x-1/2' },
  // Dense lists scroll and clip above the first row, so the hint sits beside the circle instead.
  sm: { box: 'size-[18px]', ring: 'size-[26px]', glyph: 'size-3', hint: 'left-full top-1/2 ml-2 -translate-y-1/2' },
}

// Glyph on the category-colored fill: near-black reads at ≥ 7:1 on all three tints in both themes.
const CHECK_INK = 'rgb(12 13 16 / 0.86)'

// Completing is press, hold until the ring closes, then let go on the circle. The ring keeps charging even if the
// pointer wanders off; only where you let go decides it, so sliding away before releasing is a clean way to back out.
// Unchecking stays a plain tap so undoing a slip is never a chore.
const HOLD_S = 0.6
const TAP_HINT_S = 0.22 // released sooner than this → it was a tap, so explain the hold
const SLOP_PX = 6 // "on the circle" includes the progress ring around it, plus a little give for fingers

const isActivationKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter'

function isOver(el: HTMLElement, x: number, y: number): boolean {
  const r = el.getBoundingClientRect()
  return Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) <= el.offsetWidth / 2 + SLOP_PX
}

export function QuestCheck({ state, category, title, reason, onToggle, onReady, size = 'md', quiet, className = '' }: Props) {
  const reduce = useReducedMotion()
  const hintId = useId()
  const [burst, setBurst] = useState(0)
  const [pressing, setPressing] = useState(false)
  const [armed, setArmed] = useState(false)
  const [outside, setOutside] = useState(false)
  const [hint, setHint] = useState<{ n: number; text: string } | null>(null)
  const progress = useMotionValue(0)
  const ringOpacity = useTransform(progress, [0, 0.03], [0, 1])
  const chargeScale = useTransform(progress, [0, 1], [0.3, 0.86])
  const chargeOpacity = useTransform(progress, [0, 1], [0, 0.4])
  const holding = useRef(false)
  const charge = useRef<AnimationPlaybackControls | null>(null)
  const armedRef = useRef(false)
  const insideRef = useRef(true)
  const startedAt = useRef(0)
  const swallowClick = useRef(false) // the click that ends a pointer hold must not toggle again
  const keyHolding = useRef(false)
  const color = CATEGORY[category].color
  const done = state === 'done' || state === 'doneFixed'
  const interactive = state === 'open' || state === 'done'
  const dims = SIZE[size]

  useEffect(() => () => charge.current?.stop(), [])
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 1600)
    return () => clearTimeout(t)
  }, [hint])

  function showHint(text: string) {
    setHint((h) => ({ n: (h?.n ?? 0) + 1, text }))
  }

  function finish() {
    progress.set(0)
    setHint(null)
    setBurst((n) => n + 1)
    onToggle()
  }

  function startHold() {
    if (!interactive || done || holding.current) return
    holding.current = true
    armedRef.current = false
    insideRef.current = true
    startedAt.current = performance.now()
    setPressing(true)
    setArmed(false)
    setOutside(false)
    setHint(null)
    charge.current = animate(progress, 1, {
      duration: HOLD_S * (1 - progress.get()),
      ease: [0.35, 0, 0.65, 1],
      onComplete: () => {
        armedRef.current = true
        setArmed(true)
        onReady?.()
      },
    })
  }

  // commit: a real release (pointer up / key up). Otherwise the hold was interrupted (blur, pointer cancel): back out quietly.
  function endHold(commit: boolean) {
    if (!holding.current) return
    const full = armedRef.current
    const heldS = (performance.now() - startedAt.current) / 1000
    holding.current = false
    armedRef.current = false
    charge.current?.stop()
    charge.current = null
    setPressing(false)
    setArmed(false)
    setOutside(false)
    if (commit && full && insideRef.current) return finish()
    animate(progress, 0, { duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] })
    if (!commit) return
    if (heldS < TAP_HINT_S) showHint('Hold to finish')
    else if (!full) showHint('Hold until the ring closes')
    else showHint('Let go on the circle to finish')
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
      data-tick
      onPointerDown={(e) => {
        if (e.button !== 0) return
        swallowClick.current = interactive && !done
        if (!interactive || done) return
        e.currentTarget.setPointerCapture(e.pointerId) // keep hearing the pointer after it leaves the circle
        startHold()
      }}
      onPointerMove={(e) => {
        if (!holding.current || keyHolding.current) return
        const over = isOver(e.currentTarget, e.clientX, e.clientY)
        if (over === insideRef.current) return
        insideRef.current = over
        setOutside(!over)
      }}
      onPointerUp={(e) => {
        if (keyHolding.current) return
        insideRef.current = isOver(e.currentTarget, e.clientX, e.clientY)
        endHold(true)
      }}
      onPointerCancel={() => !keyHolding.current && endHold(false)}
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
        endHold(true)
      }}
      onBlur={() => {
        keyHolding.current = false
        endHold(false)
      }}
      onClick={(e) => {
        if (!interactive) return
        const fromPointer = e.detail > 0
        if (fromPointer && swallowClick.current) {
          swallowClick.current = false
          return
        }
        if (done) onToggle()
        else if (!fromPointer) finish() // screen-reader activation: there's no hold to perform
      }}
      // pressed in while charging; springs back slightly once ready, as a cue to let go
      animate={{ scale: pressing ? (armed ? 1.06 : 0.9) : 1 }}
      whileTap={interactive && done ? { scale: 0.86 } : undefined}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={{ WebkitTouchCallout: 'none' }}
      className={`relative grid ${dims.box} shrink-0 touch-none select-none place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${interactive ? 'cursor-pointer' : 'cursor-default'} ${className}`}
    >
      {/* ring */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border-[1.5px] transition-[border-color,background-color] duration-200"
        style={{
          borderColor: done ? color : quiet ? 'var(--color-line-strong)' : `color-mix(in oklab, ${color} 78%, var(--color-ink))`,
          backgroundColor: done || quiet ? 'transparent' : `color-mix(in oklab, ${color} 6%, transparent)`,
        }}
      />
      {/* charge: the fill swells while held, then pops to full on completion */}
      {!done && (
        <motion.span aria-hidden className="absolute inset-0 rounded-full" style={{ backgroundColor: color, scale: chargeScale, opacity: chargeOpacity }} />
      )}
      {/* hold progress, drawn just outside the ring from 12 o'clock; fades while the pointer is off the circle */}
      <motion.svg
        aria-hidden
        viewBox="0 0 30 30"
        className={`pointer-events-none absolute -top-1 -left-1 ${dims.ring} -rotate-90 overflow-visible`}
        animate={{ opacity: outside ? 0.3 : 1 }}
        transition={{ duration: 0.15 }}
      >
        <motion.circle cx="15" cy="15" r="13.5" fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" style={{ pathLength: progress, opacity: ringOpacity }} />
      </motion.svg>
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
      <svg aria-hidden viewBox="0 0 24 24" className={`relative ${dims.glyph}`} fill="none">
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
        Press and hold until the ring closes, then release to complete
      </span>
      {/* a release that didn't count says why, instead of doing nothing */}
      <AnimatePresence>
        {hint && (
          <motion.span
            key={hint.n}
            aria-hidden
            className={`pointer-events-none absolute ${dims.hint} z-10 whitespace-nowrap rounded-chip bg-ink px-2 py-0.5 text-[11.5px] font-medium text-surface shadow-card`}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2, transition: { duration: 0.15 } }}
            transition={{ duration: reduce ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {hint.text}
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
