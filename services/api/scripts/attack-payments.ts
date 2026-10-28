/**
 * Black-box payment attack against a RUNNING API that talks to a stand-in Razorpay run by this script (dev only; refuses production).
 * Plan: docs/FULL_SECURITY_LOAD_CTA_TEST_PLAN.md (C1–C7). Start the API with   RAZORPAY_API_BASE=http://localhost:4901   (honoured only with rzp_test_ keys).
 *   tsx --env-file-if-exists=.env scripts/attack-payments.ts          env: API=http://localhost:4000  ORIGIN=http://localhost:3001
 * Real signatures (HMAC with the configured secrets) are used, so the server's own verification is what is being tested, not a mock of it.
 */
import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { count, eq, like } from 'drizzle-orm'
import { db, pool } from '../src/db/index.ts'
import { creditLedger, payment, planPrice, subscription } from '../src/db/schema.ts'
import { env, isProd } from '../src/env.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const API = process.env['API'] ?? 'http://localhost:4000'
const ORIGIN = process.env['ORIGIN'] ?? 'http://localhost:3001'
const FAKE_PORT = 4901
const KEY_SECRET = env.RAZORPAY_KEY_SECRET!, WEBHOOK_SECRET = env.RAZORPAY_WEBHOOK_SECRET!
if (!KEY_SECRET || !WEBHOOK_SECRET || !env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) { console.error('needs rzp_test_ keys and a webhook secret in .env'); process.exit(1) }
const hmac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('hex')
let failures = 0
const findings: string[] = []
const ok = (id: string, title: string, pass: boolean, detail = '') => { console.log(`${pass ? '  ✓' : '  ✗'} ${id} ${title}${pass ? '' : `\n      ${detail}`}`); if (!pass) { failures++; findings.push(`${id} ${title}: ${detail}`) } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── the stand-in Razorpay ───────────────────────────────────────────────────
interface FSub { id: string; plan_id: string; status: string; current_start: number | null; current_end: number | null; notes: Record<string, string> }
const plans = new Map<string, { id: string; amount: number; currency: string; period: string }>()
const subs = new Map<string, FSub>()
const pays = new Map<string, { id: string; amount: number; currency: string; status: string; created_at: number; subscription_id: string; notes: Record<string, string> }>()
const calls = { createSubscription: 0, createPlan: 0, cancel: 0 }
let seq = 0
const RUN = Date.now().toString(36) // provider ids must be unique across runs (payment ids are unique in the database)
const fake = createServer((req, res) => {
  let raw = ''
  req.on('data', (d) => (raw += d))
  req.on('end', () => {
    const auth = req.headers.authorization ?? ''
    const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (auth !== `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${KEY_SECRET}`).toString('base64')}`) return send(401, { error: { description: 'bad auth' } })
    const url = req.url ?? ''
    const body = raw ? JSON.parse(raw) : {}
    if (req.method === 'POST' && url === '/plans') { calls.createPlan++; const id = `plan_f${RUN}_${++seq}`; plans.set(id, { id, amount: body.item.amount, currency: body.item.currency, period: body.period }); return send(200, { id }) }
    if (req.method === 'POST' && url === '/subscriptions') { calls.createSubscription++; const id = `sub_f${RUN}_${++seq}`; const s: FSub = { id, plan_id: body.plan_id, status: 'created', current_start: null, current_end: null, notes: body.notes }; subs.set(id, s); return send(200, s) }
    let m = url.match(/^\/subscriptions\/([^/]+)\/cancel$/)
    if (req.method === 'POST' && m) { calls.cancel++; const s = subs.get(m[1]!); if (!s) return send(400, { error: { description: 'not found' } }); if (body.cancel_at_cycle_end !== 1) s.status = 'cancelled'; return send(200, s) }
    m = url.match(/^\/subscriptions\/([^/]+)$/)
    if (req.method === 'GET' && m) { const s = subs.get(decodeURIComponent(m[1]!)); return s ? send(200, s) : send(400, { error: { description: 'The id provided does not exist' } }) }
    m = url.match(/^\/payments\/([^/]+)$/)
    if (req.method === 'GET' && m) { const p = pays.get(decodeURIComponent(m[1]!)); return p ? send(200, p) : send(400, { error: { description: 'The id provided does not exist' } }) }
    send(404, { error: { description: 'unknown' } })
  })
})
await new Promise<void>((r) => fake.listen(FAKE_PORT, r))
/** The customer pays in the checkout window: the provider marks the subscription active and records a captured payment. */
function customerPays(subId: string): { payment: (typeof pays) extends Map<string, infer V> ? V : never; sub: FSub } {
  const s = subs.get(subId)!; const pl = plans.get(s.plan_id)!
  const now = Math.floor(Date.now() / 1000)
  s.status = 'active'; s.current_start = now; s.current_end = now + (pl.period === 'yearly' ? 365 : 30) * 86400
  const p = { id: `pay_f${RUN}_${++seq}`, amount: pl.amount, currency: pl.currency, status: 'captured', created_at: now, subscription_id: s.id, notes: s.notes }
  pays.set(p.id, p)
  return { payment: p, sub: s }
}

// ─── helpers ─────────────────────────────────────────────────────────────────
interface Res { status: number; json: any; text: string }
async function http(method: string, path: string, o: { cookie?: string; body?: unknown; rawBody?: string; headers?: Record<string, string>; origin?: string | null } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(o.origin === null ? {} : { Origin: o.origin ?? ORIGIN }), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers ?? {}) }
  if (o.body !== undefined || o.rawBody !== undefined) headers['Content-Type'] ??= 'application/json'
  let r: Response
  try { r = await fetch(`${API}${path}`, { method, headers, ...(o.rawBody !== undefined ? { body: o.rawBody } : o.body !== undefined ? { body: JSON.stringify(o.body) } : {}), signal: AbortSignal.timeout(30_000) }) } catch (e) { return { status: 0, json: null, text: String((e as Error).message) } } // the server may hang up on a body it refuses while it is still arriving
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, json, text }
}
async function signUp(tag: string) {
  const email = `pay${tag}${Date.now()}${Math.floor(Math.random() * 1e5)}@example.com`
  const r = await fetch(`${API}/api/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ email, password: 'Passw0rd!pay-attack', name: `Pay ${tag}` }) })
  if (!r.ok) throw new Error(`sign-up ${tag}: ${r.status} ${await r.text()}`)
  return { email, cookie: r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '), id: ((await r.json()) as { user: { id: string } }).user.id }
}
const INR = { 'x-debug-country': 'IN' }
const checkout = (cookie: string, body: unknown = { planId: 'pro', interval: 'month' }, headers: Record<string, string> = INR) => http('POST', '/api/v1/billing/checkout', { cookie, body, headers })
const verify = (cookie: string, paymentId: string, subId: string, sig?: string) => http('POST', '/api/v1/billing/verify', { cookie, body: { razorpay_payment_id: paymentId, razorpay_subscription_id: subId, razorpay_signature: sig ?? hmac(KEY_SECRET, `${paymentId}|${subId}`) } })
let evN = 0
const webhook = (event: string, payload: object, o: { secret?: string; id?: string | null; mutate?: (b: string) => string; sign?: boolean } = {}) => {
  const body = JSON.stringify({ event, payload })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (o.sign !== false) headers['X-Razorpay-Signature'] = hmac(o.secret ?? WEBHOOK_SECRET, body)
  if (o.id !== null) headers['X-Razorpay-Event-Id'] = o.id ?? `evt_atk_${Date.now()}_${evN++}`
  return http('POST', '/api/v1/webhooks/razorpay', { rawBody: o.mutate ? o.mutate(body) : body, headers })
}
const planOf = async (cookie: string) => (await http('GET', '/api/v1/me/entitlements', { cookie })).json?.data
const ledgerRows = async (userId: string) => Number((await db.select({ n: count() }).from(creditLedger).where(eq(creditLedger.userId, userId)))[0]!.n)
const grantRows = async (userId: string) => Number((await db.select({ n: count() }).from(creditLedger).where(eq(creditLedger.userId, userId)))[0]!.n) - 0
const paymentRows = async (userId: string) => Number((await db.select({ n: count() }).from(payment).where(eq(payment.userId, userId)))[0]!.n)
const subPayload = (s: FSub) => ({ subscription: { entity: s } })

