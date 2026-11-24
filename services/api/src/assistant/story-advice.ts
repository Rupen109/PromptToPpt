import { z } from 'zod'
import type { Presentation } from '@prompttoppt/validation'

/**
 * "Improve the story" and "what is missing?": ADVICE, never an edit. The model reads only the slide titles and the first line of each slide and gives its opinion; the reply is built by code,
 * says in its first line that it is an opinion (not a check of facts), and the deck is not changed. The model is told to name the KIND of information that is missing, never to supply it.
 */
export const storyAdviceSchema = z.object({
  flow: z.string().min(5).max(300),
  strengths: z.array(z.string().min(3).max(200)).max(3).default([]),
  gaps: z.array(z.string().min(3).max(200)).max(5).default([]),
  suggestions: z.array(z.string().min(3).max(200)).max(4).default([]),
})
export type StoryAdvice = z.infer<typeof storyAdviceSchema>

export const STORY_RULES = `You are giving an OPINION on the story of a presentation, from its outline only (<input>.outline: slide number, title, first line). Say how the slides flow from opening to close ("flow", one or two sentences), what already works ("strengths", at most 3), what a reader of THIS kind of presentation would expect that is missing ("gaps", at most 5) and what to change ("suggestions", at most 4, each pointing at a slide number where it can). Name the KIND of information that is missing (for example "who the customers are", "the cost", "what happens next"): NEVER supply the information itself, never invent facts or numbers. Plain words, no markdown. If the outline is too short to judge, say so in "flow" and leave the lists empty.`

/** the outline the model sees: facts from the deck, nothing else */
export function storyOutline(doc: Presentation): { n: number; title: string; first: string }[] {
  return doc.slides.map((s, i) => {
    const texts = s.elements.filter((e): e is Extract<typeof e, { type: 'text' }> => e.type === 'text').map((e) => ({ role: e.role, text: e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ').trim() })).filter((t) => t.text)
    const title = texts.find((t) => t.role === 'title')?.text ?? texts[0]?.text ?? ''
    const first = texts.find((t) => t.role !== 'title' && t.text !== title)?.text ?? ''
    return { n: i + 1, title: title.slice(0, 120), first: first.slice(0, 140) }
  })
}

/** the reply: built by code, from the model's lists */
export function composeStory(a: StoryAdvice, slides: number): string {
  const list = (title: string, items: string[]) => (items.length ? `\n\n${title}\n${items.map((x) => `• ${x}`).join('\n')}` : '')
  return `This is my opinion on your story (read from the ${slides} slide titles and first lines), not a check of facts. Nothing was changed.\n\n${a.flow}${list('What works', a.strengths)}${list('What may be missing', a.gaps)}${list('What I would change', a.suggestions)}\n\nSay which of these you want and I will do it step by step.`
}
