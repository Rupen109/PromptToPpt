import { useState } from 'react'
import { MORPH_TEMPLATES, type MorphCategory } from '@prompttoppt/theme/morph-templates'
import { WEB_URL } from '@/lib/env'

const FAMILIES: Record<MorphCategory, string> = { business: 'Business', pitch: 'Pitch', marketing: 'Marketing', launch: 'Launch', technology: 'Technology', education: 'Education' }

/** The poster of a template: a still of its cover, served (and cached for good) by the website. */
export const posterOf = (id: string) => `${WEB_URL}/morph-posters/${id}.webp`

/**
 * Choose how a Morph deck is made: planned by the AI from your topic (one picture, twelve kinds of scene), or built from one of the designed Morph templates (its own layout,
 * pictures and movement; the AI writes the words). `value` is the template id, or null for the AI-planned deck.
 */
export function MorphTemplatePicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const [family, setFamily] = useState<MorphCategory | 'all'>(() => MORPH_TEMPLATES.find((t) => t.id === value)?.category ?? 'all')
  const shown = MORPH_TEMPLATES.filter((t) => family === 'all' || t.category === family)
  const chosen = MORPH_TEMPLATES.find((t) => t.id === value)
  return (
    <div className="mt-4 w-full max-w-3xl" data-testid="morph-picker">
      <div className="text-sm font-semibold">Start from</div>
      <div role="radiogroup" aria-label="Morph deck style" className="mt-2 flex flex-wrap gap-2">
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={`rounded-lg border px-3 py-1.5 text-sm text-left ${value === null ? 'border-primary ring-2 ring-primary/25 bg-white' : 'border-border bg-white hover:border-slate-400'}`}>
          <b>AI plans it</b> <span className="text-slate-600">for your topic</span>
        </button>
        <span className="text-sm text-slate-500 self-center">or a designed template:</span>
      </div>
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
            <button type="button" role="radio" aria-checked={value === t.id} aria-label={`${t.name} template`} onClick={() => onChange(t.id)} className={`w-full overflow-hidden rounded-xl border bg-white text-left transition ${value === t.id ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-slate-400'}`}>
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
