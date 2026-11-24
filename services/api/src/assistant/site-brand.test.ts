import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockedUrlError } from '../sources/ssrf.ts'
import { BrandReadError, type BrandProfile } from '../brand/find.ts'
import { readSiteBrandForAssist, resetSiteBrandLimit } from './site-brand.ts'

const profile: BrandProfile = { sourceUrl: 'https://www.acme.com/', name: 'Acme', colors: { primary: '#0A7D5A', accent: '#F59E0B', accentDerived: false, palette: [] }, fonts: { heading: { family: 'Poppins', original: 'Poppins', exact: true }, body: null, detected: [] }, logo: null, confidence: 'high' }
beforeEach(() => resetSiteBrandLimit())

describe('readSiteBrandForAssist: every outcome is data or a sentence, never an exception', () => {
  it('adds https to a bare address, strips www from the host, and passes only what was found', async () => {
    const find = vi.fn(async () => profile)
    const r = await readSiteBrandForAssist('u1', 'acme.com', find)
    expect(find).toHaveBeenCalledWith('u1', 'https://acme.com')
    expect(r).toEqual({ ok: true, brand: { host: 'acme.com', name: 'Acme', primary: '#0A7D5A', accent: '#F59E0B', accentDerived: false, heading: profile.fonts.heading, body: null, logo: null, confidence: 'high' } })
  })
  it('not an address (empty, words) is refused without any lookup', async () => {
    const find = vi.fn(async () => profile)
    expect(await readSiteBrandForAssist('u1', '   ', find)).toMatchObject({ ok: false })
    expect(await readSiteBrandForAssist('u1', 'my company website', find)).toMatchObject({ ok: false, say: expect.stringMatching(/website address/) })
    expect(find).not.toHaveBeenCalled()
  })
  it('a blocked address (private network) and an unreadable page each say why; an unknown failure never leaks its message', async () => {
    expect(await readSiteBrandForAssist('u1', 'http://10.0.0.1', async () => { throw new BlockedUrlError('That address is not allowed.') })).toEqual({ ok: false, say: 'That address is not allowed.' })
    expect(await readSiteBrandForAssist('u1', 'a.com', async () => { throw new BrandReadError('That page could not be read. Check the address and try again.') })).toMatchObject({ ok: false, say: expect.stringMatching(/could not be read/) })
    const odd = await readSiteBrandForAssist('u1', 'b.com', async () => { throw new Error('ECONNRESET 10.1.2.3:443 secret') })
    expect(odd).toMatchObject({ ok: false, say: expect.stringMatching(/could not read that website/) })
    expect(JSON.stringify(odd)).not.toMatch(/ECONNRESET|10\.1\.2\.3|secret/)
  })
  it('ten lookups an hour per person; the eleventh is refused without reading anything; another person is unaffected', async () => {
    const find = vi.fn(async () => profile)
    for (let i = 0; i < 10; i++) expect(await readSiteBrandForAssist('u1', 'acme.com', find)).toMatchObject({ ok: true })
    expect(await readSiteBrandForAssist('u1', 'acme.com', find)).toMatchObject({ ok: false, say: expect.stringMatching(/looked up a lot/) })
    expect(find).toHaveBeenCalledTimes(10)
    expect(await readSiteBrandForAssist('u2', 'acme.com', find)).toMatchObject({ ok: true })
  })
})
