import { ArrowLeft, LayoutTemplate, Lock, Sparkles } from '@prompttoppt/ui/icons'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ApiError, isGateError, type AnalyzeResult, type BrandKit, type BrandTheme, type JobView, type ModelOption } from '@prompttoppt/api-client'
import type { Direction, MorphDecision, PromptAnalysis } from '@prompttoppt/validation'
import { BriefCard } from '@/components/BriefCard'
import { BuildProgress, ThoughtRow } from '@/components/BuildProgress'
import { ModelPicker } from '@/components/ModelPicker'
import { MorphTemplatePicker } from '@/components/MorphTemplatePicker'
import { MORPH_TEMPLATES } from '@prompttoppt/theme/morph-templates'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { clearPending, getPendingFileTemplate, getPendingJob, getPendingLanguage, getPendingMorphTemplate, getPendingPrompt, getPendingSources, setPendingJob, type PendingFileTemplate } from '@/lib/pending-prompt'

type Retry = { type: 'analyze' } | { type: 'start'; result: AnalyzeResult; slideCount: number; direction?: Direction | undefined } | { type: 'home' }

type Phase =
  | { kind: 'analyzing' }
  | { kind: 'error'; message: string; retry: Retry }
  | { kind: 'template' }
  | { kind: 'pick-direction'; result: AnalyzeResult }
  | { kind: 'pick-length'; result: AnalyzeResult; direction?: Direction }
  | { kind: 'generating'; job: JobView | null }

/** A deck from a template has the template's own slides: one fixed length. */
const templateLength = (id: string): readonly (readonly [string, number])[] => { const t = MORPH_TEMPLATES.find((x) => x.id === id); return t ? [[t.name, t.scenes.length]] : [] }

const errMessage = (e: unknown) =>
  e instanceof ApiError ? (e.code === 'LIMIT_REACHED' ? e.message : e.code === 'AI_NOT_CONFIGURED' ? 'AI is not configured on this server yet.' : e.message) : 'Something went wrong. Please try again.'

function Card({ children }: { children: ReactNode }) {
  return <div className="mt-8 bg-white rounded-2xl border border-border shadow-sm p-6">{children}</div>
}

/**
 * Step 2: understanding card → choose the LENGTH (just selects it, nothing starts) → choose an AI MODEL, which starts the build.
 * The model chooser is highlighted once a length is chosen, and the length buttons are highlighted if a model is clicked first.
 */
