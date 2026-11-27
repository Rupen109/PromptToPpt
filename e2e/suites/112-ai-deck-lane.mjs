import { expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * The deck lane on the REAL model (one plan call + a few writing calls, a few cents): "make the whole deck more professional for senior executives" on the
 * 11-slide pitch template. The first answer is a plan (free), with one action per slide, the price, and nothing changed; "Go ahead" writes only the planned
 * slides, keeps every figure each slide had, charges exactly the price it showed, and leaves "keep" slides untouched and uncharged.
 */
const figures = (text) => [...new Set((text.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?%?/g) ?? []).map((x) => x.replace(/%$/, '')).filter((x) => x.includes('.') || x.length >= 2))]
const textOf = (c) => { const out = []; const walk = (v, k = '') => { if (typeof v === 'string') { if (!['layout', 'imageUrl', 'imagePrompt', 'sourceId', 'locator', 'chartType'].includes(k)) out.push(v) } else if (Array.isArray(v)) v.forEach((x) => walk(x, k)); else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, kk) }; walk(c); return out.join(' ') }

export default async function () {
  const s = suite('112-ai-deck-lane')
  const b = await launch()
  try {
    const A = await person(b, 'decklane', 'pro')
    const id = (await api.post(A, '/presentations', { templateId: 'pitch-launchpad' })).data.id
    const before = (await api.get(A, `/presentations/${id}`)).data.document
    const credits = async () => (await api.get(A, '/me/entitlements')).data.credits.balance
    const rid = () => `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    // the plan call and the writing waves take longer than the client's default 30 s: this suite gives the API up to 4 minutes per answer
    const assist = async (data) => { const r = await A.ctx.request.post(`http://localhost:4000/api/v1/presentations/${id}/ai-assist`, { headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3100' }, data, timeout: 240000 }); let body = null; try { body = await r.json() } catch { /* empty */ } return { status: r.status(), body, data: body?.data } }
    let plan = null, shownCredits = 0
    await s.check('the first answer is a plan: one action per slide, keeps named, the price shown, nothing changed and nothing charged', null, async () => {
      const c0 = await credits()
      const r = await assist({ instruction: 'make the whole deck more professional for senior executives', scope: 'deck', requestId: rid(), activeSlideId: before.slides[0].id })
      expect(r.status === 200, `status ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`)
      const d = r.data
      expect(d.ask === true && /Here is my plan/.test(d.reply), `not a plan: ${d.reply?.slice(0, 300)}`)
      expect(/Every figure in your deck stays/.test(d.reply) && /Go ahead\?/.test(d.reply), 'the plan does not promise the figures / ask to go ahead')
      const yes = (d.options ?? []).find((o) => o.confirm?.kind === 'transform')
      expect(!!yes, 'no "Go ahead" option carrying the plan')
      plan = yes.confirm.plan
      expect(plan.actions.length === before.slides.length, `actions ${plan.actions.length} for ${before.slides.length} slides`)
      expect(plan.actions.some((a) => a.action === 'keep'), 'the plan keeps no slide at all (it changes slides for the sake of it)')
      const m = d.reply.match(/It uses (\d+) credits \((\d+) slides? written\)/)
      expect(!!m, `no price line: ${d.reply.slice(-200)}`)
      shownCredits = Number(m[1])
      const writes = plan.actions.filter((a) => !['keep', 'delete'].includes(a.action)).length + plan.add.length
      expect(Number(m[2]) === writes && shownCredits === 4 + 3 * (writes - 1), `price ${m[1]} for ${m[2]} written; planned writes ${writes}`)
      expect((d.edits ?? []).length === 0 && (d.creditsCharged ?? 0) === 0 && (await credits()) === c0, 'the plan changed or charged something')
      console.log('    plan:', plan.actions.map((a) => `${a.action}`).join(' '), '| add', plan.add.length, '| order', plan.order ? 'yes' : 'no')
    })
    await s.check('"Go ahead" writes only the planned slides, keeps every figure of each slide, and charges exactly the price it showed', null, async () => {
      expect(!!plan, 'no plan to confirm (the first check failed)')
      const c0 = await credits()
      const r = await assist({ instruction: 'Yes, go ahead with that plan', scope: 'deck', requestId: rid(), activeSlideId: before.slides[0].id, confirm: { kind: 'transform', plan } })
      expect(r.status === 200, `status ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`)
      const d = r.data
      const planned = new Set(plan.actions.filter((a) => ['rewrite', 'shorten', 'expand', 'layout'].includes(a.action)).map((a) => a.slideId))
      const edited = (d.edits ?? []).map((e) => e.slideId)
      expect(edited.every((x) => planned.has(x)), `a slide outside the plan was edited: ${edited.filter((x) => !planned.has(x)).join(',')}`)
      expect(edited.length >= Math.ceil(planned.size / 2), `only ${edited.length} of ${planned.size} planned slides were written: ${JSON.stringify(d.notes)}`)
      for (const e of d.edits ?? []) {
        const was = before.slides.find((sl) => sl.id === e.slideId)
        const lost = figures(textOf(was.content)).filter((f) => !figures(textOf(e.content)).includes(f))
        expect(lost.length === 0, `slide ${e.slideId} lost figures ${lost.join(', ')}`)
      }
      const failed = (d.refused ?? []).length
      const written = edited.length + (d.additions ?? []).length
      const expectCharge = written === 0 ? 0 : 4 + 3 * (written - 1)
      expect(d.creditsCharged === expectCharge, `charged ${d.creditsCharged}, expected ${expectCharge} for ${written} written (${failed} refused)`)
      expect(c0 - (await credits()) === expectCharge, 'the balance moved by a different amount')
      console.log('    written:', written, '| refused:', failed, '| charged:', d.creditsCharged, '| notes:', (d.notes ?? []).slice(0, 2).join(' / ').slice(0, 200))
    })
    await A.ctx.close()
  } finally { await b.close() }
  return s.done()
}
