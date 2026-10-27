import { formatDistanceToNow } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ChangeEvent } from 'react'
import { BackupError, downloadBackup, importBackup, parseBackup } from '../db/backup'
import { DEFAULT_SETTINGS, db, getSettings } from '../db/db'
import { ui } from '../ui/styles'

export function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings())
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()

  async function exportData() {
    if (!(await db.settings.get('settings'))) await db.settings.put(DEFAULT_SETTINGS)
    await downloadBackup()
    setMessage({ ok: true, text: 'Backup downloaded.' })
  }

  async function importData(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      if (!confirm('Replace all data on this device with this backup? This cannot be undone.')) return
      await importBackup(backup)
      setMessage({ ok: true, text: 'Backup restored.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof BackupError ? err.message : 'Could not read that file.' })
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className={ui.h1}>Settings</h1>

      <section className={ui.card}>
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-stone-500">
          Everything is stored only on this device. Browsers can clear site data, so keep a backup.
        </p>
        <p className="mt-2 text-sm">
          Last backup: {settings?.lastExportAt ? formatDistanceToNow(new Date(settings.lastExportAt), { addSuffix: true }) : 'never'}
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={exportData}>Export backup</button>
          <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={() => fileInput.current?.click()}>Import</button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={importData} />
        </div>
        {message && <p role="status" className={`mt-3 text-sm ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}
      </section>
    </div>
  )
}
