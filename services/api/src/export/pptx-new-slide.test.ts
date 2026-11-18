import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { PLACEHOLDER_KINDS, composePlaceholderSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, Slide } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

describe('PowerPoint export of a new slide whose boxes nobody has typed in', () => {
  it('exports every PowerPoint layout without the editor-only prompt ("Click to add …")', async () => {
    const u = await signUp('pns'); const { doc } = await makeDeck(u.id, 1)
    const theme = getTheme('midnight')!
    let n = 0
    const slides = PLACEHOLDER_KINDS.map((k): Slide => ({ id: `s-${k}`, locked: false, manual: true, validation: { status: 'pending', issues: [] }, ...composePlaceholderSlide(k, theme, doc.aspectRatio, () => `e${++n}`) }) as Slide)
    const deck: Presentation = { ...doc, theme, slides }
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
    const slideXml = Object.entries(files).filter(([f]) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).map(([, b]) => strFromU8(b))
    expect(slideXml).toHaveLength(PLACEHOLDER_KINDS.length)
    for (const xml of slideXml) expect(xml).not.toMatch(/Click to add/i)
  })
})
