import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { getSettings } from '../db/db'
import type { Settings } from '../db/types'

type ThemePref = Settings['theme']

// Mirrored to localStorage so the inline script in index.html can set data-theme before first paint.
const STORE = 'theme'
const CANVAS = { light: '#e9ecf7', dark: '#161a33' }

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false

// Resolves the preference onto <html data-theme>, which every token (and the jar canvas) follows.
export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark())
  const root = document.documentElement
  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = dark ? CANVAS.dark : CANVAS.light
  }
  try {
    localStorage.setItem(STORE, pref)
  } catch {
    // Storage blocked: the theme still applies for this session.
  }
}

export function useThemeSync() {
  const pref = useLiveQuery(async () => (await getSettings()).theme)
  useEffect(() => {
    if (!pref) return
    applyTheme(pref)
    if (pref !== 'system') return
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq?.addEventListener('change', onChange)
    return () => mq?.removeEventListener('change', onChange)
  }, [pref])
}
