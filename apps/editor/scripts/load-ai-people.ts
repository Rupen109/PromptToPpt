/**
 * Step 2 of the AI load test (see services/api/scripts/load-ai.ts): each person builds a deck with AI, then edits it with the assistant 6-8
 * times exactly as the editor does — the answer is applied with the editor's own commands (applyAssist, the undo record) and saved with the
 * editor's save call — then asks the deck a question, shares and exports it. Every assistant answer is checked against what its phrase asked.
 *   cd apps/editor && npx tsx scripts/load-ai-people.ts        env: CONC=24 API=http://localhost:4000 ORIGIN=http://localhost:3001
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { produce } from 'immer'
import type { Presentation } from '@prompttoppt/validation'
import * as C from '../src/editor/commands.ts'

const API = process.env['API'] ?? 'http://localhost:4000'
const ORIGIN = process.env['ORIGIN'] ?? 'http://localhost:3001'
const CONC = Number(process.env['CONC'] ?? 24)
const RUN_FILE = process.env['RUN_FILE'] ?? '/private/tmp/claude-502/load-ai-run.json'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]!

const TOPICS = [
  'A pitch deck for a food delivery startup in Ahmedabad', 'The history of the Indian space programme', 'Quarterly sales review for a SaaS company', 'Climate change and what cities can do',
  'Onboarding plan for new software engineers', 'Healthy eating habits for teenagers', 'Marketing plan for a new coffee brand', 'How UPI changed payments in India',
  'Introduction to machine learning for school students', 'A wedding planning business proposal', 'Annual report of a non-profit that teaches girls to code', 'Electric vehicles: market and future',
  'Cyber security basics for small businesses', 'Travel guide to Rajasthan', 'Product launch of a smartwatch for runners', 'The life of A P J Abdul Kalam',
  'Remote work best practices', 'Startup fundraising: seed to series A', 'Water conservation in agriculture', 'Customer support playbook for an e-commerce store',
  'Mental health awareness at the workplace', 'Real estate investment basics', 'Social media strategy for a local gym', 'Solar energy for homes',
  'गुजरात में पर्यटन के अवसर', 'ભારતમાં ડિજિટલ શિક્ષણ', 'Project status update for a mobile app redesign', 'Team building activities for remote teams',
]
/** what each phrase asks for, and how to tell the answer did it (n = a slide number the phrase names) */
type Check = (r: any, n: number) => boolean
const changed = (r: any) => r.applied?.length > 0
const PHRASES: { family: string; say: (n: number, total: number) => string; ok: Check }[] = [
  { family: 'layout', say: (n) => `update the layout of slide ${n}, it looks boring`, ok: (r) => r.edits?.length > 0 },
  { family: 'layout', say: (n, t) => { const a = Math.max(2, Math.min(n, t - 3)); return `slides ${a} to ${a + 2} all look the same, give them different layouts` }, ok: (r) => r.edits?.length >= 2 },
  { family: 'text', say: (n) => `make slide ${n} shorter`, ok: (r) => r.edits?.length > 0 },
  { family: 'text', say: () => 'please add 2 more bullet points here', ok: (r) => r.edits?.length > 0 },
  { family: 'text', say: (n) => `rewrite the title of slide ${n} to be more catchy`, ok: (r) => r.edits?.length > 0 },
  { family: 'text', say: (n) => `translate slide ${n} to Hindi`, ok: (r) => r.edits?.length > 0 },
  { family: 'add_slide', say: () => 'add a thank you page at the end', ok: (r) => r.additions?.length === 1 },
  { family: 'add_slide', say: (n) => `add 2 slides after slide ${n} about the key challenges`, ok: (r) => r.additions?.length === 2 },
  { family: 'palette', say: () => 'change the colours to deep blue and orange', ok: (r) => !!r.theme },
  { family: 'palette', say: () => 'make the theme dark', ok: (r) => !!r.theme },
  { family: 'background', say: (n) => `make the background of slide ${n} light grey`, ok: (r) => r.backgrounds?.length > 0 },
  { family: 'picture', say: () => 'update the background image of this slide', ok: (r) => r.pictures?.length > 0 || r.images?.length > 0 },
  { family: 'fonts', say: () => 'use a more professional font', ok: (r) => !!r.theme },
  { family: 'motion', say: () => 'animate every slide', ok: (r) => !!r.theme },
  { family: 'template', say: () => 'try a more modern template', ok: (r) => !!r.theme },
  { family: 'remove_slide', say: (n) => `delete slide ${n}`, ok: (r) => r.removals?.length === 1 },
  { family: 'move_slide', say: (n) => `move slide ${n} to the end`, ok: (r) => r.moves?.length === 1 },
  { family: 'question', say: () => 'how many slides does this deck have?', ok: (r) => !changed(r) && !!r.reply },
  { family: 'chat', say: () => 'thanks!', ok: (r) => !changed(r) },
]
const UNDO = { family: 'undo', say: () => 'undo that, I did not like it', ok: (r: any) => r.reverts?.length > 0 }

