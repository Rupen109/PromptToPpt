import { useEffect, useRef, useState } from 'react'
import { ApiError, isGateError, type AiEditCommand, type AiImageProposal, type ModelOption, type SourceSummary } from '@prompttoppt/api-client'
import { SourcesDialog } from '@/components/SourcesDialog'
import { AskDeck } from '@/components/editor/AskDeck'
import { findUrls, type Presentation, type Slide } from '@prompttoppt/validation'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { aspectFor, placeImage } from '@/lib/images'
import { useUi } from '@/editor/ui'

type Msg =
  | { role: 'user'; text: string }
  | { role: 'ai'; reply: string; applied: string[]; notes: string[]; credits: number; images?: AiImageProposal[]; askAbout?: string; undo?: string; revertedUndo?: string[] }
  | { role: 'error'; text: string }

/** What the assistant changed (newest last), per presentation, kept for the whole page session so closing the panel does not lose it; rebuilt from the saved chat after a reload. */
const UNDO_STACKS = new Map<string, C.AssistUndo[]>()
const MAX_UNDO = 5
const MAX_UNDO_JSON = 90_000 // saved with the chat message; bigger than this is kept in memory only

/** The undo records still available, from the saved conversation: every change that was not later put back. */
function rebuildUndo(rows: Msg[]): C.AssistUndo[] {
  let live: C.AssistUndo[] = []
  for (const m of rows) {
    if (m.role !== 'ai') continue
    if (m.revertedUndo?.length) live = live.filter((u) => !m.revertedUndo!.includes(u.id))
    if (m.undo) { try { live.push(JSON.parse(m.undo) as C.AssistUndo) } catch { /* unreadable: skip */ } }
  }
  return live.slice(-MAX_UNDO)
}
/** The last few turns, in words, so "revert it", "again" or "the same for slide 3" can be understood. */
function conversationOf(msgs: Msg[]) {
  return msgs.filter((m) => m.role !== 'error').slice(-8).map((m) => (m.role === 'user'
    ? { role: 'user' as const, text: m.text.slice(0, 500) }
    : { role: 'assistant' as const, text: [m.reply, m.applied.length ? `Changes made: ${m.applied.join('; ')}` : '', ...m.notes].filter(Boolean).join(' ').slice(0, 500) }))
}

const SOURCE_SUGGESTION = 'Add more content to every slide from my attached sources'
const SUGGESTIONS = {
  deck: ['Change the colour scheme to something warmer', 'Animate every slide', 'Make the whole deck more concise', 'Add a picture to the title slide'],
  slide: ['Make this slide shorter', 'Rewrite this more persuasively', 'Translate this slide to Spanish', 'Add more detail'],
}
const QUICK: { id: AiEditCommand; label: string; arg?: string }[] = [
  { id: 'rewrite', label: 'Rewrite' }, { id: 'shorten', label: 'Shorten' }, { id: 'expand', label: 'Expand' }, { id: 'improve', label: 'Improve hierarchy' },
]

/**
 * AI assistant: a chat. You describe what you want ("change the colours, animate every slide, shorten slide 3"), the server turns
 * it into a closed set of validated operations, and the result is applied to the deck LIVE as one undoable step. Anything the
 * AI can't do (e.g. images, for now) is said plainly instead of silently ignored. Pro-or-credit features are enforced server-side.
 */
