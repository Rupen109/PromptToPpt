import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.ts'
import { supportTicket } from '../db/schema.ts'
import { env } from '../env.ts'
import { sniffImage } from '../lib/image-sniff.ts'
import { clientIp, rateLimit } from '../middleware/rate-limit.ts'
import type { AppEnv } from '../middleware/session.ts'
import { extensionFor, getStorage } from '../storage/index.ts'

/** Public, no login: the website's Support form. Mounted at /api/v1/support. The owner reads the messages in the dashboard (Control → Support). */
export const support = new Hono<AppEnv>()

export const MAX_FILES = 3
export const FILE_MAX = 5 * 1024 * 1024
const clean = (s: string) => s.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
const input = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address so we can reply').max(200),
  message: z.string().transform(clean).pipe(z.string().min(10, 'Tell us a little more (at least 10 characters)').max(4000, 'Please keep it under 4000 characters')),
})
const err = (c: any, status: 400 | 413 | 422, code: string, message: string) => c.json({ success: false, error: { code, message } }, status)

support.post(
  '/',
  rateLimit({ windowMs: 3_600_000, max: env.SUPPORT_IP_HOUR, message: 'You have sent a few messages already. Please wait a while, or email us directly.' }),
  bodyLimit({ maxSize: MAX_FILES * FILE_MAX + 256 * 1024, onError: (c) => err(c, 413, 'TOO_LARGE', `Attachments can be up to ${FILE_MAX / 1024 / 1024} MB each.`) }),
  async (c) => {
    const form = await c.req.parseBody({ all: true })
    // a field real people never see: a bot that fills it gets a friendly "sent" and nothing is stored
    if (typeof form['website'] === 'string' && form['website'].trim() !== '') return c.json({ success: true, data: { id: nanoid(10) } }, 201)
    const parsed = input.safeParse({ email: form['email'], message: form['message'] })
    if (!parsed.success) return err(c, 400, 'INVALID_REQUEST', parsed.error.issues[0]?.message ?? 'Please check the form')
    const raw = form['files']
    const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length > MAX_FILES) return err(c, 400, 'INVALID_REQUEST', `You can attach up to ${MAX_FILES} pictures.`)
    const stored: { key: string; name: string; mime: string; bytes: number }[] = []
    const storage = await getStorage()
    for (const f of files) {
      if (f.size > FILE_MAX) return err(c, 413, 'TOO_LARGE', `"${f.name.slice(0, 60)}" is larger than ${FILE_MAX / 1024 / 1024} MB.`)
      const bytes = new Uint8Array(await f.arrayBuffer())
      const mime = sniffImage(bytes)
      if (!mime) return err(c, 422, 'UNSUPPORTED', `"${f.name.slice(0, 60)}" is not a PNG, JPG or WebP picture. Attach a screenshot, or describe the problem in the message.`)
      const key = `support-${nanoid(21)}.${extensionFor(mime)}`
      await storage.put(key, bytes, mime)
      stored.push({ key, name: f.name.replace(/[\u0000-\u001f]/g, ' ').slice(0, 100), mime, bytes: bytes.length })
    }
    const id = nanoid(12)
    await db.insert(supportTicket).values({ id, email: parsed.data.email, message: parsed.data.message, files: stored, userId: c.get('session')?.user.id ?? null, ip: clientIp(c) })
    return c.json({ success: true, data: { id } }, 201)
  },
)
