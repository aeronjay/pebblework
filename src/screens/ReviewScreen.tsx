import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, CornerDownRight } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useToday } from '../app/useToday'
import { getSettings } from '../db/db'
import type { WeeklyReview } from '../db/types'
import { useReviews, useReviewWeek } from '../features/review/hooks'
import { saveReview, shiftWeek, weekLabel, weekStartKey, weekSummary, type ReviewField, type ReviewPatch, type WeekSummary } from '../features/review/repo'
import { PEBBLE } from '../features/quests/components/Pebble'
import { CATEGORY, CATEGORY_ORDER } from '../features/quests/meta'
import { parseDayKey } from '../features/quests/day'

const SAVE_DELAY = 500

const PROMPTS: { field: ReviewField; title: string; hint: string; placeholder: string }[] = [
  {
    field: 'wentWell',
    title: 'What went well',
    hint: 'Small wins count. Name what you’d like more of.',
    placeholder: 'Kept my morning walk four days out of seven…',
  },
  {
    field: 'inTheWay',
    title: 'What got in the way',
    hint: 'Not a verdict, just the friction. Naming it is half of moving past it.',
    placeholder: 'Late nights made mornings hard…',
  },
  {
    field: 'tweak',
    title: 'One tweak for next week',
    hint: 'One small, concrete change. You’ll see it here next week.',
    placeholder: 'Lay out my shoes the night before.',
  },
]

