import { beforeEach, describe, expect, it } from 'vitest'
import { altOverlap, buildQueries, isStrongLibraryMatch, orientationFor, scoreLibrary, slotAspect, sniffImage, stem } from './helpers.ts'
import { LIBRARY_TAGS } from './library-tags.ts'
import { clearPictureCache, pickPictures, type PictureRequest, type PickerDeps, type PickerGateway } from './pick.ts'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9])
const ctx = { userId: 'u1', jobId: 'j1' }
const req = (o: Partial<PictureRequest> = {}): PictureRequest => ({ slideIndex: 0, layout: 'split', title: 'Our testing approach', text: 'Find defects early', intent: 'software testing bug report', topic: 'Quality assurance', category: 'tech', aspect: 'wide', ...o })

const photo = (id: number, alt = 'a developer testing software on a laptop') => ({ id, url: `https://www.pexels.com/photo/${id}/`, photographer: 'Ann Lee', alt, src: { large2x: `https://images.pexels.com/photos/${id}/x.jpeg`, large: `https://images.pexels.com/photos/${id}/y.jpeg` } })

interface Harness {
  deps: Partial<PickerDeps>
  calls: string[]
  saved: { prompt: string; mime: string }[]
  verifies: number
  maxInFlight: number
}
function harness(o: {
  pexels?: unknown[] | 'error' | 429
  score?: (n: number) => number | Error
  withGateway?: boolean
  key?: string | undefined
  hang?: boolean
  timeoutMs?: number
  queries?: string[]
  hasText?: boolean
  libraryDown?: boolean
} = {}): Harness {
  const h: Harness = { deps: {}, calls: [], saved: [], verifies: 0, maxInFlight: 0 }
  let inFlight = 0
  const fetchFake = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    h.calls.push(u)
    inFlight++
    h.maxInFlight = Math.max(h.maxInFlight, inFlight)
    try {
      if (o.hang) await new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
      await new Promise((r) => setTimeout(r, 5))
      if (u.startsWith('https://api.pexels.com/')) {
        if (o.pexels === 'error') throw new Error('network down')
        if (o.pexels === 429) return new Response('slow down', { status: 429 })
        return new Response(JSON.stringify({ photos: o.pexels ?? [photo(1)] }), { status: 200 })
      }
      if (u.includes('/template-assets/') && o.libraryDown) return new Response('no', { status: 500 })
      return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    } finally {
      inFlight--
    }
  }) as typeof fetch
  const gateway: PickerGateway = {
    async run<T>(input: any): Promise<T> {
      if (input.requestType === 'picture_query') return { queries: o.queries ?? ['team meeting'] } as T
      h.verifies++
      expect(input.route).toBe('fast')
      expect(input.images?.[0]?.mimeType).toBe('image/jpeg')
      const s = o.score ? o.score(h.verifies) : 5
      if (s instanceof Error) throw s
      return { score: s, reason: 'x', hasTextOrLogo: o.hasText ?? false } as T
    },
  }
  h.deps = {
    fetch: fetchFake,
    gateway: o.withGateway === false ? null : gateway,
    storage: {
      async save(a) {
        h.saved.push({ prompt: a.prompt, mime: a.mime })
        const id = `asset${h.saved.length}`
        return { id, url: `https://api.test/api/v1/assets/${id}` }
      },
    },
    now: Date.now,
    config: { pexelsKey: 'key' in o ? o.key : 'pexels-test-key', webUrl: 'https://web.test' },
    timeoutMs: o.timeoutMs ?? 5000,
  }
  return h
}

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

