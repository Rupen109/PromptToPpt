import { z } from 'zod'
import { lockedSlides } from './preflight.ts'
import { DESIGNS, PREMIUM_THEME_IDS, THEMES, applyBrandToTheme, isDark, slideTitle, type BrandInput, type BrandPick } from '@prompttoppt/theme'
import { describeSlides, parseSlideRange, type SlideBrand, type SlideContent } from '@prompttoppt/validation'
import { numberOf } from '../state.ts'
import { VALUES } from '../understand.ts'
import { colourSceneNote, isSceneSlide, templatePictureScenes } from './template-notes.ts'
import { colourWord } from './colour-words.ts'
import { kitByName } from './brand-kit.ts'
import { allowedPlacements } from '../../ai/ai-assist.ts'
import type { Capability, RunCtx, Step } from './types.ts'

/**
 * The look of the deck (palette, template, fonts, motion) and of particular slides (background, readability, pictures). All done by code
 * from the values stage 2 extracted; only "a template with this mood" needs a small choosing call on the cheapest model.
 */

export const palette: Capability<z.infer<typeof VALUES.palette>> = {
  family: 'palette', values: VALUES.palette, scope: 'deck', cost: 'action', deckWide: true,
  async run(ctx, _ids, v) {
    if (!v.primary && !v.accent && !v.mode) return { ops: [], refused: ['Tell me which colours you would like (for example "navy and gold").'] }
    const c = ctx.virtual.theme.colors
    const now = isDark(c.background) ? 'dark' : 'light'
    // asking for the mode the deck is already in changes nothing: said so, not "done"
    if (v.mode && !v.primary && !v.accent && v.mode === now) return { ops: [], already: [`The presentation is already in ${now} mode.`] }
    // every slide is a scene of an animated template, whose artwork keeps its own colours: the change would show on NOTHING the person sees now. Asked first, never a "Done" with no visible change
    const scenes = ctx.virtual.slides.filter(isSceneSlide).length
    if (scenes > 0 && scenes === ctx.virtual.slides.length && ctx.confirm?.kind !== 'proceed') {
      return { ops: [], ask: { text: `All ${scenes} slides use an animated template, whose artwork keeps the template's own colours, so new deck colours would not change any slide you have now: only slides you add later. Change the deck colours anyway?`, options: [{ label: 'Yes, change them', reply: 'Yes, change the deck colours', confirm: { kind: 'proceed', tasks: [{ family: 'palette', targets: [], values: v as Record<string, unknown> }] } }, { label: 'No, leave it', reply: 'No, leave the colours as they are' }] } }
    }
    const sceneNote = colourSceneNote(ctx.virtual)
    return { ops: [{ op: 'set_colors', primary: v.primary ?? c.primary, accent: v.accent ?? c.accent, mode: v.mode ?? (isDark(c.background) ? 'dark' : 'light') }], ...(sceneNote ? { notes: [sceneNote] } : {}) }
  },
}

const CATALOGUE = [...THEMES.map((t) => ({ id: t.id, name: t.name, category: 'basic', tagline: '', premium: PREMIUM_THEME_IDS.includes(t.id), mode: isDark(t.colors.background) ? 'dark' : 'light' })),
  ...DESIGNS.map((d) => ({ id: d.id, name: d.name, category: d.category, tagline: d.tagline, premium: d.premium, mode: isDark(d.theme.colors.background) ? 'dark' : 'light' }))]
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** a theme of theirs by the name they say: exact, else the only one containing it */
function themeByName<T extends { name: string }>(list: readonly T[], said: string): T | undefined {
  const want = norm(said).replace(/\b(my|our|the|theme)\b/g, '').trim()
  if (!want) return undefined
  const exact = list.filter((t) => norm(t.name) === want)
  const part = exact.length ? exact : list.filter((t) => norm(t.name).includes(want))
  return part.length === 1 ? part[0] : undefined
}

