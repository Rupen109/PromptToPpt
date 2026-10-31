'use client'

import { LanguageSelect } from '@/components/layout/LanguageSelect'
import { AlertTriangle, BarChart3, Clapperboard, FileSpreadsheet, FileText, Link2, Loader2, Mail, NotebookPen, Paperclip, Presentation, Rocket, Send, Sparkles, Table, Wrench, X, type LucideIcon } from '@prompttoppt/ui/icons'
import React, { useEffect, useRef, useState } from 'react'
import { ApiError } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { editorStartUrl } from '@/lib/language'

const QUICK_PROMPTS: [LucideIcon, string, string][] = [
  [Rocket, '$8.5M Series A Pitch', 'Series A pitch deck for a B2B AI operations startup raising $8.5M'],
  [BarChart3, 'Q3 Board Governance', 'Q3 board governance update covering performance, risks and decisions needed'],
  [Wrench, 'GTM Product Launch', 'Go-to-market launch plan for a new B2B SaaS product'],
] as const

const MAX_ATTACHMENTS = 5
const ACCEPT = '.pdf,.docx,.docm,.pptx,.xlsx,.xlsm,.csv,.tsv,.eml,.txt,.md'
const KIND_ICON = { pdf: FileText, pptx: Presentation, docx: FileText, xlsx: FileSpreadsheet, csv: Table, email: Mail, text: NotebookPen, url: Link2, transcript: Clapperboard } as const

/** A source the visitor attached: uploaded + read by the server immediately, so problems are reported while they're still here. */
interface Attachment {
  key: string
  label: string
  kind?: keyof typeof KIND_ICON
  id?: string
  status: 'uploading' | 'ready' | 'error'
  error?: string
}

const STATIC_PLACEHOLDER = "Describe your presentation: topic, audience, goal… or just a topic and we'll suggest directions."
const EXAMPLES = [
  'A 10-slide pitch deck for my AI note-taking startup, for seed investors',
  'Quarterly business review for the sales team, with revenue and pipeline charts',
  'Go-to-market plan for launching a fitness app in India',
  'Explain how photosynthesis works, for class 8 students',
  'Turn the attached report into a clear board update',
]

/**
 * The empty prompt box "types" example prompts one after another, so a first-time visitor sees what to write. The server renders the plain
 * description (no hydration mismatch); typing starts after the page loads and stops as soon as the person writes something. Not animated for
 * people who prefer reduced motion.
 */
function useTypedExamples(active: boolean): string | null {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    let i = 0, n = 0, dir = 1
    let t: ReturnType<typeof setTimeout>
    const tick = () => {
      const full = EXAMPLES[i]!
      n += dir
      setText(full.slice(0, n))
      if (dir === 1 && n >= full.length) { dir = -1; t = setTimeout(tick, 1800) }
      else if (dir === -1 && n <= 0) { dir = 1; i = (i + 1) % EXAMPLES.length; t = setTimeout(tick, 450) }
      else t = setTimeout(tick, dir === 1 ? 38 : 14)
    }
    t = setTimeout(tick, 900)
    return () => { clearTimeout(t); setText(null) }
  }, [active])
  return text
}

