import { MapPin, X } from '@prompttoppt/ui/icons'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CommentItem, CommentPerson, CommentThread } from '@prompttoppt/api-client'
import type { Presentation } from '@prompttoppt/validation'
import { encodeMentions, isUnread, MAX_BODY, messageOf, prunePicks, showMentions, useComments } from '@/editor/comments'
import { useLive } from '@/editor/live'
import { useUi } from '@/editor/ui'
import { api } from '@/lib/api'

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const hue = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360 }

/** Text with `@Name` of real people highlighted (everything else stays plain text: nothing from a comment is ever treated as HTML). */
function Body({ text, people }: { text: string; people: CommentPerson[] }) {
  const shown = showMentions(text, people)
  const names = [...people.map((p) => p.name), 'former member', 'unknown'].filter(Boolean).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = names.length ? new RegExp(`(@(?:${names.join('|')}))(?![\\p{L}\\p{N}_])`, 'gu') : null
  const parts = re ? shown.split(re) : [shown]
  return <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{parts.map((s, i) => (i % 2 ? <span key={i} className="font-semibold text-primary bg-primary/10 rounded px-0.5" data-mention>{s}</span> : s))}</p>
}

/** A text box with @-mentions: typing "@" offers the people on this deck (names only). Cmd/Ctrl+Enter sends, Esc cancels. The draft is kept when sending fails. */
function Composer({ label, placeholder, initial = '', submitLabel, people, onSubmit, onCancel, autoFocus }: { label: string; placeholder: string; initial?: string; submitLabel: string; people: CommentPerson[]; onSubmit: (text: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean }) {
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<{ at: number; q: string; i: number } | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const sending = useRef(false)
  const picks = useRef<{ id: string; name: string }[]>([])
  const caretTo = useRef<number | null>(null)
  // the caret is put back BEFORE the browser paints or handles the next key, so fast typing after picking a name cannot land in the wrong place
  useLayoutEffect(() => { if (caretTo.current !== null && ref.current) { ref.current.setSelectionRange(caretTo.current, caretTo.current); ref.current.focus(); caretTo.current = null } }, [text])
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  const matches = pick ? people.filter((p) => p.name.toLowerCase().startsWith(pick.q.toLowerCase())).slice(0, 6) : []
  const detect = (value: string, caret: number) => {
    const m = /(^|\s)@([\p{L}\p{N} ]{0,30})$/u.exec(value.slice(0, caret))
    setPick(m ? { at: caret - m[2]!.length - 1, q: m[2]!, i: 0 } : null)
  }
  const choose = (p: CommentPerson) => {
    if (!pick || !ref.current) return
    const caret = ref.current.selectionStart
    const next = `${text.slice(0, pick.at)}@${p.name} ${text.slice(caret)}`
    picks.current.push({ id: p.id, name: p.name })
    caretTo.current = pick.at + p.name.length + 2
    setText(next); setPick(null)
  }
  async function send() {
    const trimmed = text.trim()
    if (sending.current) return // a double click sends once
    if (!trimmed) { setError('Write something first.'); return }
    if (trimmed.length > MAX_BODY) { setError(`Comments can be up to ${MAX_BODY} characters (this one is ${trimmed.length}).`); return }
    sending.current = true; setBusy(true); setError(null)
    try { await onSubmit(encodeMentions(trimmed, people, prunePicks(trimmed, picks.current))); setText(''); picks.current = [] } catch (e) { setError(messageOf(e)) } finally { sending.current = false; setBusy(false) }
  }
  const over = text.trim().length > MAX_BODY
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <textarea
          ref={ref} aria-label={label} value={text} rows={3} placeholder={placeholder} aria-invalid={over || !!error}
          onChange={(e) => { setText(e.target.value); setError(null); picks.current = prunePicks(e.target.value, picks.current); detect(e.target.value, e.target.selectionStart) }}
          onKeyDown={(e) => {
            if (pick && matches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setPick({ ...pick, i: (pick.i + 1) % matches.length }); return }
              if (e.key === 'ArrowUp') { e.preventDefault(); setPick({ ...pick, i: (pick.i + matches.length - 1) % matches.length }); return }
              if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[pick.i]!); return }
            }
            if (e.key === 'Escape') { e.stopPropagation(); if (pick) setPick(null); else onCancel?.(); return }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() }
          }}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-y max-h-60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {pick && matches.length > 0 && (
          <ul role="listbox" aria-label="People you can mention" className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg p-1 text-sm">
            {matches.map((p, i) => <li key={p.id} role="option" aria-selected={i === pick.i} tabIndex={-1} onMouseDown={(e) => { e.preventDefault(); choose(p) }} className={`cursor-pointer px-2.5 py-1.5 rounded-md ${i === pick.i ? 'bg-primary/10' : 'hover:bg-slate-100'}`}>@{p.name}<span className="text-xs text-slate-600"> · {p.role === 'owner' ? 'owner' : 'collaborator'}</span></li>)}
          </ul>
        )}
      </div>
      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="bg-primary text-white rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40">{busy ? 'Sending…' : submitLabel}</button>
        {onCancel && <button type="button" onClick={onCancel} className="text-sm text-slate-600 underline">Cancel</button>}
        <span className={`ml-auto text-[11px] ${over ? 'text-red-700 font-semibold' : 'text-slate-400'}`} aria-live="off">{text.trim().length > MAX_BODY - 200 ? `${text.trim().length}/${MAX_BODY}` : 'Ctrl/Cmd+Enter to send'}</span>
      </div>
    </div>
  )
}

