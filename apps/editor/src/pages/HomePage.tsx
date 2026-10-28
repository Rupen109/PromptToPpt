import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError, type PresentationSummary, type SourceSummary } from '@prompttoppt/api-client'
import { SourcesDialog } from '@/components/SourcesDialog'
import { api } from '@/lib/api'
import { MaintenanceBanner } from '@/lib/flags'
import { DeckThumb } from '@/components/DeckThumb'
import { Sidebar } from '@/components/Sidebar'
import { clearPending, setPendingPrompt, setPendingSources } from '@/lib/pending-prompt'

const MAX_SOURCES = 10
const FILE_TYPES = /\.(pdf|pptx|docx|docm|xlsx|xlsm|csv|tsv|eml|txt|md|markdown)$/i
/** old Office formats and Outlook's .msg are recognised only to say what to do instead */
const OLD_FORMATS: Record<string, string> = { doc: 'Old .doc files are not supported — open it in Word and save as .docx.', xls: 'Old .xls files are not supported — open it in Excel and save as .xlsx (or CSV).', ppt: 'Old .ppt files are not supported — open it in PowerPoint and save as .pptx.', msg: 'Outlook .msg files are not supported — save the email as .eml, or paste its text.' }
const SOURCE_ICON: Record<SourceSummary['type'], string> = { url: '🔗', pdf: '📄', pptx: '📊', text: '📝', docx: '📘', xlsx: '📈', csv: '🧮', email: '✉️' }
const EXAMPLES = [
  'Make a deck on Chandrayaan-3 and India’s moon mission',
  'Pitch deck for a specialty coffee startup',
  'Quarterly business review for the sales team',
  'Explain how photosynthesis works, for class 8',
  'Go-to-market plan for launching a fitness app',
]
const IDEAS = ['Startup pitch deck', 'Quarterly business review', 'Lesson plan', 'Marketing plan']

