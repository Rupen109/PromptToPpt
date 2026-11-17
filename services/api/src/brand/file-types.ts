/**
 * What the file readers (a PowerPoint's read-pptx.ts, a PDF's read-pdf.ts) hand back. Plain data only: it travels from the parse worker thread to the API, and nothing
 * here touches the database, the network or the API's environment. `profileFromRaw` (from-file.ts) turns it into the same `BrandProfile` a website lookup gives.
 */
export type ColourSource = 'theme' | 'fill' | 'text' | 'background' | 'image'
export interface RawColour {
  hex: string
  /** how much of the file shows it: shape/page area, or text size x letters; for 'theme' entries a fixed 0-1 importance of the slot */
  weight: number
  source: ColourSource
}
export interface RawFont { original: string; role: 'heading' | 'body' | 'other'; /** letters (PDF) or text boxes (pptx) set in it */ uses: number }
export interface RawLogo { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; aspect: number; width: number; height: number; /** why this picture: shown nowhere, used by tests and logs */ why: string }
export interface RawFileBrand {
  kind: 'pptx' | 'pdf'
  /** the file's own name for itself: a PDF's title metadata (when it is a real name) */
  name: string | null
  /** a fallback if the file NAME says nothing: a PDF's biggest words on page 1, a deck's first slide title */
  nameAlt?: string | null
  colors: RawColour[]
  fonts: RawFont[]
  logo: RawLogo | null
  /** plain sentences for the person: what could not be read, what was replaced */
  notes: string[]
  facts: {
    /** slides (pptx) or pages (pdf) in the file, and how many were looked at */
    units: number
    looked: number
    /** the file has real text we could read the fonts of */
    hasText: boolean
    /** the file is the stock Office design (nobody made a brand of it) */
    stockOffice: boolean
    /** the PDF is only page pictures (a scan or an image export) */
    pictureOnly: boolean
  }
}

export const MAX_BRAND_FILE_BYTES = 15 * 1024 * 1024

/** "Acme_Brand_Template_2026.pptx" -> "Acme"; null when the file name says nothing ("scan_0001.pdf", "template.pptx"). */
export function nameFromFile(filename: string): string | null {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_+]+/g, ' ').replace(/\s+/g, ' ')
  const cleaned = base.replace(/\b(brand(ing)?(\s+(kit|guide(lines)?|book))?|presentation\d*|powerpoint\d*|template|templates|deck\d*|slides?|final|copy|draft|new|master|scan(ned)?|img|image|document|download|file|untitled|v\d+(\.\d+)*|20\d\d)\b/gi, ' ').replace(/[-–()[\]]+/g, ' ').replace(/\d{3,}/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.length >= 2 && /[a-z]/i.test(cleaned) ? cleaned.slice(0, 60) : null
}
