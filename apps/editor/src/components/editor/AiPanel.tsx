import { Check, MessageSquare, Paperclip, Pencil, Sparkles, X } from '@prompttoppt/ui/icons'
import { useEffect, useRef, useState } from 'react'
import { ApiError, isGateError, type AiEditCommand, type AiImageProposal, type ModelOption, type SourceSummary } from '@prompttoppt/api-client'
import { SourcesDialog } from '@/components/SourcesDialog'
import { AskDeck } from '@/components/editor/AskDeck'
import { compactSlides, findUrls, type Presentation, type Restructure, type Slide } from '@prompttoppt/validation'
import { expectationsFromChanges } from '@prompttoppt/theme'
import { applyAssistVerified, type AssistAnswer } from '@/editor/assist-apply'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { aspectFor, placeImage } from '@/lib/images'
import { useUi } from '@/editor/ui'

type Msg =
  | { role: 'user'; text: string }
  | { role: 'ai'; reply: string; applied: string[]; notes: string[]; upgrade?: string; continueWith?: string; /** a prepared present / export / share: one button, the person's click is the confirmation */ action?: UiAction; credits: number; images?: AiImageProposal[]; askAbout?: string; options?: { label: string; reply: string; confirm?: Restructure }[]; undo?: string; revertedUndo?: string[] }
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

/** A few words that tell slides apart in the "Which slide?" list: the slide's title text. */
const slideLabel = (sl: { elements: { type: string; role?: string; paragraphs?: { runs: { text: string }[] }[] }[] }) => {
  const t = sl.elements.find((e) => e.type === 'text' && (e.role === 'title' || e.role === 'heading')) ?? sl.elements.find((e) => e.type === 'text')
  const text = (t?.paragraphs?.[0]?.runs ?? []).map((r) => r.text).join('').trim()
  return text.length > 28 ? `${text.slice(0, 27)}…` : text
}
const QUICK: { id: AiEditCommand; label: string; arg?: string }[] = [
  { id: 'rewrite', label: 'Rewrite' }, { id: 'shorten', label: 'Shorten' }, { id: 'expand', label: 'Expand' }, { id: 'improve', label: 'Improve hierarchy' },
]

/**
 * AI assistant: a chat. You describe what you want ("change the colours, animate every slide, shorten slide 3"), the server turns
 * it into a closed set of validated operations, and the result is applied to the deck LIVE as one undoable step. Anything the
 * AI can't do (e.g. images, for now) is said plainly instead of silently ignored. Pro-or-credit features are enforced server-side.
 */
/** The slides on which a picture is now another picture (a swapped picture of a Morph template changes on many slides): they are kept for the answer's undo. */
const changedPictureSlides = (before: Presentation, after: Presentation): string[] => {
  const srcs = (s: Presentation['slides'][number]) => s.elements.filter((e) => e.type === 'image').map((e) => (e as { src?: string }).src ?? '').join('|')
  return after.slides.filter((s) => { const b = before.slides.find((x) => x.id === s.id); return !!b && srcs(b) !== srcs(s) }).map((s) => s.id)
}

type UiAction = NonNullable<Awaited<ReturnType<typeof api.aiAssist>>['uiAction']>
const actionLabel = (a: UiAction) => (a.kind === 'present' ? `Start presenting from slide ${a.fromSlide}` : a.kind === 'export' ? `Download ${a.slides ? `${a.slides.length === 1 ? 'slide' : 'slides'} ${compactSlides(a.slides)} ` : ''}as ${a.format.toUpperCase()}` : a.email ? `Open Share with ${a.email}` : 'Open Share')

