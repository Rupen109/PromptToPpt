/**
 * Write the edited file with pdf-lib, IN PLACE (see inplace.ts): the original document is modified, so outline, form, labels, metadata and tags survive.
 * The visitor's items are drawn on top of the original page content (appended content streams), page turns are written as /Rotate.
 * pdf-lib is loaded only when this runs.
 */
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import { finishDocument, planPages, pruneUnusedXObjects, readLabels, stripSignatures, widgetPages } from './inplace'
import { boxToUser, toUser, type Point } from './geometry'
import { reencodePng } from './images'
import { HIGHLIGHT_OPACITY, type AlphaMask, type Anno, type Geom, type PageState, type PathAnno, type ShapeAnno, type TextAnno } from './model'
import { baselineAt, fontKey, hasRtl, lineStyles, needsShaping, stretches, textLines, textToPng } from './text'
import { fontBytes, fontDef, styleOf } from './fonts'
import { applyForm, type FormValues } from './forms'

export class ExportError extends Error { name = 'ExportError' }

const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1]!, 16) : 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

type Lib = typeof import('pdf-lib')
/** layout features off: glyphs are the plain letters of the font, in the order given */
const NO_SHAPING = Object.fromEntries(['liga', 'clig', 'calt', 'rlig', 'ccmp', 'locl', 'init', 'medi', 'fina', 'isol', 'mark', 'mkmk', 'kern', 'dist', 'curs', 'rphf', 'pref', 'blwf', 'abvf', 'half', 'pstf', 'vatu', 'cjct', 'nukt', 'akhn', 'haln', 'pres', 'abvs', 'blws', 'psts'].map((k) => [k, false]))

/** everything needed to draw one page; keeps caches shared across pages */
class Painter {
  private fonts = new Map<string, PDFFont>()
  private images = new Map<Uint8Array, PDFImage>()
  constructor(private lib: Lib, private doc: PDFDocument) {}

