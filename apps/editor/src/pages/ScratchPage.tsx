import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, PencilRuler } from '@prompttoppt/ui/icons'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import { CATEGORIES, DESIGNS, isDark } from '@prompttoppt/theme'
import { SlideCanvas } from '@prompttoppt/ui'
import { ASPECT_RATIOS, CANVAS, type AspectRatio, type Slide, type Theme } from '@prompttoppt/validation'
import { FORMATS } from '@/components/FormatPicker'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { makeElement } from '@/editor/commands'

const SIZES = ASPECT_RATIOS.map((id) => ({ id, ...FORMATS[id] }))

/** The look the page opens on: the simple white Classroom design. */
const DEFAULT_LOOK = 'Classroom'
/** a light design: a light background */
const isLight = (t: Theme) => !isDark(t.colors.background)

/**
 * What the new deck will look like, drawn with the real slide renderer: the chosen colours and fonts at the chosen size. The deck itself starts with an empty slide (that is what
 * "from scratch" means), so this is a specimen of the look rather than a copy of that slide.
 */
function specimen(theme: Theme, aspect: AspectRatio, name: string): Slide {
  const { width: W, height: H } = CANVAS[aspect]
  const M = Math.round(W * 0.09)
  const box = { rotation: 0, locked: false, opacity: 1 }
  const text = (id: string, role: 'title' | 'body', y: number, h: number, fontSize: number, color: 'textPrimary' | 'textSecondary', t: string, z: number) =>
    makeElement({ type: 'text', id, role, x: M, y, width: W - 2 * M, height: h, fontSize, color, zIndex: z, paragraphs: [{ runs: [{ text: t }] }], valign: 'bottom', ...box })
  return {
    id: 'specimen', layoutId: 'blank', locked: false, manual: true, speakerNotes: '', sources: [], validation: { status: 'pending', issues: [] },
    background: { type: 'color', value: theme.colors.background },
    elements: [
      makeElement({ type: 'shape', id: 'bar', shape: 'rect', fill: 'primary', radius: 8, x: M, y: Math.round(H * 0.3), width: Math.round(W * 0.1), height: Math.round(H * 0.016), zIndex: 0, ...box }),
      text('t', 'title', Math.round(H * 0.34), Math.round(H * 0.22), Math.round(W * 0.062), 'textPrimary', name || 'Untitled presentation', 1),
      makeElement({ type: 'text', id: 'b', role: 'body', x: M, y: Math.round(H * 0.58), width: W - 2 * M, height: Math.round(H * 0.12), fontSize: Math.round(W * 0.028), color: 'textSecondary', zIndex: 2, paragraphs: [{ runs: [{ text: 'Your slides start here' }] }], valign: 'top', ...box }),
      ...(['primary', 'secondary', 'accent'] as const).map((k, i) => makeElement({ type: 'shape', id: `dot${i}`, shape: 'ellipse', fill: k, x: M + i * Math.round(W * 0.05), y: Math.round(H * 0.8), width: Math.round(W * 0.034), height: Math.round(W * 0.034), zIndex: 3 + i, ...box })),
    ],
  } as Slide
}

