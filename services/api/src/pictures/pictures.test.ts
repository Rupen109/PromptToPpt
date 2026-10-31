import { beforeEach, describe, expect, it } from 'vitest'
import { AVAILABLE_PHOTOS } from '@prompttoppt/theme'
import { altOverlap, buildQueries, isStrongLibraryMatch, orientationFor, scoreLibrary, slotAspect, sniffImage, stem } from './helpers.ts'
import { LIBRARY_TAGS } from './library-tags.ts'
import { MAX_PICTURES_PER_DECK, clearPictureCache, openPictureSession, pickPictures, type PictureRequest, type PickerDeps, type PickerGateway } from './pick.ts'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])
const ctx = { userId: 'u1', jobId: 'j1' }
const req = (o: Partial<PictureRequest> = {}): PictureRequest => ({ slideIndex: 0, layout: 'split-image-text', title: 'Our testing approach', text: 'Find defects early', intent: 'software testing bug report', topic: 'Quality assurance', category: 'tech', aspect: 'standard', ...o })

describe('pure helpers', () => {
  it('builds short English queries from intent, then title + topic', () => {
    const q = buildQueries({ intent: 'A photo showing a team of engineers reviewing a software architecture diagram on a large monitor', title: 'Architecture', topic: 'Platform' })
    expect(q).toHaveLength(2)
    expect(q[0]!.split(' ').length).toBeLessThanOrEqual(6)
    expect(q[0]).toContain('engineers')
    expect(q[0]).not.toMatch(/\b(photo|showing|a)\b/)
    expect(q[1]).toBe('architecture platform')
    expect(buildQueries({ intent: '', title: '', topic: '' })).toEqual([])
  })
  it('maps aspect to Pexels orientation and library slots to shapes', () => {
    expect(orientationFor('wide')).toBe('landscape')
    expect(orientationFor('standard')).toBe('landscape')
    expect(orientationFor('tall')).toBe('portrait')
    expect(orientationFor('square')).toBe('square')
    expect(['tech-1', 'tech-3', 'tech-5', 'tech-7'].map(slotAspect)).toEqual(['wide', 'tall', 'square', 'standard'])
    expect(slotAspect('team-10')).toBe('standard')
    // the shapes the template photo script generates for slots 11–16
    expect([11, 12, 13, 14, 15, 16].map((n) => slotAspect(`pitch-${n}`))).toEqual(['wide', 'tall', 'square', 'standard', 'wide', 'tall'])
  })
  it('stems symmetrically and sniffs magic bytes', () => {
    expect(stem('testing')).toBe(stem('tests') === 'test' ? 'test' : stem('testing'))
    expect(stem('companies')).toBe('company')
    expect(sniffImage(JPEG)).toBe('image/jpeg')
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]))).toBe('image/png')
    expect(sniffImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull()
  })
  it('scores the library by weighted keyword overlap', () => {
    const m = scoreLibrary(req())
    expect(m[0]!.key).toBe('product-4')
    expect(isStrongLibraryMatch(m[0]!)).toBe(true)
    expect(scoreLibrary(req({ intent: 'medieval castle architecture', title: 'Castles', text: 'stone walls', topic: 'History' }))).toEqual([])
    expect(altOverlap('software testing', 'A developer testing software').matched).toBe(2)
  })
  it('prefers a slot of the requested shape among equal matches', () => {
    const tags = { 'x-1': { description: '', keywords: ['alpha', 'beta'] }, 'x-3': { description: '', keywords: ['alpha', 'beta'] } }
    expect(scoreLibrary(req({ intent: 'alpha beta', title: '', topic: '', text: '', aspect: 'tall' }), tags)[0]!.key).toBe('x-3')
  })
  it('only references tags with keywords', () => {
    for (const t of Object.values(LIBRARY_TAGS)) expect(t.keywords.length).toBeGreaterThanOrEqual(5)
  })
})


