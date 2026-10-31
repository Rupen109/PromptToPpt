import { DESIGNS, pickDesign, type TemplateDesign } from '@prompttoppt/theme'
import type { PromptAnalysis } from '@prompttoppt/validation'
import { z } from 'zod'
import { gateway } from '../ai/gateway.ts'
import { designPickPrompt } from '../ai/prompts.ts'

const answerSchema = z.object({ designId: z.string().max(80), reason: z.string().max(300).optional() })

/** The templates this person may use for a topic: the topic's category, minus premium ones on the Starter plan. */
export function candidateDesigns(category: string | undefined, premiumAllowed: boolean): TemplateDesign[] {
  const inCategory = DESIGNS.filter((d) => d.category === (category ?? 'strategy') && (premiumAllowed || !d.premium))
  return inCategory.length ? inCategory : DESIGNS.filter((d) => d.category === 'strategy' && (premiumAllowed || !d.premium))
}

/**
 * Picks the template that FITS the topic. The model reads the topic, audience and tone against each template's tagline, mode and fonts and names one;
 * anything wrong (no answer, an id that is not on the list, the call failing) falls back to the stable hash of the request, so a deck is never held up by this step.
 */
export async function chooseDesign(o: { analysis: PromptAnalysis; prompt: string; premiumAllowed: boolean; ctx: { userId: string; jobId: string }; model?: string | undefined; ask?: typeof ask }): Promise<TemplateDesign> {
  const fallback = pickDesign(o.analysis.category, o.premiumAllowed, o.prompt)
  const pool = candidateDesigns(o.analysis.category, o.premiumAllowed)
  if (pool.length <= 1) return pool[0] ?? fallback
  try {
    const id = await (o.ask ?? ask)(o.analysis, o.prompt, pool, o.ctx)
    return pool.find((d) => d.id === id) ?? fallback
  } catch {
    return fallback
  }
}

async function ask(analysis: PromptAnalysis, prompt: string, pool: TemplateDesign[], ctx: { userId: string; jobId: string }): Promise<string> {
  const r = await gateway.run({
    route: 'fast', requestType: 'design_pick',
    ...designPickPrompt({ analysis, userPrompt: prompt, designs: pool.map((d) => ({ id: d.id, name: d.name, tagline: d.tagline, mode: d.look.mode, headingFont: d.theme.fonts.heading, bodyFont: d.theme.fonts.body })) }),
    schema: answerSchema, ctx, temperature: 0.2, maxOutputTokens: 200, thinkingBudget: 0,
  })
  return r.designId
}
