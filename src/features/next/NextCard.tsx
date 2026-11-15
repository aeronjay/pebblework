import { ArrowUpRight, Check, Play } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { href, navigate } from '../../app/router'
import type { PlanSlot, Task } from '../../db/types'
import type { InProgressItem } from '../board/repo'
import { DEFAULT_DURATION } from '../focus/model'
import { startSession } from '../focus/repo'
import { useGoalOf } from '../identity/goalContext'
import { isOutcome } from '../identity/repo'
import { isProject } from '../quests/day'
import { useCompleteFeedback } from '../quests/components/feedback'
import { isDueToday } from '../quests/components/lists'
import { useToast } from '../quests/components/toastContext'
import type { QuestItem } from '../quests/hooks'
import { completeQuest } from '../quests/repo'
import { toggleTask } from '../tasks/repo'
import { goalIdOf, nextCandidates, pickNext, type NextPick } from './model'

const EASY_START_MIN = 5

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
const quiet = `rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink ${focus}`

interface Props {
  now: Date
  todayKey: string
  items: QuestItem[]
  slots: PlanSlot[]
  tasks: Task[]
  inProgress: InProgressItem[]
  onAdd: () => void
}

// One thing, chosen for you, with a way to start it that asks for almost nothing ("Just 5 min"). Choosing what to do
// is its own small task, and it's the one most often skipped; this takes it off the table. "Not now" moves to the next
// candidate for this visit only: nothing is rescheduled, and nothing is judged.
export function NextCard({ now, todayKey, items, slots, tasks, inProgress, onAdd }: Props) {
  const reduce = useReducedMotion()
  const toast = useToast()
  const feedback = useCompleteFeedback()
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  const candidates = nextCandidates({ now, todayKey, items, slots, tasks, inProgress })
  const pick = pickNext(candidates, skipped)
  const goal = useGoalOf(pick ? goalIdOf(pick) : undefined)

  const due = items.filter(isDueToday)
  const allDone = due.length > 0 && due.every((i) => i.done)

  async function start(minutes: number) {
    if (!pick || busy) return
    setBusy(true)
    const ok = await toast.run(async () => {
      await startSession({
        task: pick.title,
        plannedMin: minutes,
        questId: pick.kind === 'quest' ? pick.item.quest.id : pick.kind === 'card' ? pick.card.quest.id : undefined,
        cardId: pick.kind === 'card' ? pick.card.card.id : undefined,
      })
      return true
    })
    setBusy(false)
    if (ok) navigate(href.focus)
  }

  async function done() {
    if (!pick || busy) return
    setBusy(true)
    feedback()
    if (pick.kind === 'quest') {
      const ok = await toast.run(() => completeQuest(pick.item.quest.id))
      if (ok === false) toast.show('Can only be completed on its due day.')
      else if (ok && goal) toast.show(isOutcome(goal) ? `One step closer: ${goal.statement}.` : `+1 vote for: ${goal.statement}.`, 'info')
    } else if (pick.kind === 'task') {
      await toast.run(() => toggleTask(pick.task.id))
    }
    setBusy(false)
  }

  // A card, or a project given a time in the plan: the work lives on its board.
  const board = pick?.kind === 'card' ? pick.card.quest.id : pick?.kind === 'quest' && isProject(pick.item.quest) ? pick.item.quest.id : undefined

  return (
    <section aria-label="Next up" className="rounded-card border border-line-strong bg-surface px-5 py-4 sm:px-6 sm:py-5">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pick?.key ?? (allDone ? 'done' : 'empty')}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {pick ? (
            <Pick pick={pick} goal={goal ? { text: goal.statement, why: goal.why, outcome: isOutcome(goal) } : undefined} />
          ) : (
            <Rest allDone={allDone} waved={skipped.size > 0 && candidates.length > 0} onReset={() => setSkipped(new Set())} onAdd={onAdd} />
          )}
        </motion.div>
      </AnimatePresence>

      {pick && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(DEFAULT_DURATION)}
            className={`inline-flex items-center gap-2 rounded-control bg-blaze py-2 pr-3.5 pl-3 text-[14px] font-semibold text-on-blaze transition-[filter] hover:brightness-[1.06] active:brightness-95 disabled:opacity-60 ${focus}`}
          >
            <Play aria-hidden className="size-4" strokeWidth={2.25} fill="currentColor" />
            Start, {DEFAULT_DURATION} min
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(EASY_START_MIN)}
            title="Starting is the hard part. Five minutes counts, and you can keep going."
            className={`rounded-control border border-line-strong bg-surface px-3 py-2 text-[14px] font-semibold text-ink transition hover:bg-sunken disabled:opacity-60 ${focus}`}
          >
            Just {EASY_START_MIN} min
          </button>
          <span className="ml-auto flex items-center gap-0.5">
            {board ? (
              <a href={href.board(board)} className={`inline-flex items-center gap-1 ${quiet}`}>
                Open board
                <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={1.75} />
              </a>
            ) : (
              <button type="button" disabled={busy} onClick={() => void done()} className={`inline-flex items-center gap-1.5 ${quiet}`}>
                <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
                Done
              </button>
            )}
            {candidates.length > 1 && (
              <button type="button" onClick={() => setSkipped((s) => new Set([...s, pick.key]))} className={quiet}>
                Not now
              </button>
            )}
          </span>
        </div>
      )}
    </section>
  )
}

function Pick({ pick, goal }: { pick: NextPick; goal?: { text: string; why?: string; outcome: boolean } }) {
  return (
    <>
      <p className="flex items-center gap-2 text-[13px] font-semibold text-muted">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-blaze" />
        Next up
        <span className="min-w-0 truncate font-normal">{pick.reason}</span>
      </p>
      <h2 className="mt-1.5 font-display text-[24px] leading-[1.15] font-normal tracking-[-0.01em] text-pretty break-words text-ink sm:text-[28px]">{pick.title}</h2>
      {goal && (
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          {goal.outcome ? 'Toward ' : 'A vote for becoming '}
          <span className="font-medium text-ink">{goal.text}</span>
          {goal.why && <span>. {goal.why}</span>}
        </p>
      )}
      {pick.kind !== 'card' && pick.slot?.ifThen && <p className="mt-1 text-[13px] text-muted">If it slips, I’ll {pick.slot.ifThen}</p>}
    </>
  )
}

function Rest({ allDone, waved, onReset, onAdd }: { allDone: boolean; waved: boolean; onReset: () => void; onAdd: () => void }) {
  if (waved) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14.5px] text-muted">
          <span className="font-semibold text-ink">Nothing else lined up.</span> Everything left is something you waved off for now.
        </p>
        <button type="button" onClick={onReset} className={quiet}>
          Show them again
        </button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-display text-[22px] leading-tight font-normal text-ink">{allDone ? 'That’s today done.' : 'Nothing waiting.'}</p>
        <p className="mt-1 text-[13.5px] text-muted">{allDone ? 'Everything today asked for is finished. Stopping here is allowed.' : 'Nothing is due and nothing is started. Add a quest when you’re ready.'}</p>
      </div>
      {!allDone && (
        <button type="button" onClick={onAdd} className={quiet}>
          Add a quest
        </button>
      )}
    </div>
  )
}
