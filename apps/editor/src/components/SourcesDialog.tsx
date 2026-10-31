import { X } from '@prompttoppt/ui/icons'
import { Portal } from '@/components/Portal'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError, type SourceSummary } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useDialog } from '@/lib/useDialog'
import { useEntitlements } from '@/lib/entitlements'

type Tab = 'text' | 'link' | 'file' | 'research' | 'youtube'
/** a youtube.com / youtu.be / shorts link: the server refuses to fetch these (YouTube does not hand captions to apps), so the dialog sends people to the transcript tab instead */
export const isYouTubeLink = (u: string) => /^https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?[^#]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/i.test(u.trim())
const MAX_SOURCES = 10
/** shown to the person before they spend it; the server charges the price in its own table (credit_cost: web_research) */
const WEB_CREDITS = 60

/** Attach reference material: pasted text, a web page, or a PDF. Each becomes a server-side source with page/section locators. */
export function SourcesDialog({ count, language, initialTab, initialUrl, onAdd, onClose }: { count: number; language?: string; initialTab?: Tab; initialUrl?: string; onAdd: (s: SourceSummary) => void; onClose: () => void }) {
  const [ytUrl, setYtUrl] = useState(initialUrl ?? '')
  const { ent, upgrade, refresh } = useEntitlements()
  const [mode, setMode] = useState<'wikipedia' | 'web'>('wikipedia')
  const requestId = useRef(crypto.randomUUID())
  const [tab, setTab] = useState<Tab>(initialTab ?? 'file')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const dialogRef = useDialog<HTMLDivElement>(true, onClose)

  async function run(fn: () => Promise<SourceSummary>) {
    if (count >= MAX_SOURCES) return setError(`You can attach up to ${MAX_SOURCES} sources.`)
    setBusy(true)
    setError(null)
    setNote('')
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
    if (tab === 'youtube') return void run(() => api.addTranscriptSource({ text: String(f.get('transcript')), ...(String(f.get('title') ?? '').trim() ? { title: String(f.get('title')).trim() } : {}), ...(ytUrl.trim() ? { url: ytUrl.trim() } : {}) }))
    if (tab === 'link') {
      const u = String(f.get('url'))
      if (isYouTubeLink(u)) { setYtUrl(u.trim()); setTab('youtube'); return setError(null) } // YouTube links are handled with the transcript
      return void run(() => api.addUrlSource(u))
    }
    if (tab === 'text') return void run(() => api.addTextSource(String(f.get('text')), String(f.get('title') ?? '')))
    const picked = file.current?.files?.[0]
    if (!picked) return setError('Choose a file first.')
    if (/\.(mp3|m4a|wav|ogg|flac|aac|mp4|mov|webm)$/i.test(picked.name)) {
      if (picked.size > 200 * 1024 * 1024) return setError('That recording is larger than 200 MB. Save a shorter part, or export just the audio, and try again.')
      if (/\.(mp4|mov|webm)$/i.test(picked.name) || picked.size > 12 * 1024 * 1024) return void run(async () => { const s = await api.addVideoSource(picked, setNote); void refresh(); return s }) // background job, 3 credits per minute
      return void run(async () => { const s = await api.addMediaSource(picked); void refresh(); return s }) // credits changed
    }
    if (/\.(jpe?g|png|webp)$/i.test(picked.name)) {
      if (picked.size > 8 * 1024 * 1024) return setError('That picture is larger than 8 MB. Save a smaller copy and try again.')
      return void run(async () => { const s = await api.addImageSource(picked); void refresh(); return s }) // credits changed
    }
    if (picked.size > 15 * 1024 * 1024) return setError('That file is larger than 15 MB.')
    void run(() => api.addFileSource(picked))
  }

  const input = 'w-full border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary'
  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add sources" className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-xl">Add sources</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800 text-xl leading-none"><X aria-hidden size={20} /></button>
        </div>
        <div role="tablist" className="flex flex-wrap gap-2 mb-4">
          {([['file', 'Upload file'], ['link', 'Website link'], ['youtube', 'YouTube / captions'], ['text', 'Paste text'], ['research', 'Wikipedia & web']] as const).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(null) }} className={`px-3 py-1.5 rounded-full text-sm font-medium ${tab === t ? 'bg-foreground text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-3">
          {tab === 'youtube' && (
            <>
              <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} type="url" placeholder="YouTube link (optional, so slides can cite the video)" aria-label="YouTube link" className={input} />
              <input name="title" maxLength={200} placeholder="Video title (optional)" aria-label="Video title" className={input} />
              <textarea name="transcript" required minLength={20} maxLength={400000} rows={6} placeholder="Paste the transcript here" aria-label="Transcript" className={input} />
              <ol className="text-xs text-slate-600 list-decimal pl-5 space-y-0.5">
                <li>Open the video on YouTube and click <strong>…more</strong> under the title to open the description.</li>
                <li>Scroll to the bottom of the description, click <strong>Show transcript</strong>, then select all the text in the panel and copy it.</li>
                <li>Paste it above. Time stamps are kept, so slides can point to the minute.</li>
              </ol>
              <p className="text-xs text-slate-500">YouTube does not let apps read captions automatically. You can also upload a caption file (.srt or .vtt) from the Upload file tab.</p>
            </>
          )}
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
              <input ref={file} type="file" accept=".pdf,.docx,.docm,.pptx,.xlsx,.xlsm,.csv,.tsv,.eml,.txt,.md,.jpg,.jpeg,.png,.webp,.srt,.vtt,.mp3,.m4a,.wav,.ogg,.flac,.aac,.mp4,.mov,.webm" aria-label="File" className={input} />
              <p className="text-xs text-slate-500">PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, email (.eml) or text/Markdown — up to 15 MB. Video caption files (.srt, .vtt) work too. A short audio clip (up to 12 MB) is transcribed by AI for 6 credits per 4 MB. A video, or a longer recording (MP4, MOV, WebM, MP3, M4A… up to 200 MB and 90 minutes), is both listened to and read off the screen in the background for 3 credits per minute; it is refunded if it fails. A JPG, PNG or WebP picture (notes, a whiteboard, a table, a chart, a screenshot — up to 8 MB) is read by AI for 4 credits. Old .doc / .xls / .ppt files: save them in the newer format first.</p>
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
          <button type="submit" disabled={busy} className="w-full bg-primary text-white rounded-lg py-2.5 font-semibold disabled:opacity-60">{busy ? (tab === 'research' ? 'Searching…' : note || 'Reading…') : tab === 'research' ? 'Find facts' : tab === 'youtube' ? 'Add transcript' : 'Add source'}</button>
        </form>
      </div>
    </div></Portal>
  )
}
