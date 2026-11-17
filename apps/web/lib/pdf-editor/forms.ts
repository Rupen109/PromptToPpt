/**
 * Form filling. Fields are read with pdf.js (what the page offers to the visitor), values live in the editor's document (so undo / redo cover them) and are
 * written into the file's own form with pdf-lib at save time, with fresh appearance streams, or the form is flattened (fields become plain page content).
 * Signature fields and push buttons are left as they are.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PDFDocument, PDFFont } from 'pdf-lib'
import { fromUser } from './geometry'
import type { Box, Geom } from './model'

export type FieldKind = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list'
export type FieldValue = string | boolean | string[]
export type FormValues = Record<string, FieldValue>

export interface FormField {
  /** the field's full name in the form (several widgets of one field share it) */
  name: string
  /** unique per widget */
  id: string
  kind: FieldKind
  /** page space, points */
  box: Box
  multiline?: boolean
  maxLen?: number
  readOnly: boolean
  options?: { value: string; label: string }[]
  multiSelect?: boolean
  /** checkbox: the "on" value; radio: this widget's choice */
  choice?: string
  /** what the file holds now */
  initial: FieldValue
}

interface Annot {
  subtype?: string; fieldType?: string; fieldName?: string; fieldValue?: unknown; rect?: number[]; readOnly?: boolean; hidden?: boolean; id?: string
  multiLine?: boolean; maxLen?: number; checkBox?: boolean; radioButton?: boolean; pushButton?: boolean; buttonValue?: string; exportValue?: string
  options?: { exportValue: string; displayValue: string }[]; combo?: boolean; multiSelect?: boolean
}

/** the fillable widgets on one original page */
export async function readFields(pdf: PDFDocumentProxy, src: number, geom: Geom): Promise<FormField[]> {
  const page = await pdf.getPage(src + 1)
  try {
    const out: FormField[] = []
    for (const a of (await page.getAnnotations()) as Annot[]) {
      if (a.subtype !== 'Widget' || !a.fieldName || !a.rect || a.hidden) continue
      const [x1, y1] = fromUser(geom, a.rect[0]!, a.rect[1]!), [x2, y2] = fromUser(geom, a.rect[2]!, a.rect[3]!)
      const box: Box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }
      if (box.w < 2 || box.h < 2) continue
      const base = { name: a.fieldName, id: a.id ?? `${a.fieldName}:${out.length}`, box, readOnly: !!a.readOnly }
      const v = a.fieldValue
      if (a.fieldType === 'Tx') out.push({ ...base, kind: 'text', multiline: !!a.multiLine, maxLen: a.maxLen || undefined, initial: Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : '' })
      else if (a.fieldType === 'Btn' && a.checkBox) out.push({ ...base, kind: 'checkbox', choice: a.exportValue ?? 'Yes', initial: typeof v === 'string' && v !== 'Off' && v !== '' })
      else if (a.fieldType === 'Btn' && a.radioButton) out.push({ ...base, kind: 'radio', choice: a.buttonValue ?? a.exportValue ?? '', initial: typeof v === 'string' && v !== 'Off' ? v : '' })
      else if (a.fieldType === 'Ch') {
        const opts = (a.options ?? []).map((o) => ({ value: o.exportValue, label: o.displayValue }))
        const sel = Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []
        out.push({ ...base, kind: a.combo ? 'dropdown' : 'list', options: opts, multiSelect: !!a.multiSelect, initial: a.multiSelect ? sel : sel[0] ?? '' })
      }
    }
    return out
  } finally { page.cleanup() }
}

/** the value to show: what the visitor typed, else what the file holds */
export const valueOf = (f: FormField, values: FormValues | undefined): FieldValue => (values && f.name in values ? values[f.name]! : f.initial)
export const isFilled = (values: FormValues | undefined): boolean => !!values && Object.keys(values).length > 0

const WIN = /[^ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ\n]/g
/** what a standard font can write; other characters become "?" (a form field has no picture fallback) */
const writable = (s: string): string => s.replace(WIN, '?')

export interface FormResult { changed: number; flattened: boolean; replaced: boolean }

/**
 * Write the visitor's values into the file's form and refresh appearances. `font` draws the text (an embedded font; WinAnsi only).
 * `flatten`: turn every field into page content afterwards.
 */
export function applyForm(lib: typeof import('pdf-lib'), doc: PDFDocument, values: FormValues | undefined, flatten: boolean, font: PDFFont, aliases?: Map<string, string>): FormResult {
  const res: FormResult = { changed: 0, flattened: false, replaced: false }
  const hasForm = doc.catalog.get(lib.PDFName.of('AcroForm')) !== undefined
  const entries = Object.entries(values ?? {})
  if (!hasForm || (entries.length === 0 && !flatten)) return res
  const form = doc.getForm()
  // a field copied for a duplicated page gets the value of its original
  const withCopies: [string, FieldValue][] = []
  for (const [name, v] of entries) { withCopies.push([name, v]); if (aliases) for (const [copy, orig] of aliases) if (orig === name) withCopies.push([copy, v]) }
  for (const [name, v] of withCopies) {
    const f = form.getFieldMaybe(name)
    if (!f) continue
    if (f instanceof lib.PDFTextField) {
      let t = writable(String(v)); const max = f.getMaxLength(); if (max !== undefined && t.length > max) t = t.slice(0, max)
      if (t !== String(v)) res.replaced = true
      f.setText(t || undefined)
    } else if (f instanceof lib.PDFCheckBox) { if (v) f.check(); else f.uncheck() }
    else if (f instanceof lib.PDFRadioGroup) { if (typeof v === 'string' && v && f.getOptions().includes(v)) f.select(v); else f.clear() }
    else if (f instanceof lib.PDFDropdown) { const sel = Array.isArray(v) ? v : v ? [String(v)] : []; const known = f.getOptions(); const keep = sel.filter((x) => known.includes(x)); if (keep.length) f.select(keep); else if (f.isEditable() && sel[0]) f.select(writable(sel[0])); else f.clear() }
    else if (f instanceof lib.PDFOptionList) { const sel = Array.isArray(v) ? v : v ? [String(v)] : []; const keep = sel.filter((x) => f.getOptions().includes(x)); if (keep.length) f.select(keep); else f.clear() }
    else continue
    res.changed++
  }
  form.updateFieldAppearances(font)
  if (flatten) { form.flatten({ updateFieldAppearances: false }); res.flattened = true }
  return res
}