export const template: Capability<z.infer<typeof VALUES.template>> = {
  family: 'template', values: VALUES.template, scope: 'deck', cost: 'action', deckWide: true,
  async run(ctx, _ids, v) {
    // one of the person's OWN themes (made from a brand kit) by its name, before our templates: the theme worked out from the kit as it is now (brand/themes.ts)
    const mine = v.name ? themeByName(ctx.brandThemeList ?? [], v.name) : undefined
    if (mine) return { ops: [], applied: [`Applied your theme "${mine.name}"`], slideOps: { brandThemes: [mine.theme] } }
    // a named template is found by code; only "something more modern / darker / for a bank" needs choosing
    const named = v.name ? CATALOGUE.find((t) => norm(t.name) === norm(v.name!) || t.id === v.name) ?? CATALOGUE.find((t) => norm(t.name).includes(norm(v.name!))) : undefined
    if (named) return { ops: [{ op: 'set_template', id: named.id }] }
    const allowed = CATALOGUE.filter((t) => (ctx.ent.features.premiumTemplates || !t.premium) && t.id !== ctx.virtual.theme.id && t.id !== (ctx.virtual.theme as { templateId?: string }).templateId)
    const out = await ctx.write({
      card: 'template', route: 'fast', schema: z.object({ templateId: z.string().max(80) }),
      rules: 'Choose the ONE template from input.templates (id|name|category|mode|tagline) whose look best matches input.want and suits the deck\'s topic (input.deck). Return {"templateId":"<id>"}.',
      input: { want: v.mood ?? v.name ?? ctx.instruction, deck: { title: ctx.virtual.title, slides: ctx.state.slides.slice(0, 8).map((r) => r.title) }, templates: allowed.map((t) => `${t.id}|${t.name}|${t.category}|${t.mode}|${t.tagline}`) },
    })
    return allowed.some((t) => t.id === out.templateId) ? { ops: [{ op: 'set_template', id: out.templateId }] } : { ops: [], refused: [`I couldn't find a template like that${v.name ? ` ("${v.name}")` : ''}. Open the Templates panel to browse them.`] }
  },
}

export const fonts: Capability<z.infer<typeof VALUES.fonts>> = {
  family: 'fonts', values: VALUES.fonts, scope: 'deck', cost: 'action', deckWide: true,
  async run(_ctx, _ids, v) { return { ops: [{ op: 'set_fonts', pair: v.pair }] } },
}

export const motion: Capability<z.infer<typeof VALUES.motion>> = {
  family: 'motion', values: VALUES.motion, scope: 'deck', cost: 'action', deckWide: true,
  async run(ctx, _ids, v) {
    // turning off the animation of the WHOLE deck is shown first and confirmed (the slides' own animations are lost; Ctrl+Z puts them back)
    if (v.preset === 'none' && ctx.confirm?.kind !== 'clear_animations' && ctx.virtual.slides.length >= 3) return { ops: [], ask: { text: `This turns off the animation on all ${ctx.virtual.slides.length} slides, including any you set up yourself (Ctrl+Z puts them back right after). Turn them all off?`, options: [{ label: 'Yes, turn them off', reply: 'Yes, turn off all the animations', confirm: { kind: 'clear_animations' } }, { label: 'No, keep them', reply: 'No, keep my animations' }] } }
    return { ops: [{ op: 'set_motion', preset: v.preset }] }
  },
}

