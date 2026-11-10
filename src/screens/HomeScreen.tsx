import { format } from 'date-fns'
import { CalendarClock, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToday } from '../app/useToday'
import { BackupNudge } from '../features/backup/BackupNudge'
import { QuestCalendar } from '../features/calendar/QuestCalendar'
import { NowPanel } from '../features/focus/NowPanel'
import { useNotTonight, useNow, usePlan } from '../features/plan/hooks'
import { freshStart, isEvening, isHandled, liveSlots, needsReview, planCandidates, planDayKey, taskCandidates, type PlanDay } from '../features/plan/model'
import { PlanPreview, PlanPrompt, type PreviewLine } from '../features/plan/PlanPrompt'
import { reviewPlan, skipPlan } from '../features/plan/repo'
import type { DayPlan } from '../db/types'
import { PlanSheet } from '../features/plan/PlanSheet'
import { useTasks } from '../features/tasks/hooks'
import { QuestJar } from '../features/jar/QuestJar'
import { DayProgress } from '../features/quests/components/DayProgress'
import { QuestLists } from '../features/quests/components/QuestLists'
import { QuestSheet, type SheetTarget } from '../features/quests/components/QuestSheet'
import { ToastProvider } from '../features/quests/components/Toast'
import { useToast } from '../features/quests/components/toastContext'
import { useQuestToday } from '../features/quests/hooks'
import { ui } from '../ui/styles'

export function HomeScreen() {
  return (
    <ToastProvider>
      <Home />
    </ToastProvider>
  )
}

// Stage panels on small screens (jar and calendar each get their own card); on big screens the aside is the panel.
const STAGE_CARD = 'overflow-hidden rounded-[24px] bg-[var(--stage-bg)] p-5 text-ink sm:p-6 ring-1 ring-line lg:overflow-visible lg:rounded-none lg:bg-transparent lg:p-0 lg:ring-0'

