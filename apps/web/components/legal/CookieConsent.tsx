'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { GA_MEASUREMENT_ID } from '@/lib/env'

/**
 * Analytics consent. Google Analytics is the only non-essential cookie the website sets, so it is loaded ONLY after the visitor accepts (opt-in, everywhere).
 * With no analytics id (local, test and staging builds) nothing is loaded and no banner is shown. The choice is kept in this browser's storage under KEY.
 */
const KEY = 'sd-consent'
const EVENT = 'sd-consent-change'
export type Choice = 'granted' | 'denied' | null

const read = (): Choice => { try { const v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null } catch { return null } }
const write = (v: 'granted' | 'denied') => { try { localStorage.setItem(KEY, v) } catch { /* storage blocked: the choice lasts until the page closes */ } window.dispatchEvent(new Event(EVENT)) }

function loadAnalytics() {
  if (!GA_MEASUREMENT_ID || document.getElementById('sd-ga')) return
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void }
  w.dataLayer = w.dataLayer || []
  // gtag.js needs the real `arguments` object (an array does not work), hence the rule is off for this line
  // eslint-disable-next-line prefer-rest-params
  w.gtag = function () { w.dataLayer!.push(arguments) }
  w.gtag('js', new Date())
  w.gtag('config', GA_MEASUREMENT_ID)
  const s = document.createElement('script')
  s.id = 'sd-ga'; s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(s)
}

/** remove the analytics cookies (_ga, _ga_XXXX) for this host and its parent domains */
function clearAnalyticsCookies() {
  const parts = location.hostname.split('.')
  const domains = ['', ...parts.map((_, i) => `.${parts.slice(i).join('.')}`).filter((d) => d.includes('.', 1))]
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]!.trim()
    if (!name.startsWith('_ga')) continue
    for (const d of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? `; domain=${d}` : ''}`
  }
}

function useChoice(): [Choice, boolean] {
  const [choice, setChoice] = useState<Choice>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const sync = () => { setChoice(read()); setReady(true) }
    sync()
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  return [choice, ready]
}

function decide(v: 'granted' | 'denied') {
  const had = read()
  write(v)
  if (v === 'granted') loadAnalytics()
  else if (had === 'granted') { clearAnalyticsCookies(); location.reload() } // a script that already ran cannot be unloaded: reload without it
}

const btn = 'rounded-md border-2 border-foreground px-4 py-2 font-heading text-sm font-bold'

export function CookieConsent() {
  const [choice, ready] = useChoice()
  useEffect(() => { if (choice === 'granted') loadAnalytics() }, [choice])
  if (!GA_MEASUREMENT_ID || !ready || choice) return null
  return (
    <div role="region" aria-label="Cookie choice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[760px] rounded-2xl border-2 border-foreground bg-white p-4 shadow-[4px_4px_0px_0px_var(--color-text-primary)] sm:flex sm:items-center sm:gap-4">
      <p className="text-sm leading-6 text-[#1e293b] sm:flex-1">We use essential cookies to keep you signed in. With your OK we also use Google Analytics cookies to count visits. Your prompts, files and slides are never sent to it. <Link href="/cookies" className="font-bold text-primary underline">Cookie notice</Link></p>
      <div className="mt-3 flex gap-3 sm:mt-0">
        <button type="button" onClick={() => decide('denied')} className={`${btn} bg-white text-foreground`}>Refuse</button>
        <button type="button" onClick={() => decide('granted')} className={`${btn} bg-primary text-white`}>Accept cookies</button>
      </div>
    </div>
  )
}

/** On the cookie notice: shows the current choice and lets the visitor change it. */
export function CookieSettingsButton() {
  const [choice, ready] = useChoice()
  if (!ready) return <span>…</span>
  if (!GA_MEASUREMENT_ID) return <span>analytics is not active on this site, so there is nothing to choose.</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <strong data-testid="consent-state">{choice === 'granted' ? 'analytics accepted' : choice === 'denied' ? 'analytics refused' : 'no choice yet (analytics off)'}</strong>
      <button type="button" onClick={() => decide(choice === 'granted' ? 'denied' : 'granted')} className={`${btn} bg-white text-foreground`}>{choice === 'granted' ? 'Refuse cookies' : 'Accept cookies'}</button>
    </span>
  )
}
