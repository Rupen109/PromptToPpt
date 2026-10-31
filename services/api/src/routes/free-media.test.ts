import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { json, origin } from '../test-utils.ts'

const wavBytes = (extra = 4096, marker = '') => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from(marker), Buffer.alloc(extra, 0x20)])
const upload = (bytes: Buffer, name = 'lecture.wav') => {
  const form = new FormData(); form.set('file', new File([new Uint8Array(bytes)], name, { type: 'audio/wav' }))
  return app.request('/api/v1/free-tools/media', { method: 'POST', headers: { Origin: origin }, body: form })
}

// (The free-tool burst limit is 6 a minute per visitor and lives in memory, so this file stays under 6 calls.)
describe('POST /free-tools/media (visitors)', () => {
  it('a small recording works without an account and is kept for the editor hand-off', async () => {
    const r = await upload(wavBytes())
    expect(r.status).toBe(200)
    const d = (await json(r)).data
    expect(d).toMatchObject({ title: 'Mock recording', timed: true })
    expect(d.parts[0].text).toContain('4,200')
    expect(typeof d.attachmentId).toBe('string')
  })

  it('refuses over 4 MB, non-recordings and silence with plain messages', async () => {
    expect([413, 422]).toContain((await upload(wavBytes(5 * 1024 * 1024), 'big.wav')).status)
    const bad = await upload(Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(4096)]), 'x.mp3')
    expect(bad.status).toBe(422)
    const silent = await upload(wavBytes(4096, 'SILENT_MEDIA'), 's.wav')
    expect(silent.status).toBe(422); expect((await json(silent)).error.code).toBe('NO_SPEECH')
  })
})
