import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { rid } from '../test-utils.ts'
import { MARKER, markerFor } from './signed-in-marker.ts'

/** the readable "signed in" marker the website's header reads before it paints: it follows the real login cookie on every way in and out */
const origin = process.env['WEB_URL'] ?? 'http://localhost:3000'
const markerOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith(`${MARKER}=`))
const post = (path: string, body: object, cookie = '') => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) })
const jar = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => !c.startsWith(`${MARKER}=`)).join('; ')

describe('the signed-in marker', () => {
  it('sign-up and sign-in set it (readable, not httpOnly, same lifetime as the session); sign-out clears it', async () => {
    const email = `mk-${rid()}@example.com`
    const up = await post('/api/auth/sign-up/email', { email, password: 'password123', name: 'M' })
    const m = markerOf(up)!
    expect(m).toMatch(new RegExp(`^${MARKER}=1;`)); expect(m).not.toMatch(/HttpOnly/i); expect(m).toMatch(/Max-Age=\d{5,}/)
    const inn = await post('/api/auth/sign-in/email', { email, password: 'password123' })
    expect(markerOf(inn)).toMatch(new RegExp(`^${MARKER}=1;`))
    const out = await post('/api/auth/sign-out', {}, jar(inn))
    expect(markerOf(out)).toMatch(new RegExp(`^${MARKER}=;.*Max-Age=0`))
  })

  it('a session check that finds a session the browser has no marker for adds it (people signed in before the marker); with the marker it is left alone', async () => {
    const email = `mk-${rid()}@example.com`
    const inn = await post('/api/auth/sign-up/email', { email, password: 'password123', name: 'M' })
    const check = (extra = '') => app.request('/api/auth/get-session', { headers: { Origin: origin, Cookie: jar(inn) + extra } })
    expect(markerOf(await check())).toMatch(new RegExp(`^${MARKER}=1;`))
    expect(markerOf(await check(`; ${MARKER}=1`))).toBeUndefined()
  })

  it('a session check that finds no session clears it (an expired session heals the header); a wrong password sets nothing', async () => {
    const r = await app.request('/api/auth/get-session', { headers: { Origin: origin } })
    expect(markerOf(r)).toMatch(/Max-Age=0/)
    const bad = await post('/api/auth/sign-in/email', { email: `nobody-${rid()}@example.com`, password: 'wrongpassword' })
    expect(markerOf(bad)).toBeUndefined()
  })

  it('the rule itself: a set login cookie sets it, a cleared one clears it, other cookies leave it', () => {
    expect(markerFor(['better-auth.session_token=abc; Max-Age=2592000; Path=/; HttpOnly'], null)).toMatch(/^sd_signed_in=1; Path=\/; Max-Age=2592000/)
    expect(markerFor(['__Secure-slidesdone.session_token=; Max-Age=0; Path=/'], null)).toMatch(/Max-Age=0/)
    expect(markerFor(['better-auth.session_data=xyz; Path=/'], null)).toBeNull()
    expect(markerFor([], 'gone')).toMatch(/Max-Age=0/)
    expect(markerFor([], 'found-unmarked')).toMatch(/^sd_signed_in=1;/)
  })
})
