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

// Anything can ask the calendar to claim (e.g. the toast after finishing today's last quest); the calendar owns the
// claim flow and its fly-in animation. Returns false when nothing is listening (no calendar on screen).
type RequestListener = () => void
const requestListeners = new Set<RequestListener>()

export function requestClaim(): boolean {
  for (const cb of [...requestListeners]) cb()
  return requestListeners.size > 0
}

export function onClaimRequest(cb: RequestListener): () => void {
  requestListeners.add(cb)
  return () => {
    requestListeners.delete(cb)
  }
}
