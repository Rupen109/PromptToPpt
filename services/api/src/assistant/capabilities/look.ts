import { z } from 'zod'
import { DESIGNS, PREMIUM_THEME_IDS, THEMES, isDark, slideTitle } from '@prompttoppt/theme'
import type { SlideContent } from '@prompttoppt/validation'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import type { Capability, Step } from './types.ts'

/**
 * The look of the deck (palette, template, fonts, motion) and of particular slides (background, readability, pictures). All done by code
 * from the values stage 2 extracted; only "a template with this mood" needs a small choosing call on the cheapest model.
 */

export const palette: Capability<z.infer<typeof VALUES.palette>> = {
  family: 'palette', values: VALUES.palette, scope: 'deck', cost: 'action', deckWide: true,
  async run(ctx, _ids, v) {
    if (!v.primary && !v.accent && !v.mode) return { ops: [], notes: ['Tell me which colours you would like (for example "navy and gold").'] }
    const c = ctx.virtual.theme.colors
    return { ops: [{ op: 'set_colors', primary: v.primary ?? c.primary, accent: v.accent ?? c.accent, mode: v.mode ?? (isDark(c.background) ? 'dark' : 'light') }] }
  },
}

const CATALOGUE = [...THEMES.map((t) => ({ id: t.id, name: t.name, category: 'basic', tagline: '', premium: PREMIUM_THEME_IDS.includes(t.id), mode: isDark(t.colors.background) ? 'dark' : 'light' })),
  ...DESIGNS.map((d) => ({ id: d.id, name: d.name, category: d.category, tagline: d.tagline, premium: d.premium, mode: isDark(d.theme.colors.background) ? 'dark' : 'light' }))]
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export const template: Capability<z.infer<typeof VALUES.template>> = {
  family: 'template', values: VALUES.template, scope: 'deck', cost: 'action', deckWide: true,
  async run(ctx, _ids, v) {
    // a named template is found by code; only "something more modern / darker / for a bank" needs choosing
    const named = v.name ? CATALOGUE.find((t) => norm(t.name) === norm(v.name!) || t.id === v.name) ?? CATALOGUE.find((t) => norm(t.name).includes(norm(v.name!))) : undefined
    if (named) return { ops: [{ op: 'set_template', id: named.id }] }
    const allowed = CATALOGUE.filter((t) => (ctx.ent.features.premiumTemplates || !t.premium) && t.id !== ctx.virtual.theme.id && t.id !== (ctx.virtual.theme as { templateId?: string }).templateId)
    const out = await ctx.write({
      card: 'template', route: 'fast', schema: z.object({ templateId: z.string().max(80) }),
      rules: 'Choose the ONE template from input.templates (id|name|category|mode|tagline) whose look best matches input.want and suits the deck\'s topic (input.deck). Return {"templateId":"<id>"}.',
      input: { want: v.mood ?? v.name ?? ctx.instruction, deck: { title: ctx.virtual.title, slides: ctx.state.slides.slice(0, 8).map((r) => r.title) }, templates: allowed.map((t) => `${t.id}|${t.name}|${t.category}|${t.mode}|${t.tagline}`) },
    })
    return allowed.some((t) => t.id === out.templateId) ? { ops: [{ op: 'set_template', id: out.templateId }] } : { ops: [], notes: [`I couldn't find a template like that${v.name ? ` ("${v.name}")` : ''}. Open the Templates panel to browse them.`] }
  },
}

export const fonts: Capability<z.infer<typeof VALUES.fonts>> = {
  family: 'fonts', values: VALUES.fonts, scope: 'deck', cost: 'action', deckWide: true,
  async run(_ctx, _ids, v) { return { ops: [{ op: 'set_fonts', pair: v.pair }] } },
}

export const motion: Capability<z.infer<typeof VALUES.motion>> = {
  family: 'motion', values: VALUES.motion, scope: 'deck', cost: 'action', deckWide: true,
  async run(_ctx, _ids, v) { return { ops: [{ op: 'set_motion', preset: v.preset }] } },
}

