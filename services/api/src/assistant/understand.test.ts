import { describe, expect, it } from 'vitest'
import { AIGateway, ModelRegistry, MockProvider, type UsageRecord } from '@prompttoppt/ai'
import { intentSchema } from './understand.ts'

/** The understand step checks every task's details inside its own schema, so a bad value is repaired by the gateway, never silently dropped. */
const answer = (tasks: unknown[]) => JSON.stringify({ kind: 'edit', clarity: 'act', tasks })
const run = (respond: (n: number) => string) => {
  const provider = new MockProvider((_r, n) => respond(n))
  const ledger: UsageRecord[] = []
  const gateway = new AIGateway({ providers: { gemini: provider }, registry: new ModelRegistry(), recordUsage: async (r) => void ledger.push(r), sleep: async () => {} })
  return { provider, ledger, ask: () => gateway.run({ route: 'fast', requestType: 'assist_understand', system: 's', prompt: 'p', schema: intentSchema }) }
}

describe('intentSchema: task details', () => {
  it('fills in the defaults of a valid task and keeps only known details', () => {
    const r = intentSchema.parse({ tasks: [{ family: 'undo', values: { junk: 1 } }, { family: 'motion', values: { preset: 'zoom' } }] })
    expect(r.tasks[0]).toMatchObject({ family: 'undo', values: { change: 0, part: 'all' } })
    expect(r.tasks[0]!.values).not.toHaveProperty('junk')
    expect(r.tasks[1]!.values).toEqual({ preset: 'zoom' })
  })
  it('rejects a bad detail with the family and the field named (an animation outside the list, a colour that is not a hex)', () => {
    const motion = intentSchema.safeParse({ tasks: [{ family: 'motion', values: { preset: 'fade' } }] })
    expect(motion.success).toBe(false)
    expect(motion.error!.issues[0]).toMatchObject({ path: ['tasks', 0, 'values', 'preset'], message: expect.stringMatching(/^motion: /) })
    const colour = intentSchema.safeParse({ tasks: [{ family: 'background', values: { color: 'brown' } }] })
    expect(colour.success).toBe(false)
    expect(colour.error!.issues[0]!.path.join('.')).toBe('tasks.0.values.color')
  })
})

describe('intentSchema: undo is the whole change unless a slide is NAMED', () => {
  const undo = (part: string, targets: unknown[] = []) => intentSchema.parse({ tasks: [{ family: 'undo', targets, values: { part } }] }).tasks[0]!
  it('"undo that" with a model-chosen scope of "slide" and no named slide puts back the whole change (it used to dead-end after a move or a delete)', () => {
    expect(undo('slide', [{ by: 'just_changed' }])).toMatchObject({ targets: [], values: { part: 'all', change: 0 } })
    expect(undo('slide', [{ by: 'current' }])).toMatchObject({ targets: [], values: { part: 'all' } })
    expect(undo('slide')).toMatchObject({ values: { part: 'all' } })
  })
  it('a slide the person names keeps its scope and its target', () => {
    expect(undo('slide', [{ by: 'number', n: 3 }, { by: 'just_changed' }])).toMatchObject({ targets: [{ by: 'number', n: 3 }], values: { part: 'slide' } })
    expect(undo('slide', [{ by: 'title', text: 'pricing' }])).toMatchObject({ values: { part: 'slide' } })
  })
  it('"all" and "theme" carry no slide targets', () => {
    expect(undo('all', [{ by: 'just_changed' }]).targets).toEqual([])
    expect(undo('theme', [{ by: 'current' }])).toMatchObject({ targets: [], values: { part: 'theme' } })
  })
})

describe('the gateway repairs a bad detail with the exact reason (the animation "fade" used to end in "I didn\'t understand")', () => {
  it('first answer has a bad preset, second is fixed: the person gets the animation', async () => {
    const t = run((n) => (n === 1 ? answer([{ family: 'motion', values: { preset: 'fade' } }]) : answer([{ family: 'motion', values: { preset: 'rise' } }])))
    const r = await t.ask()
    expect(r.tasks[0]!.values).toEqual({ preset: 'rise' })
    expect(t.provider.calls[1]!.prompt).toMatch(/rejected: model output failed validation: tasks\.0\.values\.preset: motion: /) // the repair prompt names the field
    expect(t.ledger[0]).toMatchObject({ status: 'error', errorCode: 'invalid_output' })
    expect(t.ledger[0]!.errorDetail).toMatch(/tasks\.0\.values\.preset/)
  })
})