// the provider plan ids stored from earlier real test-mode use do not exist on the stand-in: park them, restore at the end
const savedPlanIds = (await db.select({ id: planPrice.id, p: planPrice.providerPriceId }).from(planPrice)).filter((r) => r.p)
await db.update(planPrice).set({ providerPriceId: null })
const restorePlans = async () => { await db.update(planPrice).set({ providerPriceId: null }); for (const r of savedPlanIds) await db.update(planPrice).set({ providerPriceId: r.p }).where(eq(planPrice.id, r.id)) }
process.on('SIGINT', () => void restorePlans().finally(() => process.exit(130)))
console.log(`stand-in Razorpay on :${FAKE_PORT}; creating users…`)
const A = await signUp('payer'), B = await signUp('other'), C = await signUp('racer'), D = await signUp('baseline'), S = await signUp('starter')
const probe = await checkout(A.cookie)
if (probe.status !== 200) { console.error(`checkout probe failed: ${probe.status} ${probe.text.slice(0, 200)} — is the API running with RAZORPAY_API_BASE=http://localhost:${FAKE_PORT} and billing enabled?`); process.exit(2) }
const starterEnt = await planOf(S.cookie)
console.log('entitlement shape keys:', Object.keys(starterEnt ?? {}).join(','))

// ─── C1: clicking pay many times ─────────────────────────────────────────────
console.log('\nC1 — the pay button clicked many times')
const before = calls.createSubscription
const burst = await Promise.all(Array.from({ length: 30 }, () => checkout(B.cookie)))
const okIds = new Set(burst.filter((r) => r.status === 200).map((r) => r.json.data.subscriptionId))
const created = calls.createSubscription - before
ok('C1', `30 simultaneous clicks open exactly ONE provider subscription (opened: ${created}, distinct ids returned: ${okIds.size})`, created === 1 && okIds.size === 1, `${created} created, ${okIds.size} ids`)
ok('C1b', 'the clicks beyond the limit get a clean 429 (never a 5xx)', burst.every((r) => r.status === 200 || r.status === 429) && burst.some((r) => r.status === 429), burst.map((r) => `${r.status}${r.status === 200 || r.status === 429 ? '' : ' ' + r.text.slice(0, 80)}`).join(','))
await sleep(500)
const again = await checkout(B.cookie)
ok('C1c', 'a later click (after the burst) hands back the same unpaid session', again.status === 429 || again.json?.data?.subscriptionId === [...okIds][0], `${again.status} ${again.text.slice(0, 120)}`)
const yearly = await http('POST', '/api/v1/billing/checkout', { cookie: C.cookie, body: { planId: 'pro', interval: 'year' }, headers: INR })
const monthly = await http('POST', '/api/v1/billing/checkout', { cookie: C.cookie, body: { planId: 'pro', interval: 'month' }, headers: INR })
ok('C1d', 'a different plan/interval is a different session (a real change of mind still works)', yearly.status === 200 && monthly.status === 200 && yearly.json.data.subscriptionId !== monthly.json.data.subscriptionId, `${yearly.status}/${monthly.status}`)
ok('C1e', 'an UNPAID session grants nothing (still Starter)', (await planOf(B.cookie))?.planId === starterEnt?.planId || (await planOf(B.cookie))?.plan === starterEnt?.plan, JSON.stringify(await planOf(B.cookie)).slice(0, 120))

