import { describe, expect, it } from 'vitest'
import { MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'
import { blankLeftovers, carryAcrossScenes, fitText, productSwap, sanitizeChrome, sanitizeFill, stopgap, templateChrome, templateSlots, tooLong, type TemplateFill } from './template-deck.ts'

describe('template slots', () => {
  it('a ticker (one phrase the template repeats) has room for one short phrase, not a sentence', () => {
    const all = MORPH_TEMPLATES.flatMap((t) => templateSlots(t).flatMap((sc) => sc.slots))
    const tickers = all.filter((s) => s.ticker)
    expect(tickers.length).toBeGreaterThan(0)
    expect(tickers.every((s) => s.maxChars <= 40)).toBe(true)
  })
  it('every template has scenes with boxes the model can fill, each with a real limit, and a quote mark is never a box', () => {
    for (const tpl of MORPH_TEMPLATES) {
      const scenes = templateSlots(tpl)
      expect(scenes.length, tpl.id).toBe(tpl.scenes.length)
      const all = scenes.flatMap((s) => s.slots)
      expect(all.length, tpl.id).toBeGreaterThan(5)
      for (const s of all) { expect(s.maxChars, `${tpl.id}/${s.id}`).toBeGreaterThanOrEqual(4); expect(/[\p{L}\p{N}]/u.test(s.sample), `${tpl.id}/${s.id}`).toBe(true) }
    }
  })
})

describe('fitText', () => {
  it('never cuts in the middle of a word, prefers a whole sentence, and leaves short words alone', () => {
    expect(fitText('Short words', 40)).toBe('Short words')
    expect(fitText('A very long headline that cannot fit here', 20)).toBe('A very long')
    expect(fitText('One whole sentence. And then a second one that runs on and on', 40)).toBe('One whole sentence.')
    expect(fitText('Alpha beta,', 6)).toBe('Alpha')
    expect(fitText('Crust & Crumb Bakery', 9)).toBe('Crust')
    expect(fitText('Fresh bread and warm rolls', 17)).toBe('Fresh bread')
  })
})

describe('sanitizeFill', () => {
  const scenes = [{ scene: 's1', title: 'Cover', purpose: '', slots: [
    { id: 'title', sample: 'Big title', maxChars: 20, detail: false, ticker: false, numeric: false, spec: false },
    { id: 'mail', sample: 'you@example.com', maxChars: 30, detail: true, ticker: false, numeric: false, spec: false },
    { id: 'body', sample: 'A sentence', maxChars: 80, detail: false, ticker: false, numeric: false, spec: false },
  ] }]
  const fill = (f: Record<string, string>): TemplateFill => ({ title: 'T', chrome: {}, scenes: [{ scene: 's1', fields: f }] })

  it('fits long words, removes figures the user never gave, and leaves a detail nobody supplied empty (the object is dropped)', () => {
    const out = sanitizeFill(fill({ title: 'An extremely long headline for a short box', mail: '', body: 'We grew 340% last year.' }), scenes, { allowedNumbers: new Set(), figuresAllowed: false })
    expect(out.fields['s1']!['title']!.length).toBeLessThanOrEqual(20)
    expect(out.fields['s1']!['mail']).toBe('')
    expect(out.fields['s1']!['body']).not.toMatch(/340/)
    expect(out.missing).toEqual([])
  })
  it('a figure box (40%, 2026) is left out unless the request gave that figure; a word is never put in it', () => {
    const sc = [{ scene: 's1', title: 'x', purpose: '', slots: [{ id: 'pct', sample: '40%', maxChars: 4, detail: false, ticker: false, numeric: true, spec: false }] }]
    const f = (t: string): TemplateFill => ({ title: 'T', chrome: {}, scenes: [{ scene: 's1', fields: { pct: t } }] })
    expect(sanitizeFill(f('Pune'), sc, { allowedNumbers: new Set(), figuresAllowed: false }).fields['s1']!['pct']).toBe('')
    expect(sanitizeFill(f('55%'), sc, { allowedNumbers: new Set(), figuresAllowed: true }).fields['s1']!['pct']).toBe('')
    expect(sanitizeFill(f('55%'), sc, { allowedNumbers: new Set(['55%']), figuresAllowed: true }).fields['s1']!['pct']).toBe('55%')
    expect(sanitizeFill(f('x'), sc, { allowedNumbers: new Set(), figuresAllowed: true }).missing).toEqual([])
  })
  it('keeps a figure the user gave', () => {
    const out = sanitizeFill(fill({ title: 'x', body: 'Sales reached 340% growth.' }), scenes, { allowedNumbers: new Set(['340%']), figuresAllowed: true })
    expect(out.fields['s1']!['body']).toContain('340%')
  })
  it('a box the model left out is reported (never filled with the template\'s sample words); a stopgap is short and neutral', () => {
    const out = sanitizeFill(fill({ title: 'x' }), scenes, { allowedNumbers: new Set(), figuresAllowed: false })
    expect(out.missing).toEqual([{ scene: 's1', id: 'body' }])
    expect(stopgap(scenes[0]!.slots[2]!, 'Bakery delivery')).toBe('Bakery delivery')
  })
  it('lists exactly the boxes that are too long, for the one shortening pass', () => {
    expect(tooLong(fill({ title: 'x'.repeat(30), body: 'ok' }), scenes)).toEqual([{ scene: 's1', id: 'title', text: 'x'.repeat(30), maxChars: 20 }])
  })
})

describe('the template\'s own branding', () => {
  it('every template\'s repeated wordmark / date line is found, and what the model leaves out is NOT shown (the template\'s own words never ship for another deck)', () => {
    const orbit = MORPH_TEMPLATES.find((t) => t.id === 'pitch-orbit')!
    const chrome = templateChrome(orbit)
    expect(chrome.length).toBeGreaterThanOrEqual(1)
    expect(chrome.some((c) => /seed deck|orbit/i.test(c.sample))).toBe(true)
    const none = sanitizeChrome({ title: 'T', chrome: {}, scenes: [] }, chrome, { allowedNumbers: new Set(), figuresAllowed: false })
    expect(Object.values(none).every((v) => v === '')).toBe(true)
    const some = sanitizeChrome({ title: 'T', chrome: { [chrome[0]!.id]: 'Daily Crust 2031' }, scenes: [] }, chrome, { allowedNumbers: new Set(), figuresAllowed: false })
    expect(some[chrome[0]!.id]).toBe('Daily Crust')
  })
})

describe('a deck made from a template shows none of the template\'s own product or brand words', () => {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()
  it('every box and every repeated object is given the deck\'s words in every scene: nothing of the sample deck is left (e.g. "ZENO ONE" under a coffee launch)', async () => {
    const { composeTemplateScene } = await import('@prompttoppt/theme/morph-templates')
    const left: string[] = []
    for (const tpl of MORPH_TEMPLATES) {
      const scenes = templateSlots(tpl)
      const chrome = templateChrome(tpl)
      const fields: Record<string, Record<string, string>> = {}
      for (const sc of scenes) { fields[sc.scene] = {}; for (const s of sc.slots) fields[sc.scene]![s.id] = s.numeric ? '' : 'Aura' }
      carryAcrossScenes(tpl, scenes.map((s) => s.scene), fields)
      const branding = Object.fromEntries(chrome.map((c) => [c.id, 'Aura']))
      blankLeftovers(tpl, scenes.map((s) => s.scene), fields, branding)
      const sample = new Set<string>()
      for (const s of tpl.data.slides) for (const o of s.objects) if (o.kind === 'text') { const t = norm((o.paras ?? []).filter(Boolean).map((p) => p!.runs.map((r) => r.t).join('')).join(' ')); if (t.length >= 5 && /[a-z]{3}/.test(t)) sample.add(t) }
      for (const sc of scenes) {
        const out = composeTemplateScene(tpl, { layout: 'morph-template', template: tpl.id, scene: sc.scene, fields: { ...branding, ...fields[sc.scene] }, images: {}, speakerNotes: '', sources: [] } as never)
        for (const el of out.elements) {
          if (el.type !== 'text') continue
          const t = norm(el.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '))
          if (sample.has(t) && t !== 'aura') left.push(`${tpl.id}/${sc.scene}/${el.id}: "${t.slice(0, 40)}"`)
        }
      }
    }
    expect(left, `${left.length} leftovers`).toEqual([])
  })
  it('a product swap replaces the pictures that show the original product on every scene and flags the scenes', () => {
    const tpl = MORPH_TEMPLATES.find((t) => t.id === 'launch-unbox')!
    const s = productSwap(tpl, [{ url: 'https://example.com/cup.png', alt: 'A coffee cup' }])
    expect(s.swapped).toBe(true)
    const ids = new Set(Object.values(s.images).flatMap((m) => Object.keys(m)))
    expect([...ids].sort()).toEqual([...tpl.swap!.pictures].sort())
    expect(productSwap(tpl, [])).toEqual({ images: {}, swapped: false })
    expect(productSwap(MORPH_TEMPLATES.find((t) => t.id === 'edu-chalk')!, [{ url: 'https://example.com/cup.png', alt: 'x' }])).toEqual({ images: {}, swapped: false }) // a template that takes no pictures keeps its own
  })
})

describe('the person\'s pictures replace the template\'s photographs, scene by scene', () => {
  const pics = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://example.com/p${i + 1}.jpg`, alt: `Picture ${i + 1}` }))
  const placed = (id: string, n = 2) => { const sw = productSwap(MORPH_TEMPLATES.find((t) => t.id === id)!, pics(n)); const per = Object.values(sw.images).flatMap((m) => Object.entries(m)); return { ids: new Set(per.map(([k]) => k)), urls: new Set(per.map(([, v]) => v.url)), count: per.length } }
  it('EVERY template that takes pictures shows none of its own photographs afterwards (only its light, haze and 3D objects, and team portraits, stay)', async () => {
    const { composeTemplateScene, pictureSlots, takesPictures } = await import('@prompttoppt/theme/morph-templates')
    const left: string[] = []
    for (const tpl of MORPH_TEMPLATES.filter((t) => takesPictures(t))) {
      const sw = productSwap(tpl, pics(2))
      const kind = new Map(pictureSlots(tpl).flatMap((sl) => sl.uses.map((u) => [`${u.scene}/${u.id}`, sl.kind] as const)))
      const listed = Array.isArray(tpl.fillPictures) ? new Set(tpl.fillPictures) : null // such a template fills only the photographs it lists (its other pictures are props)
      for (const sc of tpl.scenes) {
        const out = composeTemplateScene(tpl, { layout: 'morph-template', template: tpl.id, scene: sc.id, fields: {}, images: sw.images[sc.id] ?? {}, ...(sw.swapped ? { swapped: true } : {}), speakerNotes: '', sources: [] } as never)
        for (const el of out.elements) if (el.type === 'image' && !/example\.com/.test(el.src ?? "") && (el.opacity ?? 1) >= 0.5 && kind.get(`${sc.id}/${el.id}`) === 'photo' && (!listed || listed.has(el.id))) left.push(`${tpl.id}/${sc.id}/${el.id}: ${(el.alt ?? "").slice(0, 40)}`)
      }
    }
    expect(left, left.join('\n')).toEqual([])
  })
  it('Social Feed: the phone\'s cards, the photo cards and the story circles take the person\'s pictures; with fewer pictures than places they are used round again', () => {
    const feed = placed('mkt-feed', 2)
    expect([...feed.ids].sort()).toEqual(['av1', 'av2', 'av3', 'av4', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
    expect(feed.urls.size).toBe(2)
    expect(productSwap(MORPH_TEMPLATES.find((t) => t.id === 'mkt-feed')!, pics(2)).swapped).toBe(false) // not a product swap: nothing is hidden
  })
  it('Brand Moodboard: every photo tile; Cool Morph: its photographs, never its light and haze; Billboard: its four products', () => {
    expect(placed('mkt-moodboard', 3).ids.size).toBe(10)
    const cool = MORPH_TEMPLATES.find((t) => t.id === 'cool')!
    expect(placed('cool', 3).ids.size).toBeGreaterThanOrEqual(4)
    const alt = (id: string) => cool.pictures[cool.data.slides.flatMap((s) => s.objects).find((o) => o.id === id && o.hash)?.hash ?? '']?.alt ?? ''
    for (const id of placed('cool', 3).ids) expect(/blob|haze|backdrop|swoosh|glow/i.test(alt(id)), id).toBe(false)
    expect([...placed('mkt-billboard', 4).ids].sort()).toEqual(['bottle', 'can', 'can2', 'cup'])
  })
  it('Business & Strategy: every template takes the person\'s pictures where it lists them (photographs, and the 3D objects that become photo frames: matrix still life, roadmap icons, finance hero pictures)', () => {
    expect([...placed('biz-annual').ids].sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect([...placed('biz-sales').ids]).toEqual(['tile'])
    expect([...placed('biz-casestudy').ids].sort()).toEqual(['hero', 'imgA', 'imgB'])
    expect([...placed('biz-team').ids].sort()).toEqual(['desk', 'kitchen', 'office'])
    expect(placed('biz').ids.size).toBeGreaterThanOrEqual(10)
    expect([...placed('biz-matrix').ids]).toEqual(['solids'])
    expect([...placed('biz-roadmap').ids].sort()).toEqual(['ic0', 'ic1', 'ic2', 'ic3', 'ic4', 'ic5'])
    expect([...placed('biz-finance').ids].sort()).toEqual(['chart', 'coins', 'leaf', 'vault'])
  })
})

describe('the person\'s pictures in the Pitch templates', () => {
  const pics = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://example.com/p${i + 1}.jpg`, alt: `Picture ${i + 1}` }))
  const ids = (id: string) => [...new Set(Object.values(productSwap(MORPH_TEMPLATES.find((t) => t.id === id)!, pics(2)).images).flatMap((m) => Object.keys(m)))].sort()
  it('Story Cards: every photo card; Orbit Pitch: the glass sphere and its four orbs (not the nebula); Market Pitch: the hero sphere, the laptop screen and the three shapes', () => {
    expect(ids('pitch-cards')).toEqual(['ph1', 'ph2', 'ph3', 'ph4', 'ph5', 'ph6', 'ph7'])
    expect(ids('pitch-orbit')).toEqual(['core', 's1', 's2', 's3', 's4'])
    expect(ids('pitch-market')).toEqual(['cube', 'gem', 'laptop', 'orb', 'torus'])
  })
})

describe('the person\'s pictures in the Product Launch family', () => {
  const pics = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://example.com/p${i + 1}.jpg`, alt: `Picture ${i + 1}` }))
  const ids = (id: string) => [...new Set(Object.values(productSwap(MORPH_TEMPLATES.find((t) => t.id === id)!, pics(2)).images).flatMap((m) => Object.keys(m)))]
  it('Product Launch: the cans, the flavour photographs and the scenery all take them (a coffee launch must not show raspberries); Feature Spotlight: the three phone screens and the app icon; Countdown: the three products; Unboxing: its product swap', () => {
    expect(ids('launch').length).toBeGreaterThanOrEqual(15)
    expect(ids('launch-spotlight').sort()).toEqual(['app', 'p1s', 'p2s', 'p3s'])
    expect(ids('launch-countdown').sort()).toEqual(['hero', 'pic2', 'pic3'])
    expect(ids('launch-unbox').sort()).toEqual(['g1', 'g2', 'hero'])
  })
  it('a full-bleed scenery photograph is not rounded; a can and the app icon are', async () => {
    const { composeTemplateScene } = await import('@prompttoppt/theme/morph-templates')
    const launch = MORPH_TEMPLATES.find((t) => t.id === 'launch')!
    const sw = productSwap(launch, pics(1))
    let full = 0, rounded = 0
    for (const sc of launch.scenes) {
      const out = composeTemplateScene(launch, { layout: 'morph-template', template: 'launch', scene: sc.id, fields: {}, images: sw.images[sc.id] ?? {}, speakerNotes: '', sources: [] } as never)
      for (const el of out.elements) if (el.type === 'image' && /example\.com/.test(el.src ?? '') && (el.opacity ?? 1) >= 0.5) { if (el.width >= 1900 && el.height >= 1060) { full++; expect(el.radius ?? 0).toBe(0) } else if ((el.radius ?? 0) > 0) rounded++ }
    }
    expect(full).toBeGreaterThan(0)
    expect(rounded).toBeGreaterThan(0)
  })
})
