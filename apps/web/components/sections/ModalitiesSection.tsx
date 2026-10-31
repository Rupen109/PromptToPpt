import { Sparkles, Zap, FileText, NotebookPen, Globe, Link2, ArrowDown } from '@prompttoppt/ui/icons'
import type { ReactNode } from 'react'
import type { LucideIcon } from '@prompttoppt/ui/icons'
import { Card, type CardTone } from '@/components/ui/Card'
import { Badge, Section, SectionHeader, Tag, Tile } from './ui'

/** What you can feed it — every modality here is something the product really reads today. */
const MODALITIES: { n: string; title: string; body: string; tone: CardTone; tile: 'yellow' | 'accent' | 'primary' | 'lime'; icon: LucideIcon; foot: [string, string, LucideIcon]; mock: ReactNode }[] = [
  {
    n: '01', title: 'Prompt to Complete Deck', tone: 'cream', tile: 'yellow', icon: Sparkles,
    body: 'Describe your topic, audience and goal. The AI plans the storyline, then writes and designs every slide for you.',
    foot: ['AI Storyline', 'Fast', Zap],
    mock: (
      <>
        <MockHead title="Prompt Pipeline" tag="12 Slides" tagClass="bg-highlight text-foreground" titleClass="text-primary" />
        <div className="mt-3 flex flex-col gap-1">
          {['01. Problem & Macro Shift', '02. Proprietary Solution'].map((t) => <Row key={t}>{t}</Row>)}
          <Row className="bg-secondary/40">03. $14B Addressable Market</Row>
        </div>
      </>
    ),
  },
  {
    n: '02', title: 'PDF & PowerPoint Ingestion', tone: 'peach', tile: 'accent', icon: FileText,
    body: 'Upload a PDF or a .pptx deck — up to 100 pages. The AI pulls out the key points and numbers and turns them into slides, with page-level references.',
    foot: ['PDF & PPTX', 'Up to 100 pgs', FileText],
    mock: (
      <>
        <MockHead title="Document Reader" tag="84 Pgs Read" tagClass="bg-[#fee2e2] text-[#b91c1c]" titleClass="text-accent" />
        <div className="mt-3 flex justify-between rounded bg-[#edf0f7] px-2 py-2 font-sans font-bold text-[11px] text-[#0f172a]"><span>Q3 Financial Model</span><span className="text-accent">24 Tables</span></div>
        <div className="mt-2 h-2 rounded-full bg-[#e2e8f0] overflow-hidden"><div className="h-full w-4/5 rounded-full bg-accent" /></div>
      </>
    ),
  },
  {
    n: '03', title: 'Notes & Text Files', tone: 'lavender', tile: 'primary', icon: NotebookPen,
    body: 'Drop in meeting notes, a brief or a Markdown file — or paste text straight in. The AI organises it into a clear, structured presentation.',
    foot: ['TXT, MD & paste', 'Instant', Zap],
    mock: (
      <>
        <MockHead title="Notes Reader" tag=".TXT · .MD" tagClass="bg-primary/10 text-primary" titleClass="text-primary" />
        <div className="mt-3 flex items-center justify-between rounded bg-[#edf0f7] px-3 py-2 font-sans font-bold text-[10px] text-[#0f172a]"><span>launch-notes.txt</span><span className="rounded border border-foreground bg-white px-2 py-0.5">6 key points</span></div>
      </>
    ),
  },
  {
    n: '04', title: 'Website Links', tone: 'cream', tile: 'lime', icon: Globe,
    body: 'Paste a link to an article, newsroom page or company site. The AI reads the page and builds slides from what it says, citing the source.',
    foot: ['Public web pages', 'Cites sources', Link2],
    mock: (
      <>
        <MockHead title="Page Reader" tag="Fetched" tagClass="bg-highlight text-foreground" titleClass="text-foreground" />
        <div className="mt-3 rounded bg-[#edf0f7] px-3 py-1.5 font-sans font-bold text-[10px] text-[#0f172a] flex items-center gap-1.5"><Link2 aria-hidden size={11} />tata.com/newsroom/launch</div>
        <div className="mt-1.5 rounded border border-foreground bg-white px-3 py-1.5 font-sans font-bold text-[10px] text-foreground">Extracted: 1,240 words</div>
      </>
    ),
  },
]

function MockHead({ title, tag, tagClass, titleClass }: { title: string; tag: string; tagClass: string; titleClass: string }) {
  return <div className="flex items-center justify-between gap-2"><span className={`font-heading font-extrabold text-[11px] leading-4 ${titleClass}`}>{title}</span><span className={`rounded px-1.5 font-heading font-extrabold text-[11px] leading-4 ${tagClass}`}>{tag}</span></div>
}
function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded bg-[#edf0f7] px-2 py-1 font-sans font-bold text-[10px] leading-[15px] text-foreground ${className}`}>{children}</div>
}

export function ModalitiesSection() {
  return (
    <Section id="modalities">
      <SectionHeader
        align="left" max="max-w-[644px]"
        badge={<Badge>Multi-modal ingestion matrix</Badge>}
        title={<>Give It Anything. Get Boardroom<br className="hidden md:block" /> Slides.</>}
        subtitle="We don't limit you to typing prompts into a basic textbox. Drop in PDFs, PowerPoint decks, notes or live website links — the AI reads them and builds your deck."
        aside={<p className="font-handwriting text-xl font-bold text-accent flex items-center gap-2 lg:pb-1"><ArrowDown aria-hidden size={18} className="animate-bounce motion-reduce:animate-none" />Supported file types &amp; live bridges</p>}
      />
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">
        {MODALITIES.map((m, i) => (
          <Card key={m.n} as="article" tone={m.tone} index={i} className="group/card p-6 flex flex-col h-full" wrapperClassName="h-full">
            <div className="flex items-start justify-between">
              <Tile tone={m.tile}><m.icon aria-hidden size={22} /></Tile>
              <Tag>Modality {m.n}</Tag>
            </div>
            <h3 className="mt-5 font-heading font-extrabold text-xl leading-7 text-foreground xl:min-h-14">{m.title}</h3>
            <p className="mt-3 text-sm leading-5 text-[#475569] xl:min-h-[7.5rem]">{m.body}</p>
            <div className="mt-5 lg:flex-1 rounded-xl border-2 border-foreground bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] lg:min-h-[8.5rem]">{m.mock}</div>
            <div className="mt-5 pt-4 border-t border-foreground flex items-center justify-between gap-3 font-heading font-extrabold text-xs leading-4">
              <span className="text-foreground">{m.foot[0]}</span>
              <span className={m.tone === 'peach' ? 'text-accent' : 'text-primary'}><span className="inline-flex items-center gap-1">{m.foot[1]} {(() => { const F = m.foot[2]; return <F aria-hidden size={13} /> })()}</span></span>
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}

export default ModalitiesSection
