import { AlignCenter, AlignLeft, AlignRight, Bold, Copy, Italic, Link2, List, ListOrdered, Lock, LockOpen, Minus, Plus, Sparkles, Trash2, Underline } from '@prompttoppt/ui/icons'
import type { SlideElement, TextElement, Theme } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useState } from 'react'
import { ColorButton } from './toolbar/ColorButton'

/** Theme colour roles offered as swatches. The swatch SHOWS the deck's real colour for that role (a hard-coded swatch lied when the theme changed). */
const ROLES: { token: 'textPrimary' | 'textSecondary' | 'primary' | 'accent' | 'onPrimary'; label: string }[] = [
  { token: 'textPrimary', label: 'Text' }, { token: 'textSecondary', label: 'Muted' }, { token: 'primary', label: 'Primary' }, { token: 'accent', label: 'Accent' }, { token: 'onPrimary', label: 'On primary' },
]
/** Everyday colours that are always the same, whatever the theme. */
const STANDARD = [{ hex: '#DC2626', label: 'Red' }, { hex: '#F59E0B', label: 'Amber' }, { hex: '#16A34A', label: 'Green' }, { hex: '#2563EB', label: 'Blue' }, { hex: '#111111', label: 'Black' }, { hex: '#FFFFFF', label: 'White' }]
const btn = 'h-8 min-w-8 px-2 rounded-md text-sm font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent'

