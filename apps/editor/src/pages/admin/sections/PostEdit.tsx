import { ArrowLeft, Bold, CalendarClock, Code, ExternalLink, Heading2, Heading3, ImageIcon, Italic, Link2, List, ListOrdered, Quote, Trash2 } from '@prompttoppt/ui/icons'
import { Markdown } from '@prompttoppt/ui/markdown'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '@/lib/api'
import { API_URL, WEB_URL } from '@/lib/env'
import { SectionPage, ErrorBox, dateTime } from '../ui'
import { KIND_ICON, KIND_LABEL, type Kind } from './Posts'

interface Full { id: string; kind: Kind; slug: string; title: string; summary: string; body: string; coverUrl: string | null; coverAlt: string | null; tags: string[]; section: string | null; sortOrder: number; sourceName: string | null; sourceUrl: string | null; trending: boolean; featured: boolean; seoTitle: string | null; seoDescription: string | null; authorName: string; state: 'draft' | 'scheduled' | 'published'; publishedAt: string | null; updatedAt: string }
interface Form { title: string; slug: string; summary: string; body: string; coverUrl: string; coverAlt: string; tags: string; section: string; sortOrder: string; sourceName: string; sourceUrl: string; trending: boolean; featured: boolean; seoTitle: string; seoDescription: string; authorName: string }
const EMPTY: Form = { title: '', slug: '', summary: '', body: '', coverUrl: '', coverAlt: '', tags: '', section: '', sortOrder: '0', sourceName: '', sourceUrl: '', trending: false, featured: false, seoTitle: '', seoDescription: '', authorName: 'SlidesDone team' }
const toForm = (p: Full): Form => ({ title: p.title, slug: p.slug, summary: p.summary, body: p.body, coverUrl: p.coverUrl ?? '', coverAlt: p.coverAlt ?? '', tags: p.tags.join(', '), section: p.section ?? '', sortOrder: String(p.sortOrder), sourceName: p.sourceName ?? '', sourceUrl: p.sourceUrl ?? '', trending: p.trending, featured: p.featured, seoTitle: p.seoTitle ?? '', seoDescription: p.seoDescription ?? '', authorName: p.authorName })
const SUMMARY_MAX: Record<Kind, number> = { blog: 320, news: 500, guide: 240 }
const WEB_PATH: Record<Kind, string> = { blog: 'blog', news: 'news', guide: 'guides' }
const slugOf = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
const BOX = 'w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary'

function Field({ label, hint, children, right }: { label: string; hint?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="flex items-baseline justify-between gap-3"><span className="text-sm font-semibold">{label}</span>{right}</span>
      {hint && <span className="block text-xs text-slate-500 mb-1">{hint}</span>}
      <span className="block mt-1">{children}</span>
    </label>
  )
}

