import { BULLET_GLYPHS, CARD_STYLES, DECOR_STYLES, HEADER_STYLES, PHOTO_STYLES, TITLE_STYLES, themeStyleSchema, type Presentation, type ThemeStyle } from '@prompttoppt/validation'
import { useState, type ReactNode } from 'react'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'

/** words for the stored values (the stored ones are short ids) */
const nice = (v: string) => v.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
const TITLE_BG: Record<ThemeStyle['titleBackground'], string> = { primary: 'Main colour', gradient: 'Gradient', dark: 'Dark', surface: 'Light panel', accent: 'Accent colour' }
const BODY_BG: Record<ThemeStyle['bodyBackground'], string> = { solid: 'Plain', tint: 'Soft tint', gradient: 'Gradient' }
const FOOTER: Record<ThemeStyle['footer'], string> = { none: 'Nothing', number: 'Slide numbers', brand: 'Deck name and slide numbers' }
const DIAGRAM: Record<ThemeStyle['diagram'], string> = { classic: 'Classic', editorial: 'Editorial (dividers, chevron rows)' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid grid-cols-[110px_1fr] items-center gap-2 text-sm"><span className="text-slate-600">{label}</span>{children}</label>
}
function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[] | Record<T, string>; onChange: (v: T) => void }) {
  const list = Array.isArray(options) ? (options as readonly T[]).map((v) => [v, nice(v)] as const) : (Object.entries(options) as [T, string][])
  return <Row label={label}><select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-white">{list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
}

/** the footer's own words: typed freely, saved when the box is left (one undo step); a change from elsewhere (undo) starts it again (its key) */
function FooterText({ saved, placeholder, onSave }: { saved: string; placeholder: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(saved)
  return <Row label="Footer text"><input aria-label="Footer text" value={text} maxLength={80} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() !== saved && onSave(text.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="border border-border rounded-lg px-2 py-1.5 text-sm" /></Row>
}

/**
 * The deck's design settings (theme.style), which used to be set only by templates and the assistant: how titles and headings look, cards, decorations, photo frames,
 * bullets, diagrams, backgrounds and the footer. Every change is one undo step and draws the designed slides again (hand-edited slides keep their objects).
 */
export function DesignTab({ doc }: { doc: Presentation }) {
  const apply = useDoc((s) => s.apply)
  const st = themeStyleSchema.parse(doc.theme.style ?? {})
  const set = (label: string, patch: Partial<ThemeStyle>, mergeKey?: string) => apply(`Design: ${label}`, (d) => void C.setDesignStyle(d, patch), mergeKey ? { mergeKey } : undefined)
  return (
    <div className="space-y-4" aria-label="Design settings">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500">Title slides</h3>
        <Pick label="Title style" value={st.title} options={TITLE_STYLES} onChange={(v) => set('title style', { title: v })} />
        <Pick label="Title background" value={st.titleBackground} options={TITLE_BG} onChange={(v) => set('title background', { titleBackground: v })} />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500">Headings</h3>
        <Pick label="Heading style" value={st.header} options={HEADER_STYLES} onChange={(v) => set('heading style', { header: v })} />
        <Row label={`Weight ${st.headingWeight}`}><input type="range" aria-label="Heading weight" min={300} max={900} step={100} value={st.headingWeight} onChange={(e) => set('heading weight', { headingWeight: Number(e.target.value) }, 'design:weight')} /></Row>
        <Row label={`Letter spacing ${st.headingTracking}`}><input type="range" aria-label="Heading letter spacing" min={-4} max={30} step={1} value={st.headingTracking} onChange={(e) => set('heading letter spacing', { headingTracking: Number(e.target.value) }, 'design:tracking')} /></Row>
        <Row label="Capitals"><span className="flex items-center gap-2"><input type="checkbox" aria-label="Headings in capitals" checked={st.uppercaseHeadings} onChange={(e) => set('heading capitals', { uppercaseHeadings: e.target.checked })} />All capitals</span></Row>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500">Slides</h3>
        <Pick label="Background" value={st.bodyBackground} options={BODY_BG} onChange={(v) => set('background', { bodyBackground: v })} />
        <Pick label="Decoration" value={st.decor} options={DECOR_STYLES} onChange={(v) => set('decoration', { decor: v })} />
        <Pick label="Cards" value={st.card} options={CARD_STYLES} onChange={(v) => set('cards', { card: v })} />
        <Pick label="Photo frames" value={st.photo} options={PHOTO_STYLES} onChange={(v) => set('photo frames', { photo: v })} />
        <Pick label="Bullets" value={st.bullet} options={BULLET_GLYPHS} onChange={(v) => set('bullets', { bullet: v })} />
        <Pick label="Diagrams" value={st.diagram} options={DIAGRAM} onChange={(v) => set('diagrams', { diagram: v })} />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-500">Footer</h3>
        <Pick label="Show" value={st.footer} options={FOOTER} onChange={(v) => set('footer', { footer: v })} />
        {st.footer === 'brand' && (
          <FooterText key={st.footerText ?? ''} saved={st.footerText ?? ''} placeholder={doc.title} onSave={(t) => set('footer text', { footerText: t })} />
        )}
      </section>
      <p className="text-xs text-slate-500">Changes redraw the designed slides. Slides you edited by hand keep their objects. Undo with ⌘Z.</p>
    </div>
  )
}
