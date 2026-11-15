import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { getSettings } from '../../db/db'
import { onClaim, requestClaim } from './claimBus'
import { useToast } from './components/toastContext'
import { useClaimable } from './hooks'

// Long enough to untick a mis-tap (a claimed completion is permanent), short enough that the stone still feels like
// the result of what was just done.
export const AUTO_CLAIM_DELAY_MS = 6000

// Whether stones drop by themselves. On unless turned off in Settings.
export function useAutoClaimSetting(): boolean {
  return useLiveQuery(() => getSettings())?.autoClaim ?? true
}

// A reward that needs a trip to the calendar arrives too late to feel earned. With auto-claim on, anything finished
// (today, or on days the app wasn't opened) drops into the jar a few seconds later, through the calendar's own claim
// flow so the animation and sealing behave exactly as a manual claim. Needs the calendar mounted (Home).
export function useAutoClaim(enabled: boolean): void {
  const { weight, days } = useClaimable()
  const toast = useToast()
  const pending = days.length

  useEffect(() => {
    if (!enabled || !weight) return
    const timer = setTimeout(() => requestClaim(), AUTO_CLAIM_DELAY_MS)
    return () => clearTimeout(timer)
  }, [enabled, weight, pending])

  // The jar may be off screen (phones): say what just landed.
  useEffect(() => {
    if (!enabled) return
    return onClaim(({ result }) => {
      const n = result.stones.length
      if (!n) return
      const sealed = result.filledJarIds.length > 0
      toast.show(sealed ? 'Jar filled. It’s on your shelf, and a new one has started.' : n === 1 ? 'A stone dropped into your jar.' : `${n} stones dropped into your jar.`, 'info')
    })
  }, [enabled, toast])
}
