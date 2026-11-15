import type { Reminder } from './model'

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied'

export function notifyState(): NotifyState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export async function askToNotify(): Promise<NotifyState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return notifyState()
  }
}

// Through the service worker when there is one (Android only allows that route); a plain Notification otherwise.
// Returns false when nothing was shown.
export async function notify(r: Pick<Reminder, 'id' | 'title' | 'body'>): Promise<boolean> {
  if (notifyState() !== 'granted') return false
  const options: NotificationOptions = { body: r.body, tag: r.id, icon: 'icon.svg', badge: 'icon.svg' }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(r.title, options)
      return true
    }
  } catch {
    // Fall through to the page-level notification.
  }
  try {
    const n = new Notification(r.title, options)
    n.onclick = () => {
      window.focus()
      n.close()
    }
    return true
  } catch {
    return false
  }
}

// Which reminders were already shown today, shared across tabs of this browser.
const FIRED_KEY = 'pebblework.reminders.fired'

export function readFired(todayKey: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? 'null') as { day?: string; ids?: string[] } | null
    return new Set(raw?.day === todayKey && Array.isArray(raw.ids) ? raw.ids : [])
  } catch {
    return new Set()
  }
}

export function writeFired(todayKey: string, ids: string[]): void {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ day: todayKey, ids }))
  } catch {
    // Private mode: a reminder may repeat after a reload, which is the lesser problem.
  }
}
