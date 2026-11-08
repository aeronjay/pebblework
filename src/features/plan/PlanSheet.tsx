import { format } from 'date-fns'
import { CornerDownRight, Plus, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { DayPlan, PlanSlot, Task } from '../../db/types'
import { trapTab, useModal } from '../board/components/a11y'
import { formatDayInline } from '../quests/components/describe'
import { useToast } from '../quests/components/toastContext'
import { parseDayKey } from '../quests/day'
import type { QuestItem } from '../quests/hooks'
import { CATEGORY } from '../quests/meta'
import { useNow } from './hooks'
import { IF_THEN_MAX, MAX_PLAN_SLOTS, PLAN_GROUPS, isValidTime, planCandidates, planGroup, planKind, slotKey, suggestTime, taskCandidates } from './model'
import { planToday, skipPlan } from './repo'

interface Props {
  open: boolean
  todayKey: string
  items: QuestItem[]
  tasks: Task[] // loose ends
  plan: DayPlan | undefined
  onClose: () => void
}

// "Plan today": the plan itself on top (a short timeline of up to three start times), what you could add below.
export function PlanSheet(props: Props) {
  return createPortal(<AnimatePresence>{props.open && <Sheet {...props} />}</AnimatePresence>, document.body)
}

// One thing that can be planned, a quest or a loose end, as the sheet shows it.
interface Entry {
  key: string // slotKey
  ref: Pick<PlanSlot, 'questId' | 'taskId'>
  title: string
  icon: ReactNode
  label: string // "Main Quest", "Loose end"
  labelColor?: string
  sub: string // in the list: when it's due, if that matters
  note: string // in the plan: what saving will do to it, if anything
  dueTime?: string
}

interface Choice {
  key: string
  time: string
  ifThen: string
}

const byTime = (list: Choice[]) => [...list].sort((a, b) => a.time.localeCompare(b.time) || a.key.localeCompare(b.key))

const IF_THEN_EXAMPLES = ['I’ll do it right after lunch', 'I’ll do 10 minutes before dinner', 'I’ll move it to tomorrow morning']

function Sheet({ todayKey, items, tasks, plan, onClose }: Props) {
  const reduce = useReducedMotion()
  const toast = useToast()
  const now = useNow()
  const titleId = useId()
  const descId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  useModal(closeBtn)

  const entries = new Map<string, Entry>([
    ...items.map((i) => [`q:${i.quest.id}`, questEntry(i, todayKey)] as const),
    ...tasks.filter((t) => !t.deletedAt).map((t) => [`t:${t.id}`, taskEntry(t, todayKey)] as const),
  ])
  // In time order, re-sorted when a time is committed (not while typing, so a row never jumps under the cursor).
  const [picks, setPicks] = useState<Choice[]>(() =>
    (plan?.slots ?? []).filter((s) => entries.has(slotKey(s))).map((s) => ({ key: slotKey(s), time: s.time, ifThen: s.ifThen ?? '' })),
  )
  const [saving, setSaving] = useState(false)

  const picked = new Set(picks.map((p) => p.key))
  const full = picks.length >= MAX_PLAN_SLOTS
  const candidates = planCandidates(items).filter((i) => !picked.has(`q:${i.quest.id}`))
  const questGroups = PLAN_GROUPS.map((g) => ({
    id: g.group as string,
    label: g.label,
    entries: candidates.filter((i) => planGroup(i) === g.group).map((i) => entries.get(`q:${i.quest.id}`)!),
  }))
  const looseEnds = {
    id: 'loose',
    label: 'Loose ends',
    entries: taskCandidates(tasks)
      .filter((t) => !picked.has(`t:${t.id}`))
      .map((t) => entries.get(`t:${t.id}`)!),
  }
  // Loose ends go before quests due on a later day: they're usually small, and for today.
  const groups = [...questGroups.slice(0, -1), looseEnds, ...questGroups.slice(-1)].filter((g) => g.entries.length)

  function add(entry: Entry) {
    if (full) return
    const latest = byTime(picks).at(-1)?.time
    setPicks(byTime([...picks, { key: entry.key, time: suggestTime(entry.dueTime, latest, now), ifThen: '' }]))
  }

  function remove(key: string) {
    setPicks(picks.filter((p) => p.key !== key))
  }

  function edit(key: string, patch: Partial<Choice>) {
    setPicks(picks.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  }

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (saving) return
    if (picks.some((p) => !isValidTime(p.time))) return toast.show('Give each planned quest a start time.')
    setSaving(true)
    const ok = await toast.run(async () => {
      await planToday(
        todayKey,
        picks.map((p) => ({ ...entries.get(p.key)!.ref, time: p.time, ifThen: p.ifThen })),
      )
      return true
    })
    setSaving(false)
    if (ok) onClose()
  }

  async function notToday() {
    const ok = await toast.run(async () => {
      await skipPlan(todayKey)
      return true
    })
    if (ok) onClose()
  }

  const layout = reduce ? false : 'position'
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, bounce: 0.12, duration: 0.38 }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[rgb(12_13_16/0.32)] backdrop-blur-[6px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduce ? 0 : 0.2 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void save()
          }
          trapTab(e, panel.current)
        }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99, transition: { duration: 0.16 } }}
        transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0.18, duration: 0.45 }}
        className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-line bg-elevated shadow-pop sm:max-w-[600px] sm:rounded-card"
      >
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold tracking-[0.04em] text-muted uppercase">{format(parseDayKey(todayKey), 'EEEE, MMMM d')}</p>
              <h2 id={titleId} className="mt-0.5 font-display text-[28px] leading-tight font-normal text-ink">
                Plan today
              </h2>
              <p id={descId} className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-muted">
                Pick up to {MAX_PLAN_SLOTS} things that matter most, quests or loose ends, and decide when you’ll start each one.
              </p>
            </div>
            <button
              ref={closeBtn}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* The plan: a short timeline. Empty slots show how much room is left, and that three is the ceiling. */}
            <section aria-labelledby={`${titleId}-plan`} className="mx-3 rounded-[18px] bg-sunken/60 p-2 sm:mx-5">
              <div className="flex items-baseline justify-between px-2.5 pt-1.5 pb-2">
                <h3 id={`${titleId}-plan`} className="text-[12.5px] font-semibold text-muted">
                  Your plan
                </h3>
                <span className="text-[12px] text-muted tabular-nums" aria-live="polite">
                  {picks.length} of {MAX_PLAN_SLOTS}
                </span>
              </div>
              <ol className="flex flex-col gap-1.5">
                <AnimatePresence initial={false}>
                  {picks.map((p) => {
                    const entry = entries.get(p.key)!
                    return (
                      <motion.li
                        key={p.key}
                        layout={layout}
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
                        transition={spring}
                        className="flex gap-3 rounded-[14px] bg-elevated p-3 shadow-card ring-1 ring-line max-sm:flex-col max-sm:gap-2"
                      >
                        <label className="shrink-0">
                          <span className="sr-only">Start time for {entry.title}</span>
                          <input
                            type="time"
                            required
                            value={p.time}
                            onChange={(e) => edit(p.key, { time: e.target.value })}
                            onBlur={() => setPicks(byTime(picks))}
                            className="w-[138px] rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-[15px] font-semibold text-ink tabular-nums outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                          />
                        </label>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center">{entry.icon}</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-[14.5px] leading-snug font-medium break-words text-ink">{entry.title}</p>
                              {entry.note && <p className="mt-0.5 text-[12px] text-muted">{entry.note}</p>}
                            </div>
                            <button
                              type="button"
                              onClick={() => remove(p.key)}
                              aria-label={`Remove ${entry.title} from the plan`}
                              className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-full text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <X aria-hidden className="size-3.5" strokeWidth={2} />
                            </button>
                          </div>
                          <label className="mt-2 flex items-center gap-1.5 rounded-control border border-dashed border-line-strong px-2 transition focus-within:border-solid focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                            <CornerDownRight aria-hidden className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} />
                            <span className="shrink-0 text-[12.5px] font-medium text-muted">If it slips,</span>
                            <input
                              value={p.ifThen}
                              maxLength={IF_THEN_MAX}
                              onChange={(e) => edit(p.key, { ifThen: e.target.value })}
                              aria-label={`If ${entry.title} slips, what will you do? (optional)`}
                              placeholder={IF_THEN_EXAMPLES[picks.indexOf(p) % IF_THEN_EXAMPLES.length]}
                              className="min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-ink outline-none placeholder:text-faint"
                            />
                          </label>
                        </div>
                      </motion.li>
                    )
                  })}
                  {Array.from({ length: MAX_PLAN_SLOTS - picks.length }, (_, i) => (
                    <motion.li
                      key={`empty-${picks.length + i}`}
                      layout={layout}
                      transition={spring}
                      className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-line-strong px-3 py-3 text-[13px] text-faint"
                    >
                      <span aria-hidden className="w-[138px] shrink-0 px-2.5 font-semibold tabular-nums max-sm:w-auto">
                        – – : – –
                      </span>
                      {i === 0 ? (picks.length ? 'Add another below, or leave it open' : 'Pick something below') : 'Open'}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
              <p className="px-2.5 pt-2.5 pb-1 text-[12px] leading-relaxed text-muted">
                Leave the rest of the day unplanned. Things usually take longer than we think.
              </p>
            </section>

            {/* What could go in it, grouped by when it's due. */}
            <div className="px-3 pt-5 pb-4 sm:px-5">
              {groups.length === 0 ? (
                <p className="px-2.5 py-4 text-center text-[13.5px] text-muted">
                  {picks.length ? 'That’s everything open.' : 'Nothing open to plan. Add a quest or a loose end first, or enjoy a free day.'}
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {full && <p className="px-2.5 text-[12.5px] font-medium text-ink">Your plan is full. Three is plenty: remove one to swap it.</p>}
                  {groups.map((g) => (
                    <section key={g.id} aria-labelledby={`${titleId}-${g.id}`} className={`transition-opacity ${full ? 'opacity-55' : ''}`}>
                      <h3 id={`${titleId}-${g.id}`} className="px-2.5 pb-1 text-[12px] font-semibold text-muted">
                        {g.label} <span className="font-normal text-faint tabular-nums">{g.entries.length}</span>
                      </h3>
                      <ul>
                        {g.entries.map((entry) => (
                          <li key={entry.key}>
                            <button
                              type="button"
                              disabled={full}
                              onClick={() => add(entry)}
                              aria-label={`Add ${entry.title} to the plan`}
                              className="group/add flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition hover:bg-sunken/60 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              <span className="grid size-5 shrink-0 place-items-center">{entry.icon}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[14px] leading-snug font-medium break-words text-ink">{entry.title}</span>
                                <span className="text-[12px]">
                                  <span className={`font-medium ${entry.labelColor ? '' : 'text-muted'}`} style={entry.labelColor ? { color: entry.labelColor } : undefined}>
                                    {entry.label}
                                  </span>
                                  {entry.sub && <span className="text-muted">, {entry.sub}</span>}
                                </span>
                              </span>
                              <span
                                aria-hidden
                                className="grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition group-enabled/add:group-hover/add:border-ink group-enabled/add:group-hover/add:bg-ink group-enabled/add:group-hover/add:text-canvas"
                              >
                                <Plus className="size-3.5" strokeWidth={2.25} />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>

          <footer className="flex items-center gap-2 border-t border-line bg-surface/60 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-7">
            {plan && !plan.skipped ? (
              <span className="mr-auto hidden text-[12.5px] text-muted sm:inline">Changing the plan is part of planning.</span>
            ) : (
              <button
                type="button"
                onClick={() => void notToday()}
                className="mr-auto -ml-2 rounded-control px-3 py-2 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Not today
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-control px-3.5 py-2 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:ml-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-control bg-ink px-4 py-2 text-[13px] font-semibold text-canvas shadow-card transition hover:opacity-90 active:scale-[.98] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
            >
              {picks.length === 0 && plan?.slots.length ? 'Clear plan' : 'Save plan'}
            </button>
          </footer>
        </form>
      </motion.div>
    </div>
  )
}

function questEntry(item: QuestItem, todayKey: string): Entry {
  const q = item.quest
  const meta = CATEGORY[q.category]
  const due = q.dueDate ? formatDayInline(q.dueDate, todayKey) : ''
  const kind = planKind(item)
  const [sub, note] =
    kind === 'project'
      ? ['a work session on its board', 'Project: a work session on its board']
      : kind === 'moved'
        ? [`due ${due}`, `Moves to today (was due ${due})`]
        : kind === 'redo'
          ? [`was due ${due}`, `Missed ${due}: saving redoes it today`]
          : ['', '']
  return {
    key: `q:${q.id}`,
    ref: { questId: q.id },
    title: q.title,
    icon: <meta.Icon aria-hidden className="size-full" />,
    label: meta.label,
    labelColor: meta.ink,
    sub,
    note,
    dueTime: q.dueTime,
  }
}

// A loose end's date is only a reminder, so planning one changes nothing but giving it a time.
function taskEntry(task: Task, todayKey: string): Entry {
  const late = !!task.dueDate && task.dueDate < todayKey
  const due = task.dueDate ? formatDayInline(task.dueDate, todayKey) : ''
  const sub = !task.dueDate ? '' : late ? `was due ${due}` : `due ${due}`
  return {
    key: `t:${task.id}`,
    ref: { taskId: task.id },
    title: task.title,
    icon: <span aria-hidden className="size-[15px] rounded-full border-[1.5px] border-line-strong" />,
    label: 'Loose end',
    sub,
    note: sub ? `Loose end, ${sub}` : 'Loose end',
  }
}
