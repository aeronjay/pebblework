import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'today' }
  | { name: 'goals' }
  | { name: 'newGoal' }
  | { name: 'goal'; id: string }
  | { name: 'editGoal'; id: string }
  | { name: 'settings' }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'goals') {
    if (parts[1] === 'new') return { name: 'newGoal' }
    if (parts[1] && parts[2] === 'edit') return { name: 'editGoal', id: parts[1] }
    if (parts[1]) return { name: 'goal', id: parts[1] }
    return { name: 'goals' }
  }
  if (parts[0] === 'settings') return { name: 'settings' }
  return { name: 'today' }
}

export const href = {
  today: '#/',
  goals: '#/goals',
  newGoal: '#/goals/new',
  goal: (id: string) => `#/goals/${id}`,
  editGoal: (id: string) => `#/goals/${id}/edit`,
  settings: '#/settings',
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
