import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../env.ts'
import * as T from './email-templates.ts'

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u
const EVIL = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'&'

describe('every email template', () => {
  for (const [name, make] of Object.entries(T.SAMPLES)) {
    describe(name, () => {
      const m = make()
      it('has a one-line subject without symbols, a text body and a complete HTML document', () => {
        expect(m.subject.length).toBeGreaterThan(8)
        expect(m.subject).not.toMatch(/[\r\n]/)
        expect(m.subject + m.text + m.html).not.toMatch(EMOJI)
        expect(m.text.length).toBeGreaterThan(60)
        expect(m.html).toMatch(/^<!doctype html>/)
        expect(m.html).toContain('SlidesDone')
        expect(m.html).toContain('</html>')
      })
      it('says the same things in text and HTML: every link in the HTML is also in the text (apart from the footer)', () => {
        const links = [...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]!.replace(/&amp;/g, '&')).filter((u) => u.replace(/\/+$/, '') !== env.WEB_URL.replace(/\/+$/, '') && !/\/support$/.test(u))
        expect(m.html).toMatch(/<a href="http/) // at least the button or a link
        for (const u of links) expect(m.text, `${u} missing from the plain text`).toContain(u)
      })
      it('is built for every mail app: tables, inline styles, no scripts, no web fonts, at most the logo as a picture', () => {
        expect(m.html).not.toMatch(/<script|<link |@import/i)
        expect((m.html.match(/<img /gi) ?? []).length).toBeLessThanOrEqual(1) // at most the logo
        expect(m.html).toContain('role="presentation"')
        expect(m.html).toContain('max-width:560px')
      })
    })
  }
})

