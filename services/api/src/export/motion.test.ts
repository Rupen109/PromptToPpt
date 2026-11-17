import { execFileSync } from 'node:child_process'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { compileTimeline, compileTriggers, pathEnd, pathOf } from '@prompttoppt/ui/motion-core'
import type { Effect, Presentation, Slide, Transition } from '@prompttoppt/validation'
import { MORPH_PREFIX, injectMotion, transitionXml, wellFormed } from './motion.ts'
import { buildPptx } from './pptx.ts'
import { ENTRANCES, EMPHASES, EXITS, PATHS, chart, deckOf, everythingDeck, fx, icon, image, pngLoader, shape, slideOf, table, text } from './motion-fixtures.ts'

const num = (path: string) => Number(path.replace(/\D/g, ''))
const exportFiles = async (doc: Presentation) => unzipSync(new Uint8Array(await buildPptx(doc, pngLoader)))
const slideXmls = (f: Record<string, Uint8Array>) => Object.keys(f).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort((a, b) => num(a) - num(b)).map((k) => strFromU8(f[k]!))
const exportXml = async (doc: Presentation) => slideXmls(await exportFiles(doc))
const one = async (s: Slide) => (await exportXml(deckOf([s])))[0]!
const timing = (x: string) => /<p:timing>[\s\S]*<\/p:timing>/.exec(x)?.[0] ?? ''
const cTnIds = (x: string) => [...x.matchAll(/<p:cTn id="(\d+)"/g)].map((m) => Number(m[1]))
const shapeIds = (x: string) => [...x.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/g)].map((m) => ({ id: Number(m[1]), name: m[2]! }))
const idsOf = (x: string, elementId: string) => shapeIds(x).filter((s) => s.name.replace(/^!!/, '').replace(/#\d+$/, '') === `pt:${elementId}`).map((s) => s.id)
/** every effect node of a timing */
const effectNodes = (t: string) => [...t.matchAll(/<p:cTn id="\d+"((?: \w+="[^"]*")*? presetClass="(\w+)"(?: \w+="[^"]*")*?)><p:stCondLst><p:cond delay="(\d+)"/g)].map((m) => {
  const a = (k: string) => new RegExp(` ${k}="([^"]*)"`).exec(m[1]!)?.[1]
  return { preset: a('presetID') === undefined ? null : Number(a('presetID')), cls: m[2]!, sub: Number(a('presetSubtype')), node: a('nodeType')!, delay: Number(m[3]), grp: a('grpId') === undefined ? undefined : Number(a('grpId')), attrs: m[1]! }
})
const hasXmllint = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true } catch { return false } })()
/** a real XML parser when the machine has one (CI images may not), our own well-formedness check always */
const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const lint = (xml: string) => {
  const doc = xml.startsWith('<?xml') ? xml : `<p:root ${NS}>${xml}</p:root>` // a fragment gets the namespaces the slide declares
  expect(wellFormed(doc)).toBe(true)
  if (hasXmllint) execFileSync('xmllint', ['--noout', '-'], { input: doc, stdio: ['pipe', 'ignore', 'pipe'] })
}
const fxOn = async (e: Effect, el = text('a', 'Alpha', 100, 100)) => { const x = await one(slideOf([el], [e])); return { x, t: timing(x), nodes: effectNodes(timing(x)) } }

