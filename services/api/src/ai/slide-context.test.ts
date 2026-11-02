import { describe, expect, it } from 'vitest'
import type { Presentation } from '@prompttoppt/validation'
import { aiAssistPrompt, compileAssist } from './ai-assist.ts'

/** compileAssist is the trust boundary for both assistants (v2 validates its operations here too). */
const titles = ['Welcome', 'The problem', 'Our solution', 'Market size', 'How it works', 'Traction', 'Pricing plans', 'Team', 'Roadmap', 'Thank you']
const mk = (n = 10): Presentation => ({
  schemaVersion: 1, id: 'd', title: 'Deck', aspectRatio: '16:9', language: 'en', sources: [],
  theme: { id: 'x', name: 'X', colors: { primary: '#111111', accent: '#222222', background: '#ffffff' } },
  slides: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, layoutId: i === 0 ? 'title' : i === n - 1 ? 'thank-you' : 'title-body', locked: false, elements: [], content: { layout: 'title-body', title: titles[i] ?? `Slide ${i + 1}`, bullets: ['a point', 'another point'], speakerNotes: '', sources: [] } })),
}) as unknown as Presentation
const ent = { features: { premiumTemplates: true } } as never
const steps = { layout: 'process', title: 'How it works', steps: [{ label: 'One', detail: 'first thing' }, { label: 'Two', detail: 'second thing' }, { label: 'Three', detail: 'third thing' }], speakerNotes: '', sources: [] }
const out = (operations: unknown[]) => ({ reply: '', onTopic: true, unsupported: [], operations }) as never

describe('restructure_slide: a slide shown in another layout (the same thing the Layouts panel does for people)', () => {
  it('is applied as an edit that carries the new layout, and says so in words', () => {
    const r = compileAssist(mk(), out([{ op: 'restructure_slide', slideId: 's5', content: steps }]), ent, 'deck')
    expect(r.edits).toHaveLength(1)
    expect(r.edits[0]!.content.layout).toBe('process')
    expect(r.applied).toEqual(['Changed slide 5 to the process layout'])
  })
  it('skips a slide that already has that layout, a locked slide and a made-up slide', () => {
    const same = compileAssist(mk(), out([{ op: 'restructure_slide', slideId: 's5', content: { layout: 'title-body', title: 'x', bullets: ['a'], speakerNotes: '', sources: [] } }]), ent, 'deck')
    expect(same.edits).toHaveLength(0)
    expect(same.notes.join(' ')).toMatch(/already uses that layout/)
    const locked = mk(); (locked.slides[2] as { locked: boolean }).locked = true
    const l = compileAssist(locked, out([{ op: 'restructure_slide', slideId: 's3', content: steps }, { op: 'restructure_slide', slideId: 'nope', content: steps }]), ent, 'deck')
    expect(l.edits).toHaveLength(0)
    expect(l.notes.join(' ')).toMatch(/locked/)
    expect(l.notes.join(' ')).toMatch(/does not exist/)
  })
})

describe('the v1 prompt', () => {
  it('only the last four turns of the chat are sent', () => {
    const conversation = Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `turn number ${i + 1}` }))
    const p = aiAssistPrompt({ instruction: 'again', scope: 'deck', focusSlideId: undefined, doc: mk(), conversation })
    expect(p.prompt).not.toContain('turn number 4')
    expect(p.prompt).toContain('turn number 5')
    expect(p.prompt).toContain('turn number 8')
  })
  it('lists every operation it may use, each on its own line (set_slide_background was once overwritten)', () => {
    const { system } = aiAssistPrompt({ instruction: 'x', scope: 'deck', focusSlideId: undefined, doc: mk() })
    for (const op of ['set_template', 'set_colors', 'edit_slide', 'restructure_slide', 'set_slide_background', 'fix_readability', 'add_slide', 'revert', 'add_photo', 'add_image']) expect(system).toMatch(new RegExp(`^  \\{"op":"${op}"`, 'm'))
  })
})
