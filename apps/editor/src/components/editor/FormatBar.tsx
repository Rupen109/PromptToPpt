import { AlignCenter, AlignJustify, AlignLeft, AlignRight, AlignVerticalSpaceAround, Baseline, Bold, Copy, Italic, Layers, Link2, List, ListOrdered, Lock, LockOpen, Minus, Plus, Sparkles, Trash2, Underline } from '@prompttoppt/ui/icons'
import { expandToGroups, isWholeGroup, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useState } from 'react'
import { ColorButton } from './toolbar/ColorButton'
import { useBackgroundRemovalAvailable } from '@/lib/bgremoval/available'
import { ArrangePanel } from './ArrangePanel'
import { SpacingPanel } from './SpacingPanel'
import { TextEffectsPanel } from './TextEffectsPanel'
import { useToolbarPlace } from './toolbarPlace'

/** Theme colour roles offered as swatches. The swatch SHOWS the deck's real colour for that role (a hard-coded swatch lied when the theme changed). */
const ROLES: { token: 'textPrimary' | 'textSecondary' | 'primary' | 'accent' | 'onPrimary'; label: string }[] = [
  { token: 'textPrimary', label: 'Text' }, { token: 'textSecondary', label: 'Muted' }, { token: 'primary', label: 'Primary' }, { token: 'accent', label: 'Accent' }, { token: 'onPrimary', label: 'On primary' },
]
/** Everyday colours that are always the same, whatever the theme. */
const STANDARD = [{ hex: '#DC2626', label: 'Red' }, { hex: '#F59E0B', label: 'Amber' }, { hex: '#16A34A', label: 'Green' }, { hex: '#2563EB', label: 'Blue' }, { hex: '#111111', label: 'Black' }, { hex: '#FFFFFF', label: 'White' }]
const btn = 'h-8 min-w-8 px-2 rounded-md text-sm font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent'

let arrangeRemembered = false

const DASHES = [{ v: undefined, label: 'Solid', dash: undefined }, { v: 'dash', label: 'Dashed', dash: '8 6' }, { v: 'dot', label: 'Dotted', dash: '2.5 2.5' }] as const
/** Solid / Dashed / Dotted for a shape's border or a line: each button draws its own line, so the choice is seen, not read */
function DashPicker({ value, onPick, disabled }: { value: 'dash' | 'dot' | undefined; onPick: (d: 'dash' | 'dot' | undefined) => void; disabled?: boolean | undefined }) {
  return (
    <span role="group" aria-label="Line style" className="inline-flex items-center rounded-md border border-border mx-1 overflow-hidden">
      {DASHES.map((d) => (
        <button key={d.label} type="button" aria-label={d.label} title={d.label} aria-pressed={value === d.v} disabled={disabled} onClick={() => onPick(d.v)} className={`h-7 w-9 grid place-items-center hover:bg-slate-100 disabled:opacity-40 ${value === d.v ? 'bg-slate-100' : ''}`}>
          <svg aria-hidden width="22" height="6" viewBox="0 0 22 6"><line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="2.5" {...(d.dash ? { strokeDasharray: d.dash } : {})} /></svg>
        </button>
      ))}
    </span>
  )
}
let spacingRemembered = false
let effectsRemembered = false