export const background: Capability<z.infer<typeof VALUES.background>> = {
  family: 'background', values: VALUES.background, scope: 'slides', cost: 'action',
  preflight: lockedSlides,
  async run(ctx, ids, v) {
    const ops: Step['ops'] = [], notes: string[] = [], refused: string[] = [], applied: string[] = []
    const gradients: { slideId: string; from: string; to: string; kind?: 'radial' | undefined }[] = [], clearPictures: string[] = [], blurs: { slideId: string; blur: number }[] = [], patterns: { slideId: string; kind: 'dots' | 'grid' | 'lines' | 'diagonal' | null }[] = []
    // a colour named by word ("our brand colour", "the accent colour"): the colour itself, from the deck or the saved brand, or the reason it cannot be used
    if (v.from !== undefined) return copyBackgroundFrom(ctx, ids, v.from)
    if (v.color && v.color !== 'deck' && !/^#/.test(v.color)) { const c = colourWord(ctx, v.color, 'hex'); if (!c.ok) return { ops: [], refused: [`I did not change the background: ${c.why}.`] }; v = { ...v, color: c.value } }
    for (const id of ids) {
      const row = ctx.state.slides.find((r) => r.id === id)
      const n = numberOf(ctx.state, id) || ctx.virtual.slides.findIndex((s) => s.id === id) + 1
      if (row?.locked) { refused.push(`Slide ${n} is locked; skipped.`); continue }
      if (v.pattern) {
        // a pattern over the slide's colour (a gradient or picture slide takes the deck's background colour first, as the editor's Pattern buttons do)
        patterns.push({ slideId: id, kind: v.pattern === 'none' ? null : v.pattern })
        // (a slide-ops change must say what it did, or the route takes the answer for "nothing changed"; the checked claim words it in the end)
        applied.push(v.pattern === 'none' ? `Took the pattern off the background of slide ${n}` : `Gave slide ${n} a ${v.pattern} background pattern`)
        continue
      }
      if (v.blur) {
        // the background PICTURE softened (the editor's Blur picture slider: soft 4, strong 10); a slide without one is said, never skipped quietly
        if (row && row.background !== 'picture') { refused.push(`Slide ${n} has no background picture to ${v.blur === 'none' ? 'sharpen' : 'blur'}.`); continue }
        blurs.push({ slideId: id, blur: v.blur === 'none' ? 0 : v.blur === 'soft' ? 4 : 10 })
        applied.push(v.blur === 'none' ? `Made the background picture of slide ${n} sharp again` : `Softened the background picture of slide ${n}`)
        continue
      }
      if (v.removePicture) {
        if (row && row.background !== 'picture') refused.push(`Slide ${n} has no background picture.`)
        else { clearPictures.push(id); applied.push(`Removed the background picture of slide ${n}`) }
      } else if (v.gradient) { gradients.push({ slideId: id, from: v.gradient[0], to: v.gradient[1], ...(v.radial ? { kind: 'radial' as const } : {}) }); applied.push(`Gave slide ${n} a ${v.radial ? 'radial ' : ''}gradient background`) }
      else if (v.color) ops.push({ op: 'set_slide_background', slideId: id, color: v.color })
      else refused.push('Tell me which colour the background should be.')
    }
    return { ops, notes, refused, applied, slideOps: { gradients, clearPictures, blurs, patterns } }
  },
}

/** slide N's background, as it is (colour, pattern, gradient with its angle, picture with its blur, or the deck's own), on the other slides: ONE rule with the editor's Background menu */
function copyBackgroundFrom(ctx: RunCtx, ids: string[], from: number): Step {
  const src = ctx.virtual.slides[from - 1]
  if (!src) return { ops: [], refused: [`There is no slide ${from} — this deck has ${ctx.virtual.slides.length} slides.`] }
  const refused: string[] = [], to: string[] = []
  for (const id of ids) {
    if (id === src.id) continue
    if (ctx.state.slides.find((r) => r.id === id)?.locked) { refused.push(`Slide ${numberOf(ctx.state, id)} is locked; skipped.`); continue }
    to.push(id)
  }
  if (!to.length) return { ops: [], refused: refused.length ? refused : [`Name the slides that should get the background of slide ${from}.`] }
  return { ops: [], refused, applied: [`Gave ${to.length === 1 ? `slide ${numberOf(ctx.state, to[0]!)}` : `${to.length} slides`} the background of slide ${from}`], slideOps: { backgroundCopies: [{ fromSlideId: src.id, slideIds: to }] } }
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
  preflight: lockedSlides,
  async run(ctx, ids, v) {
    // one of the person's OWN uploads only when their own words say so ("my photo", "our logo", "the one I uploaded"); "replace this image with a better one" is a new free photo, whatever the model wrote
    if (v.replace !== undefined && !/\b(my|mine|our|ours|uploaded|upload|uploads)\b/i.test(ctx.instruction)) v = { ...v, replace: undefined }
    // taking the pictures off THREE or more slides is shown first and confirmed (Ctrl+Z puts them back right after)
    if (v.remove && ids.length >= 3 && ctx.confirm?.kind !== 'clear_pictures') {
      const withPic = ids.filter((id) => ctx.virtual.slides.find((x) => x.id === id)?.elements.some((e) => e.type === 'image' && !e.decorative && !e.brand && !!e.src && !e.locked)).length
      if (withPic >= 3) return { ops: [], ask: { text: `This takes the pictures off ${withPic} slides. Your words stay as they are, and Ctrl+Z puts the pictures back right after. Remove them?`, options: [{ label: 'Yes, remove them', reply: 'Yes, remove the pictures', confirm: { kind: 'clear_pictures' } }, { label: 'No, keep them', reply: 'No, keep my pictures' }] } }
    }
    const ops: Step['ops'] = [], applied: string[] = [], notes: string[] = [], refused: string[] = [], clearPictures: string[] = [], uploads: { slideId: string; placement: 'background' | 'beside' | 'floating'; url: string; alt: string }[] = [], cutouts: { slideId: string; elementId: string; url: string; line: string }[] = [], swaps: { slideId: string; elementId: string; url: string; alt: string }[] = []
    for (const id of ids) {
      const s = ctx.virtual.slides.find((x) => x.id === id)
      if (!s) continue
      const n = numberOf(ctx.state, id) || ctx.virtual.slides.indexOf(s) + 1
      if (s.locked) { refused.push(`Slide ${n} is locked; skipped.`); continue }
      if (v.replace !== undefined) {
        // one of the person's OWN uploaded pictures where a picture is: the selected picture, else the only one, else we ask which (never a guess)
        const pics = s.elements.filter((e) => e.type === 'image' && !e.decorative && !e.brand && !!e.src)
        const sel = pics.filter((e) => ctx.selection.elementIds.includes(e.id))
        const target = sel.length ? sel : pics.length === 1 ? pics : []
        if (pics.length > 0 && target.length === 0) { refused.push(`Slide ${n} has ${pics.length} pictures: select the one to replace on the slide, then ask again.`); continue }
        const want = v.replace.trim().toLowerCase()
        const words = want.split(/\s+/).filter((w) => w.length > 1 && w !== 'latest' && w !== 'last' && w !== 'uploaded' && w !== 'upload' && w !== 'my' && w !== 'photo' && w !== 'picture' && w !== 'image')
        // no usable name from the model ("latest"): the person's OWN words decide if they name exactly one upload ("my coffee photo"); only then the newest
        const said = new Set(norm(ctx.instruction).split(' '))
        const named = ctx.uploads.filter((u) => norm(u.name).split(' ').some((w) => w.length > 2 && said.has(w)))
        const pick = !words.length ? (named.length === 1 ? named[0] : ctx.uploads[0]) : ctx.uploads.find((u) => words.every((w) => u.name.toLowerCase().includes(w))) ?? ctx.uploads.find((u) => words.some((w) => u.name.toLowerCase().includes(w)))
        if (!pick) { refused.push(ctx.uploads.length ? `I couldn't find an upload called "${v.replace}". Your latest uploads: ${ctx.uploads.slice(0, 5).map((u) => u.name).join(', ')}.` : "You have no uploaded pictures yet. Add one with Media > Upload, then ask again."); continue }
        if (pics.length === 0) {
          // no picture on the slide yet: the upload is ADDED (as a photo would be), where the slide can take it
          const can = allowedPlacements(s)
          const placement = can.includes(v.placement) ? v.placement : 'floating'
          if (placement !== v.placement) notes.push(`Slide ${n} can't take a picture beside the text, so ${pick.name} floats on the slide instead.`)
          uploads.push({ slideId: id, placement, url: pick.url, alt: pick.name })
          applied.push(`Put ${pick.name} on slide ${n}`)
          continue
        }
        for (const e of target) swaps.push({ slideId: id, elementId: e.id, url: pick.url, alt: pick.name })
        applied.push(`Replaced the picture on slide ${n} with ${pick.name}`)
        // a picture of an animated template is ONE picture wherever it is used (the Morph moves it): it changes on every slide that shows it, and that is said
        const scenes = target.length === 1 ? templatePictureScenes(ctx.virtual, id, target[0]!.id) : null
        if (scenes && scenes.total > 1) notes.push(`That picture is part of the template's animation, so it was replaced on all ${scenes.total - scenes.locked} slides that show it${scenes.locked ? ` (${scenes.locked} locked ${scenes.locked === 1 ? 'slide keeps' : 'slides keep'} the old one)` : ''}.`)
        continue
      }
      if (v.cutout) {
        // cutting the background out of a picture KEEPS the picture (never taken for removing it): the main pictures of the slide, the biggest first
        const main = s.elements.filter((e) => e.type === 'image' && !e.decorative && !e.locked && (e.opacity ?? 1) >= 0.5 && !!e.src).sort((a, b) => b.width * b.height - a.width * a.height)
        // "this image": the picture the person selected, only that one; nothing selected: the main pictures of the slide
        const chosen = main.filter((e) => ctx.selection.elementIds.includes(e.id))
        const pics = (chosen.length ? chosen : main).slice(0, 2)
        if (pics.length === 0) { refused.push(`Slide ${n} has no picture to remove the background of.`); continue }
        for (const e of pics) cutouts.push({ slideId: id, elementId: e.id, url: (e as { src: string }).src, line: `Removed the background of ${pics.length > 1 ? 'a picture' : 'the picture'} on slide ${n}` })
        continue
      }
      if (v.remove && (s.layoutId === 'morph-template' || s.layoutId === 'morph')) {
        // a Morph slide's pictures are objects of its template: taking them off here would break the Morph, and nothing would change on the slide, so it is never reported as done
        refused.push(`The pictures of slide ${n} belong to its Morph design, so I left them. To change one, use Media > Template pictures; to delete one, select it and press Delete.`)
        continue
      }
      if (v.remove) {
        // the picture side of a picture + text slide goes by switching it to the text layout (same words)
        if (s.layoutId === 'split-image-text' && s.content && !s.manual) {
          const c = s.content as Extract<SlideContent, { layout: 'split-image-text' }>
          ops.push({ op: 'restructure_slide', slideId: id, content: { layout: 'title-body', title: c.title, bullets: c.bullets, speakerNotes: c.speakerNotes, sources: c.sources } as SlideContent })
          if (s.background?.type === 'image') clearPictures.push(id) // (a background picture as well: that one is taken off too)
          continue
        }
        clearPictures.push(id)
        applied.push(`Removed the pictures from slide ${n}`)
        continue
      }
      const subject = (v.subject ?? slideTitle(s.content)) || ctx.virtual.title
      if (v.source === 'ai') ops.push({ op: 'add_image', slideId: id, placement: v.placement, prompt: `${subject}, ${ctx.state.look.mode === 'dark' ? 'moody, deep tones' : 'bright, clean light'}, in the deck's colours, no text`, alt: subject.slice(0, 140) })
      else {
        const selected = s.elements.find((e) => e.type === 'image' && !e.decorative && ctx.selection.elementIds.includes(e.id))
        ops.push(selected ? { op: 'add_photo', slideId: id, placement: 'replace', elementId: selected.id, query: subject.slice(0, 120), alt: subject.slice(0, 140) } : { op: 'add_photo', slideId: id, placement: v.placement, query: subject.slice(0, 120), alt: subject.slice(0, 140) })
      }
    }
    return { ops, applied, notes, refused, slideOps: { clearPictures, cutouts: cutouts.slice(0, 3), swaps: swaps.slice(0, 6), uploads: uploads.slice(0, 6) } }
  },
}

export const refreshPictures: Capability<z.infer<typeof VALUES.refresh_pictures>> = {
  family: 'refresh_pictures', values: VALUES.refresh_pictures, scope: 'deck', cost: 'action', deckWide: true,
  async run(ctx) {
    if (ctx.confirm?.kind === 'refresh_pictures') return { ops: [{ op: 'refresh_images' }] }
    // replacing the pictures of EVERY slide is shown first and confirmed (your words stay)
    return { ops: [], ask: { text: 'This replaces the pictures on every slide with new ones that match each slide. Your words stay exactly as they are, and the pictures you have now are lost (Ctrl+Z puts them back right after). Replace all the pictures?', options: [{ label: 'Yes, replace them', reply: 'Yes, replace all the pictures', confirm: { kind: 'refresh_pictures' } }, { label: 'No, keep them', reply: 'No, keep my pictures' }] } }
  },
}

export const brand: Capability<z.infer<typeof VALUES.brand>> = {
  // not deck-wide: a brand can go on some slides only, so "only this slide" mode is answered inside (that slide, or refused for others)
  // scope 'none': slides named as the task's targets ("slides 2 to 4") or in values.slides both mean those slides; no slides named = the whole deck
  family: 'brand', values: VALUES.brand, scope: 'none', cost: 'action',
  async run(ctx, ids, v): Promise<Step> {
    const total = ctx.virtual.slides.length
    if (!v.slides && ids.length && ids.length < total) v = { ...v, slides: ids.map((id) => ctx.virtual.slides.findIndex((x) => x.id === id) + 1).filter((n) => n > 0).join(', ') }
    if (ctx.state.onlySlideId && !v.slides) v = { ...v, slides: String(numberOf(ctx.state, ctx.state.onlySlideId)) } // (only this slide is open to change: the brand goes on it)
    if (v.remove) return takeSlideBrandOff(ctx, v)
    if (v.site) return siteBrand(ctx, v)
    if (v.logoFile) return logoFileBrand(ctx, v)
    let b = ctx.brand
    if (v.kit) {
      const k = kitByName(ctx.brandKits ?? [], v.kit)
      if ('why' in k) return { ops: [], refused: [`I changed nothing: ${k.why}.`] }
      b = { name: k.name, primary: k.primary, accent: k.accent, headingFont: k.headingFont, bodyFont: k.bodyFont, logo: k.isDefault ? ctx.brand?.logo ?? null : null }
    }
    if (!b) return { ops: [], refused: ['You have no saved brand yet. Create one in the Brand tab (Style), then ask again.'] }
    const name = b.name ? ` (${b.name})` : ''
    return brandStep(ctx, v, { name: b.name, primary: b.primary, accent: b.accent, headingFont: b.headingFont ?? undefined, bodyFont: b.bodyFont ?? undefined, logo: b.logo }, { colors: v.colors, fonts: v.fonts, logo: v.logo }, { applied: `Applied your brand${name}`, already: `already uses your brand${name}` })
  },
}

/** the slides a brand request names ("1-5"), read by the shared reader (slide-range.ts); locked slides are left out and said; in "only this slide" mode, nothing else */
function brandSlides(ctx: RunCtx, v: z.infer<typeof VALUES.brand>): { ids: string[]; numbers: number[]; refused: string[] } | { why: string } {
  const total = ctx.virtual.slides.length
  const r = parseSlideRange(v.slides ?? '', total)
  if (!r.ok) return { why: `I changed nothing: ${r.why}` }
  const only = ctx.state.onlySlideId
  if (only && r.numbers.some((n) => ctx.virtual.slides[n - 1]!.id !== only)) return { why: 'Only the selected slide can be changed here — switch to "Whole deck" to brand other slides.' }
  const locked = new Set(lockedSlides(ctx, r.numbers.map((n) => ctx.virtual.slides[n - 1]!.id)).blocked.map((b) => b.slideId))
  const open = r.numbers.filter((n) => !locked.has(ctx.virtual.slides[n - 1]!.id))
  const shut = r.numbers.filter((n) => locked.has(ctx.virtual.slides[n - 1]!.id))
  if (!open.length) return { why: `I changed nothing: ${describeSlides(shut, total)} ${shut.length === 1 ? 'is' : 'are'} locked.` }
  return { ids: open.map((n) => ctx.virtual.slides[n - 1]!.id), numbers: open, refused: shut.length ? [`${describeSlides(shut, total)} ${shut.length === 1 ? 'is' : 'are'} locked, so I left ${shut.length === 1 ? 'it' : 'them'} as ${shut.length === 1 ? 'it was' : 'they were'}.`] : [] }
}

/**
 * The one ending of every brand request (a saved brand or kit, a website, an uploaded logo): the brand on the whole deck (a new deck theme), or, when slides are named,
 * on those slides only (slide.brand, packages/theme slide-theme.ts; the editor's applyBrandToSlides draws them). Only the parts that were found and asked go on.
 */
function brandStep(ctx: RunCtx, v: z.infer<typeof VALUES.brand>, b: BrandInput, pick: BrandPick, words: { applied: string; already: string }, notes: string[] = [], refused: string[] = []): Step {
  if (!v.slides) {
    const theme = applyBrandToTheme(structuredClone(ctx.virtual.theme), b, pick)
    if (JSON.stringify(theme) === JSON.stringify(ctx.virtual.theme)) return { ops: [], notes, refused, already: [`The deck ${words.already}.`] }
    return { ops: [], notes, refused, applied: [words.applied], slideOps: { brandThemes: [theme] } }
  }
  const at = brandSlides(ctx, v)
  if ('why' in at) return { ops: [], notes, refused: [...refused, at.why] }
  const own: SlideBrand = {
    ...(b.name ? { name: b.name } : {}),
    ...(pick.colors && b.primary && b.accent ? { primary: b.primary.toUpperCase(), accent: b.accent.toUpperCase() } : {}),
    ...(pick.fonts && b.headingFont && b.bodyFont ? { headingFont: b.headingFont, bodyFont: b.bodyFont } : {}),
    ...(pick.logo && b.logo ? { logo: { url: b.logo.url, aspect: b.logo.aspect } } : {}),
  }
  if (!own.primary && !own.headingFont && !own.logo) return { ops: [], notes, refused: [...refused, 'I found nothing of the brand to put on those slides, so nothing was changed.'] }
  const where = describeSlides(at.numbers, ctx.virtual.slides.length)
  const same = (x: unknown) => JSON.stringify(x ?? null) === JSON.stringify(own)
  if (at.ids.every((id) => same(ctx.virtual.slides.find((x) => x.id === id)!.brand))) return { ops: [], notes, refused: [...refused, ...at.refused], already: [`${where[0]!.toUpperCase()}${where.slice(1)} ${at.numbers.length === 1 ? 'already carries' : 'already carry'} that brand.`] }
  return { ops: [], notes, refused: [...refused, ...at.refused], applied: [`${words.applied} to ${where} only`], slideOps: { slideBrands: [{ slideIds: at.ids, brand: own }] } }
}

/** "take the brand off slide 3": those slides go back to the deck's own look; with no slides named, every slide that has a brand of its own */
function takeSlideBrandOff(ctx: RunCtx, v: z.infer<typeof VALUES.brand>): Step {
  const total = ctx.virtual.slides.length
  const own = ctx.virtual.slides.flatMap((x, i) => (x.brand ? [i + 1] : []))
  const at = v.slides ? brandSlides(ctx, v) : own.length ? brandSlides(ctx, { ...v, slides: own.join(',') }) : { why: 'No slide has a brand of its own, so nothing needed changing.' }
  if ('why' in at) return { ops: [], refused: [at.why] }
  const has = at.numbers.filter((n) => ctx.virtual.slides[n - 1]!.brand)
  if (!has.length) return { ops: [], refused: at.refused, already: [`${describeSlides(at.numbers, total)} already ${at.numbers.length === 1 ? 'is' : 'are'} in the deck's own look.`] }
  return { ops: [], refused: at.refused, applied: [`Put ${describeSlides(has, total)} back in the deck's own look`], slideOps: { slideBrands: [{ slideIds: has.map((n) => ctx.virtual.slides[n - 1]!.id), brand: null }] } }
}

/**
 * "Use my uploaded logo": the logo is one of the person's OWN uploaded pictures (named, or the newest), its shape and brand colours are read from its pixels in code, and ONLY what was found is applied:
 * the logo always, the colours when the picture has any (a black and white logo has none: the deck's colours stay, and that is said).
 */
async function logoFileBrand(ctx: RunCtx, v: z.infer<typeof VALUES.brand>): Promise<Step> {
  if (!ctx.logoBrand) return { ops: [], refused: ['I cannot read uploaded logos right now, so nothing was changed.'] }
  if (!ctx.uploads.length) return { ops: [], refused: ['You have no uploaded pictures yet. Add your logo with Media > Upload, then ask again.'] }
  const want = (v.logoFile ?? '').trim().toLowerCase()
  const words = want.split(/\s+/).filter((w) => w.length > 1 && !['latest', 'last', 'uploaded', 'upload', 'my', 'logo', 'file', 'picture', 'image'].includes(w))
  const said = new Set(norm(ctx.instruction).split(' '))
  const named = ctx.uploads.filter((u) => norm(u.name).split(' ').some((w) => w.length > 2 && said.has(w) && w !== 'logo'))
  const pick = !words.length ? (named.length === 1 ? named[0] : ctx.uploads[0]) : ctx.uploads.find((u) => words.every((w) => u.name.toLowerCase().includes(w))) ?? ctx.uploads.find((u) => words.some((w) => u.name.toLowerCase().includes(w)))
  if (!pick) return { ops: [], refused: [`I couldn't find an upload called "${v.logoFile}". Your latest uploads: ${ctx.uploads.slice(0, 5).map((u) => u.name).join(', ')}.`] }
  const r = await ctx.logoBrand(pick.url)
  if (!r.ok) return { ops: [], refused: [r.say] }
  const cur = ctx.virtual.theme
  const notes: string[] = [], refused: string[] = []
  const colours = v.colors && !!r.primary
  if (v.colors && !r.primary) refused.push(`${pick.name} has no brand colours I can use (it is black, white or grey), so the colours stay as they are.`)
  if (colours && !r.accent) refused.push(`${pick.name} has one brand colour only, so the second colour stays as it is.`)
  return brandStep(ctx, v, { name: cur.brand?.name ?? null, primary: colours ? r.primary : null, accent: colours ? (r.accent ?? cur.colors.accent) : cur.colors.accent, headingFont: cur.fonts.heading, bodyFont: cur.fonts.body, logo: { url: pick.url, aspect: r.aspect } }, { colors: colours, fonts: false, logo: v.logo }, { applied: `Used ${pick.name} as the company logo${colours ? ' and took the colours from it' : ''}`, already: `already uses ${pick.name}` }, notes, refused)
}

/**
 * "Match the brand of acme.com": the site is read now (its own page and stylesheets, no model), and ONLY what was found is applied: colours when the page has brand colours, fonts when it names fonts
 * (a font we do not have is replaced by the closest one, and that is said), the logo when a usable PNG or JPEG was found. Everything it could not find is listed, so a request is never "done" on a guess.
 */
/** whether the address the model passed is written in the person's message (scheme, "www." and a trailing slash do not matter) */
export function addressIsInMessage(site: string, message: string): boolean {
  const host = (t: string) => t.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0] ?? ''
  const h = host(site)
  if (!h || !h.includes('.')) return false
  const text = message.toLowerCase().replace(/https?:\/\/(www\.)?/g, '').replace(/\bwww\./g, '')
  return new RegExp(`(^|[^a-z0-9-])${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9-])`).test(text) // a whole address, not the end of another one ("notacme.com")
}

