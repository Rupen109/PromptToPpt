'use client'

import { useRef, useState, type FormEvent } from 'react'
import { ApiError } from '@prompttoppt/api-client'
import { ArrowRight, Check, Mail, Upload, X } from '@prompttoppt/ui/icons'
import { Button } from '@/components/ui/Button'
import { useViewer } from '@/components/layout/AuthActions'
import { api } from '@/lib/api'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '@/lib/env'

const MAX_FILES = 3
const FILE_MAX = 5 * 1024 * 1024
const FIELD = 'w-full rounded-xl border-2 border-foreground bg-white px-4 py-3 text-base font-medium text-foreground placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-primary'
const LABEL = 'block font-heading font-extrabold text-xl text-foreground'
const Required = () => <span aria-hidden className="ml-1 text-accent">*</span>

/** WhatsApp mark (brand logo: keeps its own shape; drawn with the current colour) */
const WhatsApp = () => (
  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2a9.9 9.9 0 0 0-8.46 15.02L2 22l5.1-1.34A9.9 9.9 0 1 0 12.04 2Zm0 18.1c-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.03.8.81-2.95-.2-.31A8.1 8.1 0 1 1 12.04 20.1Zm4.45-6.06c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.47-.4-.41-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.44-.59 1.64-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" /></svg>
)

/** The Support page form: e-mail, what is wrong, optional screenshots. Sends to our API; the owner reads it in the dashboard. */
export function SupportForm() {
  const viewer = useViewer()
  const [typedEmail, setEmail] = useState<string | null>(null)
  const email = typedEmail ?? viewer?.email ?? '' // signed-in people see their own address already filled in
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [website, setWebsite] = useState('') // hidden trap field for bots
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  function add(list: FileList | File[] | null) {
    if (!list) return
    setError(null)
    const next = [...files]
    for (const f of [...list]) {
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) { setError(`"${f.name}" is not a PNG, JPG or WebP picture.`); continue }
      if (f.size > FILE_MAX) { setError(`"${f.name}" is larger than 5 MB.`); continue }
      if (next.length >= MAX_FILES) { setError(`You can attach up to ${MAX_FILES} pictures.`); break }
      next.push(f)
    }
    setFiles(next)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    try { setSent((await api.sendSupport({ email: email.trim(), message: message.trim(), files, website })).id) }
    catch (err) { setError(err instanceof ApiError ? err.message : 'We could not send your message. Please check your connection and try again.') }
    finally { setBusy(false) }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-3xl border-2 border-foreground bg-[#f0fdf4] p-8 shadow-[4px_5px_0_0_#181b25]">
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full border-2 border-foreground bg-highlight"><Check size={24} strokeWidth={3} /></span>
        <h2 className="mt-4 font-heading font-extrabold text-2xl text-foreground">Thanks, we got your message</h2>
        <p className="mt-2 text-base font-medium text-[#475569]">We will reply to <b className="text-foreground">{email}</b> within 24–48 hours. Your reference is <span className="font-mono">{sent}</span>.</p>
        <button type="button" onClick={() => { setSent(null); setMessage(''); setFiles([]) }} className="mt-5 font-heading font-bold text-sm text-primary underline">Send another message</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <div>
        <label htmlFor="support-email" className={LABEL}>Email (so we can follow up)<Required /></label>
        <input id="support-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" maxLength={200} className={`${FIELD} mt-3 sm:max-w-md`} />
      </div>
      <div>
        <label htmlFor="support-message" className={LABEL}>How can we help?<Required /></label>
        <textarea id="support-message" value={message} onChange={(e) => setMessage(e.target.value)} required rows={6} maxLength={4000} placeholder="Tell us what happened, what you expected, and the page you were on." className={`${FIELD} mt-3 resize-y`} />
        <p className="mt-1 text-right text-xs font-medium text-[#64748b]">{message.length}/4000</p>
      </div>
      <div>
        <p className={LABEL}>You can attach screenshots (optional)</p>
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-foreground px-6 py-8 font-heading font-bold text-sm text-[#475569] hover:bg-[#f8f9fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${drag ? 'bg-highlight/30' : 'bg-white'}`}>
          <Upload aria-hidden size={18} />Click to choose a picture or drag it here
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" aria-label="Choose screenshots" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        <p className="mt-2 text-xs font-medium text-[#64748b]">Up to {MAX_FILES} pictures (PNG, JPG or WebP), 5 MB each.</p>
        {files.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="list-none inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-white py-1 pl-3 pr-1.5 text-xs font-bold text-foreground">
                <span className="max-w-[180px] truncate">{f.name}</span><span className="text-[#64748b] font-medium">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-[#f1f5f9]"><X aria-hidden size={12} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* a trap for bots: people never see or reach this field */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>
      {error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
      <div><Button type="submit" variant="ink" size="lg" loading={busy} disabled={busy || !email.trim() || message.trim().length < 10} className="!normal-case !tracking-normal !text-base">Submit<ArrowRight aria-hidden size={18} /></Button></div>
    </form>
  )
}

/** the quick ways to reach us, shown above the form */
export function ContactChips() {
  const chip = 'inline-flex items-center gap-2 rounded-full border-2 border-foreground px-4 py-2 font-heading font-bold text-sm underline underline-offset-2 hover:-translate-y-0.5 transition-transform'
  return (
    <div className="flex flex-wrap gap-3">
      {SUPPORT_WHATSAPP && <a href={`https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className={`${chip} bg-[#f0fdf4] text-[#166534]`}><WhatsApp />WhatsApp</a>}
      <a href={`mailto:${SUPPORT_EMAIL}`} className={`${chip} bg-white text-foreground`}><Mail aria-hidden size={16} />{SUPPORT_EMAIL}</a>
    </div>
  )
}
