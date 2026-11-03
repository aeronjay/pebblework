import { Check, ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'
import { ProjectsIcon } from '../../../app/icons/NavIcons'
import { href } from '../../../app/router'
import type { ProjectSummary } from '../../board/hooks'
import type { QuestItem } from '../hooks'
import { CATEGORY } from '../meta'
import { describeProject } from './describe'
import type { RowDrag } from './QuestRow'
import { RowActions } from './RowActions'

interface Props {
  item: QuestItem
  summary?: ProjectSummary // undefined while the board summaries load
  todayKey: string
  drag?: RowDrag
  onEdit: () => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

// A project in the quest list: no checkbox (stages are finished on the board). The whole row opens the board.
export function ProjectRow({ item, summary, todayKey, drag, onEdit, onMove, canMoveUp, canMoveDown }: Props) {
  const { quest } = item
  const meta = CATEGORY[quest.category]
  const done = !!quest.projectDoneAt
  const total = summary?.total ?? 0
  const finished = summary?.done ?? 0
  const value = done ? 1 : total ? finished / total : 0
  const deadline = describeProject(quest, todayKey)
  const late = !done && !!quest.dueDate && quest.dueDate < todayKey
  const stages = summary ? (total ? `${finished}/${total} stages` : 'No stages yet') : ''

  return (
    <motion.li
      layout={drag?.sorting ? false : 'position'}
      initial={false}
      exit={drag?.sorting ? undefined : { opacity: 0, height: 0, transition: { duration: 0.18 } }}
      className="group/row relative"
    >
      <div
        ref={drag?.ref}
        style={drag?.style}
        className={`relative flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors duration-150 hover:bg-sunken/55 has-[:focus-visible]:bg-sunken/55 ${drag?.dragging ? 'opacity-40' : ''}`}
      >
        {drag?.handle}
        <span
          aria-hidden
          className="relative grid size-[34px] shrink-0 place-items-center rounded-[10px] transition-colors"
          style={
            done
              ? { backgroundColor: meta.color, color: 'rgb(12 13 16 / 0.86)' } // dark check: white on amber/jade fails AA
              : { backgroundColor: meta.soft, color: meta.ink, ['--nav-accent' as string]: meta.color }
          }
        >
          {done ? <Check className="size-4" strokeWidth={2.5} /> : <ProjectsIcon active className="size-[18px]" />}
        </span>

        <div className="min-w-0 flex-1">
          <a
            href={href.board(quest.id)}
            className="block text-[15px] leading-[22px] font-medium break-words outline-none after:absolute after:inset-0 after:rounded-control after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
            aria-label={`${quest.title}, project${stages ? `, ${stages}` : ''}${done ? ', completed' : ''}. Open board`}
          >
            <span className={done ? 'text-muted' : 'text-ink'}>{quest.title}</span>
          </a>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[12.5px] leading-5 text-faint">
            <span aria-hidden className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-sunken ring-1 ring-line ring-inset sm:w-20">
              <motion.span
                className="block h-full rounded-full"
                style={{ backgroundColor: meta.color, originX: 0 }}
                initial={false}
                animate={{ scaleX: value }}
                transition={{ type: 'spring', bounce: 0, duration: 0.6 }}
              />
            </span>
            {stages && <span className="shrink-0 font-medium text-muted tabular-nums">{stages}</span>}
            <span className="min-w-0 truncate">
              {(done || quest.dueDate) && <span className={late ? 'text-danger-ink' : ''}>{deadline}</span>}
              {!done && summary?.nextCard && (
                <>
                  {quest.dueDate && <span aria-hidden>, </span>}
                  Next: {summary.nextCard.title}
                </>
              )}
            </span>
          </div>
        </div>

        <RowActions
          className="relative z-10"
          questId={quest.id}
          title={quest.title}
          onEdit={onEdit}
          onMove={onMove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-faint transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-ink motion-reduce:transition-none"
          strokeWidth={1.75}
        />
      </div>
    </motion.li>
  )
}
