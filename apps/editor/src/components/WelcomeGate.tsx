import { useState, type ReactNode } from 'react'
import { PERSONAS, type Persona } from '@prompttoppt/validation'
import { ArrowRight, Check, CircleUser, Code2, GraduationCap, Handshake, Megaphone, NotebookPen, Rocket, Sparkles, Users, type LucideIcon } from '@prompttoppt/ui/icons'
import { api } from '@/lib/api'
import { useUser } from '@/lib/session'

const ICONS: Record<Persona, LucideIcon> = { business: Rocket, sales: Handshake, marketing: Megaphone, manager: Users, tech: Code2, teacher: GraduationCap, student: NotebookPen, other: Sparkles }

/**
 * "What do you make presentations for?": asked once, before anything else, to everyone who has not answered yet (new sign-ups, and people who signed up before it
 * existed). The answer is saved on their account (`PUT /me/persona`); then the page they opened carries on as normal.
 */
export function WelcomeGate({ children }: { children: ReactNode }) {
  const user = useUser()
  const [answered, setAnswered] = useState(Boolean(user.persona))
  if (answered) return <>{children}</>
  return <WelcomePage name={user.name} onDone={() => setAnswered(true)} />
}

function WelcomePage({ name, onDone }: { name: string; onDone: () => void }) {
  const [picked, setPicked] = useState<Persona | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = name.trim().split(/\s+/)[0] ?? ''
  const chosen = PERSONAS.find((p) => p.id === picked)

  const save = async () => {
    if (!picked) return
    setSaving(true); setError(null)
    try { await api.setPersona(picked); onDone() } catch { setError('That did not save. Please try again.'); setSaving(false) }
  }

  // arrow keys move through the cards like any radio group
  const move = (from: number, by: number) => { const next = PERSONAS[(from + by + PERSONAS.length) % PERSONAS.length]!; setPicked(next.id); document.getElementById(`persona-${next.id}`)?.focus() }

  // SlidesDone's own look (the website's): ink borders, a hard offset shadow, the yellow highlight, the orange call to action
  const INK = '#181b25', YELLOW = '#ffdf00', CREAM = '#fffbe6' // packages/theme tokens: the website's ink, --color-secondary and its pale tint
  return (
    <div className="min-h-screen bg-[#fafaf7] relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 h-[420px] w-[420px] rounded-full blur-3xl" style={{ background: 'rgba(255,223,0,0.28)' }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-32 h-[420px] w-[420px] rounded-full blur-3xl" style={{ background: 'rgba(207,63,13,0.10)' }} />
      <main className="relative mx-auto max-w-[1040px] px-4 sm:px-6 pt-10 sm:pt-16 pb-16">
        {first && <p className="inline-block rounded-full border-2 px-3 py-1 font-heading text-xs font-extrabold uppercase tracking-[0.12em]" style={{ borderColor: INK, color: INK, background: YELLOW }}>Welcome, {first}</p>}
        <h1 className="mt-5 font-heading font-extrabold text-[30px] sm:text-[40px] leading-[1.15] tracking-tight" style={{ color: INK }}>
          What do you make <span className="whitespace-nowrap rounded-md border-2 px-2" style={{ borderColor: INK, boxShadow: `3px 3px 0 0 ${INK}`, background: YELLOW }}>presentations</span> for?
        </h1>
        <p className="mt-4 text-[15px] sm:text-base font-medium text-[#475569]">Pick the one closest to you. It helps us make SlidesDone more useful for the decks you build.</p>

        <div role="radiogroup" aria-label="What do you make presentations for?" className="mt-9 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {PERSONAS.map((p, i) => {
            const Icon = ICONS[p.id]
            const on = picked === p.id
            return (
              <button key={p.id} id={`persona-${p.id}`} type="button" role="radio" aria-checked={on} tabIndex={on || (!picked && i === 0) ? 0 : -1}
                onClick={() => setPicked(p.id)}
                onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1) } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1) } }}
                style={{ borderColor: INK, boxShadow: on ? `4px 5px 0 0 ${INK}` : `2px 2px 0 0 ${INK}`, background: on ? CREAM : '#fff' }}
                className={`relative text-left rounded-2xl border-2 p-4 sm:p-5 min-h-[160px] transition-[transform,box-shadow,background-color] duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${on ? '-translate-y-0.5' : 'hover:-translate-y-0.5'}`}>
                <span aria-hidden className={`grid h-10 w-10 place-items-center rounded-xl border-2 ${on ? 'bg-primary text-white' : ''}`} style={{ borderColor: INK, ...(on ? {} : { color: INK, background: YELLOW }) }}><Icon size={18} strokeWidth={2} /></span>
                {on && <span aria-hidden className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full border-2 bg-accent text-white" style={{ borderColor: INK }}><Check size={13} strokeWidth={3.5} /></span>}
                <span className="mt-4 block font-heading font-extrabold text-[15px] leading-snug" style={{ color: INK }}>{p.label}</span>
                <span className="mt-1.5 block text-[13px] font-medium text-[#475569] leading-snug">{p.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-9 border-t-2 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ borderColor: INK }}>
          <p className="flex items-start gap-2.5 text-[13.5px] font-medium text-[#475569] max-w-[620px]" aria-live="polite">
            <CircleUser aria-hidden size={18} className="mt-px shrink-0 text-primary" />
            {chosen
              ? <span><b style={{ color: INK }}>{chosen.label}.</b> Saved to your account, and only used inside SlidesDone.</span>
              : <span>You can choose only one. It stays private to your account.</span>}
          </p>
          <div className="flex flex-col items-stretch sm:items-end gap-1.5">
            <button type="button" onClick={() => void save()} disabled={!picked || saving}
              style={{ borderColor: INK, boxShadow: `2px 3px 0 0 ${INK}` }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 bg-accent px-7 py-2.5 font-heading text-sm font-extrabold text-white transition-transform hover:translate-y-px disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:translate-y-0">
              {saving ? 'Saving…' : <>Continue <ArrowRight aria-hidden size={16} /></>}
            </button>
            {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