describe('PPTX object effects: main sequence', () => {
  const effects = [
    fx('a', 'fade-in', { start: 'click' }), fx('b', 'fly-in', { start: 'with', delay: 200, duration: 700 }), fx('c', 'zoom-in', { start: 'after', duration: 400, delay: 100 }),
    fx('d', 'wipe-in', { start: 'click' }), fx('e', 'rise-up', { start: 'after', delay: 300 }), fx('f', 'pop-in', { start: 'with' }),
    fx('a', 'pulse', { start: 'click' }),
  ]
  const els = () => [text('a', 'A', 100, 100), text('b', 'B', 100, 250), shape('c', 100, 400), text('d', 'D', 800, 100), text('e', 'E', 800, 250), text('f', 'F', 800, 400)]

  it('follows the editor timeline: one click step per On Click, With = withEffect, After = afterEffect, own delays, group start = the model\'s moment', async () => {
    const x = await one(slideOf(els(), effects))
    const t = timing(x)
    lint(x)
    const model = compileTimeline(effects, new Set(['a', 'b', 'c', 'd', 'e', 'f']))
    expect(model).toHaveLength(4) // the automatic step 0 (empty) and three clicks
    expect(t.split('<p:cond delay="indefinite"/>').length - 1).toBe(3) // one outer <p:par> per click
    expect(t).not.toContain('evt="onBegin"') // no automatic step: nothing plays before the first click
    const nodes = effectNodes(t)
    expect(nodes.map((n) => n.node)).toEqual(['clickEffect', 'withEffect', 'afterEffect', 'clickEffect', 'afterEffect', 'withEffect', 'clickEffect'])
    expect(nodes.map((n) => n.delay)).toEqual(effects.map((e) => e.delay))
    const groups = [...t.matchAll(/<p:cTn id="\d+" fill="hold"><p:stCondLst><p:cond delay="(\d+)"\/><\/p:stCondLst><p:childTnLst><p:par><p:cTn id="\d+" (?:presetID|presetClass)/g)].map((m) => Number(m[1]))
    const expected = model.slice(1).flatMap((s) => s.effects.flatMap((p, i) => (i === 0 || p.effect.start === 'after' ? [p.at] : [])))
    expect(groups).toEqual(expected)
    expect(groups).toEqual([0, 900, 0, 600, 0]) // fly ends at 900, so zoom starts then; rise-up starts after the wipe (600)
    expect(effectNodes(t).map((n) => n.cls)).toEqual(['entr', 'entr', 'entr', 'entr', 'entr', 'entr', 'emph'])
  })

  it('the effects before the first click play when the slide appears (step 0), with the standard onBegin condition', async () => {
    const e = [fx('a', 'fade-in', { start: 'after' }), fx('b', 'fade-in', { start: 'with', delay: 100 }), fx('c', 'fade-in', { start: 'click' })]
    const t = timing(await one(slideOf(els().slice(0, 3), e)))
    expect(t).toContain('<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>')
    expect(effectNodes(t).map((n) => n.node)).toEqual(['afterEffect', 'withEffect', 'clickEffect'])
    expect(t.split('<p:cond delay="indefinite"/>').length - 1).toBe(2) // the automatic step and one click
  })

  it('XML order and ids: well-formed, timing right after the clrMapOvr, cTn ids 1..n in document order, every target exists', async () => {
    const x = await one(slideOf(els(), effects))
    lint(x)
    expect(x.indexOf('</p:clrMapOvr>')).toBeGreaterThan(x.indexOf('</p:cSld>'))
    expect(x.indexOf('<p:timing>')).toBe(x.indexOf('</p:clrMapOvr>') + '</p:clrMapOvr>'.length)
    expect(x.endsWith('</p:timing></p:sld>')).toBe(true) // nothing after timing (no extLst in these slides)
    const ids = cTnIds(timing(x))
    expect(ids).toEqual(ids.map((_, i) => i + 1))
    expect(timing(x).indexOf('<p:tnLst>')).toBeLessThan(timing(x).indexOf('<p:bldLst>')) // tnLst, then bldLst
    const shapes = shapeIds(x).map((s) => s.id)
    expect(new Set(shapes).size).toBe(shapes.length)
    for (const m of timing(x).matchAll(/spid="(\d+)"/g)) expect(shapes).toContain(Number(m[1]))
    // every build entry has an effect with that group id on that shape
    for (const b of timing(x).matchAll(/<p:bldP spid="(\d+)" grpId="(\d+)"/g)) expect(timing(x)).toMatch(new RegExp(`grpId="${b[2]}"`))
  })

  it('maps easing to smooth start / smooth end, loops and repeats, rewind', async () => {
    const e = async (extra: Partial<Effect>, type: Effect['type'] = 'fade-in') => (await fxOn(fx('a', type, extra))).nodes[0]!.attrs
    expect(await e({ easing: 'linear' })).not.toMatch(/accel|decel/)
    expect(await e({ easing: 'ease-out' })).toContain('decel="100000"')
    expect(await e({ easing: 'ease-in' })).toContain('accel="100000"')
    expect(await e({ easing: 'ease-in-out' })).toMatch(/accel="50000" decel="50000"/)
    expect(await e({ repeat: 3 }, 'spin')).toContain('repeatCount="3000"')
    expect(await e({ loop: true }, 'spin')).toContain('repeatCount="indefinite"')
    expect(await e({ reverse: true }, 'grow-shrink')).toContain('autoRev="1"')
    expect(await e({ reverse: true })).not.toContain('autoRev') // rewinding makes no sense for an entrance
  })

  it('an effect on a hidden object, or on an object that is not exported, writes nothing', async () => {
    const x = await one(slideOf([text('a', 'Alpha', 100, 100, { hidden: true }), text('b', 'Bravo', 100, 300)], [fx('a', 'fade-in'), fx('gone', 'fade-in')]))
    expect(timing(x)).toBe('')
    expect(x).not.toContain('Alpha')
    const y = await one(slideOf([text('a', 'Alpha', 100, 100, { hidden: true }), text('b', 'Bravo', 100, 300)], [fx('a', 'fade-in'), fx('b', 'fade-in')]))
    expect(effectNodes(timing(y))).toHaveLength(1)
    expect(timing(y)).toContain(`spid="${idsOf(y, 'b')[0]}"`)
  })

  it('a deck with no effects, no transition and no theme animation is exported untouched', async () => {
    const [x] = await exportXml(deckOf([slideOf([text('a', 'Alpha', 100, 100)])]))
    expect(/<p:(timing|transition)[ >]|AlternateContent/.test(x!)).toBe(false)
  })
})

