import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback } from 'react'
import { getSettings } from '../../../db/db'
import { buzz, clink } from '../../jar/feedback'

// Sound + haptics for checking a quest off, honoring the user's settings.
export function useCompleteFeedback(): () => void {
  const settings = useLiveQuery(() => getSettings())
  const sound = settings?.sound ?? true
  const haptics = settings?.haptics ?? true
  return useCallback(() => {
    if (sound) clink(2.5)
    if (haptics) buzz(14)
  }, [sound, haptics])
}

// A light tick when a held check is fully charged: "you can let go now".
export function useReadyFeedback(): () => void {
  const settings = useLiveQuery(() => getSettings())
  const haptics = settings?.haptics ?? true
  return useCallback(() => {
    if (haptics) buzz(6)
  }, [haptics])
}
