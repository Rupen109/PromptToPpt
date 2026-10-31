import { describe, expect, it } from 'vitest'
import { searchVariants, searchWikipedia } from './wikipedia.ts'

const ARTICLE = 'Reliance Industries Limited is an Indian multinational conglomerate headquartered in Mumbai. '.repeat(6)
/** a fake Wikipedia: only these exact search phrases find something, like the real one that needs every word to match */
const fakeWiki = (hits: Record<string, string[]>, suggestions: Record<string, string> = {}) => {
  const seen: string[] = []
  const f = async (url: string) => {
    const u = new URL(url)
    if (u.searchParams.get('list') === 'search') {
      const q = u.searchParams.get('srsearch')!; seen.push(q)
      return new Response(JSON.stringify({ query: { search: (hits[q] ?? []).map((title) => ({ title })), ...(suggestions[q] ? { searchinfo: { suggestion: suggestions[q] } } : {}) } }))
    }
    const title = u.searchParams.get('titles')!
    return new Response(JSON.stringify({ query: { pages: [{ title, extract: ARTICLE, fullurl: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}` }] } }))
  }
  return { f: f as never, seen }
}

describe('Wikipedia search is forgiving', () => {
  it('builds sensible variants of a messy phrase', () => {
    expect(searchVariants('mukesh ambani - relience industries')).toEqual(['mukesh ambani - relience industries', 'mukesh ambani relience industries', 'mukesh ambani', 'relience industries', 'mukesh ambani relience'])
  })
  it('finds the article through a part of the phrase when the whole phrase finds nothing', async () => {
    const { f, seen } = fakeWiki({ 'mukesh ambani': ['Mukesh Ambani'] })
    const pages = await searchWikipedia('mukesh ambani - relience industries', 'en', 3, f)
    expect(pages.map((p) => p.title)).toEqual(['Mukesh Ambani'])
    expect(seen[0]).toBe('mukesh ambani - relience industries')
  })
  it('uses Wikipedia\'s own "did you mean" spelling', async () => {
    const { f } = fakeWiki({ 'reliance industries': ['Reliance Industries'] }, { 'relience industries': 'reliance industries' })
    expect((await searchWikipedia('relience industries', 'en', 3, f)).map((p) => p.title)).toEqual(['Reliance Industries'])
  })
  it('still says nothing when nothing matches, after a small number of tries', async () => {
    const { f, seen } = fakeWiki({})
    expect(await searchWikipedia('qzxv blorp - wibble', 'en', 3, f)).toEqual([])
    expect(seen.length).toBeLessThanOrEqual(6)
  })
})

import { pageStatusMessage } from '../sources/extract.ts'
describe('plain words when a website refuses', () => {
  it('explains blocking, missing pages, limits and outages, and always offers a way forward', () => {
    expect(pageStatusMessage(401)).toMatch(/does not allow automated reading.*Paste text/)
    expect(pageStatusMessage(403)).toMatch(/403/)
    expect(pageStatusMessage(404)).toMatch(/not found/)
    expect(pageStatusMessage(429)).toMatch(/limiting/)
    expect(pageStatusMessage(503)).toMatch(/their side|on its side/)
  })
})
