import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { aiAssistInput } from '../ai/ai-assist.ts'
import { PLAIN_INVALID, plainMessage, zValidator } from './validate.ts'

const app = new Hono().post('/t', zValidator('json', z.object({ name: z.string().min(3, 'Give it a name of at least 3 letters'), size: z.number().max(10) })), (c) => c.json({ ok: c.req.valid('json').name }))
const send = (body: unknown) => app.request('/t', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('a refused request answers in words for people, never with the raw validation issues', () => {
  it('a message the schema gives on purpose is shown', async () => {
    const r = await send({ name: 'x', size: 1 })
    expect(r.status).toBe(400)
    expect(await r.json()).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST', message: 'Give it a name of at least 3 letters' } })
  })
  it('technical wording becomes the plain sentence; no JSON of issues reaches the message', async () => {
    const body = await (await send({ name: 'okay', size: 99 })).json() as { error: { message: string; details: { fields: string[] } } }
    expect(body.error.message).toBe(PLAIN_INVALID)
    expect(body.error.message).not.toMatch(/too_big|\{|\[/)
    expect(body.error.details.fields).toEqual(['size'])
  })
  it('plainMessage skips Zod\'s own wording', () => {
    expect(plainMessage([{ message: 'Too big: expected string to have <=160 characters' }, { message: 'Invalid input: expected string' }])).toBe(PLAIN_INVALID)
    expect(plainMessage([{ message: 'Too big: …' }, { message: 'Add a bit more text' }])).toBe('Add a bit more text')
  })
  it('every route uses this validator (the raw one is imported nowhere else)', () => {
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts') && !p.endsWith('validate.ts') && !p.endsWith('.test.ts')) files.push(p) } }
    walk(join(import.meta.dirname, '..'))
    expect(files.filter((f) => readFileSync(f, 'utf8').includes("from '@hono/zod-validator'"))).toEqual([])
  })
})

describe('the assistant request: the chat history is trimmed, never a reason to refuse a new message', () => {
  const base = { instruction: 'add fade in animation to the whole content', requestId: 'r-12345678' }
  it('the request that broke a real chat (a 185-character change line sent back as context) is accepted, the line trimmed', () => {
    const line = 'Added the "Fade In" animation to the picture, the shape, the title, the subtitle, a number, a heading, the body text and a caption (126 items) on slides 1, 2, 3, 4, 5, 6, 7, 8, 9 and 10'
    expect(line.length).toBeGreaterThan(160)
    const r = aiAssistInput.safeParse({ ...base, recent: [{ theme: false, slideIds: ['a'], summary: [line] }] })
    expect(r.success).toBe(true)
    expect(r.data!.recent[0]!.summary[0]!.length).toBeLessThanOrEqual(160)
  })
  it('a long conversation is cut to the last turns, each clipped', () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `turn ${i} ` + 'x'.repeat(2000) }))
    const r = aiAssistInput.parse({ ...base, conversation: turns })
    expect(r.conversation.length).toBe(8)
    expect(r.conversation.every((t) => t.text.length <= 600)).toBe(true)
    expect(r.conversation.at(-1)!.text.startsWith('turn 19')).toBe(true)
  })
  it('a long message the person typed (up to 4,000 characters) is accepted; longer is refused with a plain reason', () => {
    expect(aiAssistInput.safeParse({ ...base, instruction: 'Rewrite every slide. '.repeat(180) }).success).toBe(true)
    const r = aiAssistInput.safeParse({ ...base, instruction: 'x'.repeat(4001) })
    expect(r.success).toBe(false)
    expect(plainMessage(r.error!.issues)).toMatch(/longer than 4,000 characters\. Attach long text as a source/)
  })
})