  private color(hex: string) { const [r, g, b] = hexRgb(hex); return this.lib.rgb(r, g, b) }
  private fontkitReady = false
  private charsets = new Map<PDFFont, Set<number>>()
  /** a font of the file for this look: a standard font (nothing embedded) or an open-licence font embedded as a subset (bytes fetched once) */
  private async font(fam: TextAnno['fam'], bold: boolean, italic: boolean): Promise<PDFFont> {
    const def = fontDef(fam)
    const key = def.std ? fontKey(fam, bold, italic) : `${fam}:${styleOf(bold, italic)}`
    let f = this.fonts.get(key)
    if (!f) {
      if (def.std) f = await this.doc.embedFont(this.lib.StandardFonts[fontKey(fam, bold, italic)])
      else { f = await this.embedFile(await fontBytes(fam, styleOf(bold, italic))) }
      this.fonts.set(key, f)
    }
    return f
  }
  private async embedFile(bytes: Uint8Array, features?: Record<string, boolean>): Promise<PDFFont> {
    if (!this.fontkitReady) { await import('regenerator-runtime/runtime'); this.doc.registerFontkit((await import('@pdf-lib/fontkit')).default); this.fontkitReady = true }
    return this.doc.embedFont(bytes, { subset: true, ...(features ? { features } : {}) })
  }
  private covers(f: PDFFont, text: string): boolean {
    let set = this.charsets.get(f); if (!set) { set = new Set(f.getCharacterSet()); this.charsets.set(f, set) }
    for (const ch of text) { if (ch === '\n') continue; if (!set.has(ch.codePointAt(0)!)) return false }
    return true
  }
  private async image(bytes: Uint8Array, mime: string): Promise<PDFImage> {
    let img = this.images.get(bytes)
    if (img) return img
    try { img = mime === 'image/png' ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes) }
    catch { img = await this.doc.embedPng(await reencodePng(bytes)) } // odd PNG/JPEG variants: let the browser decode it and embed a plain PNG
    this.images.set(bytes, img)
    return img
  }

  /**
   * A JPEG with a soft mask: the JPEG goes in as it is (pdf-lib's own JPEG embedding), and the image gets an /SMask entry, an 8-bit grey image of the same size
   * (Flate-packed: a mask that is solid except at the corners is a few hundred bytes). pdf-lib has no call for this, so the embedder's last step is extended.
   */
  private async maskedJpeg(bytes: Uint8Array, mask: AlphaMask): Promise<PDFImage> {
    const key = this.images.get(bytes)
    if (key) return key
    const { context } = this.doc
    const embedder = await this.lib.JpegEmbedder.for(bytes)
    if (embedder.width !== mask.w || embedder.height !== mask.h) throw new ExportError('A picture and its see-through plane do not match.')
    const inner = embedder.embedIntoContext.bind(embedder)
    embedder.embedIntoContext = async (ctx, ref) => {
      const maskRef = ctx.register(ctx.flateStream(mask.data, { Type: 'XObject', Subtype: 'Image', Width: mask.w, Height: mask.h, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }))
      const done = await inner(ctx, ref)
      const xo = ctx.lookup(done) as { dict?: import('pdf-lib').PDFDict } | undefined
      if (!xo?.dict) throw new ExportError('Could not attach the see-through plane to a picture.')
      xo.dict.set(this.lib.PDFName.of('SMask'), maskRef)
      return done
    }
    const img = this.lib.PDFImage.of(context.nextRef(), this.doc, embedder)
    await img.embed() // pdf-lib only embeds the pictures it made itself when the file is saved; this one is embedded now
    this.images.set(bytes, img)
    return img
  }

  async paint(page: PDFPage, g: Geom, annos: Anno[]): Promise<void> {
    for (const a of annos) await this.one(page, g, a)
  }

  private async one(page: PDFPage, g: Geom, a: Anno): Promise<void> {
    const { degrees } = this.lib
    const rotate = degrees(g.rotate)
    // items are drawn from their bottom-left corner as seen on screen, turned by the page's own /Rotate (and by their own `rot`: text that was turned on the page)
    const corner = (): Point => this.pt(g, a, a.x, a.y + a.h)
    const turnedBy = a.kind === 'whiteout' || a.kind === 'text' ? degrees(g.rotate - (a.rot ?? 0)) : rotate
    switch (a.kind) {
      case 'whiteout': { const [x, y] = corner(); if (a.patch) { page.drawImage(await this.image(a.patch.bytes, 'image/png'), { x, y, width: a.w, height: a.h, rotate: turnedBy }); return } page.drawRectangle({ x, y, width: a.w, height: a.h, rotate: turnedBy, color: this.color(a.color), borderWidth: 0 }); return }
      case 'highlight': { const [x, y] = corner(); page.drawRectangle({ x, y, width: a.w, height: a.h, rotate, color: this.color(a.color), opacity: HIGHLIGHT_OPACITY, blendMode: this.lib.BlendMode.Multiply, borderWidth: 0 }); return }
      case 'image': { const [x, y] = corner(); page.drawImage(a.alpha && a.mime === 'image/jpeg' ? await this.maskedJpeg(a.bytes, a.alpha) : await this.image(a.bytes, a.mime), { x, y, width: a.w, height: a.h, rotate }); return }
      case 'shape': return this.shape(page, g, a)
      case 'path': return this.path(page, g, a)
      case 'text': return this.text(page, g, a)
    }
  }

  /** a point of an item's own (unturned) box in user space: items with `rot` are turned about the box's top-left corner first */
  private pt(g: Geom, a: { x: number; y: number; w: number; h: number; rot?: number }, px: number, py: number): Point {
    const r = (a as { rot?: number }).rot ?? 0
    if (!r) return toUser(g, px, py)
    const cx = a.x, cy = a.y, t = (r * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t), dx = px - cx, dy = py - cy
    return toUser(g, cx + dx * c - dy * s, cy + dx * s + dy * c)
  }

  private shape(page: PDFPage, g: Geom, a: ShapeAnno): void {
    const stroke = a.width > 0 ? { borderColor: this.color(a.stroke), borderWidth: a.width } : { borderWidth: 0 }
    const fill = a.fill ? { color: this.color(a.fill) } : {}
    if (a.shape === 'rect') {
      const [x, y] = toUser(g, a.x, a.y + a.h)
      page.drawRectangle({ x, y, width: a.w, height: a.h, rotate: this.lib.degrees(g.rotate), ...stroke, ...fill })
      return
    }
    const [cx, cy] = toUser(g, a.x + a.w / 2, a.y + a.h / 2)
    const b = boxToUser(g, a)
    page.drawEllipse({ x: cx, y: cy, xScale: b.w / 2, yScale: b.h / 2, ...stroke, ...fill })
  }

  private path(page: PDFPage, g: Geom, a: PathAnno): void {
    const pts: Point[] = a.points.map(([nx, ny]) => [a.x + nx * a.w, a.y + ny * a.h])
    if (pts.length === 1) pts.push([pts[0]![0] + 0.01, pts[0]![1]])
    const color = this.color(a.color)
    const seg = (p: Point, q: Point) => {
      const [x1, y1] = toUser(g, p[0], p[1]), [x2, y2] = toUser(g, q[0], q[1])
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: a.width, color, lineCap: this.lib.LineCapStyle.Round })
    }
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1]!, pts[i]!)
    if (a.variant === 'arrow' && pts.length >= 2) {
      const p = pts[0]!, q = pts[pts.length - 1]!
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), len = Math.max(8, a.width * 4)
      for (const s of [-1, 1]) seg(q, [q[0] - len * Math.cos(ang + s * 0.5), q[1] - len * Math.sin(ang + s * 0.5)])
    }
  }

  private async text(page: PDFPage, g: Geom, a: TextAnno): Promise<void> {
    if (!a.text.trim()) return
    const rotate = this.lib.degrees(g.rotate - (a.rot ?? 0))
    if (!needsShaping(a.text)) {
      try {
        // every font and glyph is checked BEFORE anything is drawn: one missing character sends the whole text to the picture path (the same glyphs the screen shows)
        const plan = textLines(a).map((line, i) => ({ i, parts: line ? stretches(line, lineStyles(a, i)) : [] }))
        const fonts = new Map<string, PDFFont>()
        for (const l of plan) for (const p of l.parts) {
          const k = `${p.bold}${p.italic}`; let f = fonts.get(k)
          if (!f) { f = await this.font(a.fam, p.bold, p.italic); fonts.set(k, f) }
          if (!this.covers(f, p.text)) throw new Error('glyph missing')
        }
        const color = this.color(a.color)
        for (const l of plan) {
          let off = 0
          for (const p of l.parts) {
            const font = fonts.get(`${p.bold}${p.italic}`)!
            if (p.text.trim()) { const [x, y] = this.pt(g, a, a.x + off, a.y + baselineAt(a, l.i)); page.drawText(p.text, { x, y, size: a.size, font, color, rotate }) }
            off += font.widthOfTextAtSize(p.text, a.size)
          }
        }
        return
      } catch { /* a character the font cannot write after all: fall through to the picture */ }
    }
    // Arabic, Hindi and the like: the picture has the right shapes; behind it goes an invisible text layer (render mode 3) so the saved file can be searched and copied
    await this.hiddenText(page, g, a)
    const png = await textToPng(a)
    const img = await this.doc.embedPng(png)
    const [x, y] = this.pt(g, a, a.x, a.y + a.h)
    page.drawImage(img, { x, y, width: a.w, height: a.h, rotate })
  }

  /**
   * The words as real, invisible text under the picture. Needs a font that has the letters: Noto Sans Arabic or Noto Sans Devanagari (fetched only now, embedded as a
   * subset). Arabic is written as one run (the letters are in reading order and the file's text map gives them back exactly); Devanagari one character at a time,
   * because the shaper would otherwise reorder vowel signs in the glyph stream and the copied text would come out in the wrong order.
   * No shaping features are used: the layer is never seen, only read.
   */
  private async hiddenText(page: PDFPage, g: Geom, a: TextAnno): Promise<void> {
    try {
      const arabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFEFF]/.test(a.text), deva = /[\u0900-\u097F]/.test(a.text)
      if (!arabic && !deva) return
      const key = arabic ? 'notoarabic' : 'notodeva'
      let font = this.fonts.get(key)
      if (!font) {
        const bytes = await fetch(`/pdf-fonts/${key}-regular.ttf`).then(async (r) => { if (!r.ok) throw new Error('font'); return new Uint8Array(await r.arrayBuffer()) })
        font = await this.embedFile(bytes, NO_SHAPING); this.fonts.set(key, font)
      }
      const set = new Set(font.getCharacterSet())
      const rotate = this.lib.degrees(g.rotate - (a.rot ?? 0))
      page.pushOperators(this.lib.pushGraphicsState(), this.lib.setTextRenderingMode(this.lib.TextRenderingMode.Invisible))
      textLines(a).forEach((raw, i) => {
        const line = [...raw].filter((ch) => set.has(ch.codePointAt(0)!)).join('')
        if (!line.trim()) return
        const width = font!.widthOfTextAtSize(line, a.size)
        const start = hasRtl(raw) ? Math.max(a.x, a.x + a.w - width) : a.x
        if (arabic && !/[A-Za-z0-9\u0900-\u097F]/.test(line)) { const [x, y] = this.pt(g, a, start, a.y + baselineAt(a, i)); page.drawText(line, { x, y, size: a.size, font: font!, rotate }); return }
        // characters one by one in the order PDF viewers expect for right-to-left words (each Arabic run reversed, like a visual layout): a viewer then gives the typed words back
        const ordered = [...line.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFEFF][\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFEFF 0-9]*[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFEFF]|[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFEFF]/g, (m) => [...m].reverse().join(''))]
        let off = 0
        for (const ch of ordered) { const [x, y] = this.pt(g, a, start + off, a.y + baselineAt(a, i)); page.drawText(ch, { x, y, size: a.size, font: font!, rotate }); off += font!.widthOfTextAtSize(ch, a.size) }
      })
      page.pushOperators(this.lib.popGraphicsState())
    } catch (e) { console.warn('text layer skipped', e) /* no text layer is better than a failed save: the picture alone is still correct */ }
  }

}

