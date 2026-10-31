import { describe, expect, it } from 'vitest'
import { app } from '../app.ts'
import { env } from '../env.ts'
import { json, origin } from '../test-utils.ts'

const upload = (marker: string) => {
  const form = new FormData(); form.set('file', new File([new Uint8Array(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt '), Buffer.from(marker), Buffer.alloc(4096, 0x20)]))], 'a.wav', { type: 'audio/wav' }))
  return app.request('/api/v1/free-tools/media', { method: 'POST', headers: { Origin: origin }, body: form })
}

describe('free recordings: the visitor daily cap', () => {
  env.FREE_MEDIA_IP_DAY = 2 // two a day for this file; the real default is 3
  it('a visitor gets the daily number of recordings, then is pointed to sign-up (a recording costs real money)', async () => {
    expect((await upload('one')).status).toBe(200)
    expect((await upload('two')).status).toBe(200)
    const third = await upload('three')
    expect(third.status).toBe(429)
    expect((await json(third)).error.message).toMatch(/Sign up free/)
  })
})
