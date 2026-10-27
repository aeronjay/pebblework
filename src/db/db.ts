import Dexie, { type EntityTable } from 'dexie'
import type {
  CheckIn,
  Goal,
  Jar,
  MarbleEvent,
  Meta,
  Milestone,
  Settings,
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
  }
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
