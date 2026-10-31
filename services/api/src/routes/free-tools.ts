import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { AIUnavailableError } from '@prompttoppt/ai'
import { aiConfigured, gateway } from '../ai/gateway.ts'
import { OUTLINE_KINDS, PDF_MODES, SCRIPT_KINDS, SCRIPT_MAX_CHARS, outlineOutput, outlinePrompt, pdfOutput, pdfPrompt, PDF_TEXT_CHARS, scriptPrompt } from '../free-tools/prompts.ts'
import { freeToolBurst, freeToolGuard } from '../free-tools/limits.ts'
import { BusyError, parseUpload } from '../sources/parse-pool.ts'
import { busyAnswer, uploadGate } from '../middleware/upload-gate.ts'
import type { AppEnv } from '../middleware/session.ts'
import { fileErrorMessage } from './sources.ts'
import { dailyAttachLimit, storeAttachment } from './drafts.ts'
import { fromTranscript } from '../sources/transcript.ts'
import { fromText } from '../sources/extract.ts'
import { FREE_MEDIA_MAX_BYTES, MediaError, inspectMedia, mediaReadOutput, mediaReadPrompt } from '../sources/media-read.ts'
import { clientIp, rateLimit } from '../middleware/rate-limit.ts'
import { SITEMAP_MAX_PAGES, SitemapError, crawlSite } from '../free-tools/sitemap.ts'
import { env } from '../env.ts'

/** Public, no login. Mounted at /api/v1/free-tools. Every AI route sits behind the burst limit + cost guard in free-tools/limits.ts. */
export const freeTools = new Hono<AppEnv>()

const FREE_PDF_MAX_BYTES = 5 * 1024 * 1024
const fail = (c: any, status: 400 | 413 | 422 | 503, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)
const unavailable = (c: any) => fail(c, 503, 'AI_UNAVAILABLE', 'The AI service is busy right now. Please try again in a moment.')

freeTools.post(
  '/outline',
  freeToolBurst, freeToolGuard,
  zValidator('json', z.object({
    topic: z.string().trim().min(3, 'Tell us what the presentation is about').max(300),
    kind: z.enum(OUTLINE_KINDS).default('general'),
    audience: z.string().trim().max(100).optional(),
    slides: z.number().int().min(5).max(12).default(8),
  })),
  async (c) => {
    if (!aiConfigured) return unavailable(c)
    const i = c.req.valid('json')
    try {
      const out = await gateway.run({ route: 'fast', requestType: 'free_outline', ...outlinePrompt(i), schema: outlineOutput, ctx: {}, maxOutputTokens: 1800, thinkingBudget: 0 })
      return c.json({ success: true, data: out })
    } catch (e) {
      if (e instanceof AIUnavailableError) return unavailable(c)
      throw e
    }
  },
)

