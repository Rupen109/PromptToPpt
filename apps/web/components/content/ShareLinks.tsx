'use client'

import { useState } from 'react'
import { Check, Link2 } from '@prompttoppt/ui/icons'

/** copy-the-link button (no tracking scripts, nothing sent anywhere) */
export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 2000) }).catch(() => undefined) }} className="inline-flex items-center gap-1.5 rounded-xl !border-2 !border-solid !border-foreground !bg-white px-3 py-1.5 font-heading font-bold text-xs text-foreground hover:!bg-[#f8f9fc]">
      {done ? <Check aria-hidden size={14} /> : <Link2 aria-hidden size={14} />}{done ? 'Link copied' : 'Copy link'}
    </button>
  )
}
