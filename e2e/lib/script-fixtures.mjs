/** Slides with Arabic and Hindi text in several fonts and sizes (fonts that exist on this machine or ship with the site), to measure reading recall without a browser. */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GlobalFonts, createCanvas, jpegRoundTrip } from './detect-fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pub = join(here, '../../apps/web/public/pdf-fonts')
const sys = '/System/Library/Fonts'
export const FONTS = {
  ara: [
    { name: 'NotoSansArabicSD', path: join(pub, 'notoarabic-regular.ttf') },
    { name: 'SFArabicSD', path: join(sys, 'SFArabic.ttf') },
  ],
  hin: [
    { name: 'NotoSansDevanagariSD', path: join(pub, 'notodeva-regular.ttf') },
    { name: 'KohinoorDevanagariSD', path: join(sys, 'Kohinoor.ttc'), index: 0 },
  ],
}
export const LINES = {
  ara: ['التسويق الرقمي', 'نصل إلى العملاء حياً بحي بعروض محلية', 'الحملات بلغات إقليمية تزيد التفاعل', 'نقيس النتائج كل أسبوع ونحسن الخطة'],
  hin: ['डिजिटल मार्केटिंग रणनीति', 'हम स्थानीय प्रस्तावों के साथ ग्राहकों तक पहुँचते हैं', 'क्षेत्रीय भाषाओं के अभियान जुड़ाव बढ़ाते हैं', 'हम हर सप्ताह परिणाम मापते हैं और योजना सुधारते हैं'],
}
const have = new Set()
export function fontFamily(lang, i) {
  const f = FONTS[lang][i]
  if (!existsSync(f.path)) return null
  if (!have.has(f.name)) { GlobalFonts.registerFromPath(f.path, f.name); have.add(f.name) }
  return f.name
}
/** one slide: the four lines at `px` px font size, dark on light (rtl lines right-aligned) */
export async function scriptSlide(lang, fontIdx, px, { W = 1920, H = 1080, quality = 85, dark = false } = {}) {
  const fam = fontFamily(lang, fontIdx); if (!fam) return null
  const c = createCanvas(W, H), g = c.getContext('2d')
  g.fillStyle = dark ? '#14202e' : '#f7f4ee'; g.fillRect(0, 0, W, H)
  g.fillStyle = dark ? '#f4f4f4' : '#1b1b1b'; g.textBaseline = 'alphabetic'
  const rtl = lang === 'ara'
  g.direction = rtl ? 'rtl' : 'ltr'; g.textAlign = rtl ? 'right' : 'left'
  LINES[lang].forEach((line, i) => { g.font = `${i === 0 ? px * 1.5 : px}px "${fam}"`; g.fillText(line, rtl ? W - 120 : 120, 170 + i * px * 2.1) })
  return { img: await jpegRoundTrip(c, quality), words: LINES[lang].flatMap((l) => l.split(/\s+/)), canvas: c, font: fam }
}
/** share of the truth words (any script) that appear as a word in the reading; the reading's words are compared after removing marks that fonts / models drop */
const norm = (w) => w.normalize('NFC').replace(/[ً-ٰٟ‌‍‎‏؟.,;:!?،؛]/g, '')
export function recall(truth, readText) {
  const have = new Set(readText.split(/\s+/).map(norm).filter(Boolean))
  const hit = truth.filter((w) => have.has(norm(w))).length
  return { hit, total: truth.length, recall: hit / truth.length }
}

// ---------- a poster: A3 at 300 dpi with paragraphs at 6-9 pt ----------
const VOCAB = 'market growth customer revenue product quality service team plan budget report review launch design research support analysis delivery partner region safety training process schedule feedback target strategy network energy health learning community project result income record policy supply demand method standard system value'.split(' ')
export function posterWords(seed, n) { let s = seed >>> 0; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; return Array.from({ length: n }, () => VOCAB[Math.floor(r() * VOCAB.length)]) }
/** A3 portrait (842 x 1191 pt) drawn at `dpi`; four text blocks of 6, 7, 8 and 9 pt, a title and a heading. Returns the raster and the truth words of the small text. */
export async function posterSlide({ dpi = 300, quality = 80, dark = false } = {}) {
  const ptpx = dpi / 72, W = Math.round(842 * ptpx), H = Math.round(1191 * ptpx)
  const c = createCanvas(W, H), g = c.getContext('2d')
  g.fillStyle = dark ? '#101820' : '#fbfaf6'; g.fillRect(0, 0, W, H)
  g.fillStyle = dark ? '#eee' : '#161616'; g.textBaseline = 'alphabetic'
  g.font = `bold ${72 * ptpx}px Helvetica`; g.fillText('Annual Operations Report', 40 * ptpx, 100 * ptpx)
  const words = {}; let y = 190
  for (const [i, pt] of [6, 7, 8, 9].entries()) {
    g.font = `bold ${14 * ptpx}px Helvetica`; g.fillText(`Section ${i + 1}`, 40 * ptpx, y * ptpx); y += 18
    g.font = `${pt * ptpx}px Helvetica`
    const ws = posterWords(100 + i, 160), lines = []
    let line = ''
    for (const w of ws) { if (g.measureText(`${line} ${w}`).width > 360 * ptpx) { lines.push(line.trim()); line = w } else line += ` ${w}` }
    lines.push(line.trim())
    // two columns of the same width side by side
    const half = Math.ceil(lines.length / 2), kept = []
    lines.forEach((l, j) => { const col = j < half ? 0 : 1, row = j % half; g.fillText(l, (40 + col * 400) * ptpx, (y + row * pt * 1.35) * ptpx); kept.push(l) })
    words[pt] = kept.join(' ').split(/\s+/)
    y += half * pt * 1.35 + 50
  }
  return { img: await jpegRoundTrip(c, quality), words, W, H, canvas: c }
}
export const wordRecall = (truth, readText) => { const have = new Map(); for (const w of readText.toLowerCase().split(/[^a-z]+/).filter(Boolean)) have.set(w, (have.get(w) ?? 0) + 1); let hit = 0; const left = new Map(have); for (const w of truth) { const k = left.get(w); if (k) { hit++; left.set(w, k - 1) } } return { hit, total: truth.length, recall: hit / truth.length } }
