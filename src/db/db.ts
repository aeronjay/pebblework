import Dexie, { type EntityTable } from 'dexie'
import type {
  BoardColumn,
  Card,
  CheckIn,
  DayClaim,
  Goal,
  Jar,
  MarbleEvent,
  Meta,
  Milestone,
  Quest,
  QuestCompletion,
  Settings,
  Stone,
  StreakState,
  Unlock,
  WeeklyReview,
} from './types'

export class MarbleDB extends Dexie {
  goals!: EntityTable<Goal, 'id'>
  milestones!: EntityTable<Milestone, 'id'>
  checkIns!: EntityTable<CheckIn, 'id'>
  marbleEvents!: EntityTable<MarbleEvent, 'id'>
  jars!: EntityTable<Jar, 'id'>
  streaks!: EntityTable<StreakState, 'goalId'>
  weeklyReviews!: EntityTable<WeeklyReview, 'id'>
  unlocks!: EntityTable<Unlock, 'id'>
  settings!: EntityTable<Settings, 'id'>
  quests!: EntityTable<Quest, 'id'>
  questCompletions!: EntityTable<QuestCompletion, 'id'>
  dayClaims!: EntityTable<DayClaim, 'dayKey'>
  stones!: EntityTable<Stone, 'id'>
  boardColumns!: EntityTable<BoardColumn, 'id'>
  cards!: EntityTable<Card, 'id'>

  constructor(name = 'marble-jar') {
    super(name)
    this.version(1).stores({
      goals: 'id, type, status, updatedAt',
      milestones: 'id, goalId, updatedAt',
      checkIns: 'id, goalId, at, updatedAt',
      marbleEvents: 'id, jarId, goalId, sourceId, at, updatedAt',
      jars: 'id, startedAt, sealedAt, updatedAt',
      streaks: 'goalId, updatedAt',
      weeklyReviews: 'id, weekStart, updatedAt',
      unlocks: 'id, key, updatedAt',
      settings: 'id',
    })
    // Old jars have no `kind` (= goal) and aren't in the kind index; goal lookups must filter, not query it.
    this.version(2).stores({
      jars: 'id, kind, startedAt, sealedAt, updatedAt',
      quests: 'id, category, dueDate, updatedAt',
      questCompletions: 'id, questId, dayKey, updatedAt',
      dayClaims: 'dayKey, jarId, updatedAt',
      stones: 'id, jarId, dayKey, at, updatedAt',
    })
    this.version(3).stores({
      questCompletions: 'id, questId, dayKey, cardId, updatedAt',
      boardColumns: 'id, questId, updatedAt',
      cards: 'id, questId, columnId, updatedAt',
    })
    // Claims moved to the completion level (incremental claims). Before v4 a claimed day was final, so every live
    // completion on a claimed day counts as claimed.
    this.version(4)
      .stores({ questCompletions: 'id, questId, dayKey, cardId, updatedAt' })
      .upgrade(async (tx) => {
        const claims = await tx.table<DayClaim, string>('dayClaims').toArray()
        const table = tx.table<QuestCompletion, string>('questCompletions')
        const marked = markClaimedFromDayClaims(await table.toArray(), claims)
        if (marked.length) await table.bulkPut(marked)
      })
  }
}

// Pre-v4 data (DB upgrade and old backups): stamps every live, unmarked completion on a claimed day with that day's
// claim. Returns only the rows it changed.
export function markClaimedFromDayClaims(completions: QuestCompletion[], claims: DayClaim[]): QuestCompletion[] {
  const byDay = new Map(claims.map((c) => [c.dayKey, c]))
  return completions.flatMap((c) => {
    const claim = byDay.get(c.dayKey)
    if (!claim || c.deletedAt || c.claimedAt) return []
    return [{ ...c, claimedAt: claim.claimedAt, claimJarId: claim.jarId }]
  })
}

export const db = new MarbleDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  jarCapacity: 100,
  sound: true,
  haptics: true,
  weeklyReviewDay: 0,
  theme: 'system',
}

const DEVICE_KEY = 'marble-jar:device-id'
let cachedDeviceId: string | undefined

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId
  try {
    cachedDeviceId = localStorage.getItem(DEVICE_KEY) ?? undefined
    if (!cachedDeviceId) {
      cachedDeviceId = crypto.randomUUID()
      localStorage.setItem(DEVICE_KEY, cachedDeviceId)
    }
  } catch {
    cachedDeviceId ??= crypto.randomUUID()
  }
  return cachedDeviceId
}

export function newId(): string {
  return crypto.randomUUID()
}

export function newMeta(now = new Date().toISOString()): Meta {
  return { createdAt: now, updatedAt: now, deviceId: getDeviceId() }
}

export function touch<T extends Meta>(record: T, now = new Date().toISOString()): T {
  return { ...record, updatedAt: now, deviceId: getDeviceId() }
}

export async function getSettings(database: MarbleDB = db): Promise<Settings> {
  return (await database.settings.get('settings')) ?? DEFAULT_SETTINGS
}

// Browsers may evict IndexedDB under storage pressure unless persistence is granted.
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