freeTools.post(
  '/pdf',
  uploadGate,
  freeToolBurst,
  bodyLimit({ maxSize: FREE_PDF_MAX_BYTES + 64 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', 'PDF is larger than 5 MB. Try a smaller file, or sign up to use files up to 10 MB.') }),
  freeToolGuard,
  async (c) => {
    if (!aiConfigured) return unavailable(c)
    const form = await c.req.parseBody()
    const file = form['file']
    const mode = z.enum(PDF_MODES).catch('presentation').parse(form['mode'])
    if (!(file instanceof File)) return fail(c, 400, 'NO_FILE', 'Attach a PDF as "file"')
    if (file.size > FREE_PDF_MAX_BYTES) return fail(c, 413, 'TOO_LARGE', 'PDF is larger than 5 MB. Try a smaller file, or sign up to use files up to 10 MB.')
    let ex
    try {
      const parsed = await parseUpload(new Uint8Array(await file.arrayBuffer()), file.name)
      if (parsed.kind !== 'pdf') return fail(c, 422, 'PARSE_FAILED', 'That file is not a PDF')
      ex = parsed.extracted
    } catch (e) { if (e instanceof BusyError) return busyAnswer(c); return fail(c, 422, 'PARSE_FAILED', fileErrorMessage(e)) }
    const text = ex.parts.map((p) => p.text).join('\n\n').slice(0, PDF_TEXT_CHARS)
    try {
      const out = await gateway.run({ route: 'fast', requestType: 'free_pdf', ...pdfPrompt({ mode, filename: ex.title, text }), schema: pdfOutput, ctx: {}, maxOutputTokens: 2600, thinkingBudget: 0 })
      // Keep the parsed document for an hour so "Create the full presentation" can hand it to the editor without a second upload.
      const attachment = await storeAttachment('pdf', ex)
      return c.json({ success: true, data: { ...out, mode, pages: ex.parts.length, attachmentId: attachment.id, truncated: ex.parts.reduce((n, p) => n + p.text.length, 0) > PDF_TEXT_CHARS } })
    } catch (e) {
      if (e instanceof AIUnavailableError) return unavailable(c)
      throw e
    }
  },
)

/**
 * Free "YouTube transcript → slides" helper. The visitor pastes the transcript they copied from YouTube ("Show transcript") or the text of a caption
 * file; we clean it (time stamps, repeats, [Music]) and keep it for an hour so the editor can build a deck from it. No AI and no YouTube access here:
 * YouTube does not hand captions to programs, so the visitor brings the text.
 */
freeTools.post(
  '/transcript',
  freeToolBurst, dailyAttachLimit,
  bodyLimit({ maxSize: 600 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', 'That transcript is too long. Paste up to about 300,000 characters.') }),
  zValidator('json', z.object({ text: z.string().trim().min(40, 'Paste the transcript text first').max(300_000), title: z.string().trim().max(120).optional() })),
  async (c) => {
    const { text, title } = c.req.valid('json')
    let ex
    try { ex = fromTranscript(title ?? '', text) } catch (e) { return fail(c, 422, 'PARSE_FAILED', fileErrorMessage(e)) }
    const stored = await storeAttachment('transcript', ex)
    const words = ex.parts.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0)
    const timed = ex.parts.filter((p) => p.locator)
    return c.json({ success: true, data: { title: ex.title, words, timed: timed.length > 0, parts: ex.parts, attachmentId: stored.id } })
  },
)

/** Visitors may transcribe only a few small recordings a day (a recording costs real money; signed-in people pay with credits instead). */
const mediaDaily = new Map<string, { day: number; n: number }>()
export const resetFreeMediaLimit = () => mediaDaily.clear()
const mediaVisitorCap = (c: any, next: () => Promise<void>) => {
  const ip = clientIp(c)
  const day = Math.floor(Date.now() / 86_400_000)
  const hit = mediaDaily.get(ip)
  const entry = hit && hit.day === day ? hit : { day, n: 0 }
  if (entry.n >= env.FREE_MEDIA_IP_DAY) return c.json({ success: false, error: { code: 'DAILY_LIMIT', message: "You've used today's free recordings. Sign up free to keep going (100 credits included), or come back tomorrow." } }, 429)
  entry.n++ // counted before the model call so a failing request cannot be retried for free forever
  mediaDaily.set(ip, entry)
  if (mediaDaily.size > 20_000) mediaDaily.clear()
  return next()
}

/** Free "audio / video → slides" helper: a small recording of the visitor's own is transcribed; the text is kept for an hour for the editor hand-off. */
freeTools.post(
  '/media',
  uploadGate, freeToolBurst,
  bodyLimit({ maxSize: FREE_MEDIA_MAX_BYTES + 64 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', 'That recording is larger than 4 MB. Try a shorter part, or sign up to use files up to 12 MB.') }),
  freeToolGuard, mediaVisitorCap, dailyAttachLimit,
  async (c) => {
    if (!aiConfigured) return unavailable(c)
    const file = (await c.req.parseBody())['file']
    if (!(file instanceof File)) return fail(c, 400, 'NO_FILE', 'Attach a recording as "file"')
    const bytes = new Uint8Array(await file.arrayBuffer())
    let info
    try { info = inspectMedia(bytes, FREE_MEDIA_MAX_BYTES) } catch (e) { return fail(c, 422, 'PARSE_FAILED', e instanceof MediaError ? e.message.replace('12 MB', '4 MB') : 'Could not read that recording') }
    try {
      const out = await gateway.run({ route: 'fast', requestType: 'free_media', ...mediaReadPrompt(file.name || 'recording', info.kind), media: [{ kind: info.kind, mimeType: info.mime, data: bytes }], schema: mediaReadOutput, maxOutputTokens: 12_000, timeoutMs: 120_000, ctx: {} })
      if (!out.hasSpeech || out.text.trim().length < 20) return fail(c, 422, 'NO_SPEECH', "I couldn't hear any speech in that recording. Try a clearer one with someone talking.")
      const ex = fromTranscript(out.title || file.name.replace(/\.[a-z0-9]+$/i, '') || 'Recording', out.text, 120, 1)
      const stored = await storeAttachment('transcript', ex)
      const words = ex.parts.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0)
      return c.json({ success: true, data: { title: ex.title, words, timed: ex.parts.some((p) => p.locator), parts: ex.parts, attachmentId: stored.id } })
    } catch (e) {
      if (e instanceof AIUnavailableError) return unavailable(c)
      console.error('[free-media]', e)
      return fail(c, 422, 'PARSE_FAILED', 'I could not transcribe that recording. Please try again.')
    }
  },
)

/**
 * Free "video / Reel script → slides" tool: the visitor pastes a script they wrote; one cheap model call turns it into a slide outline that follows the
 * script's beats, and the script is kept for an hour so the editor can build the full deck from it.
 */
freeTools.post(
  '/script',
  freeToolBurst, dailyAttachLimit, freeToolGuard,
  bodyLimit({ maxSize: 40 * 1024, onError: (c) => fail(c, 413, 'TOO_LARGE', `That script is too long. Paste up to ${SCRIPT_MAX_CHARS.toLocaleString('en-US')} characters.`) }),
  zValidator('json', z.object({ script: z.string().trim().min(40, 'Paste your script first (at least a couple of sentences)').max(SCRIPT_MAX_CHARS), kind: z.enum(SCRIPT_KINDS).default('reel') })),
  async (c) => {
    if (!aiConfigured) return unavailable(c)
    const i = c.req.valid('json')
    try {
      const out = await gateway.run({ route: 'fast', requestType: 'free_script', ...scriptPrompt({ kind: i.kind, text: i.script }), schema: outlineOutput, ctx: {}, maxOutputTokens: 2200, thinkingBudget: 0 })
      const stored = await storeAttachment('text', fromText(out.title, i.script))
      return c.json({ success: true, data: { ...out, attachmentId: stored.id } })
    } catch (e) {
      if (e instanceof AIUnavailableError) return unavailable(c)
      throw e
    }
  },
)

/** Free sitemap generator: crawls one public website (no AI). Own limits: 8 sites an hour per visitor, 4 crawls at once on the whole server. */
let crawling = 0
const MAX_CRAWLS = 4
freeTools.post(
  '/sitemap',
  rateLimit({ windowMs: 3_600_000, max: env.FREE_SITEMAP_IP_HOUR, message: 'You have made a few sitemaps already. Please try again in an hour, or sign up for more.' }),
  zValidator('json', z.object({
    url: z.string().trim().min(3, 'Enter your website address').max(500),
    maxPages: z.number().int().min(1).max(SITEMAP_MAX_PAGES).default(100),
    lastmod: z.boolean().default(false),
    changefreq: z.enum(['none', 'always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never']).default('none'),
    priority: z.boolean().default(true),
  })),
  async (c) => {
    if (crawling >= MAX_CRAWLS) return c.json({ success: false, error: { code: 'BUSY', message: 'Many people are making sitemaps right now. Please try again in a minute.' } }, 503)
    const i = c.req.valid('json')
    crawling++
    try {
      const r = await crawlSite(i.url, i)
      return c.json({ success: true, data: r })
    } catch (e) {
      if (e instanceof SitemapError) return fail(c, 422, 'SITEMAP_FAILED', e.message)
      throw e
    } finally { crawling-- }
  },
)
