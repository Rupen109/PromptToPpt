import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { Animation, Transition } from '@prompttoppt/validation'

/**
 * PowerPoint keeps animation as XML inside each slide: <p:transition> (how the slide appears) and <p:timing> (one entrance effect per
 * element). pptxgenjs writes neither, so this runs on the finished file: elements are tagged with the name "pt:<elementId>" while the
 * deck is built, and here those names are turned into shape ids and the effects are written to match what our own player does
 * (same direction, distance and timing). Ambient loops (Ken Burns, float, drift) have no entrance and stay out of the file.
 */

export const NAME_PREFIX = 'pt:'
export interface MotionTarget { elementId: string; animation: Animation; paragraphs: number }
export interface SlideMotion { transition: Transition | null; targets: MotionTarget[] }

const ENTRANCES = new Set(['fade', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom', 'pop', 'wipe', 'blur', 'count-up'])
export const hasEntrance = (a: Animation | undefined): a is Animation => !!a && ENTRANCES.has(a.type)

/** PowerPoint plays a "linear" effect and a "Medium" transition slower than our eased browser player feels, so the file is tuned snappier. */
const MAX_EFFECT_MS = 450
/** however many elements a slide has, the last one starts within this long after the slide appears */
const MAX_START_MS = 700

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)))

/** Our player's slide transitions, in PowerPoint's vocabulary (dir = direction of movement). */
export function transitionXml(t: Transition | null): string {
  if (!t || t.type === 'none') return ''
  const spd = t.duration <= 700 ? 'fast' : t.duration <= 1200 ? 'med' : 'slow'
  const body = { fade: '<p:fade/>', slide: '<p:cover dir="l"/>', push: '<p:push dir="l"/>', zoom: '<p:zoom dir="in"/>', wipe: '<p:wipe dir="r"/>' }[t.type]
  return body ? `<p:transition spd="${spd}">${body}</p:transition>` : ''
}

class Ids {
  private n = 2 // 1 = the main sequence's parent
  next() { return ++this.n }
}

const tgt = (spid: number, para?: number) =>
  `<p:tgtEl><p:spTgt spid="${spid}">${para === undefined ? '' : `<p:txEl><p:pRg st="${para}" end="${para}"/></p:txEl>`}</p:spTgt></p:tgtEl>`

const animNum = (ids: Ids, spid: number, attr: string, dur: number, from: string, to: string, para?: number) =>
  `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>${tgt(spid, para)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`

const fadeIn = (ids: Ids, spid: number, dur: number, para?: number) =>
  `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}"/>${tgt(spid, para)}</p:cBhvr></p:animEffect>`

/** One entrance effect for one target (a whole shape, or one paragraph of it). */
function effect(ids: Ids, spid: number, a: Animation, first: boolean, delay: number, para?: number): string {
  const dur = clamp(a.duration, 100, MAX_EFFECT_MS)
  const preset = ({ fade: [10, 0], 'count-up': [10, 0], blur: [10, 0], 'fade-up': [42, 0], 'fade-down': [42, 0], 'slide-left': [2, 8], 'slide-right': [2, 2], zoom: [53, 16], pop: [53, 16], wipe: [22, 8] } as Record<string, number[]>)[a.type] ?? [10, 0]
  const show = `<p:set><p:cBhvr><p:cTn id="${ids.next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>${tgt(spid, para)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`
  let body = ''
  switch (a.type) {
    case 'wipe': body = `<p:animEffect transition="in" filter="wipe(left)"><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}"/>${tgt(spid, para)}</p:cBhvr></p:animEffect>`; break
    case 'fade-up': body = fadeIn(ids, spid, dur, para) + animNum(ids, spid, 'ppt_y', dur, '#ppt_y+0.04', '#ppt_y', para); break
    case 'fade-down': body = fadeIn(ids, spid, dur, para) + animNum(ids, spid, 'ppt_y', dur, '#ppt_y-0.04', '#ppt_y', para); break
    case 'slide-left': body = fadeIn(ids, spid, dur, para) + animNum(ids, spid, 'ppt_x', dur, '#ppt_x-0.04', '#ppt_x', para); break
    case 'slide-right': body = fadeIn(ids, spid, dur, para) + animNum(ids, spid, 'ppt_x', dur, '#ppt_x+0.04', '#ppt_x', para); break
    case 'zoom': case 'pop': {
      const s = a.type === 'pop' ? 70000 : 88000
      body = fadeIn(ids, spid, dur, para) + `<p:animScale><p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>${tgt(spid, para)}</p:cBhvr><p:from x="${s}" y="${s}"/><p:to x="100000" y="100000"/></p:animScale>`
      break
    }
    default: body = fadeIn(ids, spid, dur, para) // fade, blur and count-up play as a fade
  }
  return `<p:par><p:cTn id="${ids.next()}" presetID="${preset[0]}" presetClass="entr" presetSubtype="${preset[1]}" fill="hold" decel="100000"${para !== undefined ? ' grpId="0"' : ''} nodeType="${first ? 'afterEffect' : 'withEffect'}"><p:stCondLst><p:cond delay="${clamp(delay, 0, 60000)}"/></p:stCondLst><p:childTnLst>${show}${body}</p:childTnLst></p:cTn></p:par>`
}

