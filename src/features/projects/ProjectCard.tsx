import { ArrowUpRight, CalendarClock, Check, Columns3 } from 'lucide-react'
import { href } from '../../app/router'
import type { ProjectSummary } from '../board/hooks'
import { isoToDayKey } from '../quests/day'
import { formatDay } from '../quests/components/describe'
import { ProgressRing } from '../quests/components/ProgressRing'
import { CATEGORY } from '../quests/meta'
import { activityLabel, deadlineOf, stagesLabel, type DeadlineTone } from './model'

const TONE: Record<DeadlineTone, string> = {
  calm: 'border border-line bg-surface text-muted',
  soon: 'bg-mq-soft text-mq-ink',
  late: 'bg-danger-soft text-danger-ink',
}

// One project on the Projects grid. The whole card opens its board.
export function ProjectCard({ project, todayKey }: { project: ProjectSummary; todayKey: string }) {
  const { quest, done, total, columns, lastActivity, nextCard } = project
  const meta = CATEGORY[quest.category]
  const complete = !!quest.projectDoneAt
  const value = complete ? 1 : total ? done / total : 0
  const deadline = deadlineOf(quest.dueDate, todayKey, complete)
  const activity = activityLabel(lastActivity ?? quest.updatedAt)
  const left = total - done

  return (
    <a
      href={href.board(quest.id)}
      aria-label={`${quest.title}, ${meta.label} project, ${stagesLabel(done, total)}${complete ? ', completed' : ''}. Open board`}
      className="group/card relative flex min-h-[236px] flex-col overflow-hidden rounded-card border border-line bg-surface p-5 shadow-card transition duration-200 ease-out-soft outline-none hover:-translate-y-0.5 hover:shadow-pop focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {/* Category wash at the top edge. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-28 transition-opacity duration-300 ${complete ? 'opacity-50' : 'opacity-100'}`}
        style={{ background: `linear-gradient(180deg, ${meta.soft}, transparent)` }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-surface shadow-card" style={{ color: meta.ink }}>
            <meta.Icon aria-hidden className="size-4" strokeWidth={1.75} />
          </span>
          <span className="truncate text-[13px] font-bold" style={{ color: meta.ink }}>
            {meta.label}
          </span>
        </span>
        {complete ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-dq-soft px-2.5 py-1 text-[12px] font-semibold text-dq-ink">
            <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
            Completed
          </span>
        ) : deadline ? (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2.5 py-1 text-[12px] font-medium tabular-nums ${TONE[deadline.tone]}`}>
            <CalendarClock aria-hidden className="size-3.5" strokeWidth={1.75} />
            {deadline.label}
          </span>
        ) : null}
      </div>

      <h2
        className={`relative mt-4 line-clamp-2 font-display text-[21px] leading-[1.2] font-medium ${complete ? 'text-muted' : 'text-ink'}`}
      >
        {quest.title}
      </h2>

      <div className="relative mt-4 flex items-center gap-3.5">
        <span className="relative grid size-12 shrink-0 place-items-center">
          <ProgressRing value={value} size={48} stroke={4} color={meta.color} />
          <span className="absolute text-[12px] font-semibold text-ink tabular-nums">{Math.round(value * 100)}%</span>
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink tabular-nums">{stagesLabel(done, total)}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
            <Columns3 aria-hidden className="size-3.5 text-faint" strokeWidth={1.75} />
            {columns} columns
            {!complete && total > 0 && (
              <>
                <span aria-hidden className="text-faint">·</span>
                {left === 0 ? 'all stages done' : `${left} to go`}
              </>
            )}
          </span>
        </span>
      </div>

      <div className="relative mt-auto pt-5">
        <div className="rounded-control border border-line bg-sunken/50 px-3 py-2.5">
          {complete ? (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <Check aria-hidden className="size-3.5 text-dq-ink" strokeWidth={2.25} />
              Finished {formatDay(isoToDayKey(quest.projectDoneAt!), todayKey).replace(/^(Today|Yesterday)$/, (m) => m.toLowerCase())}
            </p>
          ) : nextCard ? (
            <p className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="shrink-0 text-[12px] font-bold text-faint">Next</span>
              <span className="truncate font-medium text-ink">{nextCard.title}</span>
            </p>
          ) : (
            <p className="text-[13px] text-muted">{total ? 'Every stage is done. Ready to complete.' : 'Add the first stage on the board.'}</p>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between text-[12px] text-faint">
          <span>{activity}</span>
          <span className="inline-flex items-center gap-1 font-medium text-muted opacity-0 transition duration-200 group-hover/card:opacity-100 group-focus-visible/card:opacity-100 [@media(hover:none)]:opacity-100">
            Open board
            <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.75} />
          </span>
        </div>
      </div>
    </a>
  )
}
