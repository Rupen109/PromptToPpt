import { deflateSync } from 'node:zlib'

/**
 * PDFs for the tests, written by hand (no PDF library, no program that needs a licence): standard fonts, filled shapes, text in colours, an RGB picture, an optional (fake)
 * password. The page content is plain PDF operators, so each test says exactly what is on the page.
 */
export interface PdfPage { w: number; h: number; content: string; images?: { name: string; w: number; h: number; rgb: Uint8Array }[] }
export interface PdfSpec { pages: PdfPage[]; password?: boolean }

const hex = (h: string) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ')
const esc = (t: string) => t.replace(/[\\()]/g, '\\$&')

/** page content helpers (PDF space: y up, so `y` here is measured from the TOP like a slide; `H` is the page height) */
export const ops = (H: number) => ({
  rect: (x: number, y: number, w: number, h: number, fill: string) => `${hex(fill)} rg ${x} ${H - y - h} ${w} ${h} re f\n`,
  strokeRect: (x: number, y: number, w: number, h: number, stroke: string, lw = 2) => `${hex(stroke)} RG ${lw} w ${x} ${H - y - h} ${w} ${h} re S\n`,
  line: (x0: number, y0: number, x1: number, y1: number, stroke: string, lw = 2) => `${hex(stroke)} RG ${lw} w ${x0} ${H - y0} m ${x1} ${H - y1} l S\n`,
  circle: (cx: number, cy: number, r: number, fill: string) => {
    const k = 0.5523 * r, y = H - cy
    return `${hex(fill)} rg ${cx + r} ${y} m ${cx + r} ${y + k} ${cx + k} ${y + r} ${cx} ${y + r} c ${cx - k} ${y + r} ${cx - r} ${y + k} ${cx - r} ${y} c ${cx - r} ${y - k} ${cx - k} ${y - r} ${cx} ${y - r} c ${cx + k} ${y - r} ${cx + r} ${y - k} ${cx + r} ${y} c f\n`
  },
  /** one line of text whose baseline is at `y` from the top */
  text: (x: number, y: number, size: number, text: string, color = '#000000', font: 'F1' | 'F2' | 'F3' = 'F1') => `BT ${hex(color)} rg /${font} ${size} Tf ${x} ${H - y} Td (${esc(text)}) Tj ET\n`,
  image: (name: string, x: number, y: number, w: number, h: number) => `q ${w} 0 0 ${h} ${x} ${H - y - h} cm /${name} Do Q\n`,
})

