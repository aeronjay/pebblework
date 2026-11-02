import { motion } from 'motion/react'

// Tiny circular progress for summary chips. `value` is 0..1.
export function ProgressRing({ value, size = 16, stroke = 2, color = 'currentColor' }: { value: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-line-strong" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        initial={false}
        animate={{ pathLength: Math.max(0, Math.min(1, value)), opacity: value > 0 ? 1 : 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
      />
    </svg>
  )
}