const iconBtn =
  'inline-flex size-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35 outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ReviewScreen() {
  const today = useToday()
  const thisWeek = weekStartKey(today)
  const [weekStart, setWeekStart] = useState(thisWeek)
  const week = useReviewWeek(weekStart, shiftWeek(weekStart, -1))
  const reviews = useReviews()
  const settings = useLiveQuery(() => getSettings())
  const isCurrent = weekStart === thisWeek
  const reviewDay = settings?.weeklyReviewDay ?? 0
  const top = useRef<HTMLDivElement>(null)

  function go(to: string) {
    setWeekStart(to > thisWeek ? thisWeek : to)
  }

  const past = (reviews ?? []).filter((r) => r.weekStart !== weekStart)

  return (
    <div ref={top} className="flex flex-col gap-6 scroll-mt-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-muted">Weekly reflection</p>
          <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.025em] text-ink md:text-[42px]">Review</h1>
          <p className="mt-2 max-w-[52ch] text-[14px] text-muted">
            Three short questions, once a week. {isCurrent && today.getDay() === reviewDay ? 'Today’s your review day.' : `${format(dayOfWeek(reviewDay), 'EEEE')}s are a good time for it.`}
          </p>
        </div>
        <nav aria-label="Week" className="flex items-center gap-1">
          <button type="button" className={iconBtn} onClick={() => go(shiftWeek(weekStart, -1))} aria-label="Previous week">
            <ChevronLeft aria-hidden className="size-[18px]" />
          </button>
          <p className="min-w-[8.5rem] text-center text-[14px] font-semibold text-ink tabular-nums" aria-live="polite">
            {isCurrent ? 'This week' : weekLabel(weekStart, today)}
          </p>
          <button type="button" className={iconBtn} onClick={() => go(shiftWeek(weekStart, 1))} disabled={isCurrent} aria-label="Next week">
            <ChevronRight aria-hidden className="size-[18px]" />
          </button>
        </nav>
      </header>

      {week === undefined ? (
        <div aria-hidden className="h-[520px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
      ) : (
        <>
          <WeekCard summary={weekSummary(weekStart, week.completions)} label={weekLabel(weekStart, today)} isCurrent={isCurrent} />
          {week.previous?.tweak && (
            <aside className="flex gap-3 rounded-card border border-line bg-sunken/60 px-4 py-3.5">
              <CornerDownRight aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-muted">The tweak you picked the week before</p>
                <p className="mt-0.5 text-[15px] whitespace-pre-line text-ink">{week.previous.tweak}</p>
              </div>
            </aside>
          )}
          <ReviewForm key={weekStart} weekStart={weekStart} review={week.review} />
        </>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-reviews" className="mt-4">
          <h2 id="past-reviews" className="mb-3 text-[15px] font-semibold text-ink">
            Earlier reviews
          </h2>
          <ul className="flex flex-col gap-2">
            {past.map((r) => (
              <li key={r.id}>
                <PastReview
                  review={r}
                  label={weekLabel(r.weekStart, today)}
                  onOpen={() => {
                    go(r.weekStart)
                    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function dayOfWeek(weekday: number): Date {
  return new Date(2026, 0, 4 + weekday) // Jan 4, 2026 is a Sunday
}

function WeekCard({ summary, label, isCurrent }: { summary: WeekSummary; label: string; isCurrent: boolean }) {
  const max = Math.max(1, ...summary.days.map((d) => d.count))
  const quests = summary.finished === 1 ? '1 quest' : `${summary.finished} quests`
  const days = summary.activeDays === 1 ? '1 day' : `${summary.activeDays} days`
  const line =
    summary.finished === 0
      ? isCurrent
        ? 'Nothing finished yet this week. There’s still time, and rest counts too.'
        : 'A quiet week. Those happen, and they’re worth understanding too.'
      : `You finished ${quests} across ${days}.`
  return (
    <section aria-label={`Your week, ${label}`} className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">{label}</p>
          <p className="mt-1 max-w-[40ch] text-[17px] leading-snug text-ink">{line}</p>
          {summary.finished > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="By quest type">
              {CATEGORY_ORDER.map((c) => {
                const Icon = PEBBLE[c]
                return (
                  <li key={c} className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                    <Icon aria-hidden size={16} />
                    {CATEGORY[c].label.replace(' Quest', '')}
                    <span className="font-semibold text-ink tabular-nums">{summary.byCategory[c]}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {/* Seven small columns, one per day; the count is in each column's label and visible beneath. */}
        <ol className="flex items-end gap-1.5" aria-label="Finished per day">
          {summary.days.map((d) => {
            const date = parseDayKey(d.key)
            const h = d.count ? 8 + (d.count / max) * 40 : 3
            return (
              <li key={d.key} className="flex w-7 flex-col items-center gap-1" aria-label={`${format(date, 'EEEE')}: ${d.count}`}>
                <span className="text-[11px] text-faint tabular-nums">{d.count || ''}</span>
                <span className="flex h-12 items-end">
                  <span className={`block w-3.5 rounded-t-[4px] ${d.count ? 'bg-ring' : 'bg-line-strong'}`} style={{ height: h }} />
                </span>
                <span className="text-[11px] font-medium text-muted">{format(date, 'EEEEE')}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function ReviewForm({ weekStart, review }: { weekStart: string; review: WeeklyReview | null }) {
  const [values, setValues] = useState<Record<ReviewField, string>>(() => ({
    wentWell: review?.wentWell ?? '',
    inTheWay: review?.inTheWay ?? '',
    tweak: review?.tweak ?? '',
  }))
  const [saved, setSaved] = useState(false)
  const pending = useRef<ReviewPatch | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The pending patch belongs to this week only (the form remounts per week), so a late flush writes to the right row.
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const patch = pending.current
    if (!patch) return
    pending.current = null
    void saveReview(weekStart, patch).then((wrote) => wrote && setSaved(true))
  }, [weekStart])

  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  function change(field: ReviewField, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    setSaved(false)
    pending.current = { ...pending.current, [field]: value }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  return (
    <section aria-label="Reflection" className="flex flex-col gap-4">
      {PROMPTS.map((p, i) => (
        <Prompt key={p.field} index={i + 1} {...p} value={values[p.field]} onChange={(v) => change(p.field, v)} onBlur={flush} />
      ))}
      <p role="status" className="h-4 text-right text-[12px] text-faint">
        {saved ? 'Saved on this device' : ''}
      </p>
    </section>
  )
}

interface PromptProps {
  index: number
  field: ReviewField
  title: string
  hint: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
}

function Prompt({ index, field, title, hint, placeholder, value, onChange, onBlur }: PromptProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = `review-${field}`

  // Auto-grow (field-sizing isn't everywhere yet).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <div className="rounded-card border border-line bg-surface p-5 transition-colors focus-within:border-line-strong">
      <label htmlFor={id} className="flex items-baseline gap-2.5">
        <span className="font-display text-[15px] text-faint tabular-nums">{index}</span>
        <span className="font-display text-[20px] leading-tight font-normal text-ink">{title}</span>
      </label>
      <p id={`${id}-hint`} className="mt-1 pl-[1.4rem] text-[13px] text-muted">
        {hint}
      </p>
      <textarea
        ref={ref}
        id={id}
        aria-describedby={`${id}-hint`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={field === 'tweak' ? 2 : 3}
        maxLength={2000}
        className="mt-3 block w-full resize-none overflow-hidden rounded-control border border-line bg-canvas px-3 py-2.5 text-[16px] leading-[1.55] text-ink outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
    </div>
  )
}

function PastReview({ review, label, onOpen }: { review: WeeklyReview; label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-card border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block text-[13px] font-semibold text-muted">{label}</span>
      <span className="mt-1.5 grid gap-1 text-[14px] text-ink">
        {PROMPTS.map((p) =>
          review[p.field]?.trim() ? (
            <span key={p.field} className="flex min-w-0 gap-2">
              <span className="w-[5.5rem] shrink-0 text-[12.5px] leading-[1.6] text-faint">{SHORT[p.field]}</span>
              <span className="min-w-0 truncate">{review[p.field]}</span>
            </span>
          ) : null,
        )}
      </span>
    </button>
  )
}

const SHORT: Record<ReviewField, string> = { wentWell: 'Went well', inTheWay: 'In the way', tweak: 'Tweak' }