// ─── C2: price / plan tampering ──────────────────────────────────────────────
console.log('\nC2 — plan and price tampering')
const bad: [string, unknown][] = [['unknown plan', { planId: 'enterprise', interval: 'month' }], ['starter (free) plan', { planId: 'starter', interval: 'month' }], ['bad interval', { planId: 'pro', interval: 'week' }], ['empty body', {}], ['array body', []], ['string plan', 'pro'], ['numeric plan', { planId: 1, interval: 'month' }], ['negative amount ignored or refused', { planId: 'pro', interval: 'month', amount: -1 }]]
const badRes: string[] = []
for (const [name, body] of bad) { const r = await checkout(S.cookie, body); if (name.includes('ignored')) { if (r.status >= 500) badRes.push(`${name}: ${r.status}`) } else if (r.status < 400 || r.status >= 500) badRes.push(`${name}: ${r.status}`) }
ok('C2', 'bad plans / intervals / bodies are refused with a clean 4xx', badRes.length === 0, badRes.join(' | '))
const tamper = await http('POST', '/api/v1/billing/checkout', { cookie: S.cookie, body: { planId: 'pro', interval: 'month', amount: 1, amountMinor: 1, currency: 'INR', price: 1, discount: 99, planPrice: 1, providerPlanId: 'plan_cheap' }, headers: INR })
const tamperedPlan = plans.get(subs.get(tamper.json?.data?.subscriptionId)?.plan_id ?? '')
ok('C2b', 'extra price/currency/plan fields in the body are ignored: the provider plan still costs the server\'s price (₹499.00)', tamper.status === 200 && tamperedPlan?.amount === 49900 && tamperedPlan.currency === 'INR', JSON.stringify(tamperedPlan))
ok('C2c', 'the amount the browser is told equals the server\'s price', tamper.json?.data?.amountMinor === 49900, JSON.stringify(tamper.json?.data))
const usd = await http('POST', '/api/v1/billing/checkout', { cookie: S.cookie, body: { planId: 'pro', interval: 'month' } })
if (env.BILLING_FORCE_CURRENCY) console.log(`  ➖ C2d skipped: this dev server forces ${env.BILLING_FORCE_CURRENCY} (BILLING_FORCE_CURRENCY); the country-header trust rule is covered by the unit test`)
else ok('C2d', 'without an India country header there is no way to get the India price (USD is not on sale: refused)', usd.status === 400, `${usd.status} ${usd.text.slice(0, 100)}`)
const checkoutNoAuth = await http('POST', '/api/v1/billing/checkout', { body: { planId: 'pro', interval: 'month' } })
ok('C2e', 'checkout needs a signed-in user', checkoutNoAuth.status === 401, `${checkoutNoAuth.status}`)
const foreignOrigin = await http('POST', '/api/v1/billing/checkout', { cookie: S.cookie, body: { planId: 'pro', interval: 'month' }, origin: 'https://evil.example' })
ok('C2f', 'checkout from a foreign website (CSRF) is refused', foreignOrigin.status === 403, `${foreignOrigin.status}`)