interface Account { email: string; cookie: string; plan: 'starter' | 'pro' | 'gold' }
interface EditRec { family: string; say: string; ok: boolean; ms: number; status: number; code?: string; credits: number }
interface UserRec { email: string; plan: string; deck: { ok: boolean; ms: number; slides: number; status: string; error?: string } | null; edits: EditRec[]; asked?: { ok: boolean; ms: number; status: number; code?: string }; shared?: boolean; exported?: { ok: boolean; ms: number }; saves: { ok: number; conflicts: number; failed: number } }
interface Run { startedAt: string; accounts: Account[]; done: Record<string, UserRec> }

const run: Run = JSON.parse(readFileSync(RUN_FILE, 'utf8'))
const save = () => writeFileSync(RUN_FILE, JSON.stringify(run))

async function call(a: Account, method: string, path: string, body?: unknown) {
  const t = Date.now()
  const res = await fetch(`${API}/api/v1${path}`, { method, headers: { Cookie: a.cookie, Origin: ORIGIN, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }).catch((e) => ({ status: 0, ok: false, json: async () => ({ error: { code: String(e) } }), headers: new Headers() }) as unknown as Response)
  const json = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null
  return { status: res.status, ms: Date.now() - t, json: json as any }
}

/** one person: build a deck, edit it 6-8 times like the editor does, ask it a question, share and export it */
async function person(a: Account): Promise<UserRec> {
  const rec: UserRec = { email: a.email, plan: a.plan, deck: null, edits: [], saves: { ok: 0, conflicts: 0, failed: 0 } }
  await call(a, 'GET', '/me/entitlements')
  const t0 = Date.now()
  const job = await call(a, 'POST', '/generation/jobs', { prompt: pick(TOPICS), slideCount: 8 + Math.floor(Math.random() * 5), idempotencyKey: randomUUID() })
  let j = job.json?.data
  if (!j?.id) { rec.deck = { ok: false, ms: job.ms, slides: 0, status: `create ${job.status}`, error: job.json?.error?.code }; return rec }
  while (!['completed', 'failed', 'cancelled'].includes(j.status) && Date.now() - t0 < 25 * 60_000) { await sleep(3000); j = (await call(a, 'GET', `/generation/jobs/${j.id}`)).json?.data ?? j }
  const opened = j.presentationId ? await call(a, 'GET', `/presentations/${j.presentationId}`) : null
  let doc = opened?.json?.data?.document as Presentation | undefined
  let revision = opened?.json?.data?.revision as number
  rec.deck = { ok: j.status === 'completed' && !!doc, ms: Date.now() - t0, slides: doc?.slides.length ?? 0, status: j.status, ...(j.error ? { error: j.error } : {}) }
  if (!rec.deck.ok || !doc) return rec
  const id = j.presentationId as string

  const undoStack: C.AssistUndo[] = []
  const chat: { role: 'user' | 'assistant'; text: string }[] = []
  const edits = 6 + Math.floor(Math.random() * 3)
  for (let k = 0; k < edits; k++) {
    const total = doc.slides.length
    const p = k > 0 && undoStack.length && Math.random() < 0.12 ? UNDO : pick(PHRASES)
    const n = 2 + Math.floor(Math.random() * Math.max(1, total - 2))
    const say = p.say(n, total)
    const active = doc.slides[Math.min(total - 1, n - 1)]!.id
    const r = await call(a, 'POST', `/presentations/${id}/ai-assist`, { instruction: say, scope: 'deck', activeSlideId: active, requestId: randomUUID(), conversation: chat.slice(-6), ...(undoStack.length ? { recent: [...undoStack].reverse().slice(0, 5).map((u) => ({ theme: !!u.theme, slideIds: C.undoSlideIds(u).slice(0, 40), summary: u.summary.slice(0, 8) })) } : {}) })
    const d = r.json?.data
    rec.edits.push({ family: p.family, say, ok: r.status === 200 && !!d && p.ok(d, n), ms: r.ms, status: r.status, ...(r.json?.error?.code ? { code: r.json.error.code } : {}), credits: d?.creditsCharged ?? 0 })
    chat.push({ role: 'user', text: say }, { role: 'assistant', text: String(d?.reply ?? '').slice(0, 500) })
    if (d?.applied?.length) {
      // the editor's own apply + undo record, then the editor's save
      const before = doc
      const log = [...undoStack]
      const after = produce(doc, (draft) => { C.applyAssist(draft, d); for (const rv of d.reverts ?? []) { const e = log[log.length - 1 - rv.change]; if (e) C.revertAssist(draft, e, rv.part, rv.slideId) } })
      if (!(d.reverts?.length)) undoStack.push(C.snapshotAssist(before, after, !!d.theme, d.applied, undefined, [...(d.backgrounds ?? []).map((b: any) => b.slideId), ...(d.pictures ?? []).map((x: any) => x.slideId), ...(d.readability ?? [])]))
      else undoStack.pop()
      const s = await call(a, 'PUT', `/presentations/${id}`, { baseRevision: revision, document: after })
      if (s.status === 200) { rec.saves.ok++; revision = s.json?.data?.revision ?? revision + 1; doc = after }
      else if (s.status === 409) { rec.saves.conflicts++; const o = await call(a, 'GET', `/presentations/${id}`); doc = o.json?.data?.document ?? doc; revision = o.json?.data?.revision ?? revision }
      else rec.saves.failed++
    }
    await sleep(1500 + Math.random() * 2500) // reading the answer
  }
  if (Math.random() < 0.5) { const q = await call(a, 'POST', `/presentations/${id}/ask`, { question: 'What is the main message of this deck?', requestId: randomUUID() }); rec.asked = { ok: q.status === 200 && !!q.json?.data?.answer, ms: q.ms, status: q.status, ...(q.json?.error?.code ? { code: q.json.error.code } : {}) } }
  if (a.plan !== 'starter' && Math.random() < 0.3) { const s = await call(a, 'POST', `/presentations/${id}/share`, {}); rec.shared = s.status === 200 || s.status === 201 }
  if (a.plan !== 'starter' && Math.random() < 0.2) { const t = Date.now(); const e = await fetch(`${API}/api/v1/exports`, { method: 'POST', headers: { Cookie: a.cookie, Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId: id, format: 'pptx' }) }); const bytes = (await e.arrayBuffer()).byteLength; rec.exported = { ok: e.status === 200 && bytes > 10_000, ms: Date.now() - t } }
  return rec
}

async function main() {
  const todo = run.accounts.filter((a) => !run.done[a.email])
  console.log(`${todo.length} people to run (${Object.keys(run.done).length} already done), ${CONC} at a time`)
  let next = 0, finished = 0
  const t0 = Date.now()
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < todo.length) {
      const a = todo[next++]!
      try { run.done[a.email] = await person(a) } catch (e) { run.done[a.email] = { email: a.email, plan: a.plan, deck: { ok: false, ms: 0, slides: 0, status: 'crashed', error: String(e).slice(0, 200) }, edits: [], saves: { ok: 0, conflicts: 0, failed: 0 } } }
      if (++finished % 10 === 0) { save(); const all = Object.values(run.done); console.log(`${new Date().toISOString().slice(11, 19)} ${all.length}/${run.accounts.length} people · decks ok ${all.filter((u) => u.deck?.ok).length} · edits ${all.reduce((x, u) => x + u.edits.length, 0)} (right ${all.reduce((x, u) => x + u.edits.filter((e) => e.ok).length, 0)}) · ${Math.round((Date.now() - t0) / 60000)} min`) }
    }
  }))
  save()
  console.log('done: now run the report (services/api: scripts/load-ai.ts report)')
}

await main()
process.exit(0)
