import { and, eq, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { applyValidation, composeDeck, designById, pickDesign, type Photo } from '@prompttoppt/theme'
import {
  SCHEMA_VERSION, accessTierSchema, directionSchema, outlineSchema, promptAnalysisSchema, slideContentSchema,
  type Direction, type Outline, type Presentation, type PromptAnalysis, type Slide, type SlideContent,
} from '@prompttoppt/validation'
import { z } from 'zod'
import { gateway } from '../ai/gateway.ts'
import { analyzePrompt, criticPrompt, outlinePrompt, slidesPrompt } from '../ai/prompts.ts'
import { INSTRUCTIONS_VERSION } from '../ai/instructions/index.ts'
import { pickPictures, type PictureRequest } from '../pictures/pick.ts'
import { themeForAnalysis } from './theming.ts'
import { allowedNumbers, checkContents, repairRequests, stripInventedNumbers, textOf, type QualityIssue } from './quality.ts'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion, type JobStatus } from '../db/schema.ts'
import { env } from '../env.ts'
import { condense, hasNumbers, resolveSlideCount, sanitizeContent, sanitizeOutline } from './policy.ts'
import { loadSources } from './sources.ts'

const BATCH = 4
const LEASE_SECONDS = 120

export class JobCancelled extends Error {}

const optionsSchema = z.object({
  analysis: promptAnalysisSchema.optional(),
  direction: directionSchema.optional(),
  slideCount: z.number().int().optional(),
  /** set by the server from the plan (and, later, the chosen model) — selects the model chain */
  tier: accessTierSchema.default('premium'),
  /** catalog id chosen at job creation (validated against plan + catalogue) */
  model: z.string().optional(),
  /** template design to use (id from the catalogue). Absent → picked from the deck's category and the plan. */
  designId: z.string().optional(),
  /** whether the user's plan may use premium designs (set by the server) */
  premiumTemplates: z.boolean().default(false),
  /** rewrite THIS existing deck (keeps its id, title history and versions) instead of creating a new one */
  targetPresentationId: z.string().optional(),
  aspectRatio: z.enum(['16:9', '4:3', '1:1']).default('16:9'),
  /** keep every word of the existing deck and only replace its pictures (assistant "fix the pictures") */
  picturesOnly: z.boolean().default(false),
  sourceIds: z.array(z.string()).max(10).default([]),
})
type Checkpoint = { analysis?: PromptAnalysis; outline?: Outline; contents?: SlideContent[]; repaired?: boolean; report?: Record<string, unknown> }

/** Moves the job to a stage, extends the lease, and aborts if the user cancelled in the meantime. */
async function stage(jobId: string, status: JobStatus, progress: number) {
  const rows = await db
    .update(generationJob)
    .set({ status, progress, updatedAt: new Date(), lockedUntil: sql`now() + make_interval(secs => ${LEASE_SECONDS})` })
    .where(and(eq(generationJob.id, jobId), ne(generationJob.status, 'cancelled')))
    .returning({ id: generationJob.id })
  if (rows.length === 0) throw new JobCancelled()
}
const saveCheckpoint = (jobId: string, cp: Checkpoint) => db.update(generationJob).set({ checkpoint: cp as Record<string, unknown> }).where(eq(generationJob.id, jobId))

/**
 * prompt → analysis → outline → slide content → layout → validation → persist.
 * Every stage output is checkpointed, so a retry (crash, lease expiry, transient AI failure) resumes where it
 * stopped and never re-pays for finished stages. Persisting is a single transaction guarded by the job row,
 * so a job can never produce two decks.
 */
