import { Ellipsis, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  label: string
  Icon: LucideIcon
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
  hint?: string // quiet second line (e.g. why it's disabled, or a side effect)
  separator?: boolean // draw a divider above this item
}

interface Props {
  label: string // accessible name of the trigger, e.g. "Column actions for “To do”"
  items: MenuItem[]
  size?: 'sm' | 'md'
  className?: string
}

// Portaled overflow menu (fixed coordinates so scrollers/overflow never clip it). Arrow keys, Home/End, Esc.
export function Menu({ label, items, size = 'md', className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({})
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  function close(refocus = true) {
    setOpen(false)
    if (refocus) trigger.current?.focus({ preventScroll: true })
  }

  function openMenu() {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom > 280
    const alignRight = r.right > 240
    setPos({
      ...(alignRight ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) }),
      ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }),
      transformOrigin: `${below ? 'top' : 'bottom'} ${alignRight ? 'right' : 'left'}`,
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const dismiss = () => setOpen(false)
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
    function onPointer(e: PointerEvent) {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, { passive: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, { capture: true })
    }
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      return close()
    }
    if (e.key === 'Tab') return close(false)
    const list = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const at = list.indexOf(document.activeElement as HTMLElement)
    let next: number | undefined
    if (e.key === 'ArrowDown') next = (at + 1) % list.length
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = list.length - 1
    if (next === undefined) return
    e.preventDefault()
    list[next]?.focus()
  }

  const dim = size === 'sm' ? 'size-7 rounded-lg' : 'size-9 rounded-control'
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : openMenu())}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            openMenu()
          }
          e.stopPropagation()
        }}
        className={`grid shrink-0 place-items-center text-faint transition outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ring ${dim} ${open ? 'bg-sunken text-ink' : ''} ${className}`}
      >
        <Ellipsis aria-hidden className="size-[18px]" strokeWidth={1.75} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menu}
              id={id}
              role="menu"
              aria-label={label}
              onKeyDown={onKeyDown}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', bounce: 0.15, duration: 0.26 }}
              style={pos}
              className="fixed z-[70] w-60 rounded-control border border-line-strong bg-elevated p-1 shadow-pop"
            >
              {items.map((item) => (
                <div key={item.label}>
                  {item.separator && <div aria-hidden className="mx-2 my-1 h-px bg-line" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      // Refocus the trigger first so dialogs opened by the item restore focus to it.
                      close()
                      item.onSelect()
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] font-medium outline-none transition hover:bg-sunken focus-visible:bg-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${item.danger ? 'text-danger-ink' : 'text-ink'}`}
                  >
                    <item.Icon aria-hidden className="mt-px size-4 shrink-0 opacity-80" strokeWidth={1.75} />
                    <span className="min-w-0">
                      <span className="block">{item.label}</span>
                      {item.hint && <span className="mt-0.5 block text-[12px] leading-snug font-normal text-muted">{item.hint}</span>}
                    </span>
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
