import { useEffect, useRef } from 'react'

/**
 * Modal behaviour: Escape closes from anywhere, focus moves into the dialog on open and returns to the opener on close.
 * (An onKeyDown on the dialog element is not enough — it only fires if focus is already inside.)
 *
 * `onClose` is read through a ref: callers usually pass a fresh arrow function on every render, and an effect that depended on it
 * would re-run each time and pull focus back to the dialog container — typing in a field would lose focus after every character.
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open])
  return ref
}
