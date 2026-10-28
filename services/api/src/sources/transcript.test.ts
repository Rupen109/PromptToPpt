import { describe, expect, it } from 'vitest'
import { fromFile } from './extract.ts'
import { readLink } from './link.ts'
import { SourceError } from './errors.ts'
import { clock, fromTranscript, youtubeId, YOUTUBE_HELP } from './transcript.ts'

const SRT = `1
00:00:01,000 --> 00:00:04,000
Welcome to the <i>solar</i> energy talk.

2
00:00:04,500 --> 00:00:08,000
[Music]
India aims for 500 gigawatts by 2030.

3
00:02:10,000 --> 00:02:14,000
Rooftop panels cost 40% less than in 2015.
`
const VTT = `WEBVTT
Kind: captions

00:00:00.000 --> 00:00:03.000
We install panels on roofs.

00:00:03.000 --> 00:00:06.000
We install panels on roofs.
and the payback is six years.

NOTE this is a comment

00:03:00.000 --> 00:03:02.000
<c>Thank you</c> for watching.
`
const YT = `0:00
Hello everyone, today we talk about batteries.
0:12
A battery stores 60 kilowatt hours.
1:05:30
Thanks for listening.
`

describe('youtubeId (only the host and the 11-character id are trusted)', () => {
  it('accepts the usual link shapes', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=42', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'http://youtube.com/watch?feature=share&v=dQw4w9WgXcQ']) expect(youtubeId(u), u).toBe('dQw4w9WgXcQ')
  })
  it('refuses look-alikes, bad ids and other schemes', () => {
    for (const u of ['https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://evil.com/?u=https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/playlist?list=PL123', 'javascript:alert(1)', 'ftp://youtu.be/dQw4w9WgXcQ', 'not a url', '']) expect(youtubeId(u), u).toBeNull()
  })
})

describe('fromTranscript', () => {
  it('SRT: keeps the words, drops tags and [Music], groups by two minutes with time locators', () => {
    const ex = fromTranscript('Solar talk', SRT)
    expect(ex.title).toBe('Solar talk')
    expect(ex.parts.map((p) => p.locator)).toEqual(['0:01', '2:10'])
    expect(ex.parts[0]!.text).toBe('Welcome to the solar energy talk. India aims for 500 gigawatts by 2030.')
    expect(ex.parts[1]!.text).toContain('40% less')
  })
  it('VTT: skips the header, notes and the line auto-captions repeat', () => {
    const ex = fromTranscript('', VTT)
    expect(ex.title).toBe('YouTube video')
    const all = ex.parts.map((p) => p.text).join(' ')
    expect(all).toBe('We install panels on roofs. and the payback is six years. Thank you for watching.')
    expect(ex.parts.map((p) => p.locator)).toEqual(['0:00', '3:00'])
  })
  it("YouTube's copied transcript (time on its own line, h:mm:ss for long videos)", () => {
    const ex = fromTranscript('Batteries', YT)
    expect(ex.parts.map((p) => p.locator)).toEqual(['0:00', '1:05:30'])
    expect(ex.parts[0]!.text).toBe('Hello everyone, today we talk about batteries. A battery stores 60 kilowatt hours.')
    expect(clock(3930)).toBe('1:05:30')
  })
  it('plain text without times is one part with no locator', () => {
    const ex = fromTranscript('Notes', 'This is a plain transcript without any time stamps at all, just words.')
    expect(ex.parts).toEqual([{ locator: null, text: 'This is a plain transcript without any time stamps at all, just words.' }])
  })
  it('too little text is refused with a plain sentence', () => {
    expect(() => fromTranscript('x', '0:00\nhi\n0:05\nyo\n0:09\nok')).toThrow(/too little text/)
    expect(() => fromTranscript('x', '[Music]\n[Applause]')).toThrow(SourceError)
  })
  it('never keeps more than the source size limit', () => {
    const big = Array.from({ length: 60_000 }, (_, i) => `${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}\nword number ${i} and more words to fill the line`).join('\n')
    const ex = fromTranscript('Long', big)
    expect(ex.parts.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(220_000)
  })
})

describe('caption files and YouTube links', () => {
  it('.srt and .vtt uploads become transcript sources', async () => {
    const a = await fromFile(new TextEncoder().encode(SRT), 'talk.srt')
    expect(a.kind).toBe('transcript'); expect(a.extracted.title).toBe('talk')
    const b = await fromFile(new TextEncoder().encode(VTT), 'talk.vtt')
    expect(b.kind).toBe('transcript')
  })
  it('a YouTube link is never fetched: it answers with how to get the transcript', async () => {
    let fetched = false
    await expect(readLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ', async () => { fetched = true; return new Response('x') })).rejects.toThrow(YOUTUBE_HELP)
    expect(fetched).toBe(false)
  })
})
