import { useId, type ReactNode } from 'react'

// Bespoke nav icons. One style: 24px grid, 1.75 stroke, round caps and joins, ~2px optical padding.
// Idle = outline in currentColor. Active = the same outline plus a duotone layer: a soft currentColor wash and an
// accent detail (`--nav-accent`, amber by default) that eases in. Reduced motion skips the movement.

export interface NavIconProps {
  active?: boolean
  className?: string
}

const ACCENT = 'var(--nav-accent, var(--color-mq))'
const ease = 'transition-[opacity,transform] duration-300 ease-out-soft motion-reduce:transition-none [transform-box:fill-box]'

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

// Fades in and settles from `from` (a CSS transform) when active.
function Layer({ active, from = 'scale(0.82)', origin = 'origin-center', children }: { active?: boolean; from?: string; origin?: string; children: ReactNode }) {
  return (
    <g stroke="none" className={`${ease} ${origin}`} style={{ opacity: active ? 1 : 0, transform: active ? 'none' : from }}>
      {children}
    </g>
  )
}

const JAR_BODY =
  'M8.5 5.75v1.4c0 .6-.35 1.1-.85 1.45C6.1 9.7 5 11.3 5 13.4V17a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-3.6c0-2.1-1.1-3.7-2.65-4.8-.5-.35-.85-.85-.85-1.45v-1.4'

// Home: the quest jar, two stones resting at the bottom.
export function HomeIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <Layer active={active} from="scale(0.9)">
        <path d={`${JAR_BODY}z`} fill="currentColor" fillOpacity={0.1} />
      </Layer>
      <rect x="7.25" y="2.75" width="9.5" height="3" rx="1.25" />
      <path d={JAR_BODY} />
      {/* Stones: solid even when idle (they read as dots at 20px); they turn accent and drop in when active. */}
      <g stroke="none" fill="currentColor" className={`transition-opacity duration-200 motion-reduce:transition-none ${active ? 'opacity-0' : 'opacity-100'}`}>
        <ellipse cx="10.1" cy="17.35" rx="2" ry="1.45" transform="rotate(-12 10.1 17.35)" />
        <ellipse cx="14.45" cy="17.7" rx="1.5" ry="1.15" transform="rotate(10 14.45 17.7)" />
      </g>
      <Layer active={active} from="translateY(-3px)">
        <ellipse cx="10.1" cy="17.35" rx="2.1" ry="1.55" transform="rotate(-12 10.1 17.35)" fill={ACCENT} />
        <ellipse cx="14.45" cy="17.7" rx="1.6" ry="1.25" transform="rotate(10 14.45 17.7)" fill={ACCENT} />
        <ellipse cx="12.4" cy="14.6" rx="1.25" ry="1" fill={ACCENT} fillOpacity={0.55} />
      </Layer>
    </Svg>
  )
}

// Projects: a board with three columns of cards (different lengths); the last (done) column fills with the accent.
// Drawn as lines inside a frame rather than three outlined bars, which read too dense at 20px next to the other icons.
export function ProjectsIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <Layer active={active} from="scale(0.9)">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="currentColor" fillOpacity={0.1} />
      </Layer>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M8.25 7.75v7.5M12 7.75v4" />
      <path d="M15.75 7.75v9" />
      <Layer active={active} from="scaleY(0.4)" origin="origin-top">
        <rect x="14.25" y="6.6" width="3" height="11.3" rx="1.5" fill={ACCENT} />
      </Layer>
    </Svg>
  )
}

// Today: a sun rising over the horizon (it slides up when active).
export function TodayIcon({ active, className }: NavIconProps) {
  const clip = useId()
  return (
    <Svg className={className}>
      <clipPath id={clip}>
        <rect x="0" y="0" width="24" height="18" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <Layer active={active} from="translateY(4px)">
          <path d="M7 18a5 5 0 0 1 10 0z" fill={ACCENT} />
        </Layer>
      </g>
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 7.25v2.25M6.6 12.6l-1.6-1.6M17.4 12.6l1.6-1.6" />
      <path d="M3 18h18M8.5 21h7" />
    </Svg>
  )
}

const FLAG = 'M5.5 4.6c2-1.15 4-1.15 6.25 0s4.25 1.15 6.75 0v8.6c-2.5 1.15-4.5 1.15-6.75 0s-4.25-1.15-6.25 0'

// Goals: a waving flag on its pole (the cloth unfurls from the pole when active).
export function GoalsIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <Layer active={active} from="scaleX(0.55)" origin="origin-left">
        <path d={`${FLAG}z`} fill={ACCENT} />
      </Layer>
      <path d={FLAG} />
      <path d="M5.5 21V3.75" />
    </Svg>
  )
}

// Settings: two slider tracks with knobs; the knobs fill with the accent when active.
export function SettingsIcon({ active, className }: NavIconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8h7.75M16.25 8H20M4 16h2.75M11.25 16H20" />
      <Layer active={active} from="scale(0.4)">
        <circle cx="14" cy="8" r="2.25" fill={ACCENT} />
        <circle cx="9" cy="16" r="2.25" fill={ACCENT} />
      </Layer>
      <circle cx="14" cy="8" r="2.25" />
      <circle cx="9" cy="16" r="2.25" />
    </Svg>
  )
}

// App mark: the jar with three category stones on an ink tile. Light: near-black tile, ivory jar. Dark: a graphite
// tile with a hairline edge and a light jar (a flipped, white tile glared against the dark canvas).
export function LogoMark({ className }: { className?: string }) {
  const sheen = useId()
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <defs>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9.5" className="fill-[#1b1b1f] dark:fill-[#2a2b33]" />
      <rect width="32" height="32" rx="9.5" fill={`url(#${sheen})`} />
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="none" className="stroke-transparent dark:stroke-white/[0.1]" />
      <g fill="none" stroke="#f3f1ec" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="11.25" y="5.75" width="9.5" height="3" rx="1.25" />
        <path d="M12.5 8.75v1.3c0 .55-.3 1-.75 1.35C10.1 12.55 9 14.2 9 16.4V21a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-4.6c0-2.2-1.1-3.85-2.75-5-.45-.35-.75-.8-.75-1.35v-1.3" />
      </g>
      <ellipse cx="13.6" cy="21.4" rx="2.15" ry="1.65" transform="rotate(-12 13.6 21.4)" fill="var(--color-mq)" />
      <ellipse cx="18.5" cy="21.8" rx="1.75" ry="1.4" transform="rotate(10 18.5 21.8)" fill="var(--color-sq)" />
      <ellipse cx="16.2" cy="18.3" rx="1.55" ry="1.25" fill="var(--color-dq)" />
    </svg>
  )
}
