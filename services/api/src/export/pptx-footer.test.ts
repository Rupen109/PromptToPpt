import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

const xmlOf = async (deck: Presentation, n: number) => strFromU8(unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))[`ppt/slides/slide${n}.xml`]!)

describe('PowerPoint export draws the footer the editor draws', () => {
  it('slide numbers ("number" style): "02 / 03" on a content slide, none on a title slide, none when the style is off', async () => {
    const u = await signUp('ftr'); const { doc } = await makeDeck(u.id, 3)
    const on: Presentation = { ...doc, theme: { ...doc.theme, style: { ...(doc.theme.style as object), footer: 'number' } as never }, slides: doc.slides.map((s, i) => ({ ...s, layoutId: i === 0 ? 'title' : 'title-body' })) as never }
    expect(await xmlOf(on, 2)).toContain('02 / 03')
    expect(await xmlOf(on, 3)).toContain('03 / 03')
    expect(await xmlOf(on, 1)).not.toMatch(/\d\d \/ 03/)
    const off: Presentation = { ...on, theme: { ...on.theme, style: { ...(on.theme.style as object), footer: 'none' } as never } }
    expect(await xmlOf(off, 2)).not.toContain('02 / 03')
  })
  it('"brand" style also shows the deck title on the left', async () => {
    const u = await signUp('ftr2'); const { doc } = await makeDeck(u.id, 2)
    const deck: Presentation = { ...doc, title: 'Quarterly Review', theme: { ...doc.theme, style: { ...(doc.theme.style as object), footer: 'brand' } as never }, slides: doc.slides.map((s) => ({ ...s, layoutId: 'title-body' })) as never }
    const xml = await xmlOf(deck, 2)
    expect(xml).toContain('Quarterly Review'); expect(xml).toContain('02 / 02')
  })
})

describe('footer text of the person\'s own', () => {
  it('the left footer says the person\'s words instead of the deck title, in the PowerPoint file too', async () => {
    const u = await signUp('ft'); const { doc } = await makeDeck(u.id, 2)
    const deck = { ...doc, theme: { ...doc.theme, style: { ...(doc.theme.style ?? {}), footer: 'brand', footerText: 'Confidential draft' } } } as Presentation
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => null)))
    const slides = Object.entries(files).filter(([n]) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(([, b]) => strFromU8(b)).join(' ')
    expect(slides).toContain('Confidential draft')
  })
})
