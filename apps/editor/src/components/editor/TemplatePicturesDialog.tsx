import { useMemo, useState } from 'react'
import { Images, Upload, X } from '@prompttoppt/ui/icons'
import { MORPH_TEMPLATES, pictureSlots, type PictureSlot } from '@prompttoppt/theme/morph-templates'
import type { Presentation } from '@prompttoppt/validation'
import { Portal } from '@/components/Portal'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import { useDialog } from '@/lib/useDialog'
import { MediaLibraryDialog, type PickedMedia } from './toolbar/MediaLibraryDialog'

/** The Morph template a deck was made from (null for any other deck). */
export const templateOfDeck = (doc: Presentation) => {
  const c = doc.slides.find((s) => s.content?.layout === 'morph-template')?.content
  return c && c.layout === 'morph-template' ? MORPH_TEMPLATES.find((t) => t.id === c.template) ?? null : null
}

/**
 * "Template pictures": every picture of a Morph template deck, once. A picture is the same object on every slide it is on, so replacing it here replaces it on all of them and the Morph
 * between the slides stays smooth. The photos come first; the light and haze that make the template's atmosphere are below, and can be replaced too.
 */
export function TemplatePicturesDialog({ doc, presentationId, onClose }: { doc: Presentation; presentationId: string; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const apply = useDoc((s) => s.apply)
  const tpl = useMemo(() => templateOfDeck(doc), [doc])
  const [picking, setPicking] = useState<PictureSlot | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [atmosphere, setAtmosphere] = useState(false)
  const slots = useMemo(() => (tpl ? pictureSlots(tpl) : []), [tpl])
  const current = (slot: PictureSlot) => { for (const u of slot.uses) { const sl = doc.slides.find((x) => x.content?.layout === 'morph-template' && x.content.scene === u.scene); const e = sl?.elements.find((x) => x.type === 'image' && x.id === u.id); if (e && e.type === 'image') return e.src } return '' }
  const put = (slot: PictureSlot, m: { url: string; alt: string; attribution?: PickedMedia['attribution'] }) => { apply('Replace template picture', (d) => { C.replaceTemplatePicture(d, slot.uses, m) }) }
  async function upload(slot: PictureSlot, f: File) {
    setBusy(slot.key); setError(null)
    try { const r = await api.uploadImage(presentationId, f); put(slot, { url: r.url, alt: r.name }) } catch (e) { setError(e instanceof Error ? e.message : 'Could not add that picture.') } finally { setBusy(null) }
  }
  const row = (s: PictureSlot) => (
    <li key={s.key} className="flex items-center gap-3 rounded-xl border border-border p-2.5" data-testid={`tpl-pic-${s.key}`}>
      <img src={current(s)} alt="" className="w-20 h-14 rounded-lg object-cover bg-slate-100 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{s.label}</div>
        <div className="text-xs text-slate-500">On {s.scenes.length} {s.scenes.length === 1 ? 'slide' : 'slides'}</div>
      </div>
      <label className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm cursor-pointer hover:border-slate-400">
        <Upload aria-hidden size={14} /> {busy === s.key ? 'Adding…' : 'Upload'}
        <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Upload a picture for ${s.label}`} data-testid={`tpl-pic-upload-${s.key}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(s, f) }} />
      </label>
      <button type="button" data-testid={`tpl-pic-library-${s.key}`} onClick={() => setPicking(s)} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:border-slate-400"><Images aria-hidden size={14} /> Library</button>
    </li>
  )
  const photos = slots.filter((s) => s.kind !== 'art')
  const art = slots.filter((s) => s.kind === 'art')
  return (
    <Portal><div className="fixed inset-0 z-[60] bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Template pictures" className="bg-white rounded-2xl w-full max-w-2xl max-h-[86vh] shadow-xl outline-none flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="font-heading font-bold text-xl">Template pictures</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500"><X aria-hidden size={20} /></button>
        </div>
        <p className="px-5 mt-1 text-sm text-slate-600">Replace a picture once and it changes on every slide it is on, so the Morph between the slides stays smooth.</p>
        {error && <p role="alert" className="mx-5 mt-2 text-sm text-red-700">{error}</p>}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <ul className="grid gap-2" aria-label="Photos">{photos.map(row)}</ul>
          {art.length > 0 && (
            <div className="mt-4">
              <button type="button" aria-expanded={atmosphere} onClick={() => setAtmosphere((v) => !v)} className="text-sm font-medium text-slate-700 underline">{atmosphere ? 'Hide' : 'Show'} the template's light and haze ({art.length})</button>
              {atmosphere && <ul className="grid gap-2 mt-2" aria-label="Atmosphere">{art.map(row)}</ul>}
            </div>
          )}
        </div>
      </div>
      {picking && <MediaLibraryDialog deckId={presentationId} mode="insert" onPick={(m) => { const slot = picking; setPicking(null); if (m.kind === 'image') put(slot, m) }} onClose={() => setPicking(null)} />}
    </div></Portal>
  )
}
