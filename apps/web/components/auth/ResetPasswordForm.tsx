'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'

const card = 'w-full max-w-md bg-white border-4 border-foreground rounded-3xl shadow-[8px_8px_0px_0px_var(--color-text-primary)] p-8'
const field = 'w-full border-2 border-foreground rounded-md px-4 py-3 bg-white font-sans text-base focus:outline-none focus:ring-2 focus:ring-primary'

/** Step 2: the person arrives from the e-mail with `?token=…` (or `?error=INVALID_TOKEN` when the link is old or already used) and chooses a new password. */
export function ResetPasswordForm({ token, invalid }: { token?: string | undefined; invalid: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (invalid || !token) {
    return (
      <div className={card} role="alert">
        <h1 className="font-heading font-extrabold text-3xl mb-2">This link no longer works</h1>
        <p className="text-slate-600">Password links work for 1 hour and only once. Ask for a new one and we will email it right away.</p>
        <Link href="/forgot-password" className="inline-block mt-6 bg-primary text-white px-5 py-3 rounded-md font-bold shadow-solid">Get a new link</Link>
      </div>
    )
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password')), again = String(form.get('again'))
    if (password !== again) { setError('The two passwords are not the same.'); return }
    setBusy(true)
    try {
      const { error: err } = await api.auth.resetPassword({ newPassword: password, token: token! })
      if (err) setError(/token/i.test(err.message ?? '') || err.status === 400 && /invalid|expired/i.test(err.message ?? '') ? 'This link has expired or was already used. Ask for a new one.' : (err.message || 'Could not change the password. Please try again.'))
      else setDone(true)
    } catch {
      setError('We could not reach the service. Check your connection and try again.')
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div className={card} role="status">
        <h1 className="font-heading font-extrabold text-3xl mb-2">Password changed</h1>
        <p className="text-slate-600">You are signed out everywhere for safety. Log in with your new password.</p>
        <Link href="/login" className="inline-block mt-6 bg-primary text-white px-5 py-3 rounded-md font-bold shadow-solid">Log in</Link>
      </div>
    )
  }

  return (
    <div className={card}>
      <h1 className="font-heading font-extrabold text-3xl mb-1">Choose a new password</h1>
      <p className="text-slate-600 mb-6">Use at least 10 characters.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-bold mb-1">New password</span>
          <input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" autoFocus className={field} />
        </label>
        <label className="block">
          <span className="block text-sm font-bold mb-1">Type it again</span>
          <input name="again" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={field} />
        </label>
        {error && (
          <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error} {/expired|already used/.test(error) && <Link href="/forgot-password" className="underline">Get a new link</Link>}
          </p>
        )}
        <button type="submit" disabled={busy} className="w-full bg-primary text-white py-3 rounded-md font-bold shadow-solid hover:-translate-y-[2px] transition-transform disabled:opacity-60">{busy ? 'Saving…' : 'Change my password'}</button>
      </form>
    </div>
  )
}
