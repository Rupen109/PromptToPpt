import { describe, expect, it } from 'vitest'
import { getTheme, slideTheme } from '@prompttoppt/theme'
import { ElementView, transitionStyle } from './SlideCanvas'

/** a slide with its OWN brand (theme slide-theme.ts) is drawn in that brand's fonts and colours; the deck's other slides are not */
const deck = getTheme('cobalt')
const brand = { name: 'Acme', primary: '#E4572E', accent: '#17BEBB', headingFont: 'Playfair Display', bodyFont: 'Inter' }
type N = { type?: unknown; props: Record<string, unknown> & { children?: unknown } }
const walk = (n: unknown, out: N[] = []): N[] => { if (n && typeof n === 'object' && 'props' in (n as object)) { out.push(n as N); walk((n as N).props.children, out) } else if (Array.isArray(n)) n.forEach((x) => walk(x, out)); return out }
const title = { id: 't', type: 'text', role: 'title', x: 100, y: 100, width: 1200, height: 160, zIndex: 1, opacity: 1, rotation: 0, fontSize: 64, color: 'primary', align: 'left', paragraphs: [{ runs: [{ text: 'Hello' }] }] }
const styleOf = (slide: object) => walk(ElementView({ el: title as never, theme: deck, slide: { id: 's', elements: [], ...slide } as never, play: false })).map((n) => n.props['style'] as Record<string, unknown> | undefined).find((st) => st && 'fontFamily' in st)!

describe('a brand on one slide', () => {
  it('the slide is drawn in the brand\'s fonts and colours; a slide without one in the deck\'s', () => {
    const own = styleOf({ brand })
    expect(String(own['fontFamily'])).toContain('Playfair Display')
    expect(own['color']).toBe(slideTheme(deck, { brand }).colors.primary)
    expect(own['color']).not.toBe(deck.colors.primary)
    const plain = styleOf({})
    expect(String(plain['fontFamily'])).toContain(deck.fonts.heading)
    expect(plain['color']).toBe(deck.colors.primary)
  })
  it('the slide\'s own look sits on top of its brand; colours are worked out once (never brand on brand)', () => {
    const t = slideTheme(deck, { brand, themeOverrides: { primary: '#123456' } })
    expect(t.colors.primary).toBe('#123456')
    expect(t.fonts.heading).toBe('Playfair Display')
    expect(slideTheme(deck, null)).toBe(deck)
  })
})

describe('a slide transition plays with the chosen speed curve', () => {
  it('none chosen = the soft ease-out every transition had; a chosen easing is the CSS curve the effects use', () => {
    const t = (o: object) => String(transitionStyle({ id: 's', elements: [], transition: { type: 'fade', duration: 700, ...o } } as never, undefined).animation)
    expect(t({})).toBe('pt-t-fade 700ms cubic-bezier(.2,.7,.2,1) both')
    expect(t({ easing: 'linear' })).toBe('pt-t-fade 700ms linear both')
    expect(t({ easing: 'back-out' })).toMatch(/^pt-t-fade 700ms cubic-bezier\(/)
  })
})
