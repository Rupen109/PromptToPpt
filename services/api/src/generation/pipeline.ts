import { and, eq, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { applyValidation, composeDeck, designById, pickDesign, type Photo } from '@prompttoppt/theme'
import {
  SCHEMA_VERSION, SOURCE_TYPES, accessTierSchema, deckLanguage, directionSchema, outlineSchema, promptAnalysisSchema, slideContentSchema,
  type Direction, type Outline, type Presentation, type PromptAnalysis, type Slide, type SlideContent,
} from '@prompttoppt/validation'
import { z } from 'zod'
import { runPool } from './pool.ts'
import { gateway } from '../ai/gateway.ts'
import { analyzePrompt, criticPrompt, outlinePrompt, slidesPrompt } from '../ai/prompts.ts'
import { INSTRUCTIONS_VERSION } from '../ai/instructions/index.ts'
import { openPictureSession, type PictureRequest, type PictureSession } from '../pictures/pick.ts'
import { themeForAnalysis } from './theming.ts'
import { getKit } from '../brand/kits.ts'
import { remixPrompt } from '../remix/prompt.ts'
import { themeWithKit } from '../brand/apply.ts'
import { allowedNumbers, checkContents, repairRequests, stripInventedNumbers, textOf, type QualityIssue } from './quality.ts'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion, type JobStatus } from '../db/schema.ts'
import { env } from '../env.ts'
import { publishRevision } from '../live/bus.ts'
import { condense, hasNumbers, resolveSlideCount, sanitizeContent, sanitizeOutline } from './policy.ts'
import { loadSources } from './sources.ts'
import { chooseDesign } from './design-pick.ts'

const BATCH = 4
/** Independent model calls (slide batches, repair rewrites) that may run at once. Same prompts and models as before — only the waiting is shared. */
const PARALLEL_CALLS = 3
const LEASE_SECONDS = 120

export class JobCancelled extends Error {}

const optionsSchema = z.object({
  analysis: promptAnalysisSchema.optional(),
  /** language the person chose for the deck (code from DECK_LANGUAGES); beats whatever the analysis detected */
  language: z.string().max(12).optional(),
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
  /** remix THIS deck of the user's into a new deck: its theme (look) is kept exactly; its text arrives as a source */
  remixOf: z.string().max(64).optional(),
  /** build a NEW deck in this brand kit's colours, fonts and logo (validated against the user + plan when the job was created) */
  brandKitId: z.string().max(32).optional(),
  /** rewrite THIS existing deck (keeps its id, title history and versions) instead of creating a new one */
  targetPresentationId: z.string().optional(),
  aspectRatio: z.enum(['16:9', '4:3', '1:1']).default('16:9'),
  /** keep every word of the existing deck and only replace its pictures (assistant "fix the pictures") */
  picturesOnly: z.boolean().default(false),
  sourceIds: z.array(z.string()).max(10).default([]),
})
type Checkpoint = { analysis?: PromptAnalysis; outline?: Outline; contents?: SlideContent[]; repaired?: boolean; designId?: string; report?: Record<string, unknown> }

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
 * The picture each slide needs (if any). `nth` counts layouts in slide order and decides the alternating shape of big-number slides, so a request for slide N is the same
 * whether it is built from the first N slides (while later ones are still being written) or from the whole deck.
 */
function pictureRequests(contents: SlideContent[], outline: Outline, analysis: PromptAnalysis): { index: number; req: PictureRequest }[] {
  const wanted: { index: number; req: PictureRequest }[] = []
  const nthOf: Record<string, number> = {}
  contents.forEach((c, index) => {
    const nth = (nthOf[c.layout] = (nthOf[c.layout] ?? -1) + 1)
    const aspect = c.layout === 'quote' ? 'tall' : c.layout === 'big-number' ? (nth % 2 === 0 ? 'square' : null) : c.layout === 'split-image-text' ? 'standard' : ['title', 'thank-you', 'section-divider'].includes(c.layout) ? 'wide' : null
    if (!aspect) return
    const entry = outline.slides[index]
    const intent = entry?.imageIntent || (c.layout === 'split-image-text' ? c.imagePrompt : '') || ('title' in c && c.title ? c.title : analysis.topic)
    wanted.push({ index, req: { slideIndex: index, layout: c.layout, title: ('title' in c && c.title) || analysis.topic, text: textOf(c).join(' ').slice(0, 600), intent: String(intent).slice(0, 200), topic: analysis.topic, category: analysis.category ?? 'strategy', aspect, ...(entry?.imageQuery ? { query: entry.imageQuery } : {}) } })
  })
  return wanted
}