function Person({ name }: { name: string }) {
  return <span aria-hidden className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0" style={{ background: `hsl(${hue(name)} 55% 42%)` }}>{(name.trim()[0] ?? '?').toUpperCase()}</span>
}

function Item({ deckId, c, people, owner, onChange, first, threadId, canDeleteAny }: { deckId: string; c: CommentItem; people: CommentPerson[]; owner: boolean; onChange: () => void; first: boolean; threadId: string; canDeleteAny: boolean }) {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (busy || !confirm(first ? 'Delete this comment and its replies?' : 'Delete this reply?')) return
    setBusy(true); setError(null)
    try { await api.deleteComment(deckId, c.id); onChange() } catch (e) { setError(messageOf(e)) } finally { setBusy(false) }
  }
  void threadId; void owner
  return (
    <li className="flex gap-2" data-comment-id={c.id}>
      <Person name={c.authorName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold">{c.mine ? 'You' : c.authorName}</span>
          <time dateTime={c.createdAt} className="text-[11px] text-slate-500">{ago(c.createdAt)}</time>
          {c.editedAt && <span className="text-[11px] text-slate-500">edited</span>}
        </div>
        {editing ? (
          <Composer label="Edit comment" placeholder="" initial={showMentions(c.body, people)} submitLabel="Save" people={people} autoFocus onCancel={() => setEditing(false)} onSubmit={async (t) => { await api.editComment(deckId, c.id, t); setEditing(false); onChange() }} />
        ) : (
          <>
            <Body text={c.body} people={people} />
            {(c.mine || canDeleteAny) && (
              <div className="flex gap-3 mt-0.5 text-[11px] text-slate-500">
                {c.mine && <button onClick={() => setEditing(true)} aria-label={`Edit comment by ${c.authorName}`} className="hover:underline">Edit</button>}
                <button onClick={() => void remove()} disabled={busy} aria-label={`Delete comment by ${c.authorName}`} className="hover:underline">Delete</button>
              </div>
            )}
          </>
        )}
        {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
      </div>
    </li>
  )
}

function Thread({ deckId, t, pinNo, slideNo, people, owner, seenAt, focused, onChange }: { deckId: string; t: CommentThread; pinNo: number | null; slideNo: number | null; people: CommentPerson[]; owner: boolean; seenAt: string; focused: boolean; onChange: () => void }) {
  const setActive = useUi((s) => s.setActiveSlide)
  const [replying, setReplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [focused])
  const unread = isUnread(t, seenAt)
  async function toggle() { setError(null); try { await api.setThreadStatus(deckId, t.id, t.status === 'open' ? 'resolved' : 'open'); onChange() } catch (e) { setError(messageOf(e)) } }
  return (
    <article ref={ref} data-thread-id={t.id} data-status={t.status} aria-label={`Comment thread${pinNo ? ` ${pinNo}` : ''}`} className={`rounded-xl border p-3 space-y-2 ${focused ? 'border-primary ring-2 ring-primary/30' : 'border-border'} ${t.status === 'resolved' ? 'bg-slate-50' : 'bg-white'}`}
      onClick={() => { if (slideNo !== null) setActive(t.slideId); useComments.getState().setFocus(t.id) }}>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        {pinNo !== null ? <span className="w-5 h-5 rounded-full bg-primary text-white grid place-items-center font-bold" title="Pinned on the slide">{pinNo}</span> : <span>On the slide</span>}
        {unread && <span aria-label="Unread" className="w-2 h-2 rounded-full bg-red-500" />}
        {t.status === 'resolved' && <span className="font-semibold text-green-700">Resolved{t.resolvedByName ? ` by ${t.resolvedByName}` : ''}</span>}
      </div>
      <ul className="space-y-2.5">
        {t.comments.map((c, i) => <Item key={c.id} deckId={deckId} c={c} people={people} owner={owner} onChange={onChange} first={i === 0} threadId={t.id} canDeleteAny={owner} />)}
      </ul>
      {replying ? (
        <Composer label="Reply" placeholder="Write a reply…" submitLabel="Reply" people={people} autoFocus onCancel={() => setReplying(false)} onSubmit={async (text) => { await api.replyComment(deckId, t.id, text); setReplying(false); onChange() }} />
      ) : (
        <div className="flex gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setReplying(true)} className="font-medium text-primary hover:underline">Reply</button>
          <button onClick={() => void toggle()} className="text-slate-600 hover:underline">{t.status === 'open' ? 'Resolve' : 'Reopen'}</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
    </article>
  )
}

type Filter = 'open' | 'resolved' | 'all'
export function CommentsPanel({ doc, slideId, deckId, role, onClose }: { doc: Presentation; slideId: string; deckId: string; role: 'owner' | 'editor'; onClose: () => void }) {
  const { threads, people, seenAt, loaded, error, placing, pending, focus, setPlacing, setPending, refresh, markSeen } = useComments()
  const setActive = useUi((s) => s.setActiveSlide)
  const connected = useLive((s) => s.connected)
  const [filter, setFilter] = useState<Filter>('open')
  const [scope, setScope] = useState<'all' | 'slide'>('all')
  const slideNo = (id: string) => { const i = doc.slides.findIndex((s) => s.id === id); return i < 0 ? null : i + 1 }
  const here = slideNo(slideId)!

  // opening the panel (or new comments arriving while it is open) counts as reading them
  useEffect(() => { const t = setTimeout(() => void markSeen(), 700); return () => clearTimeout(t) }, [markSeen, threads.length, threads.reduce((n, t) => n + t.comments.length, 0)])
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && (placing || pending)) { setPlacing(false); setPending(null) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [placing, pending, setPlacing, setPending])

  const shown = useMemo(() => threads.filter((t) => (filter === 'all' || t.status === filter) && (scope === 'all' || t.slideId === slideId)), [threads, filter, scope, slideId])
  // pin numbers: open pinned threads on a slide, in the order they were made (the same numbers the slide shows)
  const pinNo = useMemo(() => { const m = new Map<string, number>(); const per = new Map<string, number>(); for (const t of threads) { if (t.x === null || t.status !== 'open') continue; const n = (per.get(t.slideId) ?? 0) + 1; per.set(t.slideId, n); m.set(t.id, n) } return m }, [threads])
  const groups = useMemo(() => {
    const out: { key: string; title: string; slideId: string | null; threads: CommentThread[] }[] = []
    for (const s of doc.slides) { const ts = shown.filter((t) => t.slideId === s.id); if (ts.length || (scope === 'slide' && s.id === slideId)) out.push({ key: s.id, title: `Slide ${slideNo(s.id)}`, slideId: s.id, threads: ts }) }
    const gone = shown.filter((t) => slideNo(t.slideId) === null)
    if (gone.length) out.push({ key: 'removed', title: 'On removed slides', slideId: null, threads: gone })
    return out
  }, [doc.slides, shown, scope, slideId])

  const counts = { open: threads.filter((t) => t.status === 'open').length, resolved: threads.filter((t) => t.status === 'resolved').length }
  const change = () => refresh()
  return (
    <aside aria-label="Comments" className="w-[360px] max-lg:fixed max-lg:z-40 max-lg:right-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-2xl max-md:left-0 max-md:top-auto max-md:h-[70vh] max-md:rounded-t-2xl max-md:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold">Comments</h2>
        <button onClick={onClose} aria-label="Close comments panel" className="text-xl leading-none text-slate-500 hover:text-slate-800"><X aria-hidden size={20} /></button>
      </div>
      <div className="px-4 pt-3 pb-3 border-b border-border space-y-2">
        <div className="text-sm font-medium">Comment on slide {here}</div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setPlacing(!placing)} aria-pressed={placing} className={`rounded-full border px-2.5 py-1 font-medium ${placing ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-slate-50'} inline-flex items-center gap-1`}><MapPin aria-hidden size={14} />{pending ? 'Move pin' : 'Pin to a spot'}</button>
          {placing && <span role="status" className="text-primary font-medium">Click the slide where it belongs · Esc cancels</span>}
          {pending && !placing && <><span role="status" className="text-slate-600">Pinned on slide {slideNo(pending.slideId)}</span><button onClick={() => setPending(null)} className="underline text-slate-500">Remove pin</button></>}
        </div>
        <Composer key={`${slideId}`} label="Write a comment" placeholder={people.length > 1 ? 'Add a comment… use @ to mention someone' : 'Add a comment…'} submitLabel="Comment" people={people}
          onSubmit={async (text) => { const p = pending && pending.slideId === slideId ? pending : null; const r = await api.addComment(deckId, { slideId, ...(p ? { x: p.x, y: p.y } : {}), body: text }); setPending(null); useComments.getState().setFocus(r.threadId); change() }} />
      </div>
      <div className="px-4 py-2 flex flex-wrap items-center gap-1.5 border-b border-border">
        {(['open', 'resolved', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={`px-2.5 py-1 rounded-full text-xs ${filter === f ? 'bg-foreground text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{f === 'open' ? `Open (${counts.open})` : f === 'resolved' ? `Resolved (${counts.resolved})` : 'All'}</button>
        ))}
        <button onClick={() => setScope(scope === 'all' ? 'slide' : 'all')} aria-pressed={scope === 'slide'} className="ml-auto text-xs underline text-slate-600">{scope === 'all' ? 'Only this slide' : 'All slides'}</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error} <button onClick={refresh} className="underline">Try again</button></p>}
        {!connected && loaded && <p className="text-[11px] text-slate-500">Updates arrive every minute while the live connection is off.</p>}
        {!loaded && <p className="text-sm text-slate-500">Loading…</p>}
        {loaded && threads.length === 0 && (
          <div className="text-sm text-slate-600 space-y-1" aria-label="No comments yet">
            <p className="font-medium">No comments yet</p>
            <p>Comments are working notes for the people who edit this presentation. They never appear on the slides, in Present mode or in exports.{role === 'owner' ? ' Invite people from Share to discuss it together.' : ''}</p>
          </div>
        )}
        {loaded && threads.length > 0 && shown.length === 0 && <p className="text-sm text-slate-500">{filter === 'open' ? 'No open comments' : filter === 'resolved' ? 'Nothing resolved yet' : 'No comments'}{scope === 'slide' ? ' on this slide' : ''}.</p>}
        {groups.map((g) => (
          <section key={g.key} aria-label={g.title} className="space-y-2">
            <button onClick={() => g.slideId && setActive(g.slideId)} disabled={!g.slideId} className={`text-xs font-bold tracking-wide ${g.slideId === slideId ? 'text-primary' : 'text-slate-500'}`}>{g.title.toUpperCase()}{g.slideId === slideId ? ' · THIS SLIDE' : ''}</button>
            {g.threads.map((t) => <Thread key={t.id} deckId={deckId} t={t} pinNo={pinNo.get(t.id) ?? null} slideNo={slideNo(t.slideId)} people={people} owner={role === 'owner'} seenAt={seenAt} focused={focus === t.id} onChange={change} />)}
          </section>
        ))}
      </div>
    </aside>
  )
}
