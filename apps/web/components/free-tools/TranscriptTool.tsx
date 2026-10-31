'use client'

import { useRef, useState } from 'react'
import type { FreeTranscript } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { toolError } from '@/lib/free-tools'
import { TranscriptResult } from './TranscriptResult'

const MAX_FILE_MB = 2

/** Free "YouTube transcript → slides" tool: paste the transcript copied from YouTube (or load a .srt/.vtt file), get it cleaned, copy/download it, or turn it into a deck. */
export function TranscriptTool() {
  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<FreeTranscript | null>(null)

  async function load(f: File | undefined) {
    setError(null); setOut(null)
    if (!f) return
    if (!/\.(srt|vtt|sbv|txt)$/i.test(f.name)) return setError('Choose a caption file (.srt, .vtt) or a .txt file, or paste the text.')
    if (f.size > MAX_FILE_MB * 1024 * 1024) return setError(`That file is larger than ${MAX_FILE_MB} MB.`)
    setText(await f.text())
    if (!title) setTitle(f.name.replace(/\.(srt|vtt|sbv|txt)$/i, ''))
  }
  async function run() {
    setBusy(true); setError(null); setOut(null)
    try { setOut(await api.freeTranscript({ text, ...(title.trim() ? { title: title.trim() } : {}) })) }
    catch (e) { setError(toolError(e, 'Could not read that transcript. Please try again.')) }
    finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
        <ol className="rounded-2xl border-2 border-foreground bg-[#f8f9fc] px-5 py-4 text-sm font-medium text-[#334155] list-decimal pl-9 space-y-1">
          <li>Open the video on YouTube and click <strong>…more</strong> under the title to open the description.</li>
          <li>Scroll to the bottom of the description and click <strong>Show transcript</strong>. Click inside the panel, press Ctrl+A (⌘A on Mac) and copy. On a phone, tap the description, then <strong>Show transcript</strong>. No button means the video has no captions.</li>
          <li>Paste it below. We keep the time stamps and clean the rest.</li>
        </ol>
        <label className="mt-5 block text-xs font-heading font-extrabold uppercase text-foreground" htmlFor="yt-title">Video title (optional)</label>
        <input id="yt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. How rooftop solar pays back" className="mt-2 w-full h-12 rounded-xl border-2 border-foreground bg-white px-4 text-base font-medium focus:outline-none focus:ring-2 focus:ring-primary" />
        <label className="mt-5 block text-xs font-heading font-extrabold uppercase text-foreground" htmlFor="yt-text">Transcript</label>
        <textarea id="yt-text" value={text} onChange={(e) => { setText(e.target.value); setOut(null) }} rows={9} maxLength={300000} placeholder="Paste the transcript here…" className="mt-2 w-full rounded-xl border-2 border-foreground bg-white px-4 py-3 text-sm leading-6 font-medium focus:outline-none focus:ring-2 focus:ring-primary" />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button variant="accent" size="lg" arrow disabled={busy || text.trim().length < 40} onClick={() => void run()}>{busy ? 'Cleaning…' : 'Clean transcript'}</Button>
          <button type="button" onClick={() => input.current?.click()} className="font-heading font-extrabold text-sm text-primary hover:underline">…or load a caption file (.srt / .vtt)</button>
          <input ref={input} type="file" accept=".srt,.vtt,.sbv,.txt" className="sr-only" aria-label="Load a caption file" onChange={(e) => void load(e.target.files?.[0])} />
        </div>
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
      </Card>

      {out && <TranscriptResult out={out} />}
    </div>
  )
}
