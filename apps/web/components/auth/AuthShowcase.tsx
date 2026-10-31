import { Download, FileUp, LayoutTemplate, Languages, Palette, Sparkles, type LucideIcon } from '@prompttoppt/ui/icons'

const FEATURES: [LucideIcon, string, string][] = [
  [Sparkles, 'Prompt to deck', 'Describe it. AI writes, designs and lays out every slide.'],
  [LayoutTemplate, '100+ templates', 'Designer-made looks, light and dark, for every kind of talk.'],
  [FileUp, 'Start from your files', 'Turn a PDF, Word, Excel file or web link into slides.'],
  [Palette, 'Your brand, instantly', 'Paste your website: colours, fonts and logo are applied.'],
  [Languages, '100+ languages', 'Write and present in your own language.'],
  [Download, 'Export anywhere', 'Download PowerPoint or PDF, or share a live link.'],
]

/** a small, drawn deck (no screenshots to go stale): a prompt, the slide it became, and two slides behind it */
function DeckPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[420px] pb-4 pt-2">
      <div className="absolute inset-x-6 top-0 h-full -rotate-6 rounded-2xl border-4 border-foreground bg-secondary" />
      <div className="absolute inset-x-3 top-1 h-full rotate-3 rounded-2xl border-4 border-foreground bg-highlight" />
      <div className="relative rounded-2xl border-4 border-foreground bg-white shadow-[8px_8px_0px_0px_var(--color-text-primary)]">
        <div className="flex items-center gap-1.5 border-b-4 border-foreground px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /><span className="h-2.5 w-2.5 rounded-full bg-secondary" /><span className="h-2.5 w-2.5 rounded-full bg-highlight" />
          <span className="ml-3 flex-1 truncate rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">Series A pitch for an AI startup</span>
        </div>
        <div className="p-5">
          <div className="rounded-xl bg-primary p-5 text-white">
            <div className="text-[10px] font-bold uppercase tracking-widest text-highlight">Slide 3 · Traction</div>
            <div className="mt-1 font-heading text-xl font-extrabold leading-tight">Revenue tripled in 12 months</div>
            <div className="mt-4 flex h-20 items-end gap-2">
              {[28, 40, 52, 70, 100].map((h, i) => (
                <div key={i} className={`flex-1 rounded-t-md ${i === 4 ? 'bg-highlight' : 'bg-white/40'}`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {['bg-secondary', 'bg-highlight', 'bg-accent', 'bg-slate-200'].map((c, i) => (
              <div key={i} className={`h-9 flex-1 rounded-md border-2 border-foreground ${c}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** the right-hand side of the sign-up / log-in pages (hidden on phones and tablets, where the form is the whole page) */
export function AuthShowcase({ mode }: { mode: 'login' | 'signup' }) {
  return (
    <aside className="relative hidden overflow-hidden bg-primary text-white lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #fff 1.5px, transparent 1.5px)', backgroundSize: '26px 26px' }} />
      <div className="relative mx-auto w-full max-w-xl py-12">
        <span className="inline-block rounded-full border-2 border-foreground bg-highlight px-4 py-1 text-xs font-extrabold uppercase tracking-wider text-foreground">
          {mode === 'signup' ? 'Free to start · no card needed' : 'Welcome back'}
        </span>
        <h2 className="mt-5 font-heading text-4xl font-extrabold leading-[1.1] text-white xl:text-5xl">
          {mode === 'signup' ? <>Your next presentation, <span className="text-secondary">done in minutes.</span></> : <>Your decks are <span className="text-secondary">waiting for you.</span></>}
        </h2>
        <p className="mt-4 max-w-md text-base !text-white/85">
          {mode === 'signup' ? 'From a single idea to a finished, designed deck: no slide-by-slide fiddling.' : 'Pick up where you left off, or start a fresh deck from a prompt.'}
        </p>

        <div className="my-10"><DeckPreview /></div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-5">
          {FEATURES.map(([Icon, title, text]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-foreground bg-white text-primary"><Icon size={18} aria-hidden /></span>
              <span>
                <span className="block text-sm font-extrabold text-white">{title}</span>
                <span className="block text-[13px] leading-snug text-white/80">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
