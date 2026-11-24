import { describe, expect, it } from 'vitest'
import { clipPolygonCss, colorMatrixValues, pictureColorMatrix, pictureFilterCss, pictureShadowCss, pictureWindow, pictureZoomCss } from '@prompttoppt/validation'
import { ElementView } from './SlideCanvas'

const theme = { colors: { primary: '#111', onPrimary: '#fff', surface: '#eee', secondary: '#888', textPrimary: '#000', textSecondary: '#555' }, fonts: { heading: 'H', body: 'B' }, radius: 8 } as never
const pic = { id: 'e', type: 'image', x: 100, y: 100, width: 600, height: 400, zIndex: 3, opacity: 1, rotation: 0, src: 'https://example.com/a.jpg', alt: 'a', fit: 'cover', clip: 'none' }
type N = { type?: unknown; props: Record<string, unknown> & { children?: unknown } }
/** every element of the tree ElementView returns (host elements and the Picture component with its props), outermost first */
const walk = (n: unknown, out: N[] = []): N[] => { if (n && typeof n === 'object' && 'props' in (n as object)) { out.push(n as N); walk((n as N).props.children, out) } else if (Array.isArray(n)) n.forEach((x) => walk(x, out)); return out }
const nodes = (o: object) => walk(ElementView({ el: { ...pic, ...o } as never, theme, slide: {} as never, play: false }))
const styles = (o: object) => nodes(o).map((n) => n.props['style'] as Record<string, unknown> | undefined).filter(Boolean) as Record<string, unknown>[]
const lookOf = (o: object) => nodes(o).find((n) => n.props['look'])?.props['look'] as Record<string, unknown>

