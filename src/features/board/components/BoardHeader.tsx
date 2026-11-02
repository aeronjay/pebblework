import { format } from 'date-fns'
import { ArrowLeft, CalendarDays, Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { href } from '../../../app/router'
import type { Quest } from '../../../db/types'
import { ui } from '../../../ui/styles'
import { CATEGORY } from '../../quests/meta'
import { Menu } from './Menu'
import { backTarget, CAT_CLASS, describeDeadline } from './model'

interface Props {
  quest: Quest
  progress: { done: number; total: number }
  todayKey: string
  onRename: (title: string) => Promise<void>
  onComplete: (anchor: HTMLElement) => void
  onReopen: () => void
  onDelete: () => void
}

export function BoardHeader({ quest, progress, todayKey, onRename, onComplete, onReopen, onDelete }: Props) {
  const meta = CATEGORY[quest.category]
  const cls = CAT_CLASS[quest.category]
  const [renaming, setRenaming] = useState(false)
  const titleBtn = useRef<HTMLButtonElement>(null)
  const completeBtn = useRef<HTMLButtonElement>(null)
  const back = backTarget()
  const complete = !!quest.projectDoneAt
  const pastDeadline = !!quest.dueDate && quest.dueDate < todayKey && !complete

  return (
    <header className="mb-6 md:mb-8">
      <a
        href={href.home}
        onClick={(e) => {
          if (!back.inApp) return
          e.preventDefault()
          history.back()
        }}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-muted transition outline-none hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {back.label}
      </a>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-chip py-1 pr-2.5 pl-2 text-[12px] font-semibold ${cls.soft} ${cls.ink}`}>
              <meta.Icon aria-hidden className="size-3.5" strokeWidth={2} />
              {meta.label}
            </span>
            {quest.dueDate && !complete && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-chip border py-[3px] pr-2.5 pl-2 text-[12px] font-medium ${
                  pastDeadline ? 'border-transparent bg-mq-soft text-mq-ink' : 'border-line-strong text-muted'
                }`}
                title="Deadline (display only — it never blocks a day)"
              >
                <CalendarDays aria-hidden className="size-3.5" strokeWidth={1.75} />
                <span className="sr-only">Deadline: </span>
                {describeDeadline(quest.dueDate, todayKey)}
              </span>
            )}
            {complete && (
              <span className="inline-flex items-center gap-1.5 rounded-chip border border-line-strong py-[3px] pr-2.5 pl-2 text-[12px] font-medium text-muted">
                <Check aria-hidden className={`size-3.5 ${cls.ink}`} strokeWidth={2.25} />
                Completed {format(new Date(quest.projectDoneAt!), 'MMM d')}
              </span>
            )}
          </div>

          {renaming ? (
            <TitleField
              initial={quest.title}
              onDone={async (title) => {
                if (title && title !== quest.title) await onRename(title)
                setRenaming(false)
                requestAnimationFrame(() => titleBtn.current?.focus())
              }}
            />
          ) : (
            <h1 className="mt-3">
              <button
                ref={titleBtn}
                type="button"
                onClick={() => setRenaming(true)}
                title="Rename project"
                className="-mx-1.5 max-w-full rounded-[10px] px-1.5 text-left font-display text-[28px] leading-[1.15] font-normal text-balance text-ink outline-none hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-ring md:text-[34px]"
              >
                {quest.title}
              </button>
            </h1>
          )}
          {quest.note && <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted">{quest.note}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:mt-[35px]">
          {complete ? (
            <button type="button" onClick={onReopen} className={`${ui.btn} ${ui.secondary} h-10 px-3.5 text-[14px]`}>
              <RotateCcw aria-hidden className="size-4" strokeWidth={1.75} />
              Reopen
            </button>
          ) : (
            <button
              ref={completeBtn}
              type="button"
              onClick={() => onComplete(completeBtn.current!)}
              className={`${ui.btn} ${ui.primary} h-10 px-3.5 text-[14px] whitespace-nowrap`}
            >
              <Check aria-hidden className="size-4" strokeWidth={2} />
              <span>
                Complete<span className="max-[400px]:hidden"> project</span>
              </span>
            </button>
          )}
          <Menu
            label="Project actions"
            items={[
              { label: 'Rename project', Icon: Pencil, onSelect: () => setRenaming(true) },
              { label: 'Delete project', Icon: Trash2, danger: true, separator: true, onSelect: onDelete, hint: 'Past stones stay in your jar' },
            ]}
            className="size-10 border border-line bg-surface shadow-card"
          />
        </div>
      </div>
      <ProjectProgress done={progress.done} total={progress.total} complete={complete} color={meta.color} />
    </header>
  )
}

// Thin segmented meter under the header: one segment per stage (a continuous bar past 24 stages).
function ProjectProgress({ done, total, complete, color }: { done: number; total: number; complete: boolean; color: string }) {
  const pct = complete ? 1 : total ? done / total : 0
  const segments = total > 0 && total <= 24
  return (
    <div className="mt-5 flex items-center gap-3 md:mt-6" role="img" aria-label={`${done} of ${total} stages done${complete ? ', project completed' : ''}`}>
      <div aria-hidden className={`flex h-1.5 min-w-0 flex-1 ${segments ? 'gap-[3px]' : ''}`}>
        {segments ? (
          Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className="h-full min-w-0 flex-1 rounded-full bg-ink/[0.07] transition-colors duration-300 dark:bg-white/[0.08]"
              style={i < done || complete ? { backgroundColor: color } : undefined}
            />
          ))
        ) : (
          <span className="relative h-full flex-1 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/[0.08]">
            <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out-soft" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
          </span>
        )}
      </div>
      <p aria-hidden className="shrink-0 text-[13px] whitespace-nowrap text-muted">
        <span className="font-semibold text-ink tabular-nums">
          {done}/{total}
        </span>{' '}
        stages
        <span aria-hidden className="mx-2 inline-block h-3 w-px translate-y-0.5 bg-line-strong" />
        <span className="tabular-nums">{complete ? 'Completed' : `${Math.round(pct * 100)}%`}</span>
      </p>
    </div>
  )
}

function TitleField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (v: string | null) => {
    if (done.current) return
    done.current = true
    onDone(v?.trim() || null)
  }
  return (
    <input
      autoFocus
      value={value}
      aria-label="Project name"
      maxLength={120}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(null)
      }}
      className="mt-3 -mx-1.5 w-[min(100%,40ch)] rounded-[10px] border border-ring/60 bg-surface px-1.5 font-display text-[28px] leading-[1.15] font-normal text-ink ring-2 ring-ring/25 outline-none md:text-[34px]"
    />
  )
}