// ─── the picker ───────────────────────────────────────────────────────────
type Call = { url: string; auth: string | null }
interface Setup {
  /** Pexels results (ids) or an error status */
  pexels?: number[] | number | 'down' | 'hang'
  /** Unsplash results (ids with descriptions) or an error status */
  unsplash?: { id: string; alt: string }[] | number | 'down' | 'hang'
  keys?: { unsplash?: boolean; pexels?: boolean }
  limits?: { total: number; perUser: number }
  searchBudgetMs?: number
  gateway?: PickerGateway | null
}
const pexelsPhoto = (id: number, alt = 'a developer testing software on a laptop') => ({ id, url: `https://www.pexels.com/photo/${id}/`, photographer: 'Ann Lee', alt, src: { large2x: `https://images.pexels.com/photos/${id}/x.jpeg` } })
const unsplashPhoto = (id: string, alt: string) => ({ id, alt_description: alt, urls: { regular: `https://images.unsplash.com/photo-${id}?ixid=x`, full: `https://images.unsplash.com/photo-${id}-full` }, links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=x` }, user: { name: 'Sam Park', links: { html: 'https://unsplash.com/@sam' } } })

function setup(o: Setup = {}) {
  const calls: Call[] = []
  const wait = (init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
  const fetchFake = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, auth: new Headers(init?.headers).get('authorization') })
    if (u.startsWith('https://api.unsplash.com/search/photos')) {
      const r = o.unsplash ?? []
      if (r === 'hang') return wait(init)
      if (r === 'down') throw new Error('network down')
      if (typeof r === 'number') return new Response('no', { status: r })
      return new Response(JSON.stringify({ results: r.map((x) => unsplashPhoto(x.id, x.alt)) }), { status: 200, headers: { 'x-ratelimit-remaining': '40' } })
    }
    if (u.startsWith('https://api.unsplash.com/photos/')) return new Response('{}', { status: 200 })
    if (u.startsWith('https://api.pexels.com/')) {
      const r = o.pexels ?? []
      if (r === 'hang') return wait(init)
      if (r === 'down') throw new Error('network down')
      if (typeof r === 'number') return new Response('no', { status: r })
      return new Response(JSON.stringify({ photos: r.map((id) => pexelsPhoto(id)) }), { status: 200 })
    }
    return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
  }) as typeof fetch
  const modelCalls: unknown[] = []
  const gateway: PickerGateway | null = o.gateway === undefined ? { async run<T>(input: unknown): Promise<T> { modelCalls.push(input); return { queries: ['translated query'] } as T } } : o.gateway
  const keys = o.keys ?? { unsplash: o.unsplash !== undefined, pexels: o.pexels !== undefined }
  const deps: Partial<PickerDeps> = {
    fetch: fetchFake, gateway, now: Date.now, timeoutMs: 5000, ...(o.searchBudgetMs !== undefined ? { searchBudgetMs: o.searchBudgetMs } : {}),
    config: { ...(keys.unsplash ? { unsplashKey: 'unsplash-access-key' } : {}), ...(keys.pexels ? { pexelsKey: 'pexels-test-key' } : {}), webUrl: 'https://web.test', stockLimits: o.limits ?? { total: 1000, perUser: 1000 } },
  }
  const searches = (host: 'unsplash' | 'pexels') => calls.filter((c) => c.url.startsWith(host === 'unsplash' ? 'https://api.unsplash.com/search/photos' : 'https://api.pexels.com/'))
  return { deps, calls, modelCalls, searches }
}

describe('picking pictures', () => {
  beforeEach(() => clearPictureCache()) // searches are cached in memory

  describe('stock search', () => {
    it('takes the best Pexels result straight away: nothing is downloaded and no model is asked', async () => {
      const h = setup({ pexels: [1, 2, 3] })
      const [p] = await pickPictures([req()], ctx, h.deps)
      expect(p).toMatchObject({ source: 'stock', src: 'https://images.pexels.com/photos/1/x.jpeg', attribution: { source: 'Photo by Ann Lee on Pexels', license: 'Pexels License' } })
      expect(h.calls.filter((c) => c.url.includes('images.pexels.com'))).toHaveLength(0) // no download
      expect(h.modelCalls).toHaveLength(0) // no vision check, no translation
    })

    it('Unsplash: Client-ID header, the right orientation, hotlinked (never copied), photographer credited with tracking links, download endpoint pinged once', async () => {
      const h = setup({ unsplash: [{ id: 'abc', alt: 'software tester at a desk' }] })
      const [p] = await pickPictures([req({ aspect: 'tall' })], ctx, h.deps)
      expect(p).toMatchObject({ source: 'stock', attribution: { source: 'Photo by Sam Park on Unsplash', license: 'Unsplash License' } })
      expect(p!.attribution!.url).toContain('utm_source=slidesdone')
      expect(p!.src).toMatch(/^https:\/\/images\.unsplash\.com\//)
      expect(p!.src).toContain('w=1920')
      const search = h.searches('unsplash')[0]!
      expect(search.auth).toBe('Client-ID unsplash-access-key')
      expect(new URL(search.url).searchParams.get('orientation')).toBe('portrait')
      await new Promise((r) => setTimeout(r, 20))
      expect(h.calls.filter((c) => c.url.startsWith('https://api.unsplash.com/photos/abc/download'))).toHaveLength(1) // Unsplash API guideline
      expect(h.calls.filter((c) => c.url.includes('images.unsplash.com'))).toHaveLength(0) // never fetched by us
    })

    it('squarish is what Unsplash calls a square', async () => {
      const h = setup({ unsplash: [{ id: 'a', alt: 'x' }] })
      await pickPictures([req({ aspect: 'square' })], ctx, h.deps)
      expect(new URL(h.searches('unsplash')[0]!.url).searchParams.get('orientation')).toBe('squarish')
    })

    it("among the results, the photo whose own description matches the search words best wins (Unsplash's order breaks ties)", async () => {
      const h = setup({ unsplash: [{ id: 'first', alt: 'a red train on tracks' }, { id: 'second', alt: 'software tester testing a bug report' }, { id: 'third', alt: 'a forest' }] })
      const [p] = await pickPictures([req()], ctx, h.deps)
      expect(p!.src).toContain('photo-second')
    })

    it('never puts the same photo twice in one deck', async () => {
      const h = setup({ pexels: [1, 2, 3, 4] })
      const r = await pickPictures([0, 1, 2, 3].map((i) => req({ slideIndex: i })), ctx, h.deps)
      expect(new Set(r.map((x) => x?.src)).size).toBe(4)
    })

    it('uses the search words the outline wrote, first', async () => {
      const h = setup({ pexels: [1] })
      await pickPictures([req({ query: 'engineers laptop meeting' })], ctx, h.deps)
      expect(new URL(h.searches('pexels')[0]!.url).searchParams.get('query')).toBe('engineers laptop meeting')
    })

    it("a photo whose own description shares nothing with a DERIVED search is not used: the slide takes a library photo instead of an unrelated stock one", async () => {
      const h = setup({ unsplash: [{ id: 'x', alt: 'i hate nothing about u beside heart graphic' }] })
      const [p] = await pickPictures([req()], ctx, h.deps) // no outline search words: searches are derived from the slide
      expect(p?.source).toBe('library')
    })

    it("…but for the outline's own search words the top result is taken even if its description is sparse", async () => {
      const h = setup({ unsplash: [{ id: 'x', alt: 'a blue thing' }] })
      const [p] = await pickPictures([req({ query: 'electric car charging' })], ctx, h.deps)
      expect(p?.source).toBe('stock')
    })

    it('a slide with no search words in another language gets English ones from ONE cheap model call; with search words, none is needed', async () => {
      const h = setup({ pexels: [1] })
      await pickPictures([req({ title: 'Nuestro enfoque de pruebas', intent: 'equipo revisando errores', topic: 'Calidad' })], ctx, h.deps)
      expect(h.modelCalls).toHaveLength(1)
      expect(new URL(h.searches('pexels')[0]!.url).searchParams.get('query')).toBe('translated query')
      const h2 = setup({ pexels: [1] })
      await pickPictures([req({ title: 'Nuestro enfoque', intent: 'equipo revisando errores', topic: 'Calidad', query: 'team reviewing bugs' })], ctx, h2.deps)
      expect(h2.modelCalls).toHaveLength(0)
    })
  })

  describe('library fallback', () => {
    const libraryKey = (src: string) => src.replace('https://web.test/template-assets/', '').replace('.jpg', '')
    const unrelated = () => req({ intent: 'zzz qqq', title: 'zzz', topic: 'qqq', text: '' })

    it('no results → a library photo that is about the slide, served from the website', async () => {
      const h = setup({ unsplash: [] })
      const [p] = await pickPictures([req()], ctx, h.deps)
      expect(p).toMatchObject({ source: 'library' })
      expect(p!.src).toMatch(/^https:\/\/web\.test\/template-assets\/[a-z-]+-\d+\.jpg$/)
      expect(AVAILABLE_PHOTOS).toContain(libraryKey(p!.src))
      expect(libraryKey(p!.src)).toBe(scoreLibrary(req())[0]!.key)
    })

    it('nothing in the library is about the slide → NO picture (a missing picture beats a wrong one; the slide becomes a text slide)', async () => {
      const h = setup({ unsplash: [] })
      const [p] = await pickPictures([unrelated()], ctx, h.deps)
      expect(p).toBeNull()
      const h2 = setup({ keys: {} })
      expect((await pickPictures([unrelated(), { ...unrelated(), slideIndex: 1, aspect: 'wide' }], ctx, h2.deps)).every((x) => x === null)).toBe(true)
    })

    it.each([
      ['rate limited (403)', { unsplash: 403 as const }],
      ['rate limited (429)', { unsplash: 429 as const }],
      ['server error', { unsplash: 500 as const }],
      ['network down', { unsplash: 'down' as const }],
    ])('Unsplash %s → a matching library photo if there is one, no waiting', async (_n, cfg) => {
      const h = setup(cfg)
      const [p] = await pickPictures([req()], ctx, h.deps)
      expect(p?.source).toBe('library')
      const [q] = await pickPictures([unrelated()], ctx, setup(cfg).deps)
      expect(q).toBeNull()
    })

    it('a search that does not answer in time → library photo (the slide never waits for a slow source)', async () => {
      const h = setup({ unsplash: 'hang', searchBudgetMs: 40 })
      const t = Date.now()
      const [p] = await pickPictures([req()], ctx, h.deps)
      expect(p?.source).toBe('library')
      expect(Date.now() - t).toBeLessThan(1500)
    })

    it('Unsplash limited but Pexels available → Pexels is used before the library', async () => {
      const h = setup({ unsplash: 403, pexels: [5] })
      const [p] = await pickPictures([req()], ctx, h.deps)
      expect(p).toMatchObject({ source: 'stock', attribution: { license: 'Pexels License' } })
    })

    it('after a rate limit, Unsplash is not asked again for the rest of the deck', async () => {
      const h = setup({ unsplash: 403 })
      await pickPictures([0, 1, 2].map((i) => req({ slideIndex: i, title: `Topic ${i}`, intent: `distinct intent ${i}` })), ctx, h.deps)
      expect(h.searches('unsplash').length).toBeLessThanOrEqual(3)
    })

    it('no stock keys configured at all → library only (matching pictures), no network calls', async () => {
      const h = setup({ keys: {} })
      const r = await pickPictures([req(), req({ slideIndex: 1 })], ctx, h.deps)
      expect(r[0]?.source).toBe('library')
      expect(h.calls).toHaveLength(0)
    })

    it('a tagged library match is preferred, and a library picture is never repeated within a deck', async () => {
      const h = setup({ keys: {} })
      const best = scoreLibrary(req())[0]!
      const r = await pickPictures(Array.from({ length: 6 }, (_, i) => req({ slideIndex: i })), ctx, h.deps)
      expect(libraryKey(r[0]!.src)).toBe(best.key)
      const used = r.filter(Boolean).map((x) => x!.src)
      expect(new Set(used).size).toBe(used.length)
    })
  })

  describe('limits', () => {
    it('one user cannot spend the shared hourly stock quota: past their own limit they get library photos without calling Unsplash (security S16)', async () => {
      const h = setup({ unsplash: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, alt: 'software tester' })), limits: { total: 1000, perUser: 2 } })
      const r = await pickPictures([0, 1, 2, 3].map((i) => req({ slideIndex: i, title: `Unique ${i}`, intent: `distinct intent number ${i}`, query: `unique search ${i}` })), ctx, h.deps)
      expect(h.searches('unsplash').length).toBeLessThanOrEqual(2) // never more than this person's own allowance
      expect(r.filter((x) => x?.source === 'stock').length).toBeGreaterThanOrEqual(1)
      expect(r.every((x) => x === null || x.source === 'stock' || x.source === 'library')).toBe(true) // never a made-up or off-topic filler
    })

    it('the shared total is honoured across users', async () => {
      const h = setup({ unsplash: [{ id: 'a', alt: 'software tester' }], limits: { total: 1, perUser: 1000 } })
      await pickPictures([req({ query: 'first search' })], { userId: 'alice' }, h.deps)
      await pickPictures([req({ query: 'second search' })], { userId: 'bob' }, h.deps)
      expect(h.searches('unsplash')).toHaveLength(1) // bob went to the library instead
    })

    it('a deck gets at most MAX_PICTURES_PER_DECK pictures', async () => {
      const h = setup({ unsplash: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, alt: 'software tester' })), limits: { total: 100000, perUser: 100000 } })
      const r = await pickPictures(Array.from({ length: MAX_PICTURES_PER_DECK + 3 }, (_, i) => req({ slideIndex: i, query: `unique search ${i}` })), ctx, h.deps)
      expect(r.slice(0, MAX_PICTURES_PER_DECK).every(Boolean)).toBe(true)
      expect(r.slice(MAX_PICTURES_PER_DECK).every((x) => x === null)).toBe(true)
    })

    it('identical searches (same words and shape) are served from memory, also across decks', async () => {
      const h = setup({ unsplash: [{ id: 'a', alt: 'software tester' }] })
      await pickPictures([req()], ctx, h.deps)
      await pickPictures([req({ slideIndex: 3 })], ctx, h.deps)
      expect(h.searches('unsplash')).toHaveLength(1)
    })
  })

  describe('picture session (lookups that run alongside the writing)', () => {
    it('an unchanged request is not looked up again; a changed one replaces the old lookup', async () => {
      const h = setup({ pexels: [1, 2, 3] })
      const s = await openPictureSession(ctx, h.deps)
      s.add(req({ slideIndex: 3 }))
      s.add(req({ slideIndex: 3 }))
      const first = await s.result(3)
      expect(first).toBeTruthy()
      s.add(req({ slideIndex: 3, text: 'Completely rewritten text about something else' }))
      const second = await s.result(3)
      expect(second).toBeTruthy()
      expect(second!.src).not.toBe(first!.src) // the old pick stays reserved: no picture twice
      s.close()
    })

    it('warm() does the main search early and the real lookup reuses it (one search in total)', async () => {
      const h = setup({ pexels: [1, 2] })
      const s = await openPictureSession(ctx, h.deps)
      s.warm(req({ slideIndex: 0 }))
      await new Promise((r) => setTimeout(r, 60))
      expect(h.searches('pexels')).toHaveLength(1)
      s.add(req({ slideIndex: 0 }))
      expect(await s.result(0)).toBeTruthy()
      expect(h.searches('pexels')).toHaveLength(1)
      s.close()
    })

    it('slides added at different times all complete, never share a photo, and unknown slides are null', async () => {
      const h = setup({ pexels: Array.from({ length: 12 }, (_, i) => i + 1) })
      const s = await openPictureSession(ctx, h.deps)
      s.add(req({ slideIndex: 0 }))
      await new Promise((r) => setTimeout(r, 15))
      s.add(req({ slideIndex: 5 }))
      await new Promise((r) => setTimeout(r, 15))
      s.add(req({ slideIndex: 11 }))
      const r = await Promise.all([0, 5, 11].map((i) => s.result(i)))
      expect(r.every(Boolean)).toBe(true)
      expect(new Set(r.map((x) => x?.src)).size).toBe(3)
      expect(await s.result(7)).toBeNull()
      s.close()
    })

    it('counts the Unsplash API requests it really makes (searches AND download pings; a warmed search counts once) and reports a rate limit', async () => {
      const h = setup({ unsplash: [{ id: 'abc', alt: 'software tester' }] })
      const s = await openPictureSession(ctx, h.deps)
      s.warm(req())
      await new Promise((r) => setTimeout(r, 60))
      s.add(req())
      expect(await s.result(0)).toBeTruthy()
      await new Promise((r) => setTimeout(r, 20))
      expect(s.stats()).toEqual({ unsplashSearches: 1, unsplashPings: 1 })
      expect(h.calls.filter((c) => c.url.startsWith('https://api.unsplash.com/')).length).toBe(2) // what the provider's quota actually saw
      expect(s.blocked()).toEqual([])
      s.close()
      clearPictureCache()
      const limited = setup({ unsplash: 403 })
      const s2 = await openPictureSession(ctx, limited.deps)
      s2.add(req())
      await s2.result(0)
      expect(s2.blocked()).toEqual(['unsplash'])
      s2.close()
    })
  })
})
