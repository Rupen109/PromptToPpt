import { z } from 'zod'
import type { MorphTemplate } from '@prompttoppt/theme/morph-templates'
import { chromeSlots, textSlots } from '@prompttoppt/theme/morph-templates'
import { scrubNumbers } from './morph-plan.ts'

/**
 * A deck built from a Morph template. The template already decides everything that moves (where every object is on every scene, how big, which object is the same one on the next
 * scene) and brings its own pictures; the model writes ONLY the words of the text boxes. This file works out which boxes there are and what may ship in them, so none of it depends on
 * the model behaving: a box never gets more words than it was drawn for, a figure the user never gave is removed, and a detail nobody supplied (address, phone, handle) is left out
 * instead of showing the template's placeholder. Pure functions.
 */
export interface TemplateSlot {
  id: string
  /** the template's own words in this box: a guide to its role and length, never to be copied */
  sample: string
  /** the most characters the box was drawn for */
  maxChars: number
  /** the box holds a detail only the user can supply (an address, a phone number, an e-mail, a handle, a credit): left empty unless the request gives it */
  detail: boolean
  /** the box holds only a figure (a percentage, a count, a year): written only from figures the request gave, otherwise left out */
  numeric: boolean
  /** a band of one short phrase that the template repeats across the slide: one or two words, never a sentence */
  ticker: boolean
}
export interface TemplateSceneSlots { scene: string; title: string; purpose: string; slots: TemplateSlot[] }

