import { useDroppable } from '@dnd-kit/core'
import { useRef, type KeyboardEvent } from 'react'
import type { QuestCategory } from '../../../db/types'
import type { QuestItem } from '../hooks'
import { CATEGORY, CATEGORY_ORDER } from '../meta'
import { dayCount, isEarlier, tabDropId, viewTabId, type QuestView } from './lists'

const VIEWS: QuestView[] = ['today', 'all', ...CATEGORY_ORDER]
const LABEL: Record<QuestView, string> = { today: 'Today', all: 'All', dq: 'Daily', mq: 'Main', sq: 'Side' }

interface Props {
  view: QuestView
  onView: (v: QuestView) => void
  items: QuestItem[]
  baseId: string // tab ids are `${baseId}-tab-${view}`, the panel is `${baseId}-panel`
  dragging?: QuestItem // a quest being dragged on a single list's tab: the other lists' tabs take drops
  canDrop: (c: QuestCategory) => boolean
}

// Today | All | Daily | Main | Side. Arrow keys move between tabs (and select them), Home/End jump to the ends.
export function QuestTabs({ view, onView, items, baseId, dragging, canDrop }: Props) {
  const refs = useRef(new Map<QuestView, HTMLButtonElement>())

  function onKey(e: KeyboardEvent) {
    const i = VIEWS.indexOf(view)
    const next =
      e.key === 'ArrowRight' ? VIEWS[(i + 1) % VIEWS.length]
      : e.key === 'ArrowLeft' ? VIEWS[(i - 1 + VIEWS.length) % VIEWS.length]
      : e.key === 'Home' ? VIEWS[0]
      : e.key === 'End' ? VIEWS[VIEWS.length - 1]
      : undefined
    if (!next) return
    e.preventDefault()
    onView(next)
    refs.current.get(next)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Quest lists"
      onKeyDown={onKey}
      className="flex gap-1 overflow-x-auto rounded-control bg-sunken p-1 [scrollbar-width:none]"
    >
      {VIEWS.map((v) => {
        const c = v === 'today' || v === 'all' ? undefined : v
        const scope = v === 'today' ? items : c ? items.filter((i) => i.quest.category === c && !isEarlier(i)) : undefined
        const count = scope ? dayCount(scope) : undefined
        const open = scope && c ? scope.filter((i) => !i.done).length : 0
        return (
          <Tab
            key={v}
            view={v}
            category={c}
            selected={view === v}
            id={viewTabId(baseId, v)}
            panelId={`${baseId}-panel`}
            refFn={(el) => (el ? refs.current.set(v, el) : refs.current.delete(v))}
            onSelect={() => onView(v)}
            // Lists with something due today show done/due; otherwise how many are open.
            count={count && count.total > 0 ? `${count.done}/${count.total}` : c && open > 0 ? String(open) : undefined}
            countLabel={count && count.total > 0 ? `${count.done} of ${count.total} done today` : c && open > 0 ? `${open} open` : undefined}
            allDone={!!count && count.total > 0 && count.done === count.total}
            drop={!!dragging && !!c && dragging.quest.category !== c && view !== c}
            dropOk={!!c && canDrop(c)}
          />
        )
      })}
    </div>
  )
}

interface TabProps {
  view: QuestView
  category?: QuestCategory
  selected: boolean
  id: string
  panelId: string
  refFn: (el: HTMLButtonElement | null) => void
  onSelect: () => void
  count?: string
  countLabel?: string
  allDone: boolean
  drop: boolean // takes the dragged quest
  dropOk: boolean
}

function Tab({ view, category, selected, id, panelId, refFn, onSelect, count, countLabel, allDone, drop, dropOk }: TabProps) {
  const { setNodeRef, isOver } = useDroppable({ id: tabDropId(view), disabled: !drop })
  const meta = category ? CATEGORY[category] : undefined
  const over = drop && isOver

  return (
    <button
      ref={(el) => {
        refFn(el)
        setNodeRef(el)
      }}
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={`flex shrink-0 grow items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] whitespace-nowrap transition outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected ? 'bg-surface font-semibold text-ink shadow-card' : 'text-muted hover:text-ink'
      } ${drop ? 'ring-2' : ''} ${over && !dropOk ? 'opacity-50' : ''}`}
      style={
        drop && meta
          ? { ['--tw-ring-color' as string]: over && dropOk ? meta.color : 'var(--color-line-strong)', background: over && dropOk ? meta.soft : undefined }
          : undefined
      }
    >
      {meta && <meta.Icon aria-hidden className="hidden size-4 shrink-0 sm:block" />}
      {LABEL[view]}
      {count && (
        <span
          aria-hidden
          className={`text-[12.5px] font-medium tabular-nums ${allDone && meta ? '' : 'text-faint'} ${view === 'today' ? '' : 'hidden sm:inline'}`}
          style={allDone && meta ? { color: meta.ink } : undefined}
        >
          {count}
        </span>
      )}
      {countLabel && <span className="sr-only">, {countLabel}</span>}
    </button>
  )
}
