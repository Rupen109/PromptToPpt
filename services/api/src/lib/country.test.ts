import { afterEach, describe, expect, it } from 'vitest'
import { env } from '../env.ts'
import { countryFromHeaders } from './country.ts'

const mutable = env as { EDGE_SHARED_SECRET?: string | undefined; APP_ENV: string }
const saved = { secret: mutable.EDGE_SHARED_SECRET, app: mutable.APP_ENV }
afterEach(() => { mutable.EDGE_SHARED_SECRET = saved.secret; mutable.APP_ENV = saved.app })
const h = (o: Record<string, string>) => new Headers(o)

describe('country header trust (the India price must not be selectable by the client)', () => {
  it('with an edge secret configured, the country counts only when the request proves it came through the edge', () => {
    mutable.APP_ENV = 'production'; mutable.EDGE_SHARED_SECRET = 'edge-secret-0123456789-abcdef'
    expect(countryFromHeaders(h({ 'cloudfront-viewer-country': 'IN' }))).toBeNull()
    expect(countryFromHeaders(h({ 'cloudfront-viewer-country': 'IN', 'x-origin-verify': 'wrong' }))).toBeNull()
    expect(countryFromHeaders(h({ 'cloudfront-viewer-country': 'IN', 'x-origin-verify': 'edge-secret-0123456789-abcdef' }))).toBe('IN')
    expect(countryFromHeaders(h({ 'cf-ipcountry': 'in', 'x-origin-verify': 'edge-secret-0123456789-abcdef' }))).toBe('IN')
    expect(countryFromHeaders(h({ 'x-debug-country': 'IN', 'x-origin-verify': 'edge-secret-0123456789-abcdef' }))).toBeNull() // the debug header is development-only
  })
  it('with no secret, only local development believes the headers', () => {
    mutable.EDGE_SHARED_SECRET = undefined
    mutable.APP_ENV = 'production'
    expect(countryFromHeaders(h({ 'cloudfront-viewer-country': 'IN' }))).toBeNull()
    mutable.APP_ENV = 'staging'
    expect(countryFromHeaders(h({ 'cloudfront-viewer-country': 'IN' }))).toBeNull()
    mutable.APP_ENV = 'development'
    expect(countryFromHeaders(h({ 'x-debug-country': 'IN' }))).toBe('IN')
  })
})
