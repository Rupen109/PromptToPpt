'use client'

import React, { useRef, useState } from 'react'
import { ApiError } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { EDITOR_URL } from '@/lib/env'

const QUICK_PROMPTS = [
  ['🚀 $8.5M Series A Pitch', 'Series A pitch deck for a B2B AI operations startup raising $8.5M'],
  ['📊 Q3 Board Governance', 'Q3 board governance update covering performance, risks and decisions needed'],
  ['🛠 GTM Product Launch', 'Go-to-market launch plan for a new B2B SaaS product'],
] as const

const MAX_ATTACHMENTS = 5
const ACCEPT = '.pdf,.docx,.docm,.pptx,.xlsx,.xlsm,.csv,.tsv,.eml,.txt,.md'
const KIND_ICON = { pdf: '📄', pptx: '📊', docx: '📘', xlsx: '📈', csv: '🧮', email: '✉️', text: '📝', url: '🔗', transcript: '🎬' } as const

/** A source the visitor attached: uploaded + read by the server immediately, so problems are reported while they're still here. */
interface Attachment {
  key: string
  label: string
  kind?: keyof typeof KIND_ICON
  id?: string
  status: 'uploading' | 'ready' | 'error'
  error?: string
}

export function HeroSection() {
  const [prompt, setPrompt] = useState('')
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
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- cross-origin editor subdomain
      window.location.assign(`${EDITOR_URL}/start?draft=${encodeURIComponent(id)}`)
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
        <span className="bg-secondary px-2 rounded-sm inline-block max-w-full -rotate-2 shadow-solid border-2 border-foreground my-1">Boardroom-Ready</span><br/>
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
            <Button pill size="sm" variant="softActive" onClick={() => promptInput.current?.focus()}>✨ Prompt to deck</Button>
            <Button pill size="sm" variant="soft" onClick={() => fileInput.current?.click()}>📄 PDF, PPT &amp; TXT files</Button>
            <Button pill size="sm" variant="soft" onClick={() => { setLinkOpen(true); setTimeout(() => linkInput.current?.focus(), 0) }}>🔗 Reference website</Button>
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
                        <span aria-hidden>{a.status === 'uploading' ? '⏳' : a.status === 'error' ? '⚠️' : KIND_ICON[a.kind ?? 'text']}</span>
                        <span className="truncate">{a.status === 'error' ? `${a.label} — ${a.error}` : a.label}</span>
                        {a.status === 'uploading' && <span className="text-slate-500 font-normal">reading…</span>}
                        <button type="button" aria-label={`Remove ${a.label}`} onClick={() => setAtts((cur) => cur.filter((x) => x.key !== a.key))} className="w-5 h-5 rounded-full hover:bg-slate-200 leading-none shrink-0">×</button>
                      </li>
                    ))}
                  </ul>
                )}
                {linkOpen && (
                  <form className={`flex gap-2 ${atts.length > 0 ? 'mt-3' : ''}`} onSubmit={(e) => { e.preventDefault(); void addLink() }}>
                    <input ref={linkInput} value={link} onChange={(e) => setLink(e.target.value)} type="text" inputMode="url" placeholder="Paste a website link, e.g. www.tata.com/newsroom/…" aria-label="Reference website link" className="flex-1 min-w-0 border-2 border-foreground rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary" />
                    <Button type="submit" size="sm" variant="primary" disabled={!link.trim() || room() <= 0}>Add link</Button>
                    <button type="button" onClick={() => setLinkOpen(false)} aria-label="Close link box" className="px-2 text-slate-500 hover:text-foreground">×</button>
                  </form>
                )}
              </div>
            )}

            <div className="border border-foreground rounded-lg p-3 sm:p-4 bg-white shadow-sm">
              <label className="font-heading text-xs font-extrabold text-slate-500 mb-2 block">
                <span className="text-primary mr-1">⚙️</span> CONVERSATIONAL SYNTHESIS PROMPT
              </label>
              <textarea
                ref={promptInput}
                className="w-full text-base py-2 border-none bg-transparent font-sans resize-none h-[110px] sm:h-[96px] text-foreground focus:outline-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={4000}
                placeholder="Describe your presentation: topic, audience, goal… or just a topic and we'll suggest directions."
                aria-label="Presentation prompt"
              />
              {/* tools bottom-left, primary action bottom-right */}
              <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Attach files" onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
                  <Button size="sm" variant="white" onClick={() => fileInput.current?.click()} disabled={room() <= 0} title="PDF, Word, PowerPoint, Excel, CSV, email (.eml), text or Markdown">📎 Attach files</Button>
                  <Button size="sm" variant="white" onClick={() => { setLinkOpen((v) => !v); setTimeout(() => linkInput.current?.focus(), 0) }} disabled={room() <= 0}>🔗 Add website link</Button>
                  <span className="hidden lg:inline text-[11px] font-heading font-bold text-slate-500">PDF · PPTX · TXT · MD</span>
                </div>
                <Button onClick={generate} variant="dark" size="md" depth="md" loading={busy} disabled={uploading} className="w-full sm:w-auto sm:ml-auto !normal-case !tracking-normal !text-sm">{busy ? 'Starting…' : uploading ? 'Reading files…' : 'Generate Presentation 🚀'}</Button>
              </div>
            </div>

            {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}

            <div className="mt-5 sm:mt-6 flex gap-2 sm:gap-3 items-center flex-wrap">
              <span className="font-heading text-xs font-extrabold text-slate-500 w-full sm:w-auto">QUICK TEMPLATES:</span>
              {QUICK_PROMPTS.map(([label, text]) => (
                <Button key={label} pill size="xs" variant="soft" onClick={() => setPrompt(text)} className="!normal-case !tracking-normal">{label}</Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
