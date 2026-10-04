import { Portal } from '@/components/Portal'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError, type SourceSummary } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useDialog } from '@/lib/useDialog'

type Tab = 'text' | 'link' | 'file'
const MAX_SOURCES = 10

/** Attach reference material: pasted text, a web page, or a PDF. Each becomes a server-side source with page/section locators. */
export function SourcesDialog({ count, onAdd, onClose }: { count: number; onAdd: (s: SourceSummary) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('link')
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

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
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
          {([['link', 'Website link'], ['file', 'File'], ['text', 'Paste text']] as const).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(null) }} className={`px-3 py-1.5 rounded-full text-sm font-medium ${tab === t ? 'bg-foreground text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          {tab === 'link' && <input name="url" type="url" required placeholder="https://example.com/article" aria-label="Page URL" className={input} />}
          {tab === 'file' && (
            <>
              <input ref={file} type="file" accept=".pdf,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown" aria-label="File" className={input} />
              <p className="text-xs text-slate-500">PDF (up to 10 MB), PowerPoint .pptx (up to 15 MB) or text/Markdown. Old .ppt files: save as .pptx first.</p>
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
          <button type="submit" disabled={busy} className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold disabled:opacity-60">{busy ? 'Reading…' : 'Add source'}</button>
        </form>
      </div>
    </div></Portal>
  )
}