/** Contextual toolbar above the selected element (text formatting, lock, duplicate, delete, image URL). */
export function FormatBar({ el, slideId, scale, stageWidth, theme, requireAdvanced }: { el: SlideElement; slideId: string; scale: number; stageWidth: number; theme: Theme; requireAdvanced: () => boolean }) {
  const apply = useDoc((s) => s.apply)
  const { select, edit, openImageDialog } = useUi()
  const [urlOpen, setUrlOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const docId = useDoc((s) => s.doc?.id ?? '')
  const text = el.type === 'text' ? el : null
  const top = Math.max(4, el.y * scale - 46)
  const left = Math.min(Math.max(4, el.x * scale), Math.max(4, stageWidth - (text ? 640 : 360)))
  const adv = (fn: () => void) => () => requireAdvanced() && fn()
  const tokenHex = (t: string | undefined) => (t ? (t.startsWith('#') ? t : (theme.colors as Record<string, string>)[t === 'text' ? 'textPrimary' : t] ?? null) : null)
  const set = (patch: Record<string, unknown>, key: string) => adv(() => apply('Colour', (d) => C.updateElement(d, slideId, el.id, patch as Partial<SlideElement>), { mergeKey: `${key}:${el.id}` }))()

  return (
    <div role="toolbar" aria-label="Element tools" style={{ position: 'absolute', top, left, zIndex: 20, maxWidth: Math.max(280, stageWidth - 8) }} className="flex flex-wrap items-center gap-0.5 bg-white border border-border rounded-xl shadow-lg px-1.5 py-1" onPointerDown={(e) => e.stopPropagation()}>
      {text && (
        <>
          <button aria-label="Smaller text" className={btn} onClick={adv(() => apply('Font size', (d) => C.updateElement(d, slideId, el.id, { fontSize: Math.max(10, text.fontSize - 2) }), { mergeKey: `fs:${el.id}` }))}><Minus aria-hidden size={16} /></button>
          <span className="text-sm tabular-nums w-8 text-center" aria-label="Font size">{Math.round(text.fontSize)}</span>
          <button aria-label="Larger text" className={btn} onClick={adv(() => apply('Font size', (d) => C.updateElement(d, slideId, el.id, { fontSize: Math.min(300, text.fontSize + 2) }), { mergeKey: `fs:${el.id}` }))}><Plus aria-hidden size={16} /></button>
          <span className="w-px h-5 bg-border mx-1" />
          {([['bold', 'Bold', Bold], ['italic', 'Italic', Italic], ['underline', 'Underline', Underline]] as const).map(([flag, label, Icon]) => {
            const on = !!text.paragraphs[0]?.runs[0]?.[flag]
            return <button key={flag} aria-label={label} title={label} aria-pressed={on} className={`${btn} ${on ? 'bg-slate-100' : ''}`} onClick={adv(() => apply(label, (d) => C.setRunFlag(d, slideId, el.id, flag, !on)))}><Icon aria-hidden size={16} /></button>
          })}
          {([['bullet', 'Bullet list', List], ['number', 'Numbered list', ListOrdered]] as const).map(([kind, label, Icon]) => {
            const on = text.paragraphs.every((p) => p.list === kind)
            return <button key={kind} aria-label={label} title={label} aria-pressed={on} className={`${btn} ${on ? 'bg-slate-100' : ''}`} onClick={adv(() => apply(label, (d) => C.setList(d, slideId, el.id, on ? null : kind)))}><Icon aria-hidden size={16} /></button>
          })}
          <button aria-label="Link" title="Link this text" aria-pressed={!!text.paragraphs[0]?.runs[0]?.link} className={`${btn} ${text.paragraphs[0]?.runs[0]?.link ? 'bg-slate-100' : ''}`} onClick={() => setLinkOpen((v) => !v)}><Link2 aria-hidden size={16} /></button>
          {linkOpen && (
            <form className="flex gap-1 ml-1" onSubmit={(e) => {
              e.preventDefault()
              const raw = String(new FormData(e.currentTarget).get('link') ?? '').trim()
              if (!raw) { if (requireAdvanced()) { apply('Remove link', (d) => C.setLink(d, slideId, el.id, null)); setLinkOpen(false) } return }
              try {
                const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`)
                if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('web links only')
                if (requireAdvanced()) { apply('Add link', (d) => C.setLink(d, slideId, el.id, u.toString())); setLinkOpen(false) }
              } catch {
                alert('Enter a web address, like https://example.com')
              }
            }}>
              <input name="link" aria-label="Link address" placeholder="https://… (empty removes)" defaultValue={text.paragraphs[0]?.runs[0]?.link ?? ''} className="border border-border rounded-md px-2 text-sm w-48" />
              <button className={`${btn} bg-primary text-white hover:bg-primary`}>Set</button>
            </form>
          )}
          <span className="w-px h-5 bg-border mx-1" />
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} aria-label={`Align ${a}`} aria-pressed={text.align === a} className={`${btn} ${text.align === a ? 'bg-slate-100' : ''}`} onClick={adv(() => apply('Align', (d) => C.updateElement(d, slideId, el.id, { align: a })))}>{(() => { const I = { left: AlignLeft, center: AlignCenter, right: AlignRight }[a]; return <I aria-hidden size={16} /> })()}</button>
          ))}
          <span className="w-px h-5 bg-border mx-1" />
          {ROLES.map((r) => (
            <button key={r.token} aria-label={`Theme colour ${r.label}`} title={`${r.label} (theme)`} aria-pressed={text.color === r.token} onClick={adv(() => apply('Colour', (d) => C.updateElement(d, slideId, el.id, { color: r.token })))} className="w-5 h-5 rounded-full border border-slate-300 mx-0.5" style={{ background: theme.colors[r.token], outline: text.color === r.token ? '2px solid #2563eb' : undefined, outlineOffset: 1 }} />
          ))}
          <span className="w-px h-5 bg-border mx-1" />
          {STANDARD.map((c) => (
            <button key={c.hex} aria-label={`Colour ${c.label}`} title={c.label} aria-pressed={text.color.toLowerCase() === c.hex.toLowerCase()} onClick={adv(() => apply('Colour', (d) => C.updateElement(d, slideId, el.id, { color: c.hex as TextElement['color'] })))} className="w-5 h-5 rounded-full border border-slate-300 mx-0.5" style={{ background: c.hex, outline: text.color.toLowerCase() === c.hex.toLowerCase() ? '2px solid #2563eb' : undefined, outlineOffset: 1 }} />
          ))}
          <label className="relative mx-0.5 w-5 h-5 rounded-full border border-slate-300 overflow-hidden cursor-pointer" title="Any colour…" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
            <input type="color" aria-label="Custom colour" className="absolute inset-0 opacity-0 cursor-pointer" value={/^#[0-9a-f]{6}$/i.test(text.color) ? text.color : (theme.colors as Record<string, string>)[text.color] ?? '#000000'} onChange={(e) => adv(() => apply('Colour', (d) => C.updateElement(d, slideId, el.id, { color: e.target.value.toUpperCase() as TextElement['color'] }), { mergeKey: `color:${el.id}` }))()} />
          </label>
          <span className="w-px h-5 bg-border mx-1" />
        </>
      )}
      {el.type === 'shape' && (
        <>
          <ColorButton testId="shape-fill" label={el.shape === 'line' ? 'Line' : 'Fill'} value={el.fill === 'none' ? null : tokenHex(el.fill)} theme={theme}
            onPick={(hex) => set({ fill: hex, gradient: undefined }, 'fill')} {...(el.shape !== 'line' && el.shape !== 'ring' ? { onNone: () => set({ fill: 'none', gradient: undefined }, 'fill') } : {})} />
          {el.shape !== 'line' && (
            <>
              <ColorButton testId="shape-border" label="Border" value={el.stroke && (el.strokeWidth ?? 3) > 0 ? tokenHex(el.stroke) : null} theme={theme}
                onPick={(hex) => set({ stroke: hex, strokeWidth: el.strokeWidth || 4 }, 'stroke')} onNone={() => set({ stroke: undefined, strokeWidth: undefined }, 'stroke')} />
              {el.stroke && <>
                <button aria-label="Thinner border" className={btn} onClick={adv(() => apply('Border', (d) => C.updateElement(d, slideId, el.id, { strokeWidth: Math.max(1, (el.strokeWidth ?? 4) - 1) } as Partial<SlideElement>), { mergeKey: `sw:${el.id}` }))}><Minus aria-hidden size={14} /></button>
                <span className="text-sm tabular-nums w-5 text-center" aria-label="Border width">{el.strokeWidth ?? 4}</span>
                <button aria-label="Thicker border" className={btn} onClick={adv(() => apply('Border', (d) => C.updateElement(d, slideId, el.id, { strokeWidth: Math.min(40, (el.strokeWidth ?? 4) + 1) } as Partial<SlideElement>), { mergeKey: `sw:${el.id}` }))}><Plus aria-hidden size={14} /></button>
              </>}
            </>
          )}
          <span className="w-px h-5 bg-border mx-1" />
        </>
      )}
      {el.type === 'table' && (
        <>
          <ColorButton testId="table-header-fill" label="Header" value={el.headerFill === 'none' ? null : el.headerFill ?? theme.colors.primary} theme={theme} onPick={(hex) => set({ headerFill: hex }, 'th')} onNone={() => set({ headerFill: 'none' }, 'th')} />
          <ColorButton testId="table-header-text" label="Header text" value={el.headerColor ?? theme.colors.onPrimary} theme={theme} onPick={(hex) => set({ headerColor: hex }, 'tht')} onNone={() => set({ headerColor: undefined }, 'tht')} />
          <ColorButton testId="table-row" label="Rows" value={el.rowFill === 'none' ? null : el.rowFill ?? theme.colors.surface} theme={theme} onPick={(hex) => set({ rowFill: hex }, 'tr')} onNone={() => set({ rowFill: 'none' }, 'tr')} />
          <ColorButton testId="table-alt-row" label="Alternate rows" value={el.altRowFill === 'none' ? null : el.altRowFill ?? null} theme={theme} onPick={(hex) => set({ altRowFill: hex }, 'ta')} onNone={() => set({ altRowFill: 'none' }, 'ta')} />
          <ColorButton testId="table-text" label="Text" value={el.textColor ?? theme.colors.textPrimary} theme={theme} onPick={(hex) => set({ textColor: hex }, 'tt')} onNone={() => set({ textColor: undefined }, 'tt')} />
          <ColorButton testId="table-border" label="Borders" value={el.borderColor ?? null} theme={theme} onPick={(hex) => set({ borderColor: hex }, 'tb')} onNone={() => set({ borderColor: undefined }, 'tb')} />
          <button className={btn} data-testid="table-edit" onClick={() => useUi.getState().editTable(el.id)}>Edit cells</button>
          <span className="w-px h-5 bg-border mx-1" />
        </>
      )}
      {el.type === 'image' && (
        <>
          <button className={`${btn} inline-flex items-center gap-1.5`} onClick={adv(() => openImageDialog({ elementId: el.id }))}><Sparkles aria-hidden size={14} />AI image</button>
          <button className={btn} onClick={() => setUrlOpen((v) => !v)}>Image URL</button>
          {urlOpen && (
            <form className="flex gap-1 ml-1" onSubmit={(e) => {
              e.preventDefault()
              const raw = String(new FormData(e.currentTarget).get('url') ?? '').trim()
              try {
                const u = new URL(raw)
                if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('web address only')
                setImporting(true)
                // the server downloads it and keeps a copy: a slide that points at someone else's address shows nothing under the page's image policy
                api.importImage(docId, u.toString())
                  .then((r) => { apply('Replace image', (d) => C.updateElement(d, slideId, el.id, { src: r.url } as Partial<SlideElement>)); setUrlOpen(false) })
                  .catch((err: unknown) => alert(err instanceof Error ? err.message : 'We could not download that picture.'))
                  .finally(() => setImporting(false))
              } catch {
                alert('Enter a web address that links straight to a picture, like https://example.com/photo.jpg')
              }
            }}>
              <input name="url" aria-label="Image URL" placeholder="https://… (PNG or JPEG)" className="border border-border rounded-md px-2 text-sm w-48" />
              <button disabled={importing} className={`${btn} bg-primary text-white hover:bg-primary`}>{importing ? 'Fetching…' : 'Set'}</button>
            </form>
          )}
          <span className="w-px h-5 bg-border mx-1" />
        </>
      )}
      <button aria-label={el.locked ? 'Unlock' : 'Lock'} aria-pressed={el.locked} className={btn} onClick={() => apply(el.locked ? 'Unlock' : 'Lock', (d) => C.toggleLock(d, slideId, el.id))}>{el.locked ? <Lock aria-hidden size={16} /> : <LockOpen aria-hidden size={16} />}</button>
      <button aria-label="Duplicate" className={btn} disabled={el.locked} onClick={adv(() => { let ids: string[] = []; apply('Duplicate', (d) => { ids = C.duplicateElements(d, slideId, [el.id]) }); select(ids) })}><Copy aria-hidden size={16} /></button>
      <button aria-label="Delete" className={`${btn} text-red-600`} disabled={el.locked} onClick={adv(() => { apply('Delete', (d) => C.deleteElements(d, slideId, [el.id])); select([]); edit(null) })}><Trash2 aria-hidden size={16} /></button>
    </div>
  )
}
