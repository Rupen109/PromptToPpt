import type { SlideElement, TextElement, Theme } from '@prompttoppt/validation'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useState } from 'react'

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
  const text = el.type === 'text' ? el : null
  const top = Math.max(4, el.y * scale - 46)
  const left = Math.min(Math.max(4, el.x * scale), Math.max(4, stageWidth - 360))
  const adv = (fn: () => void) => () => requireAdvanced() && fn()

  return (
    <div role="toolbar" aria-label="Element tools" style={{ position: 'absolute', top, left, zIndex: 20 }} className="flex items-center gap-0.5 bg-white border border-border rounded-xl shadow-lg px-1.5 py-1" onPointerDown={(e) => e.stopPropagation()}>
      {text && (
        <>
          <button aria-label="Smaller text" className={btn} onClick={adv(() => apply('Font size', (d) => C.updateElement(d, slideId, el.id, { fontSize: Math.max(10, text.fontSize - 2) }), { mergeKey: `fs:${el.id}` }))}>−</button>
          <span className="text-sm tabular-nums w-8 text-center" aria-label="Font size">{Math.round(text.fontSize)}</span>
          <button aria-label="Larger text" className={btn} onClick={adv(() => apply('Font size', (d) => C.updateElement(d, slideId, el.id, { fontSize: Math.min(300, text.fontSize + 2) }), { mergeKey: `fs:${el.id}` }))}>+</button>
          <span className="w-px h-5 bg-border mx-1" />
          <button aria-label="Bold" aria-pressed={!!text.paragraphs[0]?.runs[0]?.bold} className={`${btn} font-extrabold`} onClick={adv(() => apply('Bold', (d) => C.setText(d, slideId, el.id, text.paragraphs.map((p) => ({ ...p, runs: p.runs.map((r) => ({ ...r, bold: !text.paragraphs[0]?.runs[0]?.bold })) })))))}>B</button>
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} aria-label={`Align ${a}`} aria-pressed={text.align === a} className={`${btn} ${text.align === a ? 'bg-slate-100' : ''}`} onClick={adv(() => apply('Align', (d) => C.updateElement(d, slideId, el.id, { align: a })))}>{{ left: '⇤', center: '↔', right: '⇥' }[a]}</button>
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
      {el.type === 'image' && (
        <>
          <button className={btn} onClick={adv(() => openImageDialog({ elementId: el.id }))}>✨ AI image</button>
          <button className={btn} onClick={() => setUrlOpen((v) => !v)}>Image URL</button>
          {urlOpen && (
            <form className="flex gap-1 ml-1" onSubmit={(e) => {
              e.preventDefault()
              const raw = String(new FormData(e.currentTarget).get('url') ?? '').trim()
              try {
                const u = new URL(raw)
                if (u.protocol !== 'https:') throw new Error('https only')
                apply('Replace image', (d) => C.updateElement(d, slideId, el.id, { src: u.toString() } as Partial<SlideElement>))
                setUrlOpen(false)
              } catch {
                alert('Enter a valid https:// image URL.')
              }
            }}>
              <input name="url" aria-label="Image URL" placeholder="https://…" className="border border-border rounded-md px-2 text-sm w-44" />
              <button className={`${btn} bg-primary text-white hover:bg-primary`}>Set</button>
            </form>
          )}
          <span className="w-px h-5 bg-border mx-1" />
        </>
      )}
      <button aria-label={el.locked ? 'Unlock' : 'Lock'} aria-pressed={el.locked} className={btn} onClick={() => apply(el.locked ? 'Unlock' : 'Lock', (d) => C.toggleLock(d, slideId, el.id))}>{el.locked ? '🔒' : '🔓'}</button>
      <button aria-label="Duplicate" className={btn} disabled={el.locked} onClick={adv(() => { let ids: string[] = []; apply('Duplicate', (d) => { ids = C.duplicateElements(d, slideId, [el.id]) }); select(ids) })}>⧉</button>
      <button aria-label="Delete" className={`${btn} text-red-600`} disabled={el.locked} onClick={adv(() => { apply('Delete', (d) => C.deleteElements(d, slideId, [el.id])); select([]); edit(null) })}>🗑</button>
    </div>
  )
}