export function AiPanel({ doc, slide, presentationId, onClose, onBeforeSend, onRewrite, onUiAction }: { doc: Presentation; slide: Slide; presentationId: string; onClose: () => void; onBeforeSend: () => Promise<unknown>; onRewrite: (brief: string, picturesOnly?: boolean) => void; /** runs a prepared present / export / share when the person presses its button */ onUiAction?: ((a: UiAction) => void) | undefined }) {
  const apply = useDoc((s) => s.apply)
  const { ent, refresh, upgrade } = useEntitlements()
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  // no "whole deck / this slide" switch: the message says where ("slide 3", "the thank-you page", "every slide"); when it does not, the assistant asks in the chat
  const scope = 'deck' as const
  /** Edit: the assistant changes the deck. Ask: questions about the deck's content (read-only). */
  const [mode, setMode] = useState<'edit' | 'ask'>('edit')
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [pending, setPending] = useState(false)
  const [attached, setAttached] = useState<SourceSummary[]>([])
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  // the quick actions: asked of the server, which builds them from what the assistant can really do for this person, deck and slide (nothing typed here can be offered by mistake)
  const [chips, setChips] = useState<{ group: string; text: string }[]>([])
  // nothing can be sent while a turn is running or the saved conversation is still being read (it replaces what is on screen: a turn sent in between would vanish from the chat)
  const waiting = pending || !historyLoaded
  const endRef = useRef<HTMLDivElement>(null)
  const undoStack = () => UNDO_STACKS.get(presentationId) ?? []
  const allowed = models.filter((m) => m.allowed)
  const links = findUrls(text)
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
  useEffect(() => {
    let off = false
    api.aiChips(presentationId, slide.id).then((r) => { if (!off) setChips(r) }).catch(() => !off && setChips([]))
    return () => { off = true }
  }, [presentationId, slide.id, slide.layoutId, slide.locked, doc.sources.length, ent?.plan.id])
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

  /** After applying: save, then tell the server. It checks the SAVED deck itself and settles the credits from that (a change that did not land is refunded); what is sent here is only compared. */
  async function reportOutcome(r: { requestId: string; results: { key: string; status: string }[] }) {
    try {
      await onBeforeSend().catch(() => {})
      await api.aiAssistOutcome(presentationId, r.requestId, { results: r.results, savedRevision: useDoc.getState().revision })
      void refresh() // the balance may have changed (a refund)
    } catch { /* the server settles it by itself after a few minutes */ }
  }

  async function send(instruction: string, confirm?: NonNullable<Extract<Msg, { role: 'ai' }>['options']>[number]['confirm']) {
    if (!historyLoaded) return
    const t = instruction.trim()
    if (!t || pending) return
    if (!ent?.features.aiEdits) return upgrade.show('AI edits are available on the Pro plan.')
    const userMsg: Msg = { role: 'user', text: attached.length ? `${t}\nAttached: ${attached.map((a) => a.title).join(', ')}` : t }
    setMsgs((m) => [...m, userMsg])
    setText('')
    setPending(true)
    try {
      await onBeforeSend().catch(() => {}) // the server reads the saved deck, so save what's on screen first
      const res = await api.aiAssist(presentationId, { instruction: t, scope, activeSlideId: slide.id, selection: { slideIds: [slide.id], elementIds: useUi.getState().selection.slice(0, 200) }, ...(model ? { model } : {}), requestId: crypto.randomUUID(), ...(attached.length ? { sourceIds: attached.map((a) => a.id) } : {}), ...(undoStack().length ? { recent: [...undoStack()].reverse().map((u) => ({ theme: !!u.theme, slideIds: C.undoSlideIds(u), summary: u.summary })) } : {}), conversation: conversationOf(msgs), ...(confirm ? { confirm } : {}) })
      setAttached([])
      if (res.sources?.length) apply('Attach sources', (d) => C.addSources(d, res.sources!))
      let undoInfo: { undo?: string; revertedUndo?: string[] } = {}
      // What the chat says comes from the DECK, not from the plan: the answer is applied as one transaction, every promised change is checked on the live deck afterwards, and the message is
      // built from those checks (an answer that changes nothing says so). Answers without changes (a question, a chat reply) keep the server's words.
      let shown = { reply: res.reply, applied: res.applied, notes: res.notes }
      let verifiedReport: { requestId: string; results: { key: string; status: string }[] } | null = null
      if (res.expect && res.expect.length) {
        const log = undoStack()
        const reverted: string[] = []
        const r = applyAssistVerified(res as AssistAnswer, {
          notes: res.notes, refused: res.refused ?? [], already: res.already ?? [],
          extra: (d) => { for (const rv of res.reverts ?? []) { const e = log[log.length - 1 - rv.change]; if (e) { C.revertAssist(d, e, rv.part, rv.slideId); if (rv.part === 'all') reverted.push(e.id) } } },
        })
        shown = { reply: r.composed.reply, applied: r.composed.applied, notes: r.composed.notes }
        let next = log.filter((u) => !reverted.includes(u.id))
        if (r.changed) {
          const u = C.snapshotAssist(r.before, r.after, !!res.theme, r.composed.applied, undefined, [...C.lookSlideIds(res), ...changedPictureSlides(r.before, r.after)])
          next = [...next, u]
          const json = JSON.stringify(u)
          if (json.length <= MAX_UNDO_JSON) undoInfo = { undo: json }
        }
        if (reverted.length) undoInfo = { ...undoInfo, revertedUndo: reverted }
        UNDO_STACKS.set(presentationId, next.slice(-MAX_UNDO))
        if (res.requestId) verifiedReport = { requestId: res.requestId, results: r.checks.map((c) => ({ key: c.key, status: c.status })) }
      } else if (res.applied.length) {
        // an older answer without promises to check: applied as before (one undo step)
        const before = useDoc.getState().doc
        const log = undoStack()
        const reverted: string[] = []
        apply('AI assistant', (d) => {
          C.applyAssist(d, res)
          for (const r of res.reverts ?? []) { const e = log[log.length - 1 - r.change]; if (e) { C.revertAssist(d, e, r.part, r.slideId); if (r.part === 'all') reverted.push(e.id) } }
        })
        const after = useDoc.getState().doc
        let next = log.filter((u) => !reverted.includes(u.id))
        if (before && after && before !== after) {
          const u = C.snapshotAssist(before, after, !!res.theme, res.applied, undefined, [...C.lookSlideIds(res), ...changedPictureSlides(before, after)])
          next = [...next, u]
          const json = JSON.stringify(u)
          if (json.length <= MAX_UNDO_JSON) undoInfo = { undo: json }
        }
        if (reverted.length) undoInfo = { ...undoInfo, revertedUndo: reverted }
        UNDO_STACKS.set(presentationId, next.slice(-MAX_UNDO))
      }
      const aiMsg: Msg = { role: 'ai', reply: shown.reply, applied: shown.applied, notes: shown.notes, ...(res.upgrade ? { upgrade: res.upgrade } : {}), ...(res.continueWith ? { continueWith: res.continueWith } : {}), ...(res.uiAction ? { action: res.uiAction } : {}), credits: res.creditsCharged, images: res.images, ...(res.ask ? (res.options ? { options: res.options } : { askAbout: t }) : {}), ...undoInfo }
      setMsgs((m) => [...m, aiMsg])
      remember(userMsg, aiMsg)
      void refresh()
      if (verifiedReport) void reportOutcome(verifiedReport)
      if (res.rewrite) onRewrite(res.rewrite.brief, res.rewrite.picturesOnly) // the whole deck is rebuilt from the user's details (progress dialog)
      // "select …": go to that slide and select exactly the objects the server found (only ones still on it)
      if (res.selectObjects) { const s0 = useDoc.getState().doc?.slides.find((x) => x.id === res.selectObjects!.slideId); if (s0) { const ids = res.selectObjects.elementIds.filter((id) => s0.elements.some((e) => e.id === id)); useUi.getState().setActiveSlide(s0.id); useUi.getState().select(ids) } }
    } catch (e) {
      if (isGateError(e)) upgrade.show(e.message)
      else { const em: Msg = { role: 'error', text: e instanceof ApiError ? e.message : 'Something went wrong. You were not charged.' }; setMsgs((m) => [...m, em]); remember(userMsg, em) }
    } finally {
      setPending(false)
    }
  }

  async function quick(cmd: AiEditCommand) {
    if (waiting || slide.locked) return
    if (!ent?.features.aiEdits) return upgrade.show('AI edits are available on the Pro plan.')
    const userMsg: Msg = { role: 'user', text: `${QUICK.find((q) => q.id === cmd)!.label} slide ${slideNo}` }
    setMsgs((m) => [...m, userMsg])
    setPending(true)
    try {
      await onBeforeSend().catch(() => {})
      const res = await api.aiEdit(presentationId, { slideId: slide.id, command: cmd, ...(model ? { model } : {}), requestId: crypto.randomUUID() })
      // the same rule as the chat: the message follows what the deck now holds, and an edit that did not land is not reported as done
      const changes = { theme: null, edits: [{ slideId: slide.id, content: res.content }] }
      const r = applyAssistVerified({ ...changes, expect: res.expect ?? expectationsFromChanges(useDoc.getState().doc!, changes) }, { label: 'AI edit' })
      const aiMsg: Msg = { role: 'ai', reply: r.composed.reply, applied: r.composed.applied, notes: r.composed.notes, credits: res.creditsCharged }
      setMsgs((m) => [...m, aiMsg])
      remember(userMsg, aiMsg)
      void refresh()
      if (res.requestId) void reportOutcome({ requestId: res.requestId, results: r.checks.map((c) => ({ key: c.key, status: c.status })) })
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
        <h2 className="font-semibold inline-flex items-center gap-1.5"><Sparkles aria-hidden size={16} />AI assistant</h2>
        <div className="flex items-center gap-3">{msgs.length > 0 && <button onClick={() => void clearChat()} className="text-xs text-slate-500 hover:text-slate-800 underline">Clear chat</button>}<button onClick={onClose} aria-label="Close AI panel" className="text-xl leading-none text-slate-500 hover:text-slate-800"><X aria-hidden size={18} /></button></div>
      </div>

      <div role="tablist" aria-label="Assistant mode" className="mx-4 mt-3 bg-slate-100 p-1 rounded-lg grid grid-cols-2 text-xs font-semibold">
        {([['edit', Pencil, 'Edit'], ['ask', MessageSquare, 'Ask']] as const).map(([k, Icon, label]) => (
          <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={`py-1.5 rounded-md ${mode === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}><span className="inline-flex items-center justify-center gap-1.5"><Icon aria-hidden size={14} />{label}</span></button>
        ))}
      </div>
      {mode === 'ask' ? <AskDeck doc={doc} presentationId={presentationId} onEdit={(t) => { setMode('edit'); void send(t) }} /> : (<>
      <div className="px-4 pt-3 space-y-2">
        <label className="flex items-center gap-2 text-xs text-slate-600">Model
          <select aria-label="AI model" value={model} onChange={(e) => setModel(e.target.value)} className="flex-1 min-w-0 border border-border rounded-md px-2 py-1 bg-white text-xs">
            {allowed.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </select>
        </label>
      </div>

      {doc.sources.length > 0 && <p className="px-4 pt-2 text-[11px] text-slate-600" aria-label="Deck sources"><Paperclip aria-hidden size={12} className="inline mr-1 -mt-0.5" />Using {doc.sources.length === 1 ? '1 source' : `${doc.sources.length} sources`} from this deck: {doc.sources.map((x) => x.title).join(', ').slice(0, 120)}</p>}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0" role="log" aria-live="polite" aria-label="Conversation">
        {historyLoaded && msgs.length === 0 && (
          <div className="text-sm text-slate-600 space-y-3">
            <p>Tell me what to change and I&apos;ll do it right on your slides. Paste a web link and I&apos;ll read that page and use it. I can restyle the whole deck, add animations and rewrite slides. If you don't say which slide, I'll ask.</p>
            {['Edit', 'Design', 'Create', 'Animations'].filter((g) => chips.some((c) => c.group === g)).map((g) => (
              <div key={g} className="space-y-1.5" role="group" aria-label={`${g} actions`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g}</p>
                <div className="flex flex-col gap-2">
                  {chips.filter((c) => c.group === g).map((c) => <button key={c.text} onClick={() => void send(c.text)} disabled={waiting} className="text-left text-sm border border-border rounded-lg px-3 py-2 hover:border-primary disabled:opacity-50">{c.text}</button>)}
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-500">Ask me &ldquo;what can you do?&rdquo; for the full list. I&apos;ll tell you plainly when I can&apos;t do something.</p>
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
                <ul className="text-xs text-green-800 space-y-0.5">{m.applied.map((a) => <li key={a} className="flex items-start gap-1.5"><Check aria-hidden size={14} className="mt-0.5 shrink-0" />{a}</li>)}</ul>
              )}
              {m.notes.length > 0 && <ul className="text-xs text-amber-800 space-y-0.5">{m.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
              {m.action && onUiAction && <button data-testid="ai-ui-action" className="self-start text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-white hover:opacity-90" onClick={() => onUiAction(m.action!)}>{actionLabel(m.action)}</button>}
              {m.continueWith && <button data-testid="ai-continue" className="self-start text-xs font-semibold px-3 py-1.5 rounded-md border border-border hover:bg-slate-50" onClick={() => void send(m.continueWith!)}>Do the next step</button>}
              {m.upgrade && <button data-testid="ai-upgrade" className="self-start text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-white" onClick={() => upgrade.show(m.upgrade!)}>See plans</button>}
              {m.options && m.options.length > 0 && i === msgs.length - 1 && !pending && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Choose an answer">
                  {m.options.map((o) => <button key={o.label} onClick={() => void send(o.reply, o.confirm)} className="text-xs border border-border rounded-full px-3 py-1 hover:border-primary text-left">{o.label}</button>)}
                </div>
              )}
              {m.askAbout && i === msgs.length - 1 && !pending && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Which slide?">
                  <button onClick={() => void send(`${m.askAbout} (slide ${slideNo})`)} className="text-xs border border-primary text-primary rounded-full px-3 py-1 hover:bg-primary hover:text-white">Slide {slideNo} (this one)</button>
                  <button onClick={() => void send(`${m.askAbout} (on every slide)`)} className="text-xs border border-border rounded-full px-3 py-1 hover:border-primary">All slides</button>
                  <select aria-label="Another slide" value="" onChange={(e) => { if (e.target.value) void send(`${m.askAbout} (slide ${e.target.value})`) }} className="text-xs border border-border rounded-full px-2 py-1 bg-white max-w-[11rem]">
                    <option value="">Another slide…</option>
                    {doc.slides.map((sl, k) => (k + 1 === slideNo ? null : <option key={sl.id} value={k + 1}>{`Slide ${k + 1}${slideLabel(sl) ? ` — ${slideLabel(sl)}` : ''}`}</option>))}
                  </select>
                </div>
              )}
              {m.images?.map((p, k) => <ProposalCard key={k} proposal={p} presentationId={presentationId} />)}
              {m.applied.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {m.applied.length > (m.images?.length ?? 0) && <button onClick={() => useDoc.getState().undo()} className="text-primary font-semibold underline">Undo</button>}
                </div>
              )}
            </div>
          ),
        )}
        {pending && <div className="mr-4 bg-slate-100 rounded-2xl px-3 py-2 text-sm text-slate-500" role="status">Working on it…</div>}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {(
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Quick actions for this slide">
            <span className="text-[11px] text-slate-500">Slide {slideNo}:</span>
            {QUICK.map((q) => <button key={q.id} disabled={waiting || slide.locked} onClick={() => void quick(q.id)} className="text-xs border border-border rounded-full px-2.5 py-1 hover:border-primary disabled:opacity-50">{q.label}</button>)}
          </div>
        )}
        {slide.locked && <p role="alert" className="text-xs text-amber-800">This slide is locked. Unlock it to use AI.</p>}
        {attached.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Attached to this message">
            {attached.map((a) => <li key={a.id} className="inline-flex items-center gap-1 bg-slate-100 rounded-full pl-2.5 pr-1 py-0.5 text-xs max-w-[220px]"><span className="truncate">{a.title}</span><button type="button" aria-label={`Remove ${a.title}`} onClick={() => setAttached((x) => x.filter((y) => y.id !== a.id))} className="w-4 h-4 rounded-full hover:bg-slate-300 leading-none"><X aria-hidden size={16} /></button></li>)}
          </ul>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void send(text) }} className="flex items-end gap-2">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} aria-label="Message to the AI assistant" disabled={waiting}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text) } }}
            placeholder={`e.g. make slide ${slideNo} shorter`}
            className="flex-1 border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
          />
          <button type="button" onClick={() => setSourcesOpen(true)} aria-label="Attach a file or link" title="Attach a PDF, website or notes" disabled={waiting} className="border border-border rounded-xl px-2.5 py-2 text-sm hover:border-primary disabled:opacity-40"><Paperclip aria-hidden size={16} /></button>
          <button type="submit" disabled={waiting || !text.trim()} aria-label="Send" className="bg-primary text-white rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-40">Send</button>
        </form>
        <p className="text-[11px] text-slate-500">Enter to send · Shift+Enter for a new line{links.length > 0 && <> (includes reading {links.length === 1 ? 'the linked page' : `${links.length} linked pages`})</>} · changes apply live (⌘Z to undo)</p>
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
        <p className="text-xs text-green-800 flex items-center gap-1"><Check aria-hidden size={14} />Picture added{left ? ` · ${left}` : ''}. Undo with ⌘Z.</p>
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