/** Owner: write or edit one post. New posts start by choosing the type; the form then shows only what that type needs. */
export default function PostEdit() {
  const { id = 'new' } = useParams()
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const kindParam = sp.get('kind') as Kind | null
  const [kind, setKind] = useState<Kind | null>(id === 'new' ? (['blog', 'news', 'guide'].includes(kindParam ?? '') ? kindParam : null) : null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saved, setSaved] = useState<Form>(EMPTY)
  const [meta, setMeta] = useState<Pick<Full, 'state' | 'publishedAt'> | null>(null)
  const [slugTouched, setSlugTouched] = useState(false)
  const [loading, setLoading] = useState(id !== 'new')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [when, setWhen] = useState('')
  const [sections, setSections] = useState<string[]>([])
  const loadedId = useRef<string | null>(null) // the post this page already holds, so saving a new post does not re-fetch it over what is being typed
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setNote(null); setForm((f) => ({ ...f, [k]: v })) }

  const apply = useCallback((p: Full) => { loadedId.current = p.id; setKind(p.kind); const f = toForm(p); setForm(f); setSaved(f); setMeta({ state: p.state, publishedAt: p.publishedAt }); setSlugTouched(true) }, [])
  useEffect(() => {
    if (id === 'new' || loadedId.current === id) return
    api.admin.get<Full>(`/posts/${id}`).then((p) => { apply(p); setLoading(false) }).catch((e: Error) => { setError(e.message); setLoading(false) })
  }, [id, apply])
  useEffect(() => { if (kind === 'guide') api.admin.get<{ items: { section: string | null }[] }>('/posts', { kind: 'guide' }).then((r) => setSections([...new Set(r.items.map((i) => i.section).filter((s): s is string => !!s))])).catch(() => undefined) }, [kind])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const payload = (withSlug = true) => ({
    title: form.title.trim(), ...(withSlug && form.slug.trim() ? { slug: form.slug.trim() } : {}), summary: form.summary.trim(), body: form.body,
    coverUrl: form.coverUrl || null, coverAlt: form.coverAlt.trim() || null, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    section: form.section.trim() || null, sortOrder: Math.max(0, Number.parseInt(form.sortOrder, 10) || 0), sourceName: form.sourceName.trim() || null, sourceUrl: form.sourceUrl.trim() || null,
    trending: form.trending, featured: form.featured, seoTitle: form.seoTitle.trim() || null, seoDescription: form.seoDescription.trim() || null, authorName: form.authorName.trim() || 'SlidesDone team',
  })

  /** saves the form; returns the post id (new posts are created on the first save) */
  async function save(): Promise<string | null> {
    setError(null)
    try {
      if (id === 'new') {
        const p = await api.admin.send<Full>('POST', '/posts', { kind, ...payload() })
        apply(p); navigate(`/admin/posts/${p.id}`, { replace: true }); return p.id
      }
      const p = await api.admin.send<Full>('PATCH', `/posts/${id}`, { ...payload(false), ...(form.slug.trim() && form.slug.trim() !== saved.slug ? { slug: form.slug.trim() } : {}) })
      apply(p); return p.id
    } catch (e) { setError((e as Error).message); return null }
  }
  async function run(name: string, fn: () => Promise<void>) { setBusy(name); try { await fn() } finally { setBusy(null) } }
  const onSave = () => run('save', async () => { if (await save()) setNote('Saved.') })
  async function publish(at?: string) {
    const pid = dirty || id === 'new' ? await save() : id
    if (!pid) return
    try { const p = await api.admin.send<Full>('POST', `/posts/${pid}/publish`, at ? { publishedAt: at } : {}); apply(p); setNote(p.state === 'scheduled' ? `Scheduled for ${dateTime(p.publishedAt!)}.` : 'Published. It is live on the website.') }
    catch (e) { setError((e as Error).message) }
  }
  const onUnpublish = () => run('unpublish', async () => { try { apply(await api.admin.send<Full>('POST', `/posts/${id}/unpublish`)); setNote('Back to draft. It is no longer on the website.') } catch (e) { setError((e as Error).message) } })
  const onDelete = () => run('delete', async () => { if (!confirm('Delete this post for good? This cannot be undone.')) return; try { await api.admin.send('DELETE', `/posts/${id}`); setSaved(form); navigate('/admin/posts', { replace: true }) } catch (e) { setError((e as Error).message) } })

  // Ctrl/Cmd+S saves
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && kind) { e.preventDefault(); void onSave() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  async function upload(file: File | undefined): Promise<string | null> {
    if (!file) return null
    setError(null)
    try { return (await api.admin.upload<{ url: string }>('/posts/images/upload', file)).url } catch (e) { setError((e as Error).message); return null }
  }
  /** wrap the selected text (or insert a placeholder) in the article box */
  function wrap(before: string, after = before, placeholder = 'text') {
    const el = bodyRef.current; if (!el) return
    const { selectionStart: a, selectionEnd: b, value } = el
    const sel = value.slice(a, b) || placeholder
    set('body', `${value.slice(0, a)}${before}${sel}${after}${value.slice(b)}`)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + before.length, a + before.length + sel.length) })
  }
  function linePrefix(prefix: string) {
    const el = bodyRef.current; if (!el) return
    const { selectionStart: a, value } = el
    const start = value.lastIndexOf('\n', a - 1) + 1
    set('body', `${value.slice(0, start)}${prefix}${value.slice(start)}`)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + prefix.length, a + prefix.length) })
  }
  const TOOLS = [[Bold, 'Bold'], [Italic, 'Italic'], [Heading2, 'Heading'], [Heading3, 'Smaller heading'], [Link2, 'Link'], [List, 'Bulleted list'], [ListOrdered, 'Numbered list'], [Quote, 'Quote'], [Code, 'Code']] as const
  function tool(label: (typeof TOOLS)[number][1]) {
    if (label === 'Bold') wrap('**'); else if (label === 'Italic') wrap('*'); else if (label === 'Heading') linePrefix('## '); else if (label === 'Smaller heading') linePrefix('### ')
    else if (label === 'Link') wrap('[', '](https://)', 'link text'); else if (label === 'Bulleted list') linePrefix('- '); else if (label === 'Numbered list') linePrefix('1. '); else if (label === 'Quote') linePrefix('> '); else wrap('`')
  }
  async function insertImage(file: File | undefined) {
    const url = await upload(file); if (!url) return
    const el = bodyRef.current; const at = el?.selectionStart ?? form.body.length
    set('body', `${form.body.slice(0, at)}\n\n![Describe the picture](${url})\n\n${form.body.slice(at)}`)
  }

  const Icon = kind ? KIND_ICON[kind] : null
  const liveUrl = meta && kind && meta.state !== 'draft' ? `${WEB_URL}/${WEB_PATH[kind]}/${saved.slug}` : null
  const summaryMax = kind ? SUMMARY_MAX[kind] : 320
  const preview = useMemo(() => form.body, [form.body])

  if (loading) return <SectionPage title="Loading…" subtitle="" noRange loading>{null}</SectionPage>
  if (!kind) {
    return (
      <SectionPage title="What are you writing?" subtitle="Choose the type. You can't change it later, and each type has its own fields." noRange error={error}>
        <div className="grid gap-4 md:grid-cols-3">
          {([['blog', 'Blog article', 'A full article for marketing and search: title, cover picture, tags, a long text with headings and pictures.'], ['news', 'Tech news', 'A short news item: a headline, two or three lines, the source and a link to the original. Mark the big ones as trending.'], ['guide', 'Guide', 'A how-to page for the Guides section: grouped under a section and ordered, with an "On this page" list.']] as const).map(([k, t, d]) => { const I = KIND_ICON[k]; return (
            <button key={k} onClick={() => setKind(k)} className="text-left bg-white border border-border rounded-xl p-5 hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-primary">
              <I aria-hidden size={24} className="text-slate-600" /><h2 className="mt-3 font-bold text-lg">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p>
            </button>
          ) })}
        </div>
        <Link to="/admin/posts" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"><ArrowLeft aria-hidden size={14} />Back to all posts</Link>
      </SectionPage>
    )
  }

  const isNew = id === 'new'
  const state = meta?.state ?? 'draft'

  return (
    <SectionPage title={isNew ? `New ${KIND_LABEL[kind].toLowerCase()}` : form.title || KIND_LABEL[kind]} subtitle={`${KIND_LABEL[kind]}${isNew ? ' · not saved yet' : ` · ${state}${meta?.publishedAt && state !== 'draft' ? ` · ${state === 'scheduled' ? 'goes live' : 'since'} ${dateTime(meta.publishedAt)}` : ''}`}`} noRange
      actions={<Link to="/admin/posts" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"><ArrowLeft aria-hidden size={14} />All posts</Link>}>
      {error && <ErrorBox message={error} />}
      {note && <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3 mb-4">{note}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <div className="bg-white border border-border rounded-xl p-5">
          <Field label={kind === 'news' ? 'Headline' : 'Title'}>
            <input value={form.title} maxLength={160} onChange={(e) => { set('title', e.target.value); if (!slugTouched) set('slug', slugOf(e.target.value)) }} className={BOX} placeholder={kind === 'news' ? 'Short, clear headline' : kind === 'guide' ? 'How to …' : 'A title people want to click'} />
          </Field>
          <Field label="Web address" hint={`${WEB_URL.replace(/^https?:\/\//, '')}/${WEB_PATH[kind]}/…`}>
            <input value={form.slug} maxLength={80} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')) }} className={`${BOX} font-mono`} placeholder="made-from-the-title" />
            {!isNew && state !== 'draft' && form.slug !== saved.slug && <span className="block text-xs text-amber-700 mt-1">This post is live. Changing the address breaks links that already point to it.</span>}
          </Field>
          <Field label={kind === 'news' ? 'The news (2–3 lines)' : 'Summary'} hint={kind === 'news' ? 'This is the news item itself. Write it so people understand it without clicking.' : 'Shown in lists, on Google and when the link is shared.'}
            right={<span className={`text-xs tabular-nums ${form.summary.length > summaryMax ? 'text-red-700 font-semibold' : 'text-slate-500'}`}>{form.summary.length}/{summaryMax}</span>}>
            <textarea value={form.summary} rows={kind === 'news' ? 4 : 3} onChange={(e) => set('summary', e.target.value)} className={BOX} />
          </Field>

          {kind === 'news' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Source name" hint="Who reported it, for example The Verge."><input value={form.sourceName} maxLength={80} onChange={(e) => set('sourceName', e.target.value)} className={BOX} /></Field>
              <Field label="Link to the original" hint="Starts with https://"><input value={form.sourceUrl} inputMode="url" onChange={(e) => set('sourceUrl', e.target.value)} className={BOX} placeholder="https://" /></Field>
            </div>
          )}

          <div className="mb-1 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold">{kind === 'news' ? 'Longer write-up (optional)' : 'Article'}</span>
            <div role="tablist" aria-label="Editor view" className="flex gap-1 text-sm">
              {(['write', 'preview'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-md font-semibold capitalize ${tab === t ? 'bg-foreground text-white' : 'bg-slate-100'}`}>{t}</button>)}
            </div>
          </div>
          {tab === 'write' ? (
            <>
              <div className="flex flex-wrap gap-1 mb-2" role="toolbar" aria-label="Formatting">
                {TOOLS.map(([I, label]) => <button key={label} type="button" title={label} aria-label={label} onClick={() => tool(label)} className="w-8 h-8 grid place-items-center rounded-md border border-border bg-white hover:bg-slate-50"><I aria-hidden size={16} /></button>)}
                <button type="button" onClick={() => imgInput.current?.click()} className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-border bg-white hover:bg-slate-50 text-xs font-semibold"><ImageIcon aria-hidden size={14} />Add picture</button>
                <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a picture to add to the article" onChange={(e) => { void insertImage(e.target.files?.[0]); e.target.value = '' }} />
              </div>
              <textarea ref={bodyRef} value={form.body} onChange={(e) => set('body', e.target.value)} rows={22} aria-label="Article text" spellCheck className={`${BOX} font-mono leading-6`} placeholder={'Write in Markdown.\n\n## A heading\nA paragraph with **bold** and a [link](https://example.com).\n\n- a list'} />
              <p className="text-xs text-slate-500 mt-1">Markdown: ## heading, **bold**, *italic*, [text](link), - list, &gt; quote. Raw HTML is not shown. {form.body.trim() ? `${form.body.trim().split(/\s+/).length} words` : ''}</p>
            </>
          ) : <div className="border border-border rounded-lg p-5 min-h-[300px]">{preview.trim() ? <Markdown assetBase={API_URL}>{preview}</Markdown> : <p className="text-sm text-slate-500">Nothing to preview yet.</p>}</div>}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="bg-white border border-border rounded-xl p-5" aria-label="Publish">
            <h2 className="font-semibold mb-3 flex items-center gap-2">{Icon && <Icon aria-hidden size={16} />}Publish</h2>
            <div className="flex flex-col gap-2">
              <button onClick={onSave} disabled={busy !== null || form.title.trim().length < 3 || !dirty && !isNew} className="h-10 rounded-lg border border-border bg-white font-semibold text-sm disabled:opacity-50">{busy === 'save' ? 'Saving…' : isNew ? 'Save draft' : 'Save changes'}{dirty && !isNew && <span className="text-xs font-normal text-slate-500"> (unsaved)</span>}</button>
              {state !== 'published' && <button onClick={() => void run('publish', () => publish())} disabled={busy !== null || form.title.trim().length < 3} className="h-10 rounded-lg bg-green-700 text-white font-semibold text-sm disabled:opacity-50">{busy === 'publish' ? 'Publishing…' : 'Publish now'}</button>}
              {state === 'published' && dirty && <p className="text-xs text-slate-600">Save changes to update the live page.</p>}
              {state !== 'draft' && <button onClick={() => void onUnpublish()} disabled={busy !== null} className="h-10 rounded-lg border border-border bg-white font-semibold text-sm">Unpublish (back to draft)</button>}
            </div>
            {state !== 'published' && (
              <div className="mt-4 pt-4 border-t border-border">
                <label className="text-sm font-semibold flex items-center gap-1.5" htmlFor="when"><CalendarClock aria-hidden size={14} />Or publish on a date</label>
                <input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${BOX} mt-1`} />
                <button onClick={() => void run('schedule', () => publish(new Date(when).toISOString()))} disabled={!when || busy !== null || form.title.trim().length < 3} className="mt-2 w-full h-10 rounded-lg border border-border bg-white font-semibold text-sm disabled:opacity-50">Schedule</button>
              </div>
            )}
            {liveUrl && <a href={liveUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">View on the website<ExternalLink aria-hidden size={14} /></a>}
          </section>

          {(
            <section className="bg-white border border-border rounded-xl p-5" aria-label="Picture">
              <h2 className="font-semibold mb-3">{kind === 'news' ? 'Picture (optional)' : 'Cover picture'}</h2>
              {form.coverUrl && <img src={`${API_URL}${form.coverUrl}`} alt={form.coverAlt || 'Cover'} className="w-full rounded-lg border border-border mb-3" />}
              <div className="flex gap-2">
                <button type="button" onClick={() => coverInput.current?.click()} className="h-9 px-3 rounded-lg border border-border bg-white text-sm font-semibold">{form.coverUrl ? 'Replace' : 'Upload picture'}</button>
                {form.coverUrl && <button type="button" onClick={() => set('coverUrl', '')} className="h-9 px-3 rounded-lg text-sm font-semibold text-red-700 inline-flex items-center gap-1"><Trash2 aria-hidden size={14} />Remove</button>}
                <input ref={coverInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a cover picture" onChange={(e) => { void upload(e.target.files?.[0]).then((u) => { if (u) set('coverUrl', u) }); e.target.value = '' }} />
              </div>
              <p className="text-xs text-slate-500 mt-2">PNG, JPG or WebP, up to 5 MB. Wide pictures (16:9) look best.</p>
              {form.coverUrl && <label className="block mt-3"><span className="text-sm font-semibold">Describe the picture</span><input value={form.coverAlt} maxLength={160} onChange={(e) => set('coverAlt', e.target.value)} className={`${BOX} mt-1`} placeholder="For people who cannot see it, and for Google" /></label>}
            </section>
          )}

          <section className="bg-white border border-border rounded-xl p-5" aria-label="Details">
            <h2 className="font-semibold mb-3">Details</h2>
            <Field label="Tags" hint="Separate with commas, up to 8."><input value={form.tags} onChange={(e) => set('tags', e.target.value)} className={BOX} placeholder="ai, presentations" /></Field>
            {kind === 'guide' && (
              <>
                <Field label="Section" hint="The group on the Guides page, for example Getting started.">
                  <input value={form.section} list="guide-sections" maxLength={60} onChange={(e) => set('section', e.target.value)} className={BOX} />
                  <datalist id="guide-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
                </Field>
                <Field label="Order" hint="Smaller numbers come first (10, 20, 30 …)."><input type="number" min={0} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} className={BOX} /></Field>
              </>
            )}
            {kind === 'news' && <label className="flex items-start gap-2 text-sm mb-3"><input type="checkbox" checked={form.trending} onChange={(e) => set('trending', e.target.checked)} className="mt-1" /><span><strong>Trending</strong><span className="block text-xs text-slate-500">Show it in the Trending strip at the top of the news page.</span></span></label>}
            {kind === 'blog' && <label className="flex items-start gap-2 text-sm mb-3"><input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} className="mt-1" /><span><strong>Featured</strong><span className="block text-xs text-slate-500">Show it as the big card at the top of the blog.</span></span></label>}
            <Field label="Author name"><input value={form.authorName} maxLength={60} onChange={(e) => set('authorName', e.target.value)} className={BOX} /></Field>
          </section>

          <details className="bg-white border border-border rounded-xl p-5">
            <summary className="font-semibold cursor-pointer">Search engines (optional)</summary>
            <div className="mt-3">
              <Field label="Search title" hint="Leave empty to use the title." right={<span className="text-xs tabular-nums text-slate-500">{form.seoTitle.length}/70</span>}><input value={form.seoTitle} maxLength={70} onChange={(e) => set('seoTitle', e.target.value)} className={BOX} /></Field>
              <Field label="Search description" hint="Leave empty to use the summary." right={<span className="text-xs tabular-nums text-slate-500">{form.seoDescription.length}/170</span>}><textarea rows={3} value={form.seoDescription} maxLength={170} onChange={(e) => set('seoDescription', e.target.value)} className={BOX} /></Field>
            </div>
          </details>

          {!isNew && <button onClick={() => void onDelete()} disabled={busy !== null} className="w-full h-10 rounded-lg text-red-700 font-semibold text-sm border border-red-200 bg-white inline-flex items-center justify-center gap-1.5"><Trash2 aria-hidden size={14} />Delete this post</button>}
        </aside>
      </div>
    </SectionPage>
  )
}
