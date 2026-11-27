import { DESIGNS } from '@prompttoppt/theme'

/**
 * The mock model's answers for the assistant's two calls (AI_PROVIDER=mock: tests and key-less dev). A crude, deterministic reading of a
 * few test phrases; the real model does the understanding. Test hooks: "fail_please" throws, "lazy" makes the first writing answer miss
 * its target (so the check-and-retry path runs), "stubborn" never fixes it, "ask_please" makes it ask.
 */
const NUM: Record<string, number> = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5 }
const count = (t: string, re: RegExp) => { const m = t.match(re); return m ? (Number(m[1]) || NUM[m[1]!] || 1) : 1 }

function refsIn(t: string): unknown[] {
  const range = t.match(/slides?\s*(\d+)\s*(?:-|to)\s*(\d+)/)
  if (range) return [{ by: 'range', from: Number(range[1]), to: Number(range[2]) }]
  const list = t.match(/slides?\s*(?:no\s*:?\s*)?((?:\d+\s*(?:,|and)?\s*)+)/)
  if (list) return [...list[1]!.matchAll(/\d+/g)].map((m) => ({ by: 'number', n: Number(m[0]) }))
  if (/\b(it|them|that page|the new)\b/.test(t)) return [{ by: 'just_changed' }]
  const titled = t.match(/the (\w+) slide/)
  if (titled && !['this', 'last', 'first', 'new'].includes(titled[1]!)) return [{ by: 'title', text: titled[1] }]
  if (/\blast slide\b/.test(t)) return [{ by: 'last', count: 1 }]
  return []
}

