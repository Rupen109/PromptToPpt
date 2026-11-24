import type { RunCtx } from './types.ts'

/**
 * Colours named the way people name them: a deck colour ("primary", "accent", "the text colour") or THEIR saved brand colour ("our brand colour"). One rule for text, shapes and backgrounds.
 * A deck colour stays a TOKEN where the object can keep one (it then follows the deck's colours when they change); a background needs the colour itself. A brand colour is read from the
 * person's saved brand kit (Gold and Premium); without one, or on a plan without brand kits, the reason is said and nothing is guessed.
 */
export const DECK_WORDS = ['primary', 'secondary', 'accent', 'text'] as const
export const BRAND_WORDS = ['brand_primary', 'brand_accent'] as const

export function colourWord(ctx: Pick<RunCtx, 'brand' | 'ent' | 'virtual'>, c: string, as: 'token' | 'hex'): { ok: true; value: string } | { ok: false; why: string } {
  if (/^#[0-9a-f]{6}$/i.test(c) || c === 'deck') return { ok: true, value: c }
  if (c === 'brand_primary' || c === 'brand_accent') {
    if (!(ctx.ent.features as { brandKit?: boolean }).brandKit) return { ok: false, why: 'brand colours come from a saved brand kit, which is on the Gold and Premium plans' }
    const hex = c === 'brand_primary' ? ctx.brand?.primary : ctx.brand?.accent
    if (!hex) return { ok: false, why: ctx.brand ? `your saved brand has no ${c === 'brand_primary' ? 'main' : 'second'} colour yet (add it in the Brand tab)` : 'you have no saved brand yet (create one in the Brand tab)' }
    return { ok: true, value: hex.toUpperCase() }
  }
  const key = c === 'text' ? 'textPrimary' : c
  const hex = (ctx.virtual.theme.colors as Record<string, string>)[key]
  if (!hex) return { ok: false, why: `"${c}" is not a colour I know` }
  return { ok: true, value: as === 'token' ? key : hex.toUpperCase() }
}
