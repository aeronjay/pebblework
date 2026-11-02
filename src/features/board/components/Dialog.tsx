import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ui } from '../../../ui/styles'
import { trapTab, useModal } from './a11y'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  onConfirm: () => void
  onClose: () => void
}

// Small centered confirm dialog (alertdialog). Focus starts on Cancel for destructive actions.
export function Dialog(props: Props) {
  return createPortal(<AnimatePresence>{props.open && <Panel {...props} />}</AnimatePresence>, document.body)
}

function Panel({ title, children, confirmLabel, tone = 'primary', onConfirm, onClose }: Props) {
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()
  useModal(tone === 'danger' ? cancel : confirm)

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/55"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
          trapTab(e, panel.current)
        }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', bounce: 0.18, duration: 0.32 }}
        className="relative w-full max-w-[400px] rounded-card border border-line bg-elevated p-5 shadow-pop"
      >
        <h2 id={titleId} className="font-display text-[19px] leading-snug font-normal text-ink">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="mt-2 text-[14px] leading-relaxed text-muted">
            {children}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" onClick={onClose} className={`${ui.btn} ${ui.secondary} px-3.5 py-2 text-[14px] focus-visible:ring-offset-elevated`}>
            Cancel
          </button>
          <button
            ref={confirm}
            type="button"
            onClick={onConfirm}
            className={`${ui.btn} px-3.5 py-2 text-[14px] focus-visible:ring-offset-elevated ${tone === 'danger' ? ui.danger : ui.primary}`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
