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
      <header className="flex items-center justify-between">
        <h1 className={ui.h1}>Goals</h1>
        <a href={href.newGoal} className={`${ui.btn} ${ui.primary}`}>+ New</a>
      </header>

      {goals.length === 0 && (
        <div className={`${ui.card} text-center`}>
          <p className="font-medium">No goals yet</p>
          <p className="mt-1 text-sm text-stone-500">Create one and start filling your jar.</p>
        </div>
      )}

      {SECTIONS.map(({ type, label }) => {
        const list = current.filter((g) => g.type === type)
        if (!list.length) return null
        return (
          <section key={type}>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-500 uppercase">{label}</h2>
            <ul className="flex flex-col gap-2">{list.map((g) => <GoalRow key={g.id} goal={g} />)}</ul>
          </section>
        )
      })}

      {finished.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold tracking-wide text-stone-500 uppercase">Finished ({finished.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">{finished.map((g) => <GoalRow key={g.id} goal={g} />)}</ul>
        </details>
      )}
    </div>
  )
}

function GoalRow({ goal }: { goal: Goal }) {
  return (
    <li>
      <a href={href.goal(goal.id)} className={`${ui.card} flex items-center gap-3 py-3 ${goal.status === 'paused' ? 'opacity-60' : ''}`}>
        <Marble color={goal.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{goal.title}</p>
          <p className="truncate text-sm text-stone-500">
            {goal.status === 'paused' ? 'Paused · ' : goal.status === 'completed' ? 'Completed · ' : goal.status === 'archived' ? 'Archived · ' : ''}
            <GoalSummary goal={goal} />
          </p>
        </div>
        <span aria-hidden className="text-stone-300">›</span>
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
