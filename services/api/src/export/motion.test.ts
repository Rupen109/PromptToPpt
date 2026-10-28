import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DESIGNS, SAMPLES, composeDeck } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { injectMotion, timingXml, transitionXml } from './motion.ts'
import { buildPptx } from './pptx.ts'

let n = 0
const gen = () => `id${++n}`
const deckWith = (designId: string, edit?: (d: Presentation) => void): Presentation => {
  const d = DESIGNS.find((x) => x.id === designId) ?? DESIGNS.find((x) => x.theme.motion?.entrance !== 'none' && x.theme.motion?.transition !== 'none')!
  const slides = composeDeck(SAMPLES.slice(0, 8), d, '16:9', gen).map((s) => ({ id: gen(), locked: false, validation: { status: 'passed' as const, issues: [] }, ...s }))
  const doc = { schemaVersion: 1, id: gen(), title: 'Motion', aspectRatio: '16:9', language: 'en', theme: d.theme, sources: [], slides } as unknown as Presentation
  edit?.(doc)
  return doc
}
const num = (path: string) => Number(path.replace(/\D/g, ''))
const slideXmls = (buf: Buffer) => { const f = unzipSync(new Uint8Array(buf)); return Object.keys(f).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => num(a) - num(b)).map((k) => strFromU8(f[k]!)) }
/** every opened tag is closed in order (a stand-in for a real XML parser, which this runtime does not ship) */
function balanced(xml: string): boolean {
  const stack: string[] = []
  for (const m of xml.replace(/<\?[\s\S]*?\?>/g, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue
    if (m[1]) { if (stack.pop() !== m[2]) return false } else stack.push(m[2]!)
  }
  return stack.length === 0
}
const noImages = async () => null

describe('PPTX motion', () => {
  it('writes the slide transition and an entrance effect for every animated element, with valid ids and targets', async () => {
    const doc = deckWith('pitch-launchpad')
    const animated = doc.slides.map((s) => s.elements.filter((e) => e.animation && e.animation.type !== 'kenburns' && e.animation.type !== 'float' && e.animation.type !== 'drift').length)
    const xmls = slideXmls(await buildPptx(doc, noImages))
    expect(xmls).toHaveLength(doc.slides.length)
    xmls.forEach((x, i) => {
      expect(balanced(x), `slide ${i + 1} is well-formed`).toBe(true)
      const ids = [...x.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1]!)
      expect(new Set(ids).size, `slide ${i + 1} ids unique`).toBe(ids.length)
      for (const t of x.matchAll(/spid="(\d+)"/g)) expect(ids).toContain(t[1])
      expect(x.indexOf('</p:clrMapOvr><p:transition') >= 0 || x.indexOf('</p:clrMapOvr><p:timing') >= 0, 'motion sits right after clrMapOvr').toBe(true)
      expect(x.match(/<p:transition spd="\w+"><p:zoom dir="in"\/><\/p:transition>/), 'zoom transition').not.toBeNull()
      expect(x.split('presetClass="entr"').length - 1, `slide ${i + 1} effects`).toBeGreaterThanOrEqual(animated[i]!)
      expect(x.split('nodeType="afterEffect"').length - 1).toBe(animated[i]! > 0 ? 1 : 0) // only the first effect auto-starts; the rest run "with" it on their own delay
    })
  })

  it('a deck without animation or transition is exported untouched', async () => {
    const doc = deckWith('pitch-launchpad', (d) => { d.theme = { ...d.theme, motion: { transition: 'none', entrance: 'none', stagger: 0, duration: 600 } }; for (const s of d.slides) { delete (s as { transition?: unknown }).transition; for (const e of s.elements) delete (e as { animation?: unknown }).animation } })
    for (const x of slideXmls(await buildPptx(doc, noImages))) expect(/<p:(timing|transition)[ >]/.test(x)).toBe(false)
  })

  it('maps each entrance to PowerPoint effects of the same kind and direction', () => {
    const one = (type: string, extra = {}) => timingXml([{ spids: [4], animation: { type, delay: 250, duration: 600, ...extra } as never, paragraphs: 1 }])
    expect(one('fade')).toContain('filter="fade"')
    expect(one('fade-up')).toContain('#ppt_y+0.04')
    expect(one('fade-down')).toContain('#ppt_y-0.04')
    expect(one('slide-left')).toContain('#ppt_x-0.04')
    expect(one('slide-right')).toContain('#ppt_x+0.04')
    expect(one('wipe')).toContain('wipe(left)')
    expect(one('zoom')).toContain('<p:animScale>')
    expect(one('fade')).toContain('<p:cond delay="250"/>')
    expect(one('fade')).toContain('dur="450"') // capped: 600 ms in the player feels slower in PowerPoint
    expect(one('fade')).toContain('decel="100000"') // eases out like the player
    expect(timingXml([])).toBe('')
    const para = timingXml([{ spids: [4], animation: { type: 'fade', delay: 0, duration: 400, byParagraph: true, stagger: 200 } as never, paragraphs: 3 }])
    expect(para.split('<p:pRg').length - 1).toBe(3 * 2) // 3 paragraphs × (show + fade) behaviours, each aimed at its own paragraph
    expect(para).toContain('<p:bldP spid="4" grpId="0" build="p"/>')
    expect(para).toContain('<p:cond delay="400"/>') // third paragraph: 2 × stagger
    expect(balanced(para)).toBe(true)
  })

  it('a busy slide never waits long: the last element starts within 700 ms, in the same order', () => {
    const els = Array.from({ length: 14 }, (_, i) => ({ spids: [i + 4], animation: { type: 'fade', delay: i * 120, duration: 600 } as never, paragraphs: 1 }))
    const delays = [...timingXml(els).matchAll(/nodeType="(?:after|with)Effect"><p:stCondLst><p:cond delay="(\d+)"/g)].map((m) => Number(m[1]))
    expect(delays).toHaveLength(14)
    expect(Math.max(...delays)).toBeLessThanOrEqual(700)
    expect([...delays].sort((a, b) => a - b)).toEqual(delays)
    expect(delays[0]).toBe(0)
  })

  it('maps slide transitions, and leaves "none" out', () => {
    expect(transitionXml({ type: 'fade', duration: 300 })).toBe('<p:transition spd="fast"><p:fade/></p:transition>')
    expect(transitionXml({ type: 'zoom', duration: 500 })).toContain('spd="fast"')
    expect(transitionXml({ type: 'push', duration: 500 })).toContain('<p:push dir="l"/>')
    expect(transitionXml({ type: 'wipe', duration: 1500 })).toContain('spd="slow"')
    expect(transitionXml({ type: 'wipe', duration: 1000 })).toContain('spd="med"')
    expect(transitionXml({ type: 'none', duration: 500 })).toBe('')
    expect(transitionXml(null)).toBe('')
  })

  it('ambient loops (Ken Burns, float, drift) are not exported as entrances', async () => {
    const doc = deckWith('pitch-launchpad', (d) => { for (const s of d.slides) for (const e of s.elements) if (e.animation) e.animation = { ...e.animation, type: 'kenburns' } as never })
    for (const x of slideXmls(await buildPptx(doc, noImages))) expect(x.includes('<p:timing>')).toBe(false)
  })

  it('a slide that cannot be processed keeps working: injectMotion passes the file through when nothing applies', () => {
    const buf = Buffer.from('not a zip')
    expect(injectMotion(buf, [{ transition: null, targets: [] }])).toBe(buf)
  })
})
