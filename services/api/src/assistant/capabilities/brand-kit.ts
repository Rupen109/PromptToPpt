import type { z } from 'zod'
import { VALUES } from '../understand.ts'
import { COLOUR_NAMES, sameColourFamily } from '../resolve.ts'
import { DESIGNS, designById, isDark } from '@prompttoppt/theme'
import type { Capability, RunCtx, Step } from './types.ts'

/** a saved brand kit as the assistant sees it */
export type KitInfo = { id: string; name: string; primary: string | null; accent: string | null; headingFont: string | null; bodyFont: string | null; isDefault: boolean }

/** the person's kit by the name they say ("my Acme kit"): exact, else the only one containing it; never a guess */
export function kitByName(kits: readonly KitInfo[], name: string): KitInfo | { why: string } {
  const want = name.trim().toLowerCase().replace(/\b(brand|kit|my|the)\b/g, '').trim()
  const exact = kits.filter((k) => k.name.toLowerCase() === name.trim().toLowerCase() || k.name.toLowerCase() === want)
  const part = exact.length ? exact : kits.filter((k) => want && k.name.toLowerCase().includes(want))
  if (part.length === 1) return part[0]!
  return { why: kits.length ? `I could not tell which brand kit "${name}" is. Your kits: ${kits.map((k) => `"${k.name}"`).join(', ')}` : 'you have no saved brand kits yet' }
}

const HEX = /^#[0-9a-f]{6}$/i
/** a colour the person said: a code they typed, or a colour name ("navy") */
function saidColour(ctx: Pick<RunCtx, 'instruction'>, c: string | undefined): string | undefined | { why: string } {
  if (c === undefined) return undefined
  const k = c.trim().toLowerCase()
  if (COLOUR_NAMES[k]) return COLOUR_NAMES[k]!.toUpperCase()
  if (HEX.test(k) && ctx.instruction.toLowerCase().includes(k)) return k.toUpperCase()
  // the model turned their word into a code ("navy" → #000080): the ONE colour word in their message of that family is what they said; never a code nobody typed
  if (HEX.test(k)) {
    const words = ctx.instruction.toLowerCase().match(/[a-z]+/g) ?? []
    const said = [...new Set(words.filter((w) => COLOUR_NAMES[w] && sameColourFamily(COLOUR_NAMES[w]!, k)).map((w) => COLOUR_NAMES[w]!))]
    if (said.length === 1) return said[0]!.toUpperCase()
  }
  return { why: `the colour "${c}" is not in your message (say a colour name like navy, or a code like #1E3A8A)` }
}

/**
 * The person's SAVED brand kits: create one, change one, delete one, make one the default. This changes their account, not the deck, so it is kept apart from "use my brand", and it is ALWAYS
 * shown and confirmed first (owner decision 2026-11-21: "strictly with confirm steps"). The name, the colours and the fonts are the person's own (said in the message, or "from this deck");
 * the plan's brand-kit rules (Gold / Premium, how many kits) are checked by the same code as the Brand tab.
 */
export const brandKit: Capability<z.infer<typeof VALUES.brand_kit>> = {
  family: 'brand_kit', values: VALUES.brand_kit, scope: 'deck', cost: 'free',
  async run(ctx, _ids, v): Promise<Step> {
    if (!ctx.kits) return { ops: [], refused: ['I cannot change brand kits right now.'] }
    const kits = ctx.brandKits ?? []
    if (v.action === 'theme') return makeTheme(ctx, kits, v)
    const target = v.action === 'create' ? null : kitByName(kits, v.kit ?? v.name ?? '')
    if (target && 'why' in target) return { ops: [], refused: [`I changed nothing: ${target.why}.`] }
    const name = v.action === 'create' || v.newName ? (v.action === 'create' ? v.name : v.newName)?.trim() : undefined
    if ((v.action === 'create' || v.newName) && (!name || !ctx.instruction.toLowerCase().includes(name.toLowerCase()))) return { ops: [], refused: ['I changed nothing: the kit name must be your own words, written in your message.'] }
    const theme = ctx.virtual.theme
    const primary = v.fromDeck ? theme.colors.primary.toUpperCase() : saidColour(ctx, v.primary)
    const accent = v.fromDeck ? theme.colors.accent.toUpperCase() : saidColour(ctx, v.accent ?? v.secondary)
    for (const c of [primary, accent]) if (c && typeof c === 'object') return { ops: [], refused: [`I changed nothing: ${c.why}.`] }
    const fonts = v.fromDeck ? { headingFont: theme.fonts.heading, bodyFont: theme.fonts.body } : { ...(v.headingFont ? { headingFont: v.headingFont } : {}), ...(v.bodyFont ? { bodyFont: v.bodyFont } : {}) }
    const p = primary as string | undefined, a = accent as string | undefined
    const what = [p ? `main colour ${p}` : '', a ? `second colour ${a}${v.secondary && !v.accent ? ' (your "secondary" colour: a kit has a main and a second colour)' : ''}` : '', fonts.headingFont ? `heading font ${fonts.headingFont}` : '', fonts.bodyFont ? `body font ${fonts.bodyFont}` : '', name && v.action !== 'create' ? `the name "${name}"` : ''].filter(Boolean).join(', ')
    const kitName = target && !('why' in target) ? target.name : name!
    const plan = v.action === 'create' ? `Create a brand kit "${name}"${what ? ` with ${what}` : ''}` : v.action === 'delete' ? `Delete your brand kit "${kitName}" (decks that used it keep their look)` : v.action === 'set_default' ? `Make "${kitName}" your default brand kit` : `Change your brand kit "${kitName}": ${what || 'nothing named'}`
    if (v.action === 'update' && !what) return { ops: [], refused: ['I changed nothing: say what to change in the kit (a colour, a font or its name).'] }
    // ALWAYS asked first: the confirm carries this very task back, and only then is the kit changed
    if (ctx.confirm?.kind !== 'proceed') return { ops: [], ask: { text: `${plan}. This changes your saved brand kits, not this deck. Go ahead?`, options: [{ label: v.action === 'delete' ? 'Yes, delete it' : 'Yes, save it', reply: 'Yes, go ahead', confirm: { kind: 'proceed', tasks: [{ family: 'brand_kit', targets: [], values: v as Record<string, unknown> }] } }, { label: 'No, leave my kits', reply: 'No, leave my kits as they are' }] } }
    const t = target as KitInfo | null
    const done = v.action === 'create' ? await ctx.kits.create({ name: name!, ...(p ? { primary: p } : {}), ...(a ? { accent: a } : {}), ...fonts })
      : v.action === 'delete' ? await ctx.kits.remove(t!.id)
      : v.action === 'set_default' ? await ctx.kits.update(t!.id, { isDefault: true })
      : await ctx.kits.update(t!.id, { ...(name ? { name } : {}), ...(p ? { primary: p } : {}), ...(a ? { accent: a } : {}), ...fonts })
    if (!done.ok) return { ops: [], refused: [`I changed nothing: ${done.why}`] }
    return { ops: [], outside: v.action === 'create' ? `Created your brand kit "${name}"` : v.action === 'delete' ? `Deleted your brand kit "${kitName}"` : v.action === 'set_default' ? `Made "${kitName}" your default brand kit` : `Changed your brand kit "${kitName}" (${what})` }
  },
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\b(design|template|theme)\b/g, '').trim()

