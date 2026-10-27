import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { href, navigate } from '../app/router'
import { db } from '../db/db'
import type { Goal, GoalType, HabitSchedule } from '../db/types'
import { GOAL_COLORS } from '../features/goals/colors'
import { createGoal, updateGoal, type GoalInput } from '../features/goals/repo'
import { seg, segGroup, ui } from '../ui/styles'

const TYPES: { type: GoalType; label: string; hint: string }[] = [
  { type: 'habit', label: 'Habit', hint: 'Something you repeat, like reading every day.' },
  { type: 'project', label: 'Project', hint: 'A one-off goal broken into milestones.' },
  { type: 'numeric', label: 'Target', hint: 'A number to reach, like running 100 km.' },
]
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function GoalFormScreen({ id }: { id?: string }) {
  const goal = useLiveQuery(() => (id ? db.goals.get(id) : undefined), [id])
  if (id && !goal) return null
  return <GoalForm key={id ?? 'new'} initial={goal} />
}

function GoalForm({ initial }: { initial?: Goal }) {
  const editing = !!initial
  const [type, setType] = useState<GoalType>(initial?.type ?? 'habit')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [color, setColor] = useState(initial?.color ?? GOAL_COLORS[0])
  const [schedule, setSchedule] = useState<HabitSchedule>(initial?.schedule ?? { kind: 'daily' })
  const [amount, setAmount] = useState(initial?.target?.amount.toString() ?? '')
  const [unit, setUnit] = useState(initial?.target?.unit ?? '')
  const [chunk, setChunk] = useState(initial?.target?.chunk.toString() ?? '')
  const [milestones, setMilestones] = useState<string[]>([''])
  const [identity, setIdentity] = useState(initial?.identity ?? '')
  const [intention, setIntention] = useState(initial?.intention ?? '')
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give your goal a name.')
    const input: GoalInput = {
      type,
      title: title.trim(),
      color,
      identity: identity.trim() || undefined,
      intention: intention.trim() || undefined,
      deadline: type !== 'habit' && deadline ? deadline : undefined,
    }
    if (type === 'habit') {
      if (schedule.kind === 'weekdays' && !schedule.days.length) return setError('Pick at least one day.')
      input.schedule = schedule
    }
    if (type === 'numeric') {
      const target = Number(amount)
      if (!(target > 0)) return setError('Set a target greater than 0.')
      const step = Number(chunk) || Math.max(1, Math.round(target / 10))
      input.target = { amount: target, unit: unit.trim(), chunk: step }
    }
    const goalId = editing ? initial.id : await createGoal(input, type === 'project' ? milestones : [])
    if (editing) await updateGoal(initial.id, input)
    navigate(href.goal(goalId), { replace: true })
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
      <h1 className={ui.h1}>{editing ? 'Edit goal' : 'New goal'}</h1>

      {!editing && (
        <div>
          <div className={segGroup} role="radiogroup" aria-label="Goal type">
            {TYPES.map((t) => (
              <button key={t.type} type="button" role="radio" aria-checked={type === t.type} className={seg(type === t.type)} onClick={() => setType(t.type)}>
                {t.label}
              </button>
            ))}
          </div>
          <p className={ui.hint}>{TYPES.find((t) => t.type === type)!.hint}</p>
        </div>
      )}

      <div>
        <label className={ui.label} htmlFor="title">Name</label>
        <input id="title" className={ui.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'habit' ? 'Read 10 pages' : type === 'project' ? 'Launch my portfolio' : 'Save money'} autoFocus={!editing} />
      </div>

      <div>
        <span className={ui.label}>Marble color</span>
        <div className="flex flex-wrap gap-2">
          {GOAL_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} className={`size-9 rounded-full ring-offset-2 ring-offset-stone-50 dark:ring-offset-stone-950 ${c === color ? 'ring-2 ring-stone-900 dark:ring-stone-100' : ''}`} style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${c} 45%)` }} />
          ))}
        </div>
      </div>

      {type === 'habit' && (
        <div>
          <span className={ui.label}>How often?</span>
          <div className={segGroup}>
            <button type="button" className={seg(schedule.kind === 'daily')} onClick={() => setSchedule({ kind: 'daily' })}>Daily</button>
            <button type="button" className={seg(schedule.kind === 'weekly')} onClick={() => setSchedule({ kind: 'weekly', timesPerWeek: 3 })}>Per week</button>
            <button type="button" className={seg(schedule.kind === 'weekdays')} onClick={() => setSchedule({ kind: 'weekdays', days: [1, 3, 5] })}>Set days</button>
          </div>
          {schedule.kind === 'weekly' && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="number" min={1} max={7} className={`${ui.input} w-20`} value={schedule.timesPerWeek} onChange={(e) => setSchedule({ kind: 'weekly', timesPerWeek: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })} />
              times per week
            </label>
          )}
          {schedule.kind === 'weekdays' && (
            <div className="mt-3 flex gap-1.5">
              {DAYS.map((d, i) => {
                const on = schedule.days.includes(i)
                return (
                  <button key={i} type="button" aria-pressed={on} onClick={() => setSchedule({ kind: 'weekdays', days: on ? schedule.days.filter((x) => x !== i) : [...schedule.days, i].sort((a, b) => a - b) })} className={`size-9 rounded-full text-sm ${on ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-stone-200 dark:bg-stone-800'}`}>
                    {d}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {type === 'numeric' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.label} htmlFor="amount">Target</label>
            <input id="amount" type="number" min={0} step="any" inputMode="decimal" className={ui.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
          </div>
          <div>
            <label className={ui.label} htmlFor="unit">Unit</label>
            <input id="unit" className={ui.input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="km" />
          </div>
          <div className="col-span-2">
            <label className={ui.label} htmlFor="chunk">A marble every…</label>
            <input id="chunk" type="number" min={0} step="any" inputMode="decimal" className={ui.input} value={chunk} onChange={(e) => setChunk(e.target.value)} placeholder={amount ? String(Math.max(1, Math.round(Number(amount) / 10))) : '10'} />
            <p className={ui.hint}>You earn a marble each time you log this much progress.</p>
          </div>
        </div>
      )}

      {type === 'project' && !editing && (
        <div>
          <span className={ui.label}>Milestones</span>
          <div className="flex flex-col gap-2">
            {milestones.map((m, i) => (
              <input key={i} className={ui.input} value={m} placeholder={`Step ${i + 1}`} aria-label={`Milestone ${i + 1}`} onChange={(e) => {
                const next = [...milestones]
                next[i] = e.target.value
                if (i === next.length - 1 && e.target.value) next.push('')
                setMilestones(next)
              }} />
            ))}
          </div>
          <p className={ui.hint}>Small steps earn marbles too. You can change these later.</p>
        </div>
      )}

      {type !== 'habit' && (
        <div>
          <label className={ui.label} htmlFor="deadline">Deadline (optional)</label>
          <input id="deadline" type="date" className={ui.input} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
      )}

      <div>
        <label className={ui.label} htmlFor="identity">Who does this make you? (optional)</label>
        <input id="identity" className={ui.input} value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="A reader" />
        <p className={ui.hint}>Each marble counts as a vote for this person.</p>
      </div>

      <div>
        <label className={ui.label} htmlFor="intention">When and where? (optional)</label>
        <input id="intention" className={ui.input} value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="After morning coffee, at my desk" />
        <p className={ui.hint}>A concrete plan makes you far more likely to follow through.</p>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => history.back()}>Cancel</button>
        <button type="submit" className={`${ui.btn} ${ui.primary} flex-1`}>{editing ? 'Save' : 'Create goal'}</button>
      </div>
    </form>
  )
}
