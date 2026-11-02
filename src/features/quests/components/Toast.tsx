import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { QuestError } from '../repo'
import { ToastContext, type Tone } from './toastContext'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const next = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback((message: string, tone: Tone = 'error') => {
    const id = ++next.current
    // One at a time keeps it calm; a repeat of the same message just restarts the timer.
    setToasts([{ id, message, tone }])
  }, [])

  const run = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      try {
        return await fn()
      } catch (e) {
        show(e instanceof QuestError ? e.message : 'Something went wrong. Please try again.')
        return undefined
      }
    },
    [show],
  )

  const api = useMemo(() => ({ show, run }), [show, run])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-8"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <Toast key={t.id} item={t} onDone={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4200)
    return () => clearTimeout(timer)
  }, [onDone])
  const Icon = item.tone === 'error' ? CircleAlert : CircleCheck
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
      className="pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-chip border border-line-strong bg-elevated py-2 pr-2 pl-3.5 text-sm text-ink shadow-pop"
    >
      <Icon aria-hidden className={`size-4 shrink-0 ${item.tone === 'error' ? 'text-mq-ink' : 'text-dq-ink'}`} strokeWidth={1.75} />
      <span className="min-w-0 flex-1">{item.message}</span>
      <button
        type="button"
        onClick={onDone}
        aria-label="Dismiss"
        className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X aria-hidden className="size-3.5" strokeWidth={1.75} />
      </button>
    </motion.div>
  )
}
