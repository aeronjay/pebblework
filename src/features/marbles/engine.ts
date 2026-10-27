import { getSettings, newId, newMeta, type MarbleDB } from '../../db/db'
import type { Jar, MarbleEvent, MarbleReason, Rarity } from '../../db/types'
import { RARITY_ODDS } from './config'

export type Rng = () => number

export function rollRarity(rng: Rng = Math.random): Rarity {
  const r = rng()
  if (r < RARITY_ODDS.mythic) return 'mythic'
  if (r < RARITY_ODDS.mythic + RARITY_ODDS.golden) return 'golden'
  return 'normal'
}

export async function getActiveJar(database: MarbleDB): Promise<Jar | undefined> {
  return database.jars.filter((j) => !j.sealedAt && !j.deletedAt).first()
}

export async function ensureActiveJar(database: MarbleDB): Promise<Jar> {
  const existing = await getActiveJar(database)
  if (existing) return existing
  const { jarCapacity } = await getSettings(database)
  const now = new Date().toISOString()
  const jar: Jar = { id: newId(), capacity: jarCapacity, startedAt: now, ...newMeta(now) }
  await database.jars.add(jar)
  return jar
}

export interface Award {
  reason: MarbleReason
  count: number
  color: string
  goalId?: string
  sourceId?: string
}

// One event per marble so each marble carries its own rarity.
// Must run inside a transaction that includes jars, settings and marbleEvents.
export async function awardMarbles(database: MarbleDB, award: Award, rng: Rng = Math.random): Promise<MarbleEvent[]> {
  if (award.count <= 0) return []
  const jar = await ensureActiveJar(database)
  const now = new Date().toISOString()
  const events: MarbleEvent[] = Array.from({ length: award.count }, () => ({
    id: newId(),
    jarId: jar.id,
    goalId: award.goalId,
    reason: award.reason,
    sourceId: award.sourceId,
    count: 1,
    rarity: rollRarity(rng),
    color: award.color,
    at: now,
    ...newMeta(now),
  }))
  await database.marbleEvents.bulkAdd(events)
  return events
}

// Undo only reaches into the active jar; sealed jars are history.
export async function revokeMarbles(database: MarbleDB, sourceId: string): Promise<number> {
  const jar = await getActiveJar(database)
  if (!jar) return 0
  const now = new Date().toISOString()
  return database.marbleEvents
    .where('sourceId')
    .equals(sourceId)
    .filter((e) => e.jarId === jar.id && !e.deletedAt)
    .modify({ deletedAt: now, updatedAt: now, deviceId: newMeta().deviceId })
}

export async function jarMarbles(database: MarbleDB, jarId: string): Promise<MarbleEvent[]> {
  const list = await database.marbleEvents.where('jarId').equals(jarId).filter((e) => !e.deletedAt).toArray()
  return list.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}
