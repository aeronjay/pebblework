import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { href } from '../app/router'
import { useToday } from '../app/useToday'
import { CategoryBars, ColumnChart, Tile, type Column } from '../features/insights/charts'
import { computeInsights, streakLine, type Insights } from '../features/insights/model'
import { CATEGORY } from '../features/quests/meta'
import { dayKey, isRestDay, parseDayKey } from '../features/quests/day'
import { allQuests, liveCompletions } from '../features/quests/repo'
import { sealedQuestJarCount } from '../features/quests/claim'

const WEEKDAY = (weekday: number) => new Date(2026, 0, 4 + weekday) // Jan 4, 2026 is a Sunday

const fmt1 = (n: number) => (n === 0 ? '0' : n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n)))

export function InsightsScreen() {
  const today = useToday()
  const todayKey = dayKey(today)
  const data = useLiveQuery(async () => {
    const [completions, jarsFilled, quests] = await Promise.all([liveCompletions(), sealedQuestJarCount(), allQuests()])
    return {
      insights: computeInsights(completions, today, (key) => isRestDay(quests, key)),
      doneToday: completions.some((c) => c.dayKey === todayKey),
      jarsFilled,
    }
  }, [todayKey])

  return (
    <div>
      <header className="mb-8">
        <p className="text-[15px] font-semibold text-muted">Patterns</p>
        <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.025em] text-ink md:text-[42px]">Insights</h1>
        <p className="mt-2 max-w-[52ch] text-[14px] text-muted">What you tend to finish, and when. A mirror, not a scoreboard.</p>
      </header>

      {!data ? (
        <div aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[118px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
          ))}
        </div>
      ) : data.insights.total === 0 ? (
        <Empty />
      ) : (
        <Body insights={data.insights} doneToday={data.doneToday} jarsFilled={data.jarsFilled} />
      )}
    </div>
  )
}

function Body({ insights: i, doneToday, jarsFilled }: { insights: Insights; doneToday: boolean; jarsFilled: number }) {
  const best = i.bestWeekday
  const tied = best ? i.weekdays.filter((w) => w.weekday !== best.weekday && Math.abs(w.average - best.average) < 0.05) : []
  const dayName = (wd: number) => format(WEEKDAY(wd), 'EEEE')
  const weekdayColumns: Column[] = i.weekdays.map((w) => ({
    key: String(w.weekday),
    label: format(WEEKDAY(w.weekday), 'EEE'),
    long: `${format(WEEKDAY(w.weekday), 'EEEE')}s`,
    value: w.average,
    display: fmt1(w.average),
    emphasis: best?.weekday === w.weekday || tied.includes(w),
  }))
  const weekColumns: Column[] = i.weeks.map((w, idx) => {
    const current = idx === i.weeks.length - 1
    const d = parseDayKey(w.weekStart)
    return {
      key: w.weekStart,
      // Labels every fourth week back from now, so they never crowd on a phone; each column's tooltip names its week.
      label: current ? 'Now' : (i.weeks.length - 1 - idx) % 4 === 0 ? format(d, 'MMM d') : ' ',
      long: current ? 'This week so far' : `Week of ${format(d, 'MMM d')}`,
      value: w.count,
      display: String(w.count),
      muted: current,
      emphasis: false,
    }
  })
  const finishedWeeks = i.weeks.slice(0, -1)
  const startedAt = finishedWeeks.findIndex((w) => w.count > 0)
  const counted = startedAt < 0 ? [] : finishedWeeks.slice(startedAt)
  const avg = counted.length ? counted.reduce((n, w) => n + w.count, 0) / counted.length : 0
  const thisWeek = i.weeks.at(-1)?.count ?? 0
  const top = i.topCategory
  const topShare = top ? Math.round((i.categories[top] / i.total) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Tile label="Current run" value={i.currentStreak} unit={i.currentStreak === 1 ? 'day' : 'days'} note={streakLine(i.currentStreak, i.bestStreak, doneToday, i.streakAtRisk)} />
        <Tile label="Longest run" value={i.bestStreak} unit={i.bestStreak === 1 ? 'day' : 'days'} note="Days with at least one finished quest. One missed day won’t break a run, two in a row will. Rest days never count against you." />
        <Tile label="Days you showed up" value={i.activeDays.toLocaleString()} note="Every one of them counts, in a row or not." />
        <Tile
          label="Quests finished"
          value={i.total.toLocaleString()}
          note={jarsFilled ? `${jarsFilled} ${jarsFilled === 1 ? 'jar' : 'jars'} filled so far.` : 'Including project stages.'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Your strongest day"
          line={
            best ? (
              tied.length ? (
                <>
                  <strong className="font-semibold text-ink">{[best, ...tied].map((w) => `${dayName(w.weekday)}s`).join(' and ').replace(/ and (?=.* and )/g, ', ')}</strong>{' '}
                  are neck and neck, at about {fmt1(best.average)} finished each. Worth protecting.
                </>
              ) : (
                <>
                  <strong className="font-semibold text-ink">{dayName(best.weekday)}s</strong> lead, with about {fmt1(best.average)} finished on an
                  average {dayName(best.weekday)}. Worth protecting.
                </>
              )
            ) : null
          }
          foot="Average quests finished per weekday, over the last 12 weeks."
        >
          <ColumnChart columns={weekdayColumns} unit="finished on average" />
        </Card>

        <Card
          title="What you finish most"
          line={
            top ? (
              <>
                <strong className="font-semibold text-ink">{CATEGORY[top].label}s</strong> make up {topShare}% of what you’ve finished.
              </>
            ) : null
          }
          foot="Each finished quest, project stage or project counts once."
        >
          <div className="flex min-h-[180px] flex-col justify-center">
            <CategoryBars counts={i.categories} />
          </div>
        </Card>
      </div>

      <Card
        title="The last 12 weeks"
        line={
          <>
            {thisWeek === 0 ? 'Nothing finished yet this week' : <>{thisWeek} finished this week so far</>}
            {avg > 0 ? <>, and your weekly average is about {fmt1(avg)}.</> : '.'}
          </>
        }
        foot="Quests finished per week. The current week is still in progress."
      >
        <ColumnChart columns={weekColumns} unit="finished" height={120} />
      </Card>
    </div>
  )
}

function Card({ title, line, foot, children }: { title: string; line: ReactNode; foot: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-card border border-line bg-surface p-5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      {line && <p className="mt-1 text-[14px] leading-relaxed text-muted">{line}</p>}
      <div className="mt-5">{children}</div>
      <p className="mt-3 text-[12px] text-faint">{foot}</p>
    </section>
  )
}

function Empty() {
  return (
    <section className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-14 text-center">
      <h2 className="font-display text-[22px] leading-tight font-normal text-ink">Patterns show up with a little history</h2>
      <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-muted">
        Finish a few quests and this page will start to show your rhythm: your strongest days, your runs, and the kind of quest you finish most.
      </p>
      <a
        href={href.home}
        className="mt-6 inline-flex items-center gap-2 rounded-control border border-line-strong bg-surface px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Go to today’s quests
      </a>
    </section>
  )
}
