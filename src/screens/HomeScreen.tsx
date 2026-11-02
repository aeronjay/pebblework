import { format } from 'date-fns'
import { Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useToday } from '../app/useToday'
import { QuestCalendar } from '../features/calendar/QuestCalendar'
import { QuestJar } from '../features/jar/QuestJar'
import { QuestLists } from '../features/quests/components/QuestLists'
import { QuestSheet, type SheetTarget } from '../features/quests/components/QuestSheet'
import { SummaryChip } from '../features/quests/components/SummaryChip'
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

function Home() {
  const today = useToday()
  const quests = useQuestToday()
  const [sheet, setSheet] = useState<SheetTarget | null>(null)
  const aside = useRef<HTMLElement>(null)
  const stickyTop = useStickyTop(aside, 40)

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

  return (
    <div className="mx-auto w-full max-w-[1280px] lg:grid lg:grid-cols-[minmax(360px,1fr)_400px] lg:items-start lg:gap-8 xl:grid-cols-[minmax(360px,1fr)_440px] xl:gap-10">
      <div className="min-w-0">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-muted">{format(today, 'EEEE, MMMM d')}</p>
            <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-medium text-ink md:text-[40px]">
              Today’s quests
            </h1>
            <div className="mt-3 h-[26px]">{quests && <SummaryChip today={quests} />}</div>
          </div>
          <button
            type="button"
            onClick={() => setSheet({ mode: 'create', category: 'dq' })}
            aria-keyshortcuts="N"
            className={ui.quest}
          >
            <Plus aria-hidden className="size-4" strokeWidth={2} />
            New quest
            <kbd className={ui.questKbd}>N</kbd>
          </button>
        </header>

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

      {/* Wide screens: at least the viewport minus <main>'s padding (the jar grows into it), so the page only scrolls when
          the quest list is taller, or the screen is too short for the calendar plus a minimum-size jar. */}
      <aside
        ref={aside}
        style={{ top: stickyTop }}
        aria-label="Calendar and jar"
        className="mt-6 flex min-w-0 flex-col gap-4 lg:sticky lg:mt-0 lg:min-h-[calc(100dvh-5rem)]"
      >
        <QuestCalendar />
        <QuestJar />
      </aside>

      <QuestSheet target={sheet} todayKey={quests?.todayKey ?? format(today, 'yyyy-MM-dd')} onClose={() => setSheet(null)} />
    </div>
  )
}

// Sticky that also works when the column is taller than the viewport: it scrolls with the page until its
// bottom (the jar) is in view, then holds there, instead of pinning its top and hiding the jar for good.
function useStickyTop(ref: RefObject<HTMLElement | null>, gap = 32) {
  const [top, setTop] = useState(gap)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setTop(Math.min(gap, window.innerHeight - el.offsetHeight - gap))
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    update()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref, gap])
  return top
}

function ListsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-card border border-line bg-surface shadow-card motion-reduce:animate-none" />
      ))}
    </div>
  )
}
