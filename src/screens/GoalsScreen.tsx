import { ChevronRight, Plus, Target } from 'lucide-react'
import type { Goal, GoalType } from '../db/types'
import { href } from '../app/router'
import { useCheckIns, useGoals, useMilestones } from '../features/goals/hooks'
import { describeSchedule, formatAmount, numericTotal, projectProgress } from '../features/goals/progress'
import { Marble } from '../ui/Marble'
import { ui } from '../ui/styles'

const SECTIONS: { type: GoalType; label: string }[] = [
  { type: 'habit', label: 'Habits' },
  { type: 'project', label: 'Projects' },
  { type: 'numeric', label: 'Targets' },
]

export function GoalsScreen() {
  const goals = useGoals()
  if (!goals) return null

  const current = goals.filter((g) => g.status === 'active' || g.status === 'paused')
  const finished = goals.filter((g) => g.status === 'completed' || g.status === 'archived')

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className={ui.h1}>Goals</h1>
        <a href={href.newGoal} className={`${ui.btn} ${ui.primary} py-2 pr-3.5 pl-3 text-[14px]`}>
          <Plus aria-hidden className="size-4" strokeWidth={2} />
          New goal
        </a>
      </header>

      {goals.length === 0 && (
        <div className={`${ui.card} flex flex-col items-center px-6 py-8 text-center`}>
          <span className="grid size-11 place-items-center rounded-full bg-sunken text-muted">
            <Target aria-hidden className="size-5" strokeWidth={1.75} />
          </span>
          <p className="mt-4 font-display text-[17px] font-medium tracking-tight">No goals yet</p>
          <p className="mt-1 text-[13px] text-muted">Create one and start filling your jar.</p>
        </div>
      )}

      {SECTIONS.map(({ type, label }) => {
        const list = current.filter((g) => g.type === type)
        if (!list.length) return null
        return (
          <section key={type}>
            <h2 className="mb-2.5 text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">{label}</h2>
            <ul className="grid gap-2 lg:grid-cols-2">{list.map((g) => <GoalRow key={g.id} goal={g} />)}</ul>
          </section>
        )
      })}

      {finished.length > 0 && (
        <details>
          <summary className="cursor-pointer rounded-lg text-[12px] font-semibold tracking-[0.12em] text-muted uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring">Finished ({finished.length})</summary>
          <ul className="mt-2 grid gap-2 lg:grid-cols-2">{finished.map((g) => <GoalRow key={g.id} goal={g} />)}</ul>
        </details>
      )}
    </div>
  )
}

function GoalRow({ goal }: { goal: Goal }) {
  return (
    <li>
      <a href={href.goal(goal.id)} className={`${ui.card} group flex items-center gap-3 py-3 outline-none transition hover:bg-sunken/40 focus-visible:ring-2 focus-visible:ring-ring ${goal.status === 'paused' ? 'opacity-60' : ''}`}>
        <Marble color={goal.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">{goal.title}</p>
          <p className="truncate text-[12.5px] text-faint">
            {goal.status === 'paused' ? 'Paused · ' : goal.status === 'completed' ? 'Completed · ' : goal.status === 'archived' ? 'Archived · ' : ''}
            <GoalSummary goal={goal} />
          </p>
        </div>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" strokeWidth={1.75} />
      </a>
    </li>
  )
}

export function GoalSummary({ goal }: { goal: Goal }) {
  if (goal.type === 'habit') return <>{describeSchedule(goal)}</>
  if (goal.type === 'project') return <ProjectSummary goalId={goal.id} />
  return <NumericSummary goal={goal} />
}

function ProjectSummary({ goalId }: { goalId: string }) {
  const { done, total } = projectProgress(useMilestones(goalId))
  return <>{total ? `${done}/${total} milestones` : 'No milestones yet'}</>
}

function NumericSummary({ goal }: { goal: Goal }) {
  const total = numericTotal(useCheckIns(goal.id))
  return <>{formatAmount(total)} / {formatAmount(goal.target?.amount ?? 0)} {goal.target?.unit}</>
}