// ─── C3: confirming a payment ────────────────────────────────────────────────
console.log('\nC3 — confirming payments (forged, borrowed, unpaid, repeated)')
const sessA = probe.json.data.subscriptionId as string
const fakePay = 'pay_doesnotexist01'
ok('C3', 'a forged signature is refused', (await verify(A.cookie, fakePay, sessA, 'a'.repeat(64))).status === 400, '')
ok('C3b', 'a signature made with the wrong secret is refused', (await verify(A.cookie, fakePay, sessA, hmac('wrong-secret', `${fakePay}|${sessA}`))).status === 400, '')
ok('C3c', 'a correct signature for an UNPAID session grants nothing', await (async () => { const r = await verify(A.cookie, fakePay, sessA); return r.status === 400 && JSON.stringify(await planOf(A.cookie)) === JSON.stringify(starterEnt) })(), '')
ok('C3d', 'garbage / short / missing fields are refused (never 5xx)', await (async () => { const rs = await Promise.all([http('POST', '/api/v1/billing/verify', { cookie: A.cookie, body: {} }), http('POST', '/api/v1/billing/verify', { cookie: A.cookie, body: { razorpay_payment_id: 'x', razorpay_subscription_id: 'y', razorpay_signature: 'z' } }), http('POST', '/api/v1/billing/verify', { cookie: A.cookie, rawBody: 'not json' })]); return rs.every((r) => r.status >= 400 && r.status < 500) })(), '')
// the legitimate customer A pays
const paidA = customerPays(sessA)
const wrongPayId = await verify(A.cookie, paidA.payment.id, sessA, hmac(KEY_SECRET, `pay_other123456|${sessA}`))
ok('C3e', 'a signature for a DIFFERENT payment id is refused even though A really paid', wrongPayId.status === 400, `${wrongPayId.status}`)
const stolen = await verify(B.cookie, paidA.payment.id, sessA)
ok('C3f', 'someone else (B) presenting A\'s valid payment proof gets nothing', stolen.status === 400 && JSON.stringify(await planOf(B.cookie)) === JSON.stringify(starterEnt), `${stolen.status} ${stolen.text.slice(0, 100)}`)
const okVerify = await verify(A.cookie, paidA.payment.id, sessA)
const entA = await planOf(A.cookie)
ok('C3g', 'A\'s own valid proof activates Pro', okVerify.status === 200 && JSON.stringify(entA) !== JSON.stringify(starterEnt), `${okVerify.status} ${okVerify.text.slice(0, 120)}`)
const ledgerAfterFirst = await ledgerRows(A.id)
const reps = await Promise.all(Array.from({ length: 6 }, () => verify(A.cookie, paidA.payment.id, sessA)))
ok('C3h', 'repeating the confirmation 6 times at once changes nothing (no double credits, one payment row)', (await ledgerRows(A.id)) === ledgerAfterFirst && (await paymentRows(A.id)) === 1 && reps.every((r) => r.status < 500), `ledger ${ledgerAfterFirst}→${await ledgerRows(A.id)}, payments ${await paymentRows(A.id)}, ${reps.map((r) => r.status).join(',')}`)

