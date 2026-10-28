/**
 * The brief a remix job runs on: the user's instruction wrapped in rules that keep the new deck inside the original's content.
 * (The original's slides arrive as an attached source; this text goes where the user's prompt normally goes.)
 * The wrapper itself is English, so the original's language is named explicitly or a Spanish deck would come back in English.
 */
export function remixPrompt(instruction: string, originalTitle: string, language: string, slideCount?: number): string {
  return [
    `Remix the attached presentation "${originalTitle.slice(0, 120)}" into a NEW presentation.`,
    `What the user wants changed: ${instruction.trim()}`,
    'Rules: the attached presentation is the user\'s own content. Use ONLY the facts, figures, names and claims it contains, and keep every number exactly as written. Do not invent anything new.',
    'Keep the original storyline and order of ideas unless the request asks to change the structure. Follow the requested audience, tone, length and format; leave out what the request says to leave out.',
    `The attached presentation is written in the language with ISO code "${language}". Write the new presentation in that same language, unless the request above asks for a different language.`,
    ...(slideCount ? [`The new presentation must have exactly ${slideCount} slides (this overrides any other slide count mentioned above).`] : []),
  ].join('\n')
}
