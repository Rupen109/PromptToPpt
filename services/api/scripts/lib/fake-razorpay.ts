/** A stand-in Razorpay for black-box payment tests (dev only). The API must run with RAZORPAY_API_BASE pointing here (honoured only with rzp_test_ keys). */
import { createServer } from 'node:http'
import { createHmac } from 'node:crypto'
import { env } from '../../src/env.ts'

interface FSub { id: string; plan_id: string; status: string; current_start: number | null; current_end: number | null; notes: Record<string, string> }
export const hmac = (secret: string, s: string) => createHmac('sha256', secret).update(s).digest('hex')

export async function startFakeRazorpay(port: number) {
  const plans = new Map<string, { id: string; amount: number; currency: string; period: string }>()
  const subs = new Map<string, FSub>()
  const pays = new Map<string, { id: string; amount: number; currency: string; status: string; created_at: number; subscription_id: string; notes: Record<string, string> }>()
  const RUN = Date.now().toString(36)
  let seq = 0
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => (raw += d))
    req.on('end', () => {
      const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
      if ((req.headers.authorization ?? '') !== `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`) return send(401, { error: { description: 'bad auth' } })
      const url = req.url ?? ''; const body = raw ? JSON.parse(raw) : {}
      if (req.method === 'POST' && url === '/plans') { const id = `plan_f${RUN}_${++seq}`; plans.set(id, { id, amount: body.item.amount, currency: body.item.currency, period: body.period }); return send(200, { id }) }
      if (req.method === 'POST' && url === '/subscriptions') { const id = `sub_f${RUN}_${++seq}`; const s: FSub = { id, plan_id: body.plan_id, status: 'created', current_start: null, current_end: null, notes: body.notes }; subs.set(id, s); return send(200, s) }
      let m = url.match(/^\/subscriptions\/([^/]+)\/cancel$/)
      if (req.method === 'POST' && m) { const s = subs.get(m[1]!); if (!s) return send(400, { error: { description: 'not found' } }); if (body.cancel_at_cycle_end !== 1) s.status = 'cancelled'; return send(200, s) }
      m = url.match(/^\/subscriptions\/([^/]+)$/)
      if (req.method === 'GET' && m) { const s = subs.get(decodeURIComponent(m[1]!)); return s ? send(200, s) : send(400, { error: { description: 'The id provided does not exist' } }) }
      m = url.match(/^\/payments\/([^/]+)$/)
      if (req.method === 'GET' && m) { const p = pays.get(decodeURIComponent(m[1]!)); return p ? send(200, p) : send(400, { error: { description: 'The id provided does not exist' } }) }
      send(404, { error: { description: 'unknown' } })
    })
  })
  await new Promise<void>((r) => server.listen(port, r))
  return {
    /** the customer pays in the checkout window: the provider marks the subscription active and records a captured payment; returns what the browser callback carries */
    customerPays(subId: string) {
      const s = subs.get(subId)!; const pl = plans.get(s.plan_id)!; const now = Math.floor(Date.now() / 1000)
      s.status = 'active'; s.current_start = now; s.current_end = now + (pl.period === 'yearly' ? 365 : 30) * 86400
      const p = { id: `pay_f${RUN}_${++seq}`, amount: pl.amount, currency: pl.currency, status: 'captured', created_at: now, subscription_id: s.id, notes: s.notes }
      pays.set(p.id, p)
      return { paymentId: p.id, subscriptionId: s.id, signature: hmac(env.RAZORPAY_KEY_SECRET!, `${p.id}|${s.id}`), amountMinor: p.amount, currency: p.currency }
    },
    stop: () => server.close(),
  }
}
