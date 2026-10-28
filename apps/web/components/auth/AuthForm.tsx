'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useState, type FormEvent } from 'react'
import { safeRedirect } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { EDITOR_URL, GOOGLE_AUTH, SITE_URL, TURNSTILE_SITE_KEY } from '@/lib/env'

type Mode = 'login' | 'signup'

export function AuthForm({ mode, next, defaultEmail }: { mode: Mode; next?: string; defaultEmail?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkEmail, setCheckEmail] = useState<string | null>(null)

  const destination = safeRedirect(next, [EDITOR_URL, SITE_URL], EDITOR_URL)
  const otherHref = `/${mode === 'login' ? 'signup' : 'login'}${next ? `?next=${encodeURIComponent(next)}` : ''}`

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    const captcha = String(form.get('cf-turnstile-response') ?? '')
    const fetchOptions = captcha ? { headers: { 'x-turnstile-token': captcha } } : undefined
    const { data, error } =
      mode === 'login'
        ? await api.auth.signIn.email({ email, password, ...(fetchOptions ? { fetchOptions } : {}) })
        : await api.auth.signUp.email({ email, password, name: String(form.get('name')), ...(fetchOptions ? { fetchOptions } : {}) })
    if (error) {
      setError(error.status === 429 ? error.message || 'Too many attempts. Please wait a while and try again.' : (error.message ?? 'Something went wrong. Please try again.'))
      setBusy(false)
      return
    }
    // When email verification is on, sign-up creates no session: the person must confirm their address first.
    if (mode === 'signup' && !(data as { hasSession?: boolean } | null)?.hasSession) {
      setCheckEmail(email)
      setBusy(false)
      return
    }
    window.location.assign(destination) // full navigation: the destination may be the editor subdomain
  }

  async function google() {
    await api.auth.signIn.social({ provider: 'google', callbackURL: destination })
  }

  const field =
    'w-full border-2 border-foreground rounded-md px-4 py-3 bg-white font-sans text-base focus:outline-none focus:ring-2 focus:ring-primary'

  if (checkEmail) {
    return (
      <div className="w-full max-w-md bg-white border-4 border-foreground rounded-3xl shadow-[8px_8px_0px_0px_var(--color-text-primary)] p-8" role="status">
        <h1 className="font-heading font-extrabold text-3xl mb-2">Check your email</h1>
        <p className="text-slate-600">We sent a confirmation link to <strong>{checkEmail}</strong>. Open it to activate your account, then log in.</p>
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="inline-block mt-6 font-bold text-primary hover:underline">Go to log in</Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md bg-white border-4 border-foreground rounded-3xl shadow-[8px_8px_0px_0px_var(--color-text-primary)] p-8">
      <h1 className="font-heading font-extrabold text-3xl mb-1">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="text-slate-600 mb-6">
        {mode === 'login' ? 'Log in to continue to your presentations.' : 'Start generating presentations in seconds.'}
      </p>

      {GOOGLE_AUTH && (
        <>
          <button type="button" onClick={google} className="w-full border-2 border-foreground rounded-md py-3 font-bold hover:bg-slate-50">
            Continue with Google
          </button>
          <div className="my-5 text-center text-xs font-bold text-slate-500">OR</div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {mode === 'signup' && (
          <label className="block">
            <span className="block text-sm font-bold mb-1">Name</span>
            <input name="name" required autoComplete="name" maxLength={80} className={field} />
          </label>
        )}
        <label className="block">
          <span className="block text-sm font-bold mb-1">Email</span>
          <input name="email" type="email" required autoComplete="email" defaultValue={defaultEmail ?? ''} className={field} />
        </label>
        <label className="block">
          <span className="block text-sm font-bold mb-1">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === 'signup' ? 10 : 1}
            maxLength={128}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className={field}
          />
        </label>
        {TURNSTILE_SITE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
            <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />
          </>
        )}
        {error && (
          <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-primary text-white py-3 rounded-md font-bold shadow-solid hover:-translate-y-[2px] transition-transform disabled:opacity-60"
        >
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up free'}
        </button>
      </form>

      <p className="mt-6 text-sm text-center text-slate-600">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <Link href={otherHref} className="font-bold text-primary hover:underline">
          {mode === 'login' ? 'Sign up' : 'Log in'}
        </Link>
      </p>
    </div>
  )
}
