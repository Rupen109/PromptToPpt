import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { elementSchema, type Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

describe('PowerPoint export and objects switched off in the Selection pane', () => {
  it('leaves a hidden object out of the file and keeps the visible ones', async () => {
    const u = await signUp('hid'); const { doc } = await makeDeck(u.id, 2)
    const text = (id: string, words: string, y: number, hidden?: boolean) => elementSchema.parse({ type: 'text', id, role: 'body', x: 100, y, width: 900, height: 100, fontSize: 40, color: 'textPrimary', align: 'left', valign: 'top', paragraphs: [{ runs: [{ text: words }] }], ...(hidden ? { hidden: true } : {}) })
    const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [text('a', 'Visible words here', 100), text('b', 'Secret words here', 300, true)] }] }
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
    const xml = strFromU8(files['ppt/slides/slide1.xml']!)
    expect(xml).toContain('Visible words here')
    expect(xml).not.toContain('Secret words here')
  })
})