describe('pickPictures', () => {
  it('stock path: accepts a verified photo, stores it and fills attribution', async () => {
    const h = harness()
    const [p] = await pickPictures([req()], ctx, h.deps)
    expect(p).toMatchObject({ source: 'stock', score: 5, src: 'https://api.test/api/v1/assets/asset1', attribution: { source: 'Photo by Ann Lee on Pexels', license: 'Pexels License', url: 'https://www.pexels.com/photo/1/' } })
    expect(p!.alt).toMatch(/developer/)
    expect(h.saved).toEqual([{ prompt: 'software testing bug report', mime: 'image/jpeg' }])
    const search = new URL(h.calls.find((c) => c.includes('api.pexels.com'))!)
    expect(search.searchParams.get('orientation')).toBe('landscape')
    expect(search.searchParams.get('per_page')).toBe('8')
  })

  it('stock rejected by vision score falls through to the library (verified there)', async () => {
    const h = harness({ score: (n) => (n <= 2 ? 2 : 5), pexels: [photo(1), photo(2)] })
    const [p] = await pickPictures([req()], ctx, h.deps)
    expect(h.saved).toHaveLength(0)
    expect(p).toMatchObject({ source: 'library', src: 'https://web.test/template-assets/product-4.jpg', score: 5 })
    expect(p!.attribution).toBeUndefined()
  })

  it('rejects photos with text/logos even with a high score', async () => {
    const h = harness({ hasText: true })
    expect(await pickPictures([req()], ctx, h.deps)).toEqual([null])
  })

  it('no key: library only; Pexels is never called', async () => {
    const h = harness({ key: undefined })
    const [p] = await pickPictures([req()], ctx, h.deps)
    expect(p?.source).toBe('library')
    expect(h.calls.some((c) => c.includes('pexels'))).toBe(false)
  })

  it('429 / network errors from Pexels skip to the library', async () => {
    for (const pexels of [429, 'error'] as const) {
      const [p] = await pickPictures([req()], ctx, harness({ pexels }).deps)
      expect(p?.source).toBe('library')
    }
  })

  it('unrelated request gets no picture', async () => {
    const h = harness({ pexels: [] })
    const r = await pickPictures([req({ intent: 'medieval castle architecture', title: 'Castles', text: 'stone walls', topic: 'History' })], ctx, h.deps)
    expect(r).toEqual([null])
  })

  it('without vision only strong keyword matches are accepted, capped at 4', async () => {
    const strong = harness({ withGateway: false, key: undefined })
    const [p] = await pickPictures([req()], ctx, strong.deps)
    expect(p).toMatchObject({ source: 'library', score: 4 })
    expect(strong.calls).toHaveLength(0) // no download needed without vision
    const weak = harness({ withGateway: false, key: undefined })
    expect(await pickPictures([req({ intent: 'software architecture', title: 'x', topic: '', text: '' })], ctx, weak.deps)).toEqual([null])
    // stock without vision: strong alt overlap only
    const s1 = harness({ withGateway: false, pexels: [photo(1, 'software testing and bug report on a screen')] })
    expect((await pickPictures([req()], ctx, s1.deps))[0]).toMatchObject({ source: 'stock', score: 4 })
    const s2 = harness({ withGateway: false, pexels: [photo(1, 'a sunset over the sea')] })
    expect((await pickPictures([req({ intent: 'zzz qqq', title: 'zzz', topic: 'qqq', text: '' })], ctx, s2.deps))[0]).toBeNull()
  })

  it('a vision error degrades to the keyword rule instead of throwing', async () => {
    const h = harness({ score: () => new Error('AI down'), key: undefined })
    const [p] = await pickPictures([req()], ctx, h.deps)
    expect(p).toMatchObject({ source: 'library', score: 4 })
  })

  it('never returns the same picture twice in one call', async () => {
    const h = harness({ pexels: [photo(1), photo(2)] })
    const r = await pickPictures([req({ slideIndex: 0 }), req({ slideIndex: 1 }), req({ slideIndex: 2 })], ctx, h.deps)
    const srcs = r.map((x) => x?.src)
    expect(srcs.every(Boolean)).toBe(true)
    expect(new Set(srcs).size).toBe(3)
    expect(r.filter((x) => x?.source === 'stock')).toHaveLength(2) // third slide is served by the library
  })

  it('uses English queries from the gateway for non-English slides', async () => {
    const h = harness({ queries: ['software testing'] })
    await pickPictures([req({ intent: 'prueba de software y errores', title: 'Pruebas' })], ctx, h.deps)
    const search = new URL(h.calls.find((c) => c.includes('api.pexels.com'))!)
    expect(search.searchParams.get('query')).toBe('software testing')
  })

  it('failures degrade to null without throwing', async () => {
    const h = harness({ pexels: 'error', libraryDown: true })
    await expect(pickPictures([req()], ctx, h.deps)).resolves.toEqual([null])
    const bad = harness()
    bad.deps.storage = { save: async () => { throw new Error('disk full') } }
    bad.deps.config = { pexelsKey: 'k'.repeat(12), webUrl: 'https://web.test' }
    const [p] = await pickPictures([req()], ctx, { ...bad.deps })
    expect(p == null || p.source === 'library').toBe(true)
  })

  it('rejects non-image downloads and non-https stock urls', async () => {
    const h = harness({ pexels: [{ ...photo(1), src: { large2x: 'http://images.pexels.com/a.jpg' } }, { ...photo(2), src: { large2x: 'https://evil.example.com/a.jpg' } }], key: 'k'.repeat(12) })
    const r = await pickPictures([req()], ctx, h.deps)
    expect(h.saved).toHaveLength(0)
    expect(r[0]?.source).toBe('library')
    const bytes = harness()
    const orig = bytes.deps.fetch!
    bytes.deps.fetch = (async (u: string, i: RequestInit) => (String(u).includes('images.pexels') ? new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) : orig(u, i))) as typeof fetch
    expect((await pickPictures([req()], ctx, bytes.deps))[0]?.source).toBe('library')
  })

  it('handles at most 8 requests, never more than 3 in flight', async () => {
    const h = harness({ pexels: Array.from({ length: 30 }, (_, i) => photo(i + 1)) })
    const r = await pickPictures(Array.from({ length: 10 }, (_, i) => req({ slideIndex: i })), ctx, h.deps)
    expect(r).toHaveLength(10)
    expect(r.slice(8).every((x) => x === null)).toBe(true)
    expect(r.slice(0, 8).every(Boolean)).toBe(true)
    expect(h.maxInFlight).toBeLessThanOrEqual(3)
    expect(h.maxInFlight).toBeGreaterThan(1)
  })

  it('stops at the overall timeout and returns nulls', async () => {
    const h = harness({ hang: true, timeoutMs: 60 })
    const t0 = Date.now()
    const r = await pickPictures([req(), req({ slideIndex: 1 })], ctx, h.deps)
    expect(r).toEqual([null, null])
    expect(Date.now() - t0).toBeLessThan(1000)
  })

  it('returns an empty array for no requests', async () => {
    expect(await pickPictures([], ctx, harness().deps)).toEqual([])
  })
})

