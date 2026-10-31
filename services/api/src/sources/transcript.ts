import { SourceError } from './errors.ts'
import { type Extracted } from './extract.ts'
import { clean, MAX_TEXT_CHARS } from './limits.ts'

/**
 * Video transcripts as a source: the person pastes YouTube's "Show transcript" text or uploads a caption file (.srt / .vtt / .sbv).
 * We never fetch YouTube ourselves (it does not hand captions to programs, and getting around that is not something this product does).
 * Time stamps are kept as locators ("12:30") so a slide can cite the minute it came from.
 */
const YT_HOST = /^(?:(?:www|m|music)\.)?(?:youtube\.com|youtube-nocookie\.com)$/i

/** The 11-character video id from a youtube.com / youtu.be / shorts / embed link, or null. Only the host and the id are trusted. */
export function youtubeId(raw: string): string | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null
  else if (YT_HOST.test(host)) id = u.pathname === '/watch' ? u.searchParams.get('v') : (/^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null)
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
}
export const isYouTubeLink = (raw: string) => youtubeId(raw) !== null
export const canonicalYouTubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`

export const YOUTUBE_HELP = 'YouTube does not let apps read captions automatically. Open the video, click "…more" under the title to open the description, scroll to the bottom and click "Show transcript", then copy the text and paste it into "YouTube / captions" — or upload the caption file (.srt or .vtt).'

interface Cue { start: number | null; text: string }
const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?/
const toSec = (m: RegExpExecArray) => Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
const pad = (n: number) => String(n).padStart(2, '0')
export const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`)

const tidy = (t: string) => t.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\[(?:music|applause|laughter|silence|inaudible)[^\]]*\]/gi, '').replace(/♪[^♪\n]*♪?/g, '').replace(/^\s*>>+\s*/gm, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')

/** SubRip / WebVTT / SBV: blocks separated by blank lines, a time line with "-->" (or "," for .sbv), then the words. */
function fromCaptionFile(raw: string): Cue[] {
  const cues: Cue[] = []
  let last = ''
  for (const block of raw.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => /-->/.test(l) || /^\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}$/.test(l.trim()))
    if (ti < 0 || /^(WEBVTT|NOTE|STYLE|REGION)/.test(lines[0] ?? '')) continue
    const m = TIME.exec(lines[ti]!); if (!m) continue
    const words = lines.slice(ti + 1).map((l) => tidy(l).trim()).filter(Boolean).filter((l) => l !== last) // auto-captions repeat the previous line in the next cue
    if (words.length === 0) continue
    last = words[words.length - 1]!
    cues.push({ start: toSec(m), text: words.join(' ') })
  }
  return cues
}

/** YouTube's "Show transcript" copy: a time on its own line (or before the words) followed by the words. */
function fromYouTubeCopy(raw: string, minStamps = 3): Cue[] | null {
  const lines = raw.replace(/\r/g, '').split('\n')
  const stamp = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*(.*)$/
  if (lines.filter((l) => stamp.test(l)).length < minStamps) return null
  const cues: Cue[] = []
  let cur: Cue | null = null
  for (const l of lines) {
    const m = stamp.exec(l)
    if (m) { if (cur && cur.text.trim()) cues.push(cur); cur = { start: toSec(m as unknown as RegExpExecArray), text: tidy(m[4] ?? '').trim() } }
    else if (cur) cur.text += ` ${tidy(l).trim()}`
  }
  if (cur && cur.text.trim()) cues.push(cur)
  return cues
}

/** `minStamps`: how many time lines make the text count as timed (3 for text people paste; 1 for our own model's output, whose format we control). */
/** Groups cues into ≈2-minute parts, each located by the time its first words were spoken; plain text without times becomes one part. */
export function fromTranscript(title: string, raw: string, windowSec = 120, minStamps = 3): Extracted {
  const text = raw.replace(/\u0000/g, '')
  const cues = /-->/.test(text) || /^\d+:\d{2}:\d{2}\.\d{3},/m.test(text) ? fromCaptionFile(text) : (fromYouTubeCopy(text, minStamps) ?? [{ start: null, text: tidy(text) }])
  const parts: { locator: string | null; text: string }[] = []
  let bucket = -1, bucketStart: number | null = null, buf: string[] = []
  const flush = () => { if (buf.length) parts.push({ locator: bucketStart !== null ? clock(bucketStart) : null, text: buf.join(' ').replace(/\s+/g, ' ').trim() }); buf = [] }
  for (const c of cues) {
    const b = c.start === null ? -1 : Math.floor(c.start / windowSec)
    if (b !== bucket) { flush(); bucket = b; bucketStart = c.start }
    buf.push(c.text)
  }
  flush()
  const kept = parts.filter((p) => p.text.length > 0)
  let budget = MAX_TEXT_CHARS
  const bounded = kept.map((p) => { const t = clean(p.text).slice(0, Math.max(0, budget)); budget -= t.length; return { locator: p.locator, text: t } }).filter((p) => p.text.length > 0)
  if (bounded.reduce((n, p) => n + p.text.length, 0) < 40) throw new SourceError('That does not look like a transcript: there is too little text. Copy the whole transcript from YouTube ("Show transcript") and paste it again.')
  return { title: (title.trim() || 'YouTube video').slice(0, 200), parts: bounded }
}
