import type { ClaimResult } from './claim'

export interface ClaimEvent {
  result: ClaimResult
  origins: Record<string, DOMRect> // dayKey → calendar cell rect, for fly-in animation
}

type Listener = (e: ClaimEvent) => void
const listeners = new Set<Listener>()

export function emitClaim(e: ClaimEvent): void {
  for (const cb of [...listeners]) cb(e)
}

export function onClaim(cb: Listener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
