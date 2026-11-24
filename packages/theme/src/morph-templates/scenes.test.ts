import { describe, expect, it } from 'vitest'
import { MORPH_PROFILES } from './profiles'
import { MORPH_TEMPLATES, getMorphTemplate } from './registry'
import { MIN_SHARED, chooseScenes, sharedObjects } from './scenes'

describe('Morph template scenes: shorter decks and scenes a request cannot fill', () => {
  it('every droppable scene exists, is neither the first nor the last, and is listed once', () => {
    for (const t of MORPH_TEMPLATES) {
      const d = MORPH_PROFILES[t.id]?.droppable ?? []
      const ids = t.scenes.map((s) => s.id)
      expect(new Set(d).size, `${t.id} lists a scene twice`).toBe(d.length)
      for (const id of d) { expect(ids, `${t.id}: ${id}`).toContain(id); expect(id, `${t.id}: ${id} is first or last`).not.toBe(ids[0]); expect(id, `${t.id}: ${id} is first or last`).not.toBe(ids[ids.length - 1]) }
    }
  })

  it('at its shortest, a deck still starts with the cover, ends with the closing, and every neighbour pair can morph', () => {
    for (const t of MORPH_TEMPLATES) {
      const all = t.scenes.map((s) => s.id)
      const { scenes, lengths } = chooseScenes(t, { length: 1 })
      expect(scenes[0], t.id).toBe(all[0]); expect(scenes.at(-1), t.id).toBe(all.at(-1))
      expect(scenes.length, t.id).toBe(lengths.at(-1)) // asking for less than possible gives the shortest possible
      for (let i = 0; i + 1 < scenes.length; i++) {
        const a = scenes[i]!, b = scenes[i + 1]!
        // two scenes that were neighbours already (the template's own order) are fine as they are; a bridge made by leaving scenes out must still share objects
        if (all.indexOf(b) - all.indexOf(a) > 1) expect(sharedObjects(t, a, b), `${t.id}: ${a} to ${b}`).toBeGreaterThanOrEqual(MIN_SHARED)
      }
      expect(scenes.every((id, i) => i === 0 || all.indexOf(id) > all.indexOf(scenes[i - 1]!)), `${t.id} keeps the template's order`).toBe(true)
    }
  })

  it('the reachable lengths go down one at a time from the full deck, and each can be asked for', () => {
    for (const t of MORPH_TEMPLATES) {
      const { lengths } = chooseScenes(t)
      expect(lengths[0], t.id).toBe(t.scenes.length)
      lengths.forEach((n, i) => { if (i > 0) expect(n, t.id).toBe(lengths[i - 1]! - 1) })
      for (const n of lengths) expect(chooseScenes(t, { length: n }).scenes.length, `${t.id} at ${n}`).toBe(n)
    }
  })

  it('a template with no droppable scenes is offered at its full length only', () => {
    const t = MORPH_TEMPLATES.find((x) => !(MORPH_PROFILES[x.id]?.droppable?.length))
    if (t) expect(chooseScenes(t, { length: 3 }).scenes).toHaveLength(t.scenes.length)
  })

  it('scenes the request cannot fill are left out, but never the first or the last, and never when the Morph could not bridge the gap', () => {
    const t = getMorphTemplate('pitch-orbit')!
    const r = chooseScenes(t, { drop: ['s6', 's1', 's11'] })
    expect(r.scenes).not.toContain('s6'); expect(r.scenes).toContain('s1'); expect(r.scenes).toContain('s11')
    expect(r.dropped).toEqual([{ scene: 's6', why: 'cannot-fill' }])
    expect(r.lengths[0]).toBe(t.scenes.length - 1)
    // pitch-market's "Market size" (s3) is the only bridge between its neighbours: it stays
    const m = getMorphTemplate('pitch-market')!
    expect(sharedObjects(m, 's2', 's4')).toBeLessThan(MIN_SHARED)
    expect(chooseScenes(m, { drop: ['s3'] }).scenes).toContain('s3')
  })

  it('a shorter deck drops the least important scenes first and says so', () => {
    const t = getMorphTemplate('space')!
    const r = chooseScenes(t, { length: 14 })
    expect(r.scenes).toHaveLength(14)
    expect(r.dropped.every((d) => d.why === 'shorter')).toBe(true)
    expect(r.dropped.map((d) => d.scene).slice(0, 3)).toEqual(['s3', 's6', 's2']) // two chapter openers, then the contents
  })
})
