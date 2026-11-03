import { ChevronDown, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import type { QuestItem } from '../hooks'
import { todayItems } from './lists'
import { QuestRow } from './QuestRow'

interface Props {
  items: QuestItem[] // every live quest, sorted by category then order
  todayKey: string
  claimed: boolean
  onAdd: () => void
  onEdit: (item: QuestItem) => void
  onBrowse: () => void // open the stacked lists (for undated side quests etc.)
}

// Every list's quests for today in one short list (category order, then each list's own order; reorder on a list's tab).
// Finished quests fold into a quiet "N done today" line so the list shrinks as the day goes. One finished while this
// view is open stays in place (its check animates and it can still be unticked) until the view is left or reloaded.
export function TodayList({ items, todayKey, claimed, onAdd, onEdit, onBrowse }: Props) {
  const reduce = useReducedMotion()
  const [showDone, setShowDone] = useState(false)
  const day = todayItems(items)
  // Ids seen open in this view; it only grows. Updated during render (React's "adjusting state when props change"),
  // so a quest that turns done is already known and stays put instead of folding away under its check animation.
  const [seenOpen, setSeenOpen] = useState(() => new Set(day.filter((i) => !i.done).map((i) => i.quest.id)))
  const unseen = day.filter((i) => !i.done && !seenOpen.has(i.quest.id))
  if (unseen.length) setSeenOpen((prev) => new Set([...prev, ...unseen.map((i) => i.quest.id)]))
  const shown = day.filter((i) => !i.done || seenOpen.has(i.quest.id))
  const folded = day.filter((i) => i.done && !seenOpen.has(i.quest.id))

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, bounce: 0, duration: 0.42 }
  const fade = reduce ? { duration: 0 } : { duration: 0.2 }

  return (
    <div className="rounded-card border border-line bg-surface px-1.5 pt-1.5 pb-2 sm:px-2">
      {day.length === 0 ? (
        <div className="px-3 pt-5 pb-4 text-center">
          <p className="font-display text-[17px] font-normal text-ink">Nothing due today</p>
          <p className="mx-auto mt-1 max-w-[34ch] text-[13px] leading-relaxed text-muted">
            A free day. Pick something from{' '}
            <button type="button" onClick={onBrowse} className={link}>
              your lists
            </button>{' '}
            or add a quest.
          </p>
        </div>
      ) : (
        <>
          {shown.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-muted">
              <span className="font-semibold text-ink">Everything for today is done.</span> Claim it on the calendar.
            </p>
          )}
          <ul>
            <AnimatePresence initial={false}>
              {shown.map((item) => (
                <QuestRow key={item.quest.id} item={item} todayKey={todayKey} claimed={claimed} onEdit={() => onEdit(item)} showCategory />
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}

      <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
        <button
          type="button"
          onClick={onAdd}
          className="group/add inline-flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-[22px] place-items-center rounded-full border-[1.5px] border-dashed border-line-strong transition group-hover/add:border-solid group-hover/add:border-current">
            <Plus aria-hidden className="size-3" strokeWidth={2.25} />
          </span>
          Add a quest
        </button>
        {folded.length > 0 && (
          <button
            type="button"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {folded.length} done today
            <motion.span aria-hidden animate={{ rotate: showDone ? 180 : 0 }} transition={spring} className="grid">
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            </motion.span>
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {showDone && folded.length > 0 && (
          <motion.ul
            key="done"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: spring, opacity: fade }}
            className="mt-1 overflow-hidden border-t border-dashed border-line pt-1"
          >
            {folded.map((item) => (
              <QuestRow key={item.quest.id} item={item} todayKey={todayKey} claimed={claimed} onEdit={() => onEdit(item)} showCategory />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

const link =
  'rounded-sm font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink outline-none focus-visible:ring-2 focus-visible:ring-ring'