/**
 * "Create a theme from my Acme kit" (brand/themes.ts): a design in light or dark with the kit's colours, fonts and logo, SAVED to their themes (the deck does not change). The kit is the one
 * they name (or their default kit); the design is the one they name, or this deck's; light or dark as they say, else the design's own (this deck's mode for this deck's design).
 * Like every kit change it is shown and confirmed first, and made by the same code and plan rules as the Brand tab.
 */
async function makeTheme(ctx: RunCtx, kits: readonly KitInfo[], v: z.infer<typeof VALUES.brand_kit>): Promise<Step> {
  const ref = v.kit ?? v.name
  const kit = ref ? kitByName(kits, ref) : (kits.find((k) => k.isDefault) ?? (kits.length === 1 ? kits[0]! : { why: kits.length ? 'say which brand kit the theme is made from' : 'you have no saved brand kits yet' }))
  if ('why' in kit) return { ops: [], refused: [`I made no theme: ${kit.why}.`] }
  const own = designById((ctx.virtual.theme as { templateId?: string }).templateId ?? '')
  const said = v.design && !/^(this|current|this deck'?s?|the current one)$/i.test(v.design.trim()) ? norm(v.design) : ''
  const found = said ? DESIGNS.filter((d) => norm(d.name) === said).concat(DESIGNS.filter((d) => norm(d.name) !== said && norm(d.name).includes(said))) : own ? [own] : []
  const design = found[0]
  if (!design) return { ops: [], refused: [said ? `I made no theme: there is no template called "${v.design}". Open Style → Templates to see their names.` : 'I made no theme: this deck is not in one of our templates, so say which template the theme should use.'] }
  const mode = v.mode ?? (!said && own ? (isDark(ctx.virtual.theme.colors.background) ? 'dark' : 'light') : design.look.mode)
  const name = v.newName?.trim() && ctx.instruction.toLowerCase().includes(v.newName.trim().toLowerCase()) ? v.newName.trim() : undefined
  const label = name ?? `${kit.name} ${mode}`
  if (ctx.confirm?.kind !== 'proceed') return { ops: [], ask: { text: `Make a theme "${label}" from your brand kit "${kit.name}": the ${design.name} template, ${mode}, in the kit's colours, fonts and logo. It is saved to your themes; this deck does not change. Go ahead?`, options: [{ label: 'Yes, save the theme', reply: 'Yes, go ahead', confirm: { kind: 'proceed', tasks: [{ family: 'brand_kit', targets: [], values: v as Record<string, unknown> }] } }, { label: 'No, leave it', reply: 'No, do not make a theme' }] } }
  const done = await ctx.kits!.createTheme({ kitId: kit.id, designId: design.id, mode, ...(name ? { name } : {}) })
  if (!done.ok) return { ops: [], refused: [`I made no theme: ${done.why}`] }
  return { ops: [], outside: `Saved the theme "${label}" (the ${design.name} template, ${mode}, in your "${kit.name}" kit). Ask me to use it, or apply it from Style → Brand` }
}