/** "Create from scratch": an empty slide in a look you pick (its colours and fonts), then the editor with every tool. No AI, no credits. */
export function ScratchPage() {
  const navigate = useNavigate()
  const { upgrade } = useEntitlements()
  const [title, setTitle] = useState('')
  const [aspect, setAspect] = useState<AspectRatio>('16:9')
  // a spread of free looks: the simple white Classroom first, then a light and a dark free design of every category (so the list is never all dark)
  const looks = useMemo(() => {
    const first = DESIGNS.find((d) => d.name === DEFAULT_LOOK && !d.premium)
    const pick = (light: boolean) => CATEGORIES.map((c) => DESIGNS.find((d) => d.category === c.id && !d.premium && d.id !== first?.id && isLight(d.theme) === light)).filter((d): d is NonNullable<typeof d> => !!d)
    return [...(first ? [first] : []), ...pick(true).slice(0, 5), ...pick(false).slice(0, 6)]
  }, [])
  const [look, setLook] = useState(looks[0]?.id ?? '')
  const chosen = looks.find((d) => d.id === look) ?? looks[0]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = useMemo(() => (chosen ? specimen(chosen.theme, aspect, title.trim()) : null), [chosen, aspect, title])

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
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-[1180px]">
        <h1 className="font-heading font-bold text-3xl inline-flex items-center gap-3"><PencilRuler aria-hidden size={28} />Create from scratch</h1>
        <p className="text-slate-600 text-sm mt-1.5 mb-8 max-w-xl">Start with an empty slide and build it yourself: text, shapes, tables, pictures, charts and backgrounds. No AI credits are used.</p>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8 lg:gap-10 items-start">
          <div className="space-y-8 min-w-0">
            <section aria-labelledby="name-label">
              <label id="name-label" htmlFor="scratch-title" className="block text-sm font-semibold mb-2">Name</label>
              <input id="scratch-title" value={title} maxLength={200} placeholder="Untitled presentation" onChange={(e) => setTitle(e.target.value)} className="w-full h-12 px-4 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary" />
            </section>

            <section aria-labelledby="size-label">
              <div className="text-sm font-semibold mb-2" id="size-label">Slide size</div>
              <div role="radiogroup" aria-labelledby="size-label" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SIZES.map((s) => {
                  const on = aspect === s.id
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={on} data-testid={`size-${s.id}`} onClick={() => setAspect(s.id)} className={`p-3.5 rounded-xl border bg-white text-left transition-all ${on ? 'border-primary ring-2 ring-primary/25 shadow-sm' : 'border-border hover:border-slate-300'}`}>
                      <div className="h-8 flex items-center"><div className={`${s.box} rounded-[3px] border-2 ${on ? 'border-primary bg-primary/10' : 'border-slate-300 bg-slate-50'}`} /></div>
                      <div className="font-semibold text-sm mt-2">{s.name} <span className="font-normal text-slate-400">{s.id}</span></div>
                      <div className="text-xs text-slate-500 mt-0.5 max-sm:hidden">{s.hint}</div>
                    </button>
                  )
                })}
              </div>
            </section>

            <section aria-labelledby="look-label">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="text-sm font-semibold" id="look-label">Colours and fonts</div>
                <p className="text-xs text-slate-500">You can change these later in the editor.</p>
              </div>
              <div role="radiogroup" aria-labelledby="look-label" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {looks.map((d, i) => {
                  const on = look === d.id
                  return (
                    <button key={d.id} type="button" role="radio" aria-checked={on} data-testid={`look-${d.id}`} onClick={() => setLook(d.id)} className={`group relative rounded-xl border overflow-hidden bg-white text-left transition-all ${on ? 'border-primary ring-2 ring-primary/25 shadow-sm' : 'border-border hover:border-slate-300 hover:shadow-sm'}`}>
                      <div className="aspect-[16/9] px-3.5 py-3 flex flex-col justify-between border-b border-border" style={{ background: d.theme.colors.background }}>
                        <div style={{ color: d.theme.colors.textPrimary, fontFamily: `"${d.theme.fonts.heading}", sans-serif`, fontWeight: 700 }} className="text-lg leading-tight truncate">Aa Title</div>
                        <div className="flex items-center gap-1.5">
                          {[d.theme.colors.primary, d.theme.colors.secondary, d.theme.colors.accent].map((c, k) => <span key={k} aria-hidden style={{ background: c }} className="w-3.5 h-3.5 rounded-full ring-1 ring-black/10" />)}
                        </div>
                      </div>
                      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate">{d.name}</span>
                        {i === 0 && <span className="max-sm:hidden text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 shrink-0">Simple white</span>}
                      </div>
                      {on && <span aria-hidden className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary text-white grid place-items-center shadow"><Check size={14} strokeWidth={3} /></span>}
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          <aside aria-label="Preview" className="lg:sticky lg:top-8 bg-white border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</span>
              <span className="text-xs text-slate-500">{chosen?.name} · {SIZES.find((s) => s.id === aspect)?.name}</span>
            </div>
            <div className="rounded-xl border border-border overflow-hidden bg-slate-100 grid place-items-center py-4 px-3" style={{ minHeight: 200 }}>
              {preview && chosen && <div className="rounded-md overflow-hidden shadow-md"><SlideCanvas slide={preview} theme={chosen.theme} aspect={aspect} width={aspect === '16:9' ? 320 : aspect === '4:3' ? 270 : aspect === '1:1' ? 210 : 150} /></div>}
            </div>
            <p className="text-xs text-slate-500 mt-3">Your deck opens with one empty slide in this look, ready for you to fill.</p>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <button data-testid="scratch-start" onClick={() => void start()} disabled={busy} className="mt-4 w-full h-12 rounded-xl bg-primary text-white font-semibold shadow-sm hover:opacity-90 disabled:opacity-60">{busy ? 'Creating…' : 'Start building'}</button>
          </aside>
        </div>
      </main>
    </div>
  )
}
