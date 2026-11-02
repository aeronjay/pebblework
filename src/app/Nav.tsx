import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ComponentType, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import { HomeIcon, LogoMark, ProjectsIcon, SettingsIcon, type NavIconProps } from './icons/NavIcons'
import { href, type Route } from './router'

interface Tab {
  label: string
  to: string
  match: Route['name'][]
  Icon: ComponentType<NavIconProps>
}

const TABS: Tab[] = [
  { label: 'Home', to: href.home, match: ['home'], Icon: HomeIcon },
  { label: 'Projects', to: href.projects, match: ['projects', 'board'], Icon: ProjectsIcon },
  { label: 'Settings', to: href.settings, match: ['settings'], Icon: SettingsIcon },
]

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Bottom tab bar on phones.
export function BottomNav({ route }: { route: Route }) {
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-30 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto flex max-w-lg px-1">
        {TABS.map((t) => {
          const active = t.match.includes(route.name)
          return (
            <li key={t.label} className="min-w-0 flex-1">
              <a
                href={t.to}
                aria-current={active ? 'page' : undefined}
                className={`group flex flex-col items-center gap-[3px] rounded-control pt-2 pb-1.5 text-[11px] tracking-[0.01em] transition-colors ${focus} ${active ? 'font-semibold text-ink' : 'font-medium text-muted hover:text-ink'}`}
              >
                <span className="relative grid h-8 w-[52px] place-items-center">
                  {active && (
                    <motion.span
                      layoutId="bottom-nav-pill"
                      className="absolute inset-0 rounded-chip bg-surface shadow-card ring-1 ring-line"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <t.Icon active={active} className="relative size-[22px] transition-transform duration-150 group-active:scale-90 motion-reduce:transition-none" />
                </span>
                <span className="max-w-full truncate">{t.label}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const EXPAND_DELAY = 420 // ms of hover before the rail opens; quick passes get a tooltip instead

// Icon rail on tablets and desktops. Lingering (or keyboard focus) expands it over the page (no reflow) to show labels;
// while it's still collapsed, the hovered icon shows a tooltip.
export function SideNav({ route }: { route: Route }) {
  const main = TABS.slice(0, -1)
  const settings = TABS[TABS.length - 1]
  const [hovered, setHovered] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const expanded = hovered || keyboard

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function onEnter(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setHovered(true), EXPAND_DELAY)
  }
  function onLeave() {
    window.clearTimeout(timer.current)
    setHovered(false)
    setTip(null)
  }
  function onFocus(e: FocusEvent<HTMLElement>) {
    if (e.target.matches(':focus-visible')) setKeyboard(true)
  }
  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboard(false)
  }
  function showTip(label: string, el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2 })
  }

  const item = (t: Tab) => (
    <RailItem
      key={t.label}
      tab={t}
      active={t.match.includes(route.name)}
      expanded={expanded}
      onHover={(el) => showTip(t.label, el)}
      onUnhover={() => setTip((cur) => (cur?.label === t.label ? null : cur))}
    />
  )

  return (
    <div className="relative hidden w-16 shrink-0 md:block">
      <nav
        aria-label="Primary"
        data-expanded={expanded || undefined}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`group/rail fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-line px-3 py-5 backdrop-blur-xl transition-[width,box-shadow,background-color] duration-300 ease-out-soft motion-reduce:transition-none ${
          expanded ? 'w-[224px] bg-elevated shadow-pop' : 'w-16 bg-canvas/90'
        }`}
      >
        <a href={href.home} aria-label="Marble Jar, home" className={`mb-7 flex h-10 items-center gap-3 rounded-control ${focus}`}>
          <span className="grid size-10 shrink-0 place-items-center">
            <LogoMark className="size-[34px]" />
          </span>
          <Label expanded={expanded} className="font-display text-[17px] font-semibold text-ink">
            Marble Jar
          </Label>
        </a>
        <ul className="flex flex-col gap-1">{main.map(item)}</ul>
        <ul className="mt-auto flex flex-col gap-1">{item(settings)}</ul>
      </nav>
      <RailTooltip tip={expanded ? null : tip} />
    </div>
  )
}

interface RailItemProps {
  tab: Tab
  active: boolean
  expanded: boolean
  onHover: (el: HTMLElement) => void
  onUnhover: () => void
}

function RailItem({ tab, active, expanded, onHover, onUnhover }: RailItemProps) {
  return (
    <li className="relative">
      {active && (
        <motion.span
          layoutId="rail-pill"
          aria-hidden
          // Collapsed, the rail is canvas, so a raised white pill reads. Expanded, the rail is itself an elevated
          // (white) panel, so the pill turns into a tinted wash instead of vanishing.
          className={`absolute inset-0 rounded-control ring-1 transition-[background-color,box-shadow] duration-200 ${
            expanded ? 'bg-ink/[0.065] ring-transparent dark:bg-white/[0.075]' : 'bg-surface ring-line'
          }`}
          transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }}
        />
      )}
      <a
        href={tab.to}
        aria-current={active ? 'page' : undefined}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(e.currentTarget)}
        onPointerLeave={onUnhover}
        className={`group/item relative flex h-10 items-center gap-3 rounded-control transition-colors ${focus} ${active ? 'text-ink' : 'text-muted hover:bg-ink/[0.035] hover:text-ink dark:hover:bg-white/[0.04]'}`}
      >
        <span className="grid size-10 shrink-0 place-items-center">
          <tab.Icon active={active} className="size-[21px] transition-transform duration-150 group-active/item:scale-90 motion-reduce:transition-none" />
        </span>
        <Label expanded={expanded} className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>
          {tab.label}
        </Label>
      </a>
    </li>
  )
}

// Outside the rail (which clips its overflow); fixed beside the hovered icon. Decorative: links keep their names.
function RailTooltip({ tip }: { tip: { label: string; top: number } | null }) {
  const reduce = useReducedMotion()
  return (
    <AnimatePresence>
      {tip && (
        <motion.span
          key="rail-tip"
          aria-hidden
          initial={{ opacity: 0, x: reduce ? 0 : -4 }}
          animate={{ opacity: 1, x: 0, top: tip.top }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: reduce ? 0 : 0.14, ease: [0.22, 1, 0.36, 1], top: { duration: 0 } }}
          style={{ top: tip.top }}
          className="pointer-events-none fixed left-[72px] z-50 -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-canvas shadow-pop"
        >
          {tip.label}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

// Stays in the DOM (so collapsed links keep their accessible name); only fades.
function Label({ children, expanded, className = '' }: { children: ReactNode; expanded: boolean; className?: string }) {
  return (
    <span
      className={`truncate whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none ${expanded ? 'opacity-100 delay-75' : 'opacity-0'} ${className}`}
    >
      {children}
    </span>
  )
}
