import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { CANVAS, type Presentation } from '@prompttoppt/validation'
import { SAMPLES, composeSlide, getTheme } from '@prompttoppt/theme'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

describe('PowerPoint export of a vertical (9:16) deck', () => {
  it('writes a portrait page of the right proportions with every slide on it', async () => {
    const u = await signUp('pv'); const { doc } = await makeDeck(u.id, 1)
    const theme = getTheme('cobalt')
    let n = 0
    const slides = ['title', 'title-body', 'chart', 'comparison', 'metrics'].map((l, i) => ({ id: `v${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(SAMPLES.find((s: { layout: string }) => s.layout === l)!, theme, '9:16', () => `e${n++}`) }))
    const deck = { ...doc, aspectRatio: '9:16', theme, slides } as unknown as Presentation
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
    const pres = strFromU8(files['ppt/presentation.xml']!)
    const m = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(pres)
    expect(m, 'no slide size in the file').toBeTruthy()
    const cx = Number(m![1]), cy = Number(m![2])
    expect(cx / cy).toBeCloseTo(CANVAS['9:16'].width / CANVAS['9:16'].height, 3)
    expect(cy).toBeGreaterThan(cx) // portrait
    expect(Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))).toHaveLength(5)
  })
})
