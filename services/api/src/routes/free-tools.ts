import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { AIUnavailableError } from '@prompttoppt/ai'
import { aiConfigured, gateway } from '../ai/gateway.ts'
import { OUTLINE_KINDS, PDF_MODES, outlineOutput, outlinePrompt, pdfOutput, pdfPrompt, PDF_TEXT_CHARS } from '../free-tools/prompts.ts'
import { freeToolBurst, freeToolGuard } from '../free-tools/limits.ts'
import { BusyError, parseUpload } from '../sources/parse-pool.ts'
import { busyAnswer, uploadGate } from '../middleware/upload-gate.ts'
import type { AppEnv } from '../middleware/session.ts'
import { fileErrorMessage } from './sources.ts'
import { storeAttachment } from './drafts.ts'

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
