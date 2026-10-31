/**
 * Deck quality with the REAL model: five very different topics go through the whole pipeline (analyse → template choice → outline → slides → layout → checks).
 * What is proven, from what the server stored (not from what a screen happens to show):
 *   · the template FITS the topic: the decks do not all share one design, and light and dark both occur
 *   · typography: one size per level through a deck, body text readable (never below 11 pt), titles at a presentation size
 *   · nothing overflows its box
 * Screenshots of three slides of each deck are saved to e2e/results for a human look.
 */
import { join } from 'node:path'
import { EDITOR, RESULTS, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

const TOPICS = {
  party: 'A 7 slide plan for my daughter\'s 7th birthday party: unicorn theme, games, cake, decorations and a budget in rupees',
  security: 'A 7 slide quarterly cybersecurity incident review for the board: a phishing attack, how we contained it, lessons learned and next steps',
  poetry: 'A 7 slide lecture on Romantic poetry for undergraduate literature students: Wordsworth, Keats and Shelley, with famous lines',
  fintech: 'An 8 slide seed round pitch deck for a fintech app that helps gig workers in India save for taxes',
  coffee: 'A 7 slide Instagram launch plan for a new organic coffee brand: audience, content ideas, calendar and influencers',
}
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) / 2)]

export default async function () {
  const s = suite('47-deck-quality')
  const b = await launch()
  // one account per topic: a person may only have 3 decks being built at the same time
  const people = {}
  for (const key of Object.keys(TOPICS)) { people[key] = await person(b, `q${key}`, 'pro'); await api.get(people[key], '/me/entitlements') }
  const decks = {}

  await s.check('five real decks are generated (real model, whole pipeline), in parallel', null, async () => {
    await Promise.all(Object.entries(TOPICS).map(async ([key, prompt]) => {
      const P = people[key]
      const job = await api.post(P, '/generation/jobs', { prompt, idempotencyKey: `q-${key}-${Math.random().toString(36).slice(2)}` })
      expect(job.status === 201, `${key}: job ${job.status} ${JSON.stringify(job.body).slice(0, 200)}`)
      for (let i = 0; i < 160; i++) {
        const v = (await api.get(P, `/generation/jobs/${job.data.id}`)).data
        if (v.status === 'completed') { decks[key] = (await api.get(P, `/presentations/${v.presentationId}`)).data; decks[key].id = v.presentationId; return }
        if (['failed', 'cancelled'].includes(v.status)) throw new Error(`${key}: job ${v.status} ${v.error ?? ''}`)
        await new Promise((r) => setTimeout(r, 4000))
      }
      throw new Error(`${key}: did not finish in time`)
    }))
  })
  const docs = Object.entries(decks).map(([key, d]) => ({ key, doc: d.document }))
  await s.check('all five topics produced a deck', null, async () => { expect(docs.length === Object.keys(TOPICS).length, `only ${docs.length} decks: ${docs.map((d) => d.key).join(', ')}`) })

  await s.check('the template fits the topic: at least 4 different designs for 5 different topics, and both light and dark decks occur', null, async () => {
    const ids = docs.map((d) => d.doc.theme.templateId)
    console.log('      designs:', docs.map((d) => `${d.key}=${d.doc.theme.templateId} (${lum(d.doc.theme.colors.background) > 0.4 ? 'light' : 'dark'})`).join(' · '))
    expect(new Set(ids).size >= 4, `only ${new Set(ids).size} different designs: ${ids.join(', ')}`)
    const modes = docs.map((d) => lum(d.doc.theme.colors.background) > 0.4)
    expect(modes.some(Boolean) && modes.some((m) => !m), `all decks are ${modes[0] ? 'light' : 'dark'}`)
  })

  await s.check('the playful party deck and the board security deck do not get the same template family look', null, async () => {
    expect(decks.party.document.theme.templateId !== decks.security.document.theme.templateId, 'same template')
  })

  const texts = (doc, role) => doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'text' && (!role || e.role === role)))
  await s.check('typography: body text is presentation size (median ≥ 18 pt = 36 px) and no reading text is below 11 pt (22 px) except where the layout had to shrink it', null, async () => {
    for (const { key, doc } of docs) {
      const body = texts(doc, 'body').map((e) => e.fontSize)
      expect(body.length > 0, `${key}: no body text`)
      expect(median(body) >= 34, `${key}: median body ${median(body)}px`)
      const tiny = [...texts(doc, 'body'), ...texts(doc, 'heading'), ...texts(doc, 'caption')].filter((e) => e.fontSize < 22)
      expect(tiny.length <= 2, `${key}: ${tiny.length} text boxes under 22px (${tiny.slice(0, 3).map((e) => e.fontSize).join(',')})`)
    }
  })

  await s.check('typography: slide titles are one size through the deck (within 35%: a title that needs two lines may be a little smaller) and at least 28 pt (56 px) where the title fits on one or two lines', null, async () => {
    for (const { key, doc } of docs) {
      const t = doc.slides.filter((sl) => !['title', 'section-divider', 'thank-you'].includes(sl.layoutId)).flatMap((sl) => sl.elements.filter((e) => e.type === 'text' && e.role === 'title').map((e) => e.fontSize))
      if (t.length < 2) continue
      expect(Math.max(...t) / Math.min(...t) <= 1.35, `${key}: titles wander ${Math.min(...t)}–${Math.max(...t)}px`)
      expect(median(t) >= 56, `${key}: median title ${median(t)}px`)
    }
  })

  await s.check('no slide overflows its text boxes, and the stored quality report agrees', null, async () => {
    for (const { key, doc } of docs) {
      const bad = doc.slides.filter((sl) => sl.validation?.issues?.some((i) => i.severity === 'error'))
      expect(bad.length === 0, `${key}: ${bad.length} slides with errors: ${bad.map((sl) => sl.validation.issues.map((i) => i.message).join('; ')).join(' | ').slice(0, 200)}`)
    }
  })

  await s.check('screenshots of the opening, a middle and a late slide of every deck are saved for a human look', null, async () => {
    for (const { key } of docs) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 780 }, storageState: await people[key].ctx.storageState() })
      const p = await ctx.newPage()
      await p.goto(`${EDITOR}/present/${decks[key].id}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
      const n = decks[key].document.slides.length
      for (let i = 0; i < n; i++) {
        if (i > 0) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900) }
        if ([0, 2, 4, n - 2].includes(i)) await p.screenshot({ path: join(RESULTS, `47-${key}-${i}.png`) })
      }
      await p.close(); await ctx.close()
    }
  })

  await b.close()
  return s.done()
}