/** Words of a template that stand for a detail it cannot know. */
const DETAIL = /\b(your|add a|write a|the name of)\b|@\w|\bexample\b|\.com\b|\bhere\b|\b\d{3}[ -]?\d{3,4}\b|credit or a source|lorem/i
/** A box that holds only a figure: "40%", "2026", "$1.2M", "01". */
const NUMERIC = /^(?=.*\d)[\s\d.,%+\-–×x$€£₹#/]+[kKmMbB]?\+?$/
/** A box that holds only punctuation (the big quotation mark) is decoration, not words. */
const hasWords = (t: string) => /[\p{L}\p{N}]/u.test(t)

/** Every scene of the template with the text boxes that carry the deck's own words. */
export function templateSlots(tpl: MorphTemplate): TemplateSceneSlots[] {
  return tpl.scenes.map((sc) => ({
    scene: sc.id, title: sc.title, purpose: sc.purpose,
    slots: textSlots(tpl, sc.id).filter((s) => hasWords(s.text)).map((s) => ({ id: s.id, sample: s.text.replace(/\s+/g, ' ').trim().slice(0, 160), maxChars: s.room, detail: DETAIL.test(s.text), ticker: s.ticker, numeric: NUMERIC.test(s.text.trim()) })),
  }))
}

/** The branding every scene repeats (a wordmark, a date line, a section label): written once for the whole deck. */
export interface TemplateChrome { id: string; sample: string; maxChars: number }
export const templateChrome = (tpl: MorphTemplate): TemplateChrome[] => chromeSlots(tpl).map((c) => ({ id: c.id, sample: c.text.replace(/\s+/g, ' ').trim().slice(0, 80), maxChars: c.maxChars }))

export const templateFillSchema = z.object({
  title: z.string().max(200),
  /** the words of the branding boxes, once for every scene (an id left out or "" means the box is not shown) */
  chrome: z.record(z.string().max(80), z.string().max(200)).default({}),
  scenes: z.array(z.object({ scene: z.string().max(40), notes: z.string().max(1500).optional(), fields: z.record(z.string().max(80), z.string().max(900)).default({}) })).max(60),
})
export type TemplateFill = z.infer<typeof templateFillSchema>

/** Cuts at the last word that fits (never in the middle of one), and drops a trailing comma or dash. */
export function fitText(text: string, max: number): string {
  const t = text.replace(/[ \t]+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  const space = cut.lastIndexOf(' ')
  // one long word with nothing before it to keep: the first word whole (a word is never cut in the middle)
  const clipped = sentence > max * 0.4 ? cut.slice(0, sentence + 1) : space > 0 ? cut.slice(0, space) : t.split(' ')[0]!
  // a cut must not end on a word that needs the next one ("Crust &", "Fresh bread and")
  let out = clipped.replace(/[\s,;:–—-]+$/, '')
  for (;;) { const next = out.replace(/\s+(?:&|and|or|of|the|a|an|for|to|in|on|at|with|by|from|as|that|your|our|its)$/i, '').replace(/[\s,;:–—-]+$/, ''); if (next === out || next === '') break; out = next }
  return out
}

export interface FillRules { allowedNumbers: ReadonlySet<string>; /** the request or its sources gave figures */ figuresAllowed: boolean }

/** The boxes whose words are too long for them, as `scene/box` keys with the limit: the model is asked once to shorten exactly these. */
export function tooLong(fill: TemplateFill, scenes: TemplateSceneSlots[]): { scene: string; id: string; text: string; maxChars: number }[] {
  const out: { scene: string; id: string; text: string; maxChars: number }[] = []
  for (const sc of scenes) {
    const f = fill.scenes.find((x) => x.scene === sc.scene)?.fields ?? {}
    for (const s of sc.slots) { const t = f[s.id]; if (typeof t === 'string' && t.trim().length > s.maxChars) out.push({ scene: sc.scene, id: s.id, text: t, maxChars: s.maxChars }) }
  }
  return out
}

/**
 * What ships in every box of every scene: the model's words, fitted. A box the model left out keeps NOTHING of the template's sample words (they are about another topic): a
 * detail box becomes empty (and the object is left out), any other box is left to the caller, which reports it. Returns the `fields` of each scene.
 */
export function sanitizeFill(fill: TemplateFill, scenes: TemplateSceneSlots[], rules: FillRules): { fields: Record<string, Record<string, string>>; missing: { scene: string; id: string }[] } {
  const fields: Record<string, Record<string, string>> = {}
  const missing: { scene: string; id: string }[] = []
  for (const sc of scenes) {
    const given = fill.scenes.find((x) => x.scene === sc.scene)?.fields ?? {}
    const out: Record<string, string> = {}
    for (const s of sc.slots) {
      const raw = typeof given[s.id] === 'string' ? given[s.id]!.trim() : ''
      // a figure box with no figure to show is left out: a word in it would be wrapped in the middle, and an invented figure is never shown
      if (s.numeric && (!rules.figuresAllowed || raw === '' || scrubNumbers(raw, rules.allowedNumbers) !== raw)) { out[s.id] = ''; continue }
      if (raw === '') {
        if (s.detail) out[s.id] = '' // nothing to put here: the box is left out
        else missing.push({ scene: sc.scene, id: s.id })
        continue
      }
      const text = fitText(scrubNumbers(raw, rules.allowedNumbers), s.maxChars)
      if (text === '' && !s.detail) missing.push({ scene: sc.scene, id: s.id })
      else out[s.id] = text
    }
    fields[sc.scene] = out
  }
  return { fields, missing }
}

/** A box the model never filled and no repair filled: a short, neutral line from the deck's own title or topic, so no sample sentence about another subject ever ships. */
export const stopgap = (slot: TemplateSlot, title: string): string => fitText(slot.maxChars >= title.length ? title : title.split(' ').slice(0, 3).join(' '), slot.maxChars)

/** The branding boxes of the deck: the model's words fitted, "" when it gave none (the template's own wordmark and date line are never shown for someone else's deck). */
export function sanitizeChrome(fill: TemplateFill, chrome: TemplateChrome[], rules: FillRules): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of chrome) {
    const raw = typeof fill.chrome[c.id] === 'string' ? fill.chrome[c.id]!.trim() : ''
    out[c.id] = raw === '' ? '' : fitText(scrubNumbers(raw, rules.allowedNumbers), c.maxChars)
  }
  return out
}
