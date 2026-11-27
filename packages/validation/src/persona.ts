import { z } from 'zod'

/**
 * "What do you make presentations for?": asked once, the first time a person opens the app after signing up (and once for people who signed up before it existed).
 * Saved on the user row (`user.persona`), used to shape the product around the work people do (owner, 2026-11-26). The ids are stored: never rename one.
 */
export const PERSONAS = [
  { id: 'business', label: 'Business owner or founder', hint: 'Pitches, business plans and investor decks' },
  { id: 'sales', label: 'Sales and client work', hint: 'Proposals, client decks and account reviews' },
  { id: 'marketing', label: 'Marketing and brand', hint: 'Campaigns, launches and brand stories' },
  { id: 'manager', label: 'Team lead or manager', hint: 'Updates, reports and planning meetings' },
  { id: 'tech', label: 'Tech and product', hint: 'Demos, roadmaps and technical talks' },
  { id: 'teacher', label: 'Teacher or trainer', hint: 'Lessons, workshops and training sessions' },
  { id: 'student', label: 'Student', hint: 'Assignments, projects and class presentations' },
  { id: 'other', label: 'Something else', hint: 'Personal, community or anything else' },
] as const

export type Persona = (typeof PERSONAS)[number]['id']
export const personaSchema = z.enum(PERSONAS.map((p) => p.id) as [Persona, ...Persona[]])
export const personaInput = z.object({ persona: personaSchema }).strict()
