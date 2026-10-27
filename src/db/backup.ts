import type Dexie from 'dexie'
import { db, type MarbleDB } from './db'

export const BACKUP_APP = 'marble-jar'
export const BACKUP_SCHEMA_VERSION = 1

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
  if (backup.app !== BACKUP_APP) throw new BackupError('This is not a Marble Jar backup.')
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

// Replaces all local data with the backup's contents, atomically.
export async function importBackup(backup: Backup, database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', TABLES.map((t) => database[t]), async () => {
    for (const t of TABLES) {
      await database[t].clear()
      const rows = backup.data[t] ?? []
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
  a.download = `marble-jar-backup-${backup.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  const settings = (await database.settings.get('settings'))
  if (settings) await database.settings.put({ ...settings, lastExportAt: backup.exportedAt })
}