async function siteBrand(ctx: RunCtx, v: z.infer<typeof VALUES.brand>): Promise<Step> {
  if (!ctx.siteBrand) return { ops: [], refused: ['I cannot read websites right now, so nothing was changed.'] }
  // the address must be the person's OWN: a model that fills in a plausible domain for "my company website" is never acted on
  if (!addressIsInMessage(v.site!, ctx.instruction)) return { ops: [], refused: ['I could not find a website address in your message, and I do not guess one, so I read nothing. Tell me the address (like example.com) and I will match its brand.'] }
  const r = await ctx.siteBrand(v.site!)
  if (!r.ok) return { ops: [], refused: [r.say] }
  const s = r.brand
  const notes: string[] = [], refused: string[] = []
  const hasColours = !!s.primary, hasFonts = !!(s.heading || s.body)
  if (v.colors && !hasColours) refused.push(`I could not find brand colours on ${s.host}, so the colours stay as they are.`)
  if (v.colors && hasColours && s.accentDerived) notes.push(`${s.host} has only one brand colour, so I made the second colour from it.`)
  if (v.fonts && !hasFonts) refused.push(`I could not find the fonts of ${s.host}, so the fonts stay as they are.`)
  for (const f of [s.heading, s.body]) if (v.fonts && f && !f.exact) notes.push(`${s.host} uses "${f.original}", which I do not have, so I used the closest one, "${f.family}".`)
  if (v.logo && !s.logo) refused.push(`I did not find a logo on ${s.host} that I can use (a PNG or JPEG), so the logo is unchanged.`)
  if (s.confidence === 'low') notes.push(`${s.host} shows few brand signals on its page (many sites draw themselves with scripts), so please check the result.`)
  // the applier takes a pair of colours and a pair of fonts: whatever the site did not give keeps the deck's own value, and that is said
  const cur = ctx.virtual.theme
  if (v.colors && hasColours && !s.accent) refused.push(`${s.host} gave one brand colour only, so the second colour stays as it is.`)
  if (v.fonts && hasFonts && (!s.heading || !s.body)) refused.push(`${s.host} names only a ${s.heading ? 'heading' : 'body'} font, so the ${s.heading ? 'body' : 'heading'} font stays as it is.`)
  return brandStep(ctx, v, { name: s.name, primary: s.primary, accent: s.accent ?? cur.colors.accent, headingFont: s.heading?.family ?? cur.fonts.heading, bodyFont: s.body?.family ?? cur.fonts.body, logo: s.logo }, { colors: v.colors && hasColours, fonts: v.fonts && hasFonts, logo: v.logo && !!s.logo }, { applied: `Matched the brand of ${s.host}`, already: `already matches what I found on ${s.host}` }, notes, refused)
}
