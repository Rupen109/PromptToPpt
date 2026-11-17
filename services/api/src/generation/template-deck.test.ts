import { describe, expect, it } from 'vitest'
import { MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'
import { fitText, sanitizeChrome, sanitizeFill, stopgap, templateChrome, templateSlots, tooLong, type TemplateFill } from './template-deck.ts'

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
    { id: 'title', sample: 'Big title', maxChars: 20, detail: false, ticker: false, numeric: false },
    { id: 'mail', sample: 'you@example.com', maxChars: 30, detail: true, ticker: false, numeric: false },
    { id: 'body', sample: 'A sentence', maxChars: 80, detail: false, ticker: false, numeric: false },
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
    const sc = [{ scene: 's1', title: 'x', purpose: '', slots: [{ id: 'pct', sample: '40%', maxChars: 4, detail: false, ticker: false, numeric: true }] }]
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
