import type Dexie from 'dexie'
import { db, getSettings, markClaimedFromDayClaims, type MarbleDB } from './db'
import type { DayClaim, QuestCompletion, Settings } from './types'

// Internal format id from before the Pebblework rename. Kept so existing backups keep importing; never shown to users.
export const BACKUP_APP = 'marble-jar'
// v1 (no quest tables), v2 (no board tables), v3 (day-level claims), v4 (no notes), v5 (no identities), v6 (no focus sessions), and v7 (no tasks) backups
// still import; a table missing from the backup imports as empty.
export const BACKUP_SCHEMA_VERSION = 8

const TABLES = [
  'goals',
  'milestones',
  'checkIns',
  'marbleEvents',
  'jars',
  'streaks',
  'weeklyReviews',
  'unlocks',
  'settings',
  'quests',
  'questCompletions',
  'dayClaims',
  'stones',
  'boardColumns',
  'cards',
  'notes',
  'identities',
  'focusSessions',
  'tasks',
] as const

type TableName = (typeof TABLES)[number]

export interface Backup {
  app: typeof BACKUP_APP
  schemaVersion: number
  exportedAt: string
  data: Record<TableName, unknown[]>
}

export async function exportBackup(database: MarbleDB = db): Promise<Backup> {
  return database.transaction('r', TABLES.map((t) => database[t]), async () => {
    const entries = await Promise.all(TABLES.map(async (t) => [t, await database[t].toArray()] as const))
    return {
      app: BACKUP_APP,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: Object.fromEntries(entries) as Backup['data'],
    }
  })
}

export class BackupError extends Error {}

export function parseBackup(json: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new BackupError('File is not valid JSON.')
  }
  if (typeof raw !== 'object' || raw === null) throw new BackupError('Backup is empty.')
  const backup = raw as Partial<Backup>
  if (backup.app !== BACKUP_APP) throw new BackupError('This is not a Pebblework backup.')
  if (typeof backup.schemaVersion !== 'number' || backup.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app.')
  }
  if (typeof backup.data !== 'object' || backup.data === null) throw new BackupError('Backup has no data.')
  for (const t of TABLES) {
    const rows = backup.data[t]
    if (rows !== undefined && !Array.isArray(rows)) throw new BackupError(`Backup table "${t}" is malformed.`)
  }
  return backup as Backup
}

// Replaces all local data with the backup's contents, atomically. Pre-v4 backups get the v4 claim migration.
export async function importBackup(backup: Backup, database: MarbleDB = db): Promise<void> {
  const data = { ...backup.data }
  if (backup.schemaVersion < 4 && data.questCompletions?.length) {
    const completions = data.questCompletions as QuestCompletion[]
    const marked = new Map(markClaimedFromDayClaims(completions, (data.dayClaims ?? []) as DayClaim[]).map((c) => [c.id, c]))
    data.questCompletions = completions.map((c) => marked.get(c.id) ?? c)
  }
  // The file was written before its own export was recorded, so its settings carry the previous backup date.
  // Restoring from it means this data is backed up as of the file's export time.
  const settings = data.settings as Settings[] | undefined
  if (settings?.length) {
    data.settings = settings.map((s) => (!s.lastExportAt || s.lastExportAt < backup.exportedAt ? { ...s, lastExportAt: backup.exportedAt } : s))
  }
  await database.transaction('rw', TABLES.map((t) => database[t]), async () => {
    for (const t of TABLES) {
      await database[t].clear()
      const rows = data[t] ?? []
      if (rows.length) await (database[t] as Dexie.Table).bulkPut(rows)
    }
  })
}

export async function downloadBackup(database: MarbleDB = db): Promise<void> {
  const backup = await exportBackup(database)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pebblework-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  // The settings row may not exist yet (it's created on first visit to Settings); record the export either way.
  await database.settings.put({ ...(await getSettings(database)), lastExportAt: backup.exportedAt })
}

export const BACKUP_EVERY_DAYS = 30
export const BACKUP_GRACE_DAYS = 14 // don't ask until there's two weeks of history worth keeping
export const BACKUP_SNOOZE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

// Whether Home should suggest a backup: there's been data for a couple of weeks, the last export is missing or a
// month old, and the reminder isn't snoozed.
export function backupDue(
  settings: Pick<Settings, 'lastExportAt' | 'backupSnoozedUntil'> | undefined,
  firstDataAt: string | undefined,
  now: Date,
): boolean {
  const t = now.getTime()
  if (!firstDataAt || t - Date.parse(firstDataAt) < BACKUP_GRACE_DAYS * DAY_MS) return false
  if (settings?.backupSnoozedUntil && Date.parse(settings.backupSnoozedUntil) > t) return false
  return !settings?.lastExportAt || t - Date.parse(settings.lastExportAt) >= BACKUP_EVERY_DAYS * DAY_MS
}

// When the oldest quest was made (deleted ones included: their history still lives in the jar).
export async function firstDataAt(database: MarbleDB = db): Promise<string | undefined> {
  let first: string | undefined
  await database.quests.each((q) => {
    if (!first || q.createdAt < first) first = q.createdAt
  })
  return first
}

export async function snoozeBackupReminder(now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const until = new Date(now.getTime() + BACKUP_SNOOZE_DAYS * DAY_MS).toISOString()
  await database.settings.put({ ...(await getSettings(database)), backupSnoozedUntil: until })
}
