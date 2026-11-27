import { FileUp, Trash2, X } from '@prompttoppt/ui/icons'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { SlideCanvas } from '@prompttoppt/ui'
import { ApiError, isGateError, type FileTemplateListItem, type FileTemplateSummary } from '@prompttoppt/api-client'
import type { GateCode } from '@prompttoppt/validation'
import { Portal } from '@/components/Portal'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import type { PendingFileTemplate } from '@/lib/pending-prompt'
import { useDialog } from '@/lib/useDialog'

export const asPending = (s: Pick<FileTemplateSummary, 'id' | 'name' | 'slideCount' | 'aspect' | 'fontsReplaced'>): PendingFileTemplate => ({ id: s.id, name: s.name, slideCount: s.slideCount, aspect: s.aspect, fontsReplaced: s.fontsReplaced })

/** Uploads a design file; returns its summary. Shared by the picker and the "Use its design too" button on an attached .pptx. */
export async function uploadDesign(file: File, upgradeShow: (reason?: string, code?: GateCode) => void): Promise<{ ok: true; summary: FileTemplateSummary } | { ok: false; message: string }> {
  if (!/\.(pptx|pdf)$/i.test(file.name)) return { ok: false, message: /\.ppt$/i.test(file.name) ? 'Old .ppt files are not supported: open it in PowerPoint and save as .pptx.' : 'Upload a PowerPoint (.pptx) or PDF file.' }
  if (file.size > 15 * 1024 * 1024) return { ok: false, message: `${file.name} is larger than 15 MB.` }
  try {
    return { ok: true, summary: await api.uploadFileTemplate(file) }
  } catch (e) {
    if (isGateError(e) && e.code === 'UPGRADE_REQUIRED') { upgradeShow(e.message, e.code); return { ok: false, message: e.message } }
    return { ok: false, message: e instanceof ApiError ? e.message : 'Could not read that file. Please try again.' }
  }
}

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * "Use a file's design": pick one of your uploaded designs (with a thumbnail of its first slide) or upload a PowerPoint now. Picking returns the design; the Home prompt box shows it as a chip.
 */
export function FileTemplatePicker({ onPick, onClose }: { onPick: (t: PendingFileTemplate) => void; onClose: () => void }) {
  const { upgrade } = useEntitlements()
  const dialogRef = useDialog<HTMLDivElement>(true, onClose)
  const input = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<FileTemplateListItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  useEffect(() => { api.fileTemplates().then(setItems).catch(() => setItems([])) }, [])

  async function upload(file: File | undefined) {
    if (!file || busy) return
    setBusy(true); setError(null)
    const r = await uploadDesign(file, upgrade.show)
    setBusy(false)
    if (!r.ok) return setError(r.message)
    onPick(asPending(r.summary))
  }
  async function remove(t: FileTemplateListItem) {
    if (!window.confirm(`Delete the design "${t.name}"? Presentations already made from it keep working.`)) return
    try { await api.deleteFileTemplate(t.id); setItems((cur) => (cur ?? []).filter((x) => x.id !== t.id)) } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not delete it. Please try again.') }
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void upload(e.dataTransfer.files[0]) }

  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Use a file's design" data-testid="file-tpl-dialog" className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-xl outline-none">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-heading font-bold text-xl">Use a file's design</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500 hover:text-slate-800"><X aria-hidden size={20} /></button>
        </div>
        <p className="text-sm text-slate-600">Upload a PowerPoint and your new presentation keeps its look: colours, fonts and slide layouts. You add the new content yourself, or the AI writes it. The words and photos of the original file are never copied.</p>

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}
          className={`mt-4 rounded-xl border-2 border-dashed p-5 text-center transition ${over ? 'border-primary bg-primary/5' : 'border-border bg-slate-50'}`}
        >
          <FileUp aria-hidden size={26} className="mx-auto text-slate-500" />
          <p className="mt-2 text-sm font-medium">{busy ? 'Reading your file…' : 'Drop a PowerPoint (.pptx) or PDF here, or'}</p>
          <button type="button" disabled={busy} onClick={() => input.current?.click()} data-testid="file-tpl-upload" className="mt-2 rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold disabled:opacity-60">Choose a file</button>
          <input ref={input} type="file" accept=".pptx,.pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf" hidden data-testid="file-tpl-input" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
          <p className="mt-2 text-xs text-slate-500">PowerPoint (.pptx) or PDF up to 15 MB. A PDF works when it has real text (made in PowerPoint, Google Slides, Canva or Keynote); pages that are only pictures cannot be used.</p>
        </div>
        {error && <p role="alert" data-testid="file-tpl-error" className="mt-3 text-sm font-medium text-red-700">{error}</p>}

        <h3 className="mt-6 text-sm font-semibold">Your designs</h3>
        {items === null ? <p className="mt-2 text-sm text-slate-500">Loading…</p> : items.length === 0 ? <p className="mt-2 text-sm text-slate-500" data-testid="file-tpl-empty">You have not uploaded a design yet.</p> : (
          <ul className="mt-3 grid sm:grid-cols-2 gap-3" data-testid="file-tpl-list" aria-label="Your designs">
            {items.map((t) => (
              <li key={t.id} data-testid={`file-tpl-item-${t.id}`} className="rounded-xl border border-border overflow-hidden bg-white">
                <button type="button" onClick={() => onPick(asPending(t))} data-testid={`file-tpl-use-${t.id}`} aria-label={`Use the design ${t.name}`} className="block w-full text-left hover:bg-slate-50">
                  <div className="bg-slate-100 p-2">{t.cover && <SlideCanvas slide={t.cover} theme={t.theme} aspect={t.aspect} width={240} />}</div>
                  <div className="px-3 py-2">
                    <div className="font-semibold text-sm truncate">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.slideCount} slide{t.slideCount === 1 ? '' : 's'} · added {when(t.createdAt)}</div>
                    {t.fontsReplaced.length > 0 && <div className="text-xs text-amber-700 mt-0.5">Fonts replaced: {t.fontsReplaced.map((f) => `${f.original} → ${f.mapped}`).join(', ')}</div>}
                  </div>
                </button>
                <div className="px-3 pb-2 flex justify-end">
                  <button type="button" onClick={() => void remove(t)} data-testid={`file-tpl-delete-${t.id}`} aria-label={`Delete the design ${t.name}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700"><Trash2 aria-hidden size={13} /> Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div></Portal>
  )
}

