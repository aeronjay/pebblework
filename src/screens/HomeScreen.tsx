import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useToday } from '../app/useToday'
import { BackupNudge } from '../features/backup/BackupNudge'
import { QuestCalendar } from '../features/calendar/QuestCalendar'
import { InProgressStrip } from '../features/focus/InProgressStrip'
import { QuestJar } from '../features/jar/QuestJar'
import { DayProgress } from '../features/quests/components/DayProgress'
import { QuestLists } from '../features/quests/components/QuestLists'
import { QuestSheet, type SheetTarget } from '../features/quests/components/QuestSheet'
import { ToastProvider } from '../features/quests/components/Toast'
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

  // "N" opens a new quest, unless the user is typing somewhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || sheet) return
      const el = e.target as HTMLElement
      if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      e.preventDefault()
      setSheet({ mode: 'create', category: 'dq' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet])

  const todayKey = quests?.todayKey ?? format(today, 'yyyy-MM-dd')

  // Two zones: the desk (what to do: today, in progress, the quest lists behind their Today / All / per-list tabs) and the stage (what you've earned: the jar and
  // the calendar you claim from), on its own panel that follows the app theme.
  // `tall` (≥1024 wide and ≥700 high): a no-scroll app shell; only the quest list scrolls. `lg` but short: the same two
  // columns, with page scroll. Below lg both zones dissolve (display: contents) into one column ordered by `order-*`:
  // today, in progress, jar, quests, calendar.
  return (
    <>
      <div className="flex flex-col gap-6 px-4 pt-6 pb-10 md:px-8 md:pt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,40%)] lg:items-start lg:gap-0 lg:p-0 xl:grid-cols-[minmax(0,1fr)_minmax(480px,38%)] tall:h-dvh tall:items-stretch">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-8 lg:pt-10 lg:pl-10 lg:pr-8 xl:pl-14 xl:pr-12 tall:min-h-0">
          <header className="order-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-[44px] leading-[0.95] font-normal tracking-[-0.03em] text-ink md:text-[56px]">
                  {format(today, 'EEEE')}
                </h1>
                <p className="mt-2 text-[15px] text-muted">{format(today, 'MMMM d, yyyy')}</p>
              </div>
              <button
                type="button"
                onClick={() => setSheet({ mode: 'create', category: 'dq' })}
                aria-keyshortcuts="N"
                className={`${ui.cta} mt-1 shrink-0`}
              >
                <Plus aria-hidden className="size-4" strokeWidth={2.25} />
                New quest
                <kbd className={ui.ctaKbd}>N</kbd>
              </button>
            </div>
            <div className="mt-6 min-h-[46px]">{quests && <DayProgress today={quests} />}</div>
          </header>

          <div className="order-2 flex min-w-0 flex-col gap-4">
            <BackupNudge />
            <InProgressStrip todayKey={todayKey} />
          </div>

          {/* The one scroll region of the shell (the quest tabs stick to its top). Side padding + negative margin keep focus rings from being clipped. */}
          <div className="order-4 min-w-0 lg:-mx-3 lg:px-3 lg:pb-12 tall:min-h-0 tall:flex-1 tall:overflow-y-auto tall:[scrollbar-gutter:stable]">
            {quests ? (
              <QuestLists
                today={quests}
                onAdd={(category) => setSheet({ mode: 'create', category })}
                onEdit={(item) => setSheet({ mode: 'edit', item })}
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