function Home() {
  const today = useToday()
  const quests = useQuestToday()
  const [sheet, setSheet] = useState<SheetTarget | null>(null)
  const [planning, setPlanning] = useState<PlanDay | null>(null)

  // "N" opens a new quest, unless the user is typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || sheet || planning) return
      const el = e.target as HTMLElement
      if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      e.preventDefault()
      setSheet({ mode: 'create', category: 'dq' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, planning])

  const todayKey = quests?.todayKey ?? format(today, 'yyyy-MM-dd')
  const planState = usePlan(todayKey)
  const plan = planState?.plan
  const tasks = useTasks()
  const toast = useToast()
  const now = useNow()
  const slots = quests ? liveSlots(plan, quests.items, tasks) : []
  // Evenings are for tomorrow: plan it the night before so the day starts with something to look forward to. Daytime
  // (or a morning with no plan from last night) is for today. Either card asks once; after that the header button is
  // the way in.
  const evening = isEvening(now)
  const tomorrowKey = planDayKey(todayKey, 'tomorrow')
  const [notTonight, skipTonight] = useNotTonight(tomorrowKey)
  const hasCandidates = (ahead?: string) => !!quests && (planCandidates(quests.items, ahead).length > 0 || taskCandidates(tasks ?? []).length > 0)
  const prompt: PlanDay | null = !quests || !planState
    ? null
    : evening
      ? !planState.tomorrow && !notTonight && hasCandidates(tomorrowKey) ? 'tomorrow' : null
      : !plan && hasCandidates() ? 'today' : null
  const linesOf = (p: DayPlan): PreviewLine[] =>
    liveSlots(p, quests?.items ?? [], tasks).map((slot) => {
      const item = slot.questId ? quests?.items.find((i) => i.quest.id === slot.questId) : undefined
      const task = slot.taskId ? tasks?.find((t) => t.id === slot.taskId) : undefined
      return { slot, title: item?.quest.title ?? task?.title ?? '', done: item ? isHandled(item) : !!task?.completedAt }
    })
  const tomorrowLines = evening && quests && planState?.tomorrow ? linesOf(planState.tomorrow) : null
  // The morning after: last night's plan, shown for a quick look until "Looks good" or any change to it.
  const review = !evening && !!quests && needsReview(plan, todayKey) ? linesOf(plan!) : null
  const headerDay: PlanDay = evening ? 'tomorrow' : 'today'
  const headerPlanned = evening ? !!tomorrowLines?.length : slots.length > 0

  // Two zones: the desk (what to do: today, in progress, the quest lists behind their Today / All / per-list tabs) and the stage (what you've earned: the jar and
  // the calendar you claim from), on its own panel that follows the app theme.
  // `tall` (≥1024 wide and ≥700 high): a no-scroll app shell; the desk column scrolls on its own (the quest tabs stick
  // to its top) and the stage stays put. `lg` but short: the same two columns, with page scroll. Below lg both zones dissolve (display: contents) into one column ordered by `order-*`:
  // today, in progress, jar, quests, calendar.
  return (
    <>
      <div className="flex flex-col gap-6 px-4 pt-6 pb-10 md:px-8 md:pt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,40%)] lg:items-start lg:gap-0 lg:p-0 xl:grid-cols-[minmax(0,1fr)_minmax(480px,38%)] tall:h-dvh tall:items-stretch">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-8 lg:pt-10 lg:pl-10 lg:pr-8 xl:pl-14 xl:pr-12 tall:min-h-0 tall:overflow-y-auto tall:pt-0 tall:[scrollbar-gutter:stable]">
          {/* In the tall shell the header carries the top padding: on the scroller itself it would open a gap above the stuck tabs. */}
          <header className="order-1 tall:pt-10">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-[44px] leading-[0.95] font-normal tracking-[-0.03em] text-ink md:text-[56px]">
                  {format(today, 'EEEE')}
                </h1>
                <p className="mt-2 text-[15px] text-muted">{format(today, 'MMMM d, yyyy')}</p>
              </div>
              <div className="mt-1 flex shrink-0 items-center gap-2">
                {/* Always here, whatever happened to the morning prompt. */}
                <button
                  type="button"
                  onClick={() => setPlanning(headerDay)}
                  aria-label={headerPlanned ? `Edit ${headerDay}’s plan` : `Plan ${headerDay}`}
                  className="inline-flex items-center gap-2 rounded-control border border-line-strong bg-surface px-3 py-2.5 text-[14px] font-semibold text-ink transition hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <CalendarClock aria-hidden className="size-4" strokeWidth={2} />
                  <span className="max-sm:hidden">{headerPlanned ? (evening ? 'Edit tomorrow' : 'Edit plan') : `Plan ${headerDay}`}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSheet({ mode: 'create', category: 'dq' })}
                  aria-keyshortcuts="N"
                  className={ui.cta}
                >
                  <Plus aria-hidden className="size-4" strokeWidth={2.25} />
                  New quest
                  <kbd className={ui.ctaKbd}>N</kbd>
                </button>
              </div>
            </div>
            <div className="mt-6 min-h-[46px]">{quests && <DayProgress today={quests} />}</div>
          </header>

          <div className="order-2 flex min-w-0 flex-col gap-4">
            {prompt === 'today' && (
              <PlanPrompt
                day="today"
                fresh={freshStart(todayKey, planState?.lastActive)}
                onPlan={() => setPlanning('today')}
                onSkip={() => void toast.run(() => skipPlan(todayKey))}
              />
            )}
            {/* Tonight's ask for tomorrow: a new week or month still counts; "welcome back" is for the morning. */}
            {prompt === 'tomorrow' && <PlanPrompt day="tomorrow" fresh={freshStart(tomorrowKey, undefined)} onPlan={() => setPlanning('tomorrow')} onSkip={skipTonight} />}
            {tomorrowLines && <PlanPreview variant="tomorrow" dayKey={tomorrowKey} lines={tomorrowLines} onEdit={() => setPlanning('tomorrow')} />}
            {review && (
              <PlanPreview
                variant="review"
                dayKey={todayKey}
                lines={review}
                onEdit={() => setPlanning('today')}
                onConfirm={() => void toast.run(() => reviewPlan(todayKey))}
              />
            )}
            <BackupNudge />
            <NowPanel todayKey={todayKey} />
          </div>

          {/* Side padding + negative margin keep focus rings from being clipped. */}
          <div className="order-4 min-w-0 lg:-mx-3 lg:px-3 lg:pb-12">
            {quests ? (
              <QuestLists
                today={quests}
                onAdd={(category) => setSheet({ mode: 'create', category })}
                onEdit={(item) => setSheet({ mode: 'edit', item })}
                slots={slots}
              />
            ) : (
              <ListsSkeleton />
            )}
          </div>
        </div>

        <aside
          aria-label="Your jar and calendar"
          className="contents lg:m-3 lg:flex lg:min-w-0 lg:flex-col lg:gap-5 lg:rounded-[28px] lg:bg-[var(--stage-bg)] lg:ring-1 lg:ring-line lg:p-6 lg:text-ink xl:p-7 tall:min-h-0"
        >
          <div className={`order-3 flex min-w-0 flex-col ${STAGE_CARD} tall:min-h-0 tall:flex-1`}>
            <QuestJar />
          </div>
          <div className={`order-5 min-w-0 ${STAGE_CARD}`}>
            <QuestCalendar />
          </div>
        </aside>
      </div>

      <QuestSheet target={sheet} todayKey={todayKey} onClose={() => setSheet(null)} />
      {quests && (
        <PlanSheet
          open={!!planning}
          day={planning ?? 'today'}
          todayKey={todayKey}
          items={quests.items}
          tasks={tasks ?? []}
          plans={{ today: plan, tomorrow: planState?.tomorrow }}
          onClose={() => setPlanning(null)}
        />
      )}
    </>
  )
}

function ListsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
      ))}
    </div>
  )
}