/** What the saved file is, for the page to tell the visitor */
export interface ExportOptions {
  /** the password that opened the file (only used to read it; the saved copy has none) */
  password?: string
  /** values entered into the file's form fields, by field name */
  form?: FormValues
  /** turn the form into plain page content */
  flatten?: boolean
}

async function loadSource(lib: Lib, original: ArrayBuffer, password: string): Promise<PDFDocument> {
  const bytes = new Uint8Array(original)
  const { decryptPdf, isProtected, PasswordError, UnsupportedEncryption } = await import('./decrypt')
  try { return await lib.PDFDocument.load(bytes, { updateMetadata: false }) } catch (e) {
    // (pdf-lib's own error classes do not survive `instanceof` once bundled, so the file itself is asked)
    if (!/encrypted/i.test(String((e as Error)?.message)) && !(await isProtected(bytes))) throw new ExportError('Could not read this PDF to save it. It may be damaged.')
  }
  // protected file: pdf-lib cannot read it, so a plain copy is made first (needs the password that opened it)
  try { return await lib.PDFDocument.load(await decryptPdf(bytes, password), { updateMetadata: false }) } catch (e) {
    if (e instanceof PasswordError) throw new ExportError('The password is needed again to save this file. Open it again and enter the password.')
    if (e instanceof UnsupportedEncryption) throw new ExportError(e.message)
    throw new ExportError('This PDF is protected in a way that cannot be removed here, so it cannot be saved.')
  }
}

