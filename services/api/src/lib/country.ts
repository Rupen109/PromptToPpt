import { env } from '../env.ts'

/**
 * Country from a header our own edge sets (CloudFront-Viewer-Country / Cloudflare), never from client-supplied data.
 * In development only, `x-debug-country` lets us exercise India pricing and country analytics locally.
 * Used for DISPLAY and ANALYTICS; payment authorisation must re-derive it server-side.
 */
export function countryFromHeaders(headers: Headers): string | null {
  const raw = headers.get('cloudfront-viewer-country') ?? headers.get('cf-ipcountry') ?? (env.APP_ENV === 'development' ? headers.get('x-debug-country') : null)
  const c = raw?.trim().toUpperCase()
  return c && /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null
}
