'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Lock } from '@prompttoppt/ui/icons'

/**
 * Asks for the password of a protected PDF. Accessible modal: labelled, focus starts in the field and stays inside, Escape and Cancel go back to the start,
 * a wrong password is announced and the field is kept for another try. The password is only given to pdf.js on this device; it is never sent anywhere.
 */
export function PasswordDialog({ fileName, wrong, onSubmit, onCancel }: { fileName: string; wrong: boolean; onSubmit: (password: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [wrong])
  function keys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return }
    if (e.key !== 'Tab') return
    const els = [...(box.current?.querySelectorAll<HTMLElement>('input, button') ?? [])].filter((x) => !x.hasAttribute('disabled'))
    if (!els.length) return
    const first = els[0]!, last = els[els.length - 1]!
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  function submit(e: FormEvent) { e.preventDefault(); if (value) onSubmit(value) }
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-foreground/50 p-4" onKeyDown={keys} data-testid="password-overlay">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="pw-title" aria-describedby="pw-desc" className="w-full max-w-md rounded-2xl border-2 border-foreground bg-white p-5 shadow-[4px_5px_0_0_#181b25]">
        <h2 id="pw-title" className="flex items-center gap-2 font-heading text-lg font-extrabold text-foreground"><Lock aria-hidden size={18} />This PDF is password protected</h2>
        <p id="pw-desc" className="mt-1 text-sm font-medium text-[#475569]">{`“${fileName}” needs a password to open. It stays on this device. The copy you save will have no password.`}</p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-heading font-extrabold uppercase text-foreground">
            Password
            <input ref={input} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={wrong} aria-describedby={wrong ? 'pw-error' : undefined}
              className="h-10 rounded-lg border-2 border-foreground bg-white px-3 text-sm font-bold normal-case text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
          </label>
          {wrong && <p id="pw-error" role="alert" className="text-sm font-bold text-red-700">That password is not right. Try again.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="h-9 rounded-lg border-2 border-foreground bg-white px-3 text-xs font-heading font-extrabold uppercase text-foreground hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Cancel</button>
            <button type="submit" disabled={!value} className="h-9 rounded-lg border-2 border-foreground bg-primary px-4 text-xs font-heading font-extrabold uppercase text-white shadow-[2px_2px_0_0_#181b25] hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-50">Open</button>
          </div>
        </form>
      </div>
    </div>
  )
}
