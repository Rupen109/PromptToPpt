import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchImageLoader } from './pptx.ts'

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')

describe('PPTX export never fetches internal addresses (security S6)', () => {
  let hits = 0
  let port = 0
  const server = createServer((req, res) => { hits++; res.setHeader('content-type', 'image/png'); res.end(PNG) })
  beforeAll(async () => { await new Promise<void>((r) => server.listen(0, '127.0.0.1', r)); port = (server.address() as AddressInfo).port })
  afterAll(() => { server.close() })

  const internal = () => [
    `http://127.0.0.1:${port}/a.png`, `http://localhost:${port}/a.png`, `http://[::1]:${port}/a.png`, `http://[::ffff:7f00:1]:${port}/a.png`, `http://[::ffff:127.0.0.1]:${port}/a.png`,
    'http://169.254.169.254/latest/meta-data/', 'http://[::ffff:a9fe:a9fe]/latest/meta-data/', 'http://metadata.google.internal/computeMetadata/v1/', 'http://10.0.0.5/a.png', 'http://192.168.1.1/a.png',
    'http://2130706433/a.png', 'file:///etc/passwd', 'ftp://example.com/a.png', 'not a url',
  ]
  it('returns null for every internal / non-http target and never contacts the local server', async () => {
    const load = fetchImageLoader({ maxImages: 100 })
    for (const u of internal()) expect(await load(u), u).toBeNull()
    expect(hits).toBe(0)
  })
  it('caps the number of pictures per export', async () => {
    const load = fetchImageLoader({ maxImages: 2 })
    await load('http://127.0.0.1:1/a.png'); await load('http://127.0.0.1:1/b.png')
    expect(await load('https://example.com/c.png')).toBeNull() // third call exceeds the cap before any network access
  })
})
