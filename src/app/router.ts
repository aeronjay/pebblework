import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'settings' }
  | { name: 'projects' }
  | { name: 'notes' }
  | { name: 'board'; id: string }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'quests' && parts[1]) return { name: 'board', id: parts[1] }
  if (parts[0] === 'projects') return { name: 'projects' }
  if (parts[0] === 'notes') return { name: 'notes' }
  if (parts[0] === 'settings') return { name: 'settings' }
  return { name: 'home' }
}

export const href = {
  home: '#/',
  settings: '#/settings',
  projects: '#/projects',
  notes: '#/notes',
  board: (id: string) => `#/quests/${id}`,
}

export function navigate(to: string, { replace = false } = {}) {
  if (replace) location.replace(to)
  else location.hash = to
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  return parseHash(hash)
}
