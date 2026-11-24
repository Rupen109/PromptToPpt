import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { env } from '../env.ts'

/** What a browser asks before it sends a request from the website or the editor to the API: the answer must name that origin (never "*" with cookies) and allow every header the clients really send. */
const preflight = (origin: string, path: string, headers: string) => app.request(`/api${path}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': headers } })

describe('CORS preflight for the website and the editor', () => {
  for (const origin of [env.WEB_URL, env.EDITOR_URL]) {
    it(`${origin}: the origin is named (never *), cookies are allowed`, async () => {
      const r = await preflight(origin, '/auth/sign-in/email', 'content-type')
      expect(r.headers.get('access-control-allow-origin')).toBe(origin)
      expect(r.headers.get('access-control-allow-credentials')).toBe('true')
    })
  }
  it('the captcha header the sign-in and sign-up forms send is allowed (without it the browser blocks the request: "Failed to fetch")', async () => {
    for (const path of ['/auth/sign-in/email', '/auth/sign-up/email']) {
      const r = await preflight(env.WEB_URL, path, 'content-type,x-turnstile-token')
      expect(r.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-turnstile-token')
    }
  })
  it('an origin that is not ours gets no permission', async () => {
    const r = await preflight('https://evil.example', '/auth/sign-in/email', 'content-type')
    expect(r.headers.get('access-control-allow-origin')).not.toBe('https://evil.example')
    expect(r.headers.get('access-control-allow-origin')).not.toBe('*')
  })
})
