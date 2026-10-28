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

describe('rotated + animated elements keep their position (present mode)', () => {
  for (const [name, el] of Object.entries(ELEMENTS)) {
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
