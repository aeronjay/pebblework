import { format } from 'date-fns'
import { href } from '../app/router'
import { useToday } from '../app/useToday'
import type { Goal } from '../db/types'
import { HabitCheck, MilestoneCheck, NumericLog } from '../features/goals/GoalActions'
import { useCheckIns, useGoals, useMilestones } from '../features/goals/hooks'
import { JarCard } from '../features/jar/JarCard'
import { describeSchedule, formatAmount, habitProgress, numericTotal, projectProgress } from '../features/goals/progress'
import { Marble } from '../ui/Marble'
import { ProgressBar } from '../ui/ProgressBar'
import { ui } from '../ui/styles'

export function TodayScreen() {
  const goals = useGoals()
  const today = useToday()
  if (!goals) return null
  const active = goals.filter((g) => g.status === 'active')

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(220px,300px)_1fr] md:grid-rows-[auto_1fr] md:items-start md:gap-x-10 md:gap-y-6">
      <header className="md:col-start-2">
        <p className="text-sm text-stone-500">{format(today, 'EEEE, MMMM d')}</p>
        <h1 className={ui.h1}>Today</h1>
      </header>

      <aside className="mx-auto w-full max-w-[240px] md:sticky md:top-10 md:col-start-1 md:row-span-2 md:row-start-1 md:max-w-none">
        <JarCard />
      </aside>

      <div className="md:col-start-2">
        {active.length === 0 ? (
          <div className={`${ui.card} text-center`}>
            <p className="font-medium">Nothing to do yet</p>
            <p className="mt-1 text-sm text-stone-500">Every win drops a marble in your jar. Start with one small goal.</p>
            <a href={href.newGoal} className={`${ui.btn} ${ui.primary} mt-4 inline-block`}>Create a goal</a>
          </div>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {active.map((g) => (
              <li key={g.id}>
                {g.type === 'habit' && <HabitItem goal={g} today={today} />}
                {g.type === 'project' && <ProjectItem goal={g} />}
                {g.type === 'numeric' && <NumericItem goal={g} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Title({ goal, sub }: { goal: Goal; sub: string }) {
  return (
    <a href={href.goal(goal.id)} className="min-w-0 flex-1">
      <p className="truncate font-medium">{goal.title}</p>
      <p className="truncate text-sm text-stone-500">{sub}</p>
    </a>
  )
}

function HabitItem({ goal, today }: { goal: Goal; today: Date }) {
  const { dueToday, doneToday, done, required } = habitProgress(goal, useCheckIns(goal.id), today)
  const weekly = goal.schedule?.kind === 'weekly'
  const sub = !dueToday && !doneToday ? `Rest day · ${describeSchedule(goal)}` : weekly ? `${done}/${required} this week` : describeSchedule(goal)
  return (
    <div className={`${ui.card} flex items-center gap-3 py-3 ${!dueToday && !doneToday ? 'opacity-50' : ''}`}>
      <Title goal={goal} sub={sub} />
      <HabitCheck goal={goal} />
    </div>
  )
}

function ProjectItem({ goal }: { goal: Goal }) {
  const { done, total, next } = projectProgress(useMilestones(goal.id))
  return (
    <div className={`${ui.card} flex flex-col gap-3 py-3`}>
      <div className="flex items-center gap-3">
        <Marble color={goal.color} />
        <Title goal={goal} sub={total ? `${done}/${total} milestones` : 'Add milestones to start earning'} />
      </div>
      {next && (
        <div className="rounded-xl bg-stone-50 px-3 py-2 dark:bg-stone-800">
          <p className="mb-1 text-xs text-stone-400">Next step</p>
          <MilestoneCheck key={next.id} milestone={next} color={goal.color} />
        </div>
      )}
    </div>
  )
}

function NumericItem({ goal }: { goal: Goal }) {
  const total = numericTotal(useCheckIns(goal.id))
  const target = goal.target?.amount ?? 0
  return (
    <div className={`${ui.card} flex flex-col gap-3 py-3`}>
      <div className="flex items-center gap-3">
        <Marble color={goal.color} />
        <Title goal={goal} sub={`${formatAmount(total)} / ${formatAmount(target)} ${goal.target?.unit ?? ''}`} />
      </div>
      <ProgressBar value={target ? total / target : 0} color={goal.color} />
      <NumericLog goal={goal} />
    </div>
  )
}