describe('a picture\'s zoom, light and shadow reach the screen as plain CSS', () => {
  it('nothing set = nothing extra (existing pictures look exactly as before)', () => {
    expect(lookOf({})).toEqual({})
    expect(styles({}).some((st) => 'filter' in st)).toBe(false)
  })
  it('zoom and focus: the picture is scaled around the focus point and positioned at it', () => {
    expect(lookOf({ zoom: 2, focus: { x: 0.25, y: 0.75 } })).toEqual({ objectPosition: '25% 75%', transform: 'scale(2)', transformOrigin: '25% 75%' })
  })
  it('brightness and contrast, then the colour matrix (black and white, saturation, warmth: the exporter bakes the same numbers), as one CSS filter on the picture only', () => {
    expect(String(lookOf({ filter: { brightness: 1.2, contrast: 0.8, grayscale: 1 } })['filter'])).toMatch(/^brightness\(1\.2\) contrast\(0\.8\) url\(#pt-pc-[\w-]*e-[a-z0-9]+\)$/)
    // the SVG filter it points at is drawn next to the picture, with the shared matrix
    expect(nodes({ filter: { brightness: 1, contrast: 1, grayscale: 0, warmth: 1 } }).some((n) => n.type === 'feColorMatrix' && String(n.props['values']).startsWith('1.14 0 0 0 0'))).toBe(true)
    expect(lookOf({ filter: { brightness: 1.2, contrast: 1, grayscale: 0 } })).toEqual({ filter: 'brightness(1.2)' })
  })
  it('blur is a Gaussian blur with extended edges in the picture\'s SVG filter; a border is a stroke along the frame\'s outline, twice its width', () => {
    const n = nodes({ filter: { brightness: 1, contrast: 1, grayscale: 0, blur: 6 }, border: { color: '#00FF00', width: 5 } })
    const g = n.find((x) => x.type === 'feGaussianBlur'); expect(g?.props).toMatchObject({ stdDeviation: 6, edgeMode: 'duplicate' })
    expect(n.find((x) => x.type === 'feColorMatrix')).toBeUndefined() // (no colour change asked: only the blur)
    const r = n.find((x) => x.type === 'rect' && x.props['stroke']); expect(r?.props).toMatchObject({ stroke: '#00FF00', strokeWidth: 10, fill: 'none' })
  })
  it('a shadow sits on an OUTER layer, so it follows the cut shape instead of being clipped away with it', () => {
    const st = styles({ shadow: 'soft', clip: 'hex' })
    const withShadow = st.findIndex((x) => x['filter'] === 'drop-shadow(0 8px 24px rgba(0,0,0,0.25))')
    const withClip = st.findIndex((x) => typeof x['clipPath'] === 'string' && x['overflow'] === 'hidden')
    expect(withShadow).toBeGreaterThanOrEqual(0); expect(withClip).toBeGreaterThan(withShadow) // the layer with the shadow is outside the layer that clips
    expect(st[withShadow]!['overflow']).toBeUndefined()
  })
  it('the helpers behave: defaults produce nothing, a named shadow has its numbers, the cut shapes are the same points the exporter will use', () => {
    expect(pictureFilterCss({ brightness: 1, contrast: 1, grayscale: 0 })).toBeUndefined()
    // the colour is one matrix drawn by an SVG filter (the exporter bakes the same numbers): none when the colours are untouched
    expect(pictureColorMatrix({ brightness: 1, contrast: 1, grayscale: 0, saturation: 1, warmth: 0 })).toBeNull()
    expect(pictureFilterCss({ brightness: 1.2, contrast: 1, grayscale: 1 }, 'c1')).toBe('brightness(1.2) url(#c1)')
    expect(pictureColorMatrix({ grayscale: 1 })![0]).toEqual([0.213, 0.715, 0.072])
    const warm = pictureColorMatrix({ warmth: 1 })!; expect(warm[0]![0]).toBeGreaterThan(1); expect(warm[2]![2]).toBeLessThan(1)
    expect(colorMatrixValues(pictureColorMatrix({ grayscale: 1 })!).split(' ')).toHaveLength(20)
    expect(pictureZoomCss(1, { x: 0.5, y: 0.5 })).toEqual({})
    expect(pictureShadowCss('none')).toBeUndefined(); expect(pictureShadowCss('strong')).toBe('drop-shadow(0 14px 40px rgba(0,0,0,0.45))')
    expect(clipPolygonCss('hex')).toBe('polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)')
  })
  it('pictureWindow: not zoomed + centred cover = the cover crop; zoom 2 around the middle = the middle quarter of the frame; a focus keeps its point', () => {
    const w = pictureWindow({ w: 2000, h: 1000 }, { w: 600, h: 400 }, { fit: 'cover' })
    expect(w.frameWindow).toEqual({ x: 0, y: 0, w: 600, h: 400 }); expect(Math.round(w.drawn.w)).toBe(800); expect(Math.round(w.offset.x)).toBe(-100)
    const z = pictureWindow({ w: 2000, h: 1000 }, { w: 600, h: 400 }, { fit: 'cover', zoom: 2 })
    expect(z.frameWindow).toEqual({ x: 150, y: 100, w: 300, h: 200 })
    const f = pictureWindow({ w: 2000, h: 1000 }, { w: 600, h: 400 }, { fit: 'cover', zoom: 2, focus: { x: 0, y: 0 } })
    expect(f.frameWindow).toEqual({ x: 0, y: 0, w: 300, h: 200 })
  })
})

describe('a cropped picture shows only its cut-out, stretched to its frame', () => {
  it('no crop (or the whole picture) = the picture as before', () => {
    expect(nodes({}).some((n) => n.props['crop'])).toBe(false)
    expect(nodes({ crop: { x: 0, y: 0, w: 1, h: 1 } }).some((n) => n.props['crop'])).toBe(false)
  })
  it('a crop is passed to the picture, and zoom and position are not used with it', () => {
    const n = nodes({ crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, zoom: 2 }).find((x) => x.props['crop'])!
    expect(n.props['crop']).toEqual({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 })
    expect(n.props['look']).toEqual({})
  })
})
