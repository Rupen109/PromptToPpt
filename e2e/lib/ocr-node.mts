/** The text finder's passes (apps/web/lib/pdf-editor/ocr-core.ts) driven by Tesseract running in Node, so reading quality can be measured on generated slides without a browser. */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readImage, linesToRuns, type OcrLine, type ReadOpts, type Recognizer, type Measure } from '../../apps/web/lib/pdf-editor/ocr-core.ts'
import type { Img } from '../../apps/web/lib/pdf-editor/picture-detect.ts'

const here = dirname(fileURLToPath(import.meta.url))
const web = createRequire(join(here, '../../apps/web/package.json'))
const { createWorker, OEM } = web('tesseract.js')
const { createCanvas } = createRequire(web.resolve('pdfjs-dist/package.json'))('@napi-rs/canvas')
export const LANG_DIR = join(here, '../../apps/web/public/ocr/7.0.0/lang')

/** a rough text measure (average Helvetica widths): enough for the pure maths */
export const measure: Measure = (text, _fam, bold, size) => text.length * size * (bold ? 0.6 : 0.55)

export async function makeEngine(models: string[], langPath = LANG_DIR) {
  const w = await createWorker(models, OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none', legacyCore: langPath !== LANG_DIR })
  const rec: Recognizer = {
    async read(img: Img, o: ReadOpts): Promise<OcrLine[]> {
      await w.setParameters({ tessedit_pageseg_mode: o.psm as never, tessedit_char_whitelist: o.digits ? '0123456789' : '', preserve_interword_spaces: '1', user_defined_dpi: '300' })
      const c = createCanvas(img.w, img.h), g = c.getContext('2d'), id = g.createImageData(img.w, img.h); id.data.set(img.data); g.putImageData(id, 0, 0)
      const png = await c.encode('png')
      const res = await w.recognize(png, {}, { blocks: true })
      const lines: OcrLine[] = []
      for (const b of res.data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) lines.push(l as unknown as OcrLine)
      return lines
    },
  }
  return { rec, close: () => w.terminate() }
}
export { readImage, linesToRuns }
