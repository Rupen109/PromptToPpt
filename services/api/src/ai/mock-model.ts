import { crc32, deflateSync } from 'node:zlib'
import { ProviderError, type TextRequest } from '@prompttoppt/ai'
import { DESIGNS } from '@prompttoppt/theme'

/**
 * Deterministic stand-in for a model (AI_PROVIDER=mock). Understands the [task:*] marker and the
 * <params> JSON from prompts.ts, and returns schema-valid output. Used by tests and for key-less dev.
 */
const params = (p: string): Record<string, any> => {
  const m = p.match(/<params>([\s\S]*?)<\/params>/)
  return m ? JSON.parse(m[1]!) : {}
}
const words = (s: string) => (s.match(/<user_request>\n([\s\S]*?)\n<\/user_request>/)?.[1] ?? '').trim()

export function mockRespond(req: TextRequest): string {
  const task = req.system.match(/\[task:(\w+)\]/)?.[1]
  const p = params(req.prompt)

  if (task === 'analyze') {
    const text = words(req.prompt)
    const n = text.split(/\s+/).filter(Boolean).length
    const count = text.match(/(\d{1,2})\s*slides?/i)?.[1]
    return JSON.stringify({
      topic: text.slice(0, 120) || 'Untitled', language: 'en',
      ...(count ? { slideCount: Number(count) } : {}),
      requiredSections: [], specificity: n > 12 ? 'detailed' : 'broad_topic', missing: n > 12 ? [] : ['audience', 'objective'],
    })
  }
  if (task === 'free_outline') {
    const n: number = p['slides'] ?? 8
    return JSON.stringify({ title: words(req.prompt).slice(0, 100) || 'Untitled', slides: Array.from({ length: n }, (_, i) => ({ title: `Point ${i + 1}`, points: ['First idea', 'Second idea', 'Third idea'] })) })
  }
  if (task === 'free_script') {
    const n: number = p['slides'] ?? 6
    const body = req.prompt.match(/<user_request>\n([\s\S]*?)\n<\/user_request>/)?.[1] ?? ''
    if (body.includes('FAIL_PLEASE')) throw new Error('mock model failure')
    return JSON.stringify({ title: body.split(/\s+/).slice(0, 6).join(' ') || 'Script', slides: Array.from({ length: n }, (_, i) => ({ title: `Beat ${i + 1}`, points: ['First idea from the script', 'Second idea', 'Third idea'] })) })
  }
  if (task === 'free_pdf') {
    return JSON.stringify({ title: 'Mock document', summary: 'A short mock summary.', keyPoints: ['One', 'Two', 'Three', 'Four'], slides: Array.from({ length: 6 }, (_, i) => ({ title: `Part ${i + 1}`, points: ['Alpha', 'Beta', 'Gamma'] })) })
  }
  if ((task === 'askdeck' || task === 'webresearch' || task === 'imageread' || task === 'mediaread' || task === 'framesread') && req.prompt.includes('FAIL_PLEASE')) throw new Error('mock model failure') // lets tests exercise the refund path
  if (task === 'askdeck') {
    const deck = req.prompt.match(/<deck>\n([\s\S]*?)\n<\/deck>/)?.[1] ?? ''
    const q = req.prompt.match(/<question>([\s\S]*?)<\/question>/)?.[1] ?? ''
    return JSON.stringify(/not in the deck|unknowable/i.test(q) ? { answer: 'The deck does not say.', slides: [] } : { answer: `From the deck: ${deck.split('\n')[0]?.slice(0, 200) ?? ''}`, slides: [1] })
  }
  if (task === 'imageread') {
    if (req.images?.length && Buffer.from(typeof req.images[0]!.data === 'string' ? req.images[0]!.data : req.images[0]!.data).includes('BLANK_PICTURE')) return JSON.stringify({ title: '', kind: 'photo', legible: false, text: '' })
    return JSON.stringify({ title: 'Mock picture', kind: 'notes', legible: true, text: 'Zorvex Bikes sold 4,200 electric bicycles in 2025.\nFactory: Pune.\nNext step: second factory in Chennai in 2027.' })
  }
  if (task === 'mediaread') {
    const data = req.media?.[0]?.data
    const buf = typeof data === 'string' ? Buffer.from(data, 'base64') : data ? Buffer.from(data) : Buffer.alloc(0)
    if (buf.includes('SILENT_MEDIA') || req.prompt.includes('SILENT_FILE')) return JSON.stringify({ title: '', language: '', hasSpeech: false, text: '' })
    return JSON.stringify({ title: 'Mock recording', language: 'en', hasSpeech: true, text: '0:00 Zorvex Bikes sold 4,200 electric bicycles in 2025.\n0:25 The factory in Pune employs 310 people.\n2:10 Next step is a second factory in Chennai in 2027.' })
  }
  if (task === 'framesread') {
    const frames = (p['frames'] as { index: number }[] | undefined) ?? []
    return JSON.stringify({ frames: frames.map((f) => ({ index: f.index, text: f.index === 1 ? 'Quarterly results: revenue 86 crore rupees' : '' })) })
  }
  if (task === 'webresearch') return 'Mock web brief: the topic is widely covered; key facts follow. [example.com]'
  if (task === 'critic') return JSON.stringify({ defects: [] })
  if (task === 'design_pick') { const m = /<templates>\n([^\n|]+) \|/.exec(req.prompt); return JSON.stringify({ designId: m?.[1]?.trim() ?? '', reason: 'mock' }) }
  if (task === 'picture_query') return JSON.stringify({ queries: [String(p['topic'] ?? p['intent'] ?? 'business meeting').slice(0, 60)] })
  if (task === 'picture_verify') return JSON.stringify({ score: 4, reason: 'mock' })
  if (task === 'directions') {
    return JSON.stringify({
      directions: ['Executive overview', 'How it works', 'Business use cases', 'Adoption roadmap'].map((t, i) => ({
        id: t.toLowerCase().replace(/\W+/g, '-'), title: t, description: `${t} of ${p['topic']}`, suggestedSlideCount: [6, 8, 8, 7][i],
      })),
    })
  }
  if (task === 'outline') {
    const n: number = p['slideCount'] ?? 8
    const mid = ['title-body', 'process', 'comparison', 'split-image-text', 'timeline', 'table']
    return JSON.stringify({
      title: String(p['topic'] ?? 'Deck').slice(0, 100),
      slides: Array.from({ length: n }, (_, i) => ({
        title: i === 0 ? String(p['topic']).slice(0, 80) : i === n - 1 ? 'Thank you' : `Key point ${i}`,
        purpose: `Slide ${i + 1} purpose`,
        layout: i === 0 ? 'title' : i === n - 1 ? 'thank-you' : mid[(i - 1) % mid.length],
        keyPoints: ['Point A', 'Point B'], needsVisual: false,
      })),
    })
  }
  if (task === 'slides') {
    const outline: { title: string; layout: string }[] = p['outline'] ?? []
    return JSON.stringify({
      slides: outline.map((o) => {
        const base = { layout: o.layout, title: o.title, speakerNotes: 'Mock speaker notes.' }
        switch (o.layout) {
          case 'title': case 'section-divider': case 'thank-you': return { ...base, subtitle: 'Mock subtitle' }
          case 'split-image-text': return { ...base, bullets: ['First point', 'Second point', 'Third point'], imagePrompt: 'A team collaborating around a table', imageAlt: 'Team collaborating' }
          case 'process': case 'timeline': return { ...base, steps: [1, 2, 3].map((k) => ({ label: `Step ${k}`, detail: `Detail for step ${k}` })) }
          case 'comparison': return { ...base, left: { heading: 'Before', bullets: ['Manual', 'Slow'] }, right: { heading: 'After', bullets: ['Automated', 'Fast'] } }
          case 'table': return { ...base, header: ['Option', 'Strength'], rows: [['A', 'Simple'], ['B', 'Flexible']] }
          case 'agenda': return { ...base, items: [1, 2, 3].map((k) => ({ label: `Topic ${k}`, detail: 'Mock detail' })) }
          case 'team': return { ...base, people: [1, 2].map((k) => ({ name: `Person ${k}`, role: 'Role', bio: 'Mock bio' })) }
          case 'matrix': return { ...base, quadrants: [1, 2, 3, 4].map((k) => ({ heading: `Quadrant ${k}`, bullets: ['Mock point'] })) }
          case 'big-number': return { ...base, value: '42', label: 'Mock label', context: ['Mock context'] }
          case 'roadmap': return { ...base, phases: [1, 2, 3].map((k) => ({ label: `Phase ${k}`, heading: `Milestone ${k}`, bullets: ['Mock'] })) }
          case 'architecture': return { ...base, layers: [1, 2].map((k) => ({ name: `Layer ${k}`, items: ['A', 'B'] })) }
          case 'case-study': return { ...base, client: 'Mock client', challenge: 'Mock challenge', approach: ['Mock approach'], results: ['Mock result'], headline: { value: '10x', label: 'Mock' } }
          case 'quote': return { layout: 'quote', quote: 'Mock quote', attribution: 'Mock' }
          case 'metrics': return { ...base, metrics: [{ value: '1', label: 'One' }, { value: '2', label: 'Two' }] }
          case 'chart': return { ...base, chartType: 'bar', labels: ['A', 'B'], series: [{ name: 'S', values: [1, 2] }], takeaway: 'Mock takeaway' }
          default: return { ...base, layout: 'title-body', bullets: ['Point one', 'Point two', 'Point three'] }
        }
      }),
    })
  }
  if (task === 'aiedit') {
    if (req.prompt.includes('FAIL_PLEASE')) throw new Error('mock model failure') // lets tests exercise the refund path
    const slide = JSON.parse(req.prompt.match(/<slide>\n([\s\S]*?)\n<\/slide>/)![1]!)
    const tag = (s: unknown) => (typeof s === 'string' ? `${s} ✎` : s)
    return JSON.stringify({ slide: { ...slide, ...(slide.title ? { title: tag(slide.title) } : {}), ...(slide.bullets ? { bullets: slide.bullets.map(tag) } : {}) } })
  }
  if (task === 'aiassist') {
    const ins = (req.prompt.match(/<instruction>\n([\s\S]*?)\n<\/instruction>/)?.[1] ?? '').toLowerCase()
    if (ins.includes('fail_please')) throw new Error('mock model failure')
    const ops: unknown[] = []
    const unsupported: string[] = []
    if (ins.includes('animate')) ops.push({ op: 'set_motion', preset: 'zoom' })
    if (ins.includes('colo')) ops.push({ op: 'set_colors', primary: '#B4232C', accent: '#F59E0B', mode: 'light' })
    if (ins.includes('premium template')) ops.push({ op: 'set_template', id: DESIGNS.find((d) => d.premium)!.id })
    if (ins.includes('update the content') && req.prompt.includes('<source id="link1"')) {
      const id = req.prompt.match(/"id":"([^"]+)","n":2,/)?.[1]
      const slide = id ? JSON.parse(req.prompt.match(new RegExp(`\\{"id":"${id}"[^\\n]*"content":(\\{.*\\})\\}$`, 'm'))![1]!) : null
      const fact = req.prompt.match(/<source id="link1"[^>]*>\n([\s\S]*?)\n<\/source>/)?.[1]?.slice(0, 40) ?? ''
      if (slide) ops.push({ op: 'edit_slide', slideId: id, content: { ...slide, title: `From link: ${fact}`.slice(0, 80) } })
    }
    if (ins.includes('shorten')) {
      const id = req.prompt.match(/"id":"([^"]+)","n":2,/)?.[1]
      const slide = id ? JSON.parse(req.prompt.match(new RegExp(`\\{"id":"${id}"[^\\n]*"content":(\\{.*\\})\\}$`, 'm'))![1]!) : null
      if (slide) ops.push({ op: 'edit_slide', slideId: id, content: { ...slide, ...(slide.title ? { title: `${slide.title} ✎` } : {}) } })
    }
    if (ins.includes('more bullet points')) {
      // a model that only REWORDS the points the first time, and adds them when told its first answer did not ("stubborn" never does)
      const id = req.prompt.match(/"id":"([^"]+)","n":2,/)?.[1]
      const slide = id ? JSON.parse(req.prompt.match(new RegExp(`\\{"id":"${id}"[^\\n]*"content":(\\{.*\\})\\}$`, 'm'))![1]!) : null
      const n = Number(ins.match(/(\d+) more bullet points/)?.[1] ?? 2)
      if (slide?.bullets) {
        const retry = ins.includes('did not add the points') && !ins.includes('stubborn')
        ops.push({ op: 'edit_slide', slideId: id, content: { ...slide, bullets: retry ? [...slide.bullets, ...Array.from({ length: n }, (_, i) => `Added point ${i + 1}`)] : slide.bullets.map((b: string) => `${b}.`) } })
      }
    }
    if (/photo|image|picture/.test(ins)) {
      const first = req.prompt.match(/"id":"([^"]+)","n":1,"layout":"([^"]+)"/)
      if (first) ops.push({ op: 'add_image', slideId: first[1], placement: ['title', 'section-divider', 'thank-you', 'quote', 'big-number'].includes(first[2]!) ? 'background' : 'beside', prompt: 'A modern red electric hatchback on a coastal road at sunset' })
    }
    if (ins.includes('export')) unsupported.push('I cannot export.')
    return JSON.stringify({ reply: ops.length ? 'Done — I updated the deck.' : 'I could not do that.', operations: ops, unsupported })
  }
  throw new Error(`mock: unknown task ${task}`)
}

/** Deterministic 192×108 gradient PNG for AI_PROVIDER=mock (colours derived from the prompt). `BLOCK_PLEASE` / `FAIL_PLEASE` exercise error paths. */
export function mockImage(req: { prompt: string }): { bytes: Uint8Array; mime: string } {
  if (req.prompt.includes('BLOCK_PLEASE')) throw new ProviderError('blocked: IMAGE_SAFETY', 'blocked', false)
  if (req.prompt.includes('FAIL_PLEASE')) throw new ProviderError('mock image failure', 'mock_failure', false)
  let h = 0
  for (const ch of req.prompt) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const [r1, g1, b1] = [h & 255, (h >> 8) & 255, (h >> 16) & 255]
  const [W, H] = [192, 108]
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const t = (x + y) / (W + H)
      const o = y * (W * 3 + 1) + 1 + x * 3
      raw[o] = Math.round(r1 * (1 - t) + 255 * t * 0.4)
      raw[o + 1] = Math.round(g1 * (1 - t) + 200 * t * 0.5)
      raw[o + 2] = Math.round(b1 * (1 - t) + 160 * t * 0.6)
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
  return { bytes: new Uint8Array(png), mime: 'image/png' }
}
