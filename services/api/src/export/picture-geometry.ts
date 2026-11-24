import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

/**
 * Rounded picture corners in the .pptx, the way PowerPoint itself rounds a picture: its geometry becomes a rounded rectangle (`roundRect` with an `adj`), so the photo
 * stays the JPEG it was (no baking to PNG, the file stays small) and the corners are exactly the screen's. The exporter names every picture after its element
 * (`objectName`), so the pictures to round are found by name. A colour wash laid over a picture carries the picture's name (animations and Morph rely on it; the motion
 * step may add "#2"), so a rounding says from which of the name's shapes on (in slide order): 0 = all, 1 = all after the first (a baked picture has its own corners).
 * `perSlide[i]`: picture name → rounding, for slide i + 1 of the file.
 */
export type PictureRounding = { adj: number; from: number }
export function roundPictures(file: Buffer, perSlide: Map<string, PictureRounding>[]): Buffer {
  if (!perSlide.some((m) => m.size)) return file
  const files = unzipSync(new Uint8Array(file))
  perSlide.forEach((names, i) => {
    if (!names.size) return
    const path = `ppt/slides/slide${i + 1}.xml`
    const raw = files[path]
    if (!raw) return
    files[path] = strToU8(roundInSlide(strFromU8(raw), names))
  })
  return Buffer.from(zipSync(files))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** the slide's XML with the named pictures' plain rectangle turned into a rounded rectangle (pure; tested on its own) */
export function roundInSlide(xml: string, names: Map<string, PictureRounding>): string {
  const byXmlName = new Map([...names].map(([n, r]) => [esc(n), r]))
  const seen = new Map<string, number>()
  return xml.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, (pic) => {
    const raw = /<p:cNvPr [^>]*name="([^"]*)"/.exec(pic)?.[1]
    if (raw === undefined) return pic
    const name = raw.replace(/#\d+$/, '')
    const r = byXmlName.get(name)
    if (!r || r.adj <= 0) return pic
    const k = seen.get(name) ?? 0
    seen.set(name, k + 1)
    if (k < r.from) return pic
    return pic.replace(/<a:prstGeom prst="rect"><a:avLst\/><\/a:prstGeom>/, `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${r.adj}"/></a:avLst></a:prstGeom>`)
  })
}