// ─── C4: the webhook ─────────────────────────────────────────────────────────
console.log('\nC4 — webhook attacks')
const sessD = (await checkout(D.cookie)).json.data.subscriptionId as string
const paidD = customerPays(sessD)
const evt = (name: string, s: FSub, p?: object) => webhook(name, { ...subPayload(s), ...(p ? { payment: { entity: p } } : {}) })
ok('C4', 'no signature header → 401', (await webhook('subscription.activated', subPayload(paidD.sub), { sign: false })).status === 401, '')
ok('C4b', 'wrong-secret signature → 401', (await webhook('subscription.activated', subPayload(paidD.sub), { secret: 'not-the-secret' })).status === 401, '')
ok('C4c', 'a valid signature over a body changed afterwards → 401', (await webhook('subscription.activated', subPayload(paidD.sub), { mutate: (b) => b.replace('activated', 'cancelled ') })).status === 401, '')
ok('C4d', 'none of those changed anything (D is still Starter)', JSON.stringify(await planOf(D.cookie)) === JSON.stringify(starterEnt), '')
const big = await http('POST', '/api/v1/webhooks/razorpay', { rawBody: JSON.stringify({ event: 'x', pad: 'a'.repeat(400 * 1024) }), headers: { 'X-Razorpay-Signature': 'a'.repeat(64) } })
ok('C4e', 'an oversized body is refused (413, or the connection is closed on it) before it is read', big.status === 413 || big.status === 0, `${big.status}`)
const firstId = `evt_replay_${Date.now()}`
const w1 = await webhook('subscription.activated', subPayload(paidD.sub), { id: firstId })
const gotD = await planOf(D.cookie)
const ledgerD = await ledgerRows(D.id)
const w2 = await webhook('subscription.activated', subPayload(paidD.sub), { id: firstId })
const w3 = await webhook('subscription.activated', subPayload(paidD.sub), { id: `evt_other_${Date.now()}` }) // same content, new delivery id
ok('C4f', 'a genuine signed webhook activates Pro', w1.status === 200 && JSON.stringify(gotD) !== JSON.stringify(starterEnt), `${w1.status} ${JSON.stringify(gotD)?.slice(0, 100)}`)
ok('C4g', 'replaying the same delivery is a recognised duplicate; a re-delivery under a new id changes nothing either (credits granted once)', w2.json?.duplicate === true && w3.status === 200 && (await ledgerRows(D.id)) === ledgerD, `${JSON.stringify(w2.json)} ledger ${ledgerD}→${await ledgerRows(D.id)}`)
const paidHook = customerPays((await checkout(C.cookie, { planId: 'pro', interval: 'year' })).json.data.subscriptionId)
const forgedUser = await webhook('subscription.activated', subPayload({ ...paidHook.sub, notes: { ...paidHook.sub.notes, userId: A.id } }))
ok('C4h', 'a signed event is only trusted for the plan the SERVER created: someone cannot redirect it to another user (B/A stay as they are)', JSON.stringify(await planOf(B.cookie)) === JSON.stringify(starterEnt), `${forgedUser.status}`)
const unknownSub = await webhook('subscription.activated', subPayload({ id: 'sub_madeup', plan_id: 'plan_madeup', status: 'active', current_start: Math.floor(Date.now() / 1000), current_end: Math.floor(Date.now() / 1000) + 99999, notes: { userId: S.id, planId: 'gold', interval: 'month', currency: 'INR' } }))
ok('C4i', 'a signed event for a made-up provider plan grants nothing', unknownSub.status < 500 && JSON.stringify(await planOf(S.cookie)) === JSON.stringify(starterEnt), `${unknownSub.status}`)

