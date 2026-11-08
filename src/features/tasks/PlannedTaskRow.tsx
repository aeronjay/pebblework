import { motion } from 'motion/react'
import type { Task } from '../../db/types'
import { formatDayInline } from '../quests/components/describe'
import { PlanLine, type RowPlan } from '../quests/components/PlanLine'
import { useToast } from '../quests/components/toastContext'
import { TickBox } from './LooseEnds'
import { toggleTask } from './repo'

// A loose end in today's plan, shown on the Today list at its time. Ticking it works as it does under Loose ends
// (a side-quest stone the first time); it stays here, ticked, so the plan reads as done.
export function PlannedTaskRow({ task, todayKey, plan }: { task: Task; todayKey: string; plan: RowPlan }) {
  const toast = useToast()
  const done = !!task.completedAt
  const late = !done && !!task.dueDate && task.dueDate < todayKey
  return (
    <motion.li layout="position" initial={false} exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }} className="group/row relative">
      <div className="relative flex items-start gap-3 rounded-control px-3 py-2.5 transition-colors duration-150 hover:bg-sunken/55 has-[:focus-visible]:bg-sunken/55">
        <div className="grid w-[22px] shrink-0 justify-items-center">
          <TickBox ticked={done} label={task.title} onClick={() => void toast.run(() => toggleTask(task.id))} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[15px] leading-[22px] font-medium break-words line-through transition-[color,text-decoration-color] duration-300 ${
              done ? 'text-faint decoration-faint/80' : 'text-ink decoration-transparent'
            }`}
          >
            {task.title}
          </p>
          <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">
            <span className="font-medium">Loose end</span>
            {task.dueDate && <span className={late ? 'text-danger-ink' : ''}>, {late ? 'was due' : 'due'} {formatDayInline(task.dueDate, todayKey)}</span>}
          </p>
          <PlanLine plan={plan} title={task.title} done={done} />
        </div>
      </div>
    </motion.li>
  )
}

