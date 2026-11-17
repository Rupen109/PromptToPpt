import { nanoid } from 'nanoid'
import { applyValidation } from '@prompttoppt/theme'
import { deckLanguage, promptAnalysisSchema, SCHEMA_VERSION, type Presentation, type PromptAnalysis } from '@prompttoppt/validation'
import { analyzePrompt, fileTemplateFillPrompt } from '../ai/prompts.ts'
import { gateway } from '../ai/gateway.ts'
import { openPictureSession, type PictureRequest, type PictureSession } from '../pictures/pick.ts'
import { getUserTemplate } from '../template-import/user-templates.ts'
import type { UploadedTemplate } from '../template-import/types.ts'
import { allowedNumbers } from './quality.ts'
import { placeholderSlide } from './progress.ts'
import { alignFill, assignSlides, buildDeck, describeSlides, longBoxes, uploadedFillSchema, type BuildReport, type TemplateMode, type UploadedFill } from './uploaded-template.ts'
import type { Photo } from '@prompttoppt/theme'

/**
 * A deck in the look of the person's own uploaded file. Steps: (manual) the slides are made at once from the template with neutral stand-ins; (ai) the request is analysed, ONE call chooses a
 * template slide for each story slide and writes its words, the code validates the choice and fits the words, pictures are looked up for the file's replaceable photos. The deck exists from the
 * start (the caller made it with the template's theme) and is written into, like every other generation path.
 */
export interface FileTemplateRun {
  job: { id: string; userId: string; lane: number | string; prompt: string; createdAt: Date }
  opts: { slideCount?: number | undefined; language?: string | undefined; analysis?: PromptAnalysis | undefined; model?: string | undefined; tier: 'starter' | 'premium' | 'frontier'; fromTemplateId: string; templateMode: TemplateMode }
  cp: { analysis?: PromptAnalysis; fileFill?: UploadedFill; marks?: Record<string, number>; report?: Record<string, unknown> } & Record<string, unknown>
  deckId: string
  slideIds: string[]
  tierRoute: 'fast' | 'quality'
  sources: { id: string; title: string; text: string; type?: string; url?: string | null }[]
  sourceRefs: Presentation['sources']
  prompt: string
  userTexts: string[]
  allowNumeric: boolean
  hold: { pictures?: PictureSession }
  stage: (status: 'analyzing' | 'outlining' | 'generating' | 'rendering' | 'validating', progress: number) => Promise<void>
  write: (doc: Presentation) => Promise<void>
  save: () => Promise<void>
  mark: (name: string) => void
  /** raises JobCancelled when the job was cancelled while the work ran */
  complete: (report: Record<string, unknown>) => Promise<void>
}

