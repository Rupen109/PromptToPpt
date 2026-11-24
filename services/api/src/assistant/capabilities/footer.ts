import type { z } from 'zod'
import { themeStyleSchema } from '@prompttoppt/validation'
import { VALUES } from '../understand.ts'
import type { Capability, Step } from './types.ts'

const WORD = { number: 'slide numbers', brand: 'the deck title and slide numbers', none: 'no footer' } as const

/**
 * Slide numbers (and the deck's title) at the bottom of every slide, or none, and where the company logo sits along the bottom margin. The footer is the deck's own footer style, drawn the same way on
 * screen, in PDF/PNG exports and in the PowerPoint file; it is never stored on a slide, so it stays right after reordering. The logo is drawn by the layout engine, so its place is a theme setting too.
 * Applied as a theme change and checked on the deck like any other design change.
 */
export const footer: Capability<z.infer<typeof VALUES.footer>> = {
  family: 'footer', values: VALUES.footer, scope: 'deck', cost: 'action', deckWide: true,
  async run(ctx, _ids, v): Promise<Step> {
    const theme = ctx.virtual.theme
    const nowMode = theme.style?.footer ?? 'none'
    const mode = v.mode ?? nowMode
    const notes: string[] = [], refused: string[] = [], already: string[] = [], applied: string[] = []
    let next = structuredClone(theme)
    if (v.mode !== undefined) {
      if (nowMode === v.mode) already.push(`The deck already shows ${WORD[nowMode]}.`)
      else { next = { ...next, style: themeStyleSchema.parse({ ...(theme.style ?? {}), footer: v.mode }) }; applied.push(`Set the footer to ${WORD[v.mode]}`); if (v.mode !== 'none') notes.push('It is not shown on the first (title) slide.') }
    }
    if (v.text !== undefined) {
      // the words must be the person's own (a model never writes what goes on every slide)
      const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const text = v.text.trim()
      const had = theme.style?.footerText ?? ''
      if (text && !norm(ctx.instruction).includes(norm(text))) refused.push('I did not set the footer text: the words must be yours, written in your message. Tell me exactly what it should say.')
      else if (text === had) already.push(text ? `The footer already says "${text}".` : 'There is no footer text to take away.')
      else {
        const style = themeStyleSchema.parse({ ...(next.style ?? {}), ...(text ? { footerText: text, ...((next.style?.footer ?? 'none') !== 'brand' ? { footer: 'brand' } : {}) } : { footerText: undefined }) })
        if (!text) delete (style as { footerText?: string }).footerText
        next = { ...next, style }
        applied.push(text ? `Set the footer text to "${text}"` : 'Took the footer text away')
        if (text && (theme.style?.footer ?? 'none') !== 'brand') notes.push('The footer now shows your text on the left and the slide number on the right (it is not shown on the first slide).')
      }
    }
    if (v.logo !== undefined) {
      const logo = theme.brand?.logo
      const clash = v.logo === 'right' && mode !== 'none' ? 'the slide numbers are at the bottom right' : v.logo === 'left' && mode === 'brand' ? 'the deck title is at the bottom left' : null
      if (!logo) refused.push('The deck has no company logo yet. Add one with "use my brand" (from your saved brand or your website), then ask again.')
      else if ((logo.align ?? 'left') === v.logo) already.push(`The logo is already at the ${v.logo === 'center' ? 'bottom centre' : v.logo}.`)
      else if (clash) refused.push(`I left the logo where it is: ${clash}, and they would sit on top of each other. Put the logo in the centre, or change the footer first.`)
      else { next = { ...next, brand: { ...(next.brand ?? {}), logo: { ...logo, align: v.logo } } }; applied.push(`Moved the logo to the ${v.logo === 'center' ? 'bottom centre' : v.logo}`) }
    }
    return applied.length ? { ops: [], applied, notes, refused, already, slideOps: { brandThemes: [next] } } : { ops: [], notes, refused, already }
  },
}
