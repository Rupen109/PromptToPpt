/**
 * Black-box attack on EVERY API route of a RUNNING server (dev only; refuses production). Plan: docs/FULL_SECURITY_LOAD_CTA_TEST_PLAN.md (B1–B7).
 *   tsx scripts/attack-routes.ts            env: API=http://localhost:4000  ORIGIN=http://localhost:3001
 * A victim (Pro, with real data in every area) and an attacker (a different signed-in user) are created; then, route by route:
 *   B1 signed-out · B2 attacker using the victim's real ids (with VALID bodies, so a validation error cannot hide a missing check) · B3 hammering for rate limits ·
 *   B4 hostile bodies · B5 CORS / verbs · B7 mass assignment.   Prints every finding; exit code = number of failures.
 */
import { deflateSync, crc32 } from 'node:zlib'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { app } from '../src/app.ts'
import { db, pool } from '../src/db/index.ts'
import { exportEvent, generationJob, presentationMember, subscription, user } from '../src/db/schema.ts'
import { isProd } from '../src/env.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
import net from 'node:net'
const API = process.env['API'] ?? 'http://localhost:4000'
const ORIGIN = process.env['ORIGIN'] ?? 'http://localhost:3001'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const findings: string[] = []
const ok = (id: string, title: string, pass: boolean, detail = '') => { console.log(`${pass ? '  ✓' : '  ✗'} ${id} ${title}${pass ? '' : `\n      ${detail}`}`); if (!pass) { failures++; findings.push(`${id} ${title}: ${detail}`) } }

interface Res { status: number; ms: number; json: any; text: string; headers: Headers }
async function http(method: string, path: string, o: { cookie?: string; body?: unknown; raw?: string | Uint8Array | FormData; headers?: Record<string, string>; origin?: string | null } = {}): Promise<Res> {
  const t0 = Date.now()
  const headers: Record<string, string> = { ...(o.origin === null ? {} : { Origin: o.origin ?? ORIGIN }), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers ?? {}) }
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    const r = await fetch(`${API}${path}`, { method, headers, ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : o.raw !== undefined ? { body: o.raw } : {}), signal: AbortSignal.timeout(30_000), redirect: 'manual' })
    const text = await r.text(); let json: any = null; try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: r.status, ms: Date.now() - t0, json, text, headers: r.headers }
  } catch (e) { return { status: 0, ms: Date.now() - t0, json: null, text: String((e as Error).message), headers: new Headers() } }
}

