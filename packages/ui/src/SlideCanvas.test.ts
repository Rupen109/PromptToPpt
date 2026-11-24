import { describe, expect, it } from 'vitest'
import { ElementView } from './SlideCanvas'

/**
 * Present mode and the share viewer play entrance animations, and an animation's `transform` would erase an element's rotation. So an animated, rotated element
 * is drawn inside a positioned wrapper (which animates) and sits at 0,0 inside it (carrying the rotation). Every element type must go through that wrapper:
 * when the photo of a tilted polaroid skipped it, the picture was drawn in the slide's top-left corner while the white frame stayed in place.
 */
const theme = { colors: { primary: '#111', onPrimary: '#fff', surface: '#eee', secondary: '#888', textPrimary: '#000', textSecondary: '#555' }, fonts: { heading: 'H', body: 'B' }, radius: 8 } as never
const slide = {} as never
const box = { id: 'e', x: 1200, y: 100, width: 600, height: 700, zIndex: 5, opacity: 1, rotation: 3, animation: { type: 'fade-up', duration: 600, delay: 0 } }
const ELEMENTS: Record<string, object> = {
  'photo': { ...box, type: 'image', src: 'https://example.com/a.jpg', alt: 'a', fit: 'cover' },
  'photo placeholder (no picture yet)': { ...box, type: 'image', src: '', alt: 'a', fit: 'cover' },
  'chart': { ...box, type: 'chart', chartType: 'bar', labels: ['a'], series: [{ name: 's', values: [1] }] },
  'table': { ...box, type: 'table', header: ['a'], rows: [['b']] },
  'sticker': { ...box, type: 'icon', name: '⭐' },
  'shape': { ...box, type: 'shape', shape: 'rect', fill: '#fff' },
  'text': { ...box, type: 'text', role: 'body', fontSize: 30, color: 'textPrimary', align: 'left', paragraphs: [{ runs: [{ text: 'hi' }] }] },
}
type Node = { props: { style: Record<string, unknown>; children?: unknown } }
const render = (el: object, play: boolean) => ElementView({ el: el as never, theme, slide, play }) as unknown as Node
const inner = (n: Node) => (n.props.children as Node)

describe('a background pattern', () => {
  it('a colour background with a pattern draws the shared SVG (the exporter renders the same one), at the slide\'s size', async () => {
    const { SlideBackground } = await import('./SlideCanvas')
    const { patternSvg } = await import('@prompttoppt/validation')
    const pattern = { kind: 'dots', color: '#FFFFFF', opacity: 0.14, size: 40 } as const
    const out = SlideBackground({ slide: { id: 's', background: { type: 'color', value: '#101828', pattern } } as never, W: 1920, H: 1080 }) as unknown as { props: { style: Record<string, string> } }
    expect(out.props.style['background']).toContain(encodeURIComponent(patternSvg(pattern, '#101828', 1920, 1080)))
  })
})

describe('a background picture is its own layer (cover-fitted, optionally softened)', () => {
  it('backgroundCss gives the deck colour behind it; SlideBackground draws the picture, and a blurred one through a Gaussian blur with solid edges (scaled to the screen)', async () => {
    const { backgroundCss, SlideBackground } = await import('./SlideCanvas')
    const slide = { id: 's1', background: { type: 'image', value: 'https://images.example/p.jpg', blur: 8 } } as never
    expect(backgroundCss(slide, { colors: { background: '#101010' } } as never)).toBe('#101010')
    const out = JSON.stringify(SlideBackground({ slide, scale: 0.5 }))
    expect(out).toContain('center / cover no-repeat url(\\"https://images.example/p.jpg\\")')
    expect(out).toMatch(/"stdDeviation":4,"edgeMode":"duplicate"/)
    expect(SlideBackground({ slide: { id: 's2', background: { type: 'color', value: '#fff' } } as never })).toBeNull()
  })
})

describe('radial gradients', () => {
  it('a shape drawn as a box and a slide background take CSS radial-gradient; a shape drawn as SVG gets a radialGradient of r = √½ (the same ellipse)', async () => {
    const { backgroundCss } = await import('./SlideCanvas')
    const n = render({ id: 'g', x: 0, y: 0, width: 300, height: 200, zIndex: 1, opacity: 1, rotation: 0, type: 'shape', shape: 'rect', fill: '#fff', radius: 0, gradient: { from: '#ff0000', to: '#0000ff', angle: 90, kind: 'radial' } }, false)
    expect(n.props.style['background']).toBe('radial-gradient(#ff0000, #0000ff)')
    expect(backgroundCss({ background: { type: 'gradient', value: '#000000', gradient: { from: '#000000', to: '#ffffff', angle: 0, kind: 'radial' } } } as never, theme)).toBe('radial-gradient(#000000, #ffffff)')
    const svg = render({ id: 'h', x: 0, y: 0, width: 300, height: 200, zIndex: 1, opacity: 1, rotation: 0, type: 'shape', shape: 'heart', fill: '#fff', radius: 0, gradient: { from: '#ff0000', to: '#0000ff', angle: 90, kind: 'radial' } }, false)
    expect(JSON.stringify(svg.props.children)).toMatch(/"kind":"radial"/) // (the SVG radialGradient, r = √½, is drawn from it)
  })
})

