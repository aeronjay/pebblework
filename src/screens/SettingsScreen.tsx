import { formatDistanceToNow } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlarmClock, BellRing, CalendarPlus, Download, Gem, Monitor, Moon, Sun, Upload, Vibrate, Volume2, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { applyTheme } from '../app/theme'
import { BackupError, downloadBackup, importBackup, parseBackup } from '../db/backup'
import { DEFAULT_SETTINGS, db, getSettings } from '../db/db'
import type { ReminderSettings, Settings } from '../db/types'
import { downloadRemindersIcs } from '../features/reminders/ics'
import { cleanReminders } from '../features/reminders/model'
import { askToNotify, notify, notifyState, type NotifyState } from '../features/reminders/notify'
import { seg, segGroup, ui } from '../ui/styles'

// The settings row may not exist yet (defaults are implied), so merge and put instead of update().
async function saveSettings(patch: Partial<Settings>) {
  await db.settings.put({ ...(await getSettings()), ...patch })
}

const THEMES: { value: Settings['theme']; label: string; Icon: LucideIcon }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

export function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings())
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const [permission, setPermission] = useState<NotifyState>(notifyState)
  const reminders = cleanReminders(settings?.reminders)

  function saveReminders(patch: Partial<ReminderSettings>) {
    void saveSettings({ reminders: cleanReminders({ ...reminders, ...patch }) })
  }

  async function toggleReminders(on: boolean) {
    if (!on) return saveReminders({ enabled: false })
    const state = await askToNotify()
    setPermission(state)
    if (state !== 'granted') return
    saveReminders({ enabled: true })
    void notify({ id: 'pebblework:test', title: 'Reminders are on', body: 'This is how Pebblework will nudge you.' })
  }

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

  function setTheme(theme: Settings['theme']) {
    applyTheme(theme) // immediately, without waiting for the live query round trip
    void saveSettings({ theme })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className={ui.h1}>Settings</h1>

      <section className={`${ui.card} p-5`}>
        <h2 className="text-[15px] font-semibold tracking-tight">Appearance</h2>
        <p className="mt-0.5 text-[13px] text-muted">System follows your device’s light or dark mode.</p>
        <div className={`${segGroup} mt-4`} role="radiogroup" aria-label="Theme">
          {THEMES.map(({ value, label, Icon }) => {
            const on = (settings?.theme ?? 'system') === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(value)}
                className={`${seg(on)} inline-flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
                {label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface shadow-card">
        <h2 className="px-5 pt-5 text-[15px] font-semibold tracking-tight">Feedback</h2>
        <ul className="mt-2 divide-y divide-line">
          <Toggle
            Icon={Volume2}
            label="Sound"
            hint="A soft clink when stones and marbles land."
            on={settings?.sound ?? DEFAULT_SETTINGS.sound}
            onChange={(sound) => void saveSettings({ sound })}
          />
          <Toggle
            Icon={Vibrate}
            label="Haptics"
            hint="A light tap on supported phones."
            on={settings?.haptics ?? DEFAULT_SETTINGS.haptics}
            onChange={(haptics) => void saveSettings({ haptics })}
          />
          <Toggle
            Icon={Gem}
            label="Stones drop on their own"
            hint="A few seconds after you finish something, its stone lands in the jar. Until then you can still untick it. Off: claim by hand on the calendar."
            on={settings?.autoClaim ?? true}
            onChange={(autoClaim) => void saveSettings({ autoClaim })}
          />
        </ul>
      </section>

      <section className="rounded-card border border-line bg-surface shadow-card">
        <div className="px-5 pt-5">
          <h2 className="text-[15px] font-semibold tracking-tight">Reminders</h2>
          <p className="mt-0.5 text-[13px] text-muted">A tracker only helps on the days you open it. Two ways to get pulled back in.</p>
        </div>
        <ul className="mt-2 divide-y divide-line">
          <Toggle
            Icon={AlarmClock}
            label="Alarm at planned start times"
            hint="When a time in your plan arrives, Pebblework chimes and puts the task on screen with a one-tap start. Works while it’s open; the chime follows the Sound setting. For when it’s closed, add the plan to your calendar after planning."
            on={settings?.planAlarm ?? true}
            onChange={(planAlarm) => void saveSettings({ planAlarm })}
          />
          <Toggle
            Icon={BellRing}
            label="Notify me"
            hint={
              permission === 'unsupported'
                ? 'This browser can’t show notifications. Use the calendar reminders below.'
                : permission === 'denied'
                  ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then switch this on.'
                  : 'In the morning, at each start time in your plan, and once in the evening. Only while Pebblework is open in a tab or installed as an app: with no server, it can’t reach you when it’s fully closed.'
            }
            on={reminders.enabled && permission === 'granted'}
            onChange={(on) => void toggleReminders(on)}
          />
          <li className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
            <TimeField label="Morning" value={reminders.morning} onChange={(morning) => saveReminders({ morning })} />
            <TimeField label="Evening" value={reminders.evening} onChange={(evening) => saveReminders({ evening })} />
          </li>
          <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-sunken text-muted">
              <CalendarPlus aria-hidden className="size-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-[200px] flex-1">
              <span className="block text-[14px] font-medium text-ink">Daily reminders in your calendar</span>
              <span className="block text-[12.5px] text-faint">
                Downloads a calendar file with a repeating reminder at both times. Open it on your phone or computer once and your own calendar reminds you every day, even when Pebblework is closed.
              </span>
            </span>
            <button type="button" className={`${ui.btn} ${ui.secondary} text-[14px]`} onClick={() => downloadRemindersIcs(reminders)}>
              <Download aria-hidden className="size-4" strokeWidth={1.75} />
              Get calendar file
            </button>
          </li>
        </ul>
      </section>

      <section className={`${ui.card} p-5`}>
        <h2 className="text-[15px] font-semibold tracking-tight">Your data</h2>
        <p className="mt-0.5 text-[13px] text-muted">Everything is stored only on this device, with no account needed. Browsers can clear site data, so keep a backup. Signing in to sync across devices is coming later.</p>
        <p className="mt-3 text-[13px] text-faint">
          Last backup:{' '}
          <span className="font-medium text-ink">
            {settings?.lastExportAt ? formatDistanceToNow(new Date(settings.lastExportAt), { addSuffix: true }) : 'never'}
          </span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={`${ui.btn} ${ui.primary} text-[14px]`} onClick={exportData}>
            <Download aria-hidden className="size-4" strokeWidth={1.75} />
            Export backup
          </button>
          <button type="button" className={`${ui.btn} ${ui.secondary} text-[14px]`} onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden className="size-4" strokeWidth={1.75} />
            Import
          </button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={importData} />
        </div>
        {message && (
          <p role="status" className={`mt-3 text-[13px] font-medium ${message.ok ? 'text-dq-ink' : 'text-danger-ink'}`}>
            {message.text}
          </p>
        )}
      </section>
    </div>
  )
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-[14px] font-medium text-ink">
      {label}
      <input type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className={`${ui.input} w-auto text-[14px] tabular-nums`} />
    </label>
  )
}

function Toggle({ Icon, label, hint, on, onChange }: { Icon: LucideIcon; label: string; hint: ReactNode; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3.5 px-5 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-sunken text-muted">
          <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">{label}</span>
          <span className="block text-[12.5px] text-faint">{hint}</span>
        </span>
        <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span
          aria-hidden
          className={`relative h-6 w-10 shrink-0 rounded-chip transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface ${on ? 'bg-ink' : 'bg-line-strong'}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-surface shadow-card transition-transform duration-200 ease-out-soft ${on ? 'translate-x-4' : ''}`}
          />
        </span>
      </label>
    </li>
  )
}
