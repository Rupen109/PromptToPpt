import { describe, expect, it } from 'vitest'
import { MORPH_PROFILES } from './profiles'
import { MORPH_TEMPLATES } from './registry'

describe('Morph template profiles (what each template is about, for matching a topic to it)', () => {
  it('every template has a profile and every profile belongs to a template', () => {
    expect(Object.keys(MORPH_PROFILES).sort()).toEqual(MORPH_TEMPLATES.map((t) => t.id).sort())
  })
  it('a template whose pictures are about a subject names that subject; an abstract one names none', () => {
    for (const [id, p] of Object.entries(MORPH_PROFILES)) {
      if (p.art === 'abstract') expect(p.subjects, id).toEqual([])
      else expect(p.subjects.length, `${id} needs the words of its subject`).toBeGreaterThanOrEqual(6)
      for (const s of p.subjects) expect(s, `${id}: "${s}" must be lower case`).toBe(s.toLowerCase())
      expect(new Set(p.subjects).size, `${id} lists a word twice`).toBe(p.subjects.length)
    }
  })
  it('every template says what it is for (the words and the sentence the match uses)', () => {
    for (const t of MORPH_TEMPLATES) {
      expect(t.topics?.length, `${t.id} topics`).toBeGreaterThanOrEqual(8)
      expect(t.category, `${t.id} category`).toBeTruthy()
      expect((t.audience ?? '').length, `${t.id} audience`).toBeGreaterThan(40)
    }
  })
})
