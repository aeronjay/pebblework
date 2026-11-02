import { StickyNote } from 'lucide-react'
import { motion } from 'motion/react'
import { completeQuest, doItToday, uncompleteQuest } from '../repo'
import type { QuestItem } from '../hooks'
import { describeQuest, formatDay } from './describe'
import { useCompleteFeedback } from './feedback'
import { QuestCheck, type CheckState } from './QuestCheck'
import { RowActions } from './RowActions'
import { useToast } from './toastContext'

interface Props {
  item: QuestItem
  todayKey: string
  claimed: boolean
  onEdit: () => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

function checkState(item: QuestItem, todayKey: string, claimed: boolean): { state: CheckState; reason?: string } {
  const q = item.quest
  if (item.missed) return { state: 'missed', reason: `Missed on ${formatDay(q.dueDate!, todayKey)}. Past days stay as they were.` }
  if (!item.done) {
    if (item.canComplete) return { state: 'open' }
    return { state: 'locked', reason: 'Can only be completed on its due day' }
  }
  if (item.canUncomplete) return { state: 'done' }
  return { state: 'doneFixed', reason: item.doneToday && claimed ? 'Today is claimed, so this stays done' : 'Completed on an earlier day' }
}

export function QuestRow({ item, todayKey, claimed, onEdit, onMove, canMoveUp, canMoveDown }: Props) {
  const { quest } = item
  const toast = useToast()
  const feedback = useCompleteFeedback()
  const { state, reason } = checkState(item, todayKey, claimed)
  const muted = state === 'missed' || state === 'locked' || state === 'doneFixed'
  const struck = item.done
  const caption = describeQuest(item, todayKey)

  async function toggle() {
    if (item.done) {
      const ok = await toast.run(() => uncompleteQuest(quest.id))
      if (ok === false) toast.show('This one can’t be undone anymore.')
    } else {
      feedback()
      const ok = await toast.run(() => completeQuest(quest.id))
      if (ok === false) toast.show('Can only be completed on its due day.')
    }
  }

  return (
    <motion.li
      layout="position"
      initial={false}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
      className="group/row relative"
    >
      <div className={`flex items-start gap-3 rounded-control px-3 py-2.5 transition-colors duration-150 hover:bg-sunken/55 has-[:focus-visible]:bg-sunken/55 ${state === 'missed' ? 'opacity-75' : ''}`}>
        <div className="pt-px">
          <QuestCheck state={state} category={quest.category} title={quest.title} reason={reason} onToggle={toggle} />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[15px] leading-[22px] font-medium break-words line-through transition-[color,text-decoration-color] duration-300 ease-out-soft motion-reduce:transition-none ${
              struck ? 'text-faint decoration-faint/80' : muted ? 'text-muted decoration-transparent' : 'text-ink decoration-transparent'
            }`}
          >
            {quest.title}
          </p>
          {caption && <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{caption}</p>}
          {quest.note && (
            <p className="mt-1 flex gap-1.5 text-[12.5px] leading-5 text-muted">
              <StickyNote aria-hidden className="mt-[3px] size-3 shrink-0 text-faint" strokeWidth={1.75} />
              <span className="line-clamp-2 min-w-0">{quest.note}</span>
            </p>
          )}
          {item.missed && !quest.redoneAs && (
            <button
              type="button"
              onClick={() => toast.run(() => doItToday(quest.id))}
              className="mt-2 inline-flex items-center gap-1.5 rounded-chip border border-line-strong bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-card transition hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.97]"
            >
              Do it today
            </button>
          )}
        </div>

        <RowActions questId={quest.id} title={quest.title} onEdit={onEdit} onMove={onMove} canMoveUp={canMoveUp} canMoveDown={canMoveDown} />
      </div>
    </motion.li>
  )
}