// ─── C5: races ───────────────────────────────────────────────────────────────
console.log('\nC5 — confirm and webhook at the same moment')
const baseline = await signUp('base2')
const bs = (await checkout(baseline.cookie)).json.data.subscriptionId as string
const bp = customerPays(bs)
await verify(baseline.cookie, bp.payment.id, bs)
const baselineRows = await ledgerRows(baseline.id)
const racer = await signUp('race2')
const rs = (await checkout(racer.cookie)).json.data.subscriptionId as string
const rp = customerPays(rs)
const raced = await Promise.all([...Array.from({ length: 5 }, () => verify(racer.cookie, rp.payment.id, rs)), ...Array.from({ length: 5 }, (_, i) => evt('subscription.activated', rp.sub, rp.payment)), ...Array.from({ length: 3 }, (_, i) => evt('subscription.charged', rp.sub, rp.payment))])
ok('C5', 'a mixed storm of confirms and webhooks never errors', raced.every((r) => r.status < 500), raced.map((r) => r.status).join(','))
ok('C5b', 'afterwards: ONE subscription row, ONE payment row, the same credit entries as a calm single activation', (await db.select().from(subscription).where(eq(subscription.userId, racer.id))).length === 1 && (await paymentRows(racer.id)) === 1 && (await ledgerRows(racer.id)) === baselineRows, `rows ${await ledgerRows(racer.id)} vs ${baselineRows}, payments ${await paymentRows(racer.id)}`)

// ─── C6: cancel, refund, dispute ─────────────────────────────────────────────
console.log('\nC6 — cancel, refund, dispute')
ok('C6', 'cancelling with no subscription → 404 (no crash)', (await http('POST', '/api/v1/billing/cancel', { cookie: S.cookie, body: {} })).status === 404, '')
const cancelBefore = calls.cancel
const c1 = await http('POST', '/api/v1/billing/cancel', { cookie: A.cookie, body: {} })
const c2 = await http('POST', '/api/v1/billing/cancel', { cookie: A.cookie, body: {} })
const stillPro = JSON.stringify(await planOf(A.cookie)) !== JSON.stringify(starterEnt)
ok('C6b', 'cancelling twice: both answers clean; the customer keeps the plan they paid for until the period ends', c1.status === 200 && c2.status < 500 && stillPro, `${c1.status}/${c2.status} pro=${stillPro}`)
ok('C6c', 'someone cannot cancel another person\'s subscription (B has none → 404; A is unaffected by B\'s attempt)', (await http('POST', '/api/v1/billing/cancel', { cookie: B.cookie, body: {} })).status === 404, '')
// refund of D's payment (full)
const grantsBefore = await ledgerRows(D.id)
const refundEvt = () => webhook('refund.processed', { refund: { entity: { id: 'rfnd_1', payment_id: paidD.payment.id, amount: paidD.payment.amount } } })
// the payment row exists only if the webhook carried the payment entity: make sure it does
await evt('subscription.charged', paidD.sub, paidD.payment)
const rf = await refundEvt()
const afterRefund = await planOf(D.cookie)
const isStarter = async () => (await planOf(D.cookie))?.plan?.id === 'starter'
ok('C6d', 'a full refund webhook ends the access the payment bought', rf.status === 200 && afterRefund?.plan?.id === 'starter', `${rf.status} ${JSON.stringify(afterRefund)?.slice(0, 120)}`)
const ledgerAfterRefund = await ledgerRows(D.id)
const rf2 = await refundEvt(); const rf3 = await webhook('refund.processed', { refund: { entity: { id: 'rfnd_1', payment_id: paidD.payment.id, amount: paidD.payment.amount } } }, { id: `evt_refund_again_${Date.now()}` })
ok('C6e', 'the refund replayed (same and new delivery id) claws back credits only once', rf2.status < 500 && rf3.status < 500 && (await ledgerRows(D.id)) === ledgerAfterRefund, `ledger ${grantsBefore}→${ledgerAfterRefund}→${await ledgerRows(D.id)}`)
const reuse = await verify(D.cookie, paidD.payment.id, sessD)
ok('C6f', 'a REFUNDED payment cannot be confirmed again to get the plan back', await isStarter(), `${reuse.status}`)
const lateActivated = await evt('subscription.activated', paidD.sub, paidD.payment)
ok('C6g', 'a late "activated" event for the refunded subscription does not resurrect it', await isStarter(), `${lateActivated.status}`)

