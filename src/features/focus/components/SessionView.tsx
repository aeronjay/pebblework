import { useLiveQuery } from 'dexie-react-hooks'
import { Pause, Play } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { db, getSettings } from '../../../db/db'
import type { FocusSession } from '../../../db/types'
import { ui } from '../../../ui/styles'
import { chime } from '../../jar/feedback'
import { useNow } from '../hooks'
import { formatClock } from '../model'
import { elapsedMs, endSession, isRunning, MAX_PARKED_LENGTH, noteAway, parkThought, pauseSession, resumeSession } from '../repo'
import { Ring, Stage } from './Stage'

const HOUR = 60 * 60_000

// The session itself: the one task, the clock, pause, wrap up, and a place to park stray thoughts.
// When the planned time runs out the clock keeps counting: stopping is the user's call, so flow isn't cut off.
export function SessionView({ session, onEnded }: { session: FocusSession; onEnded: (ended: FocusSession | undefined) => void }) {
  const running = isRunning(session)
  const now = useNow(running)
  const settings = useLiveQuery(() => getSettings())
  const project = useLiveQuery(async () => (session.cardId && session.questId ? (await db.quests.get(session.questId))?.title : undefined), [session.cardId, session.questId])
  const elapsed = elapsedMs(session, now)
  const planned = session.plannedMin * 60_000
  const over = planned > 0 && elapsed >= planned
  const clock = planned > 0 ? (over ? elapsed - planned : planned - elapsed) : elapsed
  // Open-ended sessions walk the ring once an hour.
  const progress = planned > 0 ? elapsed / planned : (elapsed % HOUR) / HOUR
  const [ending, setEnding] = useState(false)

  // One soft chime when the planned time is reached in view (not when reopening a session that's already over).
  const chimed = useRef(over)
  useEffect(() => {
    if (!over || chimed.current) return
    chimed.current = true
    if (settings?.sound ?? true) chime()
  }, [over, settings?.sound])

  // Leaving the tab while the clock runs is counted (shown later, without judgment).
  useEffect(() => {
    if (!running) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void noteAway(session.id)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [running, session.id])

  const tabTitle = `${over ? '+' : ''}${formatClock(clock)}${running ? '' : ' (paused)'} · ${session.task}`
  useEffect(() => {
    const prev = document.title
    document.title = tabTitle
    return () => {
      document.title = prev
    }
  }, [tabTitle])

  const toggle = () => void (running ? pauseSession(session.id) : resumeSession(session.id))

  // Space pauses and resumes, unless typing or on a control.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName)) return
      e.preventDefault()
      void (running ? pauseSession(session.id) : resumeSession(session.id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, session.id])

  async function wrapUp() {
    setEnding(true)
    onEnded(await endSession(session.id))
  }

  const status = !running ? 'Paused' : over ? 'Past your plan' : planned > 0 ? 'Left' : 'Focused'

  return (
    <Stage label="Focus session">
      <div className="max-w-full text-center">
        <p className="text-[14px] font-medium text-muted">Focusing on</p>
        <h1 className="mt-1.5 font-display text-[28px] leading-[1.12] font-normal tracking-[-0.02em] text-balance break-words md:text-[34px]">
          {session.task}
        </h1>
        {project && <p className="mt-1.5 text-[13.5px] text-faint">{project}</p>}
      </div>

      <div className="mt-8">
        <Ring progress={over ? 1 : progress} tone={running ? 'live' : 'muted'}>
          <span className={`text-[14px] font-medium ${over && running ? 'text-ring' : 'text-muted'}`}>{status}</span>
          <span
            role="timer"
            aria-label={`${formatClock(clock)} ${over ? 'past the plan' : planned > 0 ? 'left' : 'focused'}`}
            className={`mt-1 text-[clamp(54px,17vw,80px)] leading-none font-semibold tracking-[-0.045em] tabular-nums ${running ? 'text-ink' : 'text-muted'}`}
          >
            {over && '+'}
            {formatClock(clock)}
          </span>
          <span className="mt-2.5 text-[13px] text-faint">{planned > 0 ? `of ${session.plannedMin} min` : 'No limit'}</span>
        </Ring>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button type="button" onClick={toggle} aria-keyshortcuts="Space" className={`${ui.btn} ${ui.secondary} min-w-[124px] py-2.5`}>
          {running ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          {running ? 'Pause' : 'Resume'}
        </button>
        <button type="button" onClick={wrapUp} disabled={ending} className={`${ui.btn} ${ui.primary} min-w-[124px] py-2.5`}>
          Wrap up
        </button>
      </div>
      <p aria-live="polite" className="mt-4 min-h-[40px] max-w-[40ch] text-center text-[14px] leading-snug text-muted">
        {over && running && 'That’s your planned time. Keep going while it flows, or wrap up and rest.'}
        {!running && 'The clock waits for you. Press Space to resume.'}
      </p>

      <ParkBox session={session} />
    </Stage>
  )
}

// Write the stray thought down and get back to it: the thought is safe, so it stops tugging.
function ParkBox({ session }: { session: FocusSession }) {
  const [text, setText] = useState('')
  const [flash, setFlash] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()
  const n = session.parked.length

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!(await parkThought(session.id, text))) return
    setText('')
    setFlash(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFlash(false), 2000)
  }

  return (
    <form onSubmit={submit} className="mt-4 w-full rounded-card border border-line bg-surface p-3.5">
      <label htmlFor={id} className="block px-0.5 text-[13.5px] font-medium text-ink">
        Something pulling at you? Park it.
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          value={text}
          maxLength={MAX_PARKED_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write it down, deal with it later"
          autoComplete="off"
          className={ui.input}
        />
        <button type="submit" disabled={!text.trim()} className={`${ui.btn} ${ui.secondary} shrink-0`}>
          Park
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[18px] px-0.5 text-[12.5px] text-faint">
        {flash ? 'Parked. Back to it.' : n ? `${n} ${n === 1 ? 'thought' : 'thoughts'} parked. You’ll see them when you wrap up.` : 'It’ll be waiting for you when you wrap up.'}
      </p>
    </form>
  )
}
