/**
 * "Find the text in this picture": OCR for pages that are only a picture (a scan, a deck saved as images).
 * Tesseract (tesseract.js, Apache-2.0) runs in a Web Worker on the visitor's device. The worker, the WebAssembly core and the reading models are
 * our own files under /ocr/<version>/ (nothing comes from a CDN, nothing is uploaded; OCR_LANG_BASE can point the models at an asset host).
 * This module is only imported when the visitor asks. What it reads is turned into the same `Run` objects that real PDF text gives, so the Edit text
 * tool treats both alike. The passes themselves (whole page, flipped colours, labels in shapes, numbers, small lines) are in ocr-core.ts.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { renderPage, type Run } from './render'
import { OCR_BASE, OCR_BUDGET_MS, OCR_LANG_BASE, OCR_WIDTH, languageOf } from './ocr-info'
import { canvasMeasure, readImage, toPoints, type OcrLine, type ReadOpts, type Recognizer } from './ocr-core'
import type { Img } from './picture-detect'

export type OcrStage = 'engine' | 'model' | 'read' | 'again' | 'regions'
export interface OcrProgress { stage: OcrStage; /** 0..1 overall */ fraction: number }
export class OcrCancelled extends Error { name = 'OcrCancelled' }
/** the reading model for a language could not be loaded (offline, or this server does not carry it) */
export class OcrModelUnavailable extends Error { name = 'OcrModelUnavailable'; constructor(public code: string) { super(`model ${code} unavailable`) } }

export { linesToRuns, mergeReadings, guessLook, canvasMeasure, type Measure, type OcrLine, type OcrWord } from './ocr-core'

type Tess = typeof import('tesseract.js')
type TWorker = Awaited<ReturnType<Tess['createWorker']>>
let worker: TWorker | null = null
let workerLang = ''
let listener: ((p: OcrProgress) => void) | null = null
/** where the 'reading' share of the progress bar starts and ends */
let readRange: [number, number, OcrStage] = [0.6, 0.8, 'read']

/** drop the engine (cancel, or leaving the page); the next run starts a fresh one, the models come from the browser's own cache */
export async function stopOcr(): Promise<void> {
  const w = worker; worker = null; workerLang = ''
  try { await w?.terminate() } catch { /* already gone */ }
}

/** is the model file there? (a language the server does not carry, or no network, must say so plainly instead of failing somewhere inside the engine) */
async function modelsPresent(models: string[], code: string): Promise<void> {
  for (const m of models.filter((x) => x !== 'eng')) { // English ships with the site: a problem there is a broken deploy, reported by the engine itself
    let ok = false
    try { ok = (await fetch(`${OCR_LANG_BASE}/${m}.traineddata.gz`, { method: 'HEAD' })).ok } catch { ok = false }
    if (!ok) throw new OcrModelUnavailable(code)
  }
}

async function engine(code: string): Promise<TWorker> {
  if (worker && workerLang === code) return worker
  await stopOcr()
  const lang = languageOf(code)
  await modelsPresent(lang.models, code)
  const { createWorker, OEM } = await import('tesseract.js')
  const make = createWorker(lang.models, OEM.LSTM_ONLY, {
    workerPath: `${OCR_BASE}/worker.min.js`, corePath: OCR_BASE, langPath: OCR_LANG_BASE,
    workerBlobURL: false, // a plain same-origin worker: no blob: needed in the CSP
    gzip: true, // the models are .gz files we host (the browser's own HTTP compression is a separate layer)
    logger: (m: { status: string; progress: number }) => {
      const f = Math.max(0, Math.min(1, m.progress || 0))
      if (/core/.test(m.status)) listener?.({ stage: 'engine', fraction: 0.02 + 0.13 * f })
      else if (/language|traineddata/.test(m.status)) listener?.({ stage: 'model', fraction: 0.15 + 0.4 * f })
      else if (/initializ/.test(m.status)) listener?.({ stage: 'model', fraction: 0.55 + 0.05 * f })
      else if (/recogni/.test(m.status)) listener?.({ stage: readRange[2], fraction: readRange[0] + (readRange[1] - readRange[0]) * f })
    },
  })
  const w = await make
  worker = w; workerLang = code
  return w
}

