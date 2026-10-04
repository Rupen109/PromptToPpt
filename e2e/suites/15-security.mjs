import { API, EDITOR, WEB, expect, suite } from '../lib.mjs'

/**
 * Attacks against the RUNNING stack (web :3000, editor :3001, API :4000): the same scenarios as services/api/src/security/*.test.ts but over real HTTP,
 * so headers, proxies and middleware order are exercised too. Nothing here needs a browser.
 */
export default async function () {
  const s = suite('15-security')
  const origin = WEB
  const rid = () => Math.random().toString(36).slice(2, 10)
  // After the server answers 413 early it closes the connection while the client may still be sending: the next request on that pooled socket can fail once. Retry transport errors only.
  const send = async (url, init) => { try { return await fetch(url, init) } catch (e) { if (!(e instanceof TypeError)) throw e; return fetch(url, init) } }
  const post = (url, body, headers = {}) => send(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const signUp = async (prefix = 'sec') => {
    const email = `${prefix}-${rid()}@example.com`
    const res = await post(`${API}/api/auth/sign-up/email`, { email, password: 'a-long-password-1', name: 'Sec' })
    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    return { email, cookie, status: res.status }
  }
  const api = (cookie, method, path, body, headers = {}) => send(`${API}/api/v1${path}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })

  await s.check('headers: website, editor and API send CSP, frame-ancestors none, nosniff', null, async () => {
    for (const url of [WEB + '/', EDITOR + '/', API + '/health']) {
      const h = (await fetch(url)).headers
      expect(h.get('x-content-type-options') === 'nosniff', `${url}: no nosniff`)
      if (!url.startsWith(API)) {
        expect(/frame-ancestors 'none'/.test(h.get('content-security-policy') ?? ''), `${url}: no frame-ancestors`)
        expect(h.get('x-frame-options') === 'DENY', `${url}: no X-Frame-Options`)
        expect(/object-src 'none'/.test(h.get('content-security-policy') ?? ''), `${url}: object-src`)
      }
    }
  })

  await s.check('anonymous: every costly endpoint answers 401', null, async () => {
    for (const [m, p, b] of [['POST', '/generation/analyze', { prompt: 'x'.repeat(30), sourceIds: [] }], ['POST', '/generation/jobs', { prompt: 'x'.repeat(30), idempotencyKey: rid() + rid() }], ['POST', '/presentations', {}], ['POST', '/exports', { presentationId: 'x', format: 'pptx' }], ['POST', '/sources/text', { text: 'x'.repeat(40) }], ['GET', '/presentations'], ['GET', '/me/entitlements']]) {
      const r = await api('', m, p, b)
      expect(r.status === 401, `${m} ${p} → ${r.status}`)
    }
  })

  await s.check('there is no way to change your own plan (dev/set-plan is gone)', null, async () => {
    const u = await signUp()
    expect(u.status === 200, `sign-up ${u.status}`)
    for (const planId of ['pro', 'gold']) expect((await api(u.cookie, 'POST', '/dev/set-plan', { planId })).status === 404, 'set-plan reachable')
    const ent = await (await api(u.cookie, 'GET', '/me/entitlements')).json()
    expect(ent.data.plan.id === 'starter', 'plan changed')
  })

  await s.check('cross-site writes are refused (foreign Origin / Sec-Fetch-Site)', null, async () => {
    const u = await signUp()
    expect((await api(u.cookie, 'POST', '/presentations', {}, { Origin: 'https://evil.example' })).status === 403, 'evil origin accepted')
    expect((await api(u.cookie, 'POST', '/presentations', {}, { 'Sec-Fetch-Site': 'cross-site' })).status === 403, 'cross-site accepted')
    expect((await post(`${API}/api/auth/sign-out`, {}, { Origin: 'https://evil.example', Cookie: u.cookie })).status === 403, 'auth endpoint accepted evil origin')
  })

  await s.check('IDOR: another account cannot read, change, export or delete my deck / job / source', null, async () => {
    const a = await signUp(), b = await signUp()
    const mine = await (await api(a.cookie, 'POST', '/presentations', {})).json()
    expect(mine.success, 'create failed')
    const id = mine.data.id
    expect((await api(b.cookie, 'GET', `/presentations/${id}`)).status === 404, 'read')
    expect((await api(b.cookie, 'PUT', `/presentations/${id}`, { baseRevision: 1, document: {} })).status >= 400, 'write')
    expect((await api(b.cookie, 'DELETE', `/presentations/${id}`)).status === 404, 'delete')
    expect((await api(b.cookie, 'GET', `/presentations/${id}/versions`)).status === 404, 'versions')
    expect((await api(b.cookie, 'GET', `/presentations/${id}/chat`)).status === 404, 'chat')
    expect((await api(b.cookie, 'GET', '/generation/jobs/does-not-exist')).status === 404, 'job')
    const src = await (await api(a.cookie, 'POST', '/sources/text', { title: 't', text: 'Private notes about the quarter, long enough to be accepted by the parser.' })).json()
    if (src.success) expect((await api(b.cookie, 'DELETE', `/sources/${src.data.id}`)).status === 404, 'source delete')
  })

  await s.check('SSRF: internal / metadata / obfuscated URLs are refused when adding a source', null, async () => {
    const u = await signUp()
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://[::ffff:a9fe:a9fe]/', 'http://[::ffff:7f00:1]/', 'http://localhost:4000/health', 'http://127.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'file:///etc/passwd', 'http://metadata.google.internal/']) {
      const r = await api(u.cookie, 'POST', '/sources/url', { url })
      expect(r.status >= 400 && r.status < 500, `${url} → ${r.status}`)
    }
  })

  await s.check('stored XSS: javascript: links and data: backgrounds cannot be saved in a deck', null, async () => {
    const u = await signUp()
    const mk = await (await api(u.cookie, 'POST', '/presentations', {})).json()
    const got = await (await api(u.cookie, 'GET', `/presentations/${mk.data.id}`)).json()
    const doc = got.data.document
    const el = { type: 'text', id: 'x1', x: 10, y: 10, width: 400, height: 80, rotation: 0, locked: false, zIndex: 1, opacity: 1, role: 'body', paragraphs: [{ runs: [{ text: 'click', link: 'javascript:alert(1)' }] }], fontSize: 30, align: 'left', color: 'textPrimary', valign: 'top', bullet: '•' }
    const bad1 = structuredClone(doc); bad1.slides[0].elements.push(el)
    expect((await api(u.cookie, 'PUT', `/presentations/${mk.data.id}`, { baseRevision: got.data.revision, document: bad1 })).status === 400, 'javascript: link accepted')
    const bad2 = structuredClone(doc); bad2.slides[0].background = { type: 'image', value: 'javascript:alert(1)' }
    expect((await api(u.cookie, 'PUT', `/presentations/${mk.data.id}`, { baseRevision: got.data.revision, document: bad2 })).status === 400, 'javascript: background accepted')
  })

  await s.check('body limits: 1 MB JSON to a normal endpoint → 413; 100 KB sign-up → 413', null, async () => {
    const u = await signUp()
    expect((await api(u.cookie, 'POST', '/generation/analyze', { prompt: 'x'.repeat(1_000_000), sourceIds: [] })).status === 413, 'big json')
    expect((await post(`${API}/api/auth/sign-up/email`, { email: `a-${rid()}@example.com`, password: 'x'.repeat(100_000), name: 'x' })).status === 413, 'big signup')
  })

  await s.check('sign-up abuse: disposable domains and gmail aliases are refused', null, async () => {
    const r1 = await post(`${API}/api/auth/sign-up/email`, { email: `x${rid()}@mailinator.com`, password: 'a-long-password-1', name: 'x' })
    expect(r1.status === 422, `disposable → ${r1.status}`)
    const base = `e2e${rid()}${rid()}`
    expect((await post(`${API}/api/auth/sign-up/email`, { email: `${base}@gmail.com`, password: 'a-long-password-1', name: 'x' })).status === 200, 'first gmail')
    const alias = await post(`${API}/api/auth/sign-up/email`, { email: `${base}+farm@gmail.com`, password: 'a-long-password-1', name: 'x' })
    expect(alias.status === 422, `alias → ${alias.status}`)
  })

  await s.check('credential stuffing: 5 wrong passwords lock the account for everyone (429), correct password included', null, async () => {
    const u = await signUp('lock')
    for (let i = 0; i < 5; i++) {
      const r = await post(`${API}/api/auth/sign-in/email`, { email: u.email, password: `wrong-pass-${i}-xx` })
      expect(r.status === 401, `attempt ${i} → ${r.status}`)
    }
    const locked = await post(`${API}/api/auth/sign-in/email`, { email: u.email, password: 'a-long-password-1' })
    expect(locked.status === 429, `locked → ${locked.status}`)
    expect(Number(locked.headers.get('retry-after')) > 0, 'no Retry-After')
  })

  await s.check('payments: unsigned / forged webhooks are rejected; oversized ones too', null, async () => {
    const r = await post(`${API}/api/v1/webhooks/razorpay`, { event: 'subscription.activated', payload: {} }, { 'X-Razorpay-Signature': 'forged' })
    expect(r.status === 401 || r.status === 503, `forged → ${r.status}`)
    expect((await post(`${API}/api/v1/webhooks/razorpay`, JSON.stringify({ pad: 'a'.repeat(300_000) }), { 'X-Razorpay-Signature': 'x' })).status === 413, 'oversized webhook')
  })

  await s.check('plan gates: Starter cannot export, create projects, or use a Pro-only template', null, async () => {
    const u = await signUp()
    const mk = await (await api(u.cookie, 'POST', '/presentations', {})).json()
    for (const format of ['pptx', 'pdf', 'png', 'jpg', 'html']) expect((await api(u.cookie, 'POST', '/exports', { presentationId: mk.data.id, format })).status === 403, `${format} export allowed`)
    expect((await api(u.cookie, 'POST', '/projects', { name: 'x' })).status === 403, 'project allowed')
    const r = await api(u.cookie, 'POST', '/presentations', { templateId: 'strategy-merger-plan' })
    expect(r.status === 403, `premium template → ${r.status}`)
  })

  return s.done()
}
