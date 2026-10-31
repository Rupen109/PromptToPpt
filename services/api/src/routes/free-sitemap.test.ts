import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { json, origin } from '../test-utils.ts'

const post = (body: unknown) => app.request('/api/v1/free-tools/sitemap', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// (the hourly limit is 8 per visitor and lives in memory: this file stays under it; the crawl itself is covered in free-tools/sitemap.test.ts)
describe('POST /free-tools/sitemap (visitors)', () => {
  it('needs no account; private and local addresses are refused in plain words', async () => {
    const r = await post({ url: 'http://localhost' })
    expect(r.status).toBe(422)
    expect((await json(r)).error).toMatchObject({ code: 'SITEMAP_FAILED', message: expect.stringMatching(/not allowed/) })
    expect((await post({ url: 'http://169.254.169.254/' })).status).toBe(422)
  })

  it('refuses empty, absurd and out-of-range requests before doing any work', async () => {
    expect((await post({ url: '' })).status).toBe(400)
    expect((await post({ url: 'a.com', maxPages: 100000 })).status).toBe(400)
    expect((await post({ url: 'a.com', changefreq: 'sometimes' })).status).toBe(400)
  })
})
