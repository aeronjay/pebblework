import type Dexie from 'dexie'
import { db, markClaimedFromDayClaims, type MarbleDB } from './db'
import type { DayClaim, QuestCompletion } from './types'

// Internal format id from before the Pebblework rename. Kept so existing backups keep importing; never shown to users.
export const BACKUP_APP = 'marble-jar'
// v1 (no quest tables), v2 (no board tables), v3 (day-level claims) and v4 (no notes) backups still import;
// a table missing from the backup imports as empty.
export const BACKUP_SCHEMA_VERSION = 5

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
  const settings = (await database.settings.get('settings'))
  if (settings) await database.settings.put({ ...settings, lastExportAt: backup.exportedAt })
}