describe('what people type can never become markup', () => {
  it('escapes names, deck titles, messages and comment text in the HTML and keeps subjects on one line', () => {
    const cases = [
      T.invitation({ ownerName: EVIL, deckTitle: EVIL, email: 'a@example.com', url: 'https://x.test/i' }),
      T.mention({ authorName: EVIL, deckTitle: EVIL, excerpt: EVIL, truncated: true, url: 'https://x.test/e' }),
      T.shareLink({ senderName: EVIL, deckTitle: EVIL, message: EVIL, url: 'https://x.test/s', protectedByPassword: true }),
      T.verifyEmail({ name: EVIL, url: 'https://x.test/v' }),
      T.paymentFailed({ name: EVIL, planId: 'pro', amountMinor: 100, currency: 'USD', reason: EVIL }),
    ]
    for (const m of cases) {
      expect(m.html).not.toContain('<script>')
      expect(m.html).not.toContain('<img src=x') // the injected picture tag (the logo, when it has an address, is the only legitimate one)
      expect(m.html).not.toContain('onerror=alert(2)>') // the angle brackets around it were escaped
      expect(m.html).toContain('&lt;script&gt;')
    }
  })
  it('a subject cannot be split into extra headers', () => {
    const m = T.invitation({ ownerName: 'Eve\r\nBcc: victim@example.com', deckTitle: 'Deck\nTitle', email: 'a@example.com', url: 'https://x.test/i' })
    expect(m.subject).not.toMatch(/[\r\n]/)
  })
  it('only web addresses become links; anything else falls back to the website', () => {
    const m = T.verifyEmail({ name: 'A', url: 'javascript:alert(1)' })
    expect(m.html).not.toMatch(/href="javascript:/i)
    const ok = T.verifyEmail({ name: 'A', url: 'https://api.example.com/v?token=a&b=c' })
    expect(ok.html).toContain('href="https://api.example.com/v?token=a&amp;b=c"')
  })
})

describe('payment emails', () => {
  it('receipt: amount in the right currency, plan, billing cycle, dates and reference', () => {
    const inr = T.paymentSuccess({ name: 'Priya Nair', planId: 'pro', interval: 'month', amountMinor: 79900, currency: 'INR', paymentId: 'pay_ABC123', paidAt: new Date('2026-10-30T09:30:00Z'), periodEnd: new Date('2026-11-30T09:30:00Z') })
    expect(inr.subject).toBe('Payment received: SlidesDone Pro')
    for (const part of ['₹799.00', 'Pro', 'Monthly', '30 October 2026', '30 November 2026', 'pay_ABC123']) expect(inr.text + inr.html, part).toContain(part)
    const usd = T.paymentSuccess({ name: 'A', planId: 'gold', interval: 'year', amountMinor: 24000, currency: 'USD', paymentId: 'pay_X', paidAt: new Date('2026-01-05T00:00:00Z'), periodEnd: null })
    expect(usd.text).toContain('$240.00')
    expect(usd.text).toContain('Yearly')
    expect(usd.text).not.toContain('Covers you until')
  })
  it('failed payment: says nothing was charged and that an existing plan keeps working; refund and ending say what happens next', () => {
    const f = T.paymentFailed({ name: 'A', planId: 'pro', amountMinor: 79900, currency: 'INR', reason: null })
    expect(f.text).toMatch(/not been charged/)
    expect(f.text).toMatch(/keeps working until the end of the period/)
    const r = T.refundProcessed({ name: 'A', planId: 'pro', amountMinor: 79900, currency: 'INR' })
    expect(r.text).toMatch(/5 to 7 working days/)
    expect(r.text).toMatch(/credits that payment gave were removed/)
    const e = T.subscriptionEnding({ name: 'A', planId: 'gold', endsOn: new Date('2026-12-01T00:00:00Z') })
    expect(e.text).toContain('until 1 December 2026')
  })
  it('an unknown plan id still reads sensibly', () => {
    expect(T.planName('team')).toBe('Team')
    expect(T.planName(null)).toBe('your')
  })
})

describe('the logo', () => {
  const saved = { EMAIL_LOGO_URL: env.EMAIL_LOGO_URL, WEB_URL: env.WEB_URL }
  afterEach(() => { Object.assign(env, saved) })
  it('shows the real logo picture (with the name as alt text, linking home) once it has a public address', () => {
    Object.assign(env, { EMAIL_LOGO_URL: 'https://slidesdone.example/logo-lockup.png' })
    for (const make of Object.values(T.SAMPLES)) {
      const html = make().html
      expect(html).toContain('<img src="https://slidesdone.example/logo-lockup.png"')
      expect(html).toContain('alt="SlidesDone"')
      expect(html).toContain('width="200"')
    }
  })
  it('defaults to the website\'s own logo file when the website has a public address', () => {
    Object.assign(env, { EMAIL_LOGO_URL: undefined, WEB_URL: 'https://www.slidesdone.example' })
    expect(T.verifyEmail({ name: 'A', url: 'https://x.example/v' }).html).toContain('src="https://www.slidesdone.example/logo-lockup.png"')
  })
  it('never points a mail at this computer: a local website (or a local override) falls back to the lettered tile, not a broken picture', () => {
    for (const web of ['http://localhost:3100', 'http://127.0.0.1:3100', 'http://192.168.1.20:3100', 'http://10.0.0.5', 'http://app.localhost']) {
      Object.assign(env, { EMAIL_LOGO_URL: undefined, WEB_URL: web })
      const html = T.welcome({ name: 'A' }).html
      expect(html, web).not.toContain('<img')
      expect(html).toContain('>S</td>')
    }
    Object.assign(env, { EMAIL_LOGO_URL: 'http://localhost:3100/logo-lockup.png' })
    expect(T.welcome({ name: 'A' }).html).not.toContain('<img')
  })
  it('an address that is not http(s) is ignored', () => {
    Object.assign(env, { EMAIL_LOGO_URL: 'javascript:alert(1)' as unknown as string })
    expect(T.welcome({ name: 'A' }).html).not.toMatch(/<img|javascript:/i)
  })
})
