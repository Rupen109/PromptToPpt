'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { SITE_URL } from '@/lib/env'

const card = 'w-full max-w-md bg-white border-4 border-foreground rounded-3xl shadow-[8px_8px_0px_0px_var(--color-text-primary)] p-8'
const field = 'w-full border-2 border-foreground rounded-md px-4 py-3 bg-white font-sans text-base focus:outline-none focus:ring-2 focus:ring-primary'

/** Step 1 of getting back into an account: ask for the link. The answer never says whether the address has an account (nobody can probe for users). */
export function ForgotPasswordForm({ defaultEmail }: { defaultEmail?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const email = String(new FormData(e.currentTarget).get('email')).trim()
    try {
      const { error: err } = await api.auth.requestPasswordReset({ email, redirectTo: `${SITE_URL}/reset-password` })
      if (err && err.status === 429) setError(err.message || 'Too many requests. Please try again in a while.')
      else if (err && (err.status ?? 500) >= 500) setError('We could not send the email right now. Please try again in a few minutes.')
      else setSentTo(email) // an unknown address looks exactly the same as a known one
    } catch {
      setError('We could not reach the service. Check your connection and try again.')
    }
    setBusy(false)
  }

  if (sentTo) {
    return (
      <div className={card} role="status">
        <h1 className="font-heading font-extrabold text-3xl mb-2">Check your email</h1>
        <p className="text-slate-600">If there is an account for <strong>{sentTo}</strong>, we have sent a link to choose a new password. It works for 1 hour.</p>
        <p className="text-slate-600 mt-3 text-sm">Nothing yet? Look in your spam folder, or <button type="button" onClick={() => setSentTo(null)} className="font-bold text-primary hover:underline">try again</button>.</p>
        <Link href="/login" className="inline-block mt-6 font-bold text-primary hover:underline">Back to log in</Link>
      </div>
    )
  }

  return (
    <div className={card}>
      <h1 className="font-heading font-extrabold text-3xl mb-1">Forgot your password?</h1>
      <p className="text-slate-600 mb-6">Enter your email and we will send you a link to choose a new one.</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="block text-sm font-bold mb-1">Email</span>
          <input name="email" type="email" required autoComplete="email" autoFocus defaultValue={defaultEmail ?? ''} className={field} />
        </label>
        {error && <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy} className="w-full bg-primary text-white py-3 rounded-md font-bold shadow-solid hover:-translate-y-[2px] transition-transform disabled:opacity-60">{busy ? 'Sending…' : 'Send me the link'}</button>
      </form>
      <p className="mt-6 text-sm text-center text-slate-600">Remembered it? <Link href="/login" className="font-bold text-primary hover:underline">Log in</Link></p>
    </div>
  )
}
