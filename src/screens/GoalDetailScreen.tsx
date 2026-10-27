import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { href, navigate } from '../app/router'
import { db } from '../db/db'
import type { Goal } from '../db/types'
import { HabitCheck, MilestoneCheck, NumericLog } from '../features/goals/GoalActions'
import { useCheckIns, useMilestones } from '../features/goals/hooks'
import { describeSchedule, formatAmount, habitProgress, numericTotal, projectProgress } from '../features/goals/progress'
import { addMilestone, deleteGoal, deleteMilestone, moveMilestone, setGoalStatus, undoCheckIn } from '../features/goals/repo'
import { Marble } from '../ui/Marble'
import { ProgressBar } from '../ui/ProgressBar'
import { ui } from '../ui/styles'

export function GoalDetailScreen({ id }: { id: string }) {
  const goal = useLiveQuery(() => db.goals.get(id), [id])
  if (goal === undefined) return null
  if (!goal || goal.deletedAt) {
    return (
      <div className={ui.card}>
        <p>This goal no longer exists.</p>
        <a href={href.goals} className="mt-2 inline-block underline">Back to goals</a>
      </div>
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <a href={href.goals} className="text-sm text-stone-500">‹ Goals</a>
      <header className="flex items-start gap-3">
        <Marble color={goal.color} size={32} />
        <div className="min-w-0 flex-1">
          <h1 className={`${ui.h1} break-words`}>{goal.title}</h1>
          {goal.identity && <p className="text-sm text-stone-500">Each marble is a vote for: <strong>{goal.identity}</strong></p>}
          {goal.intention && <p className="mt-1 text-sm text-stone-500">Plan: {goal.intention}</p>}
          {goal.deadline && <p className="mt-1 text-sm text-stone-500">Deadline: {format(new Date(goal.deadline + 'T00:00'), 'PP')}</p>}
        </div>
        <a href={href.editGoal(goal.id)} className={`${ui.btn} ${ui.secondary} py-1.5 text-sm`}>Edit</a>
      </header>

      {goal.status === 'paused' && <p className={`${ui.card} text-sm`}>This goal is paused. Resume it whenever you're ready.</p>}

      {goal.type === 'habit' && <HabitSection goal={goal} />}
      {goal.type === 'project' && <ProjectSection goal={goal} />}
      {goal.type === 'numeric' && <NumericSection goal={goal} />}

      {goal.type !== 'project' && <History goal={goal} />}
      <StatusActions goal={goal} />
    </div>
  )
}

function HabitSection({ goal }: { goal: Goal }) {
  const { done, required, doneToday, dueToday } = habitProgress(goal, useCheckIns(goal.id))
  const weekly = goal.schedule?.kind === 'weekly'
  return (
    <section className={`${ui.card} flex items-center gap-4`}>
      <HabitCheck goal={goal} />
      <div>
        <p className="font-medium">{doneToday ? 'Done today' : dueToday ? 'Due today' : 'Not scheduled today'}</p>
        <p className="text-sm text-stone-500">
          {describeSchedule(goal)}
          {weekly && ` · ${done}/${required} this week`}
        </p>
      </div>
    </section>
  )
}

function ProjectSection({ goal }: { goal: Goal }) {
  const milestones = useMilestones(goal.id)
  const { done, total } = projectProgress(milestones)
  const [title, setTitle] = useState('')

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addMilestone(goal.id, title)
    setTitle('')
  }

  return (
    <section className={ui.card}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Milestones</h2>
        <span className="text-sm text-stone-500">{done}/{total}</span>
      </div>
      <ProgressBar value={total ? done / total : 0} color={goal.color} />
      <ul className="mt-4 flex flex-col gap-3">
        {milestones.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2">
            <div className="flex-1"><MilestoneCheck milestone={m} color={goal.color} /></div>
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveMilestone(m.id, -1)} className="px-1 text-stone-400 disabled:opacity-20">↑</button>
            <button type="button" aria-label="Move down" disabled={i === milestones.length - 1} onClick={() => moveMilestone(m.id, 1)} className="px-1 text-stone-400 disabled:opacity-20">↓</button>
            <button type="button" aria-label={`Delete ${m.title}`} onClick={() => deleteMilestone(m.id)} className="px-1 text-stone-400">✕</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 flex gap-2">
        <input className={`${ui.input} py-1.5`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" aria-label="New milestone" />
        <button type="submit" disabled={!title.trim()} className={`${ui.btn} ${ui.secondary} py-1.5`}>Add</button>
      </form>
      {total > 0 && done === total && goal.status === 'active' && (
        <CompletePrompt goal={goal} text="All milestones done!" />
      )}
    </section>
  )
}

function NumericSection({ goal }: { goal: Goal }) {
  const total = numericTotal(useCheckIns(goal.id))
  const target = goal.target?.amount ?? 0
  return (
    <section className={ui.card}>
      <p className="text-3xl font-bold">
        {formatAmount(total)} <span className="text-base font-normal text-stone-500">/ {formatAmount(target)} {goal.target?.unit}</span>
      </p>
      <div className="my-3"><ProgressBar value={target ? total / target : 0} color={goal.color} /></div>
      <NumericLog goal={goal} />
      {total >= target && goal.status === 'active' && <CompletePrompt goal={goal} text="Target reached!" />}
    </section>
  )
}

function History({ goal }: { goal: Goal }) {
  const checkIns = useCheckIns(goal.id).slice(0, 30)
  if (!checkIns.length) return null
  return (
    <section>
      <h2 className="mb-2 font-semibold">History</h2>
      <ul className={`${ui.card} divide-y divide-stone-100 py-0 dark:divide-stone-800`}>
        {checkIns.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2 text-sm">
            <span>{format(new Date(c.at), 'EEE, MMM d · p')}</span>
            <span className="flex items-center gap-3">
              {c.amount !== undefined && <span className="font-medium">+{formatAmount(c.amount)} {goal.target?.unit}</span>}
              <button type="button" onClick={() => undoCheckIn(c.id)} className="text-stone-400 underline">Undo</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CompletePrompt({ goal, text }: { goal: Goal; text: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-stone-100 p-3 dark:bg-stone-800">
      <span className="font-medium">{text}</span>
      <button type="button" onClick={() => setGoalStatus(goal.id, 'completed')} className={`${ui.btn} ${ui.primary} py-1.5`}>Mark complete</button>
    </div>
  )
}

function StatusActions({ goal }: { goal: Goal }) {
  async function remove() {
    if (!confirm(`Delete "${goal.title}"? Its history will be removed.`)) return
    await deleteGoal(goal.id)
    navigate(href.goals, { replace: true })
  }

  return (
    <section className="flex flex-wrap gap-2 border-t border-stone-200 pt-5 dark:border-stone-800">
      {goal.status === 'active' && <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setGoalStatus(goal.id, 'paused')}>Pause</button>}
      {goal.status !== 'active' && <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setGoalStatus(goal.id, 'active')}>{goal.status === 'paused' ? 'Resume' : 'Reactivate'}</button>}
      {goal.status !== 'completed' && <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setGoalStatus(goal.id, 'completed')}>Complete</button>}
      {goal.status !== 'archived' && <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => setGoalStatus(goal.id, 'archived')}>Archive</button>}
      <button type="button" className={`${ui.btn} ${ui.danger} ml-auto`} onClick={remove}>Delete</button>
    </section>
  )
}
