import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { Agent } from 'undici'
import { OUTBOUND_ENCODING, safeFetch } from './ssrf.ts'

describe('safeFetch', () => {
  it('never advertises zstd (older runtimes cannot decode it and crash)', async () => {
    let seen = ''
    const srv = createServer((req, res) => { seen = String(req.headers['accept-encoding']); res.end('ok') })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    const port = (srv.address() as { port: number }).port
    const res = await safeFetch(`http://127.0.0.1:${port}/`, { redirect: 'manual', signal: AbortSignal.timeout(3000) }, new Agent())
    expect(await res.text()).toBe('ok')
    srv.close()
    expect(seen).toBe(OUTBOUND_ENCODING)
    expect(seen).not.toMatch(/zstd/)
  })
})