export async function runGeneration(jobId: string): Promise<void> {
  const [job] = await db.select().from(generationJob).where(eq(generationJob.id, jobId))
  if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) return
  const ctx = { userId: job.userId, jobId }
  const opts = optionsSchema.parse(job.options)
  const cp: Checkpoint = { ...(job.checkpoint as Checkpoint) }

  // The existing deck (rewrite / pictures-only jobs): its theme is kept EXACTLY, and for pictures-only its content is kept word for word.
  let existingDoc: Presentation | undefined
  if (opts.targetPresentationId) {
    const [t] = await db.select({ doc: presentationVersion.document }).from(presentation).innerJoin(presentationVersion, and(eq(presentationVersion.presentationId, presentation.id), eq(presentationVersion.version, presentation.latestVersion))).where(and(eq(presentation.id, opts.targetPresentationId), eq(presentation.userId, job.userId)))
    existingDoc = t?.doc as Presentation | undefined
  }

  let analysis: PromptAnalysis
  let outline: Outline
  let contents: SlideContent[]
  const sources = await loadSources(job.userId, opts.sourceIds)
  const knownIds = new Set(sources.map((s) => s.id))
  const userTexts = [job.prompt, ...sources.map((s) => s.text)]
  const allowNumeric = hasNumbers(job.prompt, sources.map((s) => s.text))
  const tierRoute = opts.tier === 'starter' ? 'fast' : 'quality'

  if (opts.picturesOnly && existingDoc) {
    // Keep every slide's words; only the pictures are re-chosen
    await stage(jobId, 'analyzing', 10)
    analysis = opts.analysis ?? { topic: existingDoc.title, language: existingDoc.language, requiredSections: [], facts: [], specificity: 'detailed', missing: [] }
    const composed = existingDoc.slides.filter((sl) => sl.content && !sl.manual)
    contents = composed.map((sl) => sl.content as SlideContent)
    outline = { title: existingDoc.title, slides: contents.map((c) => ({ title: ('title' in c && c.title) || existingDoc!.title, purpose: '', layout: c.layout, keyPoints: [], needsVisual: false })) } as Outline
  } else {
    // 1 ─ analyse
    await stage(jobId, 'analyzing', 5)
    if (!cp.analysis) {
      cp.analysis = opts.analysis ?? (await gateway.run({ route: 'fast', requestType: 'prompt_analysis', ...analyzePrompt(job.prompt), schema: promptAnalysisSchema, ctx }))
      await saveCheckpoint(jobId, cp)
    }
    analysis = cp.analysis
    const slideCount = resolveSlideCount(analysis, opts.direction as Direction | undefined, opts.slideCount)

    // 2 ─ outline
    await stage(jobId, 'outlining', 15)
    if (!cp.outline) {
      const raw = await gateway.run({ route: tierRoute, model: opts.model, requestType: 'outline_generation', ...outlinePrompt({ analysis, direction: opts.direction, slideCount, allowNumericLayouts: allowNumeric, sources, userPrompt: job.prompt }), schema: outlineSchema, ctx })
      cp.outline = sanitizeOutline(raw, slideCount, allowNumeric)
      await saveCheckpoint(jobId, cp)
    }
    outline = cp.outline

    // 3 ─ slide content, in batches (a failed batch retries alone; finished batches are checkpointed)
    contents = cp.contents ?? []
    while (contents.length < outline.slides.length) {
      await stage(jobId, 'generating', 30 + Math.round((contents.length / outline.slides.length) * 40))
      const batch = outline.slides.slice(contents.length, contents.length + BATCH)
      const { slides } = await gateway.run({
        route: tierRoute, model: opts.model, requestType: 'slide_content',
        ...slidesPrompt({ analysis, deckTitle: outline.title, outlineSlides: batch, startIndex: contents.length, totalSlides: outline.slides.length, sources }),
        schema: z.object({ slides: z.array(slideContentSchema).length(batch.length) }), ctx,
      })
      contents.push(...slides.map((s) => sanitizeContent(s, knownIds, allowNumeric)))
      cp.contents = contents
      await saveCheckpoint(jobId, cp)
    }

    // 3b ─ quality gate (code, not prompt): invented numbers, sample leakage, empty/duplicate slides, uncovered topics.
    // One repair pass rewrites the offending slides with the exact problem; what still fails is fixed deterministically or reported.
    await stage(jobId, 'validating', 74)
    const rewriteSlides = async (todo: { slide: number; problem: string }[]) => {
      const bySlide = new Map<number, string[]>()
      for (const t of todo) bySlide.set(t.slide, [...(bySlide.get(t.slide) ?? []), t.problem])
      for (const [n, problems] of bySlide) {
        const entry = outline.slides[n - 1]
        if (!entry) continue
        const { slides } = await gateway.run({
          route: tierRoute, model: opts.model, requestType: 'slide_content',
          ...slidesPrompt({ analysis, deckTitle: outline.title, outlineSlides: [entry], startIndex: n - 1, totalSlides: outline.slides.length, sources, repair: problems.map((problem) => ({ slide: 1, problem })) }),
          schema: z.object({ slides: z.array(slideContentSchema).length(1) }), ctx,
        })
        contents[n - 1] = sanitizeContent(slides[0]!, knownIds, allowNumeric)
      }
    }
    let issues: QualityIssue[] = checkContents(contents, { userTexts, analysis })
    if (!cp.repaired) {
      let todo = repairRequests(issues)
      // premium/frontier plans also get a second model reading the whole deck against the brief
      if (opts.tier !== 'starter') {
        try {
          const critic = await gateway.run({ route: 'quality', model: opts.model, requestType: 'deck_critic', ...criticPrompt({ analysis, userPrompt: job.prompt, slides: contents.map((c) => textOf(c).join(' | ').slice(0, 600)) }), schema: z.object({ defects: z.array(z.object({ slide: z.number().int().min(1).max(60), issue: z.string().max(240) })).max(8).default([]) }), ctx })
          todo = [...todo, ...critic.defects.filter((d) => d.slide <= contents.length).map((d) => ({ slide: d.slide, problem: d.issue }))]
        } catch { /* the critic is a bonus: never fail a deck because it was unavailable */ }
      }
      if (todo.length) { await rewriteSlides(todo.slice(0, 8)); cp.contents = contents }
      cp.repaired = true
      await saveCheckpoint(jobId, cp)
      issues = checkContents(contents, { userTexts, analysis })
    }
    const allowed = allowedNumbers([...userTexts, ...analysis.facts])
    for (const i of issues) if (i.kind === 'invented_number' && i.slide > 0) contents[i.slide - 1] = stripInventedNumbers(contents[i.slide - 1]!, allowed)
    cp.report = { instructions: INSTRUCTIONS_VERSION, remaining: checkContents(contents, { userTexts, analysis }).map((i) => ({ slide: i.slide, kind: i.kind })) }
  }

  // 4 ─ pictures that MATCH each slide (stock search / tagged library, verified by a vision check). A missing picture beats a wrong one.
  await stage(jobId, 'rendering', 82)
  const wanted: { index: number; req: PictureRequest }[] = []
  const nthOf: Record<string, number> = {}
  contents.forEach((c, index) => {
    const nth = (nthOf[c.layout] = (nthOf[c.layout] ?? -1) + 1)
    const aspect = c.layout === 'quote' ? 'tall' : c.layout === 'big-number' ? (nth % 2 === 0 ? 'square' : null) : c.layout === 'split-image-text' ? 'standard' : ['title', 'thank-you', 'section-divider'].includes(c.layout) ? 'wide' : null
    if (!aspect) return
    const entry = outline.slides[index]
    const intent = entry?.imageIntent || (c.layout === 'split-image-text' ? c.imagePrompt : '') || ('title' in c && c.title ? c.title : analysis.topic)
    wanted.push({ index, req: { slideIndex: index, layout: c.layout, title: ('title' in c && c.title) || analysis.topic, text: textOf(c).join(' ').slice(0, 600), intent: String(intent).slice(0, 200), topic: analysis.topic, category: analysis.category ?? 'strategy', aspect } })
  })
  const picked = await pickPictures(wanted.map((w) => w.req), { userId: job.userId, jobId }).catch(() => wanted.map(() => null))
  const picks: (Photo | null | undefined)[] = contents.map(() => undefined)
  wanted.forEach((w, k) => { const p = picked[k]; picks[w.index] = p ? { src: p.src, alt: p.alt, ...(p.attribution ? { attribution: p.attribution } : {}) } : null })
  // a picture+text slide with no picture becomes a plain text slide (never an empty frame)
  contents = contents.map((c, i) => (c.layout === 'split-image-text' && picks[i] === null ? ({ layout: 'title-body', title: c.title, bullets: c.bullets, speakerNotes: c.speakerNotes, sources: c.sources } as SlideContent) : c))
  cp.report = { ...(cp.report as object), pictures: { slots: wanted.length, placed: picks.filter(Boolean).length } }

  // 5 ─ layout (deterministic) in the design, then validation (+ one condense-and-retry pass for overflow)
  let design = (opts.designId ? designById(opts.designId) : undefined) ?? pickDesign(analysis.category, opts.premiumTemplates, job.prompt)
  // Rewriting an existing deck keeps its look EXACTLY (theme: colours, fonts, style, motion — including any custom colours the user set)
  if (existingDoc?.theme) design = { ...((existingDoc.theme.templateId ? designById(existingDoc.theme.templateId) : undefined) ?? design), theme: existingDoc.theme }
  // a NEW deck takes its colours from the topic, dark by default; a rewrite keeps the existing deck's theme untouched (set above)
  if (!existingDoc?.theme) design = { ...design, theme: themeForAnalysis(design.theme, analysis) }
  const theme = design.theme
  const assetBase = `${env.WEB_URL}/template-assets`
  const sourceRefs = opts.picturesOnly && existingDoc ? existingDoc.sources : sources.map((s) => ({ id: s.id, type: (s.type as 'pdf' | 'url' | 'text') ?? 'text', title: s.title.slice(0, 300), ...(s.url ? { url: s.url } : {}) }))
  const build = (cs: SlideContent[]): Presentation => {
    const composed = composeDeck(cs, design, opts.aspectRatio, () => nanoid(10), assetBase, analysis.category, picks).map((c): Slide => ({ id: nanoid(12), locked: false, validation: { status: 'pending', issues: [] }, ...c }))
    // pictures-only: hand-edited slides are kept exactly as they were, in their original positions
    let slides = composed
    if (opts.picturesOnly && existingDoc) { let k = 0; slides = existingDoc.slides.map((sl) => (sl.content && !sl.manual ? composed[k++]! : sl)) }
    return { schemaVersion: SCHEMA_VERSION, id: '', title: (opts.picturesOnly && existingDoc ? existingDoc.title : outline.title).slice(0, 200), aspectRatio: opts.aspectRatio, language: analysis.language, theme, sources: sourceRefs, slides }
  }
  await stage(jobId, 'validating', 92)
  let { doc, report } = applyValidation(build(contents))
  if (report.errors > 0) {
    const bad = new Set(report.slides.filter((s) => s.issues.some((i) => i.severity === 'error')).map((s) => s.slideId))
    const fixed = contents.map((c, i) => (bad.has(doc.slides[i]!.id) ? condense(c) : c))
    ;({ doc, report } = applyValidation(build(fixed)))
  }

  // 6 ─ persist (transaction; the locked job row makes this idempotent)
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(generationJob).where(eq(generationJob.id, jobId)).for('update')
    if (!locked || locked.status === 'cancelled') throw new JobCancelled()
    if (locked.presentationId) return // a previous attempt already persisted
    const id = opts.targetPresentationId ?? nanoid()
    doc = { ...doc, id }
    if (opts.targetPresentationId) {
      // Rewrite in place: a NEW version of the same deck (the old one stays in version history), revision bumped so open editors see a conflict-free reload
      const [p] = await tx.select().from(presentation).where(and(eq(presentation.id, id), eq(presentation.userId, job.userId))).for('update')
      if (!p) throw new Error('target presentation not found')
      const v = p.latestVersion + 1
      await tx.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: v, document: doc, createdBy: 'generation' })
      await tx.update(presentation).set({ title: doc.title, latestVersion: v, revision: p.revision + 1, updatedAt: new Date() }).where(eq(presentation.id, id))
    } else {
      await tx.insert(presentation).values({ id, userId: job.userId, title: doc.title, aspectRatio: doc.aspectRatio, latestVersion: 1 })
      await tx.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
    }
    await tx.update(generationJob).set({ status: 'completed', progress: 100, presentationId: id, updatedAt: new Date(), lockedUntil: null, checkpoint: { ...cp, report: { completeness: report.completeness, errors: report.errors, warnings: report.warnings } } }).where(eq(generationJob.id, jobId))
  })
}
