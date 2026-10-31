import { X } from '@prompttoppt/ui/icons'
import { Portal } from '@/components/Portal'
import { useEffect, useState } from 'react'
import { ApiError, type VersionSummary } from '@prompttoppt/api-client'
import type { Presentation } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { useDialog } from '@/lib/useDialog'

const WHO: Record<VersionSummary['createdBy'], string> = { generation: 'As generated', user: 'Your edits', restore: 'Restored copy', ai_edit: 'AI edit' }

/** Version history (spec: "version recovery"). Restoring adds a NEW latest version — history is never rewritten. */
export function VersionsDialog({ id, revision, onRestored, onClose }: { id: string; revision: number; onRestored: (doc: Presentation, revision: number) => void; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const [rows, setRows] = useState<VersionSummary[] | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.listVersions(id).then(setRows).catch(() => setError('Could not load version history.'))
  }, [id])
  async function restore(v: number) {
    setBusy(v)
    setError(null)
    try {
      const r = await api.restoreVersion(id, v, revision)
      onRestored(r.document, r.revision)
      onClose()
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'CONFLICT' ? 'The presentation changed elsewhere. Reload and try again.' : 'Could not restore that version.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Version history" className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl outline-none max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4"><h2 className="font-heading font-bold text-xl">Version history</h2><button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-slate-500"><X aria-hidden size={24} /></button></div>
        {error && <p role="alert" className="text-sm text-red-700 mb-3">{error}</p>}
        {!rows ? <p className="text-slate-500 text-sm">Loading…</p> : (
          <ul className="divide-y divide-border">
            {rows.map((r, i) => (
              <li key={r.version} className="py-3 flex items-center justify-between gap-3">
                <div><div className="font-medium text-sm">{WHO[r.createdBy]}{i === 0 && <span className="ml-2 text-[10px] font-bold text-green-700 bg-green-100 rounded-full px-1.5 py-0.5">CURRENT</span>}</div><div className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()} · {r.slides} slides</div></div>
                {i > 0 && <button disabled={busy !== null} onClick={() => void restore(r.version)} className="text-sm font-semibold text-primary disabled:opacity-50">{busy === r.version ? 'Restoring…' : 'Restore'}</button>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500 mt-4">Restoring creates a new version; nothing is deleted.</p>
      </div>
    </div></Portal>
  )
}
