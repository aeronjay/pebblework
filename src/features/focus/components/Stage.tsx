import type { ReactNode } from 'react'

// Full-screen focus surface. It sits over the nav on purpose: during a session there's nowhere else to go.
export function Stage({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas px-4 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),20px)] text-ink"
    >
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center py-6">{children}</div>
    </section>
  )
}

// The trail around the clock: a track, the stretch walked so far, and a blaze-colored pebble at its head.
// `tone` muted = paused.
export function Ring({ progress, tone = 'live', children }: { progress: number; tone?: 'live' | 'muted'; children: ReactNode }) {
  const r = 45
  const c = 2 * Math.PI * r
  const p = Math.min(1, Math.max(0, progress))
  const a = 2 * Math.PI * p
  const head = { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) }
  return (
    <div className="relative grid size-[min(78vw,320px)] place-items-center">
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90 overflow-visible">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-line-strong)" strokeWidth="1" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={tone === 'muted' ? 'var(--color-faint)' : 'var(--color-ring)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
        />
        <ellipse
          cx={head.x}
          cy={head.y}
          rx="3.4"
          ry="2.7"
          transform={`rotate(${p * 360 + 90} ${head.x} ${head.y})`}
          fill={tone === 'muted' ? 'var(--color-faint)' : 'var(--color-blaze)'}
          stroke="var(--color-canvas)"
          strokeWidth="1.2"
        />
      </svg>
      <div className="relative flex flex-col items-center text-center">{children}</div>
    </div>
  )
}
