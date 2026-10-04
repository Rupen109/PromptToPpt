import { useEffect, useRef } from 'react'

/**
 * Modal behaviour: Escape closes from anywhere, focus moves into the dialog on open and returns to the opener on close.
 * (An onKeyDown on the dialog element is not enough — it only fires if focus is already inside.)
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, onClose])
  return ref
}
