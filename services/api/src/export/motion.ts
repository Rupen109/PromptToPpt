import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Animation, Effect, SlideElement, Transition } from '@prompttoppt/validation'
import { buildTiming, type LegacyEntrance, type ShapeInfo } from './effects-xml.ts'

/**
 * PowerPoint keeps animation as XML inside each slide: <p:transition> (how the slide appears) and <p:timing> (the effects). pptxgenjs writes neither, so this
 * runs on the finished file: elements are tagged with the name "pt:<elementId>" while the deck is built, and here those names are turned into shape ids
 * and the slide's effects (effects-xml.ts), its transition and Morph are written to match what our own player does.
 * Ambient loops (Ken Burns, float, drift) have no entrance and stay out of the file.
 */

export const NAME_PREFIX = 'pt:'
/** PowerPoint's Morph pairs shapes whose names start with this on two consecutive slides */
export const MORPH_PREFIX = '!!'
export interface MotionTarget { elementId: string; animation: Animation; paragraphs: number }
export interface SlideMotion {
  transition: Transition | null
  /** the theme's own entrance of elements that have no effects of their own */
  targets: MotionTarget[]
  /** the slide's object effects (`slide.effects`) */
  effects?: readonly Effect[]
  /** the objects that are in the file, by element id */
  elements?: readonly { id: string; type: SlideElement['type'] }[]
  canvas?: { w: number; h: number }
  /** elements that are the same object on this slide and its neighbour in a Morph: both shapes get the same "!!" name */
  morphPairs?: ReadonlySet<string>
}

