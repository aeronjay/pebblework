import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from 'react'
import { deleteQuest } from '../repo'
import { neighborOfRow } from './focus'
import { RowMenu } from './RowMenu'
import { useToast } from './toastContext'

interface Props {
  questId: string
  title: string
  onEdit: () => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  className?: string
}

const iconBtn =
  'grid size-7 place-items-center rounded-lg text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30'

// Hover/focus actions on a list row (move, edit, delete with a second-click confirm); one overflow menu on touch.
export function RowActions({ questId, title, onEdit, onMove, canMoveUp, canMoveDown, className = '' }: Props) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const t = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(t)
  }, [confirming])

  async function remove(e: MouseEvent<HTMLElement>) {
    if (!confirming) return setConfirming(true)
    await removeNow(e.currentTarget)
  }

  // Focus moves to a neighbor first: the row stays in the DOM only for its exit animation.
  async function removeNow(from: HTMLElement) {
    const next = neighborOfRow(from)
    const ok = await toast.run(async () => {
      await deleteQuest(questId)
      return true
    })
    if (ok) next?.focus()
  }

  return (
    <div
      className={`flex shrink-0 items-center gap-0.5 transition-opacity duration-150 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 [@media(hover:none)]:opacity-100 ${confirming ? 'opacity-100' : 'opacity-0'} ${className}`}
    >
      {onMove && (
        <span className="flex items-center [@media(hover:none)]:hidden">
          <button type="button" className={iconBtn} disabled={!canMoveUp} onClick={() => onMove(-1)} aria-label={`Move “${title}” up`}>
            <ChevronUp aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
          <button type="button" className={iconBtn} disabled={!canMoveDown} onClick={() => onMove(1)} aria-label={`Move “${title}” down`}>
            <ChevronDown aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </span>
      )}
      <button type="button" className={`${iconBtn} [@media(hover:none)]:hidden`} onClick={onEdit} aria-label={`Edit “${title}”`}>
        <Pencil aria-hidden className="size-[15px]" strokeWidth={1.75} />
      </button>
      {/* Touch screens have no hover: one overflow menu carries edit, reorder and delete. */}
      <span className="hidden [@media(hover:none)]:block">
        <RowMenu title={title} onEdit={onEdit} onMove={onMove} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onDelete={removeNow} />
      </span>
      <span className="[@media(hover:none)]:hidden">
        {confirming ? (
          <button
            type="button"
            onClick={remove}
            onBlur={() => setConfirming(false)}
            autoFocus
            className="h-7 rounded-lg bg-danger-soft px-2 text-xs font-semibold text-danger-ink transition hover:brightness-95 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Delete?
          </button>
        ) : (
          <button type="button" className={iconBtn} onClick={remove} aria-label={`Delete “${title}”`}>
            <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.75} />
          </button>
        )}
      </span>
    </div>
  )
}
