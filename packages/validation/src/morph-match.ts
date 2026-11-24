import { z } from 'zod'

/**
 * Which Morph deck a request should become: one of the designed templates, or a custom deck planned from the topic. Decided by services/api generation/morph-match.ts (a
 * deterministic shortlist, then one small model call to choose between the closest); shown to the person on the create page before anything is built.
 */
export const morphDecisionSchema = z.object({
  /** `template`: build from `templateId`; `custom`: no designed template fits, the deck is planned from the topic */
  mode: z.enum(['template', 'custom']),
  templateId: z.string().max(40).optional(),
  /** 0-1: how sure the match is (a custom deck is "sure" that nothing fits) */
  confidence: z.number().min(0).max(1),
  /** one sentence a person can read: why this template, or why none fits */
  reason: z.string().max(300),
  /** the templates that came closest, best first (the chosen one first when mode is `template`) */
  candidates: z.array(z.object({ id: z.string().max(40), name: z.string().max(60), slides: z.number().int(), /** every length this request can have on this plan, longest first (the deck can be shorter than the template) */ lengths: z.array(z.number().int()).max(30), score: z.number(), reasons: z.array(z.string().max(120)).max(6) })).max(5),
  /** how many templates were set aside, and why */
  excluded: z.object({ plan: z.number().int(), language: z.number().int(), mood: z.number().int(), pictures: z.number().int(), credits: z.number().int(), topic: z.number().int() }),
})
export type MorphDecision = z.infer<typeof morphDecisionSchema>