/**
 * prompt → analysis → outline → slide content → layout → validation → persist.
 * Every stage output is checkpointed, so a retry (crash, lease expiry, transient AI failure) resumes where it
 * stopped and never re-pays for finished stages. Persisting is a single transaction guarded by the job row,
 * so a job can never produce two decks.
 */
export async function runGeneration(jobId: string): Promise<void> {
  const hold: { pictures?: PictureSession } = {}
  try {
    await generate(jobId, hold)
  } finally {
    hold.pictures?.close() // whatever picture lookups are still running stop here, whether the job finished, failed or was cancelled
  }
}

async function generate(jobId: string, hold: { pictures?: PictureSession }): Promise<void> {
  const [job] = await db.select().from(generationJob).where(eq(generationJob.id, jobId))
  if (!job || ['completed', 'failed', 'cancelled'].includes(job.status)) return
  const ctx = { userId: job.userId, jobId }
  const opts = optionsSchema.parse(job.options)
  const cp: Checkpoint = { ...(job.checkpoint as Checkpoint) }

  // Remix: the user's own deck is the content (it arrives as a source); only its look is carried over, and the model is told to stay inside it
  let remixDoc: Presentation | undefined
  if (opts.remixOf) {
    const [t] = await db.select({ doc: presentationVersion.document }).from(presentation).innerJoin(presentationVersion, and(eq(presentationVersion.presentationId, presentation.id), eq(presentationVersion.version, presentation.latestVersion))).where(and(eq(presentation.id, opts.remixOf), eq(presentation.userId, job.userId)))
    remixDoc = t?.doc as Presentation | undefined
  }
  const prompt = remixDoc ? remixPrompt(job.prompt, remixDoc.title, remixDoc.language, opts.slideCount) : job.prompt

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
  // a remix cites nothing: its working source is temporary, so no slide may point to it (the citations would dangle)
  const knownIds = new Set(remixDoc ? [] : sources.map((s) => s.id))
  const userTexts = [prompt, ...sources.map((s) => s.text)]
  const allowNumeric = hasNumbers(prompt, sources.map((s) => s.text))
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
      const chosen = deckLanguage(opts.language)
      const found = opts.analysis ?? (await gateway.run({ route: 'fast', requestType: 'prompt_analysis', ...analyzePrompt(prompt, chosen), schema: promptAnalysisSchema, ctx }))
      cp.analysis = chosen ? { ...found, language: chosen.code } : found
      await saveCheckpoint(jobId, cp)
    }
    analysis = cp.analysis
    const slideCount = resolveSlideCount(analysis, opts.direction as Direction | undefined, opts.slideCount)

    // 2 ─ outline
    await stage(jobId, 'outlining', 15)
    if (!cp.outline) {
      const raw = await gateway.run({ route: tierRoute, model: opts.model, requestType: 'outline_generation', ...outlinePrompt({ analysis, direction: opts.direction, slideCount, allowNumericLayouts: allowNumeric, sources, userPrompt: prompt }), schema: outlineSchema, ctx })
      cp.outline = sanitizeOutline(raw, slideCount, allowNumeric)
      await saveCheckpoint(jobId, cp)
    }
    outline = cp.outline

    // Pictures are looked up ALONGSIDE the writing, not after it. The outline already says what each picture should show, so the main stock search and the first
    // photo downloads start now; each slide's own lookup (with its vision check) starts the moment its text exists.
    hold.pictures = await openPictureSession({ userId: job.userId, jobId })
    const early = outline.slides.map((e) => ({ layout: e.layout, title: e.title }) as unknown as SlideContent)
    for (const w of pictureRequests(early, outline, analysis)) if (outline.slides[w.index]?.imageIntent || outline.slides[w.index]?.imageQuery) hold.pictures.warm(w.req)

    // 3 ─ slide content, in batches (a failed batch retries alone; finished batches are checkpointed)
    contents = cp.contents ?? []
    /** start the picture lookup of every slide from `from` on, using the slides written so far */
    const startPictures = (from: number) => { for (const w of pictureRequests(contents, outline, analysis)) if (w.index >= from) hold.pictures?.add(w.req) }
    startPictures(0) // slides an earlier attempt of this job already wrote
    if (contents.length < outline.slides.length) {
      // Each batch prompt is built from the outline (never from another batch's text), so batches are independent and run side by side.
      const batches: { from: number; slides: typeof outline.slides }[] = []
      for (let from = contents.length; from < outline.slides.length; from += BATCH) batches.push({ from, slides: outline.slides.slice(from, from + BATCH) })
      const finished = new Map<number, SlideContent[]>()
      let nextBatch = 0
      let saved: Promise<void> = Promise.resolve() // writes happen one at a time, in order, so an older snapshot can never land after a newer one
      await stage(jobId, 'generating', 30)
      await runPool(batches, PARALLEL_CALLS, async (b) => {
        const { slides } = await gateway.run({
          route: tierRoute, model: opts.model, requestType: 'slide_content',
          ...slidesPrompt({ analysis, deckTitle: outline.title, outlineSlides: b.slides, startIndex: b.from, totalSlides: outline.slides.length, sources }),
          schema: z.object({ slides: z.array(slideContentSchema).length(b.slides.length) }), ctx,
        })
        return slides.map((s) => sanitizeContent(s, knownIds, allowNumeric))
      }, async (result, i) => {
        finished.set(i, result)
        // keep only the unbroken run of finished batches: a retry resumes right after it and never repeats paid work
        const before = contents.length
        while (finished.has(nextBatch)) { contents.push(...finished.get(nextBatch)!); nextBatch++ }
        startPictures(before) // these slides' pictures are looked up while the other batches, the critic and the repairs are still running
        cp.contents = contents
        saved = saved.then(async () => { await saveCheckpoint(jobId, cp); await stage(jobId, 'generating', 30 + Math.round((contents.length / outline.slides.length) * 40)) })
        await saved
      })
    }

    // 3b ─ quality gate (code, not prompt): invented numbers, sample leakage, empty/duplicate slides, uncovered topics.
    // One repair pass rewrites the offending slides with the exact problem; what still fails is fixed deterministically or reported.
    await stage(jobId, 'validating', 74)
    const rewriteSlides = async (todo: { slide: number; problem: string }[]) => {
      const bySlide = new Map<number, string[]>()
      for (const t of todo) bySlide.set(t.slide, [...(bySlide.get(t.slide) ?? []), t.problem])
      // each rewrite is independent (one slide, its own problems), so they run side by side
      await runPool([...bySlide], PARALLEL_CALLS, async ([n, problems]) => {
        const entry = outline.slides[n - 1]
        if (!entry) return
        const { slides } = await gateway.run({
          route: tierRoute, model: opts.model, requestType: 'slide_content',
          ...slidesPrompt({ analysis, deckTitle: outline.title, outlineSlides: [entry], startIndex: n - 1, totalSlides: outline.slides.length, sources, repair: problems.map((problem) => ({ slide: 1, problem })) }),
          schema: z.object({ slides: z.array(slideContentSchema).length(1) }), ctx,
        })
        contents[n - 1] = sanitizeContent(slides[0]!, knownIds, allowNumeric)
      })
    }
    let issues: QualityIssue[] = checkContents(contents, { userTexts, analysis })
    if (!cp.repaired) {
      let todo = repairRequests(issues)
      // premium/frontier plans also get a second model reading the whole deck against the brief
      if (opts.tier !== 'starter') {
        try {
          const critic = await gateway.run({ route: 'quality', model: opts.model, requestType: 'deck_critic', ...criticPrompt({ analysis, userPrompt: prompt, slides: contents.map((c) => textOf(c).join(' | ').slice(0, 600)) }), schema: z.object({ defects: z.array(z.object({ slide: z.number().int().min(1).max(60), issue: z.string().max(240) })).max(8).default([]) }), ctx })
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
  const wanted = pictureRequests(contents, outline, analysis)
  // pictures-only jobs have no writing phase, so their session opens here; for new decks it has been running since the outline
  hold.pictures ??= await openPictureSession({ userId: job.userId, jobId })
  // A slide whose text did not change since its lookup started keeps that lookup (nothing is repeated); one the repair pass rewrote is looked up again against its new text.
  for (const w of wanted) hold.pictures.add(w.req)
  const picked = await Promise.all(wanted.map((w) => hold.pictures!.result(w.index)))
  const picks: (Photo | null | undefined)[] = contents.map(() => undefined)
  wanted.forEach((w, k) => { const p = picked[k]; picks[w.index] = p ? { src: p.src, alt: p.alt, ...(p.attribution ? { attribution: p.attribution } : {}) } : null })
  // a picture+text slide with no picture becomes a plain text slide (never an empty frame)
  contents = contents.map((c, i) => (c.layout === 'split-image-text' && picks[i] === null ? ({ layout: 'title-body', title: c.title, bullets: c.bullets, speakerNotes: c.speakerNotes, sources: c.sources } as SlideContent) : c))
  cp.report = { ...(cp.report as object), pictures: { slots: wanted.length, placed: picks.filter(Boolean).length, missing: wanted.filter((w) => !picks[w.index]).map((w) => w.index), stockBlocked: hold.pictures.blocked(), unsplashRequests: hold.pictures.stats() } }

  // 5 ─ layout (deterministic) in the design, then validation (+ one condense-and-retry pass for overflow)
  // A NEW deck gets the template that fits ITS topic (one small model call over the category's shortlist, remembered in the checkpoint so a retry never repeats it);
  // a rewrite or remix keeps the existing deck's look and never asks.
  const keepsLook = !!(existingDoc?.theme || remixDoc?.theme)
  if (!opts.designId && !keepsLook && !cp.designId) {
    cp.designId = (await chooseDesign({ analysis, prompt, premiumAllowed: opts.premiumTemplates, ctx })).id
    await saveCheckpoint(jobId, cp)
  }
  let design = (opts.designId ? designById(opts.designId) : undefined) ?? (cp.designId ? designById(cp.designId) : undefined) ?? pickDesign(analysis.category, opts.premiumTemplates, prompt)
  // Rewriting an existing deck keeps its look EXACTLY (theme: colours, fonts, style, motion — including any custom colours the user set)
  if (existingDoc?.theme) design = { ...((existingDoc.theme.templateId ? designById(existingDoc.theme.templateId) : undefined) ?? design), theme: existingDoc.theme }
  // a NEW deck takes its colours from the topic, dark by default; a rewrite keeps the existing deck's theme untouched (set above)
  if (remixDoc?.theme) design = { ...((remixDoc.theme.templateId ? designById(remixDoc.theme.templateId) : undefined) ?? design), theme: remixDoc.theme } // a remix keeps the original's look exactly (colours, fonts, brand logo)
  else if (!existingDoc?.theme) design = { ...design, theme: themeForAnalysis(design.theme, analysis, design.look) }
  // a NEW deck can be built in the user's brand kit (its own colours, fonts and logo replace the topic palette); a rewrite keeps the deck's look
  if (!existingDoc?.theme && !remixDoc?.theme && opts.brandKitId) { const kit = await getKit(job.userId, opts.brandKitId); if (kit) design = { ...design, theme: themeWithKit(design.theme, kit) } }
  const theme = design.theme
  const assetBase = `${env.WEB_URL}/template-assets`
  const sourceRefs = remixDoc ? [] : opts.picturesOnly && existingDoc ? existingDoc.sources : sources.map((s) => ({ id: s.id, type: (SOURCE_TYPES as readonly string[]).includes(s.type) ? (s.type as (typeof SOURCE_TYPES)[number]) : 'text', title: s.title.slice(0, 300), ...(s.url ? { url: s.url } : {}) }))
  const build = (cs: SlideContent[]): Presentation => {
    const composed = composeDeck(cs, design, opts.aspectRatio, () => nanoid(10), assetBase, analysis.category, picks).map((c): Slide => ({ id: nanoid(12), locked: false, validation: { status: 'pending', issues: [] }, ...c }))
    // pictures-only: hand-edited slides are kept exactly as they were, in their original positions
    let slides = composed
    if (opts.picturesOnly && existingDoc) { let k = 0; slides = existingDoc.slides.map((sl) => (sl.content && !sl.manual ? composed[k++]! : sl)) }
    return { schemaVersion: SCHEMA_VERSION, id: '', title: (opts.picturesOnly && existingDoc ? existingDoc.title : outline.title).slice(0, 200), aspectRatio: opts.aspectRatio, language: analysis.language, theme, sources: sourceRefs, slides }
  }
  await stage(jobId, 'validating', 92)
  let { doc, report } = applyValidation(build(contents))
  // a slide whose text overflowed, or could only be fitted in type smaller than 11 pt, gets its words shortened (one pass) instead of shipping tiny type
  if (report.errors > 0 || report.slides.some((s) => s.issues.some((i) => i.code === 'small_text'))) {
    const bad = new Set(report.slides.filter((s) => s.issues.some((i) => i.severity === 'error' || i.code === 'small_text')).map((s) => s.slideId))
    const fixed = contents.map((c, i) => (bad.has(doc.slides[i]!.id) ? condense(c) : c))
    ;({ doc, report } = applyValidation(build(fixed)))
  }

  // 6 ─ persist (transaction; the locked job row makes this idempotent)
  let published: { deck: string; rev: number } | null = null
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
      published = { deck: id, rev: p.revision + 1 }
    } else {
      await tx.insert(presentation).values({ id, userId: job.userId, title: doc.title, aspectRatio: doc.aspectRatio, latestVersion: 1 })
      await tx.insert(presentationVersion).values({ id: nanoid(), presentationId: id, version: 1, document: doc, createdBy: 'generation' })
    }
    await tx.update(generationJob).set({ status: 'completed', progress: 100, presentationId: id, updatedAt: new Date(), lockedUntil: null, checkpoint: { ...cp, report: { ...(cp.report as object), completeness: report.completeness, errors: report.errors, warnings: report.warnings } } }).where(eq(generationJob.id, jobId))
  })
  const pub = published as { deck: string; rev: number } | null
  if (pub) publishRevision(pub.deck, pub.rev, job.userId) // anyone editing the deck sees the rebuilt version
}
