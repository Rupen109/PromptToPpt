import type { DemoScene, MorphCategory, MorphTemplate, TemplateData, TemplateObject, TemplatePicture, TemplateSlide } from './types'

/**
 * Authoring a Morph template from scratch (no source deck to import): define every object ONCE, then say where each one is in each scene.
 *
 *   const T = authored({ id, name, ..., fonts, colors }, {
 *     objects: { hero: { kind: 'image', art: 'x-hero.webp', alt: '...' }, title: { kind: 'text', text: 'Hello', px: 120, weight: 800, color: '#fff' }, ... },
 *     order: ['bg', 'hero', 'title'],            // back to front (defaults to the order of `objects`)
 *     scenes: [{ id: 's1', title: 'Cover', purpose: '...', bg: '#101010', place: { hero: rect(900, 100, 800, 800), title: { x: 80, y: 700, w: 1200, h: 200 } } }, ...],
 *   })
 *
 * The same id on two scenes is the same object: the Morph moves it from one place to the other (position, size, rotation, opacity). An object missing from a scene leaves (fades) or
 * enters (from the nearest edge); give it `park: 'l' | 'r' | 't' | 'b'` and it instead waits OFF the slide on that side between the scenes it is used on, so it glides in and out.
 * Typography is exact (px, weight, tracking and line height as written); pictures are files in apps/web/public/morph-templates (made by scripts/gen-morph-photos.mjs).
 */
export const W = 1920
export const H = 1080
export type Dir = 'l' | 'r' | 't' | 'b'

export interface Place { x: number; y: number; w: number; h: number; rot?: number; /** opacity 0-1 */ a?: number; /** other words in this scene (a text object) */ text?: string; /** another picture in this scene (an image object): it crossfades */ art?: string; /** another colour in this scene (a shape) */ fill?: string; /** another text size in this scene (a text object): the words scale between sizes during the Morph */ px?: number; /** another text colour in this scene (a text object): the old and new colour crossfade */ color?: string; /** another corner radius in this scene (a shape or a picture) */ radius?: number }

interface Common { /** where the object waits, off the slide, on scenes it is not used on (between its first and last use) */ park?: Dir }
export interface ImageObj extends Common { kind: 'image'; art: string; alt: string; fit?: 'cover' | 'contain'; radius?: number; clip?: 'circle' | 'arch' | 'diagonal' | 'diagonal-flip' | 'hex' }
export interface TextObj extends Common { kind: 'text'; text: string; px: number; weight?: number; color?: string; align?: 'l' | 'ctr' | 'r'; caps?: boolean; italic?: boolean; /** line height as a multiple of px, default 1.15 */ lh?: number; /** letter spacing in px */ spc?: number; anchor?: 'top' | 'ctr' | 'b'; /** which of the template's two faces, default body */ face?: 'heading' | 'body' }
export interface ShapeObj extends Common { kind: 'shape'; fill?: string; shape?: 'rect' | 'ellipse' | 'ring' | 'triangle' | 'chevron' | 'line'; radius?: number; gradient?: { from: string; to: string; angle?: number }; stroke?: string; strokeW?: number; poly?: number[][] }
export type ObjDef = ImageObj | TextObj | ShapeObj

export interface SceneDef { id: string; title: string; purpose: string; /** flat background colour (default: the template's) */ bg?: string; /** or a gradient */ grad?: { from: string; to: string; angle?: number }; place: Record<string, Place | null | undefined> }
export interface AuthorInput { objects: Record<string, ObjDef>; order?: string[]; scenes: SceneDef[] }

// ── layout helpers: every number is in canvas px on the 1920 x 1080 slide ──
export const rect = (x: number, y: number, w: number, h: number, extra: Partial<Place> = {}): Place => ({ x, y, w, h, ...extra })
export const full = (extra: Partial<Place> = {}): Place => ({ x: 0, y: 0, w: W, h: H, ...extra })
/** a box of this size centred on the slide, moved by dx, dy */
export const center = (w: number, h: number, dx = 0, dy = 0, extra: Partial<Place> = {}): Place => ({ x: (W - w) / 2 + dx, y: (H - h) / 2 + dy, w, h, ...extra })
/** `n` boxes side by side */
export const row = (n: number, x: number, y: number, w: number, h: number, gap: number): Place[] => Array.from({ length: n }, (_, i) => ({ x: x + i * (w + gap), y, w, h }))
export const col = (n: number, x: number, y: number, w: number, h: number, gap: number): Place[] => Array.from({ length: n }, (_, i) => ({ x, y: y + i * (h + gap), w, h }))
/** `cols` x `rows` boxes filling the area, row by row */
export const grid = (cols: number, rows: number, x: number, y: number, w: number, h: number, gap: number): Place[] => {
  const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows
  return Array.from({ length: cols * rows }, (_, i) => ({ x: x + (i % cols) * (cw + gap), y: y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }))
}
/** the same place with changes */
export const at = (p: Place, patch: Partial<Place>): Place => ({ ...p, ...patch })
/** the same place moved just off the slide on a side (so it can glide in or out) */
export const off = (p: Place, dir: Dir, gap = 80): Place => ({ ...p, ...(dir === 'l' ? { x: -p.w - gap } : dir === 'r' ? { x: W + gap } : dir === 't' ? { y: -p.h - gap } : { y: H + gap }) })
/** the biggest box of this width/height ratio inside an area, centred in it */
export const fitIn = (area: { x: number; y: number; w: number; h: number }, ratio: number): Place => {
  const w = Math.min(area.w, area.h * ratio), h = w / ratio
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h }
}
/** a box scaled about its centre */
export const scale = (p: Place, k: number): Place => ({ ...p, x: p.x + (p.w - p.w * k) / 2, y: p.y + (p.h - p.h * k) / 2, w: p.w * k, h: p.h * k })

