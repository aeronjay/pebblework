import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, Download } from 'lucide-react'
import { useState } from 'react'
import { href } from '../../app/router'
import { useToday } from '../../app/useToday'
import { db } from '../../db/db'
import { dayKey } from '../quests/day'
import { backupDue, downloadBackup, firstDataAt, snoozeBackupReminder } from '../../db/backup'

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

// A quiet reminder on Home when the last backup is missing or a month old. Downloading or "Later" hides it.
export function BackupNudge() {
  const today = useToday()
  const [busy, setBusy] = useState(false)
  const due = useLiveQuery(async () => {
    const [settings, first] = await Promise.all([db.settings.get('settings'), firstDataAt()])
    return backupDue(settings, first, new Date())
  }, [dayKey(today)])

  if (!due) return null

  async function download() {
    setBusy(true)
    try {
      await downloadBackup()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="region" aria-label="Backup reminder" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-line bg-surface/70 px-3.5 py-2.5 text-[13px]">
      <Archive aria-hidden className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
      <p className="min-w-0 flex-1 text-muted">
        Your quests live only in this browser. <span className="text-ink">A backup file keeps them safe.</span>{' '}
        <a href={href.settings} className={`rounded underline decoration-line-strong underline-offset-2 hover:text-ink ${focus}`}>
          More in Settings
        </a>
      </p>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={() => void snoozeBackupReminder()} className={`rounded-lg px-2.5 py-1.5 font-medium text-muted transition hover:bg-sunken hover:text-ink ${focus}`}>
          Later
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void download()}
          className={`inline-flex items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1.5 font-semibold text-canvas transition hover:opacity-90 disabled:opacity-50 ${focus}`}
        >
          <Download aria-hidden className="size-3.5" strokeWidth={2} />
          Download backup
        </button>
      </div>
    </div>
  )
}