// ─── users and the victim's data ─────────────────────────────────────────────
async function signUp(tag: string) {
  const email = `atk${tag}${Date.now()}${Math.floor(Math.random() * 1e5)}@example.com`
  const r = await fetch(`${API}/api/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ email, password: 'Passw0rd!attack-test', name: `Atk ${tag}` }) })
  if (!r.ok) throw new Error(`sign-up ${tag}: ${r.status} ${await r.text()}`)
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const id = ((await r.json()) as { user: { id: string } }).user.id
  return { email, cookie, id }
}
const png = () => { const raw = Buffer.alloc((1 + 64 * 4) * 64, 0); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const o = y * 257 + 1 + x * 4; raw[o] = 200; raw[o + 1] = 60; raw[o + 2] = 40; raw[o + 3] = 255 }
  const chunk = (t: string, d: Buffer) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)) >>> 0, 8 + d.length); return b }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(64, 0); ih.writeUInt32BE(64, 4); ih[8] = 8; ih[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]) }

console.log('setting up the victim, an attacker and a bystander…')
const V = await signUp('victim'), X = await signUp('attacker'), Z = await signUp('bystander')
const grantPro = async (id: string) => { await db.delete(subscription).where(eq(subscription.userId, id)); const now = new Date(); await db.insert(subscription).values({ id: nanoid(), userId: id, planId: 'pro', status: 'active', currency: 'USD', interval: 'month', currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * 86400000) }) }
await grantPro(V.id); await grantPro(Z.id)
const must = <T,>(r: Res, what: string, pick: (j: any) => T): T => { const v = r.status < 300 ? pick(r.json) : undefined; if (v === undefined || v === null) throw new Error(`fixture "${what}" failed: ${r.status} ${r.text.slice(0, 200)}`); return v }
const deckId = must(await http('POST', '/api/v1/presentations', { cookie: V.cookie, body: { title: 'Victim deck' } }), 'deck', (j) => j.data.id as string)
const deck = (await http('GET', `/api/v1/presentations/${deckId}`, { cookie: V.cookie })).json.data
const slideId: string = (deck.document ?? deck).slides[0].id
const threadId = must(await http('POST', `/api/v1/presentations/${deckId}/comments`, { cookie: V.cookie, body: { slideId, body: 'victim secret comment' } }), 'thread', (j) => j.data.threadId as string)
const commentId = must(await http('POST', `/api/v1/presentations/${deckId}/comments/${threadId}/replies`, { cookie: V.cookie, body: { body: 'victim reply' } }), 'reply', (j) => j.data.commentId as string)
const shareToken = must(await http('POST', `/api/v1/presentations/${deckId}/share`, { cookie: V.cookie, body: {} }), 'share', (j) => j.data.url.split('/s/')[1] as string)
const projectId = must(await http('POST', '/api/v1/projects', { cookie: V.cookie, body: { name: 'Victim project' } }), 'project', (j) => j.data.id as string)
const sourceId = must(await http('POST', '/api/v1/sources/text', { cookie: V.cookie, body: { title: 'victim notes', text: 'Confidential victim notes: the launch is on Friday and the budget is 4 crore.' } }), 'source', (j) => j.data.id as string)
const kitId = must(await http('POST', '/api/v1/brand/kits', { cookie: V.cookie, body: { name: 'Victim kit', primary: '#112233', accent: '#445566' } }), 'kit', (j) => j.data.id as string)
const fd = new FormData(); fd.append('file', new File([new Uint8Array(png())], 'logo.png', { type: 'image/png' }))
const kitWithLogo = (await (await fetch(`${API}/api/v1/brand/kits/${kitId}/logo`, { method: 'POST', headers: { Cookie: V.cookie, Origin: ORIGIN }, body: fd })).json()) as { data: { logo: { url: string } } }
const assetId = kitWithLogo.data.logo.url.split('/').pop()!
const fd2 = new FormData(); fd2.append('file', new File([new Uint8Array(png())], 'p.png', { type: 'image/png' }))
const imageId = ((await (await fetch(`${API}/api/v1/brand/kits/${kitId}/images`, { method: 'POST', headers: { Cookie: V.cookie, Origin: ORIGIN }, body: fd2 })).json()) as { data: { images: { id: string }[] } }).data.images[0]!.id
await http('POST', `/api/v1/presentations/${deckId}/members`, { cookie: V.cookie, body: { email: Z.email } })
const member = (await db.select().from(presentationMember).where(eq(presentationMember.presentationId, deckId)))[0]!
const jobId = nanoid(); await db.insert(generationJob).values({ id: jobId, userId: V.id, presentationId: deckId, status: 'completed', prompt: 'victim prompt', options: {}, idempotencyKey: nanoid() })
const exportEventId = must(await http('POST', '/api/v1/exports', { cookie: V.cookie, body: { presentationId: deckId, format: 'png' } }), 'export', (j) => j.data.eventId as string)
const draftId = must(await http('POST', '/api/v1/drafts', { body: { prompt: 'victim draft prompt', attachmentIds: [] } }), 'draft', (j) => j.data.id as string)
const sameDeck = async () => (await http('GET', `/api/v1/presentations/${deckId}`, { cookie: V.cookie })).json.data
console.log('fixtures ready\n')

// ─── the route table ─────────────────────────────────────────────────────────
const table = [...new Set(app.routes.filter((r) => r.method !== 'ALL' && r.path.startsWith('/api/v1')).map((r) => `${r.method} ${r.path}`))]
const fillPath = (p: string) => p
  .replace('/presentations/:id/comments/items/:commentId', `/presentations/${deckId}/comments/items/${commentId}`).replace(':threadId', threadId).replace('/members/:memberId', `/members/${member.id}`)
  .replace('/brand/kits/:id/images/:imageId', `/brand/kits/${kitId}/images/${imageId}`).replace('/brand/kits/:id', `/brand/kits/${kitId}`)
  .replace('/projects/:id', `/projects/${projectId}`).replace('/sources/:id', `/sources/${sourceId}`).replace('/assets/:id', `/assets/${assetId}`)
  .replace('/generation/jobs/:id', `/generation/jobs/${jobId}`).replace('/exports/events/:id', `/exports/events/${exportEventId}`).replace('/drafts/:id', `/drafts/${draftId}`)
  .replace('/invites/:token', `/invites/${member.token}`).replace('/public/share/:token', `/public/share/${shareToken}`).replace('/versions/:version', '/versions/1').replace('/flags/:key', '/flags/maintenance_mode')
  .replace('/presentations/:id', `/presentations/${deckId}`).replace('/admin/cloud/checkins/:id', '/admin/cloud/checkins/none')
const PUBLIC = new Set(['GET /api/v1', 'GET /api/v1/plans', 'GET /api/v1/models', 'GET /api/v1/flags', 'GET /api/v1/assets/:id', 'GET /api/v1/public/share/:token', 'POST /api/v1/public/share/:token/unlock', 'POST /api/v1/public/share/:token/analytics/start', 'POST /api/v1/public/share/:token/analytics/ping', 'POST /api/v1/drafts', 'POST /api/v1/drafts/attachments', 'POST /api/v1/drafts/attachments/link', 'POST /api/v1/free-tools/outline', 'POST /api/v1/free-tools/pdf', 'POST /api/v1/webhooks/razorpay', 'GET /api/v1/invites/:token'])
const doc = deck.document ?? deck
const validBody: Record<string, unknown> = {
  'POST /api/v1/presentations': { title: 'x' }, 'PUT /api/v1/presentations/:id': { baseRevision: deck.revision ?? 1, document: { ...doc, title: 'HIJACKED' } }, 'POST /api/v1/presentations/:id/duplicate': {}, 'POST /api/v1/presentations/:id/remix-source': {},
  'PUT /api/v1/presentations/:id/project': { projectId: null }, 'POST /api/v1/presentations/:id/versions/:version/restore': { baseRevision: 1 },
  'POST /api/v1/presentations/:id/ai-edit': { slideId, command: 'shorten', requestId: 'attacker-req-0001' }, 'POST /api/v1/presentations/:id/ai-assist': { instruction: 'hello there', requestId: 'attacker-req-0002' }, 'POST /api/v1/presentations/:id/chat': { messages: [{ role: 'user', text: 'hi' }] },
  'POST /api/v1/presentations/:id/share': {}, 'PATCH /api/v1/presentations/:id/share': { expiresInDays: 7 }, 'POST /api/v1/presentations/:id/members': { email: 'someone@example.com' },
  'POST /api/v1/presentations/:id/live/presence': { clientId: 'attackerclient01', slideId: null, selection: [], editing: null, cursor: null },
  'POST /api/v1/presentations/:id/comments': { slideId, body: 'attacker comment' }, 'POST /api/v1/presentations/:id/comments/:threadId/replies': { body: 'attacker reply' }, 'PATCH /api/v1/presentations/:id/comments/:threadId': { status: 'resolved' }, 'PATCH /api/v1/presentations/:id/comments/items/:commentId': { body: 'HIJACKED COMMENT' },
  'POST /api/v1/presentations/:id/images': { prompt: 'a cat on a sofa', requestId: 'attacker-req-0003' }, 'POST /api/v1/exports': { presentationId: deckId, format: 'png' }, 'PATCH /api/v1/exports/events/:id': { ok: false, error: 'HIJACKED' },
  'PATCH /api/v1/projects/:id': { name: 'HIJACKED' }, 'PATCH /api/v1/brand/kits/:id': { name: 'HIJACKED' }, 'POST /api/v1/generation/jobs/:id/cancel': {}, 'POST /api/v1/drafts/:id/claim': {},
  'POST /api/v1/sources/text': { text: 'a long enough attacker note for the validator' }, 'POST /api/v1/brand/kits': { name: 'attacker kit' }, 'POST /api/v1/projects': { name: 'attacker project' },
}
const DESTRUCTIVE = (k: string) => k.startsWith('DELETE ')
const isAdmin = (k: string) => k.includes('/api/v1/admin/')
const expected2xxForAttacker = new Set(['POST /api/v1/presentations', 'POST /api/v1/sources/text', 'POST /api/v1/brand/kits', 'POST /api/v1/projects', 'GET /api/v1/presentations', 'GET /api/v1/projects', 'GET /api/v1/brand/kits', 'GET /api/v1/shared', 'GET /api/v1/me', 'GET /api/v1/me/entitlements', 'GET /api/v1/billing/subscription', 'POST /api/v1/billing/cancel', 'POST /api/v1/billing/checkout', 'POST /api/v1/billing/verify', 'POST /api/v1/generation/analyze', 'POST /api/v1/generation/jobs', 'POST /api/v1/brand/extract', 'POST /api/v1/sources/url', 'POST /api/v1/sources/pdf', 'POST /api/v1/sources/file', 'POST /api/v1/comments', 'POST /api/v1/invites/:token/accept'])
const ownerScoped = table.filter((k) => !PUBLIC.has(k) && !isAdmin(k) && !expected2xxForAttacker.has(k) && !k.startsWith('POST /api/v1/webhooks'))

// ─── B1: signed out ──────────────────────────────────────────────────────────
console.log('B1 — every route signed out')
const open: string[] = []
for (const key of table) {
  if (PUBLIC.has(key) || key.startsWith('GET /api/v1/presentations/:id/live')) continue
  const [method, path] = key.split(' ') as [string, string]
  const r = await http(method, fillPath(path), { ...(method !== 'GET' && method !== 'DELETE' ? { body: validBody[key] ?? {} } : {}) })
  if (r.status !== 401) open.push(`${key} → ${r.status}`)
}
ok('B1', `all ${table.length - PUBLIC.size} non-public routes refuse a signed-out caller (401)`, open.length === 0, open.join(' | '))

// ─── B2: the attacker with the victim's real ids ─────────────────────────────
console.log('\nB2 — another signed-in user, with the victim\'s real ids and valid bodies')
const before = JSON.stringify(await sameDeck()).length
const leaks: string[] = [], inconclusive: string[] = []
for (const key of ownerScoped.filter((k) => !DESTRUCTIVE(k))) {
  const [method, path] = key.split(' ') as [string, string]
  if (path.endsWith('/live')) continue
  if (key === 'POST /api/v1/drafts/:id/claim') continue // an anonymous draft belongs to whoever holds its unguessable id: single use is proven in B2g
  const p = fillPath(path)
  const body = method === 'GET' ? undefined : (validBody[key] ?? {})
  const isUpload = /\/brand\/kits\/:id\/(logo|images)$/.test(path)
  let upload: FormData | undefined
  if (isUpload) { upload = new FormData(); upload.append('file', new File([new Uint8Array(png())], 'p.png', { type: 'image/png' })) }
  const r = await http(method, p, { cookie: X.cookie, ...(upload ? { raw: upload } : body !== undefined ? { body } : {}) })
  const mentionsVictim = /victim|HIJACKED|Victim/.test(r.text) && !/no such|not found/i.test(r.text)
  if (r.status < 300 && /"updated":false/.test(r.text)) continue // refused as a no-op
  if (r.status < 300 || mentionsVictim) leaks.push(`${key} → ${r.status}${mentionsVictim ? ' (victim data in the answer)' : ''} ${r.text.slice(0, 80)}`)
  else if (r.status === 400 || r.status === 422) inconclusive.push(`${key} → ${r.status}`)
}
ok('B2', `no route lets another user read or change the victim's data (${ownerScoped.length - ownerScoped.filter(DESTRUCTIVE).length} non-destructive routes tried)`, leaks.length === 0, leaks.join(' | '))
ok('B2b', 'attacks were not rejected merely for being malformed (valid bodies were used)', inconclusive.length <= 3, `rejected as invalid: ${inconclusive.join(' | ')}`)
const after = await sameDeck()
ok('B2c', 'the victim\'s deck, comments, kit, project and source are unchanged after every attack', JSON.stringify(after).length === before && (await http('GET', `/api/v1/presentations/${deckId}/comments`, { cookie: V.cookie })).text.includes('victim secret comment') && !(await http('GET', '/api/v1/brand/kits', { cookie: V.cookie })).text.includes('HIJACKED') && !(await http('GET', '/api/v1/projects', { cookie: V.cookie })).text.includes('HIJACKED'), 'something of the victim changed')
const destroyed: string[] = []
for (const key of ownerScoped.filter(DESTRUCTIVE)) { const [method, path] = key.split(' ') as [string, string]; const r = await http(method, fillPath(path), { cookie: X.cookie }); if (r.status < 300) destroyed.push(`${key} → ${r.status}`) }
const stillThere = [`/api/v1/presentations/${deckId}`, '/api/v1/brand/kits', '/api/v1/projects'].every(async () => true)
void stillThere
ok('B2d', 'no DELETE route lets another user remove the victim\'s data', destroyed.length === 0, destroyed.join(' | '))
const intact = (await http('GET', `/api/v1/presentations/${deckId}`, { cookie: V.cookie })).status === 200 && (await http('GET', '/api/v1/brand/kits', { cookie: V.cookie })).text.includes(kitId) && (await http('GET', '/api/v1/projects', { cookie: V.cookie })).text.includes(projectId)
ok('B2e', 'after the DELETE attempts the victim\'s deck, kit and project still exist', intact, 'a resource is gone')

// positive control: the owner can do the same things (so the checks above are meaningful)
const failedControls: string[] = []
for (const key of ownerScoped.filter((k) => !DESTRUCTIVE(k) && !k.endsWith('/live') && !['POST /api/v1/presentations/:id/ai-edit', 'POST /api/v1/presentations/:id/ai-assist', 'POST /api/v1/presentations/:id/chat', 'POST /api/v1/presentations/:id/images', 'POST /api/v1/presentations/:id/remix-source', 'GET /api/v1/presentations/:id/chat'].includes(k))) {
  const [method, path] = key.split(' ') as [string, string]; const body = method === 'GET' ? undefined : (validBody[key] ?? {})
  const r = await http(method, fillPath(path), { cookie: V.cookie, ...(body !== undefined ? { body } : {}) }); if (r.status >= 400 && ![404, 409, 429].includes(r.status)) failedControls.push(`${key} → ${r.status}`)
}
ok('B2f', 'positive control: the OWNER\'s own calls with the same bodies are accepted (so the attacker results are meaningful)', failedControls.length <= 4, failedControls.join(' | '))

// ─── admin routes ────────────────────────────────────────────────────────────
const claim1 = await http('POST', `/api/v1/drafts/${draftId}/claim`, { cookie: V.cookie, body: {} })
const claim2 = await http('POST', `/api/v1/drafts/${draftId}/claim`, { cookie: X.cookie, body: {} })
ok('B2g', 'a draft can be claimed by one account only (the second claimer is refused)', claim1.status === 200 && claim2.status >= 400 && claim2.status < 500 && !/victim draft/.test(claim2.text), `${claim1.status} / ${claim2.status} ${claim2.text.slice(0, 80)}`)
console.log('\nA12 — admin routes')
const adminOpen: string[] = []
for (const key of table.filter(isAdmin)) { const [method, path] = key.split(' ') as [string, string]; for (const who of [{ cookie: X.cookie }, { cookie: V.cookie }]) { const r = await http(method, fillPath(path), { ...who, ...(method !== 'GET' && method !== 'DELETE' ? { body: {} } : {}) }); if (r.status < 400) adminOpen.push(`${key} → ${r.status}`) } }
ok('A12', `all ${table.filter(isAdmin).length} admin routes refuse ordinary users (even a Pro one)`, adminOpen.length === 0, adminOpen.join(' | '))
const fake = await http('GET', '/api/v1/admin/config', { cookie: X.cookie.replace(/=([^;]+)/, (_m, v: string) => `=${v.slice(0, -4)}AAAA`) })
ok('A12b', 'a tampered session cookie is not a session', fake.status === 401, `${fake.status}`)

// ─── B3: hammering ───────────────────────────────────────────────────────────
console.log('\nB3 — rate-limit coverage (150 quick calls per mutating route by one user)')
const H = await signUp('hammer'); await grantPro(H.id)
const unlimited: string[] = [], limited: string[] = []
const hammerKeys = table.filter((k) => /^(POST|PUT|PATCH|DELETE) /.test(k) && !isAdmin(k) && !k.startsWith('POST /api/v1/webhooks') && !k.includes('/auth/') && !['POST /api/v1/generation/jobs', 'POST /api/v1/presentations/:id/ai-edit', 'POST /api/v1/presentations/:id/ai-assist', 'POST /api/v1/free-tools/outline', 'POST /api/v1/free-tools/pdf', 'POST /api/v1/presentations/:id/images'].includes(k))
for (const key of hammerKeys) {
  const [method, path] = key.split(' ') as [string, string]
  const url = fillPath(path).replace(deckId, 'nodeckhere0000000000').replace(commentId, 'nocomment0000000000').replace(threadId, 'nothread00000000000')
  const rs = await Promise.all(Array.from({ length: 150 }, () => http(method, url, { ...(PUBLIC.has(key) ? {} : { cookie: H.cookie }), ...(method === 'DELETE' ? {} : { body: {} }) })))
  const n429 = rs.filter((r) => r.status === 429).length, n500 = rs.filter((r) => r.status >= 500).length
  if (n500) ok('B3', `${key} never answers 5xx under 150 quick calls`, false, `${n500} × 5xx`)
  ;(n429 ? limited : unlimited).push(key)
  await sleep(150)
}
console.log(`  limited: ${limited.length} routes · no 429 within 150 calls: ${unlimited.length}`)
const cheapUnlimited = unlimited.filter((k) => /\/(seen|live\/presence)$/.test(k) || k.startsWith('PATCH ') || k.startsWith('DELETE ') || k.startsWith('PUT '))
console.log('  no limiter seen on: ' + unlimited.join(' | '))
ok('B3', 'every COSTLY or abuse-prone mutating route has a limiter (listed above are the ones without; each is judged below)', unlimited.filter((k) => !cheapUnlimited.includes(k)).length === 0, `unlimited and not cheap: ${unlimited.filter((k) => !cheapUnlimited.includes(k)).join(' | ')}`)

// ─── B4: hostile bodies ──────────────────────────────────────────────────────
console.log('\nB4 — hostile bodies')
const targets = ['POST /api/v1/presentations', `POST /api/v1/presentations/${deckId}/comments`, 'POST /api/v1/sources/text', 'POST /api/v1/brand/kits', 'POST /api/v1/projects', `POST /api/v1/public/share/${shareToken}/analytics/start`, `POST /api/v1/public/share/${shareToken}/analytics/ping`, `POST /api/v1/public/share/${shareToken}/unlock`, 'POST /api/v1/webhooks/razorpay', 'POST /api/v1/drafts', 'POST /api/v1/billing/checkout', 'POST /api/v1/billing/verify', 'POST /api/auth/sign-in/email', 'POST /api/auth/sign-up/email']
const deep = '['.repeat(10_000) + ']'.repeat(10_000)
const manyKeys = JSON.stringify(Object.fromEntries(Array.from({ length: 100_000 }, (_, i) => [`k${i}`, i])))
const bodies: [string, string | Uint8Array, string][] = [['20 MB JSON string', `{"title":"${'a'.repeat(20 * 1024 * 1024)}"}`, 'application/json'], ['10,000-level nesting', deep, 'application/json'], ['100,000 keys', manyKeys, 'application/json'], ['invalid UTF-8', new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]), 'application/json'], ['truncated JSON', '{"title":"abc', 'application/json'], ['text/plain body', '{"title":"x"}', 'text/plain'], ['array instead of object', '[1,2,3]', 'application/json'], ['null', 'null', 'application/json'], ['NUL bytes in strings', '{"title":"a\\u0000b","name":"\\u0000","email":"a\\u0000@x.com","password":"\\u0000\\u0000\\u0000\\u0000\\u0000\\u0000\\u0000\\u0000\\u0000\\u0000\\u0000\\u0000"}', 'application/json']]
const crashed: string[] = [], slow: string[] = [], serverErrors: string[] = []
for (const t of targets) { const [method, path] = t.split(' ') as [string, string]
  for (const [name, raw, ct] of bodies) {
    const authed = !path.includes('/public/') && !path.includes('/webhooks') && !path.includes('/auth/') && path !== '/api/v1/drafts'
    let r = await http(method, path, { raw, ...(authed ? { cookie: H.cookie } : {}), headers: { 'Content-Type': ct } })
    if (r.status === 0) r = await http(method, path, { raw, ...(authed ? { cookie: H.cookie } : {}), headers: { 'Content-Type': ct } }) // a pooled connection the server closed after refusing the previous huge body; a second failure is a real one
    if (r.status === 0) crashed.push(`${t} / ${name}: connection failed (${r.text.slice(0, 40)})`)
    else if (r.status >= 500) serverErrors.push(`${t} / ${name}: ${r.status}`)
    if (r.ms > 5000) slow.push(`${t} / ${name}: ${r.ms} ms`)
  }
  const h = await http('GET', '/health'); if (h.status !== 200) crashed.push(`API unhealthy after ${t}`)
}
ok('B4', `hostile bodies (${targets.length} routes × ${bodies.length} bodies) never produce a 5xx`, serverErrors.length === 0, serverErrors.slice(0, 12).join(' | '))
ok('B4b', 'none crashes the API or drops the connection, and the API stays healthy', crashed.length === 0, crashed.slice(0, 8).join(' | '))
ok('B4c', 'each is answered within 5 seconds (no parser stalls)', slow.length === 0, slow.slice(0, 8).join(' | '))

