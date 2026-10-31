'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useState, type FormEvent } from 'react'
import { safeRedirect } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { EDITOR_URL, GOOGLE_AUTH, MICROSOFT_AUTH, SITE_URL, TURNSTILE_SITE_KEY } from '@/lib/env'

type Mode = 'login' | 'signup'
type Provider = 'google' | 'microsoft'
const NAMES: Record<Provider, string> = { google: 'Google', microsoft: 'Microsoft' }
const failedText = (p: Provider) => `${NAMES[p]} sign-in did not finish. Please try again, or use your email and password.`
const UNREACHABLE = 'We could not reach the sign-in service. Check your connection and try again.'

/** the Microsoft four-square logo (brand mark: keeps its own colours) */
const MicrosoftMark = () => (
  <svg aria-hidden width="18" height="18" viewBox="0 0 23 23"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M12 1h10v10H12z"/><path fill="#00A4EF" d="M1 12h10v10H1z"/><path fill="#FFB900" d="M12 12h10v10H12z"/></svg>
)

/** the Google "G" (brand mark: must keep its own four colours) */
const GoogleMark = () => (
  <svg aria-hidden width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
)

/** which buttons exist: each needs its keys on the API and its NEXT_PUBLIC_*_AUTH flag on the website */
const providers: { id: Provider; Mark: () => React.JSX.Element }[] = [
  ...(GOOGLE_AUTH ? [{ id: 'google' as const, Mark: GoogleMark }] : []),
  ...(MICROSOFT_AUTH ? [{ id: 'microsoft' as const, Mark: MicrosoftMark }] : []),
]

export function AuthForm({ mode, next, defaultEmail, failed }: { mode: Mode; next?: string; defaultEmail?: string; failed?: Provider }) {
  const [error, setError] = useState<string | null>(failed ? failedText(failed) : null)
  const [socialBusy, setSocialBusy] = useState<Provider | null>(null)
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

  async function social(provider: Provider) {
    setError(null)
    setSocialBusy(provider)
    try {
      // on success the browser is sent to the provider; if the answer is an error the person stays here and is told
      const { error } = await api.auth.signIn.social({ provider, callbackURL: destination, errorCallbackURL: `${SITE_URL}/${mode}${next ? `?next=${encodeURIComponent(next)}&` : '?'}error=${provider}` })
      if (error) { setError(error.message || failedText(provider)); setSocialBusy(null) }
    } catch {
      setError(UNREACHABLE) // the request never got an answer (service down or offline)
      setSocialBusy(null)
    }
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

      {providers.length > 0 && (
        <>
          <div className="space-y-3">
            {providers.map(({ id, Mark }) => (
              <Button key={id} type="button" variant="white" size="lg" block loading={socialBusy === id} disabled={socialBusy !== null} onClick={() => void social(id)} className="!normal-case !tracking-normal !text-base !font-bold">
                {socialBusy !== id && <Mark />}Continue with {NAMES[id]}
              </Button>
            ))}
          </div>
          <div className="my-5 flex items-center gap-3 text-xs font-bold text-slate-500"><span aria-hidden className="h-px flex-1 bg-slate-200" />OR<span aria-hidden className="h-px flex-1 bg-slate-200" /></div>
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
          <span className="flex items-baseline justify-between text-sm font-bold mb-1">Password{mode === 'login' && <Link href="/forgot-password" className="font-bold text-primary hover:underline">Forgot password?</Link>}</span>
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