/** The slide's whole animation: every effect starts on its own delay after the slide appears, no clicks needed (like present mode). */
export function timingXml(effects: { spids: number[]; animation: Animation; paragraphs: number }[]): string {
  if (effects.length === 0) return ''
  const ids = new Ids()
  const outer = ids.next(), inner = ids.next()
  // one factor for the whole slide keeps the order and rhythm of the stagger while capping the total wait
  const starts = effects.flatMap((e) => (e.animation.byParagraph && e.paragraphs > 1 ? Array.from({ length: e.paragraphs }, (_, p) => e.animation.delay + p * (e.animation.stagger ?? 150)) : [e.animation.delay]))
  const squeeze = Math.min(1, MAX_START_MS / Math.max(1, ...starts))
  let first = true
  const parts: string[] = []
  const builds: string[] = []
  for (const e of effects) {
    const a = e.animation
    const perParagraph = !!a.byParagraph && e.paragraphs > 1
    e.spids.forEach((spid, k) => {
      if (perParagraph && k === 0) {
        for (let p = 0; p < e.paragraphs; p++) { parts.push(effect(ids, spid, a, first, (a.delay + p * (a.stagger ?? 150)) * squeeze, p)); first = false }
        builds.push(`<p:bldP spid="${spid}" grpId="0" build="p"/>`)
      } else { parts.push(effect(ids, spid, a, first, a.delay * squeeze)); first = false }
    })
  }
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="${outer}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst><p:par><p:cTn id="${inner}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${parts.join('')}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${builds.length ? `<p:bldLst>${builds.join('')}</p:bldLst>` : ''}</p:timing>`
}

/**
 * Adds transitions and entrance animations to a finished .pptx. Any problem with one slide leaves that slide as it was (no motion is
 * better than a file PowerPoint offers to "repair"). Shape ids are renumbered per slide so every animation target is unambiguous.
 */
export function injectMotion(file: Buffer, slides: SlideMotion[]): Buffer {
  if (!slides.some((s) => s.transition?.type !== undefined && s.transition.type !== 'none' || s.targets.length > 0)) return file
  const files = unzipSync(new Uint8Array(file))
  slides.forEach((m, i) => {
    const path = `ppt/slides/slide${i + 1}.xml`
    const raw = files[path]
    if (!raw) return
    try {
      let xml = strFromU8(raw)
      const byName = new Map<string, number[]>()
      let n = 0
      xml = xml.replace(/<p:cNvPr id="\d+" name="([^"]*)"/g, (_m, name: string) => {
        n += 1
        if (name.startsWith(NAME_PREFIX)) byName.set(name.slice(NAME_PREFIX.length), [...(byName.get(name.slice(NAME_PREFIX.length)) ?? []), n])
        return `<p:cNvPr id="${n}" name="${name}"`
      })
      const effects = m.targets.flatMap((t) => { const spids = byName.get(t.elementId); return spids?.length ? [{ spids, animation: t.animation, paragraphs: t.paragraphs }] : [] })
      const extra = transitionXml(m.transition) + timingXml(effects)
      if (!extra || !xml.includes('</p:sld>') || /<p:(transition|timing)[ >]/.test(xml)) return
      files[path] = strToU8(xml.replace('</p:sld>', `${extra}</p:sld>`))
    } catch { /* leave this slide without motion */ }
  })
  return Buffer.from(zipSync(files))
}
