import { format, formatDistanceStrict } from 'date-fns'
import { ArrowDown, ArrowUp, Check, CircleCheck, Flag, Link2, Pencil, Plus, RotateCcw, Sprout, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { ProjectsIcon } from '../app/icons/NavIcons'
import { useToday } from '../app/useToday'
import type { Quest } from '../db/types'
import { Menu } from '../features/board/components/Menu'
import { WeekDots } from '../features/identity/GoalsStrip'
import { useIdentityViews } from '../features/identity/hooks'
import {
  STATEMENT_MAX,
  VOTE_WINDOW_DAYS,
  createGoal,
  createIdentity,
  deleteIdentity,
  goalStanding,
  isOutcome,
  linkQuest,
  moveIdentity,
  restoreIdentity,
  setAchieved,
  updateIdentity,
  type IdentityView,
} from '../features/identity/repo'
import { PEBBLE } from '../features/quests/components/Pebble'
import { isProject, parseDayKey } from '../features/quests/day'
import { useQuestToday, type QuestItem } from '../features/quests/hooks'
import { CATEGORY, CATEGORY_ORDER } from '../features/quests/meta'
import { QuestError } from '../features/quests/errors'
import { ui } from '../ui/styles'
import { DateField } from '../features/tasks/DatePopover'

const UNDO_MS = 6000

type Kind = 'outcome' | 'identity'

const EXAMPLES: Record<Kind, string[]> = {
  outcome: ['Pass the licensure exam', 'Ship my portfolio site', 'Run a 10K without stopping'],
  identity: ['someone who moves every day', 'a person who finishes what they start', 'a calm, curious learner'],
}

export function IdentityScreen() {
  const views = useIdentityViews()
  const today = useQuestToday()
  const items = today?.items
  // One-off quests and projects that are finished (a daily quest is never "finished" for good).
  const done = useMemo(() => new Set((items ?? []).filter((i) => i.quest.category !== 'dq' && i.done).map((i) => i.quest.id)), [items])
  const [adding, setAdding] = useState(false)
  const [undo, setUndo] = useState<{ id: string; statement: string } | null>(null)

  const names = useMemo(() => new Map((views ?? []).map((v) => [v.identity.id, v.identity.statement])), [views])

  // "N" adds a statement, unless the user is typing somewhere.
  const onNewKey = useEffectEvent(() => setAdding(true))
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      e.preventDefault()
      onNewKey()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [undo])

  async function remove(v: IdentityView) {
    await deleteIdentity(v.identity.id)
    setUndo({ id: v.identity.id, statement: v.identity.statement })
  }

  const count = views?.length ?? 0

  return (
    <div className="flex flex-col">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-muted">Goals</p>
          <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.025em] text-ink md:text-[42px]">What it’s all for</h1>
          <p className="mt-2 max-w-[56ch] text-[14px] text-muted">
            The things you want to reach and the person you’re becoming. Link quests and projects to them, and Home shows which goals your days are actually moving.
          </p>
        </div>
        {count > 0 && !adding && (
          <button type="button" onClick={() => setAdding(true)} aria-keyshortcuts="N" className={ui.cta}>
            <Plus aria-hidden className="size-4" strokeWidth={2} />
            New goal
            <kbd className={ui.ctaKbd}>N</kbd>
          </button>
        )}
      </header>

      {views === undefined ? (
        <div aria-hidden className="h-[260px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
      ) : (
        <div className="flex flex-col gap-4">
          {adding && (
            <StatementForm
              submitLabel="Add goal"
              chooseKind
              onSubmit={async ({ kind, statement, why, targetDate }) => {
                if (kind === 'outcome') await createGoal({ title: statement, why, targetDate })
                else await createIdentity(statement, why)
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {count === 0 && !adding && <Empty onCreate={() => setAdding(true)} />}
          <ul className="flex flex-col gap-4">
            {views.map((v, i) => (
              <li key={v.identity.id}>
                <IdentityCard
                  view={v}
                  quests={items ?? []}
                  done={done}
                  names={names}
                  first={i === 0}
                  last={i === views.length - 1}
                  onDelete={() => void remove(v)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnimatePresence>
        {undo && (
          <motion.div
            key={undo.id}
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-card border border-line bg-elevated py-2 pr-2 pl-4 text-[14px] text-ink shadow-pop md:bottom-8"
          >
            <span className="min-w-0 flex-1 truncate">Removed “{undo.statement}”</span>
            <button
              type="button"
              onClick={() => {
                void restoreIdentity(undo.id)
                setUndo(null)
              }}
              className="rounded-control px-3 py-1.5 font-semibold text-ink hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndo(null)}
              aria-label="Dismiss"
              className="inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

interface CardProps {
  view: IdentityView
  quests: QuestItem[]
  done: ReadonlySet<string>
  names: Map<string, string>
  first: boolean
  last: boolean
  onDelete: () => void
}

function IdentityCard({ view, quests, done, names, first, last, onDelete }: CardProps) {
  const today = useToday()
  const { identity, votes, totalVotes, lastVote } = view
  const [editing, setEditing] = useState(false)
  const [linking, setLinking] = useState(false)
  const headingId = useId()
  const outcome = isOutcome(identity)
  const reached = !!identity.achievedAt
  const Icon = reached ? CircleCheck : outcome ? Flag : Sprout
  const unit = outcome ? 'step' : 'vote'
  const standing = goalStanding(view)

  const voteLine =
    totalVotes === 0
      ? outcome
        ? 'No steps yet. Link a quest or project, and finishing it is the first one.'
        : 'No votes yet. Link a quest, and finishing it casts the first one.'
      : `${votes} ${votes === 1 ? unit : `${unit}s`} in the last ${VOTE_WINDOW_DAYS} days · ${totalVotes} in all${
          lastVote ? ` · last ${lastVoteLabel(lastVote, today)}` : ''
        }`
  const targetLine = !identity.targetDate
    ? undefined
    : reached
      ? undefined
      : `By ${format(parseDayKey(identity.targetDate), 'MMMM d, yyyy')}${
          view.daysLeft === undefined ? '' : view.daysLeft < 0 ? ' · that day has passed' : view.daysLeft === 0 ? ' · today' : ` · ${view.daysLeft} ${view.daysLeft === 1 ? 'day' : 'days'} left`
        }`

  return (
    <article aria-labelledby={headingId} className={`rounded-card border border-line bg-surface ${reached ? 'opacity-80' : ''}`}>
      <div className="flex items-start gap-3 p-5 pb-4">
        <span aria-hidden className="mt-1 grid size-9 shrink-0 place-items-center rounded-[10px] bg-sunken text-muted">
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <StatementForm
              kind={outcome ? 'outcome' : 'identity'}
              initial={identity.statement}
              initialWhy={identity.why ?? ''}
              initialTarget={identity.targetDate ?? ''}
              submitLabel="Save"
              bare
              onSubmit={async ({ statement, why, targetDate }) => {
                await updateIdentity(identity.id, { statement, why, targetDate: targetDate || null })
                setEditing(false)
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <p className="text-[12.5px] font-semibold text-faint">
                {reached ? `Reached ${format(new Date(identity.achievedAt!), 'MMMM d, yyyy')}` : outcome ? 'I want to' : 'I’m becoming'}
              </p>
              <h2 id={headingId} className="mt-0.5 font-display text-[22px] leading-[1.2] font-normal text-pretty text-ink md:text-[24px]">
                {identity.statement}
              </h2>
              {identity.why && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{identity.why}</p>}
              {targetLine && <p className="mt-1.5 text-[13.5px] font-medium text-ink tabular-nums">{targetLine}</p>}
              {!reached && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-muted">
                  <WeekDots week={view.week} />
                  <span>Last 7 days</span>
                  {standing.tone === 'quiet' && <span className="font-medium text-blaze-ink">{standing.text}</span>}
                </p>
              )}
              <p className="mt-1.5 text-[12.5px] text-faint tabular-nums">{voteLine}</p>
            </>
          )}
        </div>
        {!editing && (
          <Menu
            label={`Actions for “${identity.statement}”`}
            items={[
              { label: 'Edit', Icon: Pencil, onSelect: () => setEditing(true) },
              ...(outcome
                ? [
                    reached
                      ? { label: 'Reopen', Icon: RotateCcw, onSelect: () => void setAchieved(identity.id, false) }
                      : { label: 'Mark as reached', Icon: CircleCheck, onSelect: () => void setAchieved(identity.id, true), hint: 'It leaves Home and keeps its history.' },
                  ]
                : []),
              { label: 'Move up', Icon: ArrowUp, onSelect: () => void moveIdentity(identity.id, -1), disabled: first },
              { label: 'Move down', Icon: ArrowDown, onSelect: () => void moveIdentity(identity.id, 1), disabled: last },
              { label: 'Remove', Icon: Trash2, onSelect: onDelete, danger: true, separator: true, hint: 'Linked quests stay; they just lose the link.' },
            ]}
          />
        )}
      </div>

      <div className="border-t border-line px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-muted">
            {view.quests.length ? `${outcome ? 'Moved forward by' : 'Votes come from'} ${view.quests.length} ${view.quests.length === 1 ? 'quest' : 'quests'}` : 'No quests linked yet'}
          </h3>
          <button
            type="button"
            onClick={() => setLinking((l) => !l)}
            aria-expanded={linking}
            className="inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {linking ? <Check aria-hidden className="size-4" /> : <Link2 aria-hidden className="size-4" />}
            {linking ? 'Done' : 'Link quests'}
          </button>
        </div>

        {linking ? (
          <QuestPicker identityId={identity.id} quests={quests.map((i) => i.quest)} done={done} names={names} />
        ) : (
          view.quests.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {view.quests.map((q) => (
                <li key={q.id}>
                  <QuestChip quest={q} onUnlink={() => void linkQuest(q.id, null)} />
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </article>
  )
}

function lastVoteLabel(key: string, today: Date): string {
  const d = parseDayKey(key)
  const days = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return formatDistanceStrict(d, today, { addSuffix: true, unit: days < 60 ? 'day' : 'month' })
}

function QuestIcon({ quest, size = 16 }: { quest: Quest; size?: number }) {
  if (isProject(quest)) return <ProjectsIcon className="shrink-0 text-muted" active={false} />
  const Icon = PEBBLE[quest.category]
  return <Icon aria-hidden size={size} className="shrink-0" />
}

function QuestChip({ quest, onUnlink }: { quest: Quest; onUnlink: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-chip border border-line bg-canvas py-1 pr-1 pl-2.5 text-[13px] text-ink">
      <span className="size-4 shrink-0 [&>svg]:size-4">
        <QuestIcon quest={quest} />
      </span>
      <span className="min-w-0 truncate">{quest.title}</span>
      <span className="sr-only">, {isProject(quest) ? 'project' : CATEGORY[quest.category].label}</span>
      <button
        type="button"
        onClick={onUnlink}
        aria-label={`Unlink “${quest.title}”`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-chip text-faint transition-colors hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </span>
  )
}

// Live quests and projects that can still cast votes, grouped by type, plus anything already linked here. Checking one
// links it here (moving it from another statement). Hidden: missed quests that were redone (the copy is listed) and
// finished one-off quests and projects.
function QuestPicker({ identityId, quests: all, done, names }: { identityId: string; quests: Quest[]; done: ReadonlySet<string>; names: Map<string, string> }) {
  const quests = all.filter((q) => q.identityId === identityId || (!q.redoneAs && (q.category === 'dq' || !done.has(q.id))))
  if (!quests.length) return <p className="mt-3 text-[13.5px] text-muted">You don’t have any quests yet. Add some on Home, then link them here.</p>
  return (
    <div className="mt-3 flex flex-col gap-4">
      {CATEGORY_ORDER.map((c) => {
        const list = quests.filter((q) => q.category === c)
        if (!list.length) return null
        return (
          <fieldset key={c}>
            <legend className="mb-1.5 text-[12px] font-semibold text-faint">{CATEGORY[c].label}s</legend>
            <ul className="flex flex-col">
              {list.map((q) => {
                const mine = q.identityId === identityId
                const elsewhere = !mine && q.identityId ? names.get(q.identityId) : undefined
                return (
                  <li key={q.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-2 hover:bg-sunken/70">
                      <input
                        type="checkbox"
                        checked={mine}
                        onChange={(e) => void linkQuest(q.id, e.target.checked ? identityId : null)}
                        className="size-4 shrink-0 accent-[var(--color-ink)]"
                      />
                      <span className="size-4 shrink-0 [&>svg]:size-4">
                        <QuestIcon quest={q} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-ink">{q.title}</span>
                        {elsewhere && <span className="block truncate text-[12px] text-faint">Linked to “{elsewhere}”. Checking moves it here.</span>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )
      })}
    </div>
  )
}

interface FormValue {
  kind: Kind
  statement: string
  why: string
  targetDate: string // '' = none; outcomes only
}

interface FormProps {
  kind?: Kind // fixed when editing
  chooseKind?: boolean // creating: offer both kinds
  initial?: string
  initialWhy?: string
  initialTarget?: string
  submitLabel: string
  bare?: boolean // inside a card already
  onSubmit: (value: FormValue) => Promise<void>
  onCancel: () => void
}

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: 'outcome', label: 'Something to reach', hint: 'Has a finish line: an exam, a launch, a number.' },
  { value: 'identity', label: 'Someone to become', hint: 'Ongoing: the kind of person who does this.' },
]

function StatementForm({ kind: fixedKind, chooseKind = false, initial = '', initialWhy = '', initialTarget = '', submitLabel, bare = false, onSubmit, onCancel }: FormProps) {
  const today = useToday()
  const [kind, setKind] = useState<Kind>(fixedKind ?? 'outcome')
  const [statement, setStatement] = useState(initial)
  const [why, setWhy] = useState(initialWhy)
  const [targetDate, setTargetDate] = useState(initialTarget)
  const outcome = kind === 'outcome'
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => input.current?.focus(), [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await onSubmit({ kind, statement, why, targetDate: outcome ? targetDate : '' })
    } catch (err) {
      setError(err instanceof QuestError ? err.message : 'Could not save that.')
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className={bare ? 'flex flex-col gap-3' : 'flex flex-col gap-3 rounded-card border border-line-strong bg-surface p-5'}
    >
      {chooseKind && (
        <div role="radiogroup" aria-label="Kind of goal" className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => {
            const on = kind === k.value
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setKind(k.value)
                  setError(null)
                  input.current?.focus()
                }}
                className={`rounded-control border px-3.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'border-ring bg-sunken/60' : 'border-line hover:bg-sunken/40'}`}
              >
                <span className="block text-[14px] font-semibold text-ink">{k.label}</span>
                <span className="block text-[12.5px] text-muted">{k.hint}</span>
              </button>
            )
          })}
        </div>
      )}
      <div>
        <label htmlFor={`${id}-s`} className="mb-1.5 block text-[13px] font-semibold text-muted">
          {outcome ? 'I want to…' : 'I’m becoming…'}
        </label>
        <input
          ref={input}
          id={`${id}-s`}
          value={statement}
          onChange={(e) => {
            setStatement(e.target.value)
            setError(null)
          }}
          maxLength={STATEMENT_MAX}
          placeholder={EXAMPLES[kind][0]}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : `${id}-ex`}
          className={`${ui.input} font-display text-[18px]`}
        />
        {error ? (
          <p id={`${id}-err`} className="mt-1 text-[12.5px] font-medium text-danger-ink">
            {error}
          </p>
        ) : (
          <p id={`${id}-ex`} className="mt-1 text-[12.5px] text-faint">
            Try: {EXAMPLES[kind].slice(1).map((x) => `“${x}”`).join(' or ')}.
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-w`} className="mb-1.5 block text-[13px] font-semibold text-muted">
          Why it matters <span className="font-normal text-faint">(optional)</span>
        </label>
        <input
          id={`${id}-w`}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          maxLength={240}
          placeholder="Home shows this next to the work, on the days it’s hard to start."
          className={`${ui.input} text-[15px]`}
        />
      </div>
      {outcome && (
        <div>
          <label htmlFor={`${id}-d`} className="mb-1.5 block text-[13px] font-semibold text-muted">
            By when <span className="font-normal text-faint">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <DateField
              id={`${id}-d`}
              value={targetDate || undefined}
              todayKey={format(today, 'yyyy-MM-dd')}
              min={format(today, 'yyyy-MM-dd')}
              label="By when"
              placeholder="No date"
              clearable={false}
              onChange={(v) => setTargetDate(v ?? '')}
              className={`${ui.input} w-auto min-w-[180px] text-[15px]`}
            />
            {targetDate && (
              <button type="button" onClick={() => setTargetDate('')} className="rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Clear
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${ui.btn} ${ui.secondary} text-[14px]`}>
          Cancel
        </button>
        <button type="submit" className={`${ui.btn} ${ui.primary} text-[14px]`} disabled={!statement.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-14 text-center md:py-16">
      <Sprout aria-hidden className="size-8 text-faint" strokeWidth={1.5} />
      <h2 className="mt-4 font-display text-[24px] leading-tight font-normal text-ink">What are your days for?</h2>
      <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-muted">
        Quests are the daily work. A goal is what the work adds up to: something to reach, or someone to become. Write one, then link the quests that move it.
      </p>
      <button type="button" onClick={onCreate} className={`${ui.cta} mt-6`}>
        <Plus aria-hidden className="size-4" strokeWidth={2} />
        Add your first goal
      </button>
    </section>
  )
}
