import { EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * Every upload box on the site, fed the files people really send by mistake: a web page renamed .png/.pdf/.pptx/.mp3, an empty file, a program (.exe),
 * a file over the box's limit, a binary file renamed .srt. Each must answer in plain words that fit the box — never nothing, never "upload a PDF" to
 * someone who did. Files are built in memory (the browser's file filter does not apply to drops or to these, exactly like a drag-and-drop).
 * No AI is called: every one of these is refused before any model would see it.
 */
const HTML = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>')
const file = (name, buffer, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer })
const big = (name, mb, head) => { const b = Buffer.alloc(Math.ceil(mb * 1024 * 1024)); head.copy(b, 0); return file(name, b) }
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF = Buffer.from('%PDF-1.7\n')
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const ID3 = Buffer.from('ID3\x04\x00\x00')
const EXE = file('setup.exe', Buffer.from('MZ\x90\x00 not a real program'))
const fake = (ext) => file(`renamed.${ext}`, HTML)
const empty = (ext) => file(`blank.${ext}`, Buffer.alloc(0))

const EMPTY = /empty/i
const RENAMED_PDF = /named like a PDF but is not one inside|not a PDF/i

export default async function () {
  const s = suite('117-upload-edge-cases')
  const b = await launch()

  /** picks (or drops) one file into a box, presses the box's action if it has one, and returns what the person is told */
  async function answer(p, box, f) {
    await p.goto(box.url, { waitUntil: 'networkidle' })
    if (box.open) await box.open(p)
    const before = new Set((await p.locator('body').innerText()).split('\n').map((x) => x.trim()))
    await box.input(p).setInputFiles(f)
    const said = async () => (await p.locator('body').innerText()).split('\n').map((x) => x.trim()).filter((x) => x && !before.has(x) && x !== f.name && !/^\d+(\.\d+)? MB$/.test(x)).join(' ¦ ')
    await p.waitForTimeout(1200)
    if (box.action && !box.expectBeforeAction?.test(await said())) {
      const btn = box.action(p)
      if (await btn.isEnabled().catch(() => false)) await btn.click()
    }
    for (let i = 0; i < 30; i++) { const t = await said(); if (/not|empty|larger|choose|use a|refus|isn.t|only/i.test(t)) return t; await p.waitForTimeout(500) }
    return await said()
  }
  async function check(p, box, cases) {
    for (const [f, want] of cases) {
      await s.check(`${box.name}: ${f.name} → "${want.source.slice(0, 50)}"`, p, async () => {
        const t = await answer(p, box, f)
        expect(want.test(t), `told: ${t.slice(0, 220) || '(nothing)'}`)
      })
    }
  }

  try {
    // ── the website (signed out) ──────────────────────────────────────────────────────────────
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } })
    const p = await ctx.newPage()
    await check(p, { name: 'home attach', url: WEB + '/', input: (p) => p.getByLabel('Attach files') }, [
      [fake('pdf'), RENAMED_PDF], [empty('pdf'), EMPTY], [big('large.pdf', 16, PDF), /Larger than 15 MB/], [fake('png'), /need a free account/],
    ])
    const convert = (p) => p.locator('main button', { hasText: /convert/i }).first()
    await check(p, { name: 'pdf to ppt', url: WEB + '/free-tools/pdf-to-ppt', input: (p) => p.getByLabel('Choose a PDF'), action: convert }, [
      [fake('pdf'), RENAMED_PDF], [empty('pdf'), RENAMED_PDF], [EXE, /choose a PDF/i],
    ])
    await check(p, { name: 'pdf to presentation', url: WEB + '/free-tools/pdf-to-presentation', input: (p) => p.getByLabel('Choose a PDF'), action: (p) => p.locator('main button', { hasText: /create from/i }).first() }, [
      [fake('pdf'), /named like a PDF but is not one inside/], [empty('pdf'), EMPTY], [big('large.pdf', 6, PDF), /larger than 5 MB/],
    ])
    await check(p, { name: 'video to slides', url: WEB + '/free-tools/video-to-slides', input: (p) => p.getByLabel('Choose a recording'), action: (p) => p.locator('main button', { hasText: /transcrib|turn|make|create/i }).first() }, [
      [fake('mp3'), /web or text file, not a recording/], [empty('mp3'), EMPTY], [big('long.mp3', 5, ID3), /larger than 4 MB/],
    ])
    await check(p, { name: 'captions', url: WEB + '/free-tools/youtube-transcript-to-slides', input: (p) => p.getByLabel('Load a caption file') }, [
      [file('renamed.srt', Buffer.from([0, 1, 2, 3, 255, 254, 0, 0])), /not a caption or text file/], [empty('srt'), EMPTY], [EXE, /Choose a caption file/],
    ])
    await check(p, { name: 'merge pdf', url: WEB + '/free-tools/merge-pdf', input: (p) => p.getByLabel('Choose PDFs') }, [
      [fake('pdf'), /is not a PDF/], [empty('pdf'), /is not a PDF/],
    ])
    await check(p, { name: 'support', url: WEB + '/support', input: (p) => p.getByLabel('Choose screenshots') }, [
      [fake('png'), /is not a PNG, JPG or WebP picture/], [empty('png'), EMPTY], [big('shot.png', 6, PNG), /larger than 5 MB/],
    ])
    await ctx.close()

    // ── the editor (signed in) ────────────────────────────────────────────────────────────────
    const A = await person(b, 'uploads', 'gold')
    const deck = (await api.post(A, '/presentations', { templateId: 'pitch-launchpad' })).data.id
    const toolbar = async (p) => { await p.getByRole('toolbar', { name: 'Editor toolbar' }).waitFor({ timeout: 20000 }) }
    const sources = { name: 'add sources', url: EDITOR + '/', open: async (p) => { await p.getByRole('button', { name: /Add files or links/ }).click(); await p.getByRole('dialog', { name: 'Add sources' }).waitFor() }, input: (p) => p.getByRole('dialog', { name: 'Add sources' }).getByLabel('File', { exact: true }), action: (p) => p.getByRole('dialog', { name: 'Add sources' }).locator('button[type=submit]') }
    await check(A.p, sources, [[fake('pdf'), /named like a PDF but is not one inside/], [empty('pdf'), EMPTY], [fake('png'), /not a JPG, PNG or WebP picture/], [big('large.png', 9, PNG), /larger than 8 MB/]])
    await check(A.p, { name: 'remix a PowerPoint', url: EDITOR + '/', open: async (p) => { await p.getByTestId('start-from').click(); await p.getByTestId('remix-pptx-open').click() }, input: (p) => p.getByTestId('remix-file-input') }, [
      [fake('pptx'), /named like a PowerPoint file but is not one inside/], [empty('pptx'), EMPTY], [EXE, /Choose a PowerPoint \(\.pptx\) file/], [big('large.pptx', 16, ZIP), /larger than 15 MB/],
    ])
    await check(A.p, { name: "use a file's design", url: EDITOR + '/', open: async (p) => { await p.getByTestId('start-from').click(); await p.getByTestId('file-tpl-open').click() }, input: (p) => p.getByTestId('file-tpl-input') }, [
      [fake('pptx'), /not a PowerPoint/], [big('large.pptx', 16, ZIP), /larger than 15 MB/],
    ])
    await check(A.p, { name: 'insert picture', url: `${EDITOR}/edit/${deck}`, open: toolbar, input: (p) => p.getByTestId('insert-file') }, [
      [fake('png'), /Use a PNG or JPEG picture/], [empty('png'), /Use a PNG or JPEG picture/], [big('large.png', 9, PNG), /larger than 8 MB/],
    ])
    await A.ctx.close()
  } finally { await b.close() }
  return s.done()
}
