import { db, getDeviceId, newId, newMeta, type MarbleDB } from '../../db/db'
import type { Jar, Quest, QuestCompletion, Stone } from '../../db/types'
import { STARTER_MARBLES } from '../marbles/config'
import { rollRarity, type Rng } from '../marbles/engine'
import { CATEGORY_ORDER, claimableDays, dayKey, isUndated, jarCapacityFor, stonesForDay, unclaimed } from './day'

export interface ClaimResult {
  days: string[] // claimed this call, oldest first
  stones: Stone[] // in drop order
  filledJarIds: string[] // quest jars sealed by this claim, in order
}

function isActiveQuestJar(j: Jar): boolean {
  return !j.sealedAt && !j.deletedAt
}

export async function getActiveQuestJar(database: MarbleDB = db): Promise<Jar | undefined> {
  const list = await database.jars.where('kind').equals('quest').filter(isActiveQuestJar).toArray()
  return list.sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0]
}

async function loadCapacity(database: MarbleDB, now: Date, quests?: Quest[]): Promise<number> {
  const all = quests ?? (await database.quests.toArray())
  const undated = all.filter((q) => isUndated(q) && !q.deletedAt).map((q) => q.id)
  const done: QuestCompletion[] = undated.length
    ? await database.questCompletions.where('questId').anyOf(undated).filter((c) => !c.deletedAt).toArray()
    : []
  return jarCapacityFor(all, now, done)
}

async function createQuestJar(database: MarbleDB, now: Date, quests?: Quest[]): Promise<Jar> {
  const iso = now.toISOString()
  const jar: Jar = { id: newId(), kind: 'quest', capacity: await loadCapacity(database, now, quests), startedAt: iso, ...newMeta(iso) }
  await database.jars.add(jar)
  return jar
}

// Needs jars, quests and questCompletions in scope when called inside a transaction.
export async function ensureActiveQuestJar(database: MarbleDB = db, now: Date = new Date()): Promise<Jar> {
  return (await getActiveQuestJar(database)) ?? createQuestJar(database, now)
}

export async function sealedQuestJarCount(database: MarbleDB = db): Promise<number> {
  return database.jars.where('kind').equals('quest').filter((j) => !!j.sealedAt && !j.deletedAt).count()
}

// Endowed progress: a jar that's already a little full gets finished more often than an empty one. So a jar that
// replaces a sealed one starts with a few starter stones, one of each kind (weight 1, normal), counted toward its
// capacity. They're not in ClaimResult.stones: the jar drops them in once the claim animation has played. The very first
// jar starts empty, so the first stones you see are ones you earned.
export function starterStones(jarId: string, key: string, now: Date): Stone[] {
  const iso = now.toISOString()
  return Array.from({ length: STARTER_MARBLES }, (_, i) => ({
    id: newId(),
    jarId,
    dayKey: key,
    category: CATEGORY_ORDER[i % CATEGORY_ORDER.length],
    weight: 1 as const,
    rarity: 'normal' as const,
    at: new Date(now.getTime() - STARTER_MARBLES + i).toISOString(), // before the claim's own stones in drop order
    starter: true as const,
    ...newMeta(iso),
  }))
}

const EMPTY: ClaimResult = { days: [], stones: [], filledJarIds: [] }

// Claims every unclaimed completion on ready days up to today, in one rw transaction. A day claimed earlier can be
// claimed again; only its new completions drop stones. IndexedDB serializes overlapping rw transactions (also across
// tabs), and each re-reads completion.claimedAt, so repeat calls award nothing.
export async function claimAll(database: MarbleDB = db, now: Date = new Date(), rng: Rng = Math.random): Promise<ClaimResult> {
  const tables = [database.quests, database.questCompletions, database.dayClaims, database.stones, database.jars]
  return database.transaction('rw', tables, async () => {
    const today = dayKey(now)
    const [quests, completions, claims] = await Promise.all([
      database.quests.toArray(),
      database.questCompletions.where('dayKey').belowOrEqual(today).filter((c) => !c.deletedAt).toArray(),
      database.dayClaims.toArray(),
    ])
    const prior = new Map(claims.map((c) => [c.dayKey, c]))
    const days = claimableDays(quests, completions, new Set(prior.keys()), now)
    if (!days.length) return EMPTY

    const iso = now.toISOString()
    let jar = await getActiveQuestJar(database)
    if (!jar) jar = await createQuestJar(database, now, quests)
    let fill = (await database.stones.where('jarId').equals(jar.id).filter((s) => !s.deletedAt).toArray()).reduce((n, s) => n + s.weight, 0)
    if (fill === 0) {
      // Capacity follows quest load until the first stone lands, then stays frozen.
      const capacity = await loadCapacity(database, now, quests)
      if (capacity !== jar.capacity) {
        jar = { ...jar, capacity }
        await database.jars.update(jar.id, { capacity, updatedAt: iso, deviceId: getDeviceId() })
      }
    }

    const stones: Stone[] = []
    const starters: Stone[] = []
    const filledJarIds: string[] = []
    for (const key of days) {
      const firstJarId = jar.id
      const fresh = unclaimed(completions.filter((c) => c.dayKey === key))
      let weight = 0
      for (const spec of stonesForDay(fresh)) {
        // Staggered timestamps make (at, id) ordering equal drop order.
        const at = new Date(now.getTime() + stones.length).toISOString()
        stones.push({ id: newId(), jarId: jar.id, dayKey: key, ...spec, rarity: rollRarity(rng), at, ...newMeta(iso) })
        weight += spec.weight
        fill += spec.weight
        // The stone that crosses capacity stays in this jar (it may overshoot by ≤ 2); the rest overflow.
        if (fill >= jar.capacity) {
          await database.jars.update(jar.id, { sealedAt: iso, updatedAt: iso, deviceId: getDeviceId() })
          filledJarIds.push(jar.id)
          jar = await createQuestJar(database, now, quests)
          const head = starterStones(jar.id, today, now)
          starters.push(...head)
          fill = head.reduce((n, st) => n + st.weight, 0)
        }
      }
      const mark = { claimedAt: iso, claimJarId: firstJarId, updatedAt: iso, deviceId: getDeviceId() }
      for (const c of fresh) await database.questCompletions.update(c.id, mark)
      const before = prior.get(key)
      if (before) {
        // Re-claim: keep the day's first jar, add the new weight.
        await database.dayClaims.update(key, { claimedAt: iso, weight: before.weight + weight, updatedAt: iso, deviceId: getDeviceId() })
      } else {
        await database.dayClaims.add({ dayKey: key, jarId: firstJarId, claimedAt: iso, weight, ...newMeta(iso) })
      }
    }
    await database.stones.bulkAdd([...stones, ...starters])
    return { days, stones, filledJarIds }
  })
}
