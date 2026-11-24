import type { z } from 'zod'
import { describeSlides, parseSlideRange } from '@prompttoppt/validation'
import { VALUES } from '../understand.ts'
import type { Capability, Step, UiAction } from './types.ts'

const FORMAT = { pptx: 'PowerPoint (.pptx)', pdf: 'PDF', png: 'pictures (PNG)', jpg: 'pictures (JPG)', html: 'a web page (HTML)' } as const

/**
 * Present, export, share: WORKFLOW, never an edit. The assistant does not present, export, publish a link or invite anyone by itself: it prepares the action (the format, the first slide,
 * the email the person typed) and the chat shows ONE button for it; the person's click is the confirmation (owner decision 2026-11-21). Plan and role are checked here, before the button exists,
 * and again by the editor and the API when it is clicked. Nothing changes in the deck, so nothing is charged.
 */
export const workflow: Capability<z.infer<typeof VALUES.workflow>> = {
  family: 'workflow', values: VALUES.workflow, scope: 'deck', cost: 'free',
  async run(ctx, _ids, v): Promise<Step> {
    const features = ctx.ent.features as { exportFormats?: string[]; livePreview?: boolean; collaboration?: boolean; shareLinks?: boolean }
    const owner = ctx.isOwner !== false
    if (v.action === 'present') {
      if (features.livePreview === false) return { ops: [], refused: ['Presenting from the editor is not on your plan.'] }
      const n = v.fromSlide === 'current' ? ctx.state.slides.find((r) => r.id === ctx.state.focus.current)?.n ?? 1 : v.fromSlide ?? 1
      if (n < 1 || n > ctx.virtual.slides.length) return { ops: [], refused: [`The deck has ${ctx.virtual.slides.length} slides, so there is no slide ${n} to start from.`] }
      const ui: UiAction = { kind: 'present', fromSlide: n }
      return { ops: [], ui, notes: [`Press the button to start presenting from slide ${n}.`] }
    }
    if (!owner) return { ops: [], refused: [`Only the owner of this presentation can ${v.action === 'export' ? 'export' : 'share'} it.`] }
    if (v.action === 'export') {
      const format = v.format ?? 'pptx'
      if (!(features.exportFormats ?? []).includes(format)) return { ops: [], refused: [`Exporting as ${FORMAT[format]} is not on your plan${(features.exportFormats ?? []).length ? `: you can export as ${(features.exportFormats ?? []).map((f) => FORMAT[f as keyof typeof FORMAT] ?? f).join(', ')}` : ''}.`] }
      // a part of the deck ("export slide 3 as PNG", "slides 1-3 as a PDF", "this slide"): read by the same reader as the Export menu; a slide that is not there is said, never dropped
      const total = ctx.virtual.slides.length
      const said = v.slides?.trim().toLowerCase()
      const cur = ctx.state.slides.find((r) => r.id === ctx.state.focus.current)?.n ?? 1
      const range = !said || /^(all|every|whole|the whole deck|all slides)$/.test(said) ? null : parseSlideRange(/^(current|this|this slide)$/.test(said) ? String(cur) : said, total)
      if (range && !range.ok) return { ops: [], refused: [`I did not prepare the download: ${range.why}`] }
      const numbers = range?.ok && range.numbers.length < total ? range.numbers : null
      const what = numbers ? describeSlides(numbers, total) : 'the deck'
      return { ops: [], ui: { kind: 'export', format, ...(numbers ? { slides: numbers, slideIds: numbers.map((n) => ctx.virtual.slides[n - 1]!.id) } : {}) }, notes: [`Press the button to download ${what} as ${FORMAT[format]}.`] }
    }
    // share / invite: the email must be the person's own words (never guessed); the Share dialog opens with it filled in, and nothing is sent until they press Invite there
    const email = v.email?.trim().toLowerCase()
    if (email && !ctx.instruction.toLowerCase().includes(email)) return { ops: [], refused: ['I did not fill in that email: it must be written in your message. Tell me the address and I will put it in the Share dialog.'] }
    return { ops: [], ui: { kind: 'share', ...(email ? { email } : {}), ...(v.viewOnly ? { role: 'viewer' as const } : {}) }, notes: [email ? `Press the button to open Share with ${email} filled in${v.viewOnly ? ' to view and comment only' : ''}; nothing is sent until you press Invite there.` : 'Press the button to open Share: you choose there who gets access, or create a view-only link.'] }
  },
}