/** Contextual toolbar above the selected element (text formatting, lock, duplicate, delete, image URL). */
export function FormatBar({ el, around, slideId, scale, stageWidth, stageHeight, theme, requireAdvanced }: { el: SlideElement; around?: { x: number; y: number; width: number; height: number }; slideId: string; scale: number; stageWidth: number; stageHeight: number; theme: Theme; requireAdvanced: () => boolean }) {
  const apply = useDoc((s) => s.apply)
  const { select, edit, openImageDialog, openBgRemoval } = useUi()
  const bgAvailable = useBackgroundRemovalAvailable()
  const [urlOpen, setUrlOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [lookOpen, setLookOpen] = useState(false)
  const [gradOpen, setGradOpen] = useState(false)
  // stays open from one object to the next and across a drag (the bar is hidden while dragging), like a ribbon tab
  const [arrangeOpen, setArrangeOpenState] = useState(arrangeRemembered)
  const setArrangeOpen = (f: (v: boolean) => boolean) => setArrangeOpenState((v) => (arrangeRemembered = f(v)))
  const slide = useDoc((s) => s.doc?.slides.find((x) => x.id === slideId))
  const aspect = useDoc((s) => s.doc?.aspectRatio ?? '16:9')
  const [spacingOpen, setSpacingOpenState] = useState(spacingRemembered)
  const toggleSpacing = () => setSpacingOpenState((v) => (spacingRemembered = !v))
  const [effectsOpen, setEffectsOpenState] = useState(effectsRemembered)
  const toggleEffects = () => setEffectsOpenState((v) => (effectsRemembered = !v))
  const selection = useUi((s) => s.selection)
  const siblings = useDoc((s) => s.doc?.slides.find((x) => x.id === slideId)?.elements) ?? []
  const picked = expandToGroups(siblings, selection)
  const canGroup = picked.length >= 2 && !isWholeGroup(siblings, picked)
  const inGroup = siblings.some((e) => picked.includes(e.id) && !!e.groupId)
  const docId = useDoc((s) => s.doc?.id ?? '')
  const text = el.type === 'text' ? el : null
  const { measure, top: placeTop, left: placeLeft, maxHeight: placeMaxH } = useToolbarPlace(around ?? el, scale, stageWidth, stageHeight)
  const top = placeTop
  const left = placeLeft
  const adv = (fn: () => void) => () => requireAdvanced() && fn()
  const tokenHex = (t: string | undefined) => (t ? (t.startsWith('#') ? t : (theme.colors as Record<string, string>)[t === 'text' ? 'textPrimary' : t] ?? null) : null)
  const set = (patch: Record<string, unknown>, key: string) => adv(() => apply('Colour', (d) => C.updateElement(d, slideId, el.id, patch as Partial<SlideElement>), { mergeKey: `${key}:${el.id}` }))()

  return (
    <div ref={measure} role="toolbar" aria-label="Element tools" data-testid="format-bar" style={{ position: 'absolute', top, left, zIndex: 20, maxWidth: Math.max(280, stageWidth - 8), ...(placeMaxH ? { maxHeight: placeMaxH, overflowY: 'auto' as const } : {}) }} className="flex flex-wrap items-center gap-0.5 bg-white border border-border rounded-xl shadow-lg px-1.5 py-1" onPointerDown={(e) => e.stopPropagation()}>
      {text && (
        <>
          <button aria-label="Smaller text" className={btn} onClick={adv(() => apply('Font size', (d) => C.updateElement(d, slideId, el.id, { fontSize: Math.max(10, text.fontSize - 2) }), { mergeKey: `fs:${el.id}` }))}><Minus aria-hidden size={16} /></button>
          <span className="text-sm tabular-nums w-8 text-center" aria-label="Font size">{Math.round(text.fontSize)}</span>
          <button aria-label="Larger text" className={btn} onClick={adv(() => apply('Font size', (d) => C.updateElement(d, slideId, el.id, { fontSize: Math.min(300, text.fontSize + 2) }), { mergeKey: `fs:${el.id}` }))}><Plus aria-hidden size={16} /></button>
          <span className="w-px h-5 bg-border mx-1" />
          {([['bold', 'Bold', Bold], ['italic', 'Italic', Italic], ['underline', 'Underline', Underline]] as const).map(([flag, label, Icon]) => {
            const on = C.boxHasFlag(text, flag) // as DRAWN, every word (a title is bold by its role; one bold word does not make the box bold)
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
          {(['left', 'center', 'right', 'justify'] as const).map((a) => (
            <button key={a} aria-label={`Align ${a}`} aria-pressed={text.align === a} className={`${btn} ${text.align === a ? 'bg-slate-100' : ''}`} onClick={adv(() => apply('Align', (d) => C.updateElement(d, slideId, el.id, { align: a })))}>{(() => { const I = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }[a]; return <I aria-hidden size={16} /> })()}</button>
          ))}
          <button type="button" data-testid="spacing" aria-expanded={spacingOpen} title="Spacing: between lines, paragraphs and letters" className={`${btn} inline-flex items-center gap-1.5 ${spacingOpen ? 'bg-slate-100' : ''}`} onClick={toggleSpacing}><AlignVerticalSpaceAround aria-hidden size={16} /><span className="max-xl:sr-only">Spacing</span></button>
          <button type="button" data-testid="text-effects" aria-expanded={effectsOpen} title="Effects: shadow and outline of the letters" className={`${btn} inline-flex items-center gap-1.5 ${effectsOpen ? 'bg-slate-100' : ''}`} onClick={toggleEffects}><Baseline aria-hidden size={16} /><span className="max-xl:sr-only">Effects</span></button>
          <span className="w-px h-5 bg-border mx-1" />
          {ROLES.map((r) => (
            <button key={r.token} aria-label={`Theme colour ${r.label}`} title={`${r.label} (theme)`} aria-pressed={text.color === r.token} onClick={adv(() => apply('Colour', (d) => C.setTextColor(d, slideId, el.id, r.token)))} className="w-5 h-5 rounded-full border border-slate-300 mx-0.5" style={{ background: theme.colors[r.token], outline: text.color === r.token ? '2px solid #2563eb' : undefined, outlineOffset: 1 }} />
          ))}
          <span className="w-px h-5 bg-border mx-1" />
          {STANDARD.map((c) => (
            <button key={c.hex} aria-label={`Colour ${c.label}`} title={c.label} aria-pressed={text.color.toLowerCase() === c.hex.toLowerCase()} onClick={adv(() => apply('Colour', (d) => C.setTextColor(d, slideId, el.id, c.hex as TextElement['color'])))} className="w-5 h-5 rounded-full border border-slate-300 mx-0.5" style={{ background: c.hex, outline: text.color.toLowerCase() === c.hex.toLowerCase() ? '2px solid #2563eb' : undefined, outlineOffset: 1 }} />
          ))}
          <label className="relative mx-0.5 w-5 h-5 rounded-full border border-slate-300 overflow-hidden cursor-pointer" title="Any colour…" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
            <input type="color" aria-label="Custom colour" className="absolute inset-0 opacity-0 cursor-pointer" value={/^#[0-9a-f]{6}$/i.test(text.color) ? text.color : (theme.colors as Record<string, string>)[text.color] ?? '#000000'} onChange={(e) => adv(() => apply('Colour', (d) => C.setTextColor(d, slideId, el.id, e.target.value.toUpperCase() as TextElement['color']), { mergeKey: `color:${el.id}` }))()} />
          </label>
          <span className="w-px h-5 bg-border mx-1" />
        </>
      )}
      {el.type === 'shape' && (
        <>
          <ColorButton testId="shape-fill" label={el.shape === 'line' ? 'Line' : 'Fill'} value={el.fill === 'none' ? null : tokenHex(el.fill)} theme={theme}
            onPick={(hex) => set({ fill: hex, gradient: undefined }, 'fill')} {...(el.shape !== 'line' && el.shape !== 'ring' ? { onNone: () => set({ fill: 'none', gradient: undefined }, 'fill') } : {})} />
          {el.shape !== 'line' && el.shape !== 'ring' && <button type="button" data-testid="shape-gradient" aria-expanded={gradOpen} title="A two-colour gradient fill (linear or radial)" className={`${btn} ${gradOpen || el.gradient ? 'bg-slate-100' : ''}`} onClick={() => setGradOpen((v) => !v)}>Gradient</button>}
          {el.shape === 'line' && <DashPicker value={el.strokeDash} onPick={(d) => adv(() => apply('Line style', (x) => C.updateElement(x, slideId, el.id, { strokeDash: d } as Partial<SlideElement>)))()} disabled={el.locked} />}
          {el.shape !== 'line' && (
            <>
              <ColorButton testId="shape-border" label="Border" value={el.stroke && (el.strokeWidth ?? 3) > 0 ? tokenHex(el.stroke) : null} theme={theme}
                onPick={(hex) => set({ stroke: hex, strokeWidth: el.strokeWidth || 4 }, 'stroke')} onNone={() => set({ stroke: undefined, strokeWidth: undefined }, 'stroke')} />
              {el.stroke && <>
                <button aria-label="Thinner border" className={btn} onClick={adv(() => apply('Border', (d) => C.updateElement(d, slideId, el.id, { strokeWidth: Math.max(1, (el.strokeWidth ?? 4) - 1) } as Partial<SlideElement>), { mergeKey: `sw:${el.id}` }))}><Minus aria-hidden size={14} /></button>
                <span className="text-sm tabular-nums w-5 text-center" aria-label="Border width">{el.strokeWidth ?? 4}</span>
                <button aria-label="Thicker border" className={btn} onClick={adv(() => apply('Border', (d) => C.updateElement(d, slideId, el.id, { strokeWidth: Math.min(40, (el.strokeWidth ?? 4) + 1) } as Partial<SlideElement>), { mergeKey: `sw:${el.id}` }))}><Plus aria-hidden size={14} /></button>
                <DashPicker value={el.strokeDash} onPick={(d) => adv(() => apply('Border style', (x) => C.updateElement(x, slideId, el.id, { strokeDash: d } as Partial<SlideElement>)))()} disabled={el.locked} />
              </>}
            </>
          )}
          {/* a shadow under the shape (the pictures' presets), following its outline */}
          <span role="group" aria-label="Shape shadow" className="inline-flex items-center rounded-md border border-border mx-1 overflow-hidden text-xs">
            {(['none', 'soft', 'strong'] as const).map((k) => <button key={k} type="button" aria-pressed={(el.shadow ?? 'none') === k} title={k === 'none' ? 'No shadow' : `${k} shadow`} disabled={el.locked} onClick={adv(() => apply('Shape shadow', (d) => C.updateElement(d, slideId, el.id, { shadow: k === 'none' ? undefined : k } as Partial<SlideElement>)))} className={`h-7 px-2 capitalize hover:bg-slate-100 disabled:opacity-40 ${(el.shadow ?? 'none') === k ? 'bg-slate-100 font-semibold' : ''}`}>{k === 'none' ? 'No shadow' : k}</button>)}
          </span>
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
      {el.type === 'chart' && (
        <>
          <button className={btn} data-testid="chart-edit" onClick={() => useUi.getState().editChart(el.id)}>Edit data</button>
          <span className="w-px h-5 bg-border mx-1" />
        </>
      )}
      {el.type === 'image' && (
        <>
          <button className={`${btn} inline-flex items-center gap-1.5`} onClick={adv(() => openImageDialog({ elementId: el.id }))}><Sparkles aria-hidden size={14} />AI image</button>
          {bgAvailable && <button className={btn} data-testid="remove-background" disabled={el.locked || !el.src} title="Cut the subject out of this picture (development preview)" onClick={adv(() => openBgRemoval({ slideId, elementId: el.id }))}>Remove background</button>}
          <button className={btn} onClick={() => setUrlOpen((v) => !v)}>Image URL</button>
          <button className={btn} data-testid="crop-picture" disabled={el.locked || !el.src} onClick={adv(() => useUi.getState().openCrop(el.id))}>Crop</button>
          <button className={btn} data-testid="picture-look" aria-expanded={lookOpen} onClick={() => setLookOpen((v) => !v)}>Picture</button>
          {lookOpen && el.type === 'image' && (() => {
            const img = el
            const f = img.filter ?? { brightness: 1, contrast: 1, grayscale: 0 }
            const focus = img.focus ?? { x: 0.5, y: 0.5 }
            const change = (label: string, patch: Record<string, unknown>, key: string) => adv(() => apply(label, (d) => C.updateElement(d, slideId, img.id, patch as Partial<SlideElement>), { mergeKey: `${key}:${img.id}` }))()
            const slider = (label: string, value: number, min: number, max: number, step: number, on: (v: number) => void, show?: (v: number) => string) => (
              <label className="flex items-center gap-2 text-xs text-slate-600 w-full">
                <span className="w-20 shrink-0">{label}</span>
                <input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={img.locked} onChange={(e) => on(Number(e.target.value))} className="flex-1" />
                <span className="w-14 text-right tabular-nums">{show ? show(value) : Number.isInteger(value * 10) ? value.toFixed(1) : value.toFixed(2)}</span>
              </label>
            )
            return (
              <div data-testid="picture-look-panel" className="basis-full grid sm:grid-cols-2 gap-x-6 gap-y-1.5 px-2 py-2 border-t border-border mt-1">
                {img.crop
                  ? <p className="text-xs text-slate-600 sm:col-span-2">This picture is cropped, so zoom and position are not used. Choose Crop, then Remove crop, to use them.</p>
                  : <>
                      {slider('Zoom', img.zoom ?? 1, 1, 5, 0.1, (v) => change('Picture zoom', { zoom: v }, 'zoom'))}
                      {slider('Left / right', focus.x, 0, 1, 0.05, (v) => change('Picture position', { focus: { x: v, y: focus.y } }, 'focus'))}
                      {slider('Up / down', focus.y, 0, 1, 0.05, (v) => change('Picture position', { focus: { x: focus.x, y: v } }, 'focus'))}
                    </>}
                {slider('Brightness', f.brightness, 0.2, 2, 0.05, (v) => change('Brightness', { filter: { ...f, brightness: v } }, 'filter'))}
                {slider('Contrast', f.contrast, 0.2, 2, 0.05, (v) => change('Contrast', { filter: { ...f, contrast: v } }, 'filter'))}
                {slider('Black and white', f.grayscale, 0, 1, 0.05, (v) => change('Black and white', { filter: { ...f, grayscale: v } }, 'filter'))}
                {slider('Colour', f.saturation ?? 1, 0, 2, 0.05, (v) => change('Colour', { filter: { ...f, saturation: v } }, 'filter'), (v) => (v === 1 ? 'normal' : v === 0 ? 'none' : `${Math.round(v * 100)}%`))}
                {slider('Cool / warm', f.warmth ?? 0, -1, 1, 0.05, (v) => change('Warmth', { filter: { ...f, warmth: v } }, 'filter'), (v) => (Math.abs(v) < 0.001 ? 'neutral' : `${v > 0 ? 'warm' : 'cool'} ${Math.abs(v).toFixed(1)}`))}
                {slider('Blur', f.blur ?? 0, 0, 20, 0.5, (v) => change('Blur', { filter: { ...f, blur: v } }, 'filter'), (v) => (v === 0 ? 'sharp' : `${v}`))}
                <div className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2" role="group" aria-label="Picture border">
                  <span className="w-20 shrink-0">Border</span>
                  <ColorButton testId="picture-border" label="Colour" value={img.border ? tokenHex(img.border.color) : null} theme={theme} onPick={(hex) => change('Picture border', { border: { color: hex, width: img.border?.width ?? 6 } }, 'border')} onNone={() => change('Picture border', { border: undefined }, 'border')} />
                  {img.border && (
                    <label className="flex items-center gap-2 flex-1">
                      <span>Width</span>
                      <input type="range" aria-label="Border width" min={1} max={40} step={1} value={img.border.width} disabled={img.locked} onChange={(e) => change('Picture border', { border: { ...img.border!, width: Number(e.target.value) } }, 'bw')} className="flex-1" />
                      <span className="w-10 text-right tabular-nums">{img.border.width}px</span>
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-600">
                  <span className="w-20 shrink-0">Shadow</span>
                  {(['none', 'soft', 'strong'] as const).map((k) => <button key={k} aria-pressed={(img.shadow ?? 'none') === k} disabled={img.locked} className={`${btn} capitalize ${(img.shadow ?? 'none') === k ? 'bg-slate-100' : ''}`} onClick={() => change('Picture shadow', { shadow: k }, 'shadow')}>{k}</button>)}
                  <button className={`${btn} ml-auto`} disabled={img.locked} onClick={() => change('Reset picture', { zoom: undefined, focus: undefined, filter: undefined, shadow: undefined }, 'reset')}>Reset</button>
                </div>
              </div>
            )
          })()}
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
      <button type="button" data-testid="arrange" className={`${btn} inline-flex items-center gap-1.5 ${arrangeOpen ? 'bg-slate-100' : ''}`} aria-expanded={arrangeOpen} title="Arrange: order and rotate" onClick={() => setArrangeOpen((v) => !v)}><Layers aria-hidden size={15} />Arrange</button>
      {canGroup && <button data-testid="group" className={btn} title="Group (Ctrl+G): move, resize, copy and delete these together" disabled={picked.some((id) => siblings.find((e) => e.id === id)?.locked)} onClick={adv(() => { let g: string | null = null; apply('Group', (d) => { g = C.groupElements(d, slideId, picked) }); if (g) select(picked) })}>Group</button>}
      {inGroup && <button data-testid="ungroup" className={btn} title="Ungroup (Ctrl+Shift+G)" onClick={adv(() => { apply('Ungroup', (d) => { C.ungroupElements(d, slideId, picked) }); select(selection) })}>Ungroup</button>}
      <button aria-label={el.locked ? 'Unlock' : 'Lock'} aria-pressed={el.locked} className={btn} onClick={() => apply(el.locked ? 'Unlock' : 'Lock', (d) => C.toggleLock(d, slideId, el.id))}>{el.locked ? <Lock aria-hidden size={16} /> : <LockOpen aria-hidden size={16} />}</button>
      <button aria-label="Duplicate" className={btn} disabled={el.locked} onClick={adv(() => { let ids: string[] = []; apply('Duplicate', (d) => { ids = C.duplicateElements(d, slideId, [el.id]) }); select(ids) })}><Copy aria-hidden size={16} /></button>
      <button aria-label="Delete" className={`${btn} text-red-600`} disabled={el.locked} onClick={adv(() => { apply('Delete', (d) => C.deleteElements(d, slideId, [el.id])); select([]); edit(null) })}><Trash2 aria-hidden size={16} /></button>
      {el.type === 'shape' && gradOpen && el.shape !== 'line' && el.shape !== 'ring' && (() => {
        // a two-colour gradient fill: it starts from the shape's own colour (nothing jumps), to the deck's accent; linear along an angle, or radial from the middle
        const g = el.gradient ?? { from: tokenHex(el.fill === 'none' ? 'primary' : el.fill) ?? theme.colors.primary, to: theme.colors.accent, angle: 135 }
        const put = (next: typeof g | undefined, key: string) => set({ gradient: next }, key)
        return (
          <div data-testid="shape-gradient-panel" className="basis-full flex flex-wrap items-center gap-2 px-2 py-2 border-t border-border mt-1 text-xs text-slate-600">
            <ColorButton testId="grad-from" label="Start" value={g.from} theme={theme} onPick={(hex) => put({ ...g, from: hex }, 'gf')} />
            <ColorButton testId="grad-to" label="End" value={g.to} theme={theme} onPick={(hex) => put({ ...g, to: hex }, 'gt')} />
            <span role="group" aria-label="Gradient style" className="inline-flex rounded-md border border-border overflow-hidden">
              {(['linear', 'radial'] as const).map((k) => <button key={k} type="button" aria-pressed={(el.gradient?.kind ?? 'linear') === k && !!el.gradient} disabled={el.locked} onClick={() => put({ ...g, ...(k === 'radial' ? { kind: k } : { kind: undefined }) }, 'gk')} className={`h-7 px-2 capitalize ${(el.gradient?.kind ?? 'linear') === k && el.gradient ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50'}`}>{k}</button>)}
            </span>
            {(g.kind ?? 'linear') === 'linear' && (
              <label className="flex items-center gap-2 flex-1 min-w-40">
                <span>Angle</span>
                <input type="range" aria-label="Gradient angle" min={0} max={360} step={15} value={g.angle} disabled={el.locked} onChange={(e) => put({ ...g, angle: Number(e.target.value) }, 'ga')} className="flex-1" />
                <span className="w-10 text-right tabular-nums">{g.angle}°</span>
              </label>
            )}
            <button type="button" className={`${btn} ml-auto`} disabled={el.locked || !el.gradient} onClick={() => put(undefined, 'gr')}>Remove gradient</button>
          </div>
        )
      })()}
      {text && effectsOpen && slide && <TextEffectsPanel slide={slide} selection={picked} theme={theme} gate={requireAdvanced} />}
      {text && spacingOpen && slide && <SpacingPanel slide={slide} selection={picked} theme={theme} aspect={aspect} gate={requireAdvanced} />}
      {arrangeOpen && slide && <ArrangePanel slide={slide} selection={picked} gate={requireAdvanced} />}
    </div>
  )
}
