'use client'

import type { CSSProperties } from 'react'
import { valueOf, type FieldValue, type FormField, type FormValues } from '@/lib/pdf-editor/forms'

/**
 * The form fields of one page as real controls over the page picture (pdf.js does not draw widgets into the canvas): click to type, tick, or choose.
 * Values are the editor's own (undo / redo cover them) and are written into the file's form when it is saved. Positions are page space x zoom.
 */
export function FormLayer({ fields, values, zoom, live, onChange }: { fields: FormField[]; values: FormValues | undefined; zoom: number; live: boolean; onChange: (name: string, value: FieldValue) => void }) {
  if (!fields.length) return null
  return (
    <>
      {fields.map((f) => {
        const v = valueOf(f, values)
        const box: CSSProperties = { position: 'absolute', left: f.box.x * zoom, top: f.box.y * zoom, width: f.box.w * zoom, height: f.box.h * zoom, pointerEvents: live ? 'auto' : 'none', touchAction: 'manipulation' }
        const look: CSSProperties = { ...box, boxSizing: 'border-box', background: '#e6f4fc', border: '1px solid rgba(11,61,208,0.55)', borderRadius: 2, margin: 0, padding: `0 ${2 * zoom}px`, font: `${Math.max(7, Math.min(f.box.h * 0.66, 14)) * zoom}px Helvetica, Arial, sans-serif`, color: '#111' }
        const common = { className: 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0b3dd0]', 'data-form-field': f.name, 'data-kind': f.kind, 'aria-label': f.name, disabled: f.readOnly, onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation() }
        if (f.kind === 'text') {
          return f.multiline
            ? <textarea key={f.id} {...common} value={String(v)} maxLength={f.maxLen} onChange={(e) => onChange(f.name, e.target.value)} style={{ ...look, resize: 'none', paddingTop: 2 * zoom, lineHeight: 1.15 }} />
            : <input key={f.id} {...common} type="text" value={String(v)} maxLength={f.maxLen} onChange={(e) => onChange(f.name, e.target.value)} style={look} />
        }
        if (f.kind === 'checkbox') {
          return <input key={f.id} {...common} type="checkbox" checked={!!v} onChange={(e) => onChange(f.name, e.target.checked)} style={{ ...box, margin: 0, accentColor: '#0b3dd0', boxShadow: '0 0 0 1px rgba(11,61,208,0.55)', background: '#e6f4fc' }} />
        }
        if (f.kind === 'radio') {
          return <input key={f.id} {...common} aria-label={`${f.name}: ${f.choice}`} type="radio" name={f.name} checked={v === f.choice} onChange={() => onChange(f.name, f.choice ?? '')} style={{ ...box, margin: 0, accentColor: '#0b3dd0', boxShadow: '0 0 0 1px rgba(11,61,208,0.55)', background: '#e6f4fc' }} />
        }
        return (
          <select key={f.id} {...common} multiple={f.kind === 'list'} value={f.multiSelect ? (Array.isArray(v) ? v : []) : Array.isArray(v) ? v[0] ?? '' : String(v)}
            onChange={(e) => onChange(f.name, f.multiSelect ? [...e.target.selectedOptions].map((o) => o.value) : e.target.value)} style={look}>
            {f.kind === 'dropdown' && <option value="" />}
            {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      })}
    </>
  )
}