describe('PPTX object effects: every effect, as the nearest PowerPoint effect', () => {
  // presetID / presetClass / presetSubtype read back from PowerPoint 16 itself (see docs); `null` = no built-in, plays as written
  const TABLE: Record<string, [number | null, string, number]> = {
    appear: [1, 'entr', 0], 'fade-in': [10, 'entr', 0], 'fly-in': [2, 'entr', 8], 'zoom-in': [23, 'entr', 16], 'float-in': [42, 'entr', 0], 'wipe-in': [22, 'entr', 8], 'split-in': [16, 'entr', 37],
    'rise-up': [37, 'entr', 0], 'bounce-in': [26, 'entr', 0], 'pop-in': [null, 'entr', 0], 'grow-turn': [31, 'entr', 0], 'spin-in': [49, 'entr', 0],
    pulse: [26, 'emph', 0], 'grow-shrink': [6, 'emph', 0], spin: [8, 'emph', 0], shake: [null, 'emph', 0], bounce: [null, 'emph', 0], 'color-change': [3, 'emph', 2], transparency: [9, 'emph', 0], teeter: [32, 'emph', 0], blink: [35, 'emph', 0],
    disappear: [1, 'exit', 0], 'fade-out': [10, 'exit', 0], 'fly-out': [2, 'exit', 8], 'zoom-out': [23, 'exit', 16], 'float-out': [42, 'exit', 0], 'wipe-out': [22, 'exit', 2], shrink: [null, 'exit', 0], 'spin-out': [null, 'exit', 0],
    'path-line': [null, 'path', 0], 'path-arc': [null, 'path', 0], 'path-turn': [null, 'path', 0], 'path-circle': [null, 'path', 0], 'path-custom': [null, 'path', 0],
  }
  const ALL = [...ENTRANCES, ...EMPHASES, ...EXITS, ...PATHS]
  it('the table covers every effect the editor has', () => { expect(Object.keys(TABLE).sort()).toEqual([...ALL].sort()) })
  it.each(ALL)('%s', async (type) => {
    const { x, nodes, t } = await fxOn(fx('a', type as Effect['type'], { direction: 'left', ...(type === 'path-custom' ? { path: [[0, 0], [100, 50], [220, -30]] as [number, number][] } : {}) }), text('a', 'Alpha', 100, 100))
    lint(x)
    expect(nodes).toHaveLength(1)
    expect([nodes[0]!.preset, nodes[0]!.cls, nodes[0]!.sub]).toEqual(TABLE[type])
    // exits hide the object at the end; entrances show it first
    if (TABLE[type]![1] === 'exit') expect(t).toContain('<p:to><p:strVal val="hidden"/></p:to>')
    if (TABLE[type]![1] === 'entr') expect(t).toContain('<p:to><p:strVal val="visible"/></p:to>')
    if (TABLE[type]![1] === 'exit' && type !== 'disappear' && type !== 'shrink') expect(t).toContain('transition="out"')
    if (['fade-in', 'fly-in', 'zoom-in', 'float-in', 'rise-up', 'bounce-in', 'pop-in', 'grow-turn', 'spin-in'].includes(type)) expect(t).toContain('transition="in" filter="fade"')
    for (const m of t.matchAll(/spid="(\d+)"/g)) expect(shapeIdSet(x)).toContain(Number(m[1]))
  })
  const shapeIdSet = (x: string) => shapeIds(x).map((s) => s.id)

  it('Fly In: the eight directions give PowerPoint\'s sub types (1 top, 2 right, 4 bottom, 8 left, sums for corners) and start where our player starts', async () => {
    const dirs = { up: 1, right: 2, down: 4, left: 8, 'up-right': 3, 'down-right': 6, 'down-left': 12, 'up-left': 9 } as const
    for (const [d, sub] of Object.entries(dirs)) {
      const { t, nodes } = await fxOn(fx('a', 'fly-in', { direction: d as Effect['direction'], distance: 192 })) // 192 px = 0.1 of 1920
      expect(nodes[0]!.sub).toBe(sub)
      const xs = /<p:attrName>ppt_x<\/p:attrName>[\s\S]*?<p:strVal val="([^"]*)"\/>/.exec(t)![1]!
      const ys = /<p:attrName>ppt_y<\/p:attrName>[\s\S]*?<p:strVal val="([^"]*)"\/>/.exec(t)![1]!
      expect(xs).toBe(d.includes('left') ? '#ppt_x-0.1' : d.includes('right') ? '#ppt_x+0.1' : '#ppt_x')
      expect(ys).toBe(d.includes('up') ? '#ppt_y-0.1778' : d.includes('down') ? '#ppt_y+0.1778' : '#ppt_y') // 192 px of the 1080 px height
    }
  })

  it('Wipe: side filter and sub type; an exit goes the way the editor sends it (the opposite side)', async () => {
    expect((await fxOn(fx('a', 'wipe-in', { direction: 'up' }))).t).toContain('filter="wipe(up)"')
    expect((await fxOn(fx('a', 'wipe-in', { direction: 'down-right' }))).t).toContain('filter="wipe(right)"')
    const out = await fxOn(fx('a', 'wipe-out', { direction: 'left' }))
    expect(out.t).toContain('filter="wipe(right)"')
    expect(out.nodes[0]!.sub).toBe(2)
  })

  it('Color change: a shape changes its fill, text its font colour', async () => {
    const shp = await fxOn(fx('a', 'color-change', { color: '#16a34a' }), shape('a', 100, 100))
    expect(shp.t).toContain('<p:attrName>fillcolor</p:attrName>'); expect(shp.t).toContain('<a:srgbClr val="16A34A"/>'); expect(shp.nodes[0]!.preset).toBe(1)
    const txt = await fxOn(fx('a', 'color-change', { color: '#16a34a' }))
    expect(txt.t).toContain('<p:attrName>style.color</p:attrName>'); expect(txt.nodes[0]!.preset).toBe(3)
  })

  it('motion paths: relative to the object, in slide fractions, ending where the editor ends them; arc, turn and circle as curves, the rest as lines', async () => {
    for (const type of PATHS) {
      const e = fx('a', type, { direction: 'right', distance: 300, ...(type === 'path-custom' ? { path: [[0, 0], [100, 50], [220, -30], [320, 60]] as [number, number][] } : {}) })
      const { t, x } = await fxOn(e)
      lint(x)
      const d = /path="([^"]*)"/.exec(t)![1]!
      expect(d).toMatch(/^M 0 0( [LC](?: -?\d+(?:\.\d+)?){2,6})+ E$/)
      expect(/ C /.test(d)).toBe(type === 'path-arc' || type === 'path-turn' || type === 'path-circle')
      expect(t).toContain('origin="layout"'); expect(t).toContain('pathEditMode="relative"')
      const nums = d.replace(/[MLCE]/g, '').trim().split(/\s+/).map(Number)
      const end = pathEnd(pathOf(e))
      expect(nums[nums.length - 2]).toBeCloseTo(end[0] / 1920, 3)
      expect(nums[nums.length - 1]).toBeCloseTo(end[1] / 1080, 3)
    }
  })

  it('shake and bounce are written as sampled positions that settle back where they started', async () => {
    const sh = await fxOn(fx('a', 'shake', { distance: 19.2 }))
    const vals = [...sh.t.matchAll(/<p:strVal val="(#ppt_x[^"]*)"\/>/g)].map((m) => m[1])
    expect(vals.length).toBe(25); expect(vals[0]).toBe('#ppt_x'); expect(vals[vals.length - 1]).toBe('#ppt_x')
    expect(vals.some((v) => v === '#ppt_x+0.01' || v === '#ppt_x-0.01')).toBe(true)
  })
})