/** The placeholder "types" example prompts, one after another, while the box is empty (static when the user prefers reduced motion). */
function useTypedExamples(active: boolean) {
  const [text, setText] = useState(EXAMPLES[0]!)
  useEffect(() => {
    if (!active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let i = 0, n = 0, dir = 1
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      const full = EXAMPLES[i]!
      n += dir
      setText(n === 0 ? '' : full.slice(0, n))
      if (dir === 1 && n >= full.length) { dir = -1; t = setTimeout(tick, 1800) }
      else if (dir === -1 && n <= 0) { dir = 1; i = (i + 1) % EXAMPLES.length; t = setTimeout(tick, 450) }
      else t = setTimeout(tick, dir === 1 ? 42 : 16)
    }
    t = setTimeout(tick, 700)
    return () => clearTimeout(t)
  }, [active])
  return text
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

export function HomePage() {
  const [prompt, setPrompt] = useState('')
  const navigate = useNavigate()
  const [sources, setSources] = useState<SourceSummary[]>([])
  const [dialog, setDialog] = useState(false)
  /** attachments the server is still checking: shown as normal chips (no spinner), settled in the background */
  const [pending, setPending] = useState<{ key: string; label: string; icon: string }[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const sourcesRef = useRef<SourceSummary[]>([])
  const jobs = useRef(new Set<Promise<boolean>>())
  const cancelled = useRef(new Set<string>())
  const submitting = useRef(false)
  const typed = useTypedExamples(prompt === '')
  const box = useRef<HTMLTextAreaElement>(null)
  const keep = (next: SourceSummary[]) => { sourcesRef.current = next; setSources(next) }
  const [decks, setDecks] = useState<PresentationSummary[] | null>(null)
  useEffect(() => {
    api.listPresentations().then(setDecks).catch(() => setDecks([]))
  }, [])

  /** Checks a link or file on the server in the background. The chip is there at once; it becomes the page title when done and is dropped (with a message) if the check fails. */
  function attach(label: string, icon: string, run: () => Promise<SourceSummary>) {
    if (sourcesRef.current.length + pending.length >= MAX_SOURCES) return setAttachError(`You can attach up to ${MAX_SOURCES} sources.`)
    setAttachError(null)
    const key = crypto.randomUUID()
    setPending((p) => [...p, { key, label, icon }])
    const job = run()
      .then((s) => {
        if (cancelled.current.has(key)) { void api.deleteSource(s.id); return true } // removed by the user while it was being checked: nothing to wait for or report
        if (!sourcesRef.current.some((x) => x.id === s.id)) keep([...sourcesRef.current, s])
        return true
      })
      .catch((e) => {
        if (cancelled.current.has(key)) return true
        setAttachError(`${label}: ${e instanceof ApiError ? e.message : 'could not be added. Please try again.'}`)
        return false
      })
      .finally(() => { setPending((p) => p.filter((x) => x.key !== key)); jobs.current.delete(job) })
    jobs.current.add(job)
  }
  function attachFile(f: File) {
    const old = OLD_FORMATS[/\.([a-z0-9]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? '']
    if (old) return setAttachError(old)
    if (!FILE_TYPES.test(f.name)) return setAttachError(f.type.startsWith('image/') ? "Pictures can't be used as a source yet. Attach a PDF, Word, PowerPoint, Excel, CSV, email, text file or a link." : `${f.name}: use a PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, email (.eml), or text/Markdown file.`)
    if (f.size > 15 * 1024 * 1024) return setAttachError(`${f.name} is larger than 15 MB.`)
    const kind = /\.(docx|docm)$/i.test(f.name) ? '📘' : /\.(xlsx|xlsm)$/i.test(f.name) ? '📈' : /\.(csv|tsv)$/i.test(f.name) ? '🧮' : /\.eml$/i.test(f.name) ? '✉️' : /\.pptx$/i.test(f.name) ? '📊' : '📄'
    attach(f.name, kind, () => api.addFileSource(f))
  }
  /** A pasted file, or a paste that is nothing but web links, becomes an attachment instead of text in the box. Other text pastes normally. */
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.files]
    if (files.length) { e.preventDefault(); files.forEach(attachFile); return }
    const parts = e.clipboardData.getData('text').trim().split(/\s+/).filter(Boolean)
    if (parts.length > 0 && parts.length <= MAX_SOURCES && parts.every((u) => /^https?:\/\/\S+$/i.test(u))) {
      e.preventDefault()
      parts.forEach((u) => attach(hostOf(u), '🔗', () => api.addUrlSource(u)))
    }
  }
  const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes('Files')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    try {
      // attachments still being checked finish quietly first, so they are sent with the prompt; if one failed the message stays on screen
      if (jobs.current.size) { const ok = await Promise.all([...jobs.current]); if (ok.includes(false)) return }
      const list = sourcesRef.current
      const text = prompt.trim()
      if (!text) return // attachments alone don't start a deck: the user says what it should be about
      clearPending() // a new request must never inherit a previous run's job/sources
      setPendingPrompt(text)
      setPendingSources(list.map((s) => s.id))
      navigate('/create')
    } finally {
      submitting.current = false
    }
  }

  return (
    <div className="flex min-h-screen pt-14 lg:pt-0">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 pb-12 lg:pb-16">
        <MaintenanceBanner />
        <div className="max-w-[860px] mx-auto mt-8 sm:mt-14 lg:mt-20">
          <h1 className="font-heading font-extrabold text-2xl sm:text-4xl text-center text-foreground tracking-tight">What will you present today?</h1>
          <p className="text-center text-slate-500 mt-2 text-sm sm:text-base">Describe it, add a link or a file, and we’ll build the deck.</p>
          <form
            onSubmit={submit}
            onDragOver={(e) => hasFiles(e) && e.preventDefault()}
            onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); [...e.dataTransfer.files].forEach(attachFile) } }}
            className="mt-6 sm:mt-8 bg-white rounded-3xl ring-1 ring-black/10 shadow-[0_10px_40px_-14px_rgba(30,64,200,0.35)] transition focus-within:ring-2 focus-within:ring-primary/50 focus-within:shadow-[0_14px_50px_-14px_rgba(30,64,200,0.5)]"
          >
            <textarea
              ref={box}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onPaste={onPaste}
              maxLength={4000}
              placeholder={typed ? `${typed}|` : '|'}
              aria-label="Presentation prompt"
              className="block w-full h-28 sm:h-32 resize-none bg-transparent rounded-t-3xl px-5 sm:px-7 pt-5 sm:pt-6 text-base sm:text-[17px] leading-relaxed text-foreground placeholder:text-slate-400 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e)
              }}
            />
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-5 pb-3 sm:pb-4">
              <button type="button" onClick={() => setDialog(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white hover:border-primary/50 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15 7" /></svg>
                Upload files, or links
              </button>
              {sources.map((s) => (
                <span key={s.id} title={s.title} className="inline-flex items-center gap-1.5 bg-primary/10 text-slate-800 rounded-full pl-2.5 pr-1.5 py-1 text-xs max-w-[220px]">
                  <span aria-hidden>{SOURCE_ICON[s.type]}</span>
                  <span className="truncate">{s.title}</span>
                  <button type="button" aria-label={`Remove ${s.title}`} onClick={() => { keep(sourcesRef.current.filter((x) => x.id !== s.id)); void api.deleteSource(s.id) }} className="w-4 h-4 rounded-full hover:bg-primary/20 leading-none">×</button>
                </span>
              ))}
              {pending.map((c) => (
                <span key={c.key} title={c.label} className="inline-flex items-center gap-1.5 bg-primary/10 text-slate-800 rounded-full pl-2.5 pr-1.5 py-1 text-xs max-w-[220px]">
                  <span aria-hidden>{c.icon}</span>
                  <span className="truncate">{c.label}</span>
                  <button type="button" aria-label={`Remove ${c.label}`} onClick={() => { cancelled.current.add(c.key); setPending((p) => p.filter((x) => x.key !== c.key)) }} className="w-4 h-4 rounded-full hover:bg-primary/20 leading-none">×</button>
                </span>
              ))}
              <button
                type="submit"
                disabled={!prompt.trim()}
                title={!prompt.trim() ? 'Type what your presentation should be about' : undefined}
                className="w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-2 bg-primary text-white rounded-full px-6 py-3 sm:py-2.5 text-sm font-semibold shadow-sm hover:brightness-110 transition disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed"
              >
                Create Presentation
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
            {(sources.length + pending.length > 0 && !prompt.trim()) && <p className="px-5 sm:px-7 pb-4 -mt-1 text-sm text-slate-500">Add a line about what the presentation should be — then press Create.</p>}
            {attachError && <p role="alert" className="px-5 sm:px-7 pb-4 -mt-1 text-sm font-medium text-red-700">{attachError}</p>}
          </form>
          <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Ideas to start from">
            {IDEAS.map((idea) => <button key={idea} type="button" onClick={() => { setPrompt((p) => p || `${idea} on `); box.current?.focus() }} className="rounded-full border border-border bg-white px-3.5 py-1.5 text-sm text-slate-600 hover:border-primary/50 hover:text-primary transition">{idea}</button>)}
          </div>
        </div>

        <div className="max-w-[960px] mx-auto mt-10 sm:mt-14">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-[15px] font-semibold">Recent presentations</h2>
            <Link to="/created" className="text-sm text-primary">View all</Link>
          </div>
          {decks && decks.length === 0 ? (
            <p className="py-16 text-center text-slate-500">No presentations yet. Your decks will appear here.</p>
          ) : (
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-6">
              {(decks ?? []).map((d) => (
                <li key={d.id} className="min-w-0">
                  <Link to={`/edit/${d.id}`} className="block bg-white border border-border rounded-xl p-5 hover:shadow-md transition">
                    <DeckThumb deck={d} />
                    <div className="font-semibold truncate">{d.title}</div>
                    <div className="text-xs text-slate-500 mt-1">Updated {new Date(d.updatedAt).toLocaleDateString()}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      {dialog && <SourcesDialog count={sources.length} onAdd={(s) => keep([...sourcesRef.current, s])} onClose={() => setDialog(false)} />}
    </div>
  )
}
