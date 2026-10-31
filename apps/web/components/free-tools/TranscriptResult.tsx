'use client'

import { Check } from '@prompttoppt/ui/icons'
import { useState } from 'react'
import type { FreeTranscript } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { openInEditor, toolError } from '@/lib/free-tools'

export const asText = (t: FreeTranscript, stamps: boolean) => t.parts.map((p) => (stamps && p.locator ? `[${p.locator}] ` : '') + p.text).join('\n\n')

/** The cleaned / transcribed text with copy, download and "make slides" (shared by the transcript and the audio/video free tools). */
export function TranscriptResult({ out, what = 'transcript' }: { out: FreeTranscript; what?: string }) {
  const [stamps, setStamps] = useState(true)
  const [copied, setCopied] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copy() {
    try { await navigator.clipboard.writeText(asText(out, stamps)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setError('Copy was blocked by your browser. Select the text and copy it instead.') }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([asText(out, stamps)], { type: 'text/plain;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${(out.title || 'transcript').replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().slice(0, 60) || 'transcript'}.txt` })
    a.click(); URL.revokeObjectURL(url)
  }
  async function toDeck() {
    setOpening(true); setError(null)
    try { await openInEditor(`Create a presentation that summarises "${out.title}" for an audience that has not seen or heard it. Use the attached ${what} as the source.`, [out.attachmentId]) }
    catch (e) { setError(toolError(e, `Could not open the editor. Please add the ${what} again.`)); setOpening(false) }
  }
  return (
    <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
      <h2 className="font-heading font-extrabold text-2xl text-foreground">{out.title}</h2>
      <p className="mt-1 text-xs font-medium text-[#64748b]">{out.words.toLocaleString('en-US')} words{out.timed ? ' · time stamps kept' : ' · this text had no time stamps'}</p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {out.timed && <label className="flex items-center gap-2 text-sm font-bold text-foreground"><input type="checkbox" checked={stamps} onChange={(e) => setStamps(e.target.checked)} />Show time stamps</label>}
        <button type="button" onClick={() => void copy()} className="font-heading font-extrabold text-sm text-primary hover:underline">{copied ? <span className="inline-flex items-center gap-1">Copied<Check aria-hidden size={14} /></span> : 'Copy'}</button>
        <button type="button" onClick={download} className="font-heading font-extrabold text-sm text-primary hover:underline">Download .txt</button>
      </div>
      <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border-2 border-foreground bg-[#f8f9fc] p-4 whitespace-pre-wrap text-sm leading-6 font-medium text-[#334155]" tabIndex={0} aria-label="Cleaned transcript">{asText(out, stamps)}</div>
      <div className="mt-7"><Button variant="accent" size="lg" arrow disabled={opening} onClick={() => void toDeck()}>{opening ? 'Opening the editor…' : `Make slides from this ${what}`}</Button></div>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
      <p className="mt-3 text-xs font-medium text-[#64748b]">Free to start. The text is kept for one hour for this request and removed if you don’t continue.</p>
    </Card>
  )
}
