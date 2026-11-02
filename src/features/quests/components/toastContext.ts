import { createContext, useContext } from 'react'

export type Tone = 'error' | 'info'

export interface ToastApi {
  show: (message: string, tone?: Tone) => void
  // Runs a repo call; QuestError messages are user-presentable, anything else gets generic copy.
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast needs <ToastProvider>')
  return api
}
