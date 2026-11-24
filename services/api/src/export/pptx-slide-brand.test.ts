import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { slideTheme } from '@prompttoppt/theme'
import { elementSchema, type Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

/** a brand on SOME slides only (theme slide-theme.ts): the file writes those slides in the brand's fonts and colours, the others in the deck's — the same rule as the screen */
describe('PowerPoint export of a brand on some slides', () => {
  it('slide 2 carries the brand\'s fonts, colour and table colours; slide 1 keeps the deck\'s', async () => {
    const u = await signUp('sb'); const { doc } = await makeDeck(u.id, 1)
    const brand = { name: 'Acme', primary: '#E4572E', accent: '#17BEBB', headingFont: 'Playfair Display', bodyFont: 'Inter' }
    const title = (id: string) => elementSchema.parse({ type: 'text', id, role: 'title', x: 100, y: 100, width: 1400, height: 160, fontSize: 64, color: 'primary', paragraphs: [{ runs: [{ text: 'Hello' }] }] })
    const table = elementSchema.parse({ type: 'table', id: 'tb', x: 100, y: 400, width: 1200, height: 300, header: ['A', 'B'], rows: [['1', '2']] })
    const s0 = doc.slides[0]!
    const deck: Presentation = { ...doc, slides: [{ ...s0, id: 'a', elements: [title('t1')] }, { ...s0, id: 'b', elements: [title('t2'), table], brand }] }
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
    const x1 = strFromU8(files['ppt/slides/slide1.xml']!), x2 = strFromU8(files['ppt/slides/slide2.xml']!)
    const own = slideTheme(deck.theme, { brand }).colors.primary.replace('#', '').toUpperCase()
    expect(x2).toContain('typeface="Playfair Display"')
    expect(x2.toUpperCase()).toContain(own)
    expect(x1).not.toContain('Playfair Display')
    expect(x1.toUpperCase()).not.toContain(own)
    expect(x1.toUpperCase()).toContain(deck.theme.colors.primary.replace('#', '').toUpperCase())
  })
})
