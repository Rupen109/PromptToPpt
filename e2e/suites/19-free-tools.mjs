import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EDITOR, WEB, expect, launch, suite } from '../lib.mjs'

const SLUGS = ['pitch-deck-templates', 'sales-presentation-templates', 'marketing-presentation-templates', 'business-strategy-presentation-templates', 'product-roadmap-presentation-templates', 'technology-presentation-templates', 'report-presentation-templates', 'education-presentation-templates', 'case-study-presentation-templates', 'team-and-hr-presentation-templates']

/** Smallest valid text PDF (one string per page) — the same shape the API tests use. */
function tinyPdf(pages) {
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', `<</Type/Pages/Kids[${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}]/Count ${pages.length}>>`]
  pages.forEach((t, i) => {
    const content = `BT /F1 14 Tf 72 700 Td (${t}) Tj ET`
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${4 + i * 2} 0 R/Resources<</Font<</F1 ${3 + pages.length * 2} 0 R>>>>>>`, `<</Length ${content.length}>>\nstream\n${content}\nendstream`)
  })
  objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>')
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out)
}

export default async function () {
  const s = suite('19-free-tools')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()

  const pages = ['/free-tools', '/free-tools/presentation-outline-generator', '/free-tools/pdf-to-presentation', '/free-tools/pdf-to-ppt']
  for (const path of pages) {
    for (const width of [390, 768, 1440]) {
      await s.check(`${path} renders @${width}px without overflow`, p, async () => {
        await p.setViewportSize({ width, height: 900 })
        const r = await p.goto(WEB + path, { waitUntil: 'networkidle' })
        expect(r.status() < 400, `status ${r.status()}`)
        expect(await p.locator('h1').count() === 1, 'need exactly one <h1>')
        expect((await p.title()).length > 10, 'weak <title>')
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(over <= 1, `horizontal overflow of ${over}px`)
      })
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 })

  await s.check('outline generator: topic → outline → opens the editor with a draft', p, async () => {
    await p.goto(WEB + '/free-tools/presentation-outline-generator', { waitUntil: 'networkidle' })
    await p.getByPlaceholder(/Salesforce Agentforce/).fill('Why our retail team should adopt AI agents')
    await p.getByRole('button', { name: /Generate outline/ }).click()
    await p.getByRole('button', { name: /Turn this outline into a full presentation/ }).waitFor({ timeout: 60_000 }) // the step cards below already contain h3s, so wait for the result's own button
    const n = await p.locator('main section').first().locator('ol > li').count() // the result card lives in the first section; the step list is below it
    expect(n >= 5, `only ${n} slides in the outline`)
    await p.getByRole('button', { name: /Turn this outline into a full presentation/ }).click()
    await p.waitForURL((u) => u.href.startsWith(EDITOR), { timeout: 15_000 })
    expect(p.url().includes('draft='), `no draft in ${p.url()}`)
  })

  await s.check('outline generator: a too-short topic is refused politely', p, async () => {
    await p.goto(WEB + '/free-tools/presentation-outline-generator', { waitUntil: 'networkidle' })
    await p.getByPlaceholder(/Salesforce Agentforce/).fill('x')
    await p.getByRole('button', { name: /Generate outline/ }).click()
    await p.locator('p[role=alert]').waitFor({ timeout: 5000 }) // not getByRole: Next's hidden route announcer is also role=alert
  })

  await s.check('PDF tool: upload → summary + outline → opens the editor with the document attached', p, async () => {
    await p.goto(WEB + '/free-tools/pdf-to-presentation', { waitUntil: 'networkidle' })
    await p.setInputFiles('input[type=file]', { name: 'Q3 review.pdf', mimeType: 'application/pdf', buffer: tinyPdf(['Revenue grew 12 percent in Q3 driven by new enterprise accounts', 'Supply risks remain and hiring is planned for Q4']) })
    await p.getByRole('button', { name: /Create from PDF/ }).click()
    await p.getByText('Slide outline').waitFor({ timeout: 90_000 })
    await p.getByRole('button', { name: /Make this a designed, editable presentation/ }).click()
    await p.waitForURL((u) => u.href.startsWith(EDITOR), { timeout: 15_000 })
    expect(p.url().includes('draft='), `no draft in ${p.url()}`)
  })

  await s.check('PDF tool: a non-PDF is refused in the browser', p, async () => {
    await p.goto(WEB + '/free-tools/pdf-to-presentation', { waitUntil: 'networkidle' })
    await p.setInputFiles('input[type=file]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await p.locator('p[role=alert]').waitFor({ timeout: 5000 }) // not getByRole: Next's hidden route announcer is also role=alert
  })

  // ── PDF → PPT, converted in the browser ──────────────────────────────────────────────
  const pdf = tinyPdf(['Quarterly revenue grew twelve percent', 'Hiring plan for the fourth quarter'])
  const dir = mkdtempSync(join(tmpdir(), 'pdf2ppt-'))
  const convert = async (mode) => {
    await p.goto(WEB + '/free-tools/pdf-to-ppt', { waitUntil: 'networkidle' })
    await p.setInputFiles('input[type=file]', { name: 'Report.pdf', mimeType: 'application/pdf', buffer: pdf })
    await p.getByText(mode === 'text' ? 'Editable text' : 'Exact look').first().click()
    await p.getByRole('button', { name: /Convert to PowerPoint/ }).click()
    await p.getByRole('button', { name: /Download \.pptx/ }).waitFor({ timeout: 60_000 })
    const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Download \.pptx/ }).click()])
    const path = join(dir, `${mode}.pptx`)
    await dl.saveAs(path)
    expect(dl.suggestedFilename() === 'Report.pptx', `file name ${dl.suggestedFilename()}`)
    return path
  }
  await s.check('PDF → PPT (exact look): downloads a .pptx with one slide per page and page pictures', p, async () => {
    const path = await convert('image')
    const files = execFileSync('unzip', ['-Z1', path]).toString().split('\n')
    expect(files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length === 2, `slides: ${files.filter((f) => f.includes('slides/slide')).join(',')}`)
    expect(files.some((f) => /^ppt\/media\//.test(f)), 'no page pictures in the file')
  })
  await s.check('PDF → PPT (editable text): the text is real text in the slides', p, async () => {
    const path = await convert('text')
    const xml = execFileSync('unzip', ['-p', path, 'ppt/slides/slide1.xml']).toString()
    expect(/Quarterly revenue grew twelve percent/.test(xml), 'page-1 text is not in slide 1')
    const xml2 = execFileSync('unzip', ['-p', path, 'ppt/slides/slide2.xml']).toString()
    expect(/Hiring plan/.test(xml2), 'page-2 text is not in slide 2')
  })
  await s.check('PDF → PPT: a damaged PDF gives a clear message, not a crash', p, async () => {
    await p.goto(WEB + '/free-tools/pdf-to-ppt', { waitUntil: 'networkidle' })
    await p.setInputFiles('input[type=file]', { name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 this is not really a pdf') })
    await p.getByRole('button', { name: /Convert to PowerPoint/ }).click()
    await p.locator('p[role=alert]').waitFor({ timeout: 20_000 })
  })
  await s.check('PDF → PPT: "Redesign it with AI" uploads the file and opens the editor with a draft', p, async () => {
    await p.goto(WEB + '/free-tools/pdf-to-ppt', { waitUntil: 'networkidle' })
    await p.setInputFiles('input[type=file]', { name: 'Report.pdf', mimeType: 'application/pdf', buffer: pdf })
    await p.getByRole('button', { name: /Convert to PowerPoint/ }).click()
    await p.getByRole('button', { name: /Redesign it with AI/ }).click()
    await p.waitForURL((u) => u.href.startsWith(EDITOR), { timeout: 20_000 })
    expect(p.url().includes('draft='), `no draft in ${p.url()}`)
  })

  // ── template landing pages ───────────────────────────────────────────────────────────
  await p.goto('about:blank') // the previous check ended on the editor, whose own redirect would otherwise abort the next navigation
  for (const slug of SLUGS) {
    await s.check(`/free-templates/${slug}: one h1, templates listed, no overflow at 390px`, p, async () => {
      await p.setViewportSize({ width: 390, height: 900 })
      const r = await p.goto(`${WEB}/free-templates/${slug}`, { waitUntil: 'networkidle' })
      expect(r.status() < 400, `status ${r.status()}`)
      expect(await p.locator('h1').count() === 1, 'need exactly one <h1>')
      expect(await p.locator('#templates a[href^="/templates/"]').count() >= 6, 'too few template links')
      expect(await p.locator('script[type="application/ld+json"]').count() >= 1, 'no structured data')
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(over <= 1, `horizontal overflow of ${over}px`)
    })
  }
  await p.setViewportSize({ width: 1440, height: 900 })
  await s.check('template landing: a template card opens its page, and "Use this template" goes to the editor', p, async () => {
    await p.goto(`${WEB}/free-templates/pitch-deck-templates`, { waitUntil: 'networkidle' })
    const href = await p.locator('#templates a[href^="/templates/"]').first().getAttribute('href')
    await p.goto(WEB + href, { waitUntil: 'networkidle' })
    const use = await p.getByRole('link', { name: /Use this template/i }).first().getAttribute('href')
    expect(use?.startsWith(EDITOR), `bad href ${use}`)
  })
  await s.check('unknown template collection → 404', p, async () => {
    const r = await p.goto(`${WEB}/free-templates/does-not-exist`)
    expect(r.status() === 404, `status ${r.status()}`)
  })
  await s.check('templates hub links to every collection', p, async () => {
    await p.goto(`${WEB}/templates`, { waitUntil: 'networkidle' })
    expect(await p.locator('a[href^="/free-templates/"]').count() === SLUGS.length, 'missing collection links')
  })

  await b.close()
  return s.done()
}