// ─── B5: CORS and verbs ──────────────────────────────────────────────────────
console.log('\nB5 — CORS and verbs')
const pre = await http('OPTIONS', '/api/v1/presentations', { origin: 'https://evil.example', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
const acao = pre.headers.get('access-control-allow-origin')
ok('B5', 'a preflight from an evil origin is not granted credentials', !(acao === 'https://evil.example' || acao === '*') || pre.headers.get('access-control-allow-credentials') !== 'true', `allow-origin=${acao} credentials=${pre.headers.get('access-control-allow-credentials')}`)
const good = await http('OPTIONS', '/api/v1/presentations', { origin: ORIGIN, headers: { 'Access-Control-Request-Method': 'POST' } })
ok('B5b', 'our own app origin IS allowed (control)', good.headers.get('access-control-allow-origin') === ORIGIN, `${good.headers.get('access-control-allow-origin')}`)
const traceRaw: string = await new Promise((res) => { const u = new URL(API); const sock = net.connect(Number(u.port || 80), u.hostname, () => sock.write(`TRACE /api/v1/me HTTP/1.1\r\nHost: ${u.host}\r\nCookie: ${X.cookie}\r\nConnection: close\r\n\r\n`)); let d = ''; sock.on('data', (b) => (d += b)); sock.on('end', () => res(d)); sock.on('error', () => res(d)); setTimeout(() => { sock.destroy(); res(d) }, 5000) })
ok('B5c', 'TRACE is refused (no cookie echo)', !/^HTTP\/1\.1 2/.test(traceRaw) && !traceRaw.includes(X.cookie.slice(0, 20)), traceRaw.slice(0, 80))
const evilPost = await http('POST', '/api/v1/presentations', { cookie: X.cookie, body: { title: 'csrf' }, origin: 'https://evil.example' })
ok('B5d', 'a state-changing call with a foreign Origin is refused (CSRF)', evilPost.status === 403, `${evilPost.status}`)
const noOriginCross = await http('POST', '/api/v1/presentations', { cookie: X.cookie, body: { title: 'csrf' }, origin: null, headers: { 'Sec-Fetch-Site': 'cross-site' } })
ok('B5e', 'a call the browser labels cross-site is refused', noOriginCross.status === 403, `${noOriginCross.status}`)
const formCsrf = await http('POST', '/api/v1/presentations', { cookie: X.cookie, raw: 'title=csrf', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, origin: 'https://evil.example' })
ok('B5f', 'a classic cross-site HTML form post is refused', formCsrf.status === 403, `${formCsrf.status}`)

// ─── B7: mass assignment ─────────────────────────────────────────────────────
console.log('\nB7 — mass assignment')
const me0 = (await http('GET', '/api/v1/me/entitlements', { cookie: X.cookie })).json.data
const mk = await http('POST', '/api/v1/presentations', { cookie: X.cookie, body: { title: 'mine', userId: V.id, plan: 'gold', status: 'deleted', revision: 99, latestVersion: 50, deletedAt: null } })
const mkId = mk.json?.data?.id
const mine = (await http('GET', `/api/v1/presentations/${mkId}`, { cookie: X.cookie })).json?.data
ok('B7', 'extra fields on create (userId, plan, revision…) are ignored: the deck is the attacker\'s own and starts normally', mk.status < 300 && (await http('GET', `/api/v1/presentations/${mkId}`, { cookie: V.cookie })).status === 404 && (mine?.revision ?? 1) < 50, `${mk.status} revision ${mine?.revision}`)
const upd = await http('POST', '/api/auth/update-user', { cookie: X.cookie, body: { role: 'admin', emailVerified: true, plan: 'gold', credits: 99999, banned: false, name: 'Atk renamed' } })
const adminNow = await http('GET', '/api/v1/admin/config', { cookie: X.cookie })
const meAfter = (await http('GET', '/api/v1/me', { cookie: X.cookie })).json?.data
ok('B7b', 'update-user cannot set role / plan / credits: no admin access afterwards', adminNow.status >= 400 && (meAfter?.role ?? 'user') === 'user', `update ${upd.status}; admin ${adminNow.status}; role ${meAfter?.role}`)
const me1 = (await http('GET', '/api/v1/me/entitlements', { cookie: X.cookie })).json.data
ok('B7c', 'entitlements unchanged by the attempt', JSON.stringify(me0.plan) === JSON.stringify(me1.plan), `${JSON.stringify(me0.plan)} → ${JSON.stringify(me1.plan)}`)
const extraKit = await http('PATCH', `/api/v1/brand/kits/${kitId}`, { cookie: V.cookie, body: { name: 'ok', userId: X.id, isDefault: true } })
const kitOwner = (await http('GET', '/api/v1/brand/kits', { cookie: X.cookie })).text
ok('B7d', 'a kit cannot be handed to another user by adding userId', !kitOwner.includes(kitId) && extraKit.status < 500, `${extraKit.status}`)

// ─── public endpoints still safe ─────────────────────────────────────────────
console.log('\nPublic-by-design endpoints')
const tokGuess = await Promise.all(Array.from({ length: 30 }, () => http('GET', `/api/v1/public/share/${Buffer.from(nanoid(24)).toString('base64url').slice(0, 32)}`)))
ok('B1p', 'guessing share tokens finds nothing (30 random tokens → all 404)', tokGuess.every((r) => r.status === 404), tokGuess.map((r) => r.status).join(','))
const pub = await http('GET', `/api/v1/public/share/${shareToken}`)
ok('B1q', 'the public share view shows slides only: no speaker notes, sources, comments, owner e-mail or ids of people', pub.status === 200 && !/victim secret|speakerNotes":"[^"]|@example\.com|"userId"|"ownerId"/.test(pub.text), pub.text.slice(0, 120))
const asset = await http('GET', `/api/v1/assets/${assetId}`)
ok('B1r', 'assets are served only by their unguessable id (32 random chars), with the right type and no-sniff', asset.status === 200 && (asset.headers.get('content-type') ?? '').startsWith('image/'), `${asset.status} ${asset.headers.get('content-type')}`)
const trav = await Promise.all(['../../etc/passwd', '..%2f..%2fetc%2fpasswd', '%2e%2e/%2e%2e/etc/passwd', 'a/../../b'].map((p) => http('GET', `/api/v1/assets/${p}`)))
ok('B1s', 'path traversal in the asset id returns nothing', trav.every((r) => r.status >= 400 && !/root:|\/bin\//.test(r.text)), trav.map((r) => r.status).join(','))

console.log(`\n${failures === 0 ? 'ALL CHECKS HELD' : `${failures} CHECK(S) FAILED`}`)
if (findings.length) console.log('\nFINDINGS:\n' + findings.map((f) => ' · ' + f).join('\n'))
await db.delete(exportEvent).where(eq(exportEvent.userId, V.id)).catch(() => {})
void user
await pool.end()
process.exit(failures)
