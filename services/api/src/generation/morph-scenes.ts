import { chooseScenes, type MorphTemplate, type SceneChoice } from '@prompttoppt/theme/morph-templates'
import type { PromptAnalysis } from '@prompttoppt/validation'
import { templateSlots } from './template-deck.ts'

/**
 * What a request can fill, and so which scenes of a template it gets. The words are written by the model, but it is told never to invent a figure, a person or a quotation, so a scene
 * built around figures stays empty when the request has none, and a "who is who" scene stays empty when nobody is named. Such scenes are left out when the Morph can still bridge the gap
 * (theme: chooseScenes). One place decides it, for the match shown on the create page, the length buttons and the job itself.
 */
export interface RequestFacts {
  /** the request or its sources gave a figure (a year alone is not one) */
  figures: boolean
  /** the request talks about a team or named people */
  people: boolean
}

export const hasFigures = (texts: (string | undefined)[]): boolean => /\d/.test(texts.filter(Boolean).join(' ').replace(/\b(?:19|20)\d\d\b/g, ''))
const PEOPLE = /\b(team|founders?|co-?founders?|staff|employees?|people|members?|leadership|management|speakers?|crew|experts?|ceo|cto|cfo|coo|directors?)\b/i

export function requestFacts(analysis: Pick<PromptAnalysis, 'topic' | 'objective' | 'audience' | 'facts' | 'requiredSections'>, prompt: string, sourceTexts: string[] = []): RequestFacts {
  const texts = [analysis.topic, analysis.objective, ...(analysis.facts ?? []), prompt, ...sourceTexts]
  return { figures: hasFigures(texts), people: PEOPLE.test([...texts, analysis.audience, ...(analysis.requiredSections ?? [])].filter(Boolean).join(' ')) }
}

interface Needs { figures: boolean; people: boolean }
const needsCache = new Map<string, Map<string, Needs>>()
/** what each scene is built around, worked out once from its own text boxes */
function sceneNeeds(t: MorphTemplate): Map<string, Needs> {
  let m = needsCache.get(t.id)
  if (m) return m
  m = new Map()
  for (const sc of templateSlots(t)) {
    // an index ("01", "2") is structure, not a figure the request has to give
    const numeric = sc.slots.filter((s) => s.numeric && !/^\s*0?\d{1,2}\s*$/.test(s.sample)).length
    const figures = numeric >= 2 && numeric / Math.max(1, sc.slots.length) >= 0.5
    const names = sc.slots.filter((s) => /^\p{Lu}[\p{L}'’.-]+(?: \p{Lu}[\p{L}'’.-]+){1,2}$/u.test(s.sample.trim())).length
    const people = /\b(team|people|who is who|crew|staff|members|founders|leadership|speakers?)\b/i.test(`${sc.title} ${sc.purpose}`) && names >= 2
    m.set(sc.scene, { figures, people })
  }
  needsCache.set(t.id, m)
  return m
}

/** The scenes of this template the request cannot fill (never the first or the last: they cannot be left out, and carry little that has to be given). */
export function unfillableScenes(t: MorphTemplate, facts: RequestFacts): string[] {
  const n = sceneNeeds(t)
  return t.scenes.slice(1, -1).map((s) => s.id).filter((id) => { const x = n.get(id); return !!x && ((x.figures && !facts.figures) || (x.people && !facts.people)) })
}

export interface ScenePlan extends SceneChoice {
  /** scenes the request cannot fill that could not be left out (the Morph needs them): their empty boxes are reported */
  unfilled: string[]
}

/** The scenes a deck from this template shows for this request, at this length (or as long as it can be). */
export function planScenes(t: MorphTemplate, facts: RequestFacts, length?: number): ScenePlan {
  const drop = unfillableScenes(t, facts)
  const choice = chooseScenes(t, { drop, length })
  return { ...choice, unfilled: drop.filter((id) => choice.scenes.includes(id)) }
}
