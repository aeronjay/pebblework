import { Lock, Repeat, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { QuestCategory } from '../../../db/types'
import { ProjectsIcon } from '../../../app/icons/NavIcons'
import { href, navigate } from '../../../app/router'
import { EVERY_DAY, addDaysToKey, isEveryDay, isProject, normalizeDays, scheduleOn } from '../day'
import type { QuestItem } from '../hooks'
import { CATEGORY, CATEGORY_ORDER } from '../meta'
import { createQuest, deleteQuest, updateQuest } from '../repo'
import { formatDay, scheduleLabel } from './describe'
import { neighborOfRow } from './focus'
import { useToast } from './toastContext'

// `project` presets the create sheet to a project (MQ/SQ with a kanban board).
export type SheetTarget = { mode: 'create'; category: QuestCategory; project?: boolean } | { mode: 'edit'; item: QuestItem }

interface Props {
  target: SheetTarget | null
  todayKey: string
  onClose: () => void
}

// Create/edit quest dialog. Mounted by the parent; animates in/out via AnimatePresence.
export function QuestSheet({ target, todayKey, onClose }: Props) {
  return (
    <AnimatePresence>
      {target && <Sheet key={target.mode === 'edit' ? target.item.quest.id : 'new'} target={target} todayKey={todayKey} onClose={onClose} />}
    </AnimatePresence>
  )
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

const field =
  'w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-[14px] text-ink outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint'
const labelCls = 'mb-1.5 block text-[13px] font-bold text-muted'

function Sheet({ target, todayKey, onClose }: { target: SheetTarget; todayKey: string; onClose: () => void }) {
  const reduce = useReducedMotion()
  const toast = useToast()
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const returnTo = useRef<HTMLElement | null>(null) // set when the quest is deleted: its row is going away

  const editing = target.mode === 'edit' ? target.item : undefined
  const q = editing?.quest
  const [category, setCategory] = useState<QuestCategory>(q?.category ?? (target.mode === 'create' ? target.category : 'dq'))
  const [title, setTitle] = useState(q?.title ?? '')
  const [dueDate, setDueDate] = useState(q?.dueDate ?? '')
  const [dueTime, setDueTime] = useState(q?.dueTime ?? '')
  const [note, setNote] = useState(q?.note ?? '')
  // The schedule as of today (or the start day, for one that hasn't started).
  const scheduleFrom = q && q.startDate > todayKey ? q.startDate : todayKey
  const [days, setDays] = useState<number[]>(q ? scheduleOn(q, scheduleFrom) : EVERY_DAY)
  const [project, setProject] = useState(q ? isProject(q) : target.mode === 'create' && !!target.project)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isDQ = category === 'dq'
  const asProject = project && !isDQ
  // Mirrors updateQuest's guards so the UI never offers an edit the repo would refuse.
  // A project's deadline is display-only, so it stays editable (only past dates are refused, via `min`).
  const dateLock: string | undefined = !editing || isProject(q!)
    ? undefined
    : editing.missed || (q!.dueDate && q!.dueDate < todayKey)
      ? 'A missed quest keeps its date. Use “Do it today” instead.'
      : editing.done
        ? 'A completed quest keeps its date.'
        : undefined

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    opener.current = previous
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleInput.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      // The opener (a row's edit button) is on its way out if the quest was just deleted.
      const back = returnTo.current ?? previous
      back?.focus?.()
    }
  }, [])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void save()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
    if (!nodes.length) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (saving) return
    if (!title.trim()) {
      toast.show('Quest needs a title.')
      titleInput.current?.focus()
      return
    }
    setSaving(true)
    const ok = await toast.run(async () => {
      if (!q) {
        const id = await createQuest({
          category,
          title,
          dueDate: isDQ ? undefined : dueDate || undefined,
          days: isDQ && !isEveryDay(days) ? days : undefined,
          dueTime: asProject ? undefined : dueTime || undefined,
          note: note || undefined,
          isProject: asProject || undefined,
        })
        // A new project opens straight onto its board, ready for its first stages.
        if (asProject) navigate(href.board(id))
      } else {
        const dateChanged = !isDQ && !dateLock && (dueDate || undefined) !== q.dueDate
        await updateQuest(q.id, {
          title,
          note: note.trim() ? note : null,
          dueTime: dueTime || null,
          ...(dateChanged ? { dueDate: dueDate || null } : {}),
          ...(isDQ && days.join() !== scheduleOn(q, scheduleFrom).join() ? { days } : {}),
        })
      }
      return true
    })
    setSaving(false)
    if (ok) onClose()
  }

  async function remove() {
    if (!q) return
    if (!confirmDelete) return setConfirmDelete(true)
    const ok = await toast.run(async () => {
      await deleteQuest(q.id)
      return true
    })
    if (ok) {
      returnTo.current = neighborOfRow(opener.current)
      onClose()
    }
  }

  const quick: { label: string; value: string }[] = asProject
    ? [
        { label: 'In a week', value: addDaysToKey(todayKey, 7) },
        { label: 'In a month', value: addDaysToKey(todayKey, 30) },
        { label: 'None', value: '' },
      ]
    : [
        { label: 'Today', value: todayKey },
        { label: 'Tomorrow', value: addDaysToKey(todayKey, 1) },
        { label: 'No date', value: '' },
      ]
  const noun = asProject ? 'project' : 'quest'
  const meta = CATEGORY[category]

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center sm:items-center sm:p-6" onKeyDown={onKeyDown}>
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
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99, transition: { duration: 0.16 } }}
        transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0.18, duration: 0.45 }}
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-line bg-elevated shadow-pop sm:max-w-[520px] sm:rounded-card"
      >
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-1 sm:px-6">
            <h2 id={titleId} className="flex items-center gap-2.5 text-[13px] font-semibold text-muted">
              <meta.Icon aria-hidden className="size-6" />
              {q ? `Edit ${noun}` : `New ${noun}`}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-8 place-items-center rounded-full text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-2 pb-5 sm:px-6">
            <input
              ref={titleInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={asProject ? 'Name the project' : 'What’s the quest?'}
              aria-label="Title"
              maxLength={140}
              className="w-full border-0 bg-transparent px-0 py-1 font-display text-[24px] leading-tight font-normal text-ink outline-none placeholder:text-faint/70 focus-visible:outline-none"
            />

            <div>
              <span className={labelCls} id={`${titleId}-cat`}>
                Category
              </span>
              <CategoryPicker value={category} onChange={setCategory} disabled={!!q} labelledBy={`${titleId}-cat`} />
              {q && <p className="mt-1.5 text-[12px] text-muted">Category is set when a quest is created.</p>}
            </div>

            {!isDQ && (!q || isProject(q)) && (
              <ProjectToggle category={category} on={asProject} onChange={setProject} readOnly={!!q} id={`${titleId}-project`} />
            )}

            {isDQ ? (
              <div>
                <span className={labelCls} id={`${titleId}-days`}>
                  Repeats
                </span>
                <WeekdayPicker value={days} onChange={setDays} labelledBy={`${titleId}-days`} />
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
                  <Repeat aria-hidden className="size-3 text-dq-ink" strokeWidth={2} />
                  {isEveryDay(days)
                    ? 'Every day. Resets each morning.'
                    : `${scheduleLabel(days)}. Other days are rest days and never hold up a day.`}
                  {q && days.join() !== scheduleOn(q, scheduleFrom).join() && ' Past days keep their old schedule.'}
                </p>
              </div>
            ) : (
              <div>
                <label className={labelCls} htmlFor={`${titleId}-date`}>
                  {asProject ? (
                    <>
                      Deadline <span className="font-normal tracking-normal text-faint normal-case">(optional)</span>
                    </>
                  ) : (
                    'Due date'
                  )}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-control bg-sunken p-1" role="group" aria-label="Quick dates">
                    {quick.map((c) => {
                      const active = dueDate === c.value
                      return (
                        <button
                          key={c.label}
                          type="button"
                          disabled={!!dateLock}
                          aria-pressed={active}
                          onClick={() => setDueDate(c.value)}
                          className={`rounded-[9px] px-2.5 py-1 text-[12.5px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'}`}
                        >
                          {c.label}
                        </button>
                      )
                    })}
                  </div>
                  <input
                    id={`${titleId}-date`}
                    type="date"
                    min={todayKey}
                    value={dueDate}
                    data-empty={!dueDate || undefined}
                    disabled={!!dateLock}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={`${field} w-auto min-w-[150px] flex-1 tabular-nums`}
                  />
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
                  {dateLock ? (
                    <>
                      <Lock aria-hidden className="size-3" strokeWidth={2} />
                      {dateLock}
                    </>
                  ) : asProject ? (
                    dueDate ? (
                      `Shown on the board as ${formatDay(dueDate, todayKey)}. It never holds up a day.`
                    ) : (
                      'No deadline. Stages earn stones whenever they’re done.'
                    )
                  ) : dueDate ? (
                    `Can only be completed on ${formatDay(dueDate, todayKey) === 'Today' ? 'today' : formatDay(dueDate, todayKey)}.`
                  ) : (
                    'No date: complete it whenever. It won’t hold up any day.'
                  )}
                </p>
              </div>
            )}

            {!asProject && (
            <div>
              <label className={labelCls} htmlFor={`${titleId}-time`}>
                Time <span className="font-normal tracking-normal text-faint normal-case">(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input id={`${titleId}-time`} type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={`${field} tabular-nums`} />
                </div>
                {dueTime && (
                  <button type="button" onClick={() => setDueTime('')} className="rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-faint transition hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Clear
                  </button>
                )}
              </div>
            </div>
            )}

            <div>
              <label className={labelCls} htmlFor={`${titleId}-note`}>
                Note <span className="font-normal tracking-normal text-faint normal-case">(optional)</span>
              </label>
              <textarea
                id={`${titleId}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Details, links, the why…"
                className={`${field} resize-none leading-relaxed`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-line bg-surface/60 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
            {q && (
              <button
                type="button"
                onClick={remove}
                onBlur={() => setConfirmDelete(false)}
                className={`inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring ${confirmDelete ? 'bg-danger-soft text-danger-ink' : 'text-faint hover:bg-sunken hover:text-ink'}`}
              >
                <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            )}
            <span className="ml-auto hidden text-[11.5px] text-muted sm:inline">
              <kbd className="font-sans">Ctrl</kbd> + <kbd className="font-sans">Enter</kbd>
            </span>
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
              {q ? 'Save' : asProject ? 'Create project' : 'Add quest'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

const WEEKDAYS: { day: number; short: string; long: string }[] = [
  { day: 1, short: 'M', long: 'Monday' },
  { day: 2, short: 'T', long: 'Tuesday' },
  { day: 3, short: 'W', long: 'Wednesday' },
  { day: 4, short: 'T', long: 'Thursday' },
  { day: 5, short: 'F', long: 'Friday' },
  { day: 6, short: 'S', long: 'Saturday' },
  { day: 0, short: 'S', long: 'Sunday' },
]

// Seven toggles, Monday first. The last selected day can't be turned off (a daily quest needs at least one).
function WeekdayPicker({ value, onChange, labelledBy }: { value: number[]; onChange: (days: number[]) => void; labelledBy: string }) {
  const presets = [
    { label: 'Every day', days: EVERY_DAY },
    { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-labelledby={labelledBy} className="flex gap-1 rounded-control bg-sunken p-1">
        {WEEKDAYS.map((d) => {
          const on = value.includes(d.day)
          const last = on && value.length === 1
          return (
            <button
              key={d.day}
              type="button"
              aria-pressed={on}
              aria-label={d.long}
              title={last ? 'Keep at least one day' : d.long}
              onClick={() => !last && onChange(normalizeDays(on ? value.filter((x) => x !== d.day) : [...value, d.day]))}
              className={`grid size-8 place-items-center rounded-[9px] text-[12.5px] font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? 'bg-surface text-dq-ink shadow-card' : 'text-muted hover:text-ink'} ${last ? 'cursor-default' : ''}`}
            >
              {d.short}
            </button>
          )
        })}
      </div>
      <div className="flex gap-1" role="group" aria-label="Schedule presets">
        {presets.map((p) => {
          const active = value.join() === p.days.join()
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(p.days)}
              className={`rounded-[9px] px-2.5 py-1.5 text-[12.5px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-sunken text-ink' : 'text-muted hover:bg-sunken hover:text-ink'}`}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CategoryPicker({ value, onChange, disabled, labelledBy }: { value: QuestCategory; onChange: (c: QuestCategory) => void; disabled: boolean; labelledBy: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  function onKey(e: KeyboardEvent, i: number) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = CATEGORY_ORDER[(i + delta + CATEGORY_ORDER.length) % CATEGORY_ORDER.length]
    onChange(next)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-disabled={disabled || undefined} className="grid grid-cols-3 gap-1 rounded-control bg-sunken p-1">
      {CATEGORY_ORDER.map((c, i) => {
        const meta = CATEGORY[c]
        const active = c === value
        return (
          <button
            key={c}
            ref={(el) => {
              refs.current[c] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled && !active}
            onClick={() => !disabled && onChange(c)}
            onKeyDown={(e) => !disabled && onKey(e, i)}
            className={`relative flex items-center justify-center gap-1.5 rounded-[9px] px-2 py-2 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${disabled ? 'cursor-default' : ''} ${active ? '' : 'text-muted hover:text-ink'}`}
            style={active ? { color: meta.ink } : undefined}
          >
            {active && (
              <motion.span
                layoutId="category-pill"
                aria-hidden
                className="absolute inset-0 rounded-[9px] bg-surface shadow-card"
                style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 45%, transparent), var(--shadow-card)` }}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <meta.Icon aria-hidden className="relative size-4" strokeWidth={1.75} />
            <span className="relative">{meta.label.replace(' Quest', '')}</span>
          </button>
        )
      })}
    </div>
  )
}

// "Make this a project": MQ/SQ only. Shown read-only when editing (a quest can't change kind after creation).
function ProjectToggle({ category, on, onChange, readOnly, id }: { category: QuestCategory; on: boolean; onChange: (v: boolean) => void; readOnly: boolean; id: string }) {
  const meta = CATEGORY[category]
  return (
    <div
      className={`flex items-center gap-3 rounded-control border px-3.5 py-3 transition-colors ${on ? 'border-transparent' : 'border-line bg-sunken/60'}`}
      style={on ? { backgroundColor: meta.soft, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 30%, transparent)` } : undefined}
    >
      <span
        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface shadow-card transition-colors"
        style={{ color: on ? meta.ink : 'var(--color-muted)', ['--nav-accent' as string]: meta.color }}
      >
        <ProjectsIcon active={on} className="size-[19px]" />
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <p id={`${id}-label`} className="font-medium text-ink">
          {readOnly ? 'Project with a board' : 'Make this a project'}
        </p>
        <p id={`${id}-hint`} className="mt-0.5 text-muted">
          {readOnly ? 'Set when the quest was created.' : 'Opens as a kanban board. Each finished stage earns a stone.'}
        </p>
      </div>
      {readOnly ? (
        <Lock aria-hidden className="size-3.5 shrink-0 text-faint" strokeWidth={2} />
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          onClick={() => onChange(!on)}
          className="relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-elevated motion-reduce:transition-none"
          style={{ backgroundColor: on ? meta.ink : 'var(--color-line-strong)' }}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out-soft motion-reduce:transition-none ${on ? 'translate-x-4' : ''}`}
          />
        </button>
      )}
    </div>
  )
}
