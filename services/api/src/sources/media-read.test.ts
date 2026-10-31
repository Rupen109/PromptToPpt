import { describe, expect, it } from 'vitest'
import { MediaError, inspectMedia, mediaBlocks } from './media-read.ts'

const pad = (head: number[] | string | Buffer, n = 4096) => { const h = typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head); return Buffer.concat([h, Buffer.alloc(Math.max(0, n - h.length), 0x20)]) }
const at = (off: number, s: string) => Buffer.concat([Buffer.alloc(off), Buffer.from(s, 'latin1')])
const wav = pad(Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt ')]))
const msg = (b: Buffer, max?: number) => { try { inspectMedia(b, max); return 'accepted' } catch (e) { return e instanceof MediaError ? e.message : 'crash' } }

describe('inspectMedia (the file is judged by its bytes, not its name)', () => {
  it('recognises the supported audio and video containers', () => {
    expect(inspectMedia(wav)).toEqual({ kind: 'audio', mime: 'audio/wav' })
    expect(inspectMedia(pad('ID3\x03\x00'))).toEqual({ kind: 'audio', mime: 'audio/mpeg' })
    expect(inspectMedia(pad([0xff, 0xfb, 0x90, 0x00]))).toEqual({ kind: 'audio', mime: 'audio/mpeg' })
    expect(inspectMedia(pad([0xff, 0xf1, 0x50, 0x80]))).toEqual({ kind: 'audio', mime: 'audio/aac' })
    expect(inspectMedia(pad(Buffer.concat([at(4, 'ftypM4A '), Buffer.alloc(4)])))).toEqual({ kind: 'audio', mime: 'audio/mp4' })
    expect(inspectMedia(pad(at(4, 'ftypisom')))).toEqual({ kind: 'video', mime: 'video/mp4' })
    expect(inspectMedia(pad(at(4, 'ftypqt  ')))).toEqual({ kind: 'video', mime: 'video/quicktime' })
    expect(inspectMedia(pad([0x1a, 0x45, 0xdf, 0xa3]))).toEqual({ kind: 'video', mime: 'video/webm' })
    expect(inspectMedia(pad('fLaC'))).toEqual({ kind: 'audio', mime: 'audio/flac' })
    expect(inspectMedia(pad('OggS'))).toEqual({ kind: 'audio', mime: 'audio/ogg' })
  })
  it('refuses everything else with a sentence a person can act on', () => {
    expect(msg(Buffer.alloc(0))).toMatch(/empty/)
    expect(msg(pad('MZ\x90\x00 pretending to be an mp3'))).toMatch(/not a supported recording/)
    expect(msg(pad('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toMatch(/web or text file/)
    expect(msg(pad('<!doctype html><html></html>'))).toMatch(/web or text file/)
    expect(msg(pad(at(4, 'ftypheic')))).toMatch(/picture/)
    expect(msg(Buffer.alloc(100, 1))).toMatch(/too short/)
    expect(msg(Buffer.concat([wav, Buffer.alloc(13 * 1024 * 1024)]))).toMatch(/larger than 12 MB/)
    expect(msg(Buffer.concat([wav, Buffer.alloc(5 * 1024 * 1024)]), 4 * 1024 * 1024)).toMatch(/larger than 4 MB/)
  })
  it('prices by started 4 MB block', () => {
    expect([1, 4 * 1048576, 4 * 1048576 + 1, 12 * 1048576].map(mediaBlocks)).toEqual([1, 1, 2, 3])
  })
})
