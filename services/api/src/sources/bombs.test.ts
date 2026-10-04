import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fromPptx } from './extract.ts'

/** Decompression bombs: tiny files that inflate to gigabytes. The reader must refuse them before inflating. */
describe('PPTX zip bombs (security S20)', () => {
  const slideXml = (n: number) => `<p:sld><a:p><a:r><a:t>Slide ${n}</a:t></a:r></a:p>${' '.repeat(0)}</p:sld>`
  it('reads a normal deck', () => {
    const zip = zipSync({ 'ppt/slides/slide1.xml': new TextEncoder().encode(slideXml(1)), 'ppt/slides/slide2.xml': new TextEncoder().encode(slideXml(2)) })
    expect(fromPptx(zip, 'ok.pptx').parts.length).toBe(2)
  })
  it('refuses many large-but-compressible entries whose TOTAL would inflate past the cap', () => {
    const seven = new Uint8Array(7 * 1024 * 1024).fill(0x20) // compresses to a few KB
    const files: Record<string, Uint8Array> = {}
    for (let i = 1; i <= 7; i++) files[`ppt/slides/slide${i}.xml`] = seven // 49 MB inflated
    const zip = zipSync(files, { level: 9 })
    expect(zip.length).toBeLessThan(200_000)
    expect(() => fromPptx(zip, 'bomb.pptx')).toThrow(/too large or unusual/)
  })
  it('refuses an archive with thousands of entries', () => {
    const files: Record<string, Uint8Array> = {}
    for (let i = 1; i <= 600; i++) files[`ppt/slides/slide${i}.xml`] = new TextEncoder().encode(slideXml(i))
    expect(() => fromPptx(zipSync(files), 'many.pptx')).toThrow(/too large or unusual/)
  })
  it('skips a single entry that declares more than the per-entry cap', () => {
    const nine = new Uint8Array(9 * 1024 * 1024).fill(0x20)
    expect(() => fromPptx(zipSync({ 'ppt/slides/slide1.xml': nine }, { level: 9 }), 'one.pptx')).toThrow()
  })
})