export function HeroSection() {
  const [prompt, setPrompt] = useState('')
  const [focused, setFocused] = useState(false)
  const typed = useTypedExamples(prompt === '' && !focused) // while the person is in the box their own cursor is the only one
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [atts, setAtts] = useState<Attachment[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [drag, setDrag] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const uploading = atts.some((a) => a.status === 'uploading')
  const patch = (key: string, p: Partial<Attachment>) => setAtts((cur) => cur.map((a) => (a.key === key ? { ...a, ...p } : a)))
  const room = () => MAX_ATTACHMENTS - atts.length

  async function addFiles(files: File[]) {
    setError(null)
    const take = files.slice(0, Math.max(0, room()))
    if (files.length > take.length) setError(`You can attach up to ${MAX_ATTACHMENTS} sources.`)
    for (const f of take) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const tooBig = f.size > 15 * 1024 * 1024
      // pictures are read by AI and cost credits, so they need an account: sign in, then add the picture on the home screen
      const isPicture = /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name)
      const refusal = isPicture ? 'Pictures need a free account — sign up, then add it on your home screen' : tooBig ? 'Larger than 15 MB' : null
      setAtts((cur) => [...cur, { key, label: f.name, status: refusal ? 'error' : 'uploading', ...(refusal ? { error: refusal } : {}) }])
      if (refusal) continue
      try {
        const a = await api.addDraftFile(f)
        patch(key, { status: 'ready', id: a.id, kind: a.kind, label: f.name })
      } catch (e) {
        patch(key, { status: 'error', error: e instanceof ApiError ? e.message : 'Could not read that file' })
      }
    }
  }

  async function addLink() {
    const raw = link.trim()
    if (!raw) return
    if (room() <= 0) return setError(`You can attach up to ${MAX_ATTACHMENTS} sources.`)
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    setError(null)
    setLink('')
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setAtts((cur) => [...cur, { key, label: url.replace(/^https?:\/\/(www\.)?/i, ''), kind: 'url', status: 'uploading' }])
    try {
      const a = await api.addDraftLink(url)
      patch(key, { status: 'ready', id: a.id, label: a.title || url })
    } catch (e) {
      patch(key, { status: 'error', error: e instanceof ApiError ? e.message : 'Could not read that page' })
    }
  }

  // Store the prompt server-side and hand the editor an opaque id — never put prompt text in a URL.
  async function generate() {
    const ready = atts.filter((a) => a.status === 'ready' && a.id)
    const text = prompt.trim() || (ready.length ? 'Create a presentation from the attached sources' : '')
    if (!text) return setError('Describe your presentation first.')
    if (uploading) return setError('Still reading your attachments — one moment.')
    setBusy(true)
    setError(null)
    try {
      const { id } = await api.createDraft(text, ready.map((a) => a.id!))
      window.location.assign(editorStartUrl(id))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start your presentation. Please try again.')
      setBusy(false)
    }
  }

  return (
    <section className="bg-gradient-to-b from-[#f8f9fc] to-[#f0f4f8] py-12 sm:py-16 md:py-20 px-4 sm:px-6 text-center relative overflow-hidden z-0">
      {/* Blurred blobs */}
      <div className="absolute rounded-full blur-[100px] -z-10 w-[300px] h-[300px] bg-[rgba(255,223,0,0.4)] -top-[50px] -left-[100px]"></div>
      <div className="absolute rounded-full blur-[100px] -z-10 w-[400px] h-[400px] bg-[rgba(255,87,34,0.3)] top-[100px] -right-[100px]"></div>

      <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-x-3 gap-y-0.5 bg-white border-2 border-foreground rounded-3xl sm:rounded-full py-2 px-4 sm:px-5 mb-6 sm:mb-8 max-w-full shadow-[3px_3px_0px_0px_var(--color-text-primary)]">
        <span className="font-heading font-extrabold text-xs sm:text-sm text-foreground"><span className="text-highlight">O</span> THE AGENCY-GRADE PITCH DECK ENGINE</span>
        <span aria-hidden className="hidden sm:inline text-foreground text-sm font-bold">•</span>
        <span className="font-heading font-bold text-xs sm:text-sm text-slate-600">PDF · PPTX · TXT · Web links</span>
      </div>
      
      <h1 className="text-[1.9rem] min-[400px]:text-[2.15rem] sm:text-5xl lg:text-6xl leading-[1.18] sm:leading-tight mb-5 sm:mb-6 max-w-[900px] mx-auto font-heading font-extrabold text-balance">
        Turn Messy Documents into <br/>
        <span className="bg-secondary px-2 rounded-sm inline-block max-w-full shadow-solid border-2 border-foreground my-1">Boardroom-Ready</span><br/>
        Presentations in Seconds.
      </h1>
      
      <p className="text-base sm:text-lg md:text-xl max-w-[700px] mx-auto mb-8 sm:mb-12 text-slate-600">
        Stop agonizing over PowerPoint formatting. Type a prompt, drop in a PDF or PowerPoint, or paste a website link. Our AI builds a designed, editable deck for you in seconds.
      </p>

      {/* Dynamic Prompt Builder */}
      <div className="relative max-w-[900px] mx-auto">
        <div className="absolute -top-[15px] left-0 right-0 flex justify-between px-4 sm:px-12 z-10 pointer-events-none">
        </div>
        
        <div className="bg-white border-[3px] sm:border-4 border-foreground rounded-2xl sm:rounded-3xl shadow-[5px_5px_0px_0px_var(--color-text-primary)] sm:shadow-[8px_8px_0px_0px_var(--color-text-primary)] text-left overflow-hidden">
          <div className="flex gap-2 p-3 sm:p-4 sm:px-6 pt-5 sm:pt-4 bg-slate-50 border-b border-border flex-wrap" role="group" aria-label="Ways to start">
            <Button pill size="sm" variant="softActive" onClick={() => promptInput.current?.focus()}><Sparkles aria-hidden size={14} />Prompt to deck</Button>
            <Button pill size="sm" variant="soft" onClick={() => fileInput.current?.click()}><FileText aria-hidden size={14} />PDF, PPT &amp; TXT files</Button>
          </div>

          <div
            className={`p-3 sm:p-6 bg-slate-50 transition-colors ${drag ? 'bg-highlight/30 outline-dashed outline-2 outline-primary -outline-offset-8' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void addFiles([...e.dataTransfer.files]) }}
          >
            {/* Attached sources sit ABOVE the prompt card, so you can see exactly what the AI will read */}
            {(atts.length > 0 || linkOpen) && (
              <div className="mb-4">
                {atts.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label="Attached sources">
                    {atts.map((a) => (
                      <li key={a.key} className={`inline-flex items-center gap-2 max-w-[300px] rounded-full border-2 pl-3 pr-1.5 py-1 text-xs font-heading font-bold ${a.status === 'error' ? 'border-red-600 bg-red-50 text-red-800' : 'border-foreground bg-white text-foreground'}`} title={a.error ?? a.label}>
                        {(() => { const I = a.status === 'uploading' ? Loader2 : a.status === 'error' ? AlertTriangle : KIND_ICON[a.kind ?? 'text']; return <I aria-hidden size={14} className={`shrink-0 ${a.status === 'uploading' ? 'animate-spin motion-reduce:animate-none' : ''}`} /> })()}
                        <span className="truncate">{a.status === 'error' ? `${a.label} — ${a.error}` : a.label}</span>
                        {a.status === 'uploading' && <span className="text-slate-500 font-normal">reading…</span>}
                        <button type="button" aria-label={`Remove ${a.label}`} onClick={() => setAtts((cur) => cur.filter((x) => x.key !== a.key))} className="w-5 h-5 rounded-full hover:bg-slate-200 leading-none shrink-0 grid place-items-center"><X aria-hidden size={12} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                {linkOpen && (
                  <form className={`flex gap-2 ${atts.length > 0 ? 'mt-3' : ''}`} onSubmit={(e) => { e.preventDefault(); void addLink() }}>
                    <input ref={linkInput} value={link} onChange={(e) => setLink(e.target.value)} type="text" inputMode="url" placeholder="Paste a website link, e.g. www.tata.com/newsroom/…" aria-label="Reference website link" className="flex-1 min-w-0 border-2 border-foreground rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary" />
                    <Button type="submit" size="sm" variant="primary" disabled={!link.trim() || room() <= 0}>Add link</Button>
                    <button type="button" onClick={() => setLinkOpen(false)} aria-label="Close link box" className="px-2 text-slate-500 hover:text-foreground"><X aria-hidden size={16} /></button>
                  </form>
                )}
              </div>
            )}

            <div className="border border-foreground rounded-lg p-3 sm:p-4 bg-white shadow-sm">
              {/* <label className="font-heading text-xs font-extrabold text-slate-500 mb-2 block">
                <Settings aria-hidden size={14} className="text-primary mr-1 inline" /> CONVERSATIONAL SYNTHESIS PROMPT
              </label> */}
              <textarea
                ref={promptInput}
                className="w-full text-base py-2 border-none bg-transparent font-sans resize-none h-[110px] sm:h-[96px] text-foreground focus:outline-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={4000}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={typed === null ? STATIC_PLACEHOLDER : `${typed}|`}
                aria-label="Presentation prompt"
              />
              {/* tools bottom-left, primary action bottom-right */}
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Attach files" onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
                  <Button size="sm" variant="white" onClick={() => fileInput.current?.click()} disabled={room() <= 0} title="PDF, Word, PowerPoint, Excel, CSV, email (.eml), text or Markdown"><Paperclip aria-hidden size={14} />Attach files</Button>
                  <Button size="sm" variant="white" onClick={() => { setLinkOpen((v) => !v); setTimeout(() => linkInput.current?.focus(), 0) }} disabled={room() <= 0}><Link2 aria-hidden size={14} />Add website link</Button>
                  <LanguageSelect variant="chip" />
                </div>
                <button type="button" onClick={generate} disabled={uploading || busy} aria-label="Generate Presentation" title={uploading ? 'Reading your files…' : 'Generate presentation'} className="sm:ml-auto grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-foreground bg-primary text-white shadow-[3px_4px_0_0_#181b25] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[4px_6px_0_0_#181b25] hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0.5 disabled:opacity-60 disabled:pointer-events-none">
                  {busy || uploading ? <Loader2 aria-hidden size={20} className="animate-spin" /> : <Send aria-hidden size={20} className="-ml-0.5 mt-0.5" />}
                </button>
              </div>
            </div>

            {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}

            <div className="mt-5 sm:mt-6 flex gap-2 sm:gap-3 items-center flex-wrap">
              <span className="font-heading text-xs font-extrabold text-slate-500 w-full sm:w-auto">QUICK TEMPLATES:</span>
              {QUICK_PROMPTS.map(([Icon, label, text]) => (
                <Button key={label} pill size="xs" variant="soft" onClick={() => setPrompt(text)} className="!normal-case !tracking-normal"><Icon aria-hidden size={14} />{label}</Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
