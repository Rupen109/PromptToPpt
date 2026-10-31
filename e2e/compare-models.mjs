/**
 * Same prompts, two models: writes e2e/results/model-compare.json (job ids, deck ids, timing). Real AI, costs a few cents.
 *   E2E_API=http://localhost:4000 node compare-models.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { API, RESULTS, launch } from './lib.mjs'
import { api, person } from './kits-lib.mjs'

const MODELS = { lite: 'vertex:gemini-3.1-flash-lite', std: 'vertex:gemini-3.6-flash' }
const PROMPTS = {
  party: { prompt: "A 10 slide plan for my daughter's 7th birthday party: unicorn theme, games, cake, decorations and a budget in rupees" },
  security: { prompt: 'A 10 slide quarterly cybersecurity incident review for the board: a phishing attack, how we contained it, lessons learned and next steps' },
  poetry: { prompt: 'A 10 slide lecture on Romantic poetry for undergraduate literature students: Wordsworth, Keats and Shelley, with famous lines' },
  fintech: { prompt: 'A 10 slide seed round pitch deck for a fintech app that helps gig workers in India save for taxes' },
  sales: { prompt: 'A 10 slide quarterly sales review for the team. Facts: revenue was 4.2 crore rupees, up 18% from last quarter; we added 320 new customers; churn was 2.1%; the West region was the best; the biggest risk is two large renewals in January.' },
  hindi: { prompt: 'बच्चों के लिए स्वस्थ खान-पान की आदतों पर 10 स्लाइड की प्रस्तुति, स्कूल के छात्रों के लिए', language: 'hi' },
}
const b = await launch()
const out = []
const keys = Object.keys(PROMPTS)
for (let wave = 0; wave < keys.length; wave += 3) {
  const batch = keys.slice(wave, wave + 3)
  await Promise.all(batch.flatMap((key) => Object.entries(MODELS).map(async ([label, model]) => {
    const P = await person(b, `cmp${key}${label}`, 'pro'); await api.get(P, '/me/entitlements')
    const t0 = Date.now()
    const job = await api.post(P, '/generation/jobs', { prompt: PROMPTS[key].prompt, slideCount: 10, model, ...(PROMPTS[key].language ? { language: PROMPTS[key].language } : {}), idempotencyKey: `cmp-${key}-${label}-${Math.random().toString(36).slice(2)}` })
    if (job.status !== 201) { out.push({ key, label, model, error: `job ${job.status} ${JSON.stringify(job.body).slice(0, 160)}` }); return }
    for (let i = 0; i < 200; i++) {
      const v = (await api.get(P, `/generation/jobs/${job.data.id}`)).data
      if (v.status === 'completed') { out.push({ key, label, model, jobId: job.data.id, presentationId: v.presentationId, seconds: Math.round((Date.now() - t0) / 1000), email: P.email }); return }
      if (['failed', 'cancelled'].includes(v.status)) { out.push({ key, label, model, jobId: job.data.id, error: `${v.status} ${v.error ?? ''}`, seconds: Math.round((Date.now() - t0) / 1000) }); return }
      await new Promise((r) => setTimeout(r, 4000))
    }
    out.push({ key, label, model, jobId: job.data.id, error: 'timeout' })
  })))
  console.log(`wave ${wave / 3 + 1} done:`, out.filter((o) => batch.includes(o.key)).map((o) => `${o.key}/${o.label} ${o.error ?? o.seconds + 's'}`).join(' · '))
}
mkdirSync(RESULTS, { recursive: true })
writeFileSync(`${RESULTS}/model-compare.json`, JSON.stringify(out, null, 2))
await b.close()
void API
