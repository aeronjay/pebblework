import type { ReactNode } from 'react'

// Hand-drawn line icons from the app's own world: the jar, a cairn of stacked stones, and sliders. One style:
// 24px grid, single stroke, round caps, no fills or duotone. Active only thickens the line a little.

export interface NavIconProps {
  active?: boolean
  className?: string
}

function Svg({ active, className, children }: NavIconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 1.9 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

// The jar: a short neck, slightly bellied glass, one stone resting at the bottom.
export function HomeIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M9 3.5h6M9.5 3.5v2.2c0 .5-.3 1-.7 1.3C7 8.2 6 9.8 6 12v5.5A3 3 0 0 0 9 20.5h6a3 3 0 0 0 3-3V12c0-2.2-1-3.8-2.8-5-.4-.3-.7-.8-.7-1.3V3.5" />
      <path d="M9.6 17.6c.1-1 1-1.7 2.3-1.7 1.4 0 2.4.7 2.4 1.6 0 .8-1 1.3-2.4 1.3s-2.4-.4-2.3-1.2z" />
    </Svg>
  )
}

// A cairn: three stones stacked, smallest on top. Projects are built stage by stage.
export function ProjectsIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 18.2c0-1.6 3.3-2.7 7.5-2.7s7.5 1.1 7.5 2.7-3.3 2.3-7.5 2.3-7.5-.7-7.5-2.3z" />
      <path d="M7.2 12.6c0-1.3 2.2-2.2 5-2.2s5.1.9 5.1 2.2-2.3 2-5.1 2-5-.7-5-2z" />
      <path d="M9.6 7.2c0-1.1 1.1-1.8 2.6-1.8s2.7.7 2.7 1.8-1.2 1.7-2.7 1.7-2.6-.6-2.6-1.7z" />
    </Svg>
  )
}

export function SettingsIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h8M16 8h4M4 16h3M11 16h9" />
      <circle cx="14" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </Svg>
  )
}

// App mark: the jar outline with three stones settled in it, one per quest type. No tile; it sits on the page.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <path
        d="M12 4.5h8M12.6 4.5v3c0 .7-.4 1.3-1 1.7C9.3 10.7 8 12.8 8 15.6v8A4 4 0 0 0 12 27.6h8a4 4 0 0 0 4-4v-8c0-2.8-1.3-4.9-3.6-6.4-.6-.4-1-1-1-1.7v-3"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.6 23.4c0-1.5 1.5-2.5 3.4-2.5 1.8 0 3 .9 3 2.2 0 1.4-1.4 2.3-3.3 2.3-1.8 0-3.1-.8-3.1-2z" fill="var(--color-mq)" />
      <path d="M16.8 23.9c-.1-1.1.9-1.9 2.4-2 1.4 0 2.3.6 2.3 1.6s-1 1.8-2.4 1.8c-1.3.1-2.2-.5-2.3-1.4z" fill="var(--color-sq)" />
      <path d="M13.4 19.3c0-1.1 1.1-1.9 2.6-1.9s2.5.7 2.5 1.8-1.1 1.8-2.6 1.8-2.5-.7-2.5-1.7z" fill="var(--color-dq)" />
    </svg>
  )
}
