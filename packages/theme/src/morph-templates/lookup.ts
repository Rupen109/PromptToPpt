import type { MorphTemplate } from './types'

/**
 * Where the layout engine finds Morph templates. The template data (designs, scenes, hundreds of objects) is large, so the engine does not import it: whoever composes Morph scenes
 * (the editor, the API, the website's Morph pages) imports `@prompttoppt/theme/morph-templates`, which registers the templates here. Pages that never touch a Morph scene
 * (the home page, pricing, the header's menus) then never download them.
 */
let find: ((id: string) => MorphTemplate | undefined) | undefined

export const registerMorphTemplates = (lookup: (id: string) => MorphTemplate | undefined) => { find = lookup }

export function lookupMorphTemplate(id: string): MorphTemplate {
  const tpl = find?.(id)
  if (!tpl) throw new Error(find ? `Unknown Morph template "${id}"` : `Morph templates are not loaded: import '@prompttoppt/theme/morph-templates' where Morph scenes are composed`)
  return tpl
}
