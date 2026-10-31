import { Sparkles, X } from '@prompttoppt/ui/icons'
import { Portal } from '@/components/Portal'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, isGateError, type GeneratedImage, type ImageUsage, type ModelOption } from '@prompttoppt/api-client'
import type { Presentation, Slide } from '@prompttoppt/validation'
import type { ImageStyle } from '@prompttoppt/api-client'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { aspectFor, placeImage, STYLES } from '@/lib/images'
import { useDialog } from '@/lib/useDialog'

/**
 * "AI image": describe a picture → choose style, quality and where it goes → generate → preview → insert.
 * Everything that costs money is visible first: credits for the chosen quality and the deck/month picture allowance.
 * Limits, credits and plan gates are enforced by the server; this dialog just shows them.
 */
export function ImageDialog({ doc, slide, presentationId, request, onClose }: { doc: Presentation; slide: Slide; presentationId: string; request: { prompt?: string; elementId?: string }; onClose: () => void }) {
  const apply = useDoc((s) => s.apply)
  const { refresh, upgrade } = useEntitlements()
  const dialogRef = useDialog<HTMLDivElement>(true, () => attemptClose())
  const placements = useMemo(() => C.imagePlacements(slide, request.elementId), [slide, request.elementId])
  const selectedEl = slide.elements.find((e) => e.id === request.elementId && e.type === 'image')
  const [prompt, setPrompt] = useState(request.prompt ?? (selectedEl?.type === 'image' ? (selectedEl.prompt ?? '') : ''))
  const [style, setStyle] = useState<ImageStyle | 'none'>('none')
  const [placement, setPlacement] = useState<C.ImagePlacement>(placements[0]!.id)
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  const [usage, setUsage] = useState<ImageUsage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GeneratedImage | null>(null)
  const requestId = useRef(crypto.randomUUID())

  useEffect(() => {
    let off = false
    void api.models('image').then((r) => {
      if (off) return
      setModels(r.models)
      setModel((cur) => cur || r.default || '')
    }).catch(() => {})
    void api.imageUsage(presentationId).then((u) => !off && setUsage(u)).catch(() => {})
    return () => {
      off = true
    }
  }, [presentationId])

  const picked = models.find((m) => m.id === model)
  const deckLeft = usage ? usage.deck.max - usage.deck.used : null
  const monthLeft = usage ? usage.month.max - usage.month.used : null
  const exhausted = (deckLeft !== null && deckLeft <= 0) || (monthLeft !== null && monthLeft <= 0)
  const disabledReason = usage && !usage.enabled ? 'Picture generation is switched off right now.' : null

  function attemptClose() {
    if (result && !confirm('Discard this picture? The credits for it are already used.')) return
    onClose()
  }

  async function generate() {
    const p = prompt.trim()
    if (p.length < 3 || busy) return
    setBusy(true)
    setError(null)
    try {
      const img = await api.generateImage(presentationId, { prompt: p, ...(style !== 'none' ? { style } : {}), aspect: aspectFor(placement, doc.aspectRatio), ...(model ? { model } : {}), requestId: requestId.current })
      setResult(img)
      setUsage((u) => (u ? { ...u, ...img.usage } : u))
      void refresh()
    } catch (e) {
      if (isGateError(e) && e.code !== 'LIMIT_REACHED') upgrade.show(e.message)
      else setError(e instanceof ApiError ? e.message : 'Could not create the picture. You were not charged.')
      requestId.current = crypto.randomUUID() // a failed attempt was refunded; the next click is a new action
    } finally {
      setBusy(false)
    }
  }

  function insert() {
    if (!result) return
    const img = { url: result.url, alt: prompt.trim().slice(0, 140), prompt: prompt.trim() }
    apply('AI image', (d) => placeImage(d, slide, placement, img, request.elementId))
    onClose()
  }

  function again() {
    requestId.current = crypto.randomUUID()
    setResult(null)
  }

  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && attemptClose()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="AI image" className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-xl max-h-[92vh] overflow-y-auto outline-none">
        <div className="flex items-start justify-between mb-3">
          <h2 className="font-heading font-bold text-xl inline-flex items-center gap-2"><Sparkles aria-hidden size={20} />AI image</h2>
          <button onClick={attemptClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-2xl leading-none"><X aria-hidden size={24} /></button>
        </div>

        {result ? (
          <div className="space-y-4">
            <img src={result.url} alt={prompt} className="w-full rounded-xl border border-border bg-slate-100 max-h-[50vh] object-contain" />
            <p className="text-xs text-slate-500">Used {result.creditsCharged} credits · {result.usage.deck.used} of {result.usage.deck.max} pictures used in this presentation, {result.usage.month.used} of {result.usage.month.max} this month.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={insert} className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold">Use this picture</button>
              <button onClick={again} disabled={result.usage.deck.used >= result.usage.deck.max || result.usage.month.used >= result.usage.month.max} className="border border-border rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">Try again ({picked?.creditsPerImage ?? '?'} credits)</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium">What should the picture show?
              <textarea
                value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={500} autoFocus
                placeholder="e.g. a modern red electric hatchback on a coastal road at sunset"
                className="mt-1 w-full border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
              />
            </label>
            <p className="text-xs text-slate-500 -mt-2">Describe the scene, mood and colours. Pictures can&apos;t contain readable text, and they&apos;re AI artwork — not exact photos of a real product or person.</p>

            <div>
              <div className="text-sm font-medium mb-1">Style</div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Style">
                {STYLES.map((s) => <button key={s.id} aria-pressed={style === s.id} onClick={() => setStyle(s.id)} className={`text-xs rounded-full px-3 py-1 border ${style === s.id ? 'bg-primary text-white border-primary' : 'border-border hover:border-primary'}`}>{s.label}</button>)}
              </div>
            </div>

            <label className="block text-sm font-medium">Where does it go?
              <select value={placement} onChange={(e) => setPlacement(e.target.value as C.ImagePlacement)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-white text-sm">
                {placements.map((p) => <option key={p.id} value={p.id}>{p.label} — {p.hint}</option>)}
              </select>
            </label>

            <div>
              <div className="text-sm font-medium mb-1">Quality</div>
              <div className="grid gap-2" role="radiogroup" aria-label="Image quality">
                {models.map((m) => (
                  <button key={m.id} role="radio" aria-checked={model === m.id} disabled={!m.allowed} onClick={() => setModel(m.id)} className={`text-left border rounded-xl px-3 py-2 ${model === m.id ? 'border-primary bg-primary/5' : 'border-border'} disabled:opacity-60`}>
                    <div className="flex justify-between text-sm"><span className="font-medium">{m.displayName}</span><span className="text-slate-500">{m.creditsPerImage} credits</span></div>
                    <div className="text-xs text-slate-500">{m.allowed ? m.description : `${m.tier === 'frontier' ? 'Gold' : 'Pro'} plan required`}</div>
                  </button>
                ))}
              </div>
            </div>

            {usage && (
              <p className={`text-xs ${exhausted ? 'text-red-700' : 'text-slate-600'}`} role="status">
                This presentation: {usage.deck.used} of {usage.deck.max} pictures used · This month: {usage.month.used} of {usage.month.max}.
                {exhausted && ' You have reached your limit — upgrade for more.'}
              </p>
            )}
            {(error || disabledReason) && <p role="alert" className="text-sm bg-red-50 text-red-700 rounded-lg p-3">{error ?? disabledReason}</p>}
            <div className="flex items-center gap-3">
              <button onClick={() => void generate()} disabled={busy || prompt.trim().length < 3 || exhausted || !!disabledReason || !picked} className="bg-primary text-white rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-40">
                {busy ? 'Creating your picture… (10–20 s)' : `Generate${picked ? ` · ${picked.creditsPerImage} credits` : ''}`}
              </button>
              {exhausted && <button onClick={() => upgrade.show('You have reached your AI image limit.')} className="text-sm text-primary font-semibold underline">See plans</button>}
            </div>
            <p className="text-[11px] text-slate-500">Failed or refused requests are refunded automatically.</p>
          </div>
        )}
      </div>
    </div></Portal>
  )
}
