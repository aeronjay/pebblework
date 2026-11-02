import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { BoardColumn } from '../../../db/types'
import { Dialog } from './Dialog'
import { plural } from './model'

interface Props {
  column: BoardColumn | undefined // undefined = closed
  columns: BoardColumn[]
  cardCount: number
  doneColumnId: string
  onConfirm: (moveCardsTo: string) => void
  onClose: () => void
}

// Deleting a column always rehomes its cards; default target is the first other column.
export function DeleteColumnDialog({ column, columns, cardCount, doneColumnId, onConfirm, onClose }: Props) {
  const others = columns.filter((c) => c.id !== column?.id)
  const [picked, setPicked] = useState<{ col: string; to: string } | null>(null)
  const target = picked && picked.col === column?.id ? picked.to : (others[0]?.id ?? '')
  const isDone = column?.id === doneColumnId
  const remaining = others
  const newDone = isDone ? remaining[remaining.length - 1] : undefined
  const intoDone = (isDone ? newDone?.id : doneColumnId) === target

  return (
    <Dialog
      open={!!column}
      title={`Delete “${column?.title ?? ''}”?`}
      confirmLabel={cardCount ? `Move ${plural(cardCount, 'card')} & delete` : 'Delete column'}
      tone="danger"
      onConfirm={() => onConfirm(target)}
      onClose={onClose}
    >
      {cardCount > 0 ? (
        <>
          <p>Its {plural(cardCount, 'card')} will move to:</p>
          <label className="relative mt-2.5 block">
            <span className="sr-only">Move cards to</span>
            <select
              value={target}
              onChange={(e) => column && setPicked({ col: column.id, to: e.target.value })}
              className="h-10 w-full appearance-none rounded-control border border-line-strong bg-surface pr-9 pl-3 text-[14px] font-medium text-ink outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-faint" strokeWidth={1.75} />
          </label>
          {intoDone && <p className="mt-2 text-[12.5px] text-faint">They’ll count as finished.</p>}
        </>
      ) : (
        <p>It’s empty, so nothing else changes.</p>
      )}
      {isDone && newDone && <p className="mt-2 text-[12.5px] text-faint">“{newDone.title}” becomes the done column.</p>}
    </Dialog>
  )
}
