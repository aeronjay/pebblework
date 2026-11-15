import { ArrowRight, Flag, Sprout, X } from 'lucide-react'
import { useState } from 'react'
import { href } from '../../app/router'
import { activeGoals, goalStanding, isOutcome, isQuiet, type IdentityView } from './repo'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'
const SHOWN = 4
const HIDE_KEY = 'pebblework.home.goals-prompt-hidden'

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

// The last seven days for one goal, today last: a filled dot is a day something was done for it.
export function WeekDots({ week, className = '' }: { week: boolean[]; className?: string }) {
  const n = week.filter(Boolean).length
  return (
    <span role="img" aria-label={`${n} of the last ${week.length} days`} className={`inline-flex shrink-0 items-center gap-[3px] ${className}`}>
      {week.map((on, i) => (
        <span
          key={i}
          aria-hidden
          className={`size-[7px] rounded-full ${on ? 'bg-ring' : 'bg-ink/12'} ${i === week.length - 1 && !on ? 'ring-1 ring-ring/60 ring-inset' : ''}`}
        />
      ))}
    </span>
  )
}

const TONE = { calm: 'text-muted', soon: 'text-mq-ink', quiet: 'text-blaze-ink' }

// Home's answer to "what is all this for": each goal, what the last week did for it, and which one has gone quiet.
// Quiet goals lead, since those are the ones slipping. With no goals yet, one dismissible line invites the first.
export function GoalsStrip({ views }: { views: IdentityView[] | undefined }) {
  const [hidden, setHidden] = useState(readHidden)
  if (!views) return null
  const goals = activeGoals(views)

  if (!goals.length) {
    if (hidden) return null
    return (
      <section aria-label="Goals" className="flex items-center gap-3 rounded-card border border-dashed border-line-strong px-4 py-3">
        <Flag aria-hidden className="size-5 shrink-0 text-muted" strokeWidth={1.75} />
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-muted">
          <span className="font-semibold text-ink">What is all this for?</span> Name a goal and link quests to it, so every one you finish visibly moves something you care about.
        </p>
        <a href={href.identity} className={`inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-[13px] font-semibold text-canvas transition hover:opacity-90 ${focus}`}>
          Add a goal
        </a>
        <button
          type="button"
          aria-label="Hide"
          onClick={() => {
            try {
              localStorage.setItem(HIDE_KEY, '1')
            } catch {
              // Private mode: hidden until reload.
            }
            setHidden(true)
          }}
          className={`grid size-7 shrink-0 place-items-center rounded-full text-faint transition hover:bg-sunken hover:text-ink ${focus}`}
        >
          <X aria-hidden className="size-3.5" strokeWidth={1.75} />
        </button>
      </section>
    )
  }

  const ordered = [...goals].sort((a, b) => Number(isQuiet(b)) - Number(isQuiet(a)))
  const shown = ordered.slice(0, SHOWN)
  return (
    <section aria-label="Goals" className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">What it’s for</h2>
        <a href={href.identity} className={`inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-muted hover:text-ink ${focus}`}>
          {goals.length > SHOWN ? `All ${goals.length} goals` : 'Goals'}
          <ArrowRight aria-hidden className="size-3.5" strokeWidth={1.75} />
        </a>
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {shown.map((v) => {
          const Icon = isOutcome(v.identity) ? Flag : Sprout
          const standing = goalStanding(v)
          return (
            <li key={v.identity.id} className="min-w-0">
              <a href={href.identity} className={`-mx-2 flex items-center gap-2.5 rounded-control px-2 py-1.5 transition-colors hover:bg-sunken/55 ${focus}`}>
                <Icon aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">{v.identity.statement}</span>
                  <span className={`block truncate text-[12.5px] ${TONE[standing.tone]}`}>{standing.text}</span>
                </span>
                <WeekDots week={v.week} />
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
