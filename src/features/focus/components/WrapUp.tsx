import { Check } from 'lucide-react'
import { useState } from 'react'
import { href } from '../../../app/router'
import type { FocusRating, FocusSession } from '../../../db/types'
import { ui } from '../../../ui/styles'
import { useCompleteFeedback } from '../../quests/components/feedback'
import { breakMinutes, RATINGS } from '../model'
import { finishLinked, rateSession, saveParkedToNote, type FinishResult } from '../repo'
import { Stage } from './Stage'

const block = 'w-full rounded-card border border-line bg-surface px-4 py-4'
const ring = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

// After a session: how it felt (the user's own rating), finishing the task if it's done, the parked thoughts, then a
// break sized to the work.
export function WrapUp({ session, onBreak, onSkip }: { session: FocusSession; onBreak: (minutes: number) => void; onSkip: () => void }) {
  const [rating, setRating] = useState<FocusRating | undefined>(session.rating)
  const [finished, setFinished] = useState<FinishResult | 'busy' | null>(null)
  const [noteSaved, setNoteSaved] = useState(false)
  const feedback = useCompleteFeedback()
  const minutes = Math.max(1, Math.round(session.focusMs / 60_000))
  const rest = breakMinutes(session.focusMs)
  const early = session.plannedMin > 0 && minutes < session.plannedMin
  const linked = !!(session.questId || session.cardId)

  function rate(r: FocusRating) {
    setRating(r)
    void rateSession(session.id, r)
  }

  async function finish() {
    setFinished('busy')
    const r = await finishLinked(session)
    if (r && r.stone) feedback()
    setFinished(r)
  }

  async function saveNote() {
    if (await saveParkedToNote(session)) setNoteSaved(true)
  }

  return (
    <Stage label="Session wrap-up">
      <div className="max-w-full text-center">
        <p className="font-display text-[52px] leading-none tracking-[-0.03em] text-ink tabular-nums md:text-[64px]">
          {minutes}
          <span className="ml-2 text-[22px] tracking-normal text-muted md:text-[26px]">{minutes === 1 ? 'minute' : 'minutes'}</span>
        </p>
        <h1 className="mt-3 text-[16px] font-semibold text-balance break-words text-ink">{session.task}</h1>
        <p className="mt-1 text-[14px] text-muted">{early ? 'Stopping early still counts. Every minute is in.' : 'Focused time, pauses left out.'}</p>
      </div>

      <fieldset className="mt-8 w-full">
        <legend className="mb-2.5 w-full text-center text-[15px] font-semibold">How focused did that feel?</legend>
        <div className="grid grid-cols-5 gap-1 rounded-card bg-sunken p-1">
          {RATINGS.map((r) => {
            const on = rating === r.value
            return (
              <button
                key={r.value}
                type="button"
                aria-pressed={on}
                onClick={() => rate(r.value)}
                className={`flex flex-col items-center gap-0.5 rounded-[9px] px-1 py-2.5 text-[11.5px] leading-tight font-medium ${ring} ${
                  on ? 'bg-ink text-canvas' : 'text-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <span className="text-[19px] font-semibold tabular-nums">{r.value}</span>
                {r.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-center text-[12.5px] text-faint">Your own call. Over weeks, it shows when you focus best.</p>
      </fieldset>

      <div className="mt-6 flex w-full flex-col gap-2.5">
        {linked && (
          <div className={`${block} flex flex-wrap items-center justify-between gap-3`}>
            {finished === null || finished === 'busy' ? (
              <>
                <p className="text-[14.5px] text-ink">Did you finish it?</p>
                <button type="button" onClick={finish} disabled={finished === 'busy'} className={`${ui.btn} ${ui.secondary} px-3 py-1.5 text-[14px]`}>
                  <Check aria-hidden className="size-4" />
                  Mark it done
                </button>
              </>
            ) : (
              <p role="status" className="text-[14.5px] text-ink">
                {!finished ? (
                  <span className="text-muted">It’s already marked done.</span>
                ) : (
                  <>
                    {finished.done === 'card' ? 'Moved to Done.' : 'Marked done.'}
                    {finished.stone && (
                      <>
                        {' '}
                        Your stone is ready to{' '}
                        <a href={href.home} className="font-semibold underline underline-offset-2">
                          claim on Home
                        </a>
                        .
                      </>
                    )}
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {session.parked.length > 0 && (
          <div className={block}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14.5px] font-semibold">{session.parked.length === 1 ? 'One thought parked' : `${session.parked.length} thoughts parked`}</p>
              {noteSaved ? (
                <a role="status" href={href.notes} className="text-[13.5px] font-medium text-muted underline underline-offset-2 hover:text-ink">
                  Saved to Notes
                </a>
              ) : (
                <button type="button" onClick={saveNote} className={`${ui.btn} ${ui.secondary} px-3 py-1.5 text-[13.5px]`}>
                  Save to Notes
                </button>
              )}
            </div>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[14px] text-muted marker:text-faint">
              {session.parked.map((p, i) => (
                <li key={i} className="break-words">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {session.awayCount > 0 && (
          <p className="mt-1 text-center text-[13px] text-faint">
            You switched away from this tab {session.awayCount === 1 ? 'once' : `${session.awayCount} times`}. Just something to notice.
          </p>
        )}
      </div>

      <div className="mt-8 flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
        <button type="button" onClick={() => onBreak(rest)} className={`${ui.cta} justify-center px-5 py-3 text-[15px]`}>
          Take a {rest}-minute break
        </button>
        <button type="button" onClick={onSkip} className={`${ui.btn} py-3 text-muted hover:text-ink`}>
          Skip the break
        </button>
      </div>
    </Stage>
  )
}
