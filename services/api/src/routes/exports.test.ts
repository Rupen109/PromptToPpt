import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { DESIGNS, SAMPLES, composeDeck } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { presentation, presentationVersion } from '../db/schema.ts'
import { api, setPlan, signUp } from '../test-utils.ts'
import { attachment } from './exports.ts'

/** a deck in an animated template design (the default test theme has no motion) */
async function animatedDeck(userId: string, slides = 4) {
  const d = DESIGNS.find((x) => x.theme.motion?.entrance !== 'none' && x.theme.motion?.transition !== 'none')!
  const id = nanoid()
  const doc = { schemaVersion: 1, id, title: 'Animated deck', aspectRatio: '16:9', language: 'en', theme: d.theme, sources: [], slides: composeDeck(SAMPLES.slice(0, slides), d, '16:9', () => nanoid(10)).map((s) => ({ id: nanoid(12), locked: false, validation: { status: 'passed' as const, issues: [] }, ...s })) } as unknown as Presentation
  await db.insert(presentation).values({ id, userId, title: doc.title, latestVersion: 1, revision: 1 })
  await db.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
  return { id, doc }
}

describe('POST /exports (pptx)', () => {
  it('the downloaded .pptx carries the deck\'s slide transitions and entrance animations', async () => {
    const u = await signUp('exp')
    await setPlan(u.id, 'pro')
    const { id, doc } = await animatedDeck(u.id, 4)
    const animated = doc.slides.flatMap((s) => s.elements).filter((e) => e.animation && !['kenburns', 'float', 'drift'].includes(e.animation.type)).length
    expect(animated, 'the sample deck has animation to export').toBeGreaterThan(0)
    const res = await api(u.cookie, 'POST', '/exports', { presentationId: id, format: 'pptx' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('presentationml.presentation')
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()))
    const slides = Object.keys(files).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    expect(slides).toHaveLength(4)
    const xml = slides.map((k) => strFromU8(files[k]!)).join('')
    expect(xml.split('presetClass="entr"').length - 1).toBeGreaterThanOrEqual(animated)
    expect(xml).toMatch(/<p:transition spd="\w+"><p:\w+/)
    expect(xml.split('<p:timing>').length - 1).toBe(4)
  })
})

describe('the download name, in any language', () => {
  it('a Hindi or Gujarati title exports (it crashed with a 500: headers carry only Latin-1) and keeps its real name', async () => {
    const u = await signUp('exphi')
    await setPlan(u.id, 'pro')
    const { id } = await animatedDeck(u.id, 3)
    await db.update(presentation).set({ title: 'गुजरात में पर्यटन' }).where(eq(presentation.id, id))
    const res = await api(u.cookie, 'POST', '/exports', { presentationId: id, format: 'pptx' })
    expect(res.status).toBe(200)
    const cd = res.headers.get('content-disposition')!
    expect(cd).toMatch(/^attachment; filename="presentation\.pptx"; filename\*=UTF-8''/)
    expect(decodeURIComponent(cd.split("UTF-8''")[1]!)).toBe('गुजरात-में-पर्यटन.pptx')
  })
  it('an English title is unchanged; a mixed title keeps its Latin part as the fallback', () => {
    expect(attachment('Quarterly Review', 'pptx')).toBe(`attachment; filename="Quarterly-Review.pptx"; filename*=UTF-8''Quarterly-Review.pptx`)
    expect(attachment('Q3 रिपोर्ट', 'pptx')).toMatch(/^attachment; filename="Q3\.pptx"; /)
  })
})
