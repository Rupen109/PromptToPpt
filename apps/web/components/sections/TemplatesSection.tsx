import { CATEGORIES, DESIGNS, SKELETONS, type CategoryId } from '@prompttoppt/theme'
import { TemplatesSectionClient, type TemplateCardData, type TemplateFilter } from './TemplatesSectionClient'

const pick = (cat: CategoryId, ...idx: number[]) => idx.map((i) => DESIGNS.filter((d) => d.category === cat)[i]!.id)
/** Each filter shows real designs from the catalogue; every card opens that template's own page. */
const FILTERS: TemplateFilter[] = [
  { id: 'all', label: 'All Decks', ids: [...pick('pitch', 0, 1), ...pick('strategy', 0)] },
  { id: 'pitch', label: 'VC Pitch', ids: pick('pitch', 0, 1, 2) },
  { id: 'board', label: 'Board Updates', ids: pick('strategy', 0, 1, 2) },
  { id: 'product', label: 'Product Roadmaps', ids: pick('product', 0, 1, 2) },
]

/** Server side: reads the catalogue and hands the browser only the few cards this section shows (names, taglines, counts), not the template engine behind them. */
export function TemplatesSection() {
  const cards: Record<string, TemplateCardData> = {}
  for (const id of new Set(FILTERS.flatMap((f) => f.ids))) {
    const d = DESIGNS.find((x) => x.id === id)!
    const cat = CATEGORIES.find((c) => c.id === d.category)!
    cards[id] = { id, name: d.name, tagline: d.tagline, category: cat.name, blurb: cat.blurb, slides: SKELETONS[d.category].length }
  }
  return <TemplatesSectionClient filters={FILTERS} cards={cards} />
}

export default TemplatesSection