describe('PPTX object effects: text, triggers and object kinds', () => {
  it('by paragraph: one effect per paragraph aimed at its own paragraph, the later ones With Previous, staggered; build by paragraph', async () => {
    const e = fx('a', 'fade-in', { textBy: 'paragraph', stagger: 300, start: 'click' })
    const x = await one(slideOf([text('a', ['One', 'Two', 'Three'], 100, 100)], [e]))
    const t = timing(x)
    lint(x)
    expect([...t.matchAll(/<p:pRg st="(\d)" end="\1"\/>/g)].map((m) => m[1])).toEqual(['0', '0', '1', '1', '2', '2']) // show + fade per paragraph
    const nodes = effectNodes(t)
    expect(nodes.map((n) => n.node)).toEqual(['clickEffect', 'withEffect', 'withEffect'])
    expect(nodes.map((n) => n.delay)).toEqual([0, 300, 600])
    expect(t).toMatch(/<p:bldP spid="\d+" grpId="0" build="p"\/>/)
    expect(new Set(nodes.map((n) => n.grp)).size).toBe(1)
  })

  it('by word and by letter: the effect iterates over the words / letters of the whole text, one stagger apart', async () => {
    const w = await fxOn(fx('a', 'fade-in', { textBy: 'word', stagger: 120, duration: 600 }), text('a', 'Words come one by one', 100, 100))
    expect(w.t).toContain('<p:iterate type="wd"><p:tmPct val="20000"/></p:iterate>')
    const l = await fxOn(fx('a', 'fade-in', { textBy: 'letter', stagger: 40, duration: 600 }), text('a', 'Letters', 100, 100))
    expect(l.t).toContain('<p:iterate type="lt"><p:tmPct val="6667"/></p:iterate>')
    // element order inside the effect node: conditions, then iterate, then children
    expect(w.t).toMatch(/<\/p:stCondLst><p:iterate[^>]*><p:tmPct[^>]*\/><\/p:iterate><p:childTnLst>/)
    lint(w.x); lint(l.x)
  })

  it('degrades to the whole object when the text cannot be split: one paragraph by paragraph, text parts on a picture or a chart', async () => {
    const single = await fxOn(fx('a', 'fade-in', { textBy: 'paragraph' }), text('a', 'One only', 100, 100))
    expect(single.t).not.toContain('<p:pRg'); expect(effectNodes(single.t)).toHaveLength(1)
    const pic = await fxOn(fx('a', 'fade-in', { textBy: 'word' }), image('a', 100, 100))
    expect(pic.t).not.toContain('<p:iterate'); expect(effectNodes(pic.t)).toHaveLength(1)
  })

  it('a click on a trigger object plays its effects: one interactive sequence per trigger, aimed at the trigger shape', async () => {
    const effects = [fx('t1', 'fade-in', { trigger: 'tg' }), fx('t2', 'zoom-in', { trigger: 'tg', start: 'with' }), fx('t3', 'fade-in', { trigger: 'tg2' }), fx('m', 'fade-in', { start: 'click' })]
    const x = await one(slideOf([text('tg', 'Click me', 100, 100), text('tg2', 'Or me', 100, 250), text('t1', 'One', 600, 100), shape('t2', 600, 300), text('t3', 'Three', 600, 450), text('m', 'Main', 100, 500)], effects))
    const t = timing(x)
    lint(x)
    const model = compileTriggers(effects, new Set(['tg', 'tg2', 't1', 't2', 't3', 'm']))
    expect(model.size).toBe(2)
    const seqs = [...t.matchAll(/nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="(\d+)"\/>/g)].map((m) => Number(m[1]))
    expect(seqs).toEqual([idsOf(x, 'tg')[0], idsOf(x, 'tg2')[0]])
    const inter = t.slice(t.indexOf('interactiveSeq'))
    expect(effectNodes(inter).map((n) => n.node)).toEqual(['clickEffect', 'withEffect', 'clickEffect'])
    expect(effectNodes(t.slice(0, t.indexOf('interactiveSeq'))).map((n) => n.node)).toEqual(['clickEffect']) // the main sequence keeps only its own effect
    expect(t.split('<p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync>').length - 1).toBe(2)
  })

  it('pictures, charts, tables, icons and shapes all get targets; build entries only where PowerPoint writes them (text and shapes: bldP, chart: bldGraphic)', async () => {
    const els = [image('im', 100, 100), chart('ch', 500, 100), table('tb', 1100, 100), icon('ic', 100, 500), shape('sh', 300, 500), text('tx', 'Text', 600, 500)]
    const x = await one(slideOf(els, els.map((e, i) => fx(e.id, 'fade-in', { start: i === 0 ? 'click' : 'after' }))))
    const t = timing(x)
    lint(x)
    const nodes = effectNodes(t)
    expect(nodes).toHaveLength(6)
    const byEl = (id: string) => new RegExp(`<p:spTgt spid="${idsOf(x, id)[0]}"/>`).test(t)
    for (const id of ['im', 'ch', 'tb', 'ic', 'sh', 'tx']) expect(byEl(id), id).toBe(true)
    expect(t).toMatch(new RegExp(`<p:bldGraphic spid="${idsOf(x, 'ch')[0]}" grpId="0"><p:bldAsOne/></p:bldGraphic>`))
    expect(t).not.toContain(`<p:bldP spid="${idsOf(x, 'im')[0]}"`)
    expect(t).not.toContain(`<p:bldP spid="${idsOf(x, 'tb')[0]}"`)
    expect(t).toContain(`<p:bldP spid="${idsOf(x, 'sh')[0]}" grpId="0" animBg="1"/>`) // a drawn shape animates its background too
    expect(t).toContain(`<p:bldP spid="${idsOf(x, 'tx')[0]}" grpId="0"/>`) // a text box does not
    expect(nodes[0]!.grp).toBeUndefined() // the picture has no build group
  })

  it('an object with two effects gets one build group per effect', async () => {
    const x = await one(slideOf([text('a', 'Alpha', 100, 100)], [fx('a', 'fade-in'), fx('a', 'pulse'), fx('a', 'fade-out')]))
    expect(effectNodes(timing(x)).map((n) => n.grp)).toEqual([0, 1, 2])
    expect([...timing(x).matchAll(/<p:bldP spid="\d+" grpId="(\d)"/g)].map((m) => m[1])).toEqual(['0', '1', '2'])
  })

  it('an image with its colour wash is two shapes: both fade in together, ids unique', async () => {
    const img = { ...image('im', 100, 100), overlay: { from: '#000000', to: '#000000', angle: 180, opacity: 0.5 } } as never
    const x = await one(slideOf([img], [fx('im', 'fade-in')]))
    const nodes = effectNodes(timing(x))
    expect(nodes.map((n) => n.node)).toEqual(['clickEffect', 'withEffect'])
    expect(idsOf(x, 'im')).toHaveLength(2)
  })
})

