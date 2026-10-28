import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

/** all slide XML of a .pptx, as one string */
async function slideXml(doc: Presentation) {
  const files = unzipSync(new Uint8Array(await buildPptx(doc, async () => null)))
  return Object.entries(files).filter(([n]) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(([, b]) => strFromU8(b)).join('\n')
}
const retext = (doc: Presentation, text: string): Presentation => ({
  ...doc,
  slides: doc.slides.map((s) => ({ ...s, elements: s.elements.map((e) => (e.type === 'text' ? { ...e, paragraphs: [{ ...e.paragraphs[0]!, runs: [{ ...e.paragraphs[0]!.runs[0]!, text }] }] } : e)) })),
})

describe('PPTX export of non-Latin decks', () => {
  it('Arabic text is kept, flagged right-to-left, and a left-aligned block reads from the right', async () => {
    const u = await signUp('pptxl'); const { doc } = await makeDeck(u.id, 3)
    const xml = await slideXml(retext(doc, 'مقدمة عن الطاقة الشمسية'))
    expect(xml).toContain('مقدمة عن الطاقة الشمسية')
    expect(xml).toMatch(/rtl="1"/)
    expect(xml).toMatch(/algn="r"/)
  })
  it('Hindi and Japanese text is kept and NOT flagged right-to-left', async () => {
    const u = await signUp('pptxl'); const { doc } = await makeDeck(u.id, 3)
    for (const text of ['सौर ऊर्जा का परिचय', '太陽光エネルギー入門']) {
      const xml = await slideXml(retext(doc, text))
      expect(xml).toContain(text)
      expect(xml).not.toMatch(/rtl="1"/)
    }
  })
})
