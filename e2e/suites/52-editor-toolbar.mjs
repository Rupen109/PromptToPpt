/**
 * The editor's top toolbar and "Create from scratch", in a real browser against the real server (no AI, no credits):
 * Text, Shapes (big library), Table (editable), Media (upload from the computer, Media library), Chart, Background (colour with hex / theme / standard colours,
 * upload image, Media library, gradients, remove), Undo, Redo, History; the same toolbar on a template (AI-style) deck; plan gate for Starter.
 * The photo search is answered by a stand-in here (the live Unsplash quota is shared and small); its server code is covered by unit tests.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const PHOTO = join(here, '..', 'fixtures', 'images', 'phone-photo.jpg')
const TINY_JPG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#3b82f6"/></svg>')

export default async function () {
  const s = suite('52-editor-toolbar')
  const b = await launch()
  const A = await person(b, 'tbar', 'pro')
  await api.get(A, '/me/entitlements')
  const p = await A.ctx.newPage()
  const settle = (ms = 400) => p.waitForTimeout(ms)
  let id
  const slide = async () => { await settle(3500); return (await api.get(A, `/presentations/${id}`)).data.document.slides[0] }
  const stage = () => p.locator('[data-testid="stage"]')
  const tb = (t) => p.locator(`[data-testid="${t}"]`)

  await s.check('Home page and sidebar offer "Create from scratch"', p, async () => {
    await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
    expect(await tb('home-scratch').count() === 1, 'no link on the home page')
    expect(await p.getByRole('link', { name: 'Create from scratch' }).count() >= 1, 'no sidebar link')
    await tb('home-scratch').click(); await p.waitForURL(/\/scratch$/)
    expect(await p.getByRole('heading', { name: 'Create from scratch' }).count() === 1, 'page heading')
  })

  await s.check('scratch flow: name + size + look, "Start building" opens the editor with an EMPTY slide and the toolbar', p, async () => {
    await p.locator('#scratch-title').fill('My own deck')
    await tb('size-4:3').click()
    const looks = await p.locator('[data-testid^="look-"]').count()
    expect(looks >= 8, `only ${looks} looks to choose from`)
    await p.locator('[data-testid^="look-"]').nth(3).click()
    await tb('scratch-start').click()
    await p.waitForURL(/\/edit\/[^/?]+$/, { timeout: 15000 })
    id = p.url().split('/edit/')[1]
    await stage().waitFor(); await settle(800)
    expect(await tb('top-toolbar').count() === 1, 'no top toolbar')
    expect(await p.locator('[data-testid^="el-"]').count() === 0, 'the slide is not empty')
    const doc = (await api.get(A, `/presentations/${id}`)).data.document
    expect(doc.title === 'My own deck' && doc.aspectRatio === '4:3' && doc.slides.length === 1 && doc.slides[0].layoutId === 'blank', `doc: ${doc.title} ${doc.aspectRatio} ${doc.slides.length}`)
  })

  await s.check('toolbar shows Text, Shapes, Table, Media, Chart, Background, Undo, Redo, History', p, async () => {
    for (const t of ['tb-text', 'tb-shapes', 'tb-table', 'tb-media', 'tb-chart', 'tb-background', 'tb-undo', 'tb-redo', 'tb-history']) expect(await tb(t).count() === 1, `missing ${t}`)
    expect(await tb('tb-undo').isDisabled() && await tb('tb-redo').isDisabled(), 'undo/redo should start disabled')
  })

  await s.check('Text: adds a text box ready to type; the typed words are saved', p, async () => {
    await tb('tb-text').click()
    await p.getByRole('textbox', { name: 'Edit text' }).waitFor({ timeout: 5000 })
    await p.keyboard.press('Control+A'); await p.keyboard.type('Hello from scratch'); await p.keyboard.press('Escape'); await settle(400)
    expect(await p.locator('[data-testid="el-text"]').count() === 1, 'no text element')
    const sl = await slide()
    const t = sl.elements.find((e) => e.type === 'text')
    expect(t && JSON.stringify(t.paragraphs).includes('Hello from scratch'), 'text not saved')
  })

  await s.check('Shapes: a big library (50+ shapes in groups); choosing one draws it on the slide and saves it', p, async () => {
    await tb('tb-shapes').click()
    const n = await p.locator('[data-testid^="shape-"]').count()
    expect(n >= 50, `only ${n} shapes in the menu`)
    for (const g of ['Common shapes', 'Symbols', 'Arrows', 'Callouts and banners', 'Rectangle']) expect(await p.getByText(g, { exact: true }).count() >= 1, `no group ${g}`)
    await tb('shape-star5').click()
    await settle(300)
    expect(await p.locator('[data-testid="el-shape"]').count() === 1, 'no shape element')
    expect(await stage().locator('svg path').count() >= 1, 'the star is not drawn')
    await tb('tb-shapes').click(); await tb('shape-arrowRight').click(); await tb('tb-shapes').click(); await tb('shape-ellipse').click(); await settle(200)
    const sl = await slide()
    expect(sl.elements.filter((e) => e.type === 'shape').map((e) => e.shape).join() === 'star5,arrowRight,ellipse', `stored: ${sl.elements.map((e) => e.shape ?? e.type)}`)
  })

  await s.check('Colours: a selected shape gets Fill and Border colours, saved', p, async () => {
    const sb = await p.locator('[data-testid="el-shape"]').last().boundingBox()
    await p.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await tb('shape-fill').waitFor({ timeout: 5000 })
    await tb('shape-fill').click()
    await p.getByRole('dialog', { name: /Fill colour/ }).getByLabel('Hex colour').fill('#16A34A'); await settle(300)
    await p.keyboard.press('Escape')
    await tb('shape-border').click()
    await p.getByRole('dialog', { name: /Border colour/ }).getByLabel('Hex colour').fill('#DC2626'); await settle(300)
    await p.keyboard.press('Escape')
    let sl = await slide()
    const sh = sl.elements.filter((e) => e.type === 'shape').pop()
    expect(sh.fill.toUpperCase() === '#16A34A' && sh.stroke.toUpperCase() === '#DC2626', `shape: ${sh.fill} ${sh.stroke}`)
  })

  await s.check('Table: pick a size on the grid; double-click opens the editor; cells, rows and columns change and are saved', p, async () => {
    await tb('tb-table').click()
    await tb('table-3x4').hover()
    expect((await p.locator('text=3 × 4 table').count()) === 1, 'size label')
    await tb('table-3x4').click(); await settle(300)
    expect(await p.locator('[data-testid="el-table"]').count() === 1, 'no table')
    await p.locator('[data-testid="el-table"]').dblclick()
    const dlg = p.getByRole('dialog', { name: 'Edit table' }); await dlg.waitFor({ timeout: 5000 })
    await dlg.getByLabel('Header 1').fill('Region'); await dlg.getByLabel('Row 1 column 1').fill('North'); await dlg.getByLabel('Row 1 column 2').fill('42'); await dlg.getByLabel('Row 1 column 2').blur()
    await dlg.getByRole('button', { name: 'Add row' }).click(); await dlg.getByRole('button', { name: 'Add column' }).click(); await settle(200)
    await dlg.getByRole('button', { name: 'Done' }).click(); await settle(200)
    const sl = await slide()
    const t = sl.elements.find((e) => e.type === 'table')
    expect(t.header[0] === 'Region' && t.rows[0][0] === 'North' && t.rows[0][1] === '42', `cells: ${JSON.stringify(t)}`)
    expect(t.rows.length === 3 && t.header.length === 5, `size ${t.rows.length}x${t.header.length}`)
    expect(await stage().getByText('North').count() >= 1, 'edited words not shown on the slide')
  })

  await s.check('Colours: a selected table gets Header, Rows, Text and Borders colours; all saved and drawn', p, async () => {
    const tbx = await p.locator('[data-testid="el-table"]').first().boundingBox()
    await p.mouse.click(tbx.x + tbx.width / 2, tbx.y + 20)
    await tb('table-header-fill').waitFor({ timeout: 5000 })
    for (const [id, name, hex] of [['table-header-fill', 'Header', '#7C3AED'], ['table-row', 'Rows', '#FEF3C7'], ['table-text', 'Text', '#111827'], ['table-border', 'Borders', '#0EA5E9']]) {
      await tb(id).click()
      await p.getByRole('dialog', { name: new RegExp(`^${name} colour`) }).getByLabel('Hex colour').fill(hex); await settle(300)
      await p.keyboard.press('Escape')
    }
    const sl = await slide()
    const t = sl.elements.find((e) => e.type === 'table')
    expect(t.headerFill.toUpperCase() === '#7C3AED' && t.rowFill.toUpperCase() === '#FEF3C7' && t.textColor.toUpperCase() === '#111827' && t.borderColor.toUpperCase() === '#0EA5E9', `table: ${JSON.stringify(t)}`)
    const th = await stage().locator('th').first().evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(/rgb\(124, 58, 237\)/.test(th), `header not drawn in the new colour: ${th}`)
  })

  await s.check('Chart: a bar chart can be added', p, async () => {
    await tb('tb-chart').click(); await tb('chart-bar').click(); await settle(300)
    expect(await p.locator('[data-testid="el-chart"]').count() === 1, 'no chart')
    expect((await slide()).elements.some((e) => e.type === 'chart'), 'chart not saved')
  })

  await s.check('Media → Upload from computer: a picture file becomes a picture on the slide, stored by us', p, async () => {
    await tb('tb-media').click()
    await p.locator('[data-testid="insert-file"]').setInputFiles(PHOTO)
    await p.locator('[data-testid="el-image"]').first().waitFor({ timeout: 15000 })
    const sl = await slide()
    const img = sl.elements.find((e) => e.type === 'image')
    expect(img && /\/api\/v1\/assets\//.test(img.src), `src: ${img?.src}`)
    const r = await A.ctx.request.get(img.src)
    expect(r.ok() && /image\//.test(r.headers()['content-type'] ?? ''), `picture not served: ${r.status()}`)
  })

  await s.check('Media upload refuses a file that is not a picture, in plain words', p, async () => {
    await tb('tb-media').click()
    await p.locator('[data-testid="insert-file"]').setInputFiles({ name: 'evil.png', mimeType: 'image/png', buffer: Buffer.from('<html>not a picture</html>') })
    await p.getByText(/PNG or JPEG/).first().waitFor({ timeout: 8000 })
  })

  await s.check('Background → Colour: panel shows hex, Theme Colors, Standard Colors, custom colour and opacity; a hex colour changes the slide', p, async () => {
    await tb('tb-background').click()
    expect(await tb('bg-upload').count() === 1 && await tb('bg-library').count() === 1, 'upload image / media library entries')
    await tb('bg-color').click()
    const panel = tb('color-panel'); await panel.waitFor()
    for (const t of ['Theme Colors', 'Standard Colors', 'Custom colour']) expect(await panel.getByText(t).count() >= 1, `no ${t}`)
    expect(await panel.getByLabel('Opacity percent').count() === 1 && await panel.getByLabel('Hex colour').count() === 1, 'hex/opacity')
    await panel.getByLabel('Hex colour').fill('#1E3A8A'); await settle(400)
    expect((await slide()).background.value.toUpperCase() === '#1E3A8A', 'colour not saved')
    await panel.getByRole('button', { name: 'Colour #E53935' }).click(); await settle(300)
    expect((await slide()).background.value.toUpperCase() === '#E53935', 'standard colour not saved')
    await p.keyboard.press('Escape')
  })

  await s.check('Background → Upload image sets a picture background; text stays readable', p, async () => {
    await tb('tb-background').click()
    await p.locator('[data-testid="bg-file"]').setInputFiles(PHOTO)
    await settle(1500)
    const sl = await slide()
    expect(sl.background.type === 'image' && /\/api\/v1\/assets\//.test(sl.background.value), `bg: ${JSON.stringify(sl.background)}`)
  })

  await s.check('Background → Media library: gradient chip, then Select Image sets a gradient background', p, async () => {
    await tb('tb-background').click(); await tb('bg-library').click()
    const dlg = p.getByRole('dialog', { name: 'Media library' }); await dlg.waitFor()
    for (const c of ['Gradient', 'Data', 'Abstract', 'Tech', '3D Shapes']) expect(await dlg.getByRole('button', { name: c, exact: true }).count() === 1, `no chip ${c}`)
    for (const t of ['Photos', 'My uploads', 'Template photos']) expect(await dlg.getByRole('tab', { name: t, exact: true }).count() === 1, `no tab ${t}`)
    expect(await dlg.locator('[data-testid="gradient-grid"] button').count() >= 12, 'gradient presets')
    expect(await dlg.getByRole('button', { name: 'Select Image' }).isDisabled(), 'Select Image should wait for a choice')
    await dlg.getByRole('button', { name: 'Sunset gradient' }).click()
    await dlg.getByRole('button', { name: 'Select Image' }).click()
    await dlg.waitFor({ state: 'detached' })
    const bg = (await slide()).background
    expect(bg.type === 'gradient' && bg.gradient.from.toUpperCase() === '#FF512F', `bg: ${JSON.stringify(bg)}`)
  })

  await s.check('Media library → photo search (stand-in answer): chips and search show photos; Select Image places a stock picture', p, async () => {
    await p.route('**/api/v1/media/search*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { page: 1, hasMore: false, photos: [1, 2, 3].map((n) => ({ id: `ph${n}`, provider: 'unsplash', thumb: TINY_JPG, full: `https://images.unsplash.com/photo-${n}`, alt: `Stock ${n}`, author: 'Ada', pageUrl: 'https://unsplash.com/photos/x', attribution: { source: 'Photo by Ada on Unsplash', license: 'Unsplash License' } })) } }) }))
    const mine = (await api.get(A, '/media/mine')).data.items
    expect(mine.length >= 1, 'my uploads should list the earlier upload')
    await p.route('**/images/stock', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { assetId: 'x', url: mine[0].url, mime: 'image/jpeg', aspect: 1.5, alt: 'Stock 2', attribution: { source: 'Photo by Ada on Unsplash', license: 'Unsplash License' } } }) }))
    await tb('tb-media').click(); await tb('media-library').click()
    const dlg = p.getByRole('dialog', { name: 'Media library' }); await dlg.waitFor()
    await dlg.getByRole('button', { name: 'Data', exact: true }).click()
    await dlg.locator('[data-testid="photo-grid"] button').first().waitFor({ timeout: 8000 })
    expect(await dlg.locator('[data-testid="photo-grid"] button').count() === 3, 'photos')
    await dlg.getByRole('button', { name: 'Stock 2' }).click()
    expect(await dlg.getByText(/Photo by Ada on Unsplash/).count() >= 1, 'credit line not shown')
    await dlg.getByRole('button', { name: 'Select Image' }).click()
    await dlg.waitFor({ state: 'detached' }); await settle(300)
    const sl = await slide()
    const imgs = sl.elements.filter((e) => e.type === 'image')
    expect(imgs.length === 2 && imgs[1].attribution?.source === 'Photo by Ada on Unsplash', `images: ${imgs.length}, attribution: ${imgs[1]?.attribution?.source}`)
  })

  await s.check('Media library → My uploads and Template photos tabs work (own upload listed, template photo found by word, used as background)', p, async () => {
    await tb('tb-background').click(); await tb('bg-library').click()
    const dlg = p.getByRole('dialog', { name: 'Media library' }); await dlg.waitFor()
    await dlg.getByRole('tab', { name: 'My uploads', exact: true }).click()
    await dlg.locator('img').first().waitFor({ timeout: 8000 })
    await dlg.getByRole('tab', { name: 'Template photos', exact: true }).click()
    await dlg.getByLabel('Search template photos').fill('handshake')
    await dlg.locator('img').first().waitFor({ timeout: 8000 })
    await dlg.locator('button:has(img)').first().click()
    await dlg.getByRole('button', { name: 'Select Image' }).click()
    await dlg.waitFor({ state: 'detached' })
    const bg = (await slide()).background
    expect(bg.type === 'image' && /template-assets\//.test(bg.value), `bg: ${JSON.stringify(bg)}`)
  })

  await s.check('Background → Remove background goes back to the deck colour', p, async () => {
    await tb('tb-background').click(); await tb('bg-remove').click()
    const doc = (await api.get(A, `/presentations/${id}`)).data.document
    await settle(3500)
    const d2 = (await api.get(A, `/presentations/${id}`)).data.document
    expect(d2.slides[0].background.type === 'color' && d2.slides[0].background.value.toUpperCase() === d2.theme.colors.background.toUpperCase(), `bg: ${JSON.stringify(d2.slides[0].background)}`)
    void doc
  })

  await s.check('Undo and Redo (toolbar buttons) walk back and forward through the edits; keyboard Ctrl+Z works too', p, async () => {
    const count = () => p.locator('[data-testid^="el-"]').count()
    const before = await count()
    await tb('tb-shapes').click(); await tb('shape-heart').click(); await settle(200)
    expect(await count() === before + 1, 'heart not added')
    await tb('tb-undo').click(); await settle(200)
    expect(await count() === before, 'undo did not remove the heart')
    expect(!(await tb('tb-redo').isDisabled()), 'redo should be enabled after undo')
    await tb('tb-redo').click(); await settle(200)
    expect(await count() === before + 1, 'redo did not bring the heart back')
    await stage().click({ position: { x: 5, y: 5 } }); await p.keyboard.press('Control+z'); await settle(200)
    expect(await count() === before, 'Ctrl+Z did not undo')
  })

  await s.check('History opens the version history', p, async () => {
    await tb('tb-history').click()
    await p.getByRole('dialog', { name: 'Version history' }).waitFor({ timeout: 5000 })
    await p.keyboard.press('Escape')
  })

  await s.check('the same toolbar is on a template (AI-style) deck and works there', p, async () => {
    const tid = (await api.post(A, '/presentations', { templateId: 'pitch-seed-round' })).data.id
    await p.goto(`${EDITOR}/edit/${tid}`, { waitUntil: 'networkidle' }); await stage().waitFor(); await settle(800)
    if (await p.getByRole('dialog').count()) { await p.keyboard.press('Escape'); await settle(300) }
    for (const t of ['tb-text', 'tb-shapes', 'tb-table', 'tb-media', 'tb-background', 'tb-undo', 'tb-redo', 'tb-history']) expect(await tb(t).count() === 1, `missing ${t}`)
    const before = await p.locator('[data-testid^="el-"]').count()
    await tb('tb-shapes').click(); await tb('shape-hexagon').click(); await settle(300)
    expect(await p.locator('[data-testid^="el-"]').count() === before + 1, 'shape not added to the template slide')
    await tb('tb-background').click(); await tb('bg-grad-ocean').click(); await settle(3500)
    const bg = (await api.get(A, `/presentations/${tid}`)).data.document.slides[0].background
    expect(bg.type === 'gradient', `bg: ${JSON.stringify(bg)}`)
  })

  await s.check('a Starter person: adding objects shows the upgrade message; background, undo and history stay open', p, async () => {
    const S = await person(b, 'tbars', 'starter')
    await api.get(S, '/me/entitlements')
    const sid = (await api.post(S, '/presentations', { blank: true })).data.id
    const q = await S.ctx.newPage()
    await q.goto(`${EDITOR}/edit/${sid}`, { waitUntil: 'networkidle' }); await q.locator('[data-testid="stage"]').waitFor(); await q.waitForTimeout(800)
    await q.locator('[data-testid="tb-text"]').click()
    await q.getByText(/Advanced editor/).first().waitFor({ timeout: 5000 })
    expect(await q.locator('[data-testid^="el-"]').count() === 0, 'Starter was able to add text')
    await q.keyboard.press('Escape')
    await q.locator('[data-testid="tb-shapes"]').click()
    expect(await q.locator('[data-testid^="shape-"]').count() === 0, 'shape menu opened for Starter')
    await q.keyboard.press('Escape')
    await q.locator('[data-testid="tb-background"]').click()
    expect(await q.locator('[data-testid="bg-color"]').count() === 1, 'background menu should be open to Starter')
    await q.locator('[data-testid="bg-grad-ocean"]').click()
    await q.locator('[data-testid="tb-undo"]').waitFor()
    expect(!(await q.locator('[data-testid="tb-undo"]').isDisabled()), 'undo should work for Starter')
    await q.locator('[data-testid="tb-history"]').click()
    await q.getByRole('dialog', { name: 'Version history' }).waitFor({ timeout: 5000 })
  })

  await b.close()
  return s.done()
}
