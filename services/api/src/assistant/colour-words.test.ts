import { describe, expect, it } from 'vitest'
import { getTheme } from '@prompttoppt/theme'
import { colourWord } from './capabilities/colour-words.ts'

/** W1: colours named by word: the deck's own (kept as a token so they follow the deck) or the person's SAVED brand colours (Gold and Premium); never guessed */
const theme = getTheme('cobalt')
const ctx = (brandKit: boolean, brand: { primary: string | null; accent: string | null } | null) => ({ ent: { features: { brandKit } }, brand: brand ? { name: 'Acme', headingFont: null, bodyFont: null, logo: null, ...brand } : null, virtual: { theme } }) as never
describe('colour words', () => {
  it('deck colours: a token for text and shapes, the colour itself for a background', () => {
    expect(colourWord(ctx(false, null), 'accent', 'token')).toEqual({ ok: true, value: 'accent' })
    expect(colourWord(ctx(false, null), 'text', 'token')).toEqual({ ok: true, value: 'textPrimary' })
    expect(colourWord(ctx(false, null), 'accent', 'hex')).toEqual({ ok: true, value: theme.colors.accent.toUpperCase() })
    expect(colourWord(ctx(false, null), '#ff0000', 'token')).toEqual({ ok: true, value: '#ff0000' })
  })
  it('brand colours come from the saved brand kit; on a plan without kits, or with none saved, the reason is said', () => {
    expect(colourWord(ctx(true, { primary: '#123abc', accent: null }), 'brand_primary', 'token')).toEqual({ ok: true, value: '#123ABC' })
    expect(colourWord(ctx(true, { primary: '#123abc', accent: null }), 'brand_accent', 'token')).toMatchObject({ ok: false, why: expect.stringMatching(/no second colour yet/) })
    expect(colourWord(ctx(true, null), 'brand_primary', 'token')).toMatchObject({ ok: false, why: expect.stringMatching(/no saved brand yet/) })
    expect(colourWord(ctx(false, { primary: '#123abc', accent: null }), 'brand_primary', 'token')).toMatchObject({ ok: false, why: expect.stringMatching(/Gold and Premium/) })
  })
})