const round1 = (n: number) => Math.round(n * 10) / 10

/** The template data an authored template is made of, and the pictures it uses. */
export function author(source: string, fonts: { heading: string; body: string }, input: AuthorInput): { data: TemplateData; pictures: Record<string, TemplatePicture> } {
  const ids = input.order ?? Object.keys(input.objects)
  for (const id of ids) if (!input.objects[id]) throw new Error(`author(${source}): order names an unknown object "${id}"`)
  for (const sc of input.scenes) for (const id of Object.keys(sc.place)) if (!input.objects[id]) throw new Error(`author(${source}): scene ${sc.id} places an unknown object "${id}"`)
  input.scenes.forEach((sc, i) => { if (sc.id !== `s${i + 1}`) throw new Error(`author(${source}): scene ${i + 1} must be called s${i + 1}, not ${sc.id}`) })
  const pictures: Record<string, TemplatePicture> = {}
  const media: Record<string, string> = {}
  const usedIn = (id: string) => input.scenes.flatMap((sc, i) => (sc.place[id] ? [i] : []))
  const slides: TemplateSlide[] = input.scenes.map((sc, si) => {
    const objects: TemplateObject[] = []
    ids.forEach((id, z) => {
      const def = input.objects[id]!
      let p = sc.place[id] ?? null
      let alpha = p ? p.a ?? 1 : 1
      if (!p) {
        const used = usedIn(id)
        if (!def.park || used.length === 0 || si < used[0]! || si > used[used.length - 1]!) return
        // parked: the nearest earlier use of it (or the next one), moved off the slide, invisible
        const prev = [...used].reverse().find((i) => i < si)
        p = off(input.scenes[prev ?? used[0]!]!.place[id]!, def.park)
        alpha = 0
      }
      const base = { id, x: round1(p.x), y: round1(p.y), w: round1(p.w), h: round1(p.h), rot: round1(p.rot ?? 0), z, ...(alpha < 1 ? { alpha: round1(alpha * 100) / 100 } : {}) }
      if (def.kind === 'image') {
        const art = p.art ?? def.art
        pictures[art] = { src: art, alt: def.alt }
        media[art] = art
        objects.push({ ...base, kind: 'image', hash: art, file: art, geom: 'rect', crop: null, ...(def.fit ? { fit: def.fit } : {}), ...((p.radius ?? def.radius) ? { radius: p.radius ?? def.radius } : {}), ...(def.clip ? { clip: def.clip } : {}) })
      } else if (def.kind === 'text') {
        const text = p.text ?? def.text
        const face = def.face === 'heading' ? fonts.heading : fonts.body
        const weight = def.weight ?? 400
        const lines = text.split('\n')
        const runs = lines.flatMap((line, i) => [...(i ? [{ t: '\n' }] : []), { t: line, sz: round1((p.px ?? def.px) * 0.75), w: weight, b: weight >= 600, i: !!def.italic, cap: def.caps ? 'all' : null, spc: def.spc ? round1(def.spc * 0.75) : null, font: face, color: p.color ?? def.color ?? '#FFFFFF' }])
        objects.push({ ...base, kind: 'text', exact: true, anchor: def.anchor ?? 'top', paras: [{ algn: def.align ?? 'l', lnSpc: def.lh ?? 1.15, runs }] })
      } else {
        objects.push({
          ...base, kind: 'shape', exact: true, geom: def.shape === 'ellipse' ? 'ellipse' : 'rect', fill: p.fill ?? def.fill ?? (def.gradient || def.stroke ? null : '#FFFFFF'),
          ...(def.shape && def.shape !== 'rect' && def.shape !== 'ellipse' ? { shape: def.shape } : {}), ...((p.radius ?? def.radius) ? { radius: p.radius ?? def.radius } : {}),
          ...(def.gradient ? { gradient: { from: def.gradient.from, to: def.gradient.to, angle: def.gradient.angle ?? 135 } } : {}), ...(def.stroke ? { stroke: def.stroke, strokeW: def.strokeW ?? 2 } : {}), ...(def.poly ? { poly: def.poly } : {}),
        })
      }
    })
    return { n: si + 1, background: sc.bg ?? null, ...(sc.grad ? { bgGradient: { from: sc.grad.from, to: sc.grad.to, angle: sc.grad.angle ?? 135 } } : {}), transition: { speed: null, durationMs: null, morph: null }, objects }
  })
  return { data: { source, canvas: { w: W, h: H }, slides, media }, pictures }
}

type Meta = Omit<MorphTemplate, 'data' | 'pictures' | 'scenes' | 'replace' | 'demo' | 'category' | 'audience' | 'durationMs' | 'background'> & { category: MorphCategory; audience: string; durationMs?: number; background: string; /** default: every scene, with the words it is authored with */ demo?: DemoScene[]; replace?: Record<string, string> }

/** A complete template: its metadata, its objects and scenes, and the sample words of its demo. */
export function authored(meta: Meta, input: AuthorInput): MorphTemplate {
  const { data, pictures } = author(meta.id, meta.fonts, input)
  return {
    ...meta, durationMs: meta.durationMs ?? 1500, replace: meta.replace ?? {}, data, demo: meta.demo ?? input.scenes.map((s) => ({ scene: s.id, copy: [] })),
    pictures: { void: { src: 'space-void.png', alt: '' }, ...pictures },
    scenes: input.scenes.map((s) => ({ id: s.id, title: s.title, purpose: s.purpose })),
  }
}
