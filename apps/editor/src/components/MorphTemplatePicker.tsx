import { useState } from 'react'
import { Sparkles } from '@prompttoppt/ui/icons'
import type { MorphDecision } from '@prompttoppt/validation'
import { MORPH_TEMPLATES, type MorphCategory } from '@prompttoppt/theme/morph-templates'
import { WEB_URL } from '@/lib/env'
import { SlideLoader } from '@/components/SlideLoader'

const FAMILIES: Record<MorphCategory, string> = { business: 'Business', pitch: 'Pitch', marketing: 'Marketing', launch: 'Launch', technology: 'Technology', education: 'Education' }

/** The poster of a template: a still of its cover, served (and cached for good) by the website. */
export const posterOf = (id: string) => `${WEB_URL}/morph-posters/${id}.webp`

/**
 * Choose how a Morph deck is made: planned by the AI from your topic (one picture, twelve kinds of scene), or built from one of the designed Morph templates (its own layout,
 * pictures and movement; the AI writes the words). `value` is the template id, or null for the AI-planned deck.
 */
export interface AutoMatch { on: boolean; loading: boolean; decision: MorphDecision | null; failed: boolean; onChange: (on: boolean) => void }

export function MorphTemplatePicker({ value, onChange, maxSlides = 60, auto, fromWebsite = false }: { value: string | null; onChange: (id: string | null) => void; /** the template was already chosen (on the website): show it as chosen, with a way to change it, instead of asking again */ fromWebsite?: boolean; /** slides one deck may have on this plan: a longer template is shown but cannot be chosen */ maxSlides?: number; auto?: AutoMatch }) {
  const [family, setFamily] = useState<MorphCategory | 'all'>(() => MORPH_TEMPLATES.find((t) => t.id === value)?.category ?? 'all')
  const shown = MORPH_TEMPLATES.filter((t) => family === 'all' || t.category === family)
  const chosen = MORPH_TEMPLATES.find((t) => t.id === value)
  const [open, setOpen] = useState(!(fromWebsite && value))
  if (!open && chosen) {
    return (
      <div className="mt-4 w-full max-w-3xl" data-testid="morph-picker-locked">
        <div className="text-sm font-semibold">Your template</div>
        <div className="mt-2 flex items-center gap-4 rounded-xl border border-primary ring-2 ring-primary/20 bg-white p-3">
          <img src={posterOf(chosen.id)} alt="" width={160} height={90} className="block w-40 aspect-video object-cover rounded-lg bg-slate-100 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight">{chosen.name}</div>
            <div className="text-xs text-slate-500">{FAMILIES[chosen.category ?? 'business']} · {chosen.scenes.length} slides</div>
            <p className="mt-1 text-sm text-slate-600" data-testid="morph-picker-note">{chosen.tagline}. Its layout, pictures and movement are used as they are; the AI writes the words for your topic.</p>
          </div>
          <button type="button" data-testid="morph-change" onClick={() => setOpen(true)} className="shrink-0 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium hover:border-slate-400">Change template</button>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-4 w-full max-w-3xl" data-testid="morph-picker">
      <div className="text-sm font-semibold">Start from</div>
      <div role="radiogroup" aria-label="Morph deck style" className="mt-2 flex flex-wrap gap-2">
        <button type="button" role="radio" aria-checked={value === null && !auto?.on} onClick={() => onChange(null)} className={`rounded-lg border px-3 py-1.5 text-sm text-left ${value === null && !auto?.on ? 'border-primary ring-2 ring-primary/25 bg-white' : 'border-border bg-white hover:border-slate-400'}`}>
          <b>AI plans it</b> <span className="text-slate-600">for your topic</span>
        </button>
        {auto && (
          <button type="button" role="radio" aria-checked={auto.on} data-testid="morph-auto" onClick={() => auto.onChange(true)} className={`rounded-lg border px-3 py-1.5 text-sm text-left inline-flex items-center gap-1.5 ${auto.on ? 'border-primary ring-2 ring-primary/25 bg-white' : 'border-border bg-white hover:border-slate-400'}`}>
            <Sparkles aria-hidden size={14} /><b>Best match</b> <span className="text-slate-600">for my topic</span>
          </button>
        )}
        <span className="text-sm text-slate-500 self-center">or choose a designed template:</span>
      </div>
      {auto?.on && <AutoCard auto={auto} onPick={onChange} />}
      <div role="tablist" aria-label="Template family" className="mt-2 flex flex-wrap gap-1.5">
        {(['all', ...Object.keys(FAMILIES)] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={family === f} onClick={() => setFamily(f as MorphCategory | 'all')} className={`rounded-full border px-3 py-1 text-xs font-medium ${family === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-border text-slate-700 hover:border-slate-400'}`}>
            {f === 'all' ? 'All' : FAMILIES[f as MorphCategory]}
          </button>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[22rem] overflow-y-auto pr-1" aria-label="Morph templates">
        {shown.map((t) => (
          <li key={t.id}>
            <button type="button" role="radio" aria-checked={value === t.id} aria-label={`${t.name} template`} disabled={t.scenes.length > maxSlides} title={t.scenes.length > maxSlides ? `This template has ${t.scenes.length} slides; your plan allows ${maxSlides} in one deck.` : undefined} onClick={() => onChange(t.id)} className={`w-full overflow-hidden rounded-xl border bg-white text-left transition disabled:opacity-45 disabled:cursor-not-allowed ${value === t.id ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-slate-400'}`}>
              <img src={posterOf(t.id)} alt="" loading="lazy" decoding="async" width={320} height={180} className="block w-full aspect-video object-cover bg-slate-100" />
              <span className="block px-3 py-2"><span className="block text-sm font-semibold leading-tight">{t.name}</span><span className="block text-xs text-slate-500">{FAMILIES[t.category ?? 'business']} · {t.scenes.length} slides</span></span>
            </button>
          </li>
        ))}
      </ul>
      {chosen && <p className="mt-2 text-sm text-slate-600" data-testid="morph-picker-note">{chosen.tagline}. Its layout, pictures and movement are used as they are; the AI writes the words for your topic. Contact details are left out unless you give them in your request.</p>}
    </div>
  )
}

/** What "Best match" decided, in words a person can check: the template and why, two other close ones to switch to, or that the deck will be designed for the topic. */
function AutoCard({ auto, onPick }: { auto: AutoMatch; onPick: (id: string | null) => void }) {
  const d = auto.decision
  const tpl = d?.mode === 'template' ? MORPH_TEMPLATES.find((t) => t.id === d.templateId) : undefined
  const others = (d?.candidates ?? []).filter((c) => c.id !== tpl?.id).slice(0, 2)
  return (
    <div className="mt-3 rounded-xl border border-border bg-white p-3" data-testid="morph-auto-card" aria-live="polite">
      {auto.loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-600"><SlideLoader size="sm" label="Finding the template that fits your topic…" /></div>
      ) : tpl ? (
        <div className="flex gap-3 items-start">
          <img src={posterOf(tpl.id)} alt="" width={160} height={90} className="w-32 sm:w-40 aspect-video object-cover rounded-lg bg-slate-100 border border-border shrink-0" />
          <div className="min-w-0 text-sm">
            <div className="font-semibold">{tpl.name} <span className="font-normal text-slate-500">· {tpl.scenes.length} slides</span></div>
            <p className="text-slate-600 mt-0.5" data-testid="morph-auto-reason">{d!.reason}</p>
            {others.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-slate-500">Also close:</span>{others.map((o) => <button key={o.id} type="button" onClick={() => onPick(o.id)} className="rounded-full border border-border px-2.5 py-1 hover:border-slate-400">{o.name} · {o.slides}</button>)}</div>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-700" data-testid="morph-auto-custom">{auto.failed ? 'Could not check the templates just now, so the AI will design your deck for the topic.' : d?.reason ?? 'No designed template fits this topic, so the AI will design your deck for it.'}</p>
      )}
    </div>
  )
}
