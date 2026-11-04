import { useEffect, useState } from 'react'
import { useToday } from '../app/useToday'
import type { FocusSession } from '../db/types'
import { BreakView } from '../features/focus/components/BreakView'
import { FocusSetup } from '../features/focus/components/FocusSetup'
import { FocusStats } from '../features/focus/components/FocusStats'
import { SessionView } from '../features/focus/components/SessionView'
import { WrapUp } from '../features/focus/components/WrapUp'
import { useActiveSession, useFocusSessions } from '../features/focus/hooks'

type Phase = { kind: 'wrap'; session: FocusSession } | { kind: 'break'; minutes: number } | null

// Focus: pick one thing, a session that covers the screen, a wrap-up with your own rating, then a break.
// The page under it shows how focused you've been.
export function FocusScreen() {
  const today = useToday()
  const active = useActiveSession()
  const sessions = useFocusSessions()
  const [phase, setPhase] = useState<Phase>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  if (active) {
    return (
      <SessionView
        key={active.id}
        session={active}
        onEnded={(ended) => {
          if (ended) setPhase({ kind: 'wrap', session: ended })
          else setNotice('That was under a minute, so it wasn’t saved.')
        }}
      />
    )
  }
  if (phase?.kind === 'wrap') {
    return <WrapUp session={phase.session} onBreak={(minutes) => setPhase({ kind: 'break', minutes })} onSkip={() => setPhase(null)} />
  }
  if (phase?.kind === 'break') return <BreakView minutes={phase.minutes} onDone={() => setPhase(null)} />

  return (
    <div>
      <header className="mb-6">
        <p className="text-[15px] font-semibold text-muted">One thing at a time</p>
        <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.025em] text-ink md:text-[42px]">Focus</h1>
        <p className="mt-2 max-w-[56ch] text-[14px] text-muted">A short session on a single task, then a real break. How focused you were is yours to say.</p>
      </header>

      {notice && (
        <p role="status" className="mb-4 rounded-control bg-sunken px-3 py-2 text-[13.5px] text-muted">
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-10">
        {active === undefined ? <div aria-hidden className="h-[260px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" /> : <div className="max-w-3xl"><FocusSetup /></div>}
        {sessions ? <FocusStats sessions={sessions} today={today} /> : <div aria-hidden className="h-[260px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />}
      </div>
    </div>
  )
}
