'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { safeRedirect } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { EDITOR_URL, SITE_URL } from '@/lib/env'

const card = 'w-full max-w-md bg-white border-4 border-foreground rounded-3xl shadow-[8px_8px_0px_0px_var(--color-text-primary)] p-8'
const field = 'w-full border-2 border-foreground rounded-md px-4 py-3 bg-white font-sans text-base focus:outline-none focus:ring-2 focus:ring-primary'

/** The address to come back to after confirming: the same page again, so a re-sent link is handled exactly like the first one. */
export const verifyCallback = (next?: string) => `${SITE_URL}/verify-email${next ? `?next=${encodeURIComponent(next)}` : ''}`

/**
 * What the person sees after clicking the confirmation link. It worked: they are signed in and sent on to the editor (or where they were going).
 * It did not (older than 30 minutes, already replaced by a newer link, or damaged): say so plainly and let them ask for a new one right here.
 */
export function VerifyEmailResult({ error, next }: { error?: string | undefined; next?: string | undefined }) {
  const destination = safeRedirect(next, [EDITOR_URL, SITE_URL], EDITOR_URL)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (error) return
    const t = setTimeout(() => window.location.assign(destination), 1800)
    return () => clearTimeout(t)
  }, [error, destination])

  async function resend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setProblem(null)
    const email = String(new FormData(e.currentTarget).get('email')).trim()
    setBusy(true)
    try {
      const { error: err } = await api.auth.sendVerificationEmail({ email, callbackURL: verifyCallback(next) })
      if (err && err.status === 429) setProblem(err.message || 'Too many requests. Please wait a while and try again.')
      else setSent(email) // the same answer whether or not the address has an account
    } catch {
      setProblem('We could not reach the service. Check your connection and try again.')
    }
    setBusy(false)
  }

  if (!error) {
    return (
      <div className={card} role="status">
        <h1 className="font-heading font-extrabold text-3xl mb-2">Email confirmed</h1>
        <p className="text-slate-600">Your account is ready. Taking you to your presentations…</p>
        <Link href={destination} className="inline-block mt-6 bg-primary text-white px-5 py-3 rounded-md font-bold shadow-solid">Continue</Link>
      </div>
    )
  }

  if (sent) {
    return (
      <div className={card} role="status">
        <h1 className="font-heading font-extrabold text-3xl mb-2">Check your email</h1>
        <p className="text-slate-600">If <strong>{sent}</strong> has an account that is not confirmed yet, a new link is on its way. It works for 30 minutes.</p>
        <Link href="/login" className="inline-block mt-6 font-bold text-primary hover:underline">Go to log in</Link>
      </div>
    )
  }

  const expired = /expired/i.test(error)
  return (
    <div className={card} role="alert">
      <h1 className="font-heading font-extrabold text-3xl mb-2">{expired ? 'This link has expired' : 'This link no longer works'}</h1>
      <p className="text-slate-600">Confirmation links work for 30 minutes. Enter your email and we will send a new one.</p>
      <form onSubmit={resend} className="mt-5 space-y-4">
        <label className="block">
          <span className="block text-sm font-bold mb-1">Email</span>
          <input name="email" type="email" required autoComplete="email" maxLength={254} className={field} />
        </label>
        {problem && <p role="alert" className="text-sm font-semibold text-red-600">{problem}</p>}
        <button type="submit" disabled={busy} className="w-full bg-primary text-white px-5 py-3 rounded-md font-bold shadow-solid disabled:opacity-60">{busy ? 'Sending…' : 'Send a new link'}</button>
      </form>
    </div>
  )
}