const ENTRANCES = new Set(['fade', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom', 'pop', 'wipe', 'blur', 'count-up'])
export const hasEntrance = (a: Animation | undefined): a is Animation => !!a && ENTRANCES.has(a.type)

// ─── transitions ────────────────────────────────────────────────────────────────────────────────────────────────────

const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main'
const P159 = 'http://schemas.microsoft.com/office/powerpoint/2015/09/main'

/** "comes from the left" (what the editor stores) is, in PowerPoint's words, moving to the right: `dir` names the way the motion goes */
const MOVES: Record<NonNullable<Transition['direction']>, string> = { left: 'r', right: 'l', up: 'd', down: 'u' }
const MORPH_OPTION = { object: 'byObject', word: 'byWord', character: 'byChar' } as const

/** Our player's slide transitions, in PowerPoint's vocabulary. Written like PowerPoint 2010+ writes them: exact milliseconds (p14:dur) with a plain `spd` fallback. */
export function transitionXml(t: Transition | null): string {
  if (!t) return ''
  const advance = `${t.advanceOnClick === false ? ' advClick="0"' : ''}${t.advanceAfter !== undefined ? ` advTm="${Math.round(t.advanceAfter)}"` : ''}`
  if (t.type === 'none' && !advance) return ''
  const ms = Math.round(Math.min(60000, Math.max(100, t.duration)))
  const spd = ms <= 700 ? 'fast' : ms <= 1200 ? 'med' : 'slow'
  const dir = (d: Transition['direction'], fallback: NonNullable<Transition['direction']>) => MOVES[d ?? fallback]
  const body = ({ none: '', fade: '<p:fade/>', slide: `<p:cover dir="${dir(t.direction, 'right')}"/>`, push: `<p:push dir="${dir(t.direction, 'right')}"/>`, zoom: '<p:zoom dir="in"/>', wipe: `<p:wipe dir="${dir(t.direction, 'left')}"/>`, morph: '<p:fade/>' } as const)[t.type]
  const tag = (inner: string, extra = '') => (inner ? `<p:transition spd="${spd}"${extra}${advance}>${inner}</p:transition>` : `<p:transition spd="${spd}"${extra}${advance}/>`)
  if (t.type === 'morph') {
    const by = MORPH_OPTION[t.by ?? 'object']
    return `<mc:AlternateContent xmlns:mc="${MC}"><mc:Choice xmlns:p159="${P159}" Requires="p159"><p:transition spd="${spd}" xmlns:p14="${P14}" p14:dur="${ms}"${advance}><p159:morph option="${by}"/></p:transition></mc:Choice><mc:Fallback>${tag(body)}</mc:Fallback></mc:AlternateContent>`
  }
  return `<mc:AlternateContent xmlns:mc="${MC}"><mc:Choice xmlns:p14="${P14}" Requires="p14">${tag(body, ` p14:dur="${ms}"`)}</mc:Choice><mc:Fallback>${tag(body)}</mc:Fallback></mc:AlternateContent>`
}

// ─── the file ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** every opened tag is closed in order, attribute quotes are paired, entities are known (a cheap well-formedness check that runs on every slide before it is written) */
export function wellFormed(xml: string): boolean {
  const stack: string[] = []
  const rest = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/g
  let last = 0
  for (let m = tag.exec(rest); m; m = tag.exec(rest)) {
    if (rest.slice(last, m.index).includes('<')) return false // a stray "<" outside a tag
    last = m.index + m[0].length
    if (m[4]) continue
    if (m[1]) { if (stack.pop() !== m[2]) return false } else stack.push(m[2]!)
  }
  return stack.length === 0 && !/<[^>]*$/.test(rest.slice(last)) && !/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(rest)
}

const SHAPE_BLOCK = /<p:(sp|pic|graphicFrame|cxnSp)>[\s\S]*?<\/p:\1>/g

/** what each exported shape is in the file (the effects need to know: a picture has no text to build by paragraph, a chart is built as one) */
function shapeInfos(xml: string): Map<number, Omit<ShapeInfo, 'spids'>> {
  const out = new Map<number, Omit<ShapeInfo, 'spids'>>()
  for (const m of xml.matchAll(SHAPE_BLOCK)) {
    const block = m[0]
    const id = Number(/<p:cNvPr id="(\d+)"/.exec(block)?.[1])
    if (!Number.isFinite(id)) continue
    const kind = m[1] === 'sp' ? 'sp' : m[1] === 'pic' ? 'pic' : m[1] === 'cxnSp' ? 'cxn' : /drawingml\/2006\/chart/.test(block) ? 'chart' : 'table'
    out.set(id, { kind, textBox: false, paragraphs: (block.match(/<a:p>|<a:p /g) ?? []).length })
  }
  return out
}

const elementOfName = (name: string) => name.replace(/^!!/, '').slice(NAME_PREFIX.length).replace(/#\d+$/, '')

/**
 * Adds transitions, Morph and every kind of animation to a finished .pptx. Any problem with one slide leaves that slide as it was (no motion is
 * better than a file PowerPoint offers to "repair"). Shape ids are renumbered per slide so every animation target is unambiguous.
 */
export function injectMotion(file: Buffer, slides: SlideMotion[]): Buffer {
  if (!slides.some((s) => (s.transition && (s.transition.type !== 'none' || s.transition.advanceAfter !== undefined || s.transition.advanceOnClick === false)) || s.targets.length > 0 || (s.effects?.length ?? 0) > 0)) return file
  const files = unzipSync(new Uint8Array(file))
  slides.forEach((m, i) => {
    const path = `ppt/slides/slide${i + 1}.xml`
    const raw = files[path]
    if (!raw) return
    try {
      const original = strFromU8(raw)
      let xml = original
      const byName = new Map<string, number[]>()
      const seen = new Map<string, number>()
      let n = 0
      xml = xml.replace(/<p:cNvPr id="\d+" name="([^"]*)"/g, (_m, name: string) => {
        n += 1
        let out = name
        if (name.startsWith(NAME_PREFIX)) {
          const id = name.slice(NAME_PREFIX.length)
          byName.set(id, [...(byName.get(id) ?? []), n])
          // Morph pairs shapes by name: the same "!!" name on both slides, unique inside each (a second shape of one object gets a number)
          if (m.morphPairs?.has(id)) { const k = (seen.get(id) ?? 0) + 1; seen.set(id, k); out = `${MORPH_PREFIX}${name}${k > 1 ? `#${k}` : ''}` }
        }
        return `<p:cNvPr id="${n}" name="${out}"`
      })
      if (!xml.includes('</p:clrMapOvr>') || /<p:(transition|timing)[ >]|<mc:AlternateContent/.test(xml)) { if (xml !== original && wellFormed(xml)) files[path] = strToU8(xml); return }

      let transition = ''
      try { transition = transitionXml(m.transition) } catch { transition = '' }
      let timing = ''
      try {
        const infos = shapeInfos(xml)
        const types = new Map((m.elements ?? []).map((e) => [e.id, e.type]))
        const shapes = new Map<string, ShapeInfo>()
        for (const [id, spids] of byName) {
          const first = infos.get(spids[0]!)
          // pptxgenjs does not flag text boxes in the file: the editor's own element type says which shape is text (a text, or an icon, which is its name as text)
          if (first) shapes.set(id, { ...first, spids, textBox: first.kind === 'sp' && (types.get(id) === 'text' || types.get(id) === 'icon') })
        }
        const legacy: LegacyEntrance[] = m.targets.map((t) => ({ elementId: t.elementId, animation: t.animation, paragraphs: t.paragraphs }))
        timing = buildTiming({ effects: m.effects ?? [], shapes, elementTypes: types, canvas: m.canvas ?? { w: 1920, h: 1080 }, legacy })
        const ids = new Set(infos.keys())
        for (const t of timing.matchAll(/spid="(\d+)"/g)) if (!ids.has(Number(t[1]))) throw new Error('animation target is not in the slide')
      } catch { timing = '' } // this slide is left without animation
      const withMotion = (t: string, x: string) => xml.replace('</p:clrMapOvr>', `</p:clrMapOvr>${x}${t}`)
      let out = withMotion(timing, transition)
      if (!wellFormed(out)) out = withMotion('', transition)
      if (!wellFormed(out)) out = xml
      if (out !== original && wellFormed(out)) files[path] = strToU8(out)
    } catch { /* leave this slide without motion */ }
  })
  return Buffer.from(zipSync(files))
}