export function mockUnderstand(prompt: string): string {
  const t = (prompt.match(/<message>\n([\s\S]*?)\n<\/message>/)?.[1] ?? '').toLowerCase()
  if (t.includes('fail_please')) throw new Error('mock model failure')
  if (/^\s*(hi|hey|hello|thanks|thank you|ok)\b[\s.!]*$/.test(t)) return JSON.stringify({ kind: 'chat' })
  if (/^\s*how are you( doing)?\b[\s.!?]*$/.test(t)) return JSON.stringify({ kind: 'chat' }) // chat that is not a plain greeting: it reaches the pipeline
  if (/water|weather|recipe/.test(t)) return JSON.stringify({ kind: 'off_topic' })
  if (/^what can you (do|edit)|^what (is|'s) available/.test(t)) return JSON.stringify({ kind: 'help', help: /on this slide|edit on/.test(t) ? 'slide' : /plan|subscription/.test(t) ? 'plan' : 'all' })
  if (/^how many slides/.test(t)) { const n = (prompt.match(/<slides>\n([\s\S]*?)\n<\/slides>/)?.[1] ?? '').split('\n').length; return JSON.stringify({ kind: 'question', answer: `This deck has ${n} slides.` }) }
  if (t.includes('ask_please')) return JSON.stringify({ kind: 'edit', clarity: 'ask', question: 'Do you mean the whole deck or only this slide?' })
  // objects, the saved brand and the person's own pictures (the same understanding a real model gives for these phrases)
  if (/^make (this|it) bigger/.test(t)) return JSON.stringify({ kind: 'edit', clarity: 'act', tasks: [{ family: 'element', targets: [{ by: 'current' }], values: { elements: [{ by: 'selected' }], ops: [{ op: 'resize', scale: 1.3 }] } }] })
  if (/^use my brand/.test(t)) return JSON.stringify({ kind: 'edit', clarity: 'act', tasks: [{ family: 'brand', targets: [], values: {} }] })
  const own = /^use my (.+?) (photo|picture|image)/.exec(t)
  if (own) return JSON.stringify({ kind: 'edit', clarity: 'act', tasks: [{ family: 'picture', targets: [{ by: 'current' }], values: { replace: own[1] } }] })
  const tasks: unknown[] = []
  const unsupported: string[] = []
  const refs = refsIn(t)
  if (/\bundo\b|revert|put it back|didn.?t like/.test(t)) tasks.push({ family: 'undo', values: {} })
  if (t.includes('animate')) tasks.push({ family: 'motion', values: { preset: 'zoom' } })
  if (/colou?rs? to|change the colou?rs|change colou?rs/.test(t)) tasks.push({ family: 'palette', values: { primary: '#B4232C', accent: '#F59E0B' } })
  if (t.includes('dark theme')) tasks.push({ family: 'palette', values: { mode: 'dark' } })
  if (t.includes('premium template')) tasks.push({ family: 'template', values: { name: DESIGNS.find((d) => d.premium)!.name } })
  if (t.includes('modern template')) tasks.push({ family: 'template', values: { mood: 'modern' } })
  if (t.includes('serif')) tasks.push({ family: 'fonts', values: { pair: 'playfair' } })
  const addSlides = t.match(/add (?:a |an |(\d+|one|two|three|four|five) (?:more )?)?(?:new )?(thank ?you |agenda )?(?:slides?|pages?)/)
  if (addSlides) tasks.push({ family: 'add_slide', values: { count: count(t, /add (\d+|one|two|three|four|five) /), where: t.includes('between') ? 'spread' : t.includes('start') ? 'start' : /after slide (\d+)/.test(t) ? 'after' : 'end', ...(/after slide (\d+)/.test(t) ? { after: { by: 'number', n: Number(t.match(/after slide (\d+)/)![1]) } } : {}), about: addSlides[2] ? `${addSlides[2].trim()} slide` : t } })
  if (/\b(brown|navy)\b/.test(t) && !/colou?rs to/.test(t)) tasks.push({ family: 'background', targets: addSlides ? [{ by: 'added_by_task', task: tasks.length - 1 }] : refs, values: { color: t.includes('brown') ? '#7C2D12' : '#1E3A8A' } })
  if (/match (with )?(our |the )?other slides|same as (the )?other slides/.test(t)) tasks.push({ family: 'background', targets: [{ by: 'just_changed' }], values: { color: 'deck' } })
  if (/not visible|can.?t read/.test(t)) tasks.push({ family: 'readability', targets: refs.length ? refs : [{ by: 'just_changed' }], values: {} })
  if (/\blayout\b|format/.test(t)) tasks.push({ family: 'layout', targets: refs, values: {} })
  if (/shorten|shorter|rewrite/.test(t)) tasks.push({ family: 'text', targets: refs, values: { request: t } })
  const more = t.match(/(\d+|one|two|three) more bullet points?/)
  if (more) tasks.push({ family: 'text', targets: refs, values: { request: t, addPoints: Number(more[1]) || NUM[more[1]!] || 1 } })
  if (t.includes('update the content')) tasks.push({ family: 'text', targets: refs.length ? refs : [{ by: 'number', n: 2 }], values: { request: t, useSources: true } })
  if (/delete slide|remove slide/.test(t)) tasks.push({ family: 'remove_slide', targets: refs, values: {} })
  if (/move slide/.test(t)) tasks.push({ family: 'move_slide', targets: refs.slice(0, 1), values: { where: t.includes('end') ? 'end' : 'start' } })
  if (/duplicate slide/.test(t)) tasks.push({ family: 'duplicate_slide', targets: refs, values: {} })
  if (/\block slide/.test(t)) tasks.push({ family: 'lock_slide', targets: refs, values: { locked: true } })
  if (/photo|picture|image/.test(t) && !/remove/.test(t)) tasks.push({ family: 'picture', targets: refs, values: { source: /\bai\b|generate/.test(t) ? 'ai' : 'photo', placement: /background|behind/.test(t) ? 'background' : 'floating', subject: 'electric car on a coastal road' } })
  if (t.includes('export')) unsupported.push('I cannot export.')
  return JSON.stringify({ kind: tasks.length || unsupported.length ? 'edit' : 'off_topic', tasks, clarity: 'act', unsupported })
}

export function mockWrite(system: string, prompt: string): string {
  const card = system.match(/\[card:(\w+)\]/)?.[1]
  const input = JSON.parse(prompt.match(/<input>([\s\S]*?)<\/input>/)?.[1] ?? '{}') as Record<string, any>
  const retry = Array.isArray(input['problems']) && input['problems'].length > 0
  const lazy = String(input['request'] ?? input['want'] ?? '').includes('lazy') || JSON.stringify(input['slides'] ?? []).includes('lazy')
  const stubborn = String(input['request'] ?? '').includes('stubborn')
  if (card === 'text') {
    return JSON.stringify({ slides: (input['slides'] ?? []).map((s: any) => {
      const c = { ...s.content }
      if ((lazy && !retry) || stubborn) return { slideId: s.slideId, content: c }
      if (typeof c.title === 'string') c.title = `${c.title} ✎`.slice(0, 90)
      if (input['addPoints'] && Array.isArray(c.bullets)) c.bullets = [...c.bullets, ...Array.from({ length: input['addPoints'] }, (_, i) => `Added point ${i + 1}`)]
      return { slideId: s.slideId, content: c }
    }) })
  }
  if (card === 'layout') {
    return JSON.stringify({ slides: (input['slides'] ?? []).map((s: any, i: number) => {
      const c = s.content ?? {}
      const points: string[] = (c.bullets ?? c.context ?? ['First point', 'Second point', 'Third point']).slice(0, 5)
      while (points.length < 3) points.push(`Point ${points.length + 1}`)
      if (lazy && !retry) return { slideId: s.slideId, content: c }
      const to = input['layout'] ?? (i % 2 ? 'timeline' : 'process')
      const steps = points.map((p) => ({ label: p.split(' ').slice(0, 3).join(' '), detail: p }))
      return { slideId: s.slideId, content: to === 'agenda' ? { layout: 'agenda', title: c.title ?? 'Agenda', items: steps.map((x) => ({ label: x.label })) } : { layout: to === s.layout ? 'timeline' : to, title: c.title ?? 'Steps', steps, speakerNotes: '', sources: [] } }
    }) })
  }
  if (card === 'add_slide') {
    const thanks = String(input['about'] ?? '').includes('thank')
    return JSON.stringify({ slides: Array.from({ length: input['count'] ?? 1 }, (_, i) => ({ content: thanks ? { layout: 'thank-you', title: 'Thank you', subtitle: 'Questions?' } : { layout: 'title-body', title: `New slide ${i + 1}`, bullets: ['A first point', 'A second point'] } })) })
  }
  if (card === 'template') return JSON.stringify({ templateId: String((input['templates'] ?? [''])[0]).split('|')[0] })
  // the whole-deck plan: keep the cover and the close, rewrite the body slides (a "shorter" goal shortens them), add nothing unless asked
  if (card === 'transform_plan') {
    const slides: { id: string; n: number; layout: string; locked?: boolean; keepWords?: string }[] = input['deck']?.slides ?? []
    const last = slides.length - 1
    const kind = /short|concise|minute/i.test(String(input['goal'])) ? 'shorten' : 'rewrite'
    const actions = slides.map((sl, i) => (i === 0 || i === last || sl.locked || sl.keepWords ? { slideId: sl.id, action: 'keep' } : { slideId: sl.id, action: kind, note: `${kind} for ${input['goal']}` }))
    const add = Array.from({ length: input['limits']?.addSlides ?? 0 }, (_, i) => ({ afterSlideId: slides[Math.min(last - 1, i + 1)]?.id ?? null, title: `Added slide ${i + 1}`, about: 'more detail from the deck' }))
    return JSON.stringify({ goal: input['goal'], brief: `Make every slide serve this goal: ${input['goal']}. Keep every figure.`, actions, add })
  }
  if (card === 'transform_text' || card === 'transform_layout') {
    return JSON.stringify({ slides: (input['slides'] ?? []).map((s: any, i: number) => {
      const c = { ...s.content }
      if (card === 'transform_layout') { const points: string[] = (c.bullets ?? ['First point', 'Second point', 'Third point']).slice(0, 5); return { slideId: s.slideId, content: { layout: s.layout_to ?? (i % 2 ? 'timeline' : 'process'), title: c.title ?? 'Steps', steps: points.map((x: string) => ({ label: x.split(' ').slice(0, 3).join(' '), detail: x })), speakerNotes: '', sources: [] } } }
      if ((lazy && !retry) || stubborn) return { slideId: s.slideId, content: c }
      if (typeof c.title === 'string') c.title = `${c.title} ✎`.slice(0, 90)
      if (s.goal?.words?.atMost && Array.isArray(c.bullets)) c.bullets = c.bullets.slice(0, Math.max(1, c.bullets.length - 1)).map((b: string) => b.split(' ').slice(0, 4).join(' '))
      if (input['speakerNotesWords']) c.speakerNotes = Array.from({ length: input['speakerNotesWords'].about }, (_, k) => `word${k}`).join(' ')
      return { slideId: s.slideId, content: c }
    }) })
  }
  if (card === 'element_text') return JSON.stringify({ objects: (input['objects'] ?? []).map((o: any) => ({ id: o.id, lines: (lazy && !retry) || stubborn ? o.lines : o.lines.map((l: string, i: number) => (i === 0 ? `${l} (rewritten)` : l)) })) })
  if (card === 'transform_notes') return JSON.stringify({ slides: (input['slides'] ?? []).map((s: any) => ({ slideId: s.slideId, speakerNotes: Array.from({ length: input['speakerNotesWords']?.about ?? 20 }, (_, k) => `note${k}`).join(' ') })) })
  if (card === 'transform_add') return JSON.stringify({ slides: (input['adds'] ?? []).map((a: any) => ({ content: a.layout === 'thank-you' || /conclusion|thank/i.test(a.title) ? { layout: 'thank-you', title: a.title, subtitle: 'Questions?' } : { layout: 'title-body', title: a.title, bullets: ['A point from the deck', 'Another point from the deck'] } })) })
  throw new Error(`mock: unknown card ${card}`)
}
