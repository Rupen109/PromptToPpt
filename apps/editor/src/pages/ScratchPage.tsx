import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PencilRuler } from '@prompttoppt/ui/icons'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import { CATEGORIES, DESIGNS } from '@prompttoppt/theme'
import type { AspectRatio } from '@prompttoppt/validation'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'

const SIZES: { id: AspectRatio; name: string; hint: string; box: string }[] = [
  { id: '16:9', name: 'Widescreen', hint: '16:9 · screens and projectors', box: 'w-16 h-9' },
  { id: '4:3', name: 'Standard', hint: '4:3 · classic slides and print', box: 'w-14 h-[42px]' },
  { id: '1:1', name: 'Square', hint: '1:1 · social posts', box: 'w-11 h-11' },
]

/** "Create from scratch": an empty slide in a look you pick (its colours and fonts), then the editor with every tool. No AI, no credits. */
export function ScratchPage() {
  const navigate = useNavigate()
  const { upgrade } = useEntitlements()
  const [title, setTitle] = useState('')
  const [aspect, setAspect] = useState<AspectRatio>('16:9')
  // a spread of free looks: the first free design of every category, light and dark mixed
  const looks = useMemo(() => CATEGORIES.map((c) => DESIGNS.find((d) => d.category === c.id && !d.premium)).filter((d): d is NonNullable<typeof d> => !!d), [])
  const [look, setLook] = useState(looks[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true); setError(null)
    try {
      const { id } = await api.createPresentation({ blank: true, templateId: look, title: title.trim() || 'Untitled presentation', aspectRatio: aspect })
      navigate(`/edit/${id}`)
    } catch (e) {
      if (isGateError(e)) upgrade.show(e.message)
      else setError(e instanceof ApiError ? e.message : 'Could not create the presentation.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen pt-14 lg:pt-0 bg-[#f6f7fb]">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-[980px]">
        <h1 className="font-heading font-bold text-3xl inline-flex items-center gap-3"><PencilRuler aria-hidden size={28} />Create from scratch</h1>
        <p className="text-slate-600 text-sm mt-1 mb-8">Start with an empty slide and build it yourself with text, shapes, tables, pictures, charts and backgrounds. No AI credits are used.</p>

        <label className="block text-sm font-semibold mb-1.5" htmlFor="scratch-title">Name</label>
        <input id="scratch-title" value={title} maxLength={200} placeholder="Untitled presentation" onChange={(e) => setTitle(e.target.value)} className="w-full max-w-md h-11 px-3 rounded-xl border border-border bg-white" />

        <div className="text-sm font-semibold mt-7 mb-2" id="size-label">Slide size</div>
        <div role="radiogroup" aria-labelledby="size-label" className="flex flex-wrap gap-3">
          {SIZES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={aspect === s.id} data-testid={`size-${s.id}`} onClick={() => setAspect(s.id)} className={`w-44 p-4 rounded-2xl border-2 bg-white text-left ${aspect === s.id ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-slate-300'}`}>
              <div className="h-12 grid place-items-center"><div className={`${s.box} rounded-sm border-2 border-slate-400 bg-slate-50`} /></div>
              <div className="font-semibold text-sm mt-2">{s.name}</div>
              <div className="text-xs text-slate-500">{s.hint}</div>
            </button>
          ))}
        </div>

        <div className="text-sm font-semibold mt-7 mb-1" id="look-label">Colours and fonts</div>
        <p className="text-xs text-slate-500 mb-2">You can change all of this later in the editor.</p>
        <div role="radiogroup" aria-labelledby="look-label" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {looks.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={look === d.id} data-testid={`look-${d.id}`} onClick={() => setLook(d.id)} className={`rounded-2xl border-2 overflow-hidden bg-white text-left ${look === d.id ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-slate-300'}`}>
              <div className="h-20 p-3 flex flex-col justify-between" style={{ background: d.theme.colors.background }}>
                <div style={{ color: d.theme.colors.textPrimary, fontFamily: `"${d.theme.fonts.heading}", sans-serif`, fontWeight: 700 }} className="text-base leading-tight truncate">Aa Title</div>
                <div className="flex gap-1.5">{[d.theme.colors.primary, d.theme.colors.secondary, d.theme.colors.accent].map((c, i) => <span key={i} aria-hidden style={{ background: c }} className="w-4 h-4 rounded-full border border-black/10" />)}</div>
              </div>
              <div className="px-3 py-2 text-xs font-medium truncate">{d.name}</div>
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
        <button data-testid="scratch-start" onClick={() => void start()} disabled={busy} className="mt-8 h-12 px-8 rounded-xl bg-primary text-white font-semibold disabled:opacity-60">{busy ? 'Creating…' : 'Start building'}</button>
      </main>
    </div>
  )
}