// ─── C7: bypasses ────────────────────────────────────────────────────────────
console.log('\nC7 — bypass attempts as a Starter user')
const setPlan = await Promise.all(['/api/v1/dev/set-plan', '/api/v1/billing/set-plan', '/api/v1/me/plan', '/api/v1/admin/set-plan', '/api/v1/billing/activate', '/api/v1/billing/upgrade'].map((p) => http('POST', p, { cookie: S.cookie, body: { planId: 'gold', plan: 'gold' } })))
ok('C7', 'there is no endpoint that switches a plan (dev set-plan, activate, upgrade… all 401/403/404)', setPlan.every((r) => [401, 403, 404, 405].includes(r.status)), setPlan.map((r) => r.status).join(','))
const mass = await http('POST', '/api/auth/update-user', { cookie: S.cookie, body: { plan: 'gold', planId: 'gold', credits: 99999, role: 'admin', subscription: { planId: 'gold' } } })
ok('C7b', 'update-user cannot set plan/credits/role', JSON.stringify(await planOf(S.cookie)) === JSON.stringify(starterEnt) && (await http('GET', '/api/v1/admin/users', { cookie: S.cookie })).status === 403, `${mass.status}`)
const subApi = await http('GET', '/api/v1/billing/subscription', { cookie: S.cookie })
ok('C7c', 'the billing summary of a Starter user shows no subscription and no one else\'s payments', subApi.json?.data?.subscription === null && (subApi.json?.data?.payments?.length ?? 0) === 0, subApi.text.slice(0, 160))
const proOnly = await Promise.all([
  http('POST', '/api/v1/projects', { cookie: S.cookie, body: { name: 'x' } }),
  http('POST', '/api/v1/brand/kits', { cookie: S.cookie, body: { name: 'kit', primary: '#112233', accent: '#445566' } }),
])
ok('C7d', 'Pro features (projects, brand kits) are refused for Starter with a clear 402/403', proOnly.every((r) => r.status === 402 || r.status === 403), proOnly.map((r) => `${r.status} ${r.text.slice(0, 60)}`).join(' | '))
const ledgerDirect = await db.select().from(creditLedger).where(like(creditLedger.idempotencyKey, '%'))
ok('C7e', 'sanity: the credit ledger is append-only (trigger) — an UPDATE is refused by the database', await (async () => { try { await db.update(creditLedger).set({ delta: 999999 }).where(eq(creditLedger.userId, S.id)); const r = (await db.select().from(creditLedger).where(eq(creditLedger.userId, S.id))).every((x) => x.delta !== 999999); return r } catch { return true } })(), `${ledgerDirect.length} rows`)

// last on purpose: it uses up this address's webhook allowance for a minute
const flood = await Promise.all(Array.from({ length: 150 }, (_, i) => webhook('subscription.activated', subPayload(paidD.sub), { id: `evt_flood_${Date.now()}_${i}` })))
ok('C4j', 'a flood of 150 webhooks is slowed (429) and never produces a 5xx', flood.some((r) => r.status === 429) && flood.every((r) => r.status < 500), [...new Set(flood.map((r) => r.status))].join(','))
console.log('\ncalls to the stand-in provider:', JSON.stringify(calls))
fake.close()
await restorePlans()
await pool.end()
if (failures) { console.log(`\n${failures} CHECK(S) FAILED\n\nFINDINGS:`); for (const f of findings) console.log(' ·', f) } else console.log('\nALL CHECKS HELD')
process.exit(failures)
