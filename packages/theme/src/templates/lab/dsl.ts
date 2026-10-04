import { elementSchema, type Slide, type SlideElement, type Theme } from '@prompttoppt/validation'

/**
 * Tiny authoring kit for hand-composed ("art-directed") template slides on the 1920×1080 canvas. Premium templates are
 * composed by a designer — photo crops, colour blocks, layered shapes, staggered motion — instead of by the generic layout
 * engine. Everything goes through the element schema, so defaults and validation are identical to real documents.
 */
export const W = 1920
export const H = 1080

export type AnimType = 'fade' | 'fade-up' | 'fade-down' | 'slide-left' | 'slide-right' | 'zoom' | 'pop' | 'wipe' | 'blur' | 'count-up' | 'kenburns' | 'float' | 'drift'
export const A = (type: AnimType, delay = 0, duration = 800, extra: { byParagraph?: boolean; stagger?: number } = {}) => ({ type, delay, duration, ...extra })

interface Pos { x: number; y: number; w: number; h: number; rot?: number; op?: number; anim?: ReturnType<typeof A> }
const ROLE_FONT_HEADING = new Set(['title', 'heading', 'metric'])

export class SlideBuilder {
  private els: SlideElement[] = []
  private z = 1
  private n = 0
  constructor(private readonly id: string, private readonly background: NonNullable<Slide['background']>) {}

  private add(partial: Record<string, unknown>, p: Pos, z?: number) {
    this.els.push(elementSchema.parse({ id: `${this.id}-e${this.n++}`, x: p.x, y: p.y, width: p.w, height: p.h, rotation: p.rot ?? 0, opacity: p.op ?? 1, zIndex: z ?? this.z++, ...(p.anim ? { animation: p.anim } : {}), ...partial }))
    return this
  }

  /** rectangle / ellipse / ring shape. `fill` is a hex colour. */
  shape(kind: 'rect' | 'ellipse' | 'ring' | 'triangle' | 'chevron', p: Pos & { fill: string; radius?: number; stroke?: string; strokeWidth?: number; gradient?: { from: string; to: string; angle?: number }; decorative?: boolean }) {
    return this.add({ type: 'shape', shape: kind, fill: p.fill, radius: p.radius ?? 0, ...(p.stroke ? { stroke: p.stroke, strokeWidth: p.strokeWidth ?? 4 } : {}), ...(p.gradient ? { gradient: { angle: 135, ...p.gradient } } : {}), ...(p.decorative ? { decorative: true, locked: true } : {}) }, p)
  }

  image(p: Pos & { src: string; alt: string; clip?: 'none' | 'circle' | 'arch' | 'diagonal' | 'diagonal-flip'; radius?: number; overlay?: { from: string; to: string; angle?: number; opacity?: number } }) {
    return this.add({ type: 'image', src: p.src, alt: p.alt, fit: 'cover', clip: p.clip ?? 'none', ...(p.radius !== undefined ? { radius: p.radius } : {}), ...(p.overlay ? { overlay: { angle: 180, opacity: 1, ...p.overlay } } : {}) }, p)
  }

  text(p: Pos & { text: string | string[]; size: number; color: string; role?: 'title' | 'heading' | 'body' | 'caption' | 'metric' | 'subtitle'; weight?: number; align?: 'left' | 'center' | 'right'; valign?: 'top' | 'middle' | 'bottom'; lh?: number; ls?: number; upper?: boolean; gap?: number }) {
    const paras = (Array.isArray(p.text) ? p.text : p.text.split('\n')).map((t) => ({ runs: [{ text: t }] }))
    return this.add({ type: 'text', role: p.role ?? 'body', paragraphs: paras, fontSize: p.size, color: p.color, align: p.align ?? 'left', valign: p.valign ?? 'top', ...(p.weight ? { weight: p.weight } : {}), ...(p.lh ? { lineHeight: p.lh } : {}), ...(p.ls ? { letterSpacing: p.ls } : {}), ...(p.upper ? { uppercase: true } : {}), paraGap: p.gap ?? (Array.isArray(p.text) ? 0.04 : 0.5) }, p)
  }

  /** a pill/badge: rounded rect + centred caption in one call */
  pill(p: Pos & { text: string; fill: string; fillOp?: number; color: string; size?: number; stroke?: string; weight?: number }) {
    this.shape('rect', { x: p.x, y: p.y, w: p.w, h: p.h, fill: p.fill, radius: p.h / 2, ...(p.fillOp !== undefined ? { op: p.fillOp } : {}), ...(p.stroke ? { stroke: p.stroke, strokeWidth: 3 } : {}), ...(p.anim ? { anim: p.anim } : {}), ...(p.rot ? { rot: p.rot } : {}) })
    return this.text({ x: p.x, y: p.y, w: p.w, h: p.h, text: p.text, size: p.size ?? 24, color: p.color, role: 'caption', weight: p.weight ?? 800, align: 'center', valign: 'middle', upper: true, ls: 1.5, ...(p.anim ? { anim: p.anim } : {}), ...(p.rot ? { rot: p.rot } : {}) })
  }

  build(opts: { notes?: string; transition?: 'fade' | 'slide' | 'zoom' | 'push' | 'wipe' } = {}): Slide {
    return {
      id: this.id, layoutId: 'blank', locked: false, manual: true, background: this.background, elements: this.els, speakerNotes: opts.notes ?? '', sources: [],
      validation: { status: 'passed', issues: [] }, ...(opts.transition ? { transition: { type: opts.transition, duration: 600 } } : {}),
    } as Slide
  }
}

export interface LabTemplate {
  id: string
  name: string
  category: string
  tagline: string
  theme: Theme
  /** `img(name)` → URL of a template image (supplied by the host: web public folder, CDN…) */
  slides: (img: (name: string) => string) => Slide[]
}