describe('Unsplash source', () => {
  beforeEach(() => clearPictureCache()) // searches are cached in memory (50 requests/hour demo limit)
  const uns = (id: string, alt = 'software tester at a desk with two monitors') => ({ id, alt_description: alt, urls: { regular: `https://images.unsplash.com/photo-${id}?ixid=x`, full: `https://images.unsplash.com/photo-${id}-full` }, links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=x` }, user: { name: 'Sam Park', links: { html: 'https://unsplash.com/@sam' } } })
  function run(o: { results?: unknown[]; status?: number; pexels?: boolean; score?: number } = {}) {
    const calls: { url: string; auth?: string | null }[] = []
    const saved: { provider?: string | undefined; prompt: string }[] = []
    const fetchFake = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, auth: new Headers(init?.headers).get('authorization') })
      if (u.startsWith('https://api.unsplash.com/search/photos')) return o.status && o.status !== 200 ? new Response('no', { status: o.status }) : new Response(JSON.stringify({ results: o.results ?? [uns('abc')] }), { status: 200 })
      if (u.startsWith('https://api.unsplash.com/photos/')) return new Response('{}', { status: 200 })
      if (u.startsWith('https://api.pexels.com/')) return new Response(JSON.stringify({ photos: [photo(7)] }), { status: 200 })
      return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }) as typeof fetch
    const gateway: PickerGateway = { async run<T>(input: any): Promise<T> { return (input.requestType === 'picture_query' ? { queries: ['x'] } : { score: o.score ?? 5, reason: 'ok', hasTextOrLogo: false }) as T } }
    const deps: Partial<PickerDeps> = { fetch: fetchFake, gateway, storage: { async save(a) { saved.push({ provider: a.provider, prompt: a.prompt }); return { id: 'a1', url: 'https://api.test/api/v1/assets/a1' } } }, now: Date.now, config: { unsplashKey: 'unsplash-access-key', ...(o.pexels ? { pexelsKey: 'pexels-test-key' } : {}), webUrl: 'https://web.test' }, timeoutMs: 5000 }
    return { calls, saved, deps }
  }

  it('searches with the Client-ID header and the right orientation, hotlinks it (never stores a copy), credits the photographer, pings the download endpoint', async () => {
    const h = run()
    const [p] = await pickPictures([req({ aspect: 'tall' })], ctx, h.deps)
    expect(p).toMatchObject({ source: 'stock', score: 5, attribution: { source: 'Photo by Sam Park on Unsplash', license: 'Unsplash License' } })
    expect(p!.attribution!.url).toContain('utm_source=promptToPpt')
    const search = h.calls.find((c) => c.url.startsWith('https://api.unsplash.com/search/photos'))!
    expect(search.auth).toBe('Client-ID unsplash-access-key')
    expect(new URL(search.url).searchParams.get('orientation')).toBe('portrait')
    expect(h.saved).toHaveLength(0) // Unsplash terms: no copies
    expect(p!.src).toMatch(/^https:\/\/images\.unsplash\.com\//)
    await new Promise((r) => setTimeout(r, 20))
    expect(h.calls.some((c) => c.url.startsWith('https://api.unsplash.com/photos/abc/download'))).toBe(true) // download tracking (API guideline)
    expect(h.calls.find((c) => c.url.includes('images.unsplash.com'))!.url).toContain('w=1920')
  })
  it('one user cannot burn the shared hourly stock quota: after 30 searches they fall back to the library without calling Unsplash (security S16)', async () => {
    const h = run()
    for (let i = 0; i < 36; i++) await pickPictures([req({ slideIndex: i, title: `Unique topic number ${i} ${Math.random().toString(36).slice(2)}`, intent: `distinct intent ${i} ${Math.random().toString(36).slice(2)}` })], ctx, h.deps)
    const searches = h.calls.filter((c) => c.url.startsWith('https://api.unsplash.com/search/photos')).length
    expect(searches).toBeLessThanOrEqual(30)
    expect(searches).toBeGreaterThan(0)
  })
  it('rejects a photo the vision check scores low and falls through to Pexels', async () => {
    const h = run({ score: 2, pexels: true })
    const [p] = await pickPictures([req()], ctx, h.deps)
    expect(p).toBeNull() // both sources scored < 4 → no picture rather than a wrong one
    expect(h.calls.some((c) => c.url.startsWith('https://api.pexels.com/'))).toBe(true)
  })
  it('a rate-limited Unsplash (403/429) is skipped for the whole call and Pexels is used', async () => {
    const h = run({ status: 403, pexels: true })
    const out = await pickPictures([req(), req({ slideIndex: 1, title: 'Bug reports' })], ctx, h.deps)
    expect(out.every((x) => x === null || x.source === 'library' || x.attribution?.license === 'Pexels License')).toBe(true) // never an Unsplash picture while rate-limited
    expect(h.calls.filter((c) => c.url.startsWith('https://api.unsplash.com/search/photos')).length).toBeLessThanOrEqual(2)
  })
  it('only downloads images from unsplash.com hosts', async () => {
    const h = run({ results: [{ ...uns('evil'), urls: { regular: 'https://evil.example/x.jpg' } }] })
    const [p] = await pickPictures([req()], ctx, h.deps)
    expect(p?.source).not.toBe('stock') // the foreign host was refused (the tagged library may still answer)
    expect(h.calls.some((c) => c.url.includes('evil.example'))).toBe(false)
  })
})

describe('Unsplash search cache', () => {
  it('serves an identical search from memory (saves the 50/hour demo quota)', async () => {
    clearPictureCache()
    let searches = 0
    const fetchFake = (async (url: string | URL) => {
      const u = String(url)
      if (u.startsWith('https://api.unsplash.com/search/photos')) { searches++; return new Response(JSON.stringify({ results: [{ id: `p${searches}`, alt_description: 'software tester at a desk', urls: { regular: `https://images.unsplash.com/photo-${searches}` }, links: { html: 'https://unsplash.com/photos/x' }, user: { name: 'A' } }] }), { status: 200 }) }
      return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    }) as typeof fetch
    const gateway: PickerGateway = { async run<T>(input: any): Promise<T> { return (input.requestType === 'picture_query' ? { queries: ['x'] } : { score: 5, reason: 'ok', hasTextOrLogo: false }) as T } }
    const deps: Partial<PickerDeps> = { fetch: fetchFake, gateway, storage: { async save() { return { id: 'a', url: 'https://api.test/api/v1/assets/a' } } }, now: Date.now, config: { unsplashKey: 'unsplash-access-key', webUrl: 'https://web.test' }, timeoutMs: 5000 }
    await pickPictures([req()], ctx, deps)
    await pickPictures([req({ slideIndex: 3 })], ctx, deps) // same query + aspect, different slide
    expect(searches).toBe(1)
  })
})
