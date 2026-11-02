import { beforeEach, describe, expect, it, vi } from 'vitest'

const stock = vi.hoisted(() => ({ search: vi.fn(), importPhoto: vi.fn() }))
vi.mock('../pictures/pick.ts', async (orig) => ({ ...(await orig<typeof import('../pictures/pick.ts')>()), searchStockForEditor: stock.search }))
vi.mock('../pictures/stock-import.ts', async (orig) => ({ ...(await orig<typeof import('../pictures/stock-import.ts')>()), importStockPhoto: stock.importPhoto }))

import { libraryPhotoFor, resolvePhoto } from './photo-resolve.ts'

const photo = (id: string) => ({ id, provider: 'unsplash' as const, thumb: 't', full: `https://images.unsplash.com/${id}`, alt: `photo ${id}`, author: 'Ada', pageUrl: 'https://unsplash.com/x', attribution: { source: 'Photo by Ada on Unsplash', license: 'Unsplash License' } })
const ctx = { userId: 'u', ownerId: 'o' }
beforeEach(() => { stock.search.mockReset(); stock.importPhoto.mockReset() })

describe('resolvePhoto: one free, instant picture for a request', () => {
  it('takes the first stock photo that can be copied, asks for landscape, and keeps the credit line', async () => {
    stock.search.mockResolvedValue({ ok: true, photos: [photo('a'), photo('b')], page: 1, hasMore: false })
    stock.importPhoto.mockResolvedValueOnce(null).mockResolvedValueOnce({ assetId: 'x', url: 'https://api/x', alt: 'photo b', attribution: { source: 'Photo by Ada on Unsplash', license: 'Unsplash License' } })
    const r = await resolvePhoto('city skyline night', ctx)
    expect(r).toEqual({ ok: true, photo: { url: 'https://api/x', alt: 'photo b', source: 'stock', credit: 'Photo by Ada on Unsplash' } })
    expect(stock.search).toHaveBeenCalledWith('city skyline night', 'u', 1, {}, 'landscape')
    expect(stock.importPhoto).toHaveBeenCalledWith('o', expect.objectContaining({ full: 'https://images.unsplash.com/a' }))
  })
  it('falls back to a template picture when photo search is not available', async () => {
    stock.search.mockResolvedValue({ ok: false, reason: 'not_configured' })
    const r = await resolvePhoto('handshake business agreement', ctx)
    expect(r.ok && r.photo.source).toBe('library')
    expect(r.ok && r.photo.url).toMatch(/\/template-assets\/.+\.jpg$/)
  })
  it('says why nothing was found: search worked but had no match, or search was not available', async () => {
    stock.search.mockResolvedValue({ ok: true, photos: [], page: 1, hasMore: false })
    expect(await resolvePhoto('qzxv blorp wibble', ctx)).toEqual({ ok: false, reason: 'no_match' })
    stock.search.mockRejectedValue(new Error('network'))
    expect(await resolvePhoto('qzxv blorp wibble', ctx)).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('libraryPhotoFor', () => {
  it('needs two shared words (or one for a one-word request) and never matches nonsense', () => {
    expect(libraryPhotoFor('handshake business agreement')?.url).toMatch(/template-assets/)
    expect(libraryPhotoFor('zzzz qqqq')).toBeNull()
    expect(libraryPhotoFor('')).toBeNull()
  })
})