const aspectGroup = (w: number, h: number): PictureRequest['aspect'] => { const r = w / h; return r >= 1.7 ? 'wide' : r >= 1.15 ? 'standard' : r >= 0.85 ? 'square' : 'tall' }
const hasQuotation = (texts: string[]) => /["“][^"”\n]{12,}["”]/.test(texts.join('\n'))

export async function runFileTemplateDeck(r: FileTemplateRun): Promise<void> {
  const { job, opts, cp, deckId, slideIds } = r
  const found = await getUserTemplate(job.userId, opts.fromTemplateId)
  if (!found) throw new Error('The design this presentation is built in was deleted before it was finished')
  const tpl: UploadedTemplate = found.template
  const n = Math.max(1, Math.min(60, opts.slideCount ?? tpl.slides.length))
  while (slideIds.length < n) slideIds.push(nanoid(12))
  const ids = slideIds.slice(0, n)
  const withId = (doc: Presentation): Presentation => ({ ...doc, id: deckId, templateId: opts.fromTemplateId })
  const skeleton = (title: string, language: string): Presentation => ({ schemaVersion: SCHEMA_VERSION, id: deckId, title: title.slice(0, 200), aspectRatio: tpl.aspect, language, theme: tpl.theme, sources: r.sourceRefs, templateId: opts.fromTemplateId, slides: ids.map((id) => placeholderSlide(id, '', tpl.theme)) })
  const finish = async (doc: Presentation, report: BuildReport, extra: Record<string, unknown>) => {
    await r.stage('validating', 92)
    const { doc: checked, report: v } = applyValidation(withId(doc))
    await r.write(checked)
    r.mark('firstSlide'); r.mark('done')
    await r.complete({ template: opts.fromTemplateId, mode: opts.templateMode, slides: n, ...report, ...extra, timing: r.cp.marks, completeness: v.completeness, errors: v.errors, warnings: v.warnings })
  }

  // ── manual: no AI, no pictures: the file's slides with neutral stand-ins for the person to type into
  if (opts.templateMode === 'manual') {
    await r.stage('generating', 40)
    const assignment = assignSlides(tpl, n)
    const { doc, report } = buildDeck({ tpl, assignment, slideIds: ids, mode: 'manual', rules: { allowedNumbers: new Set(), figuresAllowed: false }, title: tpl.name, language: deckLanguage(opts.language)?.code ?? 'en', sources: r.sourceRefs })
    await finish(doc, report, {})
    return
  }

  // ── AI: analyse → one call (choose slides + write words) → fit → pictures → validate
  await r.stage('analyzing', 5)
  if (!cp.analysis) {
    const chosen = deckLanguage(opts.language)
    const found2 = opts.analysis ?? (await gateway.run({ priority: job.lane as never, route: 'fast', requestType: 'prompt_analysis', ...analyzePrompt(r.prompt, chosen), schema: promptAnalysisSchema, ctx: { userId: job.userId, jobId: job.id } }))
    cp.analysis = chosen ? { ...found2, language: chosen.code } : found2
    await r.save()
  }
  const analysis = cp.analysis
  await r.stage('outlining', 15)
  await r.write(skeleton(analysis.topic, analysis.language)); r.mark('skeleton')
  const ctx = { userId: job.userId, jobId: job.id }
  const base = { analysis, templateName: tpl.name, slideCount: n, templateSlides: describeSlides(tpl), chrome: tpl.chrome.map((c) => ({ id: c.id, maxChars: c.maxChars, caps: /\p{L}/u.test(c.sample) && c.sample === c.sample.toUpperCase() })), figuresAllowed: r.allowNumeric, quotesAllowed: hasQuotation(r.userTexts), sources: r.sources, userPrompt: r.prompt }
  if (!cp.fileFill) {
    const raw = await gateway.run({ priority: job.lane as never, route: r.tierRoute, model: opts.model, requestType: 'outline_generation', ...fileTemplateFillPrompt(base), schema: uploadedFillSchema, ctx })
    // the proposal is validated before anything uses it: first which slides, then the words that are too long for their boxes (asked ONCE to be shorter; the rest is fitted by code)
    const assignment = assignSlides(tpl, n, raw.slides.map((s) => s.use))
    const aligned = alignFill(tpl, assignment, raw)
    const long = longBoxes(aligned, tpl, assignment)
    if (long.length > 0) {
      try {
        const again = await gateway.run({ priority: job.lane as never, route: 'fast', requestType: 'outline_generation', ...fileTemplateFillPrompt({ ...base, shorten: long }), schema: uploadedFillSchema, ctx })
        again.slides.forEach((s, i) => { if (aligned.slides[i]) Object.assign(aligned.slides[i]!.fields, s.fields) })
      } catch { /* the words are fitted below whatever happens */ }
    }
    cp.fileFill = aligned
    await r.save()
  }
  await r.stage('generating', 55)
  const fill = cp.fileFill
  const assignment = assignSlides(tpl, n, fill.slides.map((s) => s.use))
  const rules = { allowedNumbers: allowedNumbers([...r.userTexts, ...(analysis.facts ?? [])]), figuresAllowed: r.allowNumeric }
  const title = (fill.title.trim() || analysis.topic).slice(0, 100)
  const common = { tpl, assignment, slideIds: ids, mode: 'ai' as const, fill, rules, title, language: analysis.language, sources: r.sourceRefs }
  // the words are on screen first (photos show as "picture goes here" boxes), the pictures follow
  const first = buildDeck(common)
  await r.write(applyValidation(withId(first.doc)).doc); r.mark('firstSlide')

  // pictures: the file's replaceable photos, matched to the topic (Unsplash, then the tagged library, vision-checked). No AI images. A photo with no match stays the "picture goes here" box.
  await r.stage('rendering', 82)
  const pics = (r.hold.pictures ??= await openPictureSession({ userId: job.userId, jobId: job.id }))
  const slots: { key: string; i: number }[] = []
  assignment.forEach((k, idx) => {
    const ts = tpl.slides[k]!
    const heading = ts.slots.find((s) => s.role === 'title')?.elementId
    const text = Object.values((fill.slides[idx]?.fields) ?? {}).join(' ').slice(0, 600)
    for (const p of ts.pictures) {
      if (!p.replaceable) continue
      const i = slots.length
      slots.push({ key: `${idx}:${p.elementId}`, i })
      const hd = (heading && fill.slides[idx]?.fields[heading]) || analysis.topic
      pics.add({ slideIndex: i, layout: 'split-image-text', title: hd, text, intent: String(hd).slice(0, 200), topic: analysis.topic, category: analysis.category ?? 'strategy', aspect: aspectGroup(p.width, p.height) })
    }
  })
  const photos = new Map<string, Photo | null>()
  for (const s of slots) { const p = await pics.result(s.i); photos.set(s.key, p ? { src: p.src, alt: p.alt, ...(p.attribution ? { attribution: p.attribution } : {}) } : null) }
  const last = buildDeck({ ...common, photos })
  await finish(last.doc, last.report, { pictureSlots: slots.length, stockBlocked: pics.blocked() })
}