describe('a shape\'s shadow follows its outline', () => {
  it('the shadow is on an outer frame and the (clipped) triangle sits at 0,0 inside it, so the clip does not cut the shadow away', () => {
    const n = render({ id: 's', x: 100, y: 50, width: 300, height: 200, zIndex: 3, opacity: 1, rotation: 0, type: 'shape', shape: 'triangle', fill: '#fff', radius: 0, shadow: 'strong' }, false)
    expect(n.props.style).toMatchObject({ left: 100, top: 50, filter: 'drop-shadow(0 14px 40px rgba(0,0,0,0.45))' })
    expect(inner(n).props.style).toMatchObject({ left: 0, top: 0 })
    expect(String(inner(n).props.style['clipPath'])).toMatch(/polygon/)
  })
})

describe('text effects on the slide', () => {
  it('a box shadow and outline are on the text; a highlighted word has its marker behind it', () => {
    const t = { id: 't', x: 0, y: 0, width: 600, height: 200, zIndex: 1, opacity: 1, rotation: 0, type: 'text', role: 'body', fontSize: 40, color: 'textPrimary', align: 'left', valign: 'top', textShadow: 'strong', textOutline: { color: '#DC2626', width: 2 }, paragraphs: [{ runs: [{ text: 'a ' }, { text: 'b', highlight: '#FFF176' }] }] }
    const n = render(t, false)
    expect(n.props.style).toMatchObject({ textShadow: '0 6px 18px rgba(0,0,0,0.6)', WebkitTextStroke: '2px #DC2626' })
    const spans = JSON.stringify(n.props.children)
    expect(spans).toContain('"backgroundColor":"#FFF176"')
  })
})

describe('outlines are drawn along the shape (PowerPoint\'s way), solid, dashed or dotted', () => {
  const flat = { id: 'o', x: 0, y: 0, width: 300, height: 200, zIndex: 1, opacity: 1, rotation: 0 }
  const svgKids = (n: Node) => ([] as Node[]).concat(n.props.children as never).flat().filter(Boolean) as unknown as { type: string; props: Record<string, unknown> }[]
  it('a triangle with a border is a real outline (a border on a clipped box lost two of its sides)', () => {
    const n = render({ ...flat, type: 'shape', shape: 'triangle', fill: '#fff', stroke: '#000', strokeWidth: 4 }, false) as unknown as { type: string; props: { children: unknown } }
    expect(n.type).toBe('svg')
    const poly = svgKids(n as never).find((k) => k.type === 'polygon')!
    expect(poly.props['points']).toBe('150,0 300,200 0,200')
    expect(poly.props['strokeDasharray']).toBeUndefined()
  })
  it('dashed = 4 widths on, 3 off; dotted = 1 on, 1 off (PowerPoint\'s proportions)', () => {
    const dash = svgKids(render({ ...flat, type: 'shape', shape: 'rect', fill: '#fff', radius: 0, stroke: '#000', strokeWidth: 4, strokeDash: 'dash' }, false)).find((k) => k.type === 'rect')!
    expect(dash.props['strokeDasharray']).toBe('16 12')
    const line = svgKids(render({ ...flat, height: 6, type: 'shape', shape: 'line', fill: '#f00', radius: 0, strokeDash: 'dot' }, false)).find((k) => k.type === 'line')!
    expect(line.props).toMatchObject({ y1: 3, y2: 3, strokeWidth: 6, strokeDasharray: '6 6' })
  })
  it('a shape with no outline keeps its plain drawing', () => {
    expect((render({ ...flat, type: 'shape', shape: 'rect', fill: '#fff', radius: 0 }, false) as unknown as { type: string }).type).toBe('div')
  })
})

describe('rotated + animated elements keep their position (present mode)', () => {
  for (const [name, el] of Object.entries(ELEMENTS)) {
    if (name === 'chart' || name === 'table') {
      // charts and tables are drawn upright (PowerPoint cannot turn them, so the download would differ); an old deck's angle on one is ignored everywhere
      it(`${name}: drawn upright even with an angle stored, animated or not`, () => {
        expect(render(el, false).props.style['transform']).toBeUndefined()
        const outer = render(el, true)
        expect(outer.props.style).toMatchObject({ left: 1200, top: 100 })
        expect(String(outer.props.style['animation'])).toContain('pt-fade-up')
      })
      continue
    }
    it(`${name}: a positioned wrapper plays the animation, the element sits at 0,0 inside it and keeps its rotation`, () => {
      const outer = render(el, true)
      expect(outer.props.style).toMatchObject({ position: 'absolute', left: 1200, top: 100, width: 600, height: 700, zIndex: 5 })
      expect(String(outer.props.style['animation'])).toContain('pt-fade-up')
      const node = Array.isArray(inner(outer)) ? (inner(outer) as unknown as Node[])[0]! : inner(outer)
      expect(node.props.style).toMatchObject({ left: 0, top: 0 })
      expect(node.props.style['transform']).toBe('rotate(3deg)')
    })

    it(`${name}: in the editor (no animation) it is placed directly, rotated`, () => {
      const node = render(el, false)
      expect(node.props.style).toMatchObject({ left: 1200, top: 100 })
      expect(node.props.style['transform']).toBe('rotate(3deg)')
    })
  }
})
