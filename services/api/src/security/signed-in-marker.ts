import { env } from '../env.ts'

/**
 * A small, readable "signed in" MARKER next to the real login cookie (which is httpOnly and stays secret). The website's header reads it before it paints
 * (apps/web components/layout/AuthActions.tsx), so the right buttons show at once instead of waiting for a session request to the API (1-2 s far from the server).
 * It carries no identity and grants nothing: the API still checks the real session on every request, and the header still asks for the session and corrects itself.
 * Kept in step here, for EVERY way a session starts or ends (password, Google, Microsoft, sign-up, sign-out, refresh): it follows the login cookie's own Set-Cookie.
 */
export const MARKER = 'sd_signed_in'
const SESSION_COOKIE = /^(?:__Secure-)?[^=;]+\.session_token=([^;]*)/i

const attrs = (maxAge: number) =>
  [`Path=/`, `Max-Age=${maxAge}`, 'SameSite=Lax', ...(env.COOKIE_DOMAIN ? [`Domain=${env.COOKIE_DOMAIN}`] : []), ...(env.API_URL.startsWith('https://') ? ['Secure'] : [])].join('; ')

/**
 * the marker cookie to add for an auth answer: set when the login cookie is set, cleared when it is cleared or a session check finds none, and set when a session check
 * finds a session the browser has no marker for (people signed in before the marker existed); null = leave as is
 */
export function markerFor(setCookies: readonly string[], check: 'gone' | 'found-unmarked' | null): string | null {
  for (const c of setCookies) {
    const m = c.match(SESSION_COOKIE)
    if (!m) continue
    const age = Number((c.match(/;\s*Max-Age=(-?\d+)/i) ?? [])[1] ?? NaN)
    const expired = /;\s*Expires=Thu, 01 Jan 1970/i.test(c)
    if (!m[1] || age <= 0 || expired) return `${MARKER}=; ${attrs(0)}`
    return `${MARKER}=1; ${attrs(Number.isFinite(age) ? age : 60 * 60 * 24 * 30)}`
  }
  return check === 'gone' ? `${MARKER}=; ${attrs(0)}` : check === 'found-unmarked' ? `${MARKER}=1; ${attrs(60 * 60 * 24 * 30)}` : null
}