/** what the reading could not do, for the page to tell the visitor: `partial` = the time budget ran out; `curved` = text areas on curves left alone; `turned` = lines read sideways or tilted */
export interface OcrNotes { partial: boolean; curved: number; turned: number }
export interface OcrJob { done: Promise<Run[]>; cancel: () => void; /** filled while `done` runs; final once it resolves */ notes: OcrNotes }

const toImg = (canvas: HTMLCanvasElement): Img => { const d = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height); return { data: d.data, w: d.width, h: d.height } }
/** a picture for Tesseract: its own canvas (the engine reads canvases directly) */
function toCanvas(img: Img): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = img.w; c.height = img.h
  const copy = new Uint8ClampedArray(img.data) // putImageData wants its own buffer type
  c.getContext('2d')!.putImageData(new ImageData(copy, img.w, img.h), 0, 0)
  return c
}

/**
 * Read page `src` of the file in language `code`. Draws a copy about OCR_WIDTH wide, reads it (whole page, flipped colours when the slide is dark, then the
 * labels in circles / chevrons / cards, numbers and small lines the first look missed), maps the lines back to page space (points).
 */
export function ocrPage(pdf: PDFDocumentProxy, src: number, base: { w: number; h: number }, code: string, onProgress: (p: OcrProgress) => void, budgetMs = OCR_BUDGET_MS): OcrJob {
  let cancelled = false
  let render: ReturnType<typeof renderPage> | null = null
  const notes: OcrNotes = { partial: false, curved: 0, turned: 0 }
  const turnNotes = { turned: 0, curved: 0, curvedBoxes: [] as { x: number; y: number; w: number; h: number }[] }
  const done = (async (): Promise<Run[]> => {
    onProgress({ stage: 'engine', fraction: 0.01 })
    const width = languageOf(code).width ?? OCR_WIDTH
    const k = Math.min(width / base.w, (width * 1.5) / base.h)
    const canvas = document.createElement('canvas')
    try {
      render = renderPage(pdf, src, canvas, k)
      const px = await render.done
      if (cancelled || px === null) throw new OcrCancelled()
      listener = onProgress
      const w = await engine(code)
      if (cancelled) throw new OcrCancelled()
      const rec: Recognizer = {
        async read(img: Img, o: ReadOpts): Promise<OcrLine[]> {
          // sparse text suits slides (words anywhere, not columns of prose); a block / line / glyph mode suits one cut-out label; digits-only limits the alphabet
          await w.setParameters({ tessedit_pageseg_mode: o.psm as never, tessedit_char_whitelist: o.digits ? '0123456789' : '', preserve_interword_spaces: '1', user_defined_dpi: '300' })
          const c = toCanvas(img)
          try {
            const res = await w.recognize(c, {}, { blocks: true })
            if (cancelled) throw new OcrCancelled()
            const lines: OcrLine[] = []
            for (const b of res.data.blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) lines.push(l as unknown as OcrLine)
            return lines
          } finally { c.width = 0 }
        },
      }
      const page = toImg(canvas)
      const runs = await readImage(page, rec, {
        measure: canvasMeasure(), cancelled: () => cancelled, notes: turnNotes, budgetMs, onPartial: () => { notes.partial = true },
        stage: (s, f) => {
          if (s === 'first') readRange = [0.6, 0.78, 'read']
          else if (s === 'again') readRange = [0.78, 0.88, 'again']
          else { readRange = [0.88, 1, 'regions']; onProgress({ stage: 'regions', fraction: 0.88 + 0.12 * f }) }
        },
      })
      if (cancelled) throw new OcrCancelled()
      onProgress({ stage: 'read', fraction: 1 })
      notes.curved = turnNotes.curved; notes.turned = turnNotes.turned
      return toPoints(runs, px)
    } catch (e) {
      if (cancelled) throw new OcrCancelled()
      throw e
    } finally { canvas.width = 0; if (listener === onProgress) listener = null }
  })()
  return { done, notes, cancel: () => { cancelled = true; render?.cancel(); void stopOcr() } }
}
