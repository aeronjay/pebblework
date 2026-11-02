import { CalendarClock } from 'lucide-react'
import { useId } from 'react'
import { href } from '../../app/router'
import { useInProgress, type InProgressItem } from '../board/hooks'
import { deadlineOf, type DeadlineTone } from '../projects/model'
import { CATEGORY } from '../quests/meta'

const TONE: Record<DeadlineTone, string> = {
  calm: 'text-muted',
  soon: 'text-mq-ink',
  late: 'text-danger-ink',
}

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Cards sitting in a middle column of an open project board: work already started, kept in view on Home.
// One horizontally scrolling row at every size, so it never pushes the quest list around.
export function InProgressStrip({ todayKey }: { todayKey: string }) {
  const items = useInProgress()
  const titleId = useId()

  // Reserve the row's height while loading so nothing jumps.
  if (!items) return <div aria-hidden className="h-[24px]" />

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        {/* The trail blaze: where today's attention goes first. */}
        <span aria-hidden className="size-2 rounded-full bg-blaze" />
        In progress
        {items.length > 0 && <span className="font-normal text-muted tabular-nums">{items.length}</span>}
      </h2>

      {items.length === 0 ? (
        <p className="mt-1.5 text-[14px] leading-snug text-muted">
          Nothing started yet. Move a card to In progress on a{' '}
          <a href={href.projects} className={`rounded-sm font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink ${focus}`}>
            project board
          </a>{' '}
          and it shows up here.
        </p>
      ) : (
        <ul className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 md:-mx-1 md:scroll-px-1 md:px-1 [scrollbar-width:thin]">
          {items.map((item) => (
            <li key={item.card.id} className="w-[236px] shrink-0 snap-start">
              <Item item={item} todayKey={todayKey} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Item({ item: { card, column, quest, subtasks }, todayKey }: { item: InProgressItem; todayKey: string }) {
  const meta = CATEGORY[quest.category]
  const due = deadlineOf(card.dueDate, todayKey, false)
  const stage = column.title.trim().toLowerCase() === 'in progress' ? undefined : column.title
  const pct = subtasks.total ? subtasks.done / subtasks.total : 0
  return (
    <a
      href={href.board(quest.id)}
      aria-label={[
        card.title,
        `in ${quest.title}`,
        stage && `column ${stage}`,
        subtasks.total > 0 && `${subtasks.done} of ${subtasks.total} subtasks done`,
        due?.label,
        'Open board',
      ]
        .filter(Boolean)
        .join(', ')}
      className={`flex h-full min-h-[96px] flex-col rounded-card border border-line bg-surface p-3.5 transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${focus}`}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted">
        <meta.Icon aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{quest.title}</span>
        {stage && <span className="shrink-0 text-faint">in {stage}</span>}
      </span>
      <span className="mt-1.5 line-clamp-2 text-[15px] leading-snug font-medium text-ink">{card.title}</span>
      <span className="mt-auto flex items-center gap-3 pt-2.5 text-[12.5px] text-muted">
        {subtasks.total > 0 && (
          <span className="flex min-w-0 flex-1 items-center gap-2 tabular-nums">
            <span aria-hidden className="h-1 min-w-0 flex-1 overflow-hidden rounded-chip bg-ink/10">
              <span className="block h-full rounded-chip" style={{ width: `${pct * 100}%`, background: meta.color }} />
            </span>
            {subtasks.done}/{subtasks.total}
          </span>
        )}
        {due && (
          <span className={`inline-flex shrink-0 items-center gap-1 ${TONE[due.tone]}`}>
            <CalendarClock aria-hidden className="size-3.5" strokeWidth={1.75} />
            {due.label}
          </span>
        )}
      </span>
    </a>
  )
}
