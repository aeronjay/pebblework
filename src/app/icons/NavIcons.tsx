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

// Focus: a stone dropped into still water, two rings settling around it.
export function FocusIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M10 11.6c0-.9.9-1.5 2-1.5s2 .6 2 1.5-.9 1.4-2 1.4-2-.5-2-1.4z" />
      <path d="M6.2 11.8c0-2 2.6-3.4 5.8-3.4s5.8 1.4 5.8 3.4-2.6 3.3-5.8 3.3-5.8-1.3-5.8-3.3z" />
      <path d="M5.6 7.1C3.9 8.1 3 9.5 3 11.6c0 3.6 4 6 9 6s9-2.4 9-6c0-2.1-.9-3.5-2.6-4.5" />
    </Svg>
  )
}

// A note: a page with a folded corner and two lines of writing.
export function NotesIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.8h8.2l3.8 3.8v11.6a1.8 1.8 0 0 1-1.8 1.8H6.5a1.8 1.8 0 0 1-1.8-1.8V5.6a1.8 1.8 0 0 1 1.8-1.8z" />
      <path d="M14.5 3.9v2.6c0 .7.5 1.2 1.2 1.2h2.7" />
      <path d="M8 12.2h7.5M8 15.8h5" />
    </Svg>
  )
}

// App mark: a small cairn, three pebbles stacked; the top one is the trail blaze. No tile; it sits on the page.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <path d="M5 23.6c0-2.3 4.8-3.9 11.2-3.9 6.3 0 10.8 1.5 10.8 3.8 0 2.4-4.6 3.9-11 3.9C9.6 27.4 5 25.9 5 23.6z" fill="var(--color-ink)" />
      <path d="M8.6 15.9c0-1.9 3.2-3.1 7.6-3.1 4.3 0 7.3 1.2 7.3 3 0 1.9-3.1 3.1-7.4 3.1-4.4 0-7.5-1.1-7.5-3z" fill="var(--color-muted)" />
      <path d="M11.8 9.1c0-1.6 1.9-2.8 4.4-2.8 2.4 0 4.2 1.1 4.2 2.7 0 1.6-1.9 2.6-4.3 2.6-2.5 0-4.3-1-4.3-2.5z" fill="var(--color-blaze)" />
    </svg>
  )
}

// Review: looking back. An arrow circling round to a resting stone.
export function ReviewIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M4.6 9.2A8 8 0 1 1 4 12.6" />
      <path d="M4.2 4.8v4.6h4.6" />
      <path d="M9.6 13.6c0-1.2 1.1-2 2.5-2s2.4.8 2.4 1.9-1.1 1.8-2.5 1.8-2.4-.6-2.4-1.7z" />
    </Svg>
  )
}

// Shelf: two filled jars standing on a plank.
export function ShelfIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M3 19.5h18" />
      <path d="M5.5 7h4M6 7v1.4c-.8.6-1.3 1.5-1.3 2.6v6.2c0 .7.6 1.3 1.3 1.3h3c.7 0 1.3-.6 1.3-1.3V11c0-1.1-.5-2-1.3-2.6V7" />
      <path d="M14.5 10h4M15 10v1c-.8.5-1.3 1.3-1.3 2.3v3.9c0 .7.6 1.3 1.3 1.3h3c.7 0 1.3-.6 1.3-1.3v-3.9c0-1-.5-1.8-1.3-2.3v-1" />
      <path d="M4.8 14.6h5.4M13.8 15.4h5.4" />
    </Svg>
  )
}

// Insights: a trail climbing a ridge, the sun over it.
export function InsightsIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M3 19.5 8.6 11l3.3 4.3 3.4-5.8 5.7 10" />
      <circle cx="17.6" cy="5.4" r="1.9" />
    </Svg>
  )
}

// Identity: a sprout, who you're growing into.
export function IdentityIcon(props: NavIconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20.5v-9" />
      <path d="M12 13.2c0-3.6-2.4-5.8-6.6-5.8 0 3.7 2.5 5.8 6.6 5.8z" />
      <path d="M12 11.5c0-3.3 2.2-5.6 6.4-5.6 0 3.4-2.3 5.6-6.4 5.6z" />
      <path d="M8 20.5h8" />
    </Svg>
  )
}
