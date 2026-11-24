import { describe, expect, it } from 'vitest'
import { PDF_MAX_BYTES } from './extract.ts'
import { describeReadable, READABLE_SOURCES } from './readable.ts'

describe('what can be read is generated from the real limits', () => {
  it('quotes the upload routes\' own limits and never an unparsed type', () => {
    const text = describeReadable().join('\n')
    expect(text).toContain(`PDF (up to ${PDF_MAX_BYTES / 1024 / 1024} MB)`)
    for (const word of ['Word', 'Excel', 'CSV', 'PowerPoint', 'web pages', 'pictures', 'recordings']) expect(text).toContain(word)
    expect(text).not.toMatch(/\.heic|\.psd|\.keynote|\.numbers|\.pages/i)
    expect(READABLE_SOURCES.every((r) => r.what && r.reads)).toBe(true)
  })
})
