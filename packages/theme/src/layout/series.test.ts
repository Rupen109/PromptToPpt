import { describe, expect, it } from 'vitest'
import { hexToHsl, mix } from '../color'
import { getTheme } from '../themes'
import { recolor } from '../palettes'
import { composeSlide } from './index'
import { huesClash } from './content'
import type { SlideContent } from '@prompttoppt/validation'

const roadmap = { layout: 'roadmap', title: 'Reforms', phases: ['One', 'Two', 'Three'].map((l) => ({ label: l, heading: `${l} heading`, bullets: ['a', 'b'] })), speakerNotes: '', sources: [] } as unknown as SlideContent
const chevrons = (primary: string, accent: string) => {
  const theme = recolor(getTheme('cobalt'), { primary, accent })
  const fills = (composeSlide(roadmap, theme, '16:9').elements.filter((e) => e.type === 'shape' && e.shape === 'chevron') as { fill: string }[]).map((c) => c.fill)
  return { fills, colors: theme.colors }
}
const hueOf = (hex: string) => hexToHsl(hex)[0]
const gap = (a: number, b: number) => { const d = Math.abs(a - b); return Math.min(d, 360 - d) }

describe('progression colours (roadmap)', () => {
  it('detects primary/accent pairs whose hues are too far apart to blend', () => {
    expect(huesClash('#FF9933', '#138808')).toBe(true) // saffron + green
    expect(huesClash('#F97316', '#2563EB')).toBe(true) // orange + blue
    expect(huesClash('#2563EB', '#4F46E5')).toBe(false) // blue + indigo
    expect(huesClash('#2563EB', '#888888')).toBe(false) // grey accent has no hue
  })

  it('clashing palettes stay in the primary hue — no olive middle step', () => {
    const { fills, colors } = chevrons('#FF9933', '#138808')
    expect(fills).toHaveLength(3)
    for (const f of fills) expect(gap(hueOf(f), hueOf(colors.primary)), `${f} drifted away from the primary hue`).toBeLessThan(18)
    expect(new Set(fills).size).toBe(3) // still a visible progression
  })

  it('harmonious palettes keep the primary → accent blend', () => {
    const { fills, colors } = chevrons('#2563EB', '#4F46E5')
    expect(huesClash(colors.primary, colors.accent)).toBe(false)
    expect(fills[1]!.toLowerCase()).toBe(mix(colors.primary, colors.accent, 0.5).toLowerCase())
  })
})
