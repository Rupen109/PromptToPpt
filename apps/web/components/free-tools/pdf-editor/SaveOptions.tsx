'use client'

import { Lock, TriangleAlert } from '@prompttoppt/ui/icons'

/**
 * What the saved file will be, said BEFORE the download: a protected PDF is saved without its password / restrictions (pdf-lib cannot write encrypted files and
 * the editor has to read the pages to change them), and a form can be flattened. Download stays off until the visitor has read the first.
 */
export function SaveOptions({ protection, understood, onUnderstood, hasForm, flatten, onFlatten, signed = 0, signedAck = false, onSignedAck }: {
  protection: 'password' | 'restricted' | null
  understood: boolean
  onUnderstood: (v: boolean) => void
  hasForm: boolean
  flatten: boolean
  onFlatten: (v: boolean) => void
  /** digital signatures in the file (saving a changed copy makes them invalid) */
  signed?: number
  signedAck?: boolean
  onSignedAck?: (v: boolean) => void
}) {
  if (!protection && !hasForm && !signed) return null
  return (
    <div role="group" aria-label="Save options" data-testid="save-options" className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b-2 border-foreground bg-[#fffbeb] px-3 py-1.5 text-xs font-bold text-[#92400e]">
      {protection && (
        <label className="flex items-center gap-2">
          <input type="checkbox" data-testid="ack-unprotected" checked={understood} onChange={(e) => onUnderstood(e.target.checked)} className="h-5 w-5 accent-[#0b3dd0]" />
          <Lock aria-hidden size={14} />
          <span>{protection === 'password' ? 'I understand the saved copy has no password.' : 'I understand the saved copy has no password and none of the file’s restrictions.'}</span>
        </label>
      )}
      {signed > 0 && (
        <label className="flex items-center gap-2">
          <input type="checkbox" data-testid="ack-signed" checked={signedAck} onChange={(e) => onSignedAck?.(e.target.checked)} className="h-5 w-5 accent-[#0b3dd0]" />
          <TriangleAlert aria-hidden size={14} />
          <span>{signed === 1 ? 'This PDF is digitally signed. I understand the saved copy will no longer be signed (the signature becomes invalid).' : `This PDF has ${signed} digital signatures. I understand the saved copy will no longer be signed (the signatures become invalid).`}</span>
        </label>
      )}
      {hasForm && (
        <label className="flex items-center gap-2 text-foreground" title="Off: the fields stay fillable with your values in them. On: the values become plain page content and the fields are gone.">
          <input type="checkbox" data-testid="flatten-form" checked={flatten} onChange={(e) => onFlatten(e.target.checked)} className="h-5 w-5 accent-[#0b3dd0]" />
          <span>Flatten the form when saving</span>
        </label>
      )}
    </div>
  )
}
