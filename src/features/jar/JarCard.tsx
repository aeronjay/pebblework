import { useLiveQuery } from 'dexie-react-hooks'
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
      <p className="text-lg font-semibold tabular-nums">
        {count} <span className="font-normal text-stone-400">/ {capacity}</span>
      </p>
      <p className="h-5 text-sm text-stone-500">
        {toGo <= 0 ? 'Jar full! 🎉' : count / capacity >= ALMOST_FULL ? `Only ${toGo} to go` : count === 0 ? 'Your first win drops the first marble' : ''}
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
    <div key={last.id} className="w-full rounded-xl bg-stone-100 px-3 py-2 text-center text-sm dark:bg-stone-900">
      <p>
        <span className="font-semibold">+{group.length}</span> · {REASONS[last.reason]}
        {goal && <> · {goal.title}</>}
      </p>
      {goal?.identity && <p className="text-stone-500">A vote for: {goal.identity}</p>}
      {special && <p className="font-semibold text-amber-600">{special === 'mythic' ? '🌈 Mythic marble!' : '✨ Golden marble!'}</p>}
    </div>
  )
}