describe('PPTX theme entrances still export for objects without effects', () => {
  it('writes the theme entrance for objects without effects of their own and none for those with', async () => {
    const withAnim = (e: ReturnType<typeof text>) => ({ ...e, animation: { type: 'fade-up', delay: 0, duration: 400 } }) as never
    const s = slideOf([withAnim(text('a', 'Alpha', 100, 100)), withAnim(text('b', 'Bravo', 100, 300)), withAnim(shape('c', 100, 500))], [fx('a', 'fly-in', { start: 'click' })])
    const x = await one(s)
    const t = timing(x)
    lint(x)
    expect(timing(x).split('<p:spTgt spid="' + idsOf(x, 'a')[0] + '"/>').length - 1).toBe(4) // set + fade + x + y of its own fly-in
    expect(t).toContain('#ppt_y+0.04') // fade-up of b and c
    expect(effectNodes(t).map((n) => n.node)).toEqual(['afterEffect', 'withEffect', 'clickEffect']) // theme entrances run on their own when the slide appears, the effect on the click
    expect(t).toContain('evt="onBegin"')
  })
})

describe('PPTX slide transitions', () => {
  const body = (t: Transition) => transitionXml(t).match(/<mc:Fallback>(.*)<\/mc:Fallback>/)![1]!
  it('writes each type like PowerPoint 2010+: exact milliseconds in p14:dur inside mc:AlternateContent, a plain fallback beside it', () => {
    const x = transitionXml({ type: 'fade', duration: 800 })
    expect(x).toBe('<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="med" p14:dur="800"><p:fade/></p:transition></mc:Choice><mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>')
    for (const type of ['fade', 'slide', 'push', 'wipe', 'zoom'] as const) { lint(transitionXml({ type, duration: 500 })); expect(body({ type, duration: 500 })).toMatch(/^<p:transition spd="fast"><p:(fade|cover|push|wipe|zoom)/) }
    expect(body({ type: 'slide', duration: 500 })).toContain('<p:cover dir="l"/>')
    expect(body({ type: 'zoom', duration: 500 })).toContain('<p:zoom dir="in"/>')
  })
  it('speed words: fast up to 0.7 s, medium up to 1.2 s, slow beyond; the exact time rides in p14:dur', () => {
    expect(transitionXml({ type: 'fade', duration: 700 })).toContain('spd="fast" p14:dur="700"')
    expect(transitionXml({ type: 'fade', duration: 1000 })).toContain('spd="med" p14:dur="1000"')
    expect(transitionXml({ type: 'fade', duration: 1500 })).toContain('spd="slow" p14:dur="1500"')
  })
  it('directions: the editor says where a push, slide or wipe comes FROM, PowerPoint names where it MOVES to', () => {
    const dirs = { left: 'r', right: 'l', up: 'd', down: 'u' } as const
    for (const [from, dir] of Object.entries(dirs)) {
      expect(body({ type: 'push', duration: 500, direction: from as never })).toContain(`<p:push dir="${dir}"/>`)
      expect(body({ type: 'slide', duration: 500, direction: from as never })).toContain(`<p:cover dir="${dir}"/>`)
      expect(body({ type: 'wipe', duration: 500, direction: from as never })).toContain(`<p:wipe dir="${dir}"/>`)
    }
    expect(body({ type: 'push', duration: 500 })).toContain('<p:push dir="l"/>') // default: from the right, as the player does
    expect(body({ type: 'wipe', duration: 500 })).toContain('<p:wipe dir="r"/>') // default: from the left
  })
  it('advance on click / after N ms: advClick="0" and advTm', () => {
    expect(transitionXml({ type: 'fade', duration: 400, advanceAfter: 3000, advanceOnClick: false })).toContain('advClick="0" advTm="3000"')
    expect(transitionXml({ type: 'fade', duration: 400, advanceAfter: 3000 })).toContain('advTm="3000"')
    expect(transitionXml({ type: 'fade', duration: 400, advanceAfter: 3000 })).not.toContain('advClick')
    // no transition but a timer: PowerPoint writes the attributes on an empty <p:transition>
    expect(body({ type: 'none', duration: 500, advanceAfter: 2000 })).toBe('<p:transition spd="fast" advTm="2000"/>')
    expect(transitionXml({ type: 'none', duration: 500 })).toBe('')
    expect(transitionXml(null)).toBe('')
  })
  it('in a file: after the clrMapOvr and before the timing, well-formed', async () => {
    const s = slideOf([text('a', 'A', 100, 100)], [fx('a', 'fade-in')], { type: 'push', duration: 900, direction: 'up', advanceAfter: 4000 })
    const x = await one(s)
    lint(x)
    expect(x.indexOf('</p:clrMapOvr><mc:AlternateContent')).toBeGreaterThan(0)
    expect(x.indexOf('</mc:AlternateContent><p:timing>')).toBeGreaterThan(x.indexOf('<mc:AlternateContent'))
    expect(x).toContain('<p:push dir="d"/>')
  })
})