export function buildPdf(spec: PdfSpec): Uint8Array {
  const objs: Buffer[] = []
  const add = (body: string | Buffer): number => { objs.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1')); return objs.length }
  const catalog = add('') // 1
  const pagesRef = add('') // 2
  const fonts = [add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'), add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>')]
  const kids: number[] = []
  for (const p of spec.pages) {
    const imgRefs: string[] = []
    for (const im of p.images ?? []) {
      const data = deflateSync(Buffer.from(im.rgb))
      const ref = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n`, 'latin1'), data, Buffer.from('\nendstream', 'latin1')]))
      imgRefs.push(`/${im.name} ${ref} 0 R`)
    }
    const stream = Buffer.from(p.content, 'latin1')
    const content = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream', 'latin1')]))
    kids.push(add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Contents ${content} 0 R /Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> /XObject << ${imgRefs.join(' ')} >> >> >>`))
  }
  objs[catalog - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesRef} 0 R >>`, 'latin1')
  objs[pagesRef - 1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`, 'latin1')
  // a password the reader cannot know: the encryption dictionary is present but its checks can never pass with an empty password
  const enc = spec.password ? add(`<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -4 >>`) : 0
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')]
  const offsets: number[] = []
  let at = parts[0]!.length
  objs.forEach((o, i) => {
    offsets.push(at)
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), o, Buffer.from('\nendobj\n', 'latin1')])
    parts.push(b); at += b.length
  })
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R${enc ? ` /Encrypt ${enc} 0 R /ID [<${'11'.repeat(16)}> <${'11'.repeat(16)}>]` : ''} >>\nstartxref\n${at}\n%%EOF\n`, 'latin1'))
  return new Uint8Array(Buffer.concat(parts))
}

/** a solid-colour RGB picture, optionally with a lighter right half (so a crop or a flip can be seen) */
export function solidRgb(w: number, h: number, left: [number, number, number], right: [number, number, number] = left): Uint8Array {
  const out = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = x < w / 2 ? left : right; out.set(c, (y * w + x) * 3) }
  return out
}

/** A small landscape deck as a text PDF: cover, bullets, a card slide (shapes + picture), a closing slide, with page numbers on every page but the cover. */
export function sampleDeckPdf(): Uint8Array {
  const W = 960, H = 540
  const o = ops(H)
  const num = (n: number) => o.text(900, 510, 11, String(n), '#94A3B8')
  return buildPdf({
    pages: [
      { w: W, h: H, content: o.rect(0, 0, W, H, '#0B1220') + o.rect(60, 120, 90, 8, '#14B8A6') + o.text(60, 220, 44, 'Mission to Mars: the crew', '#FFFFFF', 'F2') + o.text(60, 276, 44, 'briefing', '#FFFFFF', 'F2') + o.text(60, 340, 20, 'Seven things every engineer should know', '#94A3B8') + o.text(60, 500, 11, 'ORBIT LABS', '#14B8A6', 'F2') },
      { w: W, h: H, content: o.rect(0, 0, W, H, '#0B1220') + o.text(60, 90, 34, 'Why the launch window matters', '#FFFFFF', 'F2') + o.circle(600, 260, 70, '#14B8A6') + o.rect(40, 130, 8, 30, '#14B8A6') +
        ['Fuel use falls when planets line up', 'A missed window costs two years', 'Crews train for each minute of the plan'].map((t, i) => o.circle(78, 188 + i * 34 - 6, 3.5, '#FFFFFF') + o.text(92, 192 + i * 34, 18, t, '#E2E8F0')).join('') + o.text(60, 500, 11, 'ORBIT LABS', '#14B8A6', 'F2') + num(2) },
      { w: W, h: H, images: [{ name: 'Im1', w: 40, h: 30, rgb: solidRgb(40, 30, [220, 80, 40], [240, 200, 60]) }], content: o.rect(0, 0, W, H, '#F8F5EF') + o.text(60, 90, 34, 'Three things to try', '#2B2118', 'F2') + o.rect(60, 150, 260, 260, '#FFFFFF') + o.strokeRect(60, 150, 260, 260, '#E7DFD2', 1.5) + o.text(80, 190, 22, 'Cheese', '#EA580C', 'F2') + o.text(80, 232, 16, 'Local farms bring fresh', '#2B2118') + o.text(80, 252, 16, 'cheese every week.', '#2B2118') + o.image('Im1', 560, 150, 340, 255) + o.line(60, 440, 900, 440, '#CBD5E1', 2) + o.text(60, 500, 11, 'ORBIT LABS', '#14B8A6', 'F2') + num(3) },
      { w: W, h: H, content: o.rect(0, 0, W, H, '#0B1220') + o.text(60, 280, 54, 'Thank you', '#FFFFFF', 'F2') + o.text(60, 330, 20, 'crew@orbitlabs.example', '#94A3B8') + num(4) },
    ],
  })
}

/** a deck exported as one picture per page (a scan, or slides saved as JPEGs): no text at all */
export function picturePagesPdf(pages = 3): Uint8Array {
  const W = 960, H = 540, o = ops(H)
  return buildPdf({ pages: Array.from({ length: pages }, () => ({ w: W, h: H, images: [{ name: 'Im1', w: 96, h: 54, rgb: solidRgb(96, 54, [30, 40, 60], [200, 120, 40]) }], content: o.image('Im1', 0, 0, W, H) })) })
}
/** a letter-size document with text: not a slide design */
export function portraitPdf(): Uint8Array {
  const o = ops(792)
  return buildPdf({ pages: [{ w: 612, h: 792, content: o.text(72, 100, 24, 'A letter, not a slide deck', '#000000', 'F2') + o.text(72, 140, 12, 'Dear reader, this page is portrait.') }] })
}
