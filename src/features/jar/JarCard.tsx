import { useLiveQuery } from 'dexie-react-hooks'
import { PartyPopper, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { db, getSettings } from '../../db/db'
import type { MarbleEvent } from '../../db/types'
import { getActiveJar, jarMarbles } from '../marbles/engine'
import { JarView } from './JarView'
import { buzz, clink } from './feedback'

const ALMOST_FULL = 0.8

export function JarCard() {
  const data = useLiveQuery(async () => {
    const settings = await getSettings()
    const jar = await getActiveJar(db)
    const marbles = jar ? await jarMarbles(db, jar.id) : []
    return { settings, capacity: jar?.capacity ?? settings.jarCapacity, marbles }
  })
  const sim = useMemo(() => data?.marbles.map(({ id, color, rarity }) => ({ id, color, rarity })), [data?.marbles])

  // Wait for data so existing marbles are restored in place instead of all dropping in.
  if (!data || !sim) return <div className="aspect-[300/380] w-full" />

  const { settings, capacity, marbles } = data
  const count = marbles.length
  const toGo = capacity - count

  return (
    <div className="flex flex-col items-center gap-2">
      <JarView
        capacity={capacity}
        marbles={sim}
        onDrop={() => settings.haptics && buzz()}
        onImpact={(speed) => settings.sound && clink(speed)}
      />
      <p className="font-display text-[28px] leading-none font-medium tracking-tight text-ink tabular-nums">
        {count} <span className="font-sans text-base font-normal tracking-normal text-faint">/ {capacity}</span>
      </p>
      <p className="flex h-5 items-center gap-1.5 text-[13px] text-muted">
        {toGo <= 0 ? (
          <>
            <PartyPopper aria-hidden className="size-4 text-mq-ink" strokeWidth={1.75} />
            Jar full!
          </>
        ) : count / capacity >= ALMOST_FULL ? (
          `Only ${toGo} to go`
        ) : count === 0 ? (
          'Your first win drops the first marble'
        ) : null}
      </p>
      <LatestDrop marbles={marbles} />
    </div>
  )
}

const REASONS: Record<MarbleEvent['reason'], string> = {
  checkin: 'Checked in',
  chunk: 'Progress logged',
  milestone: 'Milestone done',
  streak: 'Streak bonus',
  goal_complete: 'Goal complete',
  weekly_review: 'Weekly review',
  starter: 'Starter marbles',
}

function LatestDrop({ marbles }: { marbles: MarbleEvent[] }) {
  const last = marbles.at(-1)
  const goal = useLiveQuery(() => (last?.goalId ? db.goals.get(last.goalId) : undefined), [last?.goalId])
  if (!last) return null

  const group = marbles.filter((m) => (last.sourceId ? m.sourceId === last.sourceId : m.at === last.at))
  const special = group.find((m) => m.rarity !== 'normal')?.rarity

  return (
    <div key={last.id} className="w-full rounded-control border border-line bg-surface px-3 py-2.5 text-center text-[13px] text-muted shadow-card">
      <p>
        <span className="font-semibold text-ink tabular-nums">+{group.length}</span> · {REASONS[last.reason]}
        {goal && <> · {goal.title}</>}
      </p>
      {goal?.identity && <p className="text-faint">A vote for: {goal.identity}</p>}
      {special && (
        <p className={`mt-0.5 inline-flex items-center gap-1 font-semibold ${special === 'mythic' ? 'text-sq-ink' : 'text-mq-ink'}`}>
          <Sparkles aria-hidden className="size-3.5" strokeWidth={1.75} />
          {special === 'mythic' ? 'Mythic marble!' : 'Golden marble!'}
        </p>
      )}
    </div>
  )
}
