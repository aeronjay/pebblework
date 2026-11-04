import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type ComponentType, type FocusEvent, type PointerEvent, type ReactNode } from 'react'
import {
  FocusIcon,
  HomeIcon,
  IdentityIcon,
  InsightsIcon,
  LogoMark,
  NotesIcon,
  ProjectsIcon,
  ReviewIcon,
  SettingsIcon,
  ShelfIcon,
  type NavIconProps,
} from './icons/NavIcons'
import { useActiveSession } from '../features/focus/hooks'
import { href, type Route } from './router'

interface Tab {
  label: string
  to: string
  match: Route['name'][]
  Icon: ComponentType<NavIconProps>
}

const TABS: Tab[] = [
  { label: 'Home', to: href.home, match: ['home'], Icon: HomeIcon },
  { label: 'Focus', to: href.focus, match: ['focus'], Icon: FocusIcon },
  { label: 'Projects', to: href.projects, match: ['projects', 'board'], Icon: ProjectsIcon },
  { label: 'Notes', to: href.notes, match: ['notes'], Icon: NotesIcon },
  { label: 'Review', to: href.review, match: ['review'], Icon: ReviewIcon },
  { label: 'Shelf', to: href.shelf, match: ['shelf'], Icon: ShelfIcon },
  { label: 'Insights', to: href.insights, match: ['insights'], Icon: InsightsIcon },
  { label: 'Identity', to: href.identity, match: ['identity'], Icon: IdentityIcon },
  // Keep Settings last: the rail pins it to the bottom.
  { label: 'Settings', to: href.settings, match: ['settings'], Icon: SettingsIcon },
]

// Phones fit four tabs plus "More"; the rest live in the More sheet.
const PHONE_TABS = ['Home', 'Focus', 'Projects', 'Notes']
const PHONE_PRIMARY = TABS.filter((t) => PHONE_TABS.includes(t.label))
const PHONE_MORE = TABS.filter((t) => !PHONE_TABS.includes(t.label))

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Bottom tab bar on phones.
export function BottomNav({ route }: { route: Route }) {
  const focusing = !!useActiveSession()
  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-30 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto flex max-w-lg px-1">
        {PHONE_PRIMARY.map((t) => {
          const active = t.match.includes(route.name)
          return (
            <li key={t.label} className="min-w-0 flex-1">
              <a href={t.to} aria-current={active ? 'page' : undefined} className={bottomItem(active)}>
                <BottomGlyph active={active}>
                  <t.Icon active={active} className={bottomIcon} />
                  {focusing && t.match.includes('focus') && <RunningDot />}
                </BottomGlyph>
                <span className="max-w-full truncate">{t.label}</span>
                {focusing && t.match.includes('focus') && <span className="sr-only">, session running</span>}
              </a>
            </li>
          )
        })}
        <li className="min-w-0 flex-1">
          <MoreMenu route={route} />
        </li>
      </ul>
    </nav>
  )
}

const bottomIcon = 'relative size-[22px] transition-transform duration-150 group-active:scale-90 motion-reduce:transition-none'

function bottomItem(active: boolean) {
  return `group flex w-full flex-col items-center gap-[3px] rounded-control pt-2 pb-1.5 text-[11px] tracking-[0.01em] transition-colors ${focus} ${active ? 'font-semibold text-ink' : 'font-medium text-muted hover:text-ink'}`
}

function BottomGlyph({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span className="relative grid h-8 w-[52px] place-items-center">
      {active && (
        <motion.span
          layoutId="bottom-nav-pill"
          className="absolute inset-0 rounded-chip bg-surface shadow-card ring-1 ring-line"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
        />
      )}
      {children}
    </span>
  )
}

function MoreIcon({ active, className }: NavIconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      {[6, 12, 18].map((x) => (
        <circle key={x} cx={x} cy="12" r={active ? 1.9 : 1.6} />
      ))}
    </svg>
  )
}

// The overflow tabs, in a sheet that rises from the tab bar. Closes on pick, Escape, or a tap outside.
function MoreMenu({ route }: { route: Route }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  const reduce = useReducedMotion()
  const active = PHONE_MORE.some((t) => t.match.includes(route.name))

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus({ preventScroll: true })
    }
    function onPointer(e: globalThis.PointerEvent) {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('hashchange', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('hashchange', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={bottomItem(active || open)}
      >
        <BottomGlyph active={active}>
          <MoreIcon active={active || open} className={bottomIcon} />
        </BottomGlyph>
        <span className="max-w-full truncate">More</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            id={id}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : 8, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-x-3 bottom-[calc(100%+8px)] rounded-card border border-line bg-elevated p-1.5 shadow-pop"
          >
            <ul className="grid grid-cols-2 gap-1">
              {PHONE_MORE.map((t) => {
                const on = t.match.includes(route.name)
                return (
                  <li key={t.label}>
                    <a
                      href={t.to}
                      aria-current={on ? 'page' : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-control px-3 py-3 text-[15px] transition-colors ${focus} ${on ? 'bg-sunken font-semibold text-ink' : 'font-medium text-muted hover:bg-sunken hover:text-ink'}`}
                    >
                      <t.Icon active={on} className="size-[22px] shrink-0" />
                      {t.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
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
  const focusing = !!useActiveSession()

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
      running={focusing && t.match.includes('focus')}
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
        <a href={href.home} aria-label="Pebblework, home" className={`mb-7 flex h-10 items-center gap-3 rounded-control ${focus}`}>
          <span className="grid size-10 shrink-0 place-items-center">
            <LogoMark className="size-[34px]" />
          </span>
          <Label expanded={expanded} className="font-display text-[19px] font-normal tracking-[-0.01em] text-ink">
            Pebblework
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
  running: boolean // a focus session is open
  onHover: (el: HTMLElement) => void
  onUnhover: () => void
}

function RailItem({ tab, active, expanded, running, onHover, onUnhover }: RailItemProps) {
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
        <span className="relative grid size-10 shrink-0 place-items-center">
          <tab.Icon active={active} className="size-[21px] transition-transform duration-150 group-active/item:scale-90 motion-reduce:transition-none" />
          {running && <RunningDot />}
        </span>
        <Label expanded={expanded} className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>
          {tab.label}
          {running && <span className="font-normal text-muted"> · running</span>}
        </Label>
      </a>
    </li>
  )
}

// A focus session is open: a small blaze pebble on the Focus icon, so it's findable from anywhere.
function RunningDot() {
  return <span aria-hidden className="absolute top-1 right-2.5 size-2 rounded-chip bg-blaze ring-2 ring-canvas motion-safe:animate-pulse" />
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
