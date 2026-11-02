import { useEffect, type KeyboardEvent, type RefObject } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Keeps Tab / Shift+Tab inside `panel`. Call from the panel's onKeyDown.
export function trapTab(e: KeyboardEvent, panel: HTMLElement | null) {
  if (e.key !== 'Tab' || !panel) return
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (!items.length) return
  const first = items[0]
  const last = items[items.length - 1]
  if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

// Modal lifecycle: lock body scroll, focus the initial element, and restore focus to the opener (or a fallback
// resolved at close time, e.g. when the opener has left the DOM).
export function useModal(initial: RefObject<HTMLElement | null>, fallback?: () => HTMLElement | null | undefined) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    initial.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      const back = opener?.isConnected ? opener : fallback?.()
      back?.focus?.({ preventScroll: true })
    }
    // Mount/unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
