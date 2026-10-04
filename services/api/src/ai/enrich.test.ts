import { describe, expect, it } from 'vitest'
import type { SlideContent } from '@prompttoppt/validation'
import { changedMaterially, rankChunks, type Chunk } from './enrich.ts'
import { api, json, makeDeck, signUp } from '../test-utils.ts'

const tb = (title: string, bullets: string[]): SlideContent => ({ layout: 'title-body', title, bullets, speakerNotes: '', sources: [] }) as SlideContent
const chunk = (id: string, text: string): Chunk => ({ id, sourceId: 's1', locator: 'p. 1', text })

describe('enrichment helpers', () => {
  it('ranks the excerpts that talk about the slide, and spreads material across slides', () => {
    const chunks = [chunk('a', 'Billing uses Razorpay subscriptions with webhook signature verification'), chunk('b', 'The editor stores the canonical JSON document and supports undo redo'), chunk('c', 'Zebrafish tanks are kept warm')]
    const used = new Map<string, number>()
    const first = rankChunks(chunks, 'Billing and payments with Razorpay', used, 1)
    expect(first[0]!.id).toBe('a')
    used.set('a', 3)
    expect(rankChunks(chunks, 'Billing payments webhook editor document', used, 1)[0]!.id).toBe('b') // 'a' is penalised after heavy use
  })
  it('a slide counts as changed only when it really has new wording or clearly more text', () => {
    const old = tb('Billing', ['Plans are priced per country', 'Webhooks update plans'])
    expect(changedMaterially(old, tb('Billing', ['Plans are priced per country', 'Webhooks update plans']))).toBe(false)
    expect(changedMaterially(old, tb('Billing', ['Webhooks update plans', 'Plans are priced per country']))).toBe(false) // reordered, nothing new
    expect(changedMaterially(old, tb('Billing', ['Plans are priced per country, in INR for India and USD elsewhere', 'Razorpay webhooks verify signatures before activating a plan']))).toBe(true)
    expect(changedMaterially(old, tb('', ['']))).toBe(false)
  })
})

describe('assistant chat history', () => {
  it('is stored per presentation, private to its owner, capped, and clearable', async () => {
    const u = await signUp('chat'), other = await signUp('chat')
    const deck = (await makeDeck(u.id)).id
    const post = (cookie: string, m: unknown[]) => api(cookie, 'POST', `/presentations/${deck}/chat`, { messages: m })
    expect((await post(u.cookie, [{ role: 'user', text: 'hello' }, { role: 'ai', reply: 'hi', applied: ['x'], notes: [], credits: 1 }])).status).toBe(200)
    const list = (await json(await api(u.cookie, 'GET', `/presentations/${deck}/chat`))).data
    expect(list.map((m: any) => m.role)).toEqual(['user', 'ai'])
    expect(list[0].text).toBe('hello')
    expect((await api(other.cookie, 'GET', `/presentations/${deck}/chat`)).status).toBe(404)
    expect((await post(other.cookie, [{ role: 'user', text: 'x' }])).status).toBe(404)
    expect((await post(u.cookie, [{ role: 'user', text: 'x'.repeat(5000) }])).status).toBe(400)
    expect((await api(u.cookie, 'DELETE', `/presentations/${deck}/chat`)).status).toBe(200)
    expect((await json(await api(u.cookie, 'GET', `/presentations/${deck}/chat`))).data).toEqual([])
  })
})
