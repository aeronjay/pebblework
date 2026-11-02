import type { ReactNode } from 'react'

// CSS-only tooltip shown on hover and keyboard focus. The trigger should carry the same text as its aria-label.
export function Tooltip({ text, children, side = 'top' }: { text: string; children: ReactNode; side?: 'top' | 'right' }) {
  const pos = side === 'top' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'top-1/2 left-full ml-2 -translate-y-1/2'
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={`pointer-events-none absolute z-50 w-max max-w-[220px] scale-95 rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug font-medium text-canvas opacity-0 shadow-pop transition duration-150 ease-out-soft group-hover/tip:scale-100 group-hover/tip:opacity-100 group-focus-within/tip:scale-100 group-focus-within/tip:opacity-100 motion-reduce:transition-none ${pos}`}
      >
        {text}
      </span>
    </span>
  )
}
