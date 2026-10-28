import { useEffect, useRef, useState } from 'react'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import type { Presentation } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useUi } from '@/editor/ui'

type Turn = { role: 'user'; text: string } | { role: 'ai'; text: string; slides: { n: number; id: string }[]; credits: number } | { role: 'error'; text: string }

/** Conversations are kept in memory per deck for this page session (questions are cheap to ask again; nothing is written to the deck). */
const KEPT = new Map<string, Turn[]>()

const STARTERS = ['Summarise this deck in 3 bullets', 'What are the key numbers?', 'Which slide covers the next steps?', 'What questions might the audience ask?']

/**
 * "Chat with your presentation": ask about the deck's own words, get a short answer plus buttons that jump to the slides it came from.
 * Read-only — it never edits the deck (the Edit tab does that). Pro/Gold; each question costs a few credits and failed ones are refunded.
 */
export function AskDeck({ doc, presentationId }: { doc: Presentation; presentationId: string }) {
  const { ent, refresh, upgrade } = useEntitlements()
  const setActiveSlide = useUi((s) => s.setActiveSlide)
  const [turns, setTurns] = useState<Turn[]>(() => KEPT.get(presentationId) ?? [])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const allowed = ent?.features.askDeck === true
  const ids = new Set(doc.slides.map((s) => s.id))

  useEffect(() => { KEPT.set(presentationId, turns) }, [presentationId, turns])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turns, pending])

  async function ask(q: string) {
    const question = q.trim()
    if (!question || pending) return
    if (!allowed) return upgrade.show('Chat with your presentation is available on the Pro plan.')
    const history = turns.filter((t): t is Extract<Turn, { role: 'user' | 'ai' }> => t.role !== 'error').slice(-6).map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }))
    setTurns((t) => [...t, { role: 'user', text: question }])
    setText('')
    setPending(true)
    try {
      const r = await api.askDeck(presentationId, { question, history, requestId: crypto.randomUUID() })
      setTurns((t) => [...t, { role: 'ai', text: r.answer, slides: r.slides, credits: r.creditsCharged }])
      void refresh()
    } catch (e) {
      if (isGateError(e)) upgrade.show(e.message)
      setTurns((t) => [...t, { role: 'error', text: e instanceof ApiError ? e.message : 'Something went wrong. You were not charged — please try again.' }])
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0" role="log" aria-live="polite" aria-label="Questions and answers">
        {turns.length === 0 && (
          <div className="text-sm text-slate-600 space-y-3">
            <p>Ask anything about this presentation and I&apos;ll answer from its slides{doc.sources.length > 0 ? ' and its sources' : ''}, and show you where. I never change your slides here.</p>
            <div className="flex flex-col gap-2">
              {STARTERS.map((s) => <button key={s} onClick={() => void ask(s)} disabled={pending} className="text-left text-sm border border-border rounded-lg px-3 py-2 hover:border-primary disabled:opacity-50">{s}</button>)}
            </div>
            {!allowed && ent && <p role="alert" className="text-xs font-semibold text-primary">Chat with your presentation is a Pro feature.</p>}
          </div>
        )}
        {turns.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-8 bg-primary text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
          ) : m.role === 'error' ? (
            <div key={i} role="alert" className="mr-4 bg-red-50 text-red-700 rounded-2xl px-3 py-2 text-sm">{m.text}</div>
          ) : (
            <div key={i} className="mr-4 bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2 text-sm space-y-2">
              <p className="whitespace-pre-line">{m.text}</p>
              {m.slides.filter((s) => ids.has(s.id)).length > 0 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Slides this answer is based on">
                  {m.slides.filter((s) => ids.has(s.id)).map((s) => <button key={s.id} onClick={() => setActiveSlide(s.id)} className="text-xs border border-primary text-primary rounded-full px-2.5 py-0.5 hover:bg-primary hover:text-white">Slide {doc.slides.findIndex((x) => x.id === s.id) + 1}</button>)}
                </div>
              )}
              <p className="text-[11px] text-slate-500">{m.credits} {m.credits === 1 ? 'credit' : 'credits'}</p>
            </div>
          ),
        )}
        {pending && <div className="mr-4 bg-slate-100 rounded-2xl px-3 py-2 text-sm text-slate-500" role="status">Reading your deck…</div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-3 space-y-2">
        <form onSubmit={(e) => { e.preventDefault(); void ask(text) }} className="flex items-end gap-2">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} aria-label="Question about this presentation" disabled={pending}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(text) } }}
            placeholder="e.g. What does slide 4 say about pricing?"
            className="flex-1 border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
          />
          <button type="submit" disabled={pending || !text.trim()} aria-label="Ask" className="bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-40">Ask</button>
        </form>
        <p className="text-[11px] text-slate-500">Enter to ask · answers come only from this deck · a few credits per question · failed questions are refunded</p>
      </div>
    </>
  )
}
