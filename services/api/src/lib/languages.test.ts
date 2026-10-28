import { describe, expect, it } from 'vitest'
import { DECK_LANGUAGES, deckLanguage, isRtlLanguage } from '@prompttoppt/validation'

describe('deck languages', () => {
  it('offers at least 100 languages with unique codes and non-empty names', () => {
    expect(DECK_LANGUAGES.length).toBeGreaterThanOrEqual(100)
    expect(new Set(DECK_LANGUAGES.map((l) => l.code.toLowerCase())).size).toBe(DECK_LANGUAGES.length)
    for (const l of DECK_LANGUAGES) { expect(l.name.trim()).not.toBe(''); expect(l.native.trim()).not.toBe('') }
  })
  it('finds a language by exact or base code, case-insensitively; unknown is undefined', () => {
    expect(deckLanguage('hi')?.name).toBe('Hindi')
    expect(deckLanguage('PT-br')?.name).toBe('Portuguese')
    expect(deckLanguage('zh-TW')?.name).toBe('Chinese (Traditional)')
    expect(deckLanguage('xx')).toBeUndefined()
    expect(deckLanguage('')).toBeUndefined()
    expect(deckLanguage(undefined)).toBeUndefined()
  })
  it('knows which languages read right-to-left', () => {
    for (const c of ['ar', 'he', 'fa', 'ur']) expect(isRtlLanguage(c)).toBe(true)
    for (const c of ['en', 'hi', 'ja', 'xx']) expect(isRtlLanguage(c)).toBe(false)
  })
})
