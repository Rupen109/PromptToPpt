import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { XML_FORBIDDEN, type Presentation, type TextElement } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { xmlSafeFile } from './xml-safe.ts'
import { makeDeck, signUp } from '../test-utils.ts'

/** every XML part of the file, as text */
const xmlParts = (file: Buffer) => Object.entries(unzipSync(new Uint8Array(file))).filter(([n]) => /\.(xml|rels)$/.test(n)).map(([n, b]) => [n, strFromU8(b)] as const)
const forbidden = (s: string) => { XML_FORBIDDEN.lastIndex = 0; return XML_FORBIDDEN.test(s) }

describe('a PowerPoint file never holds a character XML forbids (one makes PowerPoint "repair" the whole file)', () => {
  it('control characters in slide text, notes and the title are removed; the words around them stay', async () => {
    const u = await signUp('xmls'); const { doc } = await makeDeck(u.id, 2)
    const dirty = (s: string) => `Revenue\u0007 grew\u0000\u001F by 12%\u000B`
    const deck: Presentation = {
      ...doc, title: dirty('t'),
      slides: doc.slides.map((s) => ({ ...s, notes: dirty('n'), elements: s.elements.map((e) => (e.type === 'text' ? { ...e, paragraphs: (e as TextElement).paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, text: dirty(r.text) })) })) } : e)) })) as never,
    }
    const parts = xmlParts(await buildPptx(deck, async () => null))
    expect(parts.filter(([, x]) => forbidden(x)).map(([n]) => n)).toEqual([])
    expect(parts.find(([n]) => n === 'ppt/slides/slide1.xml')![1]).toContain('Revenue grew by 12%')
  })

  it('a clean file is passed through untouched (no second zip)', () => {
    const file = Buffer.from(zipSync({ 'a.xml': strToU8('<a>fine</a>') }))
    expect(xmlSafeFile(file)).toBe(file)
  })
})
