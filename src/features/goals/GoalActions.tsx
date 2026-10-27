import { isSameDay } from 'date-fns'
import { useState, type FormEvent } from 'react'
import type { Goal, Milestone } from '../../db/types'
import { ui } from '../../ui/styles'
import { useCheckIns } from './hooks'
import { habitProgress } from './progress'
import { checkIn, setMilestoneDone, undoCheckIn } from './repo'

export function HabitCheck({ goal }: { goal: Goal }) {
  const checkIns = useCheckIns(goal.id)
  const { doneToday } = habitProgress(goal, checkIns)

  async function toggle() {
    const today = checkIns.find((c) => isSameDay(new Date(c.at), new Date()))
    if (today) await undoCheckIn(today.id)
    else await checkIn(goal.id)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={doneToday}
      aria-label={doneToday ? `Undo ${goal.title} for today` : `Check in ${goal.title}`}
      className="grid size-10 shrink-0 place-items-center rounded-full border-2 text-lg font-bold transition active:scale-90"
      style={doneToday ? { background: goal.color, borderColor: goal.color, color: 'white' } : { borderColor: goal.color, color: goal.color }}
    >
      {doneToday ? '✓' : ''}
    </button>
  )
}

export function NumericLog({ goal }: { goal: Goal }) {
  const [value, setValue] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amount = Number(value)
    if (!amount) return
    await checkIn(goal.id, { amount })
    setValue('')
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="number"
        step="any"
        inputMode="decimal"
        aria-label={`Amount for ${goal.title}`}
        className={`${ui.input} w-24 py-1.5`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={goal.target?.unit || 'amount'}
      />
      <button type="submit" disabled={!Number(value)} className={`${ui.btn} ${ui.primary} py-1.5`}>Log</button>
    </form>
  )
}

export function MilestoneCheck({ milestone, color }: { milestone: Milestone; color: string }) {
  const done = !!milestone.completedAt
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => setMilestoneDone(milestone.id, e.target.checked)}
        className="size-5 shrink-0"
        style={{ accentColor: color }}
      />
      <span className={done ? 'text-stone-400 line-through' : ''}>{milestone.title}</span>
    </label>
  )
}