export function AiPanel({ doc, slide, presentationId, onClose, onBeforeSend, onRewrite }: { doc: Presentation; slide: Slide; presentationId: string; onClose: () => void; onBeforeSend: () => Promise<unknown>; onRewrite: (brief: string, picturesOnly?: boolean) => void }) {
  const apply = useDoc((s) => s.apply)
  const { ent, refresh, upgrade } = useEntitlements()
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  const [scope, setScope] = useState<'deck' | 'slide'>('deck')
  /** Edit: the assistant changes the deck. Ask: questions about the deck's content (read-only). */
  const [mode, setMode] = useState<'edit' | 'ask'>('edit')
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [pending, setPending] = useState(false)
  const [attached, setAttached] = useState<SourceSummary[]>([])
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const undoStack = () => UNDO_STACKS.get(presentationId) ?? []
  const allowed = models.filter((m) => m.allowed)
  const current = models.find((m) => m.id === model)
  const links = findUrls(text)
  const cost = current ? current.creditsPerEdit * ((scope === 'deck' ? 2 : 1) + links.length) : null
  const slideNo = doc.slides.findIndex((s) => s.id === slide.id) + 1

  useEffect(() => {
    let off = false
    api.models().then((r) => {
      if (off) return
      setModels(r.models)
      setModel((cur) => cur || r.default || '')
    }).catch(() => {})
    return () => {
      off = true
    }
  }, [ent?.plan.id])
  // the conversation is kept per presentation: reopen the panel (or reload, or switch device) and it is all still here
  useEffect(() => {
    let off = false
    api.aiChat(presentationId).then((rows) => { if (!off) { setMsgs(rows as unknown as Msg[]); if (!UNDO_STACKS.has(presentationId)) UNDO_STACKS.set(presentationId, rebuildUndo(rows as unknown as Msg[])); setHistoryLoaded(true) } }).catch(() => !off && setHistoryLoaded(true))
    return () => { off = true }
  }, [presentationId])
  /** best-effort: never blocks or fails the conversation. Picture proposals are not saved (they are one-off buttons). */
  const remember = (...m: Msg[]) => void api.saveAiChat(presentationId, m.map((x) => (x.role === 'ai' ? { ...x, images: undefined } : x)) as unknown as Record<string, unknown>[]).catch(() => {})
  async function clearChat() {
    if (msgs.length === 0 || !confirm('Clear this conversation? Your slides are not affected.')) return
    setMsgs([])
    await api.clearAiChat(presentationId).catch(() => {})
  }
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, pending])

  async function send(instruction: string) {
    const t = instruction.trim()
    if (!t || pending) return
    if (!ent?.features.aiEdits) return upgrade.show('AI edits are available on the Pro plan.')
    if (scope === 'slide' && slide.locked) return setMsgs((m) => [...m, { role: 'error', text: 'This slide is locked. Unlock it first.' }])
    const userMsg: Msg = { role: 'user', text: attached.length ? `${t}\n📎 ${attached.map((a) => a.title).join(', ')}` : t }
    setMsgs((m) => [...m, userMsg])
    setText('')
    setPending(true)
    try {
      await onBeforeSend().catch(() => {}) // the server reads the saved deck, so save what's on screen first
      const res = await api.aiAssist(presentationId, { instruction: t, scope, ...(scope === 'slide' ? { slideId: slide.id } : {}), activeSlideId: slide.id, ...(model ? { model } : {}), requestId: crypto.randomUUID(), ...(attached.length ? { sourceIds: attached.map((a) => a.id) } : {}), ...(undoStack().length ? { recent: [...undoStack()].reverse().map((u) => ({ theme: !!u.theme, slideIds: C.undoSlideIds(u), summary: u.summary })) } : {}), conversation: conversationOf(msgs) })
      setAttached([])
      if (res.sources?.length) apply('Attach sources', (d) => C.addSources(d, res.sources!))
      let undoInfo: { undo?: string; revertedUndo?: string[] } = {}
      if (res.applied.length) {
        const before = useDoc.getState().doc
        const log = undoStack()
        const reverted: string[] = []
        apply('AI assistant', (d) => {
          C.applyAssist(d, res)
          for (const r of res.reverts ?? []) { const e = log[log.length - 1 - r.change]; if (e) { C.revertAssist(d, e, r.part, r.slideId); if (r.part === 'all') reverted.push(e.id) } }
        }) // live, one undo step
        const after = useDoc.getState().doc
        const didEdit = !!res.theme || res.edits.length > 0 || (res.additions?.length ?? 0) > 0
        let next = log.filter((u) => !reverted.includes(u.id))
        if (before && after && didEdit) {
          const u = C.snapshotAssist(before, after, !!res.theme, res.applied)
          next = [...next, u]
          const json = JSON.stringify(u)
          if (json.length <= MAX_UNDO_JSON) undoInfo = { undo: json }
        }
        if (reverted.length) undoInfo = { ...undoInfo, revertedUndo: reverted }
        UNDO_STACKS.set(presentationId, next.slice(-MAX_UNDO))
      }
      const aiMsg: Msg = { role: 'ai', reply: res.reply, applied: res.applied, notes: res.notes, credits: res.creditsCharged, images: res.images, ...(res.ask ? { askAbout: t } : {}), ...undoInfo }
      setMsgs((m) => [...m, aiMsg])
      remember(userMsg, aiMsg)
      void refresh()
      if (res.rewrite) onRewrite(res.rewrite.brief, res.rewrite.picturesOnly) // the whole deck is rebuilt from the user's details (progress dialog)
    } catch (e) {
      if (isGateError(e)) upgrade.show(e.message)
      else { const em: Msg = { role: 'error', text: e instanceof ApiError ? e.message : 'Something went wrong. You were not charged.' }; setMsgs((m) => [...m, em]); remember(userMsg, em) }
    } finally {
      setPending(false)
    }
  }

  async function quick(cmd: AiEditCommand) {
    if (pending || slide.locked) return
    if (!ent?.features.aiEdits) return upgrade.show('AI edits are available on the Pro plan.')
    const userMsg: Msg = { role: 'user', text: `${QUICK.find((q) => q.id === cmd)!.label} slide ${slideNo}` }
    setMsgs((m) => [...m, userMsg])
    setPending(true)
    try {
      await onBeforeSend().catch(() => {})
      const res = await api.aiEdit(presentationId, { slideId: slide.id, command: cmd, ...(model ? { model } : {}), requestId: crypto.randomUUID() })
      apply('AI edit', (d) => C.replaceContent(d, slide.id, res.content))
      const aiMsg: Msg = { role: 'ai', reply: `Done — I updated slide ${slideNo}.`, applied: [`Updated slide ${slideNo}`], notes: [], credits: res.creditsCharged }
      setMsgs((m) => [...m, aiMsg])
      remember(userMsg, aiMsg)
      void refresh()
    } catch (e) {
      if (isGateError(e)) upgrade.show(e.message)
      else { const em: Msg = { role: 'error', text: e instanceof ApiError ? e.message : 'The edit failed. You were not charged.' }; setMsgs((m) => [...m, em]); remember(userMsg, em) }
    } finally {
      setPending(false)
    }
  }

  return (
    <aside aria-label="AI assistant" className="w-[360px] max-lg:fixed max-lg:z-40 max-lg:right-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-2xl max-md:left-0 max-md:top-auto max-md:h-[60vh] max-md:rounded-t-2xl max-md:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold">✨ AI assistant</h2>
        <div className="flex items-center gap-3">{msgs.length > 0 && <button onClick={() => void clearChat()} className="text-xs text-slate-500 hover:text-slate-800 underline">Clear chat</button>}<button onClick={onClose} aria-label="Close AI panel" className="text-xl leading-none text-slate-500 hover:text-slate-800">×</button></div>
      </div>

      <div role="tablist" aria-label="Assistant mode" className="mx-4 mt-3 bg-slate-100 p-1 rounded-lg grid grid-cols-2 text-xs font-semibold">
        {([['edit', '✏️ Edit'], ['ask', '💬 Ask']] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`py-1.5 rounded-md ${mode === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
        ))}
      </div>
      {mode === 'ask' ? <AskDeck doc={doc} presentationId={presentationId} /> : (<>
      <div className="px-4 pt-3 space-y-2">
        <div role="group" aria-label="What should the AI change?" className="bg-slate-100 p-1 rounded-lg grid grid-cols-2 text-xs font-semibold">
          {([['deck', 'Whole deck'], ['slide', `This slide (${slideNo})`]] as const).map(([k, label]) => (
            <button key={k} aria-pressed={scope === k} onClick={() => setScope(k)} className={`py-1.5 rounded-md ${scope === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">Model
          <select aria-label="AI model" value={model} onChange={(e) => setModel(e.target.value)} className="flex-1 min-w-0 border border-border rounded-md px-2 py-1 bg-white text-xs">
            {allowed.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </label>
      </div>

      {doc.sources.length > 0 && <p className="px-4 pt-2 text-[11px] text-slate-600" aria-label="Deck sources">📎 Using {doc.sources.length === 1 ? '1 source' : `${doc.sources.length} sources`} from this deck: {doc.sources.map((x) => x.title).join(', ').slice(0, 120)}</p>}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0" role="log" aria-live="polite" aria-label="Conversation">
        {historyLoaded && msgs.length === 0 && (
          <div className="text-sm text-slate-600 space-y-3">
            <p>Tell me what to change and I&apos;ll do it right on your slides. Paste a web link and I&apos;ll read that page and use it. {scope === 'deck' ? 'I can restyle the whole deck, add animations and rewrite slides.' : `I'll only change slide ${slideNo}.`}</p>
            <div className="flex flex-col gap-2">
              {[...(doc.sources.length > 0 && scope === 'deck' ? [SOURCE_SUGGESTION] : []), ...SUGGESTIONS[scope]].map((s) => <button key={s} onClick={() => void send(s)} disabled={pending} className="text-left text-sm border border-border rounded-lg px-3 py-2 hover:border-primary disabled:opacity-50">{s}</button>)}
            </div>
            <p className="text-xs text-slate-500">I can also add AI pictures — you confirm (and see the credit cost of) each one first. I&apos;ll tell you plainly when I can&apos;t do something.</p>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-8 bg-primary text-white rounded-2xl rounded-br-sm px-3 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
          ) : m.role === 'error' ? (
            <div key={i} role="alert" className="mr-4 bg-red-50 text-red-700 rounded-2xl px-3 py-2 text-sm">{m.text}</div>
          ) : (
            <div key={i} className="mr-4 bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2 text-sm space-y-2">
              <p className="whitespace-pre-line">{m.reply}</p>
              {m.applied.length > 0 && (
                <ul className="text-xs text-green-800 space-y-0.5">{m.applied.map((a) => <li key={a}>✓ {a}</li>)}</ul>
              )}
              {m.notes.length > 0 && <ul className="text-xs text-amber-800 space-y-0.5">{m.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
              {m.askAbout && i === msgs.length - 1 && !pending && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Which slide?">
                  <button onClick={() => void send(`${m.askAbout} (slide ${slideNo})`)} className="text-xs border border-primary text-primary rounded-full px-3 py-1 hover:bg-primary hover:text-white">Slide {slideNo} (this one)</button>
                  <button onClick={() => void send(`${m.askAbout} (on every slide)`)} className="text-xs border border-border rounded-full px-3 py-1 hover:border-primary">All slides</button>
                </div>
              )}
              {m.images?.map((p, k) => <ProposalCard key={k} proposal={p} presentationId={presentationId} />)}
              {m.applied.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {m.applied.length > (m.images?.length ?? 0) && <button onClick={() => useDoc.getState().undo()} className="text-primary font-semibold underline">Undo</button>}
                  <span>{m.credits} credits</span>
                </div>
              )}
            </div>
          ),
        )}
        {pending && <div className="mr-4 bg-slate-100 rounded-2xl px-3 py-2 text-sm text-slate-500" role="status">Working on it…</div>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {scope === 'slide' && (
          <div className="flex flex-wrap gap-1.5" aria-label="Quick actions for this slide">
            {QUICK.map((q) => <button key={q.id} disabled={pending || slide.locked} onClick={() => void quick(q.id)} className="text-xs border border-border rounded-full px-2.5 py-1 hover:border-primary disabled:opacity-50">{q.label}</button>)}
          </div>
        )}
        {slide.locked && scope === 'slide' && <p role="alert" className="text-xs text-amber-800">This slide is locked. Unlock it to use AI.</p>}
        {attached.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Attached to this message">
            {attached.map((a) => <li key={a.id} className="inline-flex items-center gap-1 bg-slate-100 rounded-full pl-2.5 pr-1 py-0.5 text-xs max-w-[220px]"><span className="truncate">{a.title}</span><button type="button" aria-label={`Remove ${a.title}`} onClick={() => setAttached((x) => x.filter((y) => y.id !== a.id))} className="w-4 h-4 rounded-full hover:bg-slate-300 leading-none">×</button></li>)}
          </ul>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void send(text) }} className="flex items-end gap-2">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} aria-label="Message to the AI assistant" disabled={pending}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text) } }}
            placeholder={scope === 'deck' ? 'e.g. change the colours and animate every slide' : `e.g. make slide ${slideNo} shorter`}
            className="flex-1 border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
          />
          <button type="button" onClick={() => setSourcesOpen(true)} aria-label="Attach a file or link" title="Attach a PDF, website or notes" disabled={pending} className="border border-border rounded-xl px-2.5 py-2 text-sm hover:border-primary disabled:opacity-40">📎</button>
          <button type="submit" disabled={pending || !text.trim()} aria-label="Send" className="bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-40">Send</button>
        </form>
        <p className="text-[11px] text-slate-500">Enter to send · Shift+Enter for a new line{cost !== null && <> · ≈ {cost} credits per message</>}{links.length > 0 && <> (includes reading {links.length === 1 ? 'the linked page' : `${links.length} linked pages`})</>} · changes apply live (⌘Z to undo) · failed requests are refunded</p>
      </div>
      </>)}
      {sourcesOpen && <SourcesDialog count={attached.length + doc.sources.length} onAdd={(src) => setAttached((x) => [...x, src])} onClose={() => setSourcesOpen(false)} />}
    </aside>
  )
}


