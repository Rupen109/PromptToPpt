import { Zip, ZipDeflate, ZipPassThrough, strFromU8, strToU8, unzipSync } from 'fflate'

/**
 * A PowerPoint file of full-slide pictures (PDF → PowerPoint, "exact look"), written as it goes: each page's JPEG goes straight into a streamed zip, so memory
 * grows with the finished file only (a 300-page PDF used over 1 GB when every picture was held as text until the end, which phones cannot spare).
 *
 * The parts that are the same in every file (theme, masters, layout, properties) come from pptxgenjs, the library the rest of our exports use, built once with a
 * single placeholder slide; that slide's parts are the pattern each page is written from. The index files that list every page (presentation, its relationships,
 * content types, app properties) are written last, when the page count is known.
 */
export interface PictureDeck {
  /** adds one slide holding this JPEG, filling the slide */
  add(jpeg: Uint8Array): void
  /** finishes the file */
  finish(): Blob
}

const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const SLIDE_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const NOTES_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml'
const SLIDE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
/** the parts written per page, or rewritten at the end: everything else in the scaffold is copied as it is */
const PER_PAGE = /^ppt\/(slides\/(_rels\/)?slide1\.xml(\.rels)?|notesSlides\/(_rels\/)?notesSlide1\.xml(\.rels)?|media\/.*)$/
const AT_END = new Set(['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels', 'docProps/app.xml'])

const must = (s: string, re: RegExp, what: string) => { if (!re.test(s)) throw new Error(`PowerPoint scaffold changed: ${what} not found`); return s }

export async function pictureDeck(o: { widthIn: number; heightIn: number; title: string }): Promise<PictureDeck> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pres = new PptxGenJS()
  pres.defineLayout({ name: 'PDF', width: o.widthIn, height: o.heightIn })
  pres.layout = 'PDF'
  pres.title = o.title
  pres.addSlide().addImage({ data: `image/png;base64,${PIXEL}`, x: 0, y: 0, w: o.widthIn, h: o.heightIn })
  const scaffold = unzipSync(new Uint8Array((await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer))
  const text = (name: string) => { const f = scaffold[name]; if (!f) throw new Error(`PowerPoint scaffold changed: ${name} missing`); return strFromU8(f) }

  // the placeholder slide's parts, as patterns for every page
  const slideXml = text('ppt/slides/slide1.xml')
  const slideRels = must(text('ppt/slides/_rels/slide1.xml.rels'), /Target="\.\.\/media\/[^"]+"/, 'picture link')
  const notesXml = text('ppt/notesSlides/notesSlide1.xml')
  const notesRels = must(text('ppt/notesSlides/_rels/notesSlide1.xml.rels'), /slides\/slide1\.xml/, 'notes link')
  const presXml = must(text('ppt/presentation.xml'), /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, 'slide list')
  const presRels = must(text('ppt/_rels/presentation.xml.rels'), /<Relationship [^>]*Target="slides\/slide1\.xml"\/>/, 'slide link')
  const types = must(text('[Content_Types].xml'), /<Override PartName="\/ppt\/slides\/slide1\.xml"[^>]*\/>/, 'slide type')
  const app = must(text('docProps/app.xml'), /<Slides>\d+<\/Slides>/, 'slide count')

  const chunks: Uint8Array[] = []
  let failed: Error | null = null
  const zip = new Zip((err, chunk) => { if (err) failed = err; else chunks.push(chunk) })
  const put = (name: string, data: Uint8Array, compress = true) => {
    const f = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name)
    zip.add(f)
    f.push(data, true)
    if (failed) throw failed
  }
  for (const [name, data] of Object.entries(scaffold)) if (!name.endsWith('/') && !PER_PAGE.test(name) && !AT_END.has(name)) put(name, data)

  let n = 0
  return {
    add(jpeg) {
      n++
      put(`ppt/media/page-${n}.jpeg`, jpeg, false) // already compressed
      put(`ppt/slides/slide${n}.xml`, strToU8(slideXml.replace(/<p:cSld name="[^"]*">/, `<p:cSld name="Page ${n}">`).replace(/descr="[^"]*"/, `descr="Page ${n}"`)))
      put(`ppt/slides/_rels/slide${n}.xml.rels`, strToU8(slideRels.replace(/Target="\.\.\/media\/[^"]+"/, `Target="../media/page-${n}.jpeg"`).replace(/notesSlide1\.xml/g, `notesSlide${n}.xml`)))
      put(`ppt/notesSlides/notesSlide${n}.xml`, strToU8(notesXml.replace(/(type="slidenum">[\s\S]*?<a:t>)\d+(<\/a:t>)/, `$1${n}$2`)))
      put(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, strToU8(notesRels.replace(/slides\/slide1\.xml/, `slides/slide${n}.xml`)))
    },
    finish() {
      if (n === 0) throw new Error('A PowerPoint needs at least one slide')
      const pages = Array.from({ length: n }, (_, i) => i + 1)
      put('ppt/presentation.xml', strToU8(presXml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${pages.map((i) => `<p:sldId id="${255 + i}" r:id="rIdPage${i}"/>`).join('')}</p:sldIdLst>`)))
      put('ppt/_rels/presentation.xml.rels', strToU8(presRels.replace(/<Relationship [^>]*Target="slides\/slide1\.xml"\/>/, pages.map((i) => `<Relationship Id="rIdPage${i}" Type="${SLIDE_REL}" Target="slides/slide${i}.xml"/>`).join(''))))
      put('[Content_Types].xml', strToU8(types
        .replace(/<Override PartName="\/ppt\/slides\/slide1\.xml"[^>]*\/>/, pages.map((i) => `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="${SLIDE_TYPE}"/>`).join(''))
        .replace(/<Override PartName="\/ppt\/notesSlides\/notesSlide1\.xml"[^>]*\/>/, pages.map((i) => `<Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="${NOTES_TYPE}"/>`).join(''))))
      put('docProps/app.xml', strToU8(app
        .replace(/<Slides>\d+<\/Slides>/, `<Slides>${n}</Slides>`).replace(/<Notes>\d+<\/Notes>/, `<Notes>${n}</Notes>`)
        .replace(/(<vt:lpstr>Slide Titles<\/vt:lpstr><\/vt:variant>\s*<vt:variant><vt:i4>)\d+/, `$1${n}`)
        .replace(/<vt:vector size="(\d+)" baseType="lpstr">([\s\S]*?)<\/vt:vector>/, (_m, size: string, inner: string) => {
          const kept = inner.replace(/<vt:lpstr>Slide \d+<\/vt:lpstr>/g, '')
          return `<vt:vector size="${Number(size) - 1 + n}" baseType="lpstr">${kept.trimEnd()}${pages.map((i) => `<vt:lpstr>Page ${i}</vt:lpstr>`).join('')}\n\t\t</vt:vector>`
        })))
      zip.end()
      if (failed) throw failed
      return new Blob(chunks as BlobPart[], { type: PPTX_TYPE })
    },
  }
}