/** The edited PDF. `original` must be the file's bytes (a copy is fine, it is not modified). */
export async function exportPdf(original: ArrayBuffer, pages: PageState[], opts: ExportOptions = {}): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const doc = await loadSource(lib, original, opts.password ?? '')
  const painter = new Painter(lib, doc)
  const catalog = doc.catalog
  const labels = readLabels(lib, catalog)
  const origPageOf = widgetPages(lib, doc)
  const plan = planPages(lib, doc, pages)
  pruneUnusedXObjects(lib, doc, plan)
  const { PDFName } = lib
  const tagged = catalog.lookup(PDFName.of('StructTreeRoot')) !== undefined
  for (const p of plan.pages) {
    const { page, state } = p
    const turned = (state.geom.rotate + state.turn) % 360
    if (p.kind !== 'original' || state.turn !== 0) page.setRotation(lib.degrees(turned))
    if (state.annos.length === 0) continue
    // keep our drawing from inheriting graphics state the original page left open: the original content is wrapped in q … Q
    const ctx = doc.context
    if (p.kind !== 'blank') {
      const open = [lib.pushGraphicsState()], close = [lib.popGraphicsState()]
      page.node.wrapContentStreams(ctx.register(ctx.contentStream(open)), ctx.register(ctx.contentStream(close)))
    }
    if (tagged) page.pushOperators(lib.PDFOperator.of('BMC' as never, [PDFName.of('Artifact')]))
    await painter.paint(page, state.geom, state.annos)
    if (tagged) page.pushOperators(lib.PDFOperator.of('EMC' as never))
  }
  stripSignatures(lib, doc) // before the clean-up: the signature dictionaries (and their /ByteRange) are then removed from the file too
  finishDocument(lib, doc, plan, labels, origPageOf)
  if (opts.form || opts.flatten) {
    // the form: values into the file's own fields, fresh appearances, optionally flattened. After the page tree is final (fields of deleted pages are gone).
    ;(doc as unknown as { pageCache: { invalidate(): void } }).pageCache.invalidate()
    try { applyForm(lib, doc, opts.form, !!opts.flatten, await doc.embedFont(lib.StandardFonts.Helvetica), plan.aliases) } catch (e) { console.error('form write failed', e); throw new ExportError('The form could not be written into the file. Try again with Flatten the form turned on, or clear the field you changed last.') }
  }
  return doc.save({ updateFieldAppearances: false })
}
