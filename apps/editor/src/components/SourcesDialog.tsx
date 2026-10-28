import { Portal } from '@/components/Portal'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError, type SourceSummary } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useDialog } from '@/lib/useDialog'
import { useEntitlements } from '@/lib/entitlements'

type Tab = 'text' | 'link' | 'file' | 'research'
const MAX_SOURCES = 10
/** shown to the person before they spend it; the server charges the price in its own table (credit_cost: web_research) */
const WEB_CREDITS = 60

/** Attach reference material: pasted text, a web page, or a PDF. Each becomes a server-side source with page/section locators. */
export function SourcesDialog({ count, language, onAdd, onClose }: { count: number; language?: string; onAdd: (s: SourceSummary) => void; onClose: () => void }) {
  const { ent, upgrade, refresh } = useEntitlements()
  const [mode, setMode] = useState<'wikipedia' | 'web'>('wikipedia')
  const requestId = useRef(crypto.randomUUID())
  const [tab, setTab] = useState<Tab>('file')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const dialogRef = useDialog<HTMLDivElement>(true, onClose)

  async function run(fn: () => Promise<SourceSummary>) {
    if (count >= MAX_SOURCES) return setError(`You can attach up to ${MAX_SOURCES} sources.`)
    setBusy(true)
    setError(null)
    try {
      onAdd(await fn())
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Wikipedia / web facts come back as several sources at once; each is added, then the dialog closes. */
  async function runResearch(query: string) {
    const have = ent?.features.webData ?? 'none'
    if (mode === 'wikipedia' && have === 'none') return upgrade.show('Wikipedia data is available on the Pro plan.')
    if (mode === 'web' && have !== 'web') return upgrade.show('Live web search is available on the Gold plan.')
    if (count >= MAX_SOURCES) return setError(`You can attach up to ${MAX_SOURCES} sources.`)
    setBusy(true)
    setError(null)
    try {
      const r = await api.research({ query, mode, ...(language ? { language } : {}), requestId: requestId.current })
      for (const s of r.sources.slice(0, Math.max(0, MAX_SOURCES - count))) onAdd(s)
      requestId.current = crypto.randomUUID()
      void refresh() // credits changed
      onClose()
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'UPGRADE_REQUIRED' || e.code === 'INSUFFICIENT_CREDITS')) upgrade.show(e.message)
      else setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (tab === 'research') return void runResearch(String(f.get('query')).trim())
    if (tab === 'link') return void run(() => api.addUrlSource(String(f.get('url'))))
    if (tab === 'text') return void run(() => api.addTextSource(String(f.get('text')), String(f.get('title') ?? '')))
    const picked = file.current?.files?.[0]
    if (!picked) return setError('Choose a file first.')
    if (picked.size > 15 * 1024 * 1024) return setError('That file is larger than 15 MB.')
    void run(() => api.addFileSource(picked))
  }

  const input = 'w-full border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary'
  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add sources" className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-xl">Add sources</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-xl leading-none">×</button>
        </div>
        <div role="tablist" className="flex gap-2 mb-4">
          {([['file', 'Upload file'], ['link', 'Website link'], ['text', 'Paste text'], ['research', 'Wikipedia & web']] as const).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(null) }} className={`px-3 py-1.5 rounded-full text-sm font-medium ${tab === t ? 'bg-foreground text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          {tab === 'research' && (
            <>
              <input name="query" required minLength={3} maxLength={300} placeholder="A topic, e.g. Solar energy in India" aria-label="Topic to research" className={input} />
              <div role="radiogroup" aria-label="Where to look" className="grid gap-2">
                {([['wikipedia', 'Wikipedia', 'Free. Up to 3 articles, cited on the slides.', 'none'], ['web', 'Live web search', `Current facts from the web. Costs ${WEB_CREDITS} credits.`, 'web']] as const).map(([m, label, hint, need]) => {
                  const locked = need === 'web' ? ent?.features.webData !== 'web' : (ent?.features.webData ?? 'none') === 'none'
                  return (
                    <label key={m} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${mode === m ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="mt-1" />
                      <span className="text-sm"><span className="font-semibold">{label}</span>{locked && <span className="ml-2 text-xs font-semibold text-primary">{m === 'web' ? 'Gold' : 'Pro'}</span>}<span className="block text-xs text-slate-500">{hint}</span></span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
          {tab === 'link' && <input name="url" type="url" required placeholder="https://example.com/article or a Google Doc link" aria-label="Page URL" className={input} />}
          {tab === 'link' && <p className="text-xs text-slate-500">Websites, or a Google Doc, Sheet or Slides shared with “Anyone with the link”.</p>}
          {tab === 'file' && (
            <>
              <input ref={file} type="file" accept=".pdf,.docx,.docm,.pptx,.xlsx,.xlsm,.csv,.tsv,.eml,.txt,.md" aria-label="File" className={input} />
              <p className="text-xs text-slate-500">PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, email (.eml) or text/Markdown — up to 15 MB. Old .doc / .xls / .ppt files: save them in the newer format first.</p>
            </>
          )}
          {tab === 'text' && (
            <>
              <input name="title" maxLength={200} placeholder="Title (optional)" aria-label="Title" className={input} />
              <textarea name="text" required minLength={20} maxLength={200000} rows={7} placeholder="Paste notes, an article, data…" aria-label="Text" className={input} />
            </>
          )}
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
          <p className="text-xs text-slate-500">Sources are private to you. The AI treats them as reference data only and cites them on slides.</p>
          <button type="submit" disabled={busy} className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold disabled:opacity-60">{busy ? (tab === 'research' ? 'Searching…' : 'Reading…') : tab === 'research' ? 'Find facts' : 'Add source'}</button>
        </form>
      </div>
    </div></Portal>
  )
}