describe('PPTX Morph', () => {
  const morphTransition = (by?: 'object' | 'word' | 'character'): Transition => ({ type: 'morph', duration: 1200, ...(by ? { by } : {}) })
  it('writes the PowerPoint 2019 / 365 Morph transition with the Fade fallback', () => {
    const x = transitionXml(morphTransition('word'))
    lint(x)
    expect(x).toBe('<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" Requires="p159"><p:transition spd="med" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" p14:dur="1200"><p159:morph option="byWord"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>')
    expect(transitionXml(morphTransition())).toContain('option="byObject"')
    expect(transitionXml(morphTransition('character'))).toContain('option="byChar"')
  })
  it('the same object (same id and type) gets the same "!!" name on both slides, unique inside each; others keep their own names', async () => {
    const a = slideOf([text('m1', 'Morph me', 100, 100), shape('m2', 100, 500), text('only-a', 'gone', 900, 100), shape('m4', 900, 500)])
    const b = slideOf([text('m1', 'Morph me', 900, 500), shape('m2', 1400, 100), text('only-b', 'new', 100, 100), text('m4', 'now text', 900, 500)], [], morphTransition('object'))
    const c = slideOf([text('m1', 'Later', 100, 100)])
    const [xa, xb, xc] = await exportXml(deckOf([a, b, c]))
    const names = (x: string) => shapeIds(x).map((s) => s.name).filter(Boolean)
    for (const x of [xa!, xb!, xc!]) lint(x)
    expect(names(xa!)).toEqual(expect.arrayContaining(['!!pt:m1', '!!pt:m2', 'pt:only-a', 'pt:m4'])) // m4 is a shape on one slide and text on the other: not the same object
    expect(names(xb!)).toEqual(expect.arrayContaining(['!!pt:m1', '!!pt:m2', 'pt:only-b', 'pt:m4']))
    for (const x of [xa!, xb!]) { const n = names(x); expect(new Set(n).size).toBe(n.length) }
    expect(names(xc!).some((n) => n.startsWith(MORPH_PREFIX))).toBe(false) // the slide after the Morph is not part of it
    expect(xb).toContain('<p159:morph option="byObject"/>')
    expect(names(xa!).filter((n) => n.startsWith('!!')).sort()).toEqual(names(xb!).filter((n) => n.startsWith('!!')).sort())
  })
  it('an object made of two shapes (a picture with its colour wash) keeps unique names that still match across the slides', async () => {
    const img = (x: number) => ({ ...image('im', x, 100), overlay: { from: '#000000', to: '#000000', angle: 180, opacity: 0.5 } }) as never
    const [xa, xb] = await exportXml(deckOf([slideOf([img(100)]), slideOf([img(900)], [], morphTransition())]))
    const n = (x: string) => shapeIds(x).map((s) => s.name).filter((s) => s.startsWith('!!'))
    expect(n(xa!)).toEqual(['!!pt:im', '!!pt:im#2'])
    expect(n(xb!)).toEqual(n(xa!))
  })
  it('a Morph on the first slide (nothing before it) pairs nothing and breaks nothing', async () => {
    const [x] = await exportXml(deckOf([slideOf([text('m1', 'x', 100, 100)], [], morphTransition())]))
    lint(x!)
    expect(x).toContain('p159:morph')
    expect(shapeIds(x!).some((s) => s.name.startsWith('!!'))).toBe(false)
  })
})

