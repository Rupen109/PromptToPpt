import { describe, expect, it, vi } from 'vitest'
import { app } from '../app.ts'
import { env } from '../env.ts'
import { json, origin } from '../test-utils.ts'
import { resetFreeMediaLimit } from './free-tools.ts'

const send = (bytes: Uint8Array, name: string) => {
  const form = new FormData(); form.set('file', new File([bytes], name))
  return app.request('/api/v1/free-tools/media', { method: 'POST', headers: { Origin: origin }, body: form })
}
const wav = (marker: string) => new Uint8Array(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from(marker), Buffer.alloc(4096, 0x20)]))
const upload = (marker: string) => send(wav(marker), 'a.wav')

describe('free recordings: the visitor daily cap', () => {
  env.FREE_MEDIA_IP_DAY = 2 // two a day for this file; the real default is 3
  it('a visitor gets the daily number of recordings, then is pointed to sign-up (a recording costs real money)', async () => {
    expect((await upload('one')).status).toBe(200)
    expect((await upload('two')).status).toBe(200)
    const third = await upload('three')
    expect(third.status).toBe(429)
    expect((await json(third)).error.message).toMatch(/Sign up free/)
  })

  it('a file refused before any AI runs (empty, a renamed web page, a program) does NOT use up a free recording', async () => {
    // a fresh minute (the per-minute burst limit rightly counts every attempt) and a fresh day for this visitor
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 120_000)
    resetFreeMediaLimit()
    try {
      expect((await send(new Uint8Array(0), 'blank.mp3')).status).toBe(422)
      expect((await send(new Uint8Array(Buffer.from('<html><script>x</script></html>')), 'renamed.mp3')).status).toBe(422)
      expect((await send(new Uint8Array(Buffer.from('MZ not a program')), 'setup.mp3')).status).toBe(422)
      // three refused files later, the visitor still has both of today's recordings
      expect((await upload('one')).status).toBe(200)
      expect((await upload('two')).status).toBe(200)
      expect((await upload('three')).status).toBe(429)
    } finally { vi.useRealTimers() }
  })
})