const PLACEMENT_LABEL = { background: 'full-slide background', beside: 'beside the text', floating: 'free-floating' } as const

/**
 * A picture the assistant PROPOSED. Nothing is generated or charged until the user presses Generate, and the price and
 * remaining allowance are shown first — the assistant can never run up image costs on its own.
 */
function ProposalCard({ proposal, presentationId }: { proposal: AiImageProposal; presentationId: string }) {
  const apply = useDoc((s) => s.apply)
  const { refresh, upgrade } = useEntitlements()
  const { openImageDialog, setActiveSlide } = useUi()
  const [models, setModels] = useState<{ list: ModelOption[]; def: string | null } | null>(null)
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState<string | null>(null)
  const requestId = useRef(crypto.randomUUID())

  useEffect(() => {
    let off = false
    void api.models('image').then((r) => !off && setModels({ list: r.models, def: r.default })).catch(() => {})
    return () => {
      off = true
    }
  }, [])
  const model = models?.list.find((m) => m.id === models.def)

  async function generate() {
    const d = useDoc.getState().doc
    const slide = d?.slides.find((s) => s.id === proposal.slideId)
    if (!d || !slide) return setError('That slide no longer exists.')
    setState('busy')
    setError(null)
    try {
      const placement = (C.imagePlacements(slide).some((p) => p.id === proposal.placement) ? proposal.placement : 'floating')
      const img = await api.generateImage(presentationId, { prompt: proposal.prompt, aspect: aspectFor(placement, d.aspectRatio), ...(model ? { model: model.id } : {}), requestId: requestId.current })
      apply('AI image', (draft) => placeImage(draft, slide, placement, { url: img.url, alt: proposal.alt, prompt: proposal.prompt }))
      setLeft(`${img.usage.deck.max - img.usage.deck.used} left in this presentation`)
      setState('done')
      void refresh()
    } catch (e) {
      requestId.current = crypto.randomUUID()
      if (isGateError(e) && e.code !== 'LIMIT_REACHED') upgrade.show(e.message)
      else setError(e instanceof ApiError ? e.message : 'Could not create the picture. You were not charged.')
      setState('idle')
    }
  }

  return (
    <div className="bg-white border border-border rounded-xl p-3 space-y-2" aria-label={`Picture proposal for slide ${proposal.slideNumber}`}>
      <div className="text-xs text-slate-500">Slide {proposal.slideNumber} · {PLACEMENT_LABEL[proposal.placement]}</div>
      <p className="text-sm">{proposal.prompt}</p>
      {state === 'done' ? (
        <p className="text-xs text-green-800">✓ Picture added{left ? ` · ${left}` : ''}. Undo with ⌘Z.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void generate()} disabled={state === 'busy' || !model} className="bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            {state === 'busy' ? 'Creating… (10–20 s)' : `Generate${model ? ` · ${model.creditsPerImage} credits` : ''}`}
          </button>
          <button onClick={() => { setActiveSlide(proposal.slideId); openImageDialog({ prompt: proposal.prompt }) }} disabled={state === 'busy'} className="text-xs text-primary font-semibold underline">Customise…</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