describe('PPTX motion: safety and the file as a whole', () => {
  it('a slide whose effect cannot be written keeps its transition and shapes and gets no timing; the other slides are unaffected', async () => {
    const bad = slideOf([text('a', 'Alpha', 100, 100)], [{ ...fx('a', 'fade-in'), type: 'nonsense' } as never], { type: 'fade', duration: 500 })
    const good = slideOf([text('b', 'Bravo', 100, 100)], [fx('b', 'fade-in')])
    const [xb, xg] = await exportXml(deckOf([bad, good]))
    lint(xb!); lint(xg!)
    expect(timing(xb!)).toBe('')
    expect(xb).toContain('<p:fade/>'); expect(xb).toContain('Alpha')
    expect(timing(xg!)).not.toBe('')
  })
  it('a slide that already has motion is left alone; garbage input passes through untouched', () => {
    const buf = Buffer.from('not a zip')
    expect(injectMotion(buf, [{ transition: null, targets: [] }])).toBe(buf)
    expect(wellFormed('<a><b></a>')).toBe(false); expect(wellFormed('<a x="1"><b/></a>')).toBe(true); expect(wellFormed('<a>&bogus;</a>')).toBe(false)
  })
  it('the everything deck: every slide well-formed, valid zip, content types and relationships unchanged, same files as the same deck without motion', async () => {
    const deck = everythingDeck()
    const stripped: Presentation = { ...deck, slides: deck.slides.map((s) => ({ ...s, effects: [], transition: undefined })) }
    const full = await exportFiles(deck), plain = await exportFiles(stripped)
    // (pptxgenjs numbers charts and workbooks with a counter that runs on between decks: compare those by their position)
    const norm = (f: Record<string, Uint8Array>) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k.replace(/(chart|Worksheet)\d+/g, '$1N'), v]))
    const nf = norm(full), np = norm(plain)
    expect(Object.keys(nf).sort()).toEqual(Object.keys(np).sort())
    for (const k of Object.keys(nf)) if (!/^ppt\/slides\/slide\d+\.xml$/.test(k) && !/chart|embeddings|Content_Types|rels|docProps/.test(k)) expect(Buffer.from(nf[k]!).equals(Buffer.from(np[k]!)), k).toBe(true)
    expect(strFromU8(full['[Content_Types].xml']!).replace(/\d+/g, '#')).toBe(strFromU8(plain['[Content_Types].xml']!).replace(/\d+/g, '#')) // same content types (motion adds no part)
    const xs = slideXmls(full)
    expect(xs).toHaveLength(deck.slides.length)
    xs.forEach((x, i) => {
      lint(x)
      const ids = shapeIds(x).map((s) => s.id)
      expect(new Set(ids).size, `slide ${i + 1} shape ids unique`).toBe(ids.length)
      const t = timing(x)
      if (t) { const c = cTnIds(t); expect(c).toEqual(c.map((_, j) => j + 1)); for (const m of t.matchAll(/spid="(\d+)"/g)) expect(ids).toContain(Number(m[1])) }
      // the order the schema demands: cSld, clrMapOvr, transition, timing
      const order = ['</p:cSld>', '</p:clrMapOvr>', '<mc:AlternateContent', '<p:timing>'].map((s) => x.indexOf(s)).filter((p) => p >= 0)
      expect(order).toEqual([...order].sort((a, b) => a - b))
    })
    // the effect counts per slide match the editor's model
    deck.slides.forEach((s, i) => {
      const ids = new Set(s.elements.map((e) => e.id))
      const main = compileTimeline(s.effects ?? [], ids).reduce((n, st) => n + st.effects.length, 0)
      const trig = [...compileTriggers(s.effects ?? [], ids).values()].reduce((n, st) => n + st.effects.length, 0)
      const split = (s.effects ?? []).reduce((n, e) => n + (e.textBy === 'paragraph' ? (s.elements.find((x) => x.id === e.elementId) as { paragraphs?: unknown[] } | undefined)?.paragraphs?.length ?? 1 : 1) - 1, 0)
      const extra = (x: string) => (x.match(/<p:cNvPr id="\d+" name="pt:im"/g)?.length ?? 1) - 1 // an image with a wash is two shapes
      expect(effectNodes(timing(xs[i]!)).length, `slide ${i + 1}`).toBe(main + trig + split + extra(xs[i]!) * 0)
    })
  })
})
