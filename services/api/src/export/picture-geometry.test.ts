import { describe, expect, it } from 'vitest'
import { pictureRadius, pptRoundAdj } from '@prompttoppt/validation'
import { roundInSlide } from './picture-geometry.ts'

const pic = (name: string) => `<p:pic><p:nvPicPr><p:cNvPr id="4" name="${name}" descr="a"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`

describe('rounded picture corners in PowerPoint (its own rounded rectangle, the photo untouched)', () => {
  it('the named picture becomes a roundRect with its adj; others stay rectangles', () => {
    const out = roundInSlide(pic('sd:a') + pic('sd:b'), new Map([['sd:a', { adj: 12500, from: 0 }]]))
    expect(out).toContain('<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 12500"/></a:avLst></a:prstGeom>')
    expect(out.match(/prst="rect"/g)).toHaveLength(1)
  })
  it('a baked picture and its colour wash share a name (the motion step may suffix #2): from 1 rounds only the wash', () => {
    const out = roundInSlide(pic('sd:a') + pic('sd:a#2'), new Map([['sd:a', { adj: 9000, from: 1 }]]))
    const shapes = out.match(/prst="(rect|roundRect)"/g)
    expect(shapes).toEqual(['prst="rect"', 'prst="roundRect"'])
  })
  it('the radius rule is the screen\'s: own radius, else the theme\'s; cut shapes have none; adj = radius ÷ shorter side (at most a half)', () => {
    expect(pictureRadius({ clip: 'none' }, 16)).toBe(16)
    expect(pictureRadius({ clip: 'none', radius: 0 }, 16)).toBe(0)
    expect(pictureRadius({ clip: 'hex', radius: 30 }, 16)).toBe(0)
    expect(pptRoundAdj(20, 800, 400)).toBe(5000)
    expect(pptRoundAdj(900, 800, 400)).toBe(50000)
  })
})
