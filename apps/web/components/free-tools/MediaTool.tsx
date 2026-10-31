'use client'

import { useRef, useState } from 'react'
import type { FreeTranscript } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { toolError } from '@/lib/free-tools'
import { TranscriptResult } from './TranscriptResult'

const MAX_MB = 4
const TYPES = /\.(mp3|m4a|wav|ogg|flac|aac|mp4|mov|webm)$/i

/** Free "audio / video → slides" tool: the visitor's own small recording is transcribed (a few a day, no account), then it can become a deck. */
export function MediaTool() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<FreeTranscript | null>(null)

  function pick(f: File | undefined) {
    setOut(null); setError(null)
    if (!f) return setFile(null)
    if (!TYPES.test(f.name)) return setError('Choose an audio file (MP3, M4A, WAV, OGG, FLAC, AAC) or a video (MP4, MOV, WebM).')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`That recording is larger than ${MAX_MB} MB (about ${MAX_MB} minutes of audio). Try a shorter part, export just the audio, or sign up for files up to 12 MB.`)
    setFile(f)
  }
  async function run() {
    if (!file) return setError('Choose a recording first.')
    setBusy(true); setError(null); setOut(null)
    try { setOut(await api.freeMedia(file)) }
    catch (e) { setError(toolError(e, 'Could not transcribe that recording. Please try again.')) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
          className="w-full rounded-2xl border-2 border-dashed border-foreground bg-[#f8f9fc] px-6 py-10 text-center hover:bg-[#f0f4f8] focus:outline-none focus:ring-2 focus:ring-primary">
          <span className="block font-heading font-extrabold text-lg text-foreground">{file ? file.name : 'Drop your recording here, or click to choose'}</span>
          <span className="mt-1 block text-sm font-medium text-[#64748b]">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `Your own lecture, meeting or voice note · MP3, M4A, WAV, MP4… · up to ${MAX_MB} MB`}</span>
        </button>
        <input ref={input} type="file" accept=".mp3,.m4a,.wav,.ogg,.flac,.aac,.mp4,.mov,.webm,audio/*,video/*" className="sr-only" aria-label="Choose a recording" onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="accent" size="lg" arrow disabled={busy || !file} onClick={() => void run()} className="mt-6">{busy ? 'Listening… this can take a minute' : 'Transcribe my recording'}</Button>
        {busy && <p role="status" className="mt-3 text-sm font-medium text-[#475569]">Writing down what is said. Please keep this page open.</p>}
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
        <p className="mt-4 text-xs font-medium text-[#64748b]">Only recordings you made or have the right to use. The file is sent to our AI provider to be transcribed and is not stored. Free visitors get a few recordings a day; signing up gives 100 credits and files up to 12 MB.</p>
      </Card>
      {out && <TranscriptResult out={out} what="transcript" />}
    </div>
  )
}
