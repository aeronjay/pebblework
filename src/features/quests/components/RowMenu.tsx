import { ChevronDown, ChevronUp, Ellipsis, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  onEdit: () => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  // Receives the trigger so the row can pick where focus goes once it's gone.
  onDelete: (trigger: HTMLElement) => void
}

// Overflow menu for a quest row on touch screens (no hover to reveal the inline icons).
export function RowMenu({ title, onEdit, onMove, canMoveUp, canMoveDown, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [pos, setPos] = useState<CSSProperties>({})
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  function close(refocus = true) {
    setOpen(false)
    setConfirming(false)
    if (refocus) trigger.current?.focus()
  }

  // Portaled with fixed coordinates: the section panel clips overflow (for its height animation).
  function openMenu() {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom > 240
    setPos({
      right: window.innerWidth - r.right,
      ...(below ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const dismiss = () => {
      setOpen(false)
      setConfirming(false)
    }
    window.addEventListener('scroll', dismiss, { passive: true })
    window.addEventListener('resize', dismiss)
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
    function onPointer(e: PointerEvent) {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('scroll', dismiss)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label={`More actions for “${title}”`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : openMenu())}
        className={`grid size-9 place-items-center rounded-lg text-faint transition outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-sunken ${open ? 'bg-sunken text-ink' : ''}`}
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
              aria-label={`Actions for “${title}”`}
              onKeyDown={onKeyDown}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', bounce: 0.2, duration: 0.28 }}
              style={pos}
              className="fixed z-50 w-48 origin-top-right rounded-control border border-line-strong bg-elevated p-1 shadow-pop"
            >
              <Item
                Icon={Pencil}
                label="Edit"
                onClick={() => {
                  close(false)
                  onEdit()
                }}
              />
              {onMove && (
                <>
                  <Item
                    Icon={ChevronUp}
                    label="Move up"
                    disabled={!canMoveUp}
                    onClick={() => {
                      close()
                      onMove(-1)
                    }}
                  />
                  <Item
                    Icon={ChevronDown}
                    label="Move down"
                    disabled={!canMoveDown}
                    onClick={() => {
                      close()
                      onMove(1)
                    }}
                  />
                </>
              )}
              <div aria-hidden className="mx-2 my-1 h-px bg-line" />
              <Item
                Icon={Trash2}
                label={confirming ? 'Tap again to delete' : 'Delete'}
                danger
                onClick={() => {
                  if (!confirming) return setConfirming(true)
                  const from = trigger.current
                  setOpen(false)
                  if (from) onDelete(from)
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

function Item({
  Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  Icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-left text-[14px] font-medium outline-none transition focus-visible:bg-sunken active:bg-sunken disabled:opacity-35 ${danger ? 'text-danger-ink' : 'text-ink'}`}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
      {label}
    </button>
  )
}