/** the look of the new deck: the default brand kit on a design picked for the topic, a theme made from a kit, or neither */
type BrandChoice = { kit: BrandKit | null; themes: BrandTheme[]; value: string; onChange: (v: string) => void }
function PickLength({ result, direction, models, modelId, choice, lengths, onStart, brand, morph }: { choice: boolean; morph?: MorphOption | undefined; brand?: BrandChoice | undefined; result: AnalyzeResult; direction?: Direction | undefined; models: ModelOption[]; modelId: string | null; lengths: readonly (readonly [string, number])[]; onStart: (slides: number, model?: string) => void }) {
  const [chosen, setChosen] = useState<number | null>(lengths.length === 1 ? lengths[0]![1] : null)
  const [nudge, setNudge] = useState(false)
  const fixed = !!result.analysis.slideCount
  return (
    <>
      <p className="mt-10 text-[17px]">{direction ? <>Great — <b>{direction.title}</b>. </> : null}{choice ? (fixed ? 'Check what I understood, then pick an AI model to start.' : 'Check what I understood, choose the length, then pick an AI model to start.') : (fixed ? 'Check what I understood, then start.' : 'Check what I understood, then choose the length to start.')}</p>
      <div className="mt-4"><BriefCard analysis={result.analysis} /></div>
      {morph && (morph.allowed ? (
        <label className={`mt-6 flex items-start gap-3 bg-white border rounded-xl px-4 py-3 w-fit max-w-full cursor-pointer ${morph.checked ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}>
          <input type="checkbox" className="mt-1" checked={morph.checked} onChange={(e) => morph.onChange(e.target.checked)} aria-label="Morph animation" />
          <span className="text-sm"><span className="flex items-center gap-1.5 font-semibold"><Sparkles aria-hidden size={15} /> Morph animation</span><span className="block text-slate-600">Slides built from the same pieces, which move and morph into each other when you present.</span></span>
        </label>
      ) : (
        <button type="button" onClick={morph.onLocked} className="mt-6 flex items-start gap-3 bg-white border border-border rounded-xl px-4 py-3 w-fit max-w-full text-left" aria-label="Morph animation (Gold plan)">
          <Lock aria-hidden size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <span className="text-sm"><span className="flex items-center gap-2 font-semibold">Morph animation <span className="text-xs rounded-full bg-slate-100 border border-border px-2 py-0.5 font-medium text-slate-700">Gold</span></span><span className="block text-slate-600">Slides built from the same pieces, which move and morph into each other when you present.</span></span>
        </button>
      ))}
      {morph?.allowed && morph.checked && <MorphTemplatePicker value={morph.template} onChange={morph.onTemplate} maxSlides={morph.maxSlides} auto={morph.auto} fromWebsite={!!morph.fromWebsite} />}
      <div role="radiogroup" aria-label="Presentation length" className={`mt-6 flex flex-wrap gap-3 rounded-2xl ${nudge && chosen === null ? 'ring-2 ring-primary p-2 -m-2 animate-pulse-soft' : ''}`}>
        {lengths.map(([label, n]) => (
          <button key={label} role="radio" aria-checked={chosen === n} disabled={!!morph?.checked && (morph.auto.loading)} title={morph?.checked && morph.auto.loading ? 'Choosing the best template for your topic…' : undefined} onClick={() => { setChosen(n); setNudge(false); if (!choice) onStart(n, modelId ?? undefined) /* the plan decides the model: choosing the length starts the build */ }} className={`bg-white border rounded-xl px-5 py-3 text-left transition disabled:opacity-50 disabled:cursor-wait ${chosen === n ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-slate-400'}`}>
            <div className="font-semibold">{label}</div>
            <div className="text-sm text-slate-500">{n} slides</div>
          </button>
        ))}
      </div>
      {morph?.checked && morph.template && morph.leftOut.length > 0 && <p className="mt-2 text-sm text-slate-600" data-testid="morph-left-out">Left out of this template because your request gives no {morph.leftOut.length === 1 ? 'details for it' : 'details for them'}: {morph.leftOut.join(', ')}.</p>}
      {brand && brand.themes.length === 0 && brand.kit && (
        <label className="mt-5 flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 w-fit cursor-pointer">
          <input type="checkbox" checked={brand.value === 'kit'} onChange={(e) => brand.onChange(e.target.checked ? 'kit' : 'none')} aria-label="Build it in my brand" />
          <span className="text-sm">Build it in my brand: <b>{brand.kit.name}</b></span>
          <span className="flex gap-1" aria-hidden>{[brand.kit.colors.primary, brand.kit.colors.accent].filter((c): c is string => !!c).map((c) => <span key={c} style={{ background: c }} className="w-4 h-4 rounded-full border border-border" />)}</span>
          {brand.kit.logo && <img src={brand.kit.logo.url} alt="" className="h-5 max-w-[60px] object-contain" />}
        </label>
      )}
      {brand && brand.themes.length > 0 && (
        // with themes made from a kit (Brand tab): the whole look of the new deck can be one of them
        <label className="mt-5 flex items-center gap-3 bg-white border border-border rounded-xl px-4 py-3 w-fit text-sm">
          Look
          <select aria-label="Look of the presentation" value={brand.value} onChange={(e) => brand.onChange(e.target.value)} className="border border-border rounded-lg px-2 py-1.5 bg-white">
            <option value="none">A design picked for the topic</option>
            {brand.kit && <option value="kit">My brand: {brand.kit.name} (design picked for the topic)</option>}
            {brand.themes.map((t) => <option key={t.id} value={t.id}>Theme: {t.name} ({t.designName}, {t.mode})</option>)}
          </select>
        </label>
      )}
      {nudge && chosen === null && <p role="alert" className="mt-2 text-sm text-primary font-medium">Pick a length first, then choose the AI model to start.</p>}
      {choice ? <ModelPicker
        models={models} value={modelId}
        highlight={chosen !== null}
        hint={chosen !== null ? `${chosen} slides selected — click an AI model to start (the highlighted one is your default).` : undefined}
        onChange={(id) => { if (chosen === null) setNudge(true); else onStart(chosen, id) }}
      /> : fixed && <button onClick={() => onStart(lengths[0]![1], modelId ?? undefined)} className="mt-6 bg-primary text-white rounded-xl px-6 py-3 font-semibold">Start</button>}
    </>
  )
}

/** The Morph choice on the length step: shown to every plan, switchable on Gold and Premium, an upgrade prompt on the others. */
interface MorphOption {
  allowed: boolean; checked: boolean; onChange: (v: boolean) => void; onLocked: () => void; template: string | null; fromWebsite?: boolean; onTemplate: (id: string | null) => void
  /** slides one deck may have on this plan (a template longer than that cannot be chosen) */
  maxSlides: number
  /** scenes of the chosen template this request cannot fill (they are left out of the deck): shown under the length buttons */
  leftOut: string[]
  /** "Best match for my topic": the template chosen from the request (never on by default) */
  auto: { on: boolean; loading: boolean; decision: MorphDecision | null; failed: boolean; onChange: (on: boolean) => void }
}

/**
 * "Use a file's design": the deck is made in the look of the person's uploaded file. Choose who writes the words (the AI from the request, or the person in the editor), the length (default: the
 * file's own number of slides) and, on plans that choose, the AI model. No analysis step is needed: the server reads the request itself.
 */
function TemplateStart({ tpl, prompt, models, modelId, choice, maxSlides, onStart }: { tpl: PendingFileTemplate; prompt: string; models: ModelOption[]; modelId: string | null; choice: boolean; maxSlides: number; onStart: (o: { mode: 'ai' | 'manual'; slideCount?: number; model?: string }) => void }) {
  const [mode, setMode] = useState<'ai' | 'manual'>(tpl.preferManual ? 'manual' : 'ai')
  const [count, setCount] = useState(Math.min(tpl.slideCount, maxSlides))
  const n = Math.max(3, Math.min(maxSlides, Math.round(count) || tpl.slideCount))
  const go = (model?: string) => onStart({ mode, ...(count !== tpl.slideCount && n !== tpl.slideCount ? { slideCount: n } : {}), ...(model ? { model } : {}) })
  const opt = (id: 'ai' | 'manual', title: string, text: string) => (
    <button type="button" role="radio" aria-checked={mode === id} data-testid={`tpl-mode-${id}`} onClick={() => setMode(id)} className={`flex-1 min-w-[220px] bg-white border rounded-xl px-4 py-3 text-left transition ${mode === id ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-slate-400'}`}>
      <div className="font-semibold">{title}</div><div className="text-sm text-slate-600">{text}</div>
    </button>
  )
  return (
    <>
      <p className="mt-10 text-[17px]" data-testid="tpl-using"><LayoutTemplate aria-hidden size={18} className="inline -mt-0.5 mr-1.5 text-primary" />Using your template: <b>{tpl.name}</b> <span className="text-slate-500">({tpl.slideCount} slide{tpl.slideCount === 1 ? '' : 's'})</span></p>
      {tpl.fontsReplaced.length > 0 && <p className="mt-1 text-sm text-amber-700">Fonts replaced: {tpl.fontsReplaced.map((f) => `${f.original} → ${f.mapped}`).join(', ')}.</p>}
      <p className="mt-2 text-sm text-slate-600">Your presentation keeps the file's colours, fonts and layouts. The words and photos of the original are never copied.</p>
      <div role="radiogroup" aria-label="Who writes the words?" className="mt-5 flex flex-wrap gap-3">
        {opt('ai', 'Write it for me', 'The AI writes the words for your request, in your file\'s layouts.')}
        {opt('manual', "I'll add the data myself", 'You get the slides with "Add your title" style boxes to type into. No AI, no credits.')}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" htmlFor="tpl-count">Slides</label>
        <input id="tpl-count" data-testid="tpl-count" type="number" min={3} max={maxSlides} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20 rounded-lg border border-border bg-white px-3 py-1.5 text-sm" />
        <span className="text-sm text-slate-500">{count === tpl.slideCount ? "same as your template" : `your template has ${tpl.slideCount}; layouts repeat or are left out to fit`}</span>
      </div>
      {/* the Morph choice, greyed with its reason */}
      <div aria-disabled className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-slate-50 px-4 py-3 w-fit max-w-full opacity-70" data-testid="tpl-morph-off">
        <Lock aria-hidden size={16} className="mt-0.5 shrink-0 text-slate-500" />
        <span className="text-sm"><span className="font-semibold">Morph animation</span><span className="block text-slate-600">Not available with your own design: Morph decks are built from their own pieces.</span></span>
      </div>
      {mode === 'ai' && choice ? (
        <ModelPicker models={models} value={modelId} highlight hint="Click an AI model to start (the highlighted one is your default)." onChange={(id) => go(id)} />
      ) : (
        <button type="button" data-testid="tpl-start" onClick={() => go()} className="mt-6 bg-primary text-white rounded-xl px-6 py-3 font-semibold">{mode === 'ai' ? 'Start' : 'Create the slides'}</button>
      )}
      {mode === 'manual' && prompt && <p className="mt-3 text-xs text-slate-500">Your request is not used in this mode.</p>}
    </>
  )
}

export function CreatePage() {
  const navigate = useNavigate()
  const { ent, upgrade, refresh } = useEntitlements()
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelId, setModelId] = useState<string | null>(null)
  const [choice, setChoice] = useState(false)
  const prompt = getPendingPrompt()
  const [fileTpl] = useState(getPendingFileTemplate)
  const [phase, setPhase] = useState<Phase>(getPendingJob() ? { kind: 'generating', job: null } : fileTpl ? { kind: 'template' } : { kind: 'analyzing' })
  /** how many slides of the deck being built are written (reported by the progress list): the editor can be opened early once there is one */
  const [written, setWritten] = useState(0)
  /** "Thinking" → "Thought for 6s": when the request was sent to be understood, how long that took and what came back (shown above every later step) */
  const [thought, setThought] = useState<{ startedAt: number; tookMs: number | null; analysis: PromptAnalysis | null } | null>(null)
  /** The deck is being opened. The editor loads on demand, so for a moment this screen is still shown after the pending request is cleared: it must not take that for "nothing to do here" and send the person Home. */
  const [leaving, setLeaving] = useState(false)
  const openDeck = useCallback((deckId: string) => { setLeaving(true); clearPending(); void refresh(); navigate(`/edit/${deckId}`, { replace: true }) }, [navigate, refresh])
  // (Re)load the model list whenever the plan changes, so an upgrade unlocks models immediately.
  useEffect(() => {
    let cancelled = false
    api.models().then((r) => {
      if (cancelled) return
      setModels(r.models)
      setChoice(r.choice)
      setModelId((cur) => (cur && r.models.some((m) => m.id === cur && m.allowed) ? cur : r.default))
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [ent?.plan.id])
  const started = useRef(false)
  const idemKey = useRef(crypto.randomUUID())
  /** the user's default brand kit (paid plans): offered as "build it in my brand", on unless they turn it off */
  const [defaultKit, setDefaultKit] = useState<BrandKit | null>(null)
  /** themes made from a brand kit: one of them can be the whole look of the new deck */
  const [brandThemes, setBrandThemes] = useState<BrandTheme[]>([])
  /** 'kit' = the default kit on a design picked for the topic, 'none', or a brand theme's id */
  const [look, setLook] = useState('kit')
  /** the template chosen before this screen (the website's "Use this template"): kept in storage and also in the address (/create?morphTemplate=…), so a refresh or a lost storage cannot drop it */
  const [arrivedTpl] = useState<string | null>(() => { const id = getPendingMorphTemplate() ?? new URLSearchParams(window.location.search).get('morphTemplate'); return id && MORPH_TEMPLATES.some((t) => t.id === id) ? id : null })
  const [morph, setMorph] = useState(() => !!arrivedTpl)
  /** a designed Morph template to build the deck from (null: the AI plans the scenes). Arrives from the website's template pages. */
  const [morphTpl, setMorphTpl] = useState<string | null>(arrivedTpl)
  useEffect(() => {
    api.brandKits().then((r) => setDefaultKit(r.kits.find((k) => k.isDefault) ?? null)).catch(() => {})
    api.brandThemes().then((r) => setBrandThemes(r.themes)).catch(() => {})
  }, [])

  const analyze = useCallback(async () => {
    if (!prompt) return
    setPhase({ kind: 'analyzing' })
    const startedAt = Date.now()
    setThought({ startedAt, tookMs: null, analysis: null })
    try {
      const result = await api.analyze(prompt, getPendingSources(), getPendingLanguage())
      setThought({ startedAt, tookMs: Date.now() - startedAt, analysis: result.analysis })
      setPhase(result.mode === 'broad' && result.directions ? { kind: 'pick-direction', result } : { kind: 'pick-length', result })
    } catch (e) {
      setThought(null)
      setPhase({ kind: 'error', message: errMessage(e), retry: { type: 'analyze' } })
    }
  }, [prompt])

  useEffect(() => {
    if (started.current || getPendingJob() || fileTpl) return // StrictMode runs effects twice in dev (a deck in your own design needs no analysis step)
    started.current = true
    void analyze()
  }, [analyze, fileTpl])

  const startFromTemplate = useCallback(async (o: { mode: 'ai' | 'manual'; slideCount?: number; model?: string }) => {
    if (!prompt || !fileTpl) return
    setPhase({ kind: 'generating', job: null })
    try {
      const job = await api.createJob({ prompt, fromTemplateId: fileTpl.id, templateMode: o.mode, sourceIds: getPendingSources(), ...(getPendingLanguage() ? { language: getPendingLanguage()! } : {}), ...(o.slideCount ? { slideCount: o.slideCount } : {}), ...((o.model ?? modelId) && o.mode === 'ai' ? { model: (o.model ?? modelId)! } : {}), idempotencyKey: idemKey.current })
      setPendingJob(job.id)
      setPhase({ kind: 'generating', job })
    } catch (e) {
      if (isGateError(e)) { upgrade.show(e.message, e.code); setPhase({ kind: 'template' }); return }
      setPhase({ kind: 'error', message: errMessage(e), retry: { type: 'home' } })
    }
  }, [prompt, fileTpl, modelId, upgrade])

  const start = useCallback(
    async (result: AnalyzeResult, slideCount: number, direction?: Direction, modelOverride?: string) => {
      if (!prompt) return
      setPhase({ kind: 'generating', job: null })
      try {
        const job = await api.createJob({ prompt, analysis: result.analysis, slideCount, sourceIds: getPendingSources(), ...(getPendingLanguage() ? { language: getPendingLanguage()! } : {}), ...((modelOverride ?? modelId) ? { model: (modelOverride ?? modelId)! } : {}), ...(direction ? { direction } : {}), ...(defaultKit && look === 'kit' ? { brandKitId: defaultKit.id } : brandThemes.some((t) => t.id === look) ? { brandThemeId: look } : {}), ...(morph && ent?.features.morph ? { morph: true, ...(morphTpl ? { morphTemplate: morphTpl } : {}) } : {}), idempotencyKey: idemKey.current })
        setPendingJob(job.id)
        // a new deck exists from the first second, but the person watches the progress screen while it is written (its slides tick off in a list) and the editor
        // opens by itself when the deck is complete, or earlier if they choose ("Open the editor now")
        setPhase({ kind: 'generating', job })
      } catch (e) {
        if (isGateError(e)) {
          upgrade.show(e.message) // server refused (plan/credits/limit): show the upgrade path, keep the choices
          setPhase(result.mode === 'broad' && result.directions ? { kind: 'pick-length', result, ...(direction ? { direction } : {}) } : { kind: 'pick-length', result })
          return
        }
        setPhase({ kind: 'error', message: errMessage(e), retry: { type: 'start', result, slideCount, direction } })
      }
    },
    [prompt, upgrade, modelId, defaultKit, look, brandThemes, morph, morphTpl, ent],
  )

  const onRetry = (r: Retry) => (r.type === 'analyze' ? void analyze() : r.type === 'start' ? void start(r.result, r.slideCount, r.direction) : navigate('/', { replace: true }))

  /** "Best match for my topic" is chosen by the person (never on by default); the answer comes from the server, which knows the plan's limits */
  const [morphAuto, setMorphAuto] = useState(false)
  const [match, setMatch] = useState<{ key: string; decision: MorphDecision | null } | null>(null)
  const matchAnalysis = phase.kind === 'pick-length' ? phase.result.analysis : null
  const matchKey = morph && morphAuto && matchAnalysis && prompt ? JSON.stringify([prompt, matchAnalysis]) : null
  const matchDone = matchKey && match?.key === matchKey ? match : null
  useEffect(() => {
    if (!matchKey || !matchAnalysis || !prompt || match?.key === matchKey) return
    let off = false
    api.matchMorph(prompt, matchAnalysis)
      .then((decision) => { if (off) return; setMatch({ key: matchKey, decision }); setMorphTpl(decision.mode === 'template' ? decision.templateId ?? null : null) })
      .catch(() => { if (off) return; setMatch({ key: matchKey, decision: null }); setMorphTpl(null) }) // the deck is then designed from the topic: never held up
    return () => { off = true }
  }, [matchKey, matchAnalysis, prompt, match?.key])
  /** the lengths a deck from the chosen template can have for THIS request (the server knows what the request can fill and the plan's limits) */
  const [tplLen, setTplLen] = useState<{ key: string; lengths: number[]; leftOut: string[] } | null>(null)
  const tplLenKey = morph && morphTpl && matchAnalysis && prompt ? `${morphTpl}|${JSON.stringify([prompt, matchAnalysis])}` : null
  const tplLenDone = tplLenKey && tplLen?.key === tplLenKey ? tplLen : null
  useEffect(() => {
    if (!tplLenKey || !morphTpl || !matchAnalysis || !prompt || tplLen?.key === tplLenKey) return
    let off = false
    api.morphLengths(morphTpl, prompt, matchAnalysis)
      .then((r) => { if (!off) setTplLen({ key: tplLenKey, lengths: r.lengths, leftOut: r.leftOut.map((x) => x.title) }) })
      .catch(() => { if (!off) setTplLen({ key: tplLenKey, lengths: [], leftOut: [] }) }) // then the template's full length is offered, and the server checks it again
    return () => { off = true }
  }, [tplLenKey, morphTpl, matchAnalysis, prompt, tplLen?.key])
  const tplLengths = (id: string): readonly (readonly [string, number])[] => {
    const full = templateLength(id)
    const ls = tplLenDone?.lengths ?? []
    if (ls.length === 0) return full
    const name = full[0]?.[0] ?? 'Template'
    if (ls.length === 1) return [[name, ls[0]!]]
    const picks = [...new Set([ls[0]!, ls[Math.floor((ls.length - 1) / 2)]!, ls[ls.length - 1]!])]
    return picks.map((n, i) => [i === 0 ? 'Full deck' : i === picks.length - 1 ? 'Shortest' : 'Shorter', n] as const)
  }

  // Poll the job. Refreshing the page resumes here via the stored job id.
  const jobId = phase.kind === 'generating' ? (phase.job?.id ?? getPendingJob()) : null
  useEffect(() => {
    if (!jobId) return
    let stop = false
    const tick = async () => {
      try {
        const job = await api.getJob(jobId)
        if (stop) return
        if (job.status === 'completed' && job.presentationId) { // the whole deck is written (also after a page refresh mid-generation): open it
          openDeck(job.presentationId)
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          // slides written before a failure are kept: open them rather than losing the work. (A cancel, or a deck with nothing written, is gone: the person is told.)
          if (job.status === 'failed' && job.presentationId && await api.getPresentation(job.presentationId).then(() => true, () => false)) { if (!stop) openDeck(job.presentationId); return }
          setPendingJob(null)
          idemKey.current = crypto.randomUUID()
          setPhase({ kind: 'error', message: job.error ?? 'Generation was cancelled.', retry: { type: 'home' } })
        } else setPhase({ kind: 'generating', job })
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setPendingJob(null)
          navigate('/', { replace: true })
        }
      }
    }
    void tick()
    const t = setInterval(tick, 1500)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [jobId, navigate, openDeck])

  if (!leaving && !prompt && !getPendingJob()) return <Navigate to="/" replace />

  const lengths = (r: AnalyzeResult, d?: Direction) => {
    // A slide count the user wrote in their prompt is an instruction, not a suggestion: offer exactly that.
    if (r.analysis.slideCount) return [['As you asked', Math.min(r.maxSlides, r.analysis.slideCount)]] as const
    const std = d?.suggestedSlideCount ?? r.suggestedSlideCount
    return [['Short', Math.max(4, Math.min(6, std - 2))], ['Standard', std], ['Detailed', Math.min(r.maxSlides, std + 5)]] as const
  }

  return (
    <div className="min-h-screen bg-[#f6f6f6] relative">
      <button onClick={() => navigate('/')} aria-label="Back" className="absolute top-5 left-5 w-10 h-10 rounded-full bg-white border border-border grid place-items-center hover:bg-slate-50"><ArrowLeft aria-hidden size={18} /></button>
      <main className="max-w-[820px] mx-auto pt-8 sm:pt-16 pb-16 sm:pb-24 px-4 sm:px-6">
        {prompt && <div className="ml-auto max-w-[85%] bg-[#ececec] rounded-2xl px-5 py-4 text-[17px] leading-relaxed whitespace-pre-wrap break-words">{prompt}</div>}

        {thought && phase.kind !== 'error' && <ThoughtRow startedAt={thought.startedAt} tookMs={thought.tookMs} analysis={thought.analysis} sources={getPendingSources().length} />}

        {phase.kind === 'error' && (
          <Card>
            <p role="alert" className="font-semibold mb-3">{phase.message}</p>
            <button onClick={() => onRetry(phase.retry)} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold">Try again</button>
          </Card>
        )}

        {phase.kind === 'template' && fileTpl && <TemplateStart tpl={fileTpl} prompt={prompt ?? ''} models={models} modelId={modelId} choice={choice} maxSlides={ent?.limits.maxSlides ?? 60} onStart={(o) => void startFromTemplate(o)} />}

        {phase.kind === 'pick-direction' && phase.result.directions && (
          <>
            <p className="mt-10 text-[17px]">Which angle should this presentation take?</p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              {phase.result.directions.map((d) => (
                <button key={d.id} onClick={() => setPhase({ kind: 'pick-length', result: phase.result, direction: d })} className="text-left bg-white border border-border rounded-xl p-4 hover:border-primary hover:shadow-sm transition">
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{d.description}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setPhase({ kind: 'pick-length', result: phase.result })} className="mt-4 text-sm text-slate-500 underline">Let AI decide</button>
          </>
        )}

        {phase.kind === 'pick-length' && (
          <PickLength
            key={morph && morphTpl ? morphTpl : 'ai'}
            result={phase.result}
            direction={phase.direction}
            models={models}
            modelId={modelId}
            choice={choice}
            lengths={morph && ent?.features.morph && morphTpl ? tplLengths(morphTpl) : lengths(phase.result, phase.direction)}
            onStart={(n, model) => { if (model) setModelId(model); void start(phase.result, n, phase.direction, model) }}
            brand={defaultKit || brandThemes.length ? { kit: defaultKit, themes: brandThemes, value: defaultKit || look !== 'kit' ? look : 'none', onChange: setLook } : undefined}
            morph={{ allowed: !!ent?.features.morph && (ent.usage.morphDecksThisPeriod < ent.features.morphDecksPerMonth), checked: morph, onChange: setMorph, template: morphTpl, fromWebsite: !!arrivedTpl, onTemplate: (id) => { setMorphAuto(false); setMorphTpl(id) }, maxSlides: ent?.limits.maxSlides ?? 10, leftOut: tplLenDone?.leftOut ?? [], auto: { on: morphAuto, loading: !!matchKey && !matchDone, decision: matchDone?.decision ?? null, failed: !!matchDone && !matchDone.decision, onChange: (on) => { setMorphAuto(on); if (!on) setMorphTpl(null) } }, onLocked: () => upgrade.show(ent?.features.morph ? `You've used your ${ent.features.morphDecksPerMonth} Morph decks for this month.` : 'Morph animation is available on the Gold plan.') }}
          />
        )}

        {phase.kind === 'generating' && (
          <section aria-label="Building your presentation" className="mt-2">
            {morph && morphTpl && <p className="mt-5 text-sm text-slate-600" data-testid="building-from-template">Building from the <b>{MORPH_TEMPLATES.find((t) => t.id === morphTpl)?.name ?? morphTpl}</b> template</p>}
            <BuildProgress status={phase.job?.status ?? null} deckId={phase.job?.presentationId ?? null} onCount={(w) => setWritten(w)} />
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 pl-7">
              {phase.job?.presentationId && written > 0 && (
                <button onClick={() => openDeck(phase.job!.presentationId!)} className="bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-slate-50">Open the editor now</button>
              )}
              {phase.job && <button onClick={() => void api.cancelJob(phase.job!.id)} className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2">Cancel</button>}
              {phase.job?.presentationId && written > 0 && <p className="w-full text-xs text-slate-500">The editor opens by itself when the deck is complete.</p>}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