export const background: Capability<z.infer<typeof VALUES.background>> = {
  family: 'background', values: VALUES.background, scope: 'slides', cost: 'action',
  async run(ctx, ids, v) {
    const ops: Step['ops'] = [], notes: string[] = [], applied: string[] = []
    const gradients: { slideId: string; from: string; to: string }[] = [], clearPictures: string[] = []
    for (const id of ids) {
      const row = ctx.state.slides.find((r) => r.id === id)
      const n = numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((s) => s.id === id) + 1
      if (row?.locked) { notes.push(`Slide ${n} is locked; skipped.`); continue }
      if (v.removePicture) {
        if (row && row.background !== 'picture') notes.push(`Slide ${n} has no background picture.`)
        else { clearPictures.push(id); applied.push(`Removed the background picture of slide ${n}`) }
      } else if (v.gradient) { gradients.push({ slideId: id, from: v.gradient[0], to: v.gradient[1] }); applied.push(`Gave slide ${n} a gradient background`) }
      else if (v.color) ops.push({ op: 'set_slide_background', slideId: id, color: v.color })
      else notes.push('Tell me which colour the background should be.')
    }
    return { ops, notes, applied, slideOps: { gradients, clearPictures } }
  },
}

export const readability: Capability<z.infer<typeof VALUES.readability>> = {
  family: 'readability', values: VALUES.readability, scope: 'slides', cost: 'action',
  async run(ctx, ids) {
    if (ids.length === ctx.virtual.slides.length && ids.length > 1) return { ops: [{ op: 'fix_readability', slideId: null }] }
    return { ops: ids.map((id) => ({ op: 'fix_readability' as const, slideId: id })) }
  },
}

export const picture: Capability<z.infer<typeof VALUES.picture>> = {
  family: 'picture', values: VALUES.picture, scope: 'slides', cost: 'action',
  async run(ctx, ids, v) {
    const ops: Step['ops'] = [], applied: string[] = [], notes: string[] = [], clearPictures: string[] = []
    for (const id of ids) {
      const s = ctx.virtual.slides.find((x) => x.id === id)
      if (!s) continue
      const n = numberOf(ctx.state, id) || ctx.virtual.slides.indexOf(s) + 1
      if (s.locked) { notes.push(`Slide ${n} is locked; skipped.`); continue }
      if (v.remove) {
        // the picture side of a picture + text slide goes by switching it to the text layout (same words)
        if (s.layoutId === 'split-image-text' && s.content && !s.manual) {
          const c = s.content as Extract<SlideContent, { layout: 'split-image-text' }>
          ops.push({ op: 'restructure_slide', slideId: id, content: { layout: 'title-body', title: c.title, bullets: c.bullets, speakerNotes: c.speakerNotes, sources: c.sources } as SlideContent })
        }
        clearPictures.push(id)
        applied.push(`Removed the pictures from slide ${n}`)
        continue
      }
      const subject = (v.subject ?? slideTitle(s.content)) || ctx.virtual.title
      if (v.source === 'ai') ops.push({ op: 'add_image', slideId: id, placement: v.placement, prompt: `${subject}, ${ctx.state.look.mode === 'dark' ? 'moody, deep tones' : 'bright, clean light'}, in the deck's colours, no text`, alt: subject.slice(0, 140) })
      else ops.push({ op: 'add_photo', slideId: id, placement: v.placement, query: subject.slice(0, 120), alt: subject.slice(0, 140) })
    }
    return { ops, applied, notes, slideOps: { clearPictures } }
  },
}

export const refreshPictures: Capability<z.infer<typeof VALUES.refresh_pictures>> = {
  family: 'refresh_pictures', values: VALUES.refresh_pictures, scope: 'deck', cost: 'action', deckWide: true,
  async run() { return { ops: [{ op: 'refresh_images' }] } },
}
